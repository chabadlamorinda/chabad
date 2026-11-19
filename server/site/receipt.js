// The official gift receipt: Chabad of Lamorinda's own letter (letterhead, the gift, the tax statement, the signature),
// sent by the website after every gift made on the site. It replaces Stripe's plain receipt (turn that off in Stripe:
// Settings, Customer emails). English, Hebrew (right to left) and Russian.
'use strict';

const NAVY = '#14284b', GOLD = '#c99a2e', GOLD_INK = '#85600f', INK = '#1f2433', MUTED = '#5f6470', LINE = '#e8dfcc', BG = '#f6f1e7';
const SERIF = "Georgia, 'Times New Roman', serif", SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOC = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };

const WORDS = {
  en: { title: 'Official gift receipt', dear: (n) => (n ? `Dear ${n},` : 'Dear friend,'), headline: (m) => (m ? 'Thank you for being our partner, month after month' : 'Thank you for partnering with us'),
    thanks: (m) => `Thank you so much for your ${m ? 'monthly ' : ''}gift to Chabad of Lamorinda. We are truly grateful, and we want you to know how much it means to us. You are not simply making a donation: you are our partner in everything we do, and because of you, Jewish life in our community grows stronger. Your generosity strengthens Jewish families in the area, bringing more Shabbat joy, more Jewish learning for our children, and a warm welcome for every Jew. Thank you for making this happen.`,
    dedicated: (d) => `Your gift is dedicated: ${d}. We are honored to be part of it.`, noted: (n) => `Thank you for telling us why you gave: “${n}”. It touched us.`,
    receiptNo: 'Receipt number', date: 'Date of gift', amount: 'Amount of gift', fund: 'Designated for', dedication: 'In honor or in memory of', how: 'Payment', online: 'Online (secure payment through Stripe)', from: 'Received from', note: 'Your note',
    tax: 'No goods or services were provided in exchange for this gift, other than intangible religious benefits. Chabad of Lamorinda is a tax-exempt organization described in Section 501(c)(3) of the Internal Revenue Code. Please keep this receipt for your tax records.',
    taxId: 'Tax ID (EIN)', close: 'With blessings and gratitude,', sign: 'Rabbi Israel and Tzipora Labkowski', questions: 'Questions about your gift? Call', monthlyNote: 'A monthly gift: you will receive a receipt for each payment.' },
  he: { title: 'קבלה רשמית על תרומה', dear: (n) => (n ? `${n} היקר/ה,` : 'ידיד/ה יקר/ה,'), headline: (m) => (m ? 'תודה שאתם שותפים שלנו, חודש אחרי חודש' : 'תודה על השותפות שלכם'),
    thanks: (m) => `תודה רבה על תרומתכם ${m ? 'החודשית ' : ''}לחב"ד למורינדה. אנחנו אסירי תודה באמת, ורוצים שתדעו כמה זה חשוב לנו. אתם לא רק תורמים: אתם שותפים בכל מה שאנחנו עושים, ובזכותכם החיים היהודיים בקהילה שלנו מתחזקים. נדיבותכם מחזקת את המשפחות היהודיות באזור, ומביאה עוד שמחת שבת, עוד לימוד יהודי לילדים שלנו וקבלת פנים חמה לכל יהודי. תודה שאתם מאפשרים את כל זה.`,
    dedicated: (d) => `התרומה מוקדשת: ${d}. זכינו להיות שותפים לכך.`, noted: (n) => `תודה ששיתפת אותנו מדוע נתת: “${n}”. זה נגע ללבנו.`,
    receiptNo: 'מספר קבלה', date: 'תאריך התרומה', amount: 'סכום התרומה', fund: 'מיועדת ל', dedication: 'לכבוד או לזכר', how: 'תשלום', online: 'מקוון (תשלום מאובטח דרך Stripe)', from: 'התקבל מאת', note: 'ההערה שלך',
    tax: 'לא סופקו סחורות או שירותים תמורת תרומה זו, מלבד הטבות רוחניות בלתי מוחשיות. חב"ד למורינדה היא ארגון פטור ממס לפי סעיף 501(c)(3) של חוק המס הפדרלי בארצות הברית. נא לשמור קבלה זו לרישומי המס שלך.',
    taxId: 'מספר מזהה לצורכי מס (EIN)', close: 'בברכה ובהכרת תודה,', sign: 'הרב ישראל וציפורה לבקובסקי', questions: 'שאלות על תרומתך? התקשרו', monthlyNote: 'תרומה חודשית: תקבלו קבלה על כל תשלום.' },
  ru: { title: 'Официальная квитанция о пожертвовании', dear: (n) => (n ? `Уважаемый(ая) ${n}!` : 'Дорогой друг!'), headline: (m) => (m ? 'Спасибо, что вы с нами, месяц за месяцем' : 'Спасибо, что вы наш партнёр'),
    thanks: (m) => `Огромное спасибо за ваше ${m ? 'ежемесячное ' : ''}пожертвование Хабаду Ламоринды. Мы искренне благодарны и хотим, чтобы вы знали, как много это для нас значит. Вы не просто жертвуете: вы наш партнёр во всём, что мы делаем, и благодаря вам еврейская жизнь нашей общины становится крепче. Ваша щедрость укрепляет еврейские семьи в нашем регионе и приносит больше радости субботы, больше еврейских знаний нашим детям и тёплый приём каждому еврею. Спасибо, что вы делаете всё это возможным.`,
    dedicated: (d) => `Дар посвящён: ${d}. Для нас честь быть частью этого.`, noted: (n) => `Спасибо, что рассказали, почему вы дали: «${n}». Это нас тронуло.`,
    receiptNo: 'Номер квитанции', date: 'Дата пожертвования', amount: 'Сумма пожертвования', fund: 'Назначение', dedication: 'В честь или в память', how: 'Оплата', online: 'Онлайн (безопасная оплата через Stripe)', from: 'Получено от', note: 'Ваша записка',
    tax: 'Товары и услуги в обмен на это пожертвование не предоставлялись, кроме нематериальных религиозных благ. Хабад Ламоринды — организация, освобождённая от налогов согласно разделу 501(c)(3) Налогового кодекса США. Пожалуйста, сохраните эту квитанцию для налоговой отчётности.',
    taxId: 'Налоговый номер (EIN)', close: 'С благословением и благодарностью,', sign: 'рав Исраэль и Ципора Лабковски', questions: 'Вопросы о вашем пожертвовании? Звоните', monthlyNote: 'Ежемесячное пожертвование: квитанция придёт за каждый платёж.' },
};

