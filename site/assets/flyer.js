// The Print button on event flyers (/events/<slug>/flyer).
'use strict';
document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-print]')) window.print(); });
