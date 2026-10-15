// Tiny holder so route modules can reach the notifier without circular wiring.
'use strict';
let n = null;
module.exports = { set: (x) => { n = x; }, get: () => n };
