// English/Hebrew text. English strings ARE the keys, so the code reads naturally; Hebrew lives in he.json.
// Anything missing falls back to English, and a test fails if a string used in code has no Hebrew.
'use strict';
const HE = require('./he.json');
// strings looked up through a variable (not a literal), so a scan of the source cannot find them
const DYNAMIC_KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Serving', 'Calories', 'Total fat', 'Saturated fat', 'Sodium', 'Carbohydrates', 'Sugars', 'Fiber', 'Protein',
  'Substitute something similar', 'We choose the closest match.', 'Call me; if no answer, substitute', 'Call me; if no answer, do not substitute', 'Never substitute', 'Items out of stock are simply removed.',
  'Received', 'Being packed', 'Ready for pickup', 'Ready', 'On its way', 'Completed', 'Cancelled', 'Awaiting payment', 'pickup', 'delivery', 'co-op delivery',
  'ready for pickup at 3477 Golden Gate Way', 'on its way to you', 'ready for the co-op delivery', 'Please enter a valid email', 'Choose pickup or delivery', 'Your cart is empty', 'That time is no longer available. Please pick another.',
  'Please enter your delivery address', 'Outside our delivery area', 'We couldn\'t find that address', 'That pickup point is closed or unavailable', 'Order total is too small', 'Too many attempts, please wait a few minutes',
  'Too many attempts, please wait a minute', 'Too many attempts', 'Too many requests', 'Code expired. Request a new one.', 'That code is not right', 'Payment not completed yet', 'Sign in to reorder', 'Sign in required',
  'Signed in as a different customer', 'ON', 'OFF', 'Meat', 'Dairy', 'Pareve', 'Password', 'Email code', 'Create account', 'Create my account', 'Choose a password (8+ characters)', 'Change password', 'Set a password', 'Wrong email or password', 'Password must be at least 8 characters',
  'Is Bay Kosher a kosher grocery store near {city}?', 'Yes. Bay Kosher is a kosher grocery store at {address}, run by Chabad of Lamorinda. You can shop online for {city} delivery or pickup, or visit the store.', 'How fast can I get my order?', 'What do you sell?', 'Do you have kosher for Passover products?', 'Can I order in Hebrew?', 'Not found', 'Page not found', 'Back to Bay Kosher', 'You are unsubscribed', 'You will no longer receive our weekly email.'];
function t(lang, key, vars) {
  let s = lang === 'he' && HE[key] ? HE[key] : key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
module.exports = { t, HE, DYNAMIC_KEYS };
