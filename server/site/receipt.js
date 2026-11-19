// The official gift receipt: Chabad of Lamorinda's own letter (letterhead, the gift, the tax statement, the signature),
// sent by the website after every gift made on the site. It replaces Stripe's plain receipt (turn that off in Stripe:
// Settings, Customer emails). English, Hebrew (right to left) and Russian.
'use strict';

const NAVY = '#14284b', GOLD = '#c99a2e', GOLD_INK = '#85600f', INK = '#1f2433', MUTED = '#5f6470', LINE = '#e8dfcc', BG = '#f6f1e7';
const SERIF = "Georgia, 'Times New Roman', serif", SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOC = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };

const WORDS = {
  en: { title: 'Official gift receipt', dear: (n) => (n ? `Dear ${n},` : 'Dear friend,'), thanks: (m) => `Thank you for your ${m ? 'monthly ' : ''}gift to Chabad of Lamorinda. Your generosity strengthens Jewish life for families in Lafayette, Moraga and Orinda.`,
    receiptNo: 'Receipt number', date: 'Date of gift', amount: 'Amount of gift', fund: 'Designated for', dedication: 'In honor or in memory of', how: 'Payment', online: 'Online (secure payment through Stripe)', from: 'Received from', note: 'Your note',
    tax: 'No goods or services were provided in exchange for this gift, other than intangible religious benefits. Chabad of Lamorinda is a tax-exempt organization described in Section 501(c)(3) of the Internal Revenue Code. Please keep this receipt for your tax records.',
    taxId: 'Tax ID (EIN)', close: 'With blessings and gratitude,', sign: 'Rabbi Israel and Tzipora Labkowski', questions: 'Questions about your gift? Call', monthlyNote: 'A monthly gift: you will receive a receipt for each payment.' },
  he: { title: 'קבלה רשמית על תרומה', dear: (n) => (n ? `${n} היקר/ה,` : 'ידיד/ה יקר/ה,'), thanks: (m) => `תודה רבה על תרומתך ${m ? 'החודשית ' : ''}לחב"ד למורינדה. נדיבותך מחזקת את החיים היהודיים של משפחות בלפייט, מוראגה ואורינדה.`,
    receiptNo: 'מספר קבלה', date: 'תאריך התרומה', amount: 'סכום התרומה', fund: 'מיועדת ל', dedication: 'לכבוד או לזכר', how: 'תשלום', online: 'מקוון (תשלום מאובטח דרך Stripe)', from: 'התקבל מאת', note: 'ההערה שלך',
    tax: 'לא סופקו סחורות או שירותים תמורת תרומה זו, מלבד הטבות רוחניות בלתי מוחשיות. חב"ד למורינדה היא ארגון פטור ממס לפי סעיף 501(c)(3) של חוק המס הפדרלי בארצות הברית. נא לשמור קבלה זו לרישומי המס שלך.',
    taxId: 'מספר מזהה לצורכי מס (EIN)', close: 'בברכה ובהכרת תודה,', sign: 'הרב ישראל וציפורה לבקובסקי', questions: 'שאלות על תרומתך? התקשרו', monthlyNote: 'תרומה חודשית: תקבלו קבלה על כל תשלום.' },
  ru: { title: 'Официальная квитанция о пожертвовании', dear: (n) => (n ? `Уважаемый(ая) ${n}!` : 'Дорогой друг!'), thanks: (m) => `Спасибо за ваше ${m ? 'ежемесячное ' : ''}пожертвование Хабаду Ламоринды. Ваша щедрость укрепляет еврейскую жизнь семей в Лафайете, Мораге и Оринде.`,
    receiptNo: 'Номер квитанции', date: 'Дата пожертвования', amount: 'Сумма пожертвования', fund: 'Назначение', dedication: 'В честь или в память', how: 'Оплата', online: 'Онлайн (безопасная оплата через Stripe)', from: 'Получено от', note: 'Ваша записка',
    tax: 'Товары и услуги в обмен на это пожертвование не предоставлялись, кроме нематериальных религиозных благ. Хабад Ламоринды — организация, освобождённая от налогов согласно разделу 501(c)(3) Налогового кодекса США. Пожалуйста, сохраните эту квитанцию для налоговой отчётности.',
    taxId: 'Налоговый номер (EIN)', close: 'С благословением и благодарностью,', sign: 'рав Исраэль и Ципора Лабковски', questions: 'Вопросы о вашем пожертвовании? Звоните', monthlyNote: 'Ежемесячное пожертвование: квитанция придёт за каждый платёж.' },
};

