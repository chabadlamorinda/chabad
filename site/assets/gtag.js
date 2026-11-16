// Google Analytics / Google Ads tag (only loaded when GA_ID is set). Kept in a file so the site needs no inline scripts.
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
var id = document.currentScript.getAttribute('data-id');
// Browsers that ask not to be tracked (Global Privacy Control or Do Not Track) are not counted.
if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') { window['ga-disable-' + id] = true; }
else { gtag('js', new Date()); gtag('config', id); }
