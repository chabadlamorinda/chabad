// Edit this line: paste Chabad of Lamorinda's donation page link here.
const DONATE_URL = "https://www.chabadoflamorinda.com/donate";

const KEY = "pushka-v1";
const $ = (id) => document.getElementById(id);
let gifts = [];
try { gifts = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { gifts = []; }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(gifts)); } catch (e) {} };
const money = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };

function streak() {
  const days = new Set(gifts.map((g) => dayKey(g.t)));
  let n = 0, d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function render() {
  const total = gifts.reduce((s, g) => s + g.amt, 0);
  $("total").textContent = money(total);
  $("count").textContent = gifts.length;
  $("streak").textContent = streak();
  $("none").style.display = gifts.length ? "none" : "block";
  const ul = $("history");
  ul.textContent = "";
  gifts.slice().reverse().forEach((g) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    const a = document.createElement("div");
    a.className = "amt"; a.textContent = money(g.amt);
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = new Date(g.t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + (g.note ? " · " + g.note : "");
    left.append(a, m);
    const del = document.createElement("button");
    del.textContent = "✕"; del.title = "Remove"; del.setAttribute("aria-label", "Remove gift");
    del.onclick = () => { gifts = gifts.filter((x) => x.t !== g.t); save(); render(); };
    li.append(left, del);
    ul.append(li);
  });
}

function add(amt, note) {
  if (!(amt > 0)) return;
  gifts.push({ amt: Math.round(amt * 100) / 100, note: (note || "").trim(), t: Date.now() });
  save();
  const coin = $("coin"), box = $("pushka");
  coin.classList.remove("drop"); box.classList.remove("shake");
  void coin.offsetWidth;
  coin.classList.add("drop"); box.classList.add("shake");
  render();
}

$("quick").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) add(parseFloat(b.dataset.amt), $("note").value);
});
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  add(parseFloat($("amount").value), $("note").value);
  $("amount").value = "";
});
$("donate").href = DONATE_URL;
$("empty").addEventListener("click", () => {
  if (gifts.length && confirm("Empty your pushka? This clears the history on this device.")) { gifts = []; save(); render(); }
});
render();
