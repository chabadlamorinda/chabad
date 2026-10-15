// Reopens a saved cart from a reminder link, then continues to the cart page.
(() => {
  const me = document.currentScript;
  try { localStorage.setItem('bk_cartid', JSON.stringify(me.dataset.cart)); localStorage.removeItem('bk_cart'); } catch (e) {}
  location.replace(me.dataset.to || '/cart');
})();
