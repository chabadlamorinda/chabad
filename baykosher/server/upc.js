// UPC lookup: name, brand, size, description, ingredients, nutrition and a stock photo.
// Open Food Facts (free, food) first, then UPCitemdb (free trial tier, general merchandise).
'use strict';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const n = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function fromOpenFoodFacts(code, j) {
  const p = j && j.product;
  if (!j || j.status === 0 || !p) return null;
  const nut = p.nutriments || {};
  const nutrition = {};
  const map = { calories: 'energy-kcal_serving', fat_g: 'fat_serving', sat_fat_g: 'saturated-fat_serving', sodium_mg: 'sodium_serving', carbs_g: 'carbohydrates_serving', sugars_g: 'sugars_serving', fiber_g: 'fiber_serving', protein_g: 'proteins_serving' };
  for (const [k, src] of Object.entries(map)) {
    let v = n(nut[src]); if (v == null) continue;
    if (k === 'sodium_mg') v = Math.round(v * 1000);
    nutrition[k] = Math.round(v * 10) / 10;
  }
  if (p.serving_size) nutrition.serving = clean(p.serving_size);
  const name = clean(p.product_name_en || p.product_name);
  if (!name) return null;
  return {
    source: 'openfoodfacts', upc: code, name, brand: clean((p.brands || '').split(',')[0]), size: clean(p.quantity),
    description: clean(p.generic_name_en || p.generic_name), ingredients: clean(p.ingredients_text_en || p.ingredients_text),
    nutrition, image_url: p.image_front_url || p.image_url || '', allergens: clean(p.allergens_from_ingredients || ''),
  };
}

function fromUpcItemDb(code, j) {
  const it = j && j.items && j.items[0];
  if (!it) return null;
  return { source: 'upcitemdb', upc: code, name: clean(it.title), brand: clean(it.brand), size: clean(it.size || it.weight || it.dimension), description: clean(it.description), ingredients: '', nutrition: {}, image_url: (it.images && it.images[0]) || '' };
}

function createUpcLookup(fetchImpl = globalThis.fetch) {
  const get = async (url) => { const r = await fetchImpl(url, { headers: { 'User-Agent': 'BayKosher/1.0 (baykosher.com)' } }); if (!r.ok) return null; return r.json(); };
  return {
    async lookup(raw) {
      const code = String(raw || '').replace(/\D/g, '');
      if (code.length < 8) return null;
      for (const [url, parse] of [
        [`https://world.openfoodfacts.org/api/v2/product/${code}.json`, fromOpenFoodFacts],
        [`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, fromUpcItemDb],
      ]) {
        try { const r = parse(code, await get(url)); if (r) return r; } catch { /* try the next source */ }
      }
      return null;
    },
  };
}

module.exports = { createUpcLookup, fromOpenFoodFacts, fromUpcItemDb };
