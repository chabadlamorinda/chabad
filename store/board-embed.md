# Putting the Chai Club honor board on your website

The board is a page served by the app, so it updates itself whenever someone joins, changes level or leaves. Only people who chose "Show my name on the board" are named. Amounts are never shown.

**Board address:** `https://chabad-lamorinda-app.onrender.com/board/` (use your own address once you connect a custom domain).
Add `?embed=1` for the version without a background (for embedding) and `&lang=he` for Hebrew.

## Option A: this repo's website
`chai-club.html` is already in the repo and linked from the home page menu ("Chai Club"). If your app address differs, change it in that file (two places).

## Option B: your Chabad.org / chabadoflamorinda.com site
Add an "HTML / Embed" block to a page and paste:

```html
<iframe id="chai-board" title="Chai Club honor board"
  src="https://chabad-lamorinda-app.onrender.com/board/?embed=1"
  style="width:100%;border:0;min-height:900px"></iframe>
<script>
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://chabad-lamorinda-app.onrender.com' || !e.data || e.data.type !== 'chai-board-height') return;
  document.getElementById('chai-board').style.height = Math.min(Math.max(+e.data.height || 0, 300), 4000) + 'px';
});
</script>
```
If the platform strips `<script>`, the first part alone works; the frame just keeps a fixed height (scrolls inside).

The app only allows framing from `chabadoflamorinda.com` and its subdomains (and the onrender site). If your website lives on another address, add it in Render → Environment → `BOARD_FRAME_ANCESTORS` (space-separated, e.g. `https://www.example.org https://example.org`).

## Levels
Bronze $72–$179 · Silver $180–$359 · Gold $360–$719 · Platinum $720+ per month. A gift of exactly $180, $360 or $720 counts in the higher level.

Monthly gifts under $72 are welcome too: they are simply not listed on the board.
