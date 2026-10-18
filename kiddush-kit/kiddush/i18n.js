// English / Hebrew for the Kiddush pages (phone page and TV). One toggle button; the choice is remembered.
// t('English text') returns the Hebrew when Hebrew is on; anything without a translation simply stays English.
'use strict';
(function () {
  var HE = {
    // ---- both pages
    'Loading…': 'טוען…',
    'This week’s Kiddush': 'הקידוש של השבוע', 'This Kiddush': 'הקידוש הקרוב', 'Next Kiddush': 'הקידוש הבא',
    'Shabbat Mevarchim Chodesh': 'שבת מברכים חודש', 'Molad': 'מולד', 'Candle lighting': 'הדלקת נרות', 'Havdalah': 'הבדלה',
    'Shabbos': 'שבת', 'Sunday': 'יום ראשון', 'Monday': 'יום שני', 'Tuesday': 'יום שלישי', 'Wednesday': 'יום רביעי', 'Thursday': 'יום חמישי', 'Friday': 'יום שישי',
    'Anonymous': 'אנונימי', 'and {n} more': 'ועוד {n}',
    // ---- phone page
    'Sponsor a Kiddush': 'לתרום קידוש',
    'Dedicate a Kiddush in honor or in memory of someone dear. Your name and dedication are displayed on our Kiddush board, and the merit of this mitzvah is in their honor.': 'הקדישו קידוש לכבוד או לעילוי נשמת אדם יקר. שמכם וההקדשה מוצגים בלוח הקידוש שלנו, וזכות המצווה לכבודם.',
    'Show weeks without a sponsor yet': 'הצג שבועות ללא תורם', 'Staff sign-in': 'כניסת צוות',
    'SPONSORED BY': 'בחסות', 'OPEN FOR SPONSORSHIP': 'פתוח לחסות', 'Add your sponsorship': 'הצטרפו לחסות', 'Sponsor this Kiddush': 'לתרום קידוש זה',
    'Sponsor the Kiddush board for {year}': 'חסות על לוח הקידוש {year}', 'The Kiddush board is generously donated by': 'לוח הקידוש נתרם בנדיבות על ידי',
    'You are welcome to join in sponsoring the board.': 'מוזמנים להצטרף לחסות על הלוח.',
    'Your name and dedication will be displayed as the sponsor of the Kiddush board on the shul’s TV and here, all year.': 'שמכם וההקדשה יוצגו כתורמי לוח הקידוש במסך בבית הכנסת וכאן, לאורך כל השנה.',
    'Sponsor the board': 'לתרום את הלוח', 'Questions, or a larger or deluxe Kiddush?': 'שאלות, או קידוש גדול או מפואר יותר?', 'Contact the Rabbi': 'צרו קשר עם הרב',
    'Call {phone}': 'התקשרו {phone}', 'Email': 'דוא״ל', 'Sponsor': 'לתרום', 'Join in': 'להצטרף', 'Sponsored': 'נתרם', 'Reserved': 'שמור',
    'Every upcoming week this year is sponsored. Thank you!': 'כל השבועות הקרובים השנה נתרמו. תודה!', 'No upcoming weeks in this year.': 'אין שבועות קרובים בשנה זו.',
    'No dedication': 'ללא הקדשה', 'Name to show on the board': 'שם להצגה בלוח', 'e.g. The Cohen Family': 'לדוגמה: משפחת כהן', 'Keep my name anonymous on the board': 'להציג אותי כ״אנונימי״ בלוח',
    'Dedication': 'הקדשה', 'In honor / memory of': 'לכבוד / לעילוי נשמת', 'Name(s) or occasion, e.g. Sara’s birthday': 'שם או אירוע, לדוגמה: יום הולדת שרה',
    'For your receipt': 'לקבלה', 'Optional': 'לא חובה', 'Amount ($) — you’re welcome to give more': 'סכום ($) — אפשר לתרום יותר', 'How would you like to pay?': 'איך תרצו לשלם?',
    'Card, Apple Pay or Google Pay': 'כרטיס אשראי, Apple Pay או Google Pay', 'Secure checkout by Stripe. Receipt by email.': 'תשלום מאובטח דרך Stripe. קבלה בדוא״ל.',
    'No fees. We’ll show you where to send it.': 'ללא עמלות. נראה לכם לאן לשלוח.', 'Opens Venmo with the amount filled in.': 'פותח את Venmo עם הסכום מוכן.',
    'Check': 'צ׳ק', 'Mail or hand it in at shul.': 'בדואר או במסירה בבית הכנסת.', 'Cash or other': 'מזומן או אחר', 'Bring it to shul, or ask us about other options.': 'הביאו לבית הכנסת, או שאלו אותנו על אפשרויות אחרות.',
    'Note to the Rabbi': 'הערה לרב', 'Optional. Only the Rabbi sees this.': 'לא חובה. רק הרב רואה זאת.', 'Add {amount} to cover the card processing fee': 'הוסיפו {amount} לכיסוי עמלת הסליקה',
    'Continue to secure payment': 'המשך לתשלום מאובטח', 'Reserve this Kiddush': 'שמרו קידוש זה', 'Opening secure checkout…': 'פותח תשלום מאובטח…',
    'Please enter the name to show on the board.': 'נא להזין את השם להצגה בלוח.', 'Please enter a valid email address.': 'נא להזין כתובת דוא״ל תקינה.',
    'The minimum for this Kiddush is {amount}.': 'המינימום לקידוש זה הוא {amount}.', 'Please choose how you would like to pay.': 'נא לבחור אופן תשלום.',
    'This Kiddush has already taken place. You are welcome to sponsor it now, in honor or in memory of someone dear.': 'קידוש זה כבר התקיים. אפשר לתרום אותו כעת, לכבוד או לעילוי נשמת אדם יקר.',
    'Already sponsored by {names}. You are welcome to join in sponsoring.': 'כבר נתרם על ידי {names}. מוזמנים להצטרף.',
    'Your name and dedication are displayed as the sponsor of the Kiddush board for the whole year.': 'שמכם וההקדשה מוצגים כתורמי לוח הקידוש לאורך כל השנה.',
    'Would you like a larger or deluxe Kiddush? Please contact the Rabbi to discuss': 'מעוניינים בקידוש גדול או מפואר יותר? צרו קשר עם הרב לשיחה',
    'Thank you': 'תודה', 'Your Kiddush sponsorship is confirmed.': 'החסות שלכם על הקידוש אושרה.', 'Please send your payment to complete your sponsorship.': 'נא לשלוח את התשלום להשלמת החסות.',
    'You are sponsoring': 'אתם תורמים את', 'You are sponsoring the': 'אתם תורמים את', 'Displayed all year on the Kiddush board': 'מוצג כל השנה בלוח הקידוש', 'Standard Kiddush': 'קידוש רגיל',
    'Your generosity brings our community together.': 'נדיבותכם מקרבת את הקהילה שלנו.', 'Your sponsorship will be acknowledged without your name.': 'החסות תוצג ללא שמכם.',
    'Your name and dedication now appear on our Kiddush board.': 'שמכם וההקדשה מוצגים כעת בלוח הקידוש שלנו.', 'Your sponsorship will appear on the Kiddush board once your payment is confirmed.': 'החסות תופיע בלוח הקידוש לאחר שהתשלום יאושר.',
    'May you be blessed with health, happiness and success!': 'שתהיו מבורכים בבריאות, באושר ובהצלחה!', 'To complete your sponsorship, please send {amt} as follows:': 'להשלמת החסות, נא לשלוח {amt} כך:',
    'Zelle to': 'Zelle אל', 'The account name is {name}.': 'שם החשבון: {name}.', 'Memo': 'הערה בתשלום', 'Note': 'הערה', 'Open Venmo': 'פתחו את Venmo', 'Payable to': 'לפקודת', 'Mail or bring to': 'לשלוח בדואר או להביא אל',
    'Please bring it to shul, or contact us to arrange another way to give.': 'נא להביא לבית הכנסת, או ליצור קשר לתיאום אופן אחר.', 'One last step': 'עוד שלב אחד',
    'Please send us a quick email so we can add your name to the board and match your payment.': 'נא לשלוח לנו הודעת דוא״ל קצרה כדי שנוסיף את שמכם ללוח ונתאים את התשלום.', 'Email the details': 'שלחו את הפרטים בדוא״ל',
    'We will confirm it as soon as it arrives, and send you a friendly reminder if we have not received it within 3 days.': 'נאשר זאת ברגע שיגיע, ונשלח לכם תזכורת ידידותית אם לא קיבלנו תוך 3 ימים.',
    'Your payment was received and a receipt has been emailed to you. The office will add your name to the board.': 'התשלום התקבל וקבלה נשלחה אליכם בדוא״ל. המשרד יוסיף את שמכם ללוח.',
    'A receipt has been emailed to you.': 'קבלה נשלחה אליכם בדוא״ל.', 'Back to the board': 'חזרה ללוח', 'Copy': 'העתקה', 'Copied': 'הועתק',
    'Confirming your payment…': 'מאשר את התשלום…', 'Payment cancelled. No charge was made and the week was released.': 'התשלום בוטל. לא בוצע חיוב והשבוע שוחרר.',
    'That checkout expired and no payment was taken. You can pick the week again below.': 'התשלום פג תוקף ולא בוצע חיוב. אפשר לבחור את השבוע שוב למטה.',
    'We haven’t received confirmation yet. If you were charged, your sponsorship will appear shortly. Please contact us if it does not.': 'עדיין לא קיבלנו אישור. אם חויבתם, החסות תופיע בקרוב. נא ליצור קשר אם לא.',
    'We received your payment, ': 'קיבלנו את התשלום שלכם, ', 'but that week was taken a moment earlier. Please contact us and we will make it right.': 'אך השבוע נתרם רגע קודם. נא ליצור קשר ונסדר זאת.',
    'Can’t reach the server. Check your connection and try again.': 'לא ניתן להתחבר לשרת. בדקו את החיבור ונסו שוב.', 'Something went wrong. Please try again.': 'משהו השתבש. נסו שוב.',
    'has already passed.': 'כבר עבר.',
    // ---- TV
    'KIDDUSH SPONSORS': 'תורמי הקידוש', 'THIS WEEK’S KIDDUSH': 'הקידוש של השבוע', 'THIS KIDDUSH': 'הקידוש הקרוב', 'NEXT KIDDUSH': 'הקידוש הבא',
    'JOIN IN SPONSORING': 'הצטרפו לחסות', 'SCAN TO SPONSOR': 'סרקו כדי לתרום', 'DONATED BY': 'נתרם על ידי', 'SPONSOR THIS KIDDUSH BOARD FOR {year}': 'חסות על לוח הקידוש {year}',
    'Your name displayed here all year': 'שמכם יוצג כאן כל השנה', 'See you at the next Kiddush': 'להתראות בקידוש הבא', 'Reconnecting…': 'מתחבר מחדש…', 'UPCOMING EVENTS': 'אירועים קרובים',
  };
  // server messages by code (the server's own text is English)
  var ERR_HE = { invalid_name: 'נא להזין את השם להצגה בלוח.', invalid_email: 'נא להזין כתובת דוא״ל תקינה.', invalid_method: 'נא לבחור אופן תשלום.', method_off: 'אפשרות התשלום אינה זמינה כעת.',
    invalid_amount: 'נא להזין סכום תקין.', amount_too_low: 'הסכום נמוך מהמינימום לקידוש זה.', no_slot: 'השבוע לא נמצא.', too_many: 'יש לכם כבר כמה הזמנות ממתינות. נא להשלים או ליצור קשר.', rate_limited: 'יותר מדי בקשות. נא להמתין רגע.', invalid_request: 'משהו השתבש. נסו שוב.' };
  var KINDS_HE = { honor: 'לכבוד', memory: 'לעילוי נשמת', refuah: 'לרפואת', celebration: 'לרגל', merit: 'לזכות' };
  var MONTHS_HE = { Cheshvan: 'חשון', Kislev: 'כסלו', Tevet: 'טבת', Shevat: 'שבט', Adar: 'אדר', 'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳', Nisan: 'ניסן', Iyar: 'אייר', Sivan: 'סיון', Tammuz: 'תמוז', Av: 'אב', Elul: 'אלול', Tishrei: 'תשרי' };
  var DOW_HE = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
  var DOW_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];

  function pick() {
    var m = /[?&]lang=(he|en)\b/.exec(location.search), v = null;
    if (m) { v = m[1]; try { localStorage.setItem('kiddush-lang', v); } catch (e) { /* private mode */ } return v; }
    try { v = localStorage.getItem('kiddush-lang'); } catch (e) { /* ignore */ }
    return v === 'he' ? 'he' : 'en';
  }
  var lang = pick(), HEB = lang === 'he';

  function t(s, vars) {
    var r = HEB && HE[s] ? HE[s] : s;
    if (vars) Object.keys(vars).forEach(function (k) { r = r.split('{' + k + '}').join(vars[k]); });
    return r;
  }
  var d12 = function (iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); };
  var KI = {
    lang: lang, he: HEB, t: t,
    // "Oct 17" / "17 באוקטובר"
    dateLabel: function (s) { if (!HEB) return s.dateLabel; try { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(d12(s.date)); } catch (e) { return s.dateLabel; } },
    monthYear: function (iso) { var d = d12(iso); if (HEB) { try { return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(d); } catch (e) { /* fall through */ } } return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()] + ' ' + d.getFullYear(); },
    dowName: function (iso) { var i = d12(iso).getDay(); return HEB ? DOW_HE[i] : DOW_EN[i]; },
    dowShort: function (iso) { var i = d12(iso).getDay(); return HEB ? (i === 6 ? 'שבת' : 'יום ' + 'אבגדהו'[i] + '׳') : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][i]; },
    title: function (s) { return HEB && s.titleHe ? s.titleHe : s.title; },
    hebDate: function (s) { return HEB && s.hebHe ? s.hebHe : s.heb; },
    kindLabel: function (k, english) { return HEB && KINDS_HE[k] ? KINDS_HE[k] : english; },
    // "In honor of Sara" / "לכבוד Sara"
    reason: function (x) { if (!x) return ''; if (!HEB) return x.dedication || ''; return x.reason ? (KINDS_HE[x.kind] ? KINDS_HE[x.kind] + ' ' : '') + x.reason : ''; },
    // calendar note (yahrzeit, event...): "Tuesday, Oct 20: Yahrzeit of ..."
    note: function (n) { return KI.dowName(n.date) + ', ' + KI.dateLabel(n) + ': ' + (HEB && n.textHe ? n.textHe : n.text); },
    // The organisation's name for the current language, from chabad.config.json (served with the board)
    org: function (S) { var o = (S && S.org) || {}; return HEB ? (o.nameHe || o.name || '') : (o.name || ''); },
    orgLines: function (S) { var o = (S && S.org) || {}; return HEB ? [o.line1He || o.line1 || '', o.line2He || o.line2 || ''] : [o.line1 || '', o.line2 || '']; },
    name: function (x) { return x.name === 'Anonymous' ? t('Anonymous') : x.name; },
    mevarchim: function (s) {
      if (!s.mevarchim) return ''; var m = t('Shabbat Mevarchim Chodesh') + ' ' + (HEB ? (MONTHS_HE[s.mevarchim] || s.mevarchim) : s.mevarchim);
      return m;
    },
    molad: function (s) { return s.molad ? (HEB ? KI.moladHe(s.molad) : s.molad) : ''; },
    moladHe: function (m) { // "Monday, 10:27 PM and 3 chalakim" -> "יום שני, 22:27 ו-3 חלקים"
      var r = /^(\w+), (\d+):(\d+) (AM|PM) and (\d+) chalakim?$/.exec(m); if (!r) return m;
      var dow = DOW_EN.indexOf(r[1] === 'Saturday' ? 'Shabbos' : r[1]), hh = (+r[2] % 12) + (r[4] === 'PM' ? 12 : 0);
      return (dow >= 0 ? DOW_HE[dow] : r[1]) + ', ' + hh + ':' + r[3] + ' ו-' + r[5] + ' חלקים';
    },
    time: function (txt) { return HEB ? txt.replace(/(\d+):(\d+)\s*(AM|PM)/i, function (_, h, m, ap) { return ((+h % 12) + (/pm/i.test(ap) ? 12 : 0)) + ':' + m; }) : txt; },
    error: function (e) { return HEB ? (ERR_HE[e.code] || (e.code === 'network' ? t('Can’t reach the server. Check your connection and try again.') : t('Something went wrong. Please try again.'))) : e.message; },
    blessing: function (S) { return HEB && S.blessingHe ? S.blessingHe : S.blessing; },
    standard: function (S) { return HEB ? (S.standardNoteHe || '') : (S.standardNote ? S.standardNote + '.' : ''); },
    // set the page direction/language, translate the static [data-t] text, and add the toggle button
    apply: function () {
      var root = document.documentElement; root.lang = lang; root.dir = HEB ? 'rtl' : 'ltr'; root.classList.toggle('he', HEB);
      Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (n) { n.textContent = t(n.getAttribute('data-t')); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-t-ph]'), function (n) { n.placeholder = t(n.getAttribute('data-t-ph')); });
      var b = document.getElementById('langBtn');
      if (b) { b.textContent = HEB ? 'English' : 'עברית'; b.onclick = function () { try { localStorage.setItem('kiddush-lang', HEB ? 'en' : 'he'); } catch (e) { /* ignore */ } var u = location.search.replace(/([?&])lang=(he|en)&?/, '$1').replace(/[?&]$/, ''); location.href = location.pathname + u; }; }
    },
  };
  window.KI = KI;
})();
