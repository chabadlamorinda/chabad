// The official gift receipt: Chabad of Lamorinda's own letter (letterhead, the gift, the tax statement, the signature),
// sent by the website after every gift made on the site. It replaces Stripe's plain receipt (turn that off in Stripe:
// Settings, Customer emails). English, Hebrew (right to left) and Russian.
'use strict';

const NAVY = '#14284b', GOLD = '#c99a2e', GOLD_INK = '#85600f', INK = '#1f2433', MUTED = '#5f6470', LINE = '#e8dfcc', BG = '#f6f1e7';
const SERIF = "Georgia, 'Times New Roman', serif", SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOC = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };

const WORDS = {
  en: { title: 'Official gift receipt', dear: (n) => (n ? `Dear ${n},` : 'Dear friend,'),
    letter: (m, money) => [`Thank you for your ${m ? 'monthly ' : ''}gift of ${money}.`, `Thank you for partnering with us, for being part of everything we do, and for helping Chabad of Lamorinda grow. Because of you, more families in our community are experiencing the joy of Shabbat, the warmth of Jewish life and the beauty of our traditions.`, `We are truly grateful for your friendship and your generosity. It means the world to us, and we feel blessed to have you with us.`],
    dedicated: (d) => `This gift is dedicated: ${d}. We are honored to be part of it.`, noted: (n) => `Your words touched us: “${n}”.`,
    receiptNo: 'Receipt number', date: 'Date of gift', amount: 'Amount of gift', fund: 'Designated for', dedication: 'In honor or in memory of', how: 'Payment', online: 'Online (secure payment through Stripe)', from: 'Received from', note: 'Your note',
    tax: 'No goods or services were provided in exchange for this gift, other than intangible religious benefits. Chabad of Lamorinda is a tax-exempt organization described in Section 501(c)(3) of the Internal Revenue Code. Please keep this receipt for your tax records.',
    taxId: 'Tax ID (EIN)', close: 'With blessings and gratitude,', sign: 'Rabbi Israel and Tzipora Labkowski', questions: 'Questions about your gift? Call', monthlyNote: 'A monthly gift: you will receive a receipt for each payment.' },
  he: { title: 'קבלה רשמית על תרומה', dear: (n) => (n ? `${n} היקר/ה,` : 'ידיד/ה יקר/ה,'),
    letter: (m, money) => [`תודה על תרומתכם ${m ? 'החודשית ' : ''}בסך ${money}.`, `תודה שאתם שותפים שלנו, שאתם חלק מכל מה שאנחנו עושים, ושאתם עוזרים לחב"ד למורינדה לצמוח. בזכותכם עוד משפחות בקהילה שלנו חוות את שמחת השבת, את חמימות החיים היהודיים ואת יופיין של המסורות שלנו.`, `אנחנו אסירי תודה באמת על ידידותכם ועל נדיבותכם. זה חשוב לנו מאוד, ואנחנו מרגישים ברוכים שאתם איתנו.`],
    dedicated: (d) => `התרומה מוקדשת: ${d}. זכינו להיות שותפים לכך.`, noted: (n) => `דבריכם נגעו ללבנו: “${n}”.`,
    receiptNo: 'מספר קבלה', date: 'תאריך התרומה', amount: 'סכום התרומה', fund: 'מיועדת ל', dedication: 'לכבוד או לזכר', how: 'תשלום', online: 'מקוון (תשלום מאובטח דרך Stripe)', from: 'התקבל מאת', note: 'ההערה שלך',
    tax: 'לא סופקו סחורות או שירותים תמורת תרומה זו, מלבד הטבות רוחניות בלתי מוחשיות. חב"ד למורינדה היא ארגון פטור ממס לפי סעיף 501(c)(3) של חוק המס הפדרלי בארצות הברית. נא לשמור קבלה זו לרישומי המס שלך.',
    taxId: 'מספר מזהה לצורכי מס (EIN)', close: 'בברכה ובהכרת תודה,', sign: 'הרב ישראל וציפורה לבקובסקי', questions: 'שאלות על תרומתך? התקשרו', monthlyNote: 'תרומה חודשית: תקבלו קבלה על כל תשלום.' },
  ru: { title: 'Официальная квитанция о пожертвовании', dear: (n) => (n ? `Уважаемый(ая) ${n}!` : 'Дорогой друг!'),
    letter: (m, money) => [`Спасибо за ваш ${m ? 'ежемесячный ' : ''}дар в размере ${money}.`, `Спасибо, что вы наш партнёр, что вы часть всего, что мы делаем, и что помогаете Хабаду Ламоринды расти. Благодаря вам всё больше семей в нашей общине переживают радость субботы, тепло еврейской жизни и красоту наших традиций.`, `Мы искренне благодарны за вашу дружбу и щедрость. Это очень много для нас значит, и мы чувствуем себя благословенными, что вы с нами.`],
    dedicated: (d) => `Дар посвящён: ${d}. Для нас честь быть частью этого.`, noted: (n) => `Ваши слова нас тронули: «${n}».`,
    receiptNo: 'Номер квитанции', date: 'Дата пожертвования', amount: 'Сумма пожертвования', fund: 'Назначение', dedication: 'В честь или в память', how: 'Оплата', online: 'Онлайн (безопасная оплата через Stripe)', from: 'Получено от', note: 'Ваша записка',
    tax: 'Товары и услуги в обмен на это пожертвование не предоставлялись, кроме нематериальных религиозных благ. Хабад Ламоринды — организация, освобождённая от налогов согласно разделу 501(c)(3) Налогового кодекса США. Пожалуйста, сохраните эту квитанцию для налоговой отчётности.',
    taxId: 'Налоговый номер (EIN)', close: 'С благословением и благодарностью,', sign: 'рав Исраэль и Ципора Лабковски', questions: 'Вопросы о вашем пожертвовании? Звоните', monthlyNote: 'Ежемесячное пожертвование: квитанция придёт за каждый платёж.' },
};

