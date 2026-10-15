// Standalone honor board page (also used inside an iframe on the website).
(function () {
  'use strict';
  var q = new URLSearchParams(location.search), lang = q.get('lang') === 'he' ? 'he' : 'en', embed = q.get('embed') === '1';
  if (embed) document.body.className = 'embed';
  document.documentElement.lang = lang;
  var mount = document.getElementById('board');
  function height() { if (embed && parent !== window) parent.postMessage({ type: 'chai-board-height', height: document.documentElement.scrollHeight }, '*'); }
  function show(data) { mount.textContent = ''; mount.appendChild(ClubBoard.render(data, { lang: lang, joinHref: '/pushka/?go=club' })); height(); }
  show(null);
  ClubBoard.load('').then(show).catch(function () {});
  window.addEventListener('resize', height); setTimeout(height, 400);
})();
