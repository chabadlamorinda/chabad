// Google Analytics / Google Ads tag (only loaded when GA_ID is set). Kept in a file so the site needs no inline scripts.
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
gtag('js', new Date());
gtag('config', document.currentScript.getAttribute('data-id'));
