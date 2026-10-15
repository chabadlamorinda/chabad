// First-pass department for items with no category (a convenience, easy to correct in bulk).
// It only suggests a DEPARTMENT. Meat / dairy / pareve and Passover are never guessed from a name:
// those need a person (or the label) to confirm, because a wrong guess is a kashrus problem, not a layout one.
'use strict';

// ordered: first match wins. Words are matched on word boundaries.
const RULES = [
  ['judaica', /\b(mezuzah|mezuza|tefillin|tallis|tallit|tzitzis|tzitzit|yarmulke|kippah|kippot|siddur|chumash|haggadah|haggada|menorah|dreidel|havdalah|havdala|kiddush cup|bentcher|bencher|shabbat candle|shabbos candle|yahrzeit|seder plate|matzah cover|sefer|tehillim|kosher pen|esrog|etrog|lulav|sukkah|shofar)\b/i],
  ['baby-food', /\b(formula|similac|enfamil|kendamil|gerber|baby|infant|toddler|pampers|huggies|diaper|pull[- ]?ups)\b/i],
  ['household', /\b(dish (soap|liquid|detergent)|dishwashing|dishwasher|laundry|fabric softener|all[- ]purpose cleaner)\b/i],
  ['beauty-personal', /\b(shampoo|conditioner|body wash|soap|lotion|deodorant|toothpaste|toothbrush|razor|floss|sunscreen|moisturizer|mouthwash|tampon|nail polish|perfume|cologne|lip balm|hand cream|face cream|shaving|cotton (balls|swabs)|q-tips?)\b/i],
  ['household', /\b(detergent|bleach|trash bags?|garbage bags?|foil|aluminum|plastic wrap|cling wrap|paper towels?|toilet paper|napkins?|tablecloth|disposable|plates?|bowls?|cups?|cutlery|forks?|spoons?|knives|containers?|tupperware|batteries|light bulbs?|sponges?|dish soap|tissues?|ziploc|zipper|baggies|sandwich bags?|parchment|baking pans?|pans?|trays?|lighters?|matches|candles?|air freshener|cleaner|windex|lysol|mop|broom|gloves)\b/i],
  ['frozen', /\b(frozen|frz|ice cream|popsicles?|sorbet|gelato|ice pops?|frozen yogurt)\b/i],
  ['dairy', /\b(cheese|cheddar|mozzarella|mozz|feta|brie|swiss|muenster|provolone|parmesan|ricotta|cottage|cream cheese|sour cream|yogurt|yoghurt|milk|butter|kefir|labane|labneh|whipped cream|half and half|creamer|eggs?|cholov yisroel|chalav)\b/i],
  ['beverages', /\b(juice|soda|cola|seltzer|sparkling|water|wine|vodka|whisky|whiskey|scotch|bourbon|gin|rum|tequila|brandy|cognac|arak|schnapps|liqueur|beer|ale|lager|champagne|prosecco|tea|coffee|espresso|lemonade|kombucha|energy drink|drink|punch|nectar|smoothie|sake|kedem|manischewitz wine|grape juice|coconut water)\b/i],
  ['baked-goods', /\b(bread|challah|challa|rolls?|bagels?|buns?|pita|laffa|croissants?|babka|rugelach|danish|muffins?|donuts?|doughnuts?|brownies?|pastry|pastries|cakes?|cupcakes?|cookies?|biscotti|kichel|strudel|pie|tart|focaccia|baguette|sourdough|bakery)\b/i],
  ['candy-sweets', /\b(candy|candies|chocolates?|gum|lollipops?|gummy|gummies|bamba|wafers?|halva|halvah|marshmallows?|licorice|toffee|caramel|sweets|jelly beans|lozenges?|mints?|truffles?|nougat|fudge|bonbon|chewing)\b/i],
  ['deli-provisions', /\b(deli|pickles?|olives?|herring|lox|salmon|gefilte|hummus|humus|tahini|techina|salad|dips?|spread|sliced|smoked|whitefish|coleslaw|kugel|cholent|chulent|schmaltz|pastrami|corned beef|salami|bologna|turkey breast|roast beef|hot dogs?|franks?|sausages?|kishke|knish|latkes?|borscht|matbucha|babaganoush|baba ganoush|eggplant|antipasto|sauerkraut|horseradish|chrain)\b/i],
  ['meat', /\b(chicken|beef|brisket|steaks?|lamb|veal|turkey|ribs?|roast|cutlets?|schnitzel|shnitzel|wings?|drumsticks?|thighs?|ground (beef|chicken|turkey)|pargit|pargi|flanken|shoulder|chuck|ribeye|filet|liver|tongue|bones|oxtail|short ribs?|london broil|skirt|hanger|tenderloin|breast|leg quarters?|meatballs?|burgers?|patties|kebab|shawarma|shwarma|duck|goose)\b/i],
  ['groceries', /\b(pasta|spaghetti|noodles?|macaroni|rice|oil|olive oil|sauce|spices?|seasoning|flour|sugar|salt|pepper|cereal|oats|granola|nuts?|almonds?|walnuts?|peanuts?|beans?|lentils?|soup|canned|can|jar|mix|crackers?|chips|snacks?|pretzels?|popcorn|matzo|matzah|matza|vinegar|ketchup|mayo|mayonnaise|mustard|dressing|jam|jelly|honey|syrup|peanut butter|tomato|couscous|quinoa|barley|kasha|farfel|tuna|sardines|cocoa|vanilla|baking|yeast|bouillon|consomme|broth|stock|sprinkles|raisins|dates|dried|spread|pudding|jello|gelatin|margarine|shortening|tortilla|taco|salsa|guacamole|pesto|crumbs?|breadcrumbs?|cornflakes|crispix|rice cakes?|ramen)\b/i],
];

function guessDepartment(name, { perUnitLb = false } = {}) {
  const n = String(name || '');
  for (const [slug, re] of RULES) if (re.test(n)) return slug;
  return perUnitLb ? 'meat' : ''; // weighed items with no other clue are almost always fresh meat or fish counters
}

// Clover's own category names -> our department / (safe) kosher type. Only Clover categories a person set by hand count.
const CLOVER_CATEGORY = { meat: { dept: 'meat', kosher: 'meat' }, 'milk & cheese': { dept: 'dairy', kosher: 'dairy' }, breads: { dept: 'baked-goods' }, 'bread crumbs': { dept: 'groceries' }, sauces: { dept: 'groceries' }, baking: { dept: 'groceries' }, chocolates: { dept: 'candy-sweets' }, fish: { dept: 'deli-provisions' }, disposables: { dept: 'household' } };

module.exports = { guessDepartment, CLOVER_CATEGORY, RULES };