// gift: { cents, fund, dedication, monthly, date (Date), number, note }; donor: { name, address }; org: the organization (org.json)
function receipt({ lang = 'en', base = '', org = {}, gift, donor = {} }) {
  const L = WORDS[lang] ? lang : 'en', W = WORDS[L], dir = L === 'he' ? 'rtl' : 'ltr', al = L === 'he' ? 'right' : 'left';
  const money = '$' + (gift.cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (gift.date || new Date()).toLocaleDateString(LOC[L], { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const ein = (String(org.legal || '').match(/\d{2}-\d{7}/) || [''])[0];
  const addr = org.address ? [org.address.street, org.address.city + ', ' + org.address.region + ' ' + org.address.postal].filter(Boolean).join(', ') : '';
  const rows = [[W.receiptNo, gift.number], [W.date, day], [W.amount, money + (gift.monthly ? ' ' + (L === 'he' ? '(חודשית)' : L === 'ru' ? '(ежемесячно)' : '(monthly)') : '')], [W.fund, gift.fund], [W.dedication, gift.dedication], [W.how, W.online],
    [W.from, [donor.name, donor.address].filter(Boolean).join(', ')], [W.note, gift.note]].filter((r) => r[1]);
  const phone = org.phone || '925-384-7242';
  const html = `<!doctype html><html lang="${L}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(W.title)}</title></head>
<body style="margin:0;background:${BG};padding:18px 10px;font:16px/1.55 ${SANS};color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid ${LINE};border-radius:6px">
<tr><td style="padding:26px 30px 14px;text-align:center;border-bottom:3px solid ${GOLD}">
<img src="${esc(base)}/assets/logo-email.png" width="64" alt="" style="display:inline-block;border:0">
<div style="font:600 26px ${SERIF};color:${NAVY};margin-top:6px">${esc(org.name || 'Chabad of Lamorinda')}</div>
<div style="font-size:13px;color:${MUTED};margin-top:4px">${esc(addr)}${addr ? ' · ' : ''}${esc(phone)}${ein ? '<br>' + esc(W.taxId) + ': ' + esc(ein) : ''}</div></td></tr>
<tr><td style="padding:24px 30px 6px;text-align:${al}"><div style="font:600 13px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${GOLD_INK}">${esc(W.title)}</div>
<p style="margin:14px 0 8px">${esc(W.dear(donor.name))}</p><p style="margin:0 0 16px">${esc(W.thanks(gift.monthly))}</p></td></tr>
<tr><td style="padding:0 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${LINE}">
${rows.map(([k, v], i) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;text-align:${al}" valign="top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${LINE};text-align:${L === 'he' ? 'left' : 'right'};${i === 2 ? 'font-weight:700;font-size:18px;color:' + NAVY : ''}" valign="top">${esc(v)}</td></tr>`).join('')}
</table></td></tr>
<tr><td style="padding:16px 30px 6px;text-align:${al};font-size:13px;color:${MUTED}">${esc(W.tax)}${gift.monthly ? '<br><br>' + esc(W.monthlyNote) : ''}</td></tr>
<tr><td style="padding:14px 30px 26px;text-align:${al}"><p style="margin:10px 0 2px">${esc(W.close)}</p><p style="margin:0;font:italic 600 19px ${SERIF};color:${NAVY}">${esc(W.sign)}</p>
<p style="margin:14px 0 0;font-size:13px;color:${MUTED}">${esc(W.questions)} <span dir="ltr">${esc(phone)}</span></p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [org.name || 'Chabad of Lamorinda', addr, ein ? `${W.taxId}: ${ein}` : '', '', W.title.toUpperCase(), '', W.dear(donor.name), '', W.thanks(gift.monthly), '', ...rows.map(([k, v]) => `${k}: ${v}`), '', W.tax, '', W.close, W.sign, '', `${W.questions} ${phone}`].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  return { subject: `${W.title}: ${org.name || 'Chabad of Lamorinda'} (${money})`, html, text };
}
module.exports = { receipt };