// A warm line about the kind of gift (by the fund's id), so the thank-you is about what the giver chose. No facts beyond what each fund is for.
const FUND_THANKS = {
  en: {
    general: 'In our General Fund, your gift helps everything we do to flourish: Shabbat and holiday services, and classes for all ages.',
    chai: 'As a Chai Club partner, you give the steady support that lets us plan ahead and say yes to every family.',
    preschool: 'Your gift to Jewish Preschool Scholarships helps a young child begin life with Jewish learning, songs and friends, whatever the family’s budget.',
    market: 'Your support of the Bay Kosher Market is a blessing.',
    building: 'You are helping build a permanent home for Jewish life in our community.',
    holidays: 'Your support of our Holiday Programs brings celebrations, meals and joy to families all year.',
    chesed: 'Through the Chesed Fund, your gift brings visits, care and comfort to those in need: seniors, the sick, and families who could use a helping hand.',
    synagogue: 'Your support of our synagogue fills our Shabbat and holiday services with more life.',
    endyear: 'Your year-end gift carries our work into the new year with new strength.',
    children: 'Your support of Children Events brings programs where our children learn, celebrate and make Jewish friends.',
    pledge: 'Your gift is deeply appreciated.',
  },
  he: {
    general: 'בקרן הכללית שלנו, תרומתכם עוזרת לכל מה שאנחנו עושים לפרוח: תפילות בשבת ובחגים, ושיעורים לכל הגילאים.',
    chai: 'כשותפים במועדון חי, אתם נותנים את התמיכה היציבה שמאפשרת לנו לתכנן קדימה ולומר כן לכל משפחה.',
    preschool: 'תרומתכם למלגות לגן היהודי עוזרת לילד קטן להתחיל את חייו עם לימוד יהודי, שירים וחברים, בלי קשר לתקציב המשפחה.',
    market: 'תמיכתכם ב-Bay Kosher Market היא ברכה.',
    building: 'אתם עוזרים לבנות בית קבוע לחיים היהודיים בקהילה שלנו.',
    holidays: 'תמיכתכם בתוכניות החגים מביאה חגיגות, סעודות ושמחה למשפחות לאורך כל השנה.',
    chesed: 'תרומתכם מביאה ביקורים, טיפול ונחמה לנזקקים: קשישים, חולים ומשפחות שזקוקות ליד מושטת.',
    synagogue: 'תמיכתכם בבית הכנסת שלנו ממלאת את תפילות השבת והחגים בעוד חיים.',
    endyear: 'תרומתכם בסוף השנה נושאת את עבודתנו אל השנה החדשה בכוח חדש.',
    children: 'תמיכתכם באירועי הילדים מביאה תוכניות שבהן ילדינו לומדים, חוגגים ומכירים חברים יהודים.',
    pledge: 'תרומתכם מוערכת מאוד.',
  },
  ru: {
    general: 'В нашем Общем фонде ваш дар помогает процветать всему, что мы делаем: субботним и праздничным молитвам и урокам для всех возрастов.',
    chai: 'Как партнёр клуба Хай, вы даёте стабильную поддержку, которая позволяет нам планировать вперёд и говорить «да» каждой семье.',
    preschool: 'Ваш дар стипендиям для еврейского детского сада помогает малышу начать жизнь с еврейскими знаниями, песнями и друзьями, независимо от бюджета семьи.',
    market: 'Ваша поддержка Bay Kosher Market — это благословение.',
    building: 'Вы помогаете построить постоянный дом для еврейской жизни нашей общины.',
    holidays: 'Ваша поддержка праздничных программ приносит семьям торжества, трапезы и радость в течение всего года.',
    chesed: 'Ваш дар приносит визиты, заботу и утешение нуждающимся: пожилым, больным и семьям, которым нужна дружеская рука помощи.',
    synagogue: 'Ваша поддержка нашей синагоги наполняет субботние и праздничные молитвы новой жизнью.',
    endyear: 'Ваш дар в конце года несёт нашу работу в новый год с новыми силами.',
    children: 'Ваша поддержка детских событий приносит программы, где наши дети учатся, празднуют и находят еврейских друзей.',
    pledge: 'Мы очень ценим ваш дар.',
  },
};