// A warm line about the kind of gift (by the fund's id), so the thank-you is about what the giver chose. No facts beyond what each fund is for.
const FUND_THANKS = {
  en: {
    general: 'Your gift to our General Fund helps everything we do to flourish: Shabbat and holiday services, classes, and a warm welcome for every Jew.',
    chai: 'Thank you for joining the Chai Club. Monthly partners like you give us the steady support that lets us plan ahead and say yes to every family.',
    preschool: 'Your gift to Jewish Preschool Scholarships helps a young child begin life with Jewish learning, songs and friends, whatever the family’s budget.',
    market: 'Thank you for supporting the Bay Kosher Market.',
    building: 'Thank you for helping build a permanent home for Jewish life in our community.',
    holidays: 'Thank you for supporting our Holiday Programs: the celebrations, the meals and the joy that bring families together all year.',
    chesed: 'Thank you for helping us visit and care for those in need: seniors, the sick, and families going through a hard time.',
    synagogue: 'Thank you for supporting our synagogue: the Shabbat and holiday services that bring us together.',
    endyear: 'Thank you for your year-end gift, which carries our work into the new year.',
    children: 'Thank you for supporting Children Events: the programs where our children learn, celebrate and make Jewish friends.',
    pledge: 'Thank you for your gift. We truly appreciate it.',
  },
  he: {
    general: 'תרומתך לקרן הכללית עוזרת לכל מה שאנחנו עושים לפרוח: תפילות בשבת ובחגים, שיעורים, וקבלת פנים חמה לכל יהודי.',
    chai: 'תודה שהצטרפת למועדון חי. שותפים חודשיים כמוך נותנים לנו את התמיכה היציבה שמאפשרת לתכנן קדימה ולומר כן לכל משפחה.',
    preschool: 'תרומתך למלגות לגן היהודי עוזרת לילד קטן להתחיל את חייו עם לימוד יהודי, שירים וחברים, בלי קשר לתקציב המשפחה.',
    market: 'תודה על תמיכתך ב-Bay Kosher Market.',
    building: 'תודה שאתם עוזרים לבנות בית קבוע לחיים היהודיים בקהילה שלנו.',
    holidays: 'תודה על תמיכתך בתוכניות החגים: החגיגות, הסעודות והשמחה שמחברים משפחות לאורך השנה.',
    chesed: 'תודה שאתם עוזרים לנו לבקר ולטפל בנזקקים: קשישים, חולים ומשפחות שעוברות תקופה קשה.',
    synagogue: 'תודה על תמיכתך בבית הכנסת שלנו: התפילות בשבת ובחגים שמקבצות אותנו יחד.',
    endyear: 'תודה על תרומתך בסוף השנה, שמובילה את עבודתנו אל השנה החדשה.',
    children: 'תודה על תמיכתך באירועי הילדים: התוכניות שבהן ילדינו לומדים, חוגגים ומכירים חברים יהודים.',
    pledge: 'תודה על תרומתך. אנו מעריכים אותה מאוד.',
  },
  ru: {
    general: 'Ваш дар Общему фонду помогает процветать всему, что мы делаем: субботним и праздничным молитвам, урокам и тёплому приёму для каждого еврея.',
    chai: 'Спасибо, что присоединились к клубу Хай. Ежемесячные партнёры, как вы, дают нам стабильную поддержку, чтобы планировать вперёд и говорить «да» каждой семье.',
    preschool: 'Ваш дар стипендиям для еврейского детского сада помогает малышу начать жизнь с еврейскими знаниями, песнями и друзьями, независимо от бюджета семьи.',
    market: 'Спасибо за поддержку Bay Kosher Market.',
    building: 'Спасибо, что помогаете построить постоянный дом для еврейской жизни нашей общины.',
    holidays: 'Спасибо за поддержку праздничных программ: торжеств, трапез и радости, которые собирают семьи в течение всего года.',
    chesed: 'Спасибо, что помогаете нам навещать и поддерживать нуждающихся: пожилых, больных и семьи, переживающие трудное время.',
    synagogue: 'Спасибо за поддержку нашей синагоги: субботних и праздничных молитв, которые объединяют нас.',
    endyear: 'Спасибо за ваш дар в конце года, который несёт нашу работу в новый год.',
    children: 'Спасибо за поддержку детских событий: программ, где наши дети учатся, празднуют и находят еврейских друзей.',
    pledge: 'Спасибо за ваш дар. Мы очень его ценим.',
  },
};

