// Hebrew-date helpers shared by the app (browser) and the server. Pure functions on civil dates ("YYYY-MM-DD").
// Used to find the next yahrzeit and to drive reminders. Relies on the built-in Hebrew calendar in Intl.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.HebDate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const FMT = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  // Month keys as stored. "Adar" = a death in a regular (non-leap) year; "Adar I"/"Adar II" = a death in a leap year.
  const MONTHS = ["Tishri", "Heshvan", "Kislev", "Tevet", "Shevat", "Adar", "Adar I", "Adar II", "Nisan", "Iyar", "Sivan", "Tamuz", "Av", "Elul"];
  const MONTHS_HE = { "Tishri": "תשרי", "Heshvan": "חשוון", "Kislev": "כסלו", "Tevet": "טבת", "Shevat": "שבט", "Adar": "אדר", "Adar I": "אדר א׳", "Adar II": "אדר ב׳", "Nisan": "ניסן", "Iyar": "אייר", "Sivan": "סיוון", "Tamuz": "תמוז", "Av": "אב", "Elul": "אלול" };
  const ymd = (d) => d.toISOString().slice(0, 10);
  const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const addDays = (s, n) => ymd(new Date(toDate(s).getTime() + n * 864e5));
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const isLeap = (y) => (7 * y + 1) % 19 < 7;
  function parts(s) {
    const p = FMT.formatToParts(toDate(s)), get = (t) => p.find((x) => x.type === t).value;
    return { day: +get("day"), month: get("month"), year: +get("year") };
  }
  // Hebrew date of a civil date; a death after nightfall counts as the next Hebrew day.
  const hebrewOf = (s, afterSunset) => parts(afterSunset ? addDays(s, 1) : s);
  const label = (e, he) => e.day + " " + (he ? MONTHS_HE[e.month] || e.month : e.month);

  // Does the Hebrew date p fall on the yahrzeit described by entry e = {day, month, year?}?
  function match(e, p, s) {
    if (e.year && p.year <= e.year) return null;
    const leap = isLeap(p.year), notes = [];
    if (e.month === "Adar") { if (leap) { if (p.month !== "Adar I" && p.month !== "Adar II") return null; notes.push("adar"); } else if (p.month !== "Adar") return null; }
    else if (e.month === "Adar I" || e.month === "Adar II") { if (leap) { if (p.month !== e.month) return null; } else if (p.month !== "Adar") return null; }
    else if (p.month !== e.month) return null;
    if (p.day === e.day) return notes;
    if (e.day === 30 && p.day === 29 && parts(addDays(s, 1)).day === 1) return notes.concat("short-month"); // 30th does not exist this year
    return null;
  }
  // Next yahrzeit on or after fromYmd. Returns { date, hebrew, notes } or null.
  function next(e, fromYmd) {
    for (let i = 0; i < 400; i++) {
      const s = addDays(fromYmd, i), p = parts(s), notes = match(e, p, s);
      if (notes) return { date: s, hebrew: p, notes };
    }
    return null;
  }
  return { MONTHS, MONTHS_HE, ymd, toDate, addDays, daysBetween, isLeap, parts, hebrewOf, label, next };
});