// gift: { cents, fund, fundId, dedication, monthly, date (Date), number, note }; donor: { name, address }; org: the organization (org.json)
function receipt({ lang = 'en', base = '', org = {}, gift, donor = {} }) {
  const L = WORDS[lang] ? lang : 'en', W = WORDS[L], dir = L === 'he' ? 'rtl' : 'ltr', al = L === 'he' ? 'right' : 'left';
  const money = '$' + (gift.cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyShort = gift.cents % 100 === 0 ? '$' + (gift.cents / 100).toLocaleString('en-US') : money; // "$360" in the letter, "$360.00" in the receipt
  const day = (gift.date || new Date()).toLocaleDateString(LOC[L], { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const ein = (String(org.legal || '').match(/\d{2}-\d{7}/) || [''])[0];
  const addr = org.address ? [org.address.street, org.address.city + ', ' + org.address.region + ' ' + org.address.postal].filter(Boolean).join(', ') : '';
  const rows = [[W.receiptNo, gift.number], [W.date, day], [W.amount, money + (gift.monthly ? ' ' + (L === 'he' ? '(חודשית)' : L === 'ru' ? '(ежемесячно)' : '(monthly)') : '')], [W.fund, gift.fund], [W.dedication, gift.dedication], [W.how, W.online],
    [W.from, [donor.name, donor.address].filter(Boolean).join(', ')], [W.note, gift.note]].filter((r) => r[1]);
  const phone = org.phone || '925-384-7242';
  // What the thank-you is about: the kind of gift, its dedication, and what the giver wrote.
  const specific = [['general', 'pledge', ''].includes(gift.fundId || '') ? '' : (FUND_THANKS[L] || FUND_THANKS.en)[gift.fundId], gift.dedication ? W.dedicated(gift.dedication) : '', gift.note ? W.noted(gift.note) : ''].filter(Boolean);
  const html = `<!doctype html><html lang="${L}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(W.title)}</title></head>
<body style="margin:0;background:${BG};padding:18px 10px;font:16px/1.55 ${SANS};color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid ${LINE};border-radius:6px">
<tr><td style="padding:26px 30px 14px;text-align:center;border-bottom:3px solid ${GOLD}">
<img src="${esc(base)}/assets/logo-email.png" width="64" alt="" style="display:inline-block;border:0">
<div style="font:600 26px ${SERIF};color:${NAVY};margin-top:6px">${esc(org.name || 'Chabad of Lamorinda')}</div>
<div style="font-size:13px;color:${MUTED};margin-top:4px">${esc(addr)}${addr ? ' · ' : ''}${esc(phone)}${ein ? '<br>' + esc(W.taxId) + ': ' + esc(ein) : ''}</div></td></tr>
<tr><td style="padding:26px 30px 8px;text-align:${al};font:18px/1.6 ${SERIF};color:${INK}">
<p style="margin:0 0 14px">${esc(W.dear(donor.name))}</p>
${W.letter(gift.monthly, moneyShort).concat(specific).map((x) => `<p style="margin:0 0 14px">${esc(x)}</p>`).join('')}
<p style="margin:20px 0 2px">${esc(W.close)}</p><p style="margin:0 0 20px;font:italic 700 22px ${SERIF};color:${GOLD}">${esc(W.sign)}</p>
<div style="border-top:1px solid ${LINE};padding-top:16px;font:600 13px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${GOLD_INK}">${esc(W.title)}</div></td></tr>
<tr><td style="padding:0 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${LINE}">
${rows.map(([k, v], i) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;text-align:${al}" valign="top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${LINE};text-align:${L === 'he' ? 'left' : 'right'};${i === 2 ? 'font-weight:700;font-size:18px;color:' + NAVY : ''}" valign="top">${esc(v)}</td></tr>`).join('')}
</table></td></tr>
<tr><td style="padding:16px 30px 6px;text-align:${al};font-size:13px;color:${MUTED}">${esc(W.tax)}${gift.monthly ? '<br><br>' + esc(W.monthlyNote) : ''}</td></tr>
<tr><td style="padding:10px 30px 26px;text-align:${al}">
<p style="margin:4px 0 0;font-size:13px;color:${MUTED}">${esc(W.questions)} <span dir="ltr">${esc(phone)}</span></p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [org.name || 'Chabad of Lamorinda', addr, ein ? `${W.taxId}: ${ein}` : '', '', W.dear(donor.name), '', ...W.letter(gift.monthly, moneyShort).concat(specific).flatMap((x) => [x, '']), W.close, W.sign, '', W.title.toUpperCase(), '', ...rows.map(([k, v]) => `${k}: ${v}`), '', W.tax, '', `${W.questions} ${phone}`].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  return { subject: `${W.title}: ${org.name || 'Chabad of Lamorinda'} (${money})`, html, text };
}
module.exports = { receipt };