// gift: { cents, fund, fundId, dedication, monthly, date (Date), number, note }; donor: { name, address }; org: the organization (org.json)
function receipt({ lang = 'en', base = '', org = {}, gift, donor = {} }) {
  const L = WORDS[lang] ? lang : 'en', W = WORDS[L], dir = L === 'he' ? 'rtl' : 'ltr', al = L === 'he' ? 'right' : 'left';
  const money = '$' + (gift.cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (gift.date || new Date()).toLocaleDateString(LOC[L], { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const ein = (String(org.legal || '').match(/\d{2}-\d{7}/) || [''])[0];
  const addr = org.address ? [org.address.street, org.address.city + ', ' + org.address.region + ' ' + org.address.postal].filter(Boolean).join(', ') : '';
  const rows = [[W.receiptNo, gift.number], [W.date, day], [W.amount, money + (gift.monthly ? ' ' + (L === 'he' ? '(חודשית)' : L === 'ru' ? '(ежемесячно)' : '(monthly)') : '')], [W.fund, gift.fund], [W.dedication, gift.dedication], [W.how, W.online],
    [W.from, [donor.name, donor.address].filter(Boolean).join(', ')], [W.note, gift.note]].filter((r) => r[1]);
  const phone = org.phone || '925-384-7242';
  // What the thank-you is about: the kind of gift, its dedication, and what the giver wrote.
  const specific = [(FUND_THANKS[L] || FUND_THANKS.en)[gift.fundId], gift.dedication ? W.dedicated(gift.dedication) : '', gift.note ? W.noted(gift.note) : ''].filter(Boolean);
  const html = `<!doctype html><html lang="${L}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(W.title)}</title></head>
<body style="margin:0;background:${BG};padding:18px 10px;font:16px/1.55 ${SANS};color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid ${LINE};border-radius:6px">
<tr><td style="padding:26px 30px 14px;text-align:center;border-bottom:3px solid ${GOLD}">
<img src="${esc(base)}/assets/logo-email.png" width="64" alt="" style="display:inline-block;border:0">
<div style="font:600 26px ${SERIF};color:${NAVY};margin-top:6px">${esc(org.name || 'Chabad of Lamorinda')}</div>
<div style="font:italic 600 17px ${SERIF};color:${GOLD_INK};margin-top:2px">${esc(W.sign)}</div>
<div style="font-size:13px;color:${MUTED};margin-top:4px">${esc(addr)}${addr ? ' · ' : ''}${esc(phone)}${ein ? '<br>' + esc(W.taxId) + ': ' + esc(ein) : ''}</div></td></tr>
<tr><td style="padding:24px 30px 6px;text-align:${al}"><div style="font:600 13px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${GOLD_INK}">${esc(W.title)}</div>
<p style="margin:14px 0 12px">${esc(W.dear(donor.name))}</p>
<div style="border-${L === 'he' ? 'right' : 'left'}:4px solid ${GOLD};background:#fbf7ee;padding:14px 18px;margin:0 0 14px;border-radius:4px"><div style="font:600 21px/1.3 ${SERIF};color:${NAVY};margin:0 0 8px">${esc(W.headline(gift.monthly))}</div><p style="margin:0">${esc(W.thanks(gift.monthly))}</p></div>${specific.map((s, i) => `<p style="margin:0 0 ${i === specific.length - 1 ? 16 : 10}px">${esc(s)}</p>`).join('')}</td></tr>
<tr><td style="padding:0 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${LINE}">
${rows.map(([k, v], i) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:14px;text-align:${al}" valign="top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${LINE};text-align:${L === 'he' ? 'left' : 'right'};${i === 2 ? 'font-weight:700;font-size:18px;color:' + NAVY : ''}" valign="top">${esc(v)}</td></tr>`).join('')}
</table></td></tr>
<tr><td style="padding:16px 30px 6px;text-align:${al};font-size:13px;color:${MUTED}">${esc(W.tax)}${gift.monthly ? '<br><br>' + esc(W.monthlyNote) : ''}</td></tr>
<tr><td style="padding:14px 30px 26px;text-align:${al}"><p style="margin:10px 0 2px">${esc(W.close)}</p><p style="margin:0;font:italic 600 19px ${SERIF};color:${NAVY}">${esc(W.sign)}</p>
<p style="margin:14px 0 0;font-size:13px;color:${MUTED}">${esc(W.questions)} <span dir="ltr">${esc(phone)}</span></p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [org.name || 'Chabad of Lamorinda', W.sign, addr, ein ? `${W.taxId}: ${ein}` : '', '', W.title.toUpperCase(), '', W.dear(donor.name), '', W.headline(gift.monthly).toUpperCase(), W.thanks(gift.monthly), '', ...specific.flatMap((s) => [s, '']), ...rows.map(([k, v]) => `${k}: ${v}`), '', W.tax, '', W.close, W.sign, '', `${W.questions} ${phone}`].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  return { subject: `${W.title}: ${org.name || 'Chabad of Lamorinda'} (${money})`, html, text };
}
module.exports = { receipt };
