// Reads a supplier invoice (PDF, photo, spreadsheet text or email body) with Claude and returns structured lines.
// Uses the official Anthropic SDK with a JSON schema so the answer always has the same shape.
'use strict';
const { z } = require('zod');

const InvoiceSchema = z.object({
  is_invoice: z.boolean().describe('false if this is not a supplier invoice, packing slip, statement or freight bill'),
  kind: z.enum(['goods', 'freight_only']).describe('freight_only for a bill that only charges for a truck, pallet, delivery or fuel'),
  supplier_name: z.string(), supplier_email: z.string(), invoice_number: z.string(), invoice_date: z.string().describe('YYYY-MM-DD, or empty'),
  freight_total: z.number().describe('all delivery, freight, pallet, truck, fuel and handling charges in dollars, 0 if none'),
  subtotal: z.number(), total: z.number(),
  lines: z.array(z.object({
    upc: z.string().describe('barcode digits only, empty if not shown'), supplier_sku: z.string().describe("the supplier's own item number, empty if not shown"),
    description: z.string(), qty: z.number().describe('quantity ordered/shipped in the unit shown'), unit: z.enum(['case', 'each', 'lb', 'other']),
    pack: z.number().describe('units per case when sold by the case, otherwise 1'), unit_cost: z.number().describe('price per ordered unit (per case if unit is case), in dollars'), line_total: z.number(),
  })),
  notes: z.string(),
});

const SYSTEM = `You read invoices for a kosher grocery store and extract them exactly as printed.
- Never invent a barcode, item number, quantity or price. Use an empty string when a field is not shown.
- Prices are in US dollars. unit_cost is the price of one ORDERED unit: per case when the line is by the case, per item when by the item, per pound when by weight.
- If a line is sold by the case and the case size is printed (for example "12/24 oz" or "case of 6"), put the number of units per case in pack. Otherwise pack is 1.
- Put every delivery, freight, pallet, truck, fuel, handling or shipping charge into freight_total, not into lines. Taxes and deposits are not freight.
- Skip lines with zero quantity and non-product lines (subtotals, payments, messages).
- If the document is not an invoice, packing slip, statement or freight bill, set is_invoice to false and return no lines.`;

const toCents = (d) => Math.round(Number(d || 0) * 100);

// Turn the model's answer into the shape the rest of the app uses (cents, cleaned codes).
function normalizeDraft(p) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.invoice_date) ? p.invoice_date : '';
  return {
    is_invoice: !!p.is_invoice, kind: p.kind === 'freight_only' ? 'freight' : 'goods', supplier_name: String(p.supplier_name || '').trim(), supplier_email: String(p.supplier_email || '').trim().toLowerCase(),
    invoice_no: String(p.invoice_number || '').trim(), invoice_date: date, freight_cents: toCents(p.freight_total), subtotal_cents: toCents(p.subtotal), total_cents: toCents(p.total), notes: String(p.notes || ''),
    lines: (p.lines || []).filter((l) => l.qty > 0).map((l) => ({ upc: String(l.upc || '').replace(/\D/g, ''), supplier_sku: String(l.supplier_sku || '').trim(), description: String(l.description || '').trim(), qty: Number(l.qty), unit: l.unit, pack: l.unit === 'case' && l.pack > 1 ? Number(l.pack) : 1, unit_cost_cents: toCents(l.unit_cost), line_total_cents: toCents(l.line_total) })),
  };
}

function createClaudeExtractor({ client, apiKey, model = process.env.INVOICE_MODEL || 'claude-opus-5-5' } = {}) {
  let sdk = client;
  const getClient = () => { if (!sdk) { const Anthropic = require('@anthropic-ai/sdk'); sdk = new Anthropic({ apiKey }); } return sdk; };
  return {
    kind: 'claude', model,
    // input: { buffer, mediaType, text, filename, sender, subject }
    async extract({ buffer, mediaType = '', text = '', filename = '', sender = '', subject = '' }) {
      const content = [];
      if (buffer && mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } });
      else if (buffer && /^image\/(png|jpeg|gif|webp)$/.test(mediaType)) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } });
      else if (buffer && !text) text = buffer.toString('utf8').slice(0, 200000);
      content.push({ type: 'text', text: `Extract this document.${filename ? `\nFile name: ${filename}` : ''}${sender ? `\nEmail sender: ${sender}` : ''}${subject ? `\nEmail subject: ${subject}` : ''}${text ? `\n\nDocument text:\n${text.slice(0, 200000)}` : ''}` });
      const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
      const res = await getClient().messages.parse({ model, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content }], output_config: { format: zodOutputFormat(InvoiceSchema) } });
      if (res.stop_reason === 'refusal') throw new Error('The invoice reader declined this document');
      if (res.stop_reason === 'max_tokens') throw new Error('Invoice is too long to read in one pass');
      if (!res.parsed_output) throw new Error('Could not read this invoice');
      return normalizeDraft(res.parsed_output);
    },
  };
}

// CSV / pasted spreadsheet rows need no AI: the existing parser handles them.
function csvExtractor(parseInvoiceCsv) {
  return (text) => ({ is_invoice: true, kind: 'goods', supplier_name: '', supplier_email: '', invoice_no: '', invoice_date: '', freight_cents: 0, subtotal_cents: 0, total_cents: 0, notes: '',
    lines: parseInvoiceCsv(text).map((l) => ({ upc: l.upc, supplier_sku: '', description: l.description, qty: l.qty, unit: l.pack > 1 ? 'case' : 'each', pack: l.pack, unit_cost_cents: l.unit_cost_cents, line_total_cents: Math.round(l.qty * l.unit_cost_cents) })) });
}

module.exports = { createClaudeExtractor, normalizeDraft, csvExtractor, InvoiceSchema, SYSTEM };
