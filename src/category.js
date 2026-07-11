// Built-in grocery category dictionary for "sort/group by category".
// Heuristic keyword match on the item name (first matching category wins,
// in CATEGORY_ORDER order). No external database; expand the keyword lists
// as needed. Anything unmatched falls into "Other".

export const CATEGORY_ORDER = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Snacks & Candy",
  "Beverages",
  "Household",
  "Personal Care",
  "Baby & Pet",
  "Other",
];

// Keyword → category. Substrings, lowercase. Order within a list doesn't matter;
// order BETWEEN categories (CATEGORY_ORDER) decides ties (first match wins).
const KEYWORDS = {
  "Produce": ["apple", "banana", "orange", "grape", "berry", "strawberr", "blueberr",
    "raspberr", "lettuce", "spinach", "kale", "tomato", "potato", "onion", "garlic",
    "carrot", "celery", "cucumber", "pepper", "broccoli", "cauliflower", "mushroom",
    "avocado", "lemon", "lime", "cilantro", "parsley", "ginger", "corn", "zucchini",
    "squash", "salad", "fruit", "veggie", "vegetable", "lettuce", "cabbage", "peach",
    "pear", "melon", "mango", "cherry", "green bean", "asparagus"],
  "Meat & Seafood": ["chicken", "beef", "pork", "turkey", "bacon", "sausage", "steak",
    "ground meat", "ground beef", "lamb", "ham", "salmon", "tuna", "shrimp", "fish",
    "tilapia", "cod", "seafood", "wing", "thigh", "drumstick", "breast", "deli meat",
    "hot dog", "meatball"],
  "Dairy & Eggs": ["milk", "cheese", "yogurt", "yoghurt", "butter", "cream", "egg",
    "sour cream", "cottage", "mozzarella", "cheddar", "parmesan", "feta", "margarine",
    "laughing cow", "babybel", "brie"],
  "Bakery": ["bread", "bagel", "bun", "tortilla", "croissant", "muffin", "cake", "pita",
    "roll", "baguette", "naan", "donut", "doughnut", "pastry", "dough", "wrap"],
  "Frozen": ["frozen", "ice cream", "pizza", "popsicle", "fries", "freezer", "perogies",
    "waffle"],
  "Pantry": ["rice", "pasta", "noodle", "ramen", "flour", "sugar", "salt", "oil",
    "vinegar", "sauce", "soup", "bean", "lentil", "chickpea", "cereal", "oats", "oatmeal",
    "peanut butter", "jam", "jelly", "honey", "ketchup", "mustard", "mayo", "spice",
    "broth", "stock", "canned", "cracker mix", "coffee", "tea", "syrup", "seasoning",
    "sekka", "nissin", "instant"],
  "Snacks & Candy": ["chip", "cracker", "cookie", "candy", "chocolate", "granola bar",
    "pretzel", "popcorn", "snack", "trail mix", "vickie", "dorito", "cheeto", "gum",
    "protein bar", "good crisp", "nut bar", "fruit snack"],
  "Beverages": ["water", "juice", "soda", " pop", "cola", "beer", "wine", "sparkling",
    "gatorade", "energy drink", "kombucha", "smoothie", "premier protein", "protein shake",
    "iced tea", "lemonade", "seltzer"],
  "Household": ["paper towel", "toilet paper", "tissue", "detergent", "soap", "cleaner",
    "bleach", "dish soap", "garbage bag", "foil", "plastic wrap", "ziploc", "sponge",
    "laundry", "napkin", "dishwasher", "trash bag"],
  "Personal Care": ["shampoo", "toothpaste", "deodorant", "razor", "lotion", "sunscreen",
    "floss", "toothbrush", "body wash", "conditioner", "feminine", "vitamin", "medicine",
    "bandage", "advil", "tylenol"],
  "Baby & Pet": ["diaper", "baby wipe", "formula", "dog food", "cat food", "pet ", "litter",
    "baby food", "kibble"],
};

// Return the category name for an item name (or "Other" if nothing matches).
export function categoryOf(name) {
  const n = ` ${String(name || "").toLowerCase()} `;
  for (const cat of CATEGORY_ORDER) {
    const kws = KEYWORDS[cat];
    if (kws && kws.some((k) => n.includes(k))) return cat;
  }
  return "Other";
}

// Keyword → emoji, ordered most-specific first (first substring match wins). Only ~130
// food emojis exist, so this is a curated map, not a dataset. Falls back to a per-category
// default, then to null (no auto-emoji) for genuinely unknown items.
const EMOJI_KEYWORDS = [
  ["ice cream", "🍦"], ["peanut butter", "🥜"], ["coconut", "🥥"], ["hot dog", "🌭"],
  ["olive oil", "🫒"], ["ground beef", "🥩"], ["green bean", "🫘"],
  ["toilet paper", "🧻"], ["paper towel", "🧻"], ["toothpaste", "🪥"], ["toothbrush", "🪥"],
  ["dish soap", "🧼"], ["body wash", "🧼"], ["baby food", "🍼"], ["dog food", "🐶"], ["cat food", "🐱"],
  // produce
  ["banana", "🍌"], ["apple", "🍎"], ["orange", "🍊"], ["lemon", "🍋"], ["lime", "🍋"],
  ["grape", "🍇"], ["strawberr", "🍓"], ["blueberr", "🫐"], ["raspberr", "🍓"], ["berry", "🍓"],
  ["watermelon", "🍉"], ["melon", "🍈"], ["mango", "🥭"], ["peach", "🍑"], ["pear", "🍐"],
  ["cherry", "🍒"], ["pineapple", "🍍"], ["grapefruit", "🍊"], ["avocado", "🥑"], ["eggplant", "🍆"], ["tomato", "🍅"],
  ["pepperoni", "🍕"],
  ["potato", "🥔"], ["onion", "🧅"], ["garlic", "🧄"], ["carrot", "🥕"], ["corn", "🌽"],
  ["broccoli", "🥦"], ["cucumber", "🥒"], ["mushroom", "🍄"], ["lettuce", "🥬"], ["spinach", "🥬"],
  ["kale", "🥬"], ["cabbage", "🥬"], ["pepper", "🫑"], ["chili", "🌶️"], ["ginger", "🫚"],
  // meat & seafood
  ["chicken", "🍗"], ["turkey", "🦃"], ["bacon", "🥓"], ["steak", "🥩"], ["beef", "🥩"],
  ["pork", "🥩"], ["lamb", "🥩"], [" ham ", "🥩"], ["sausage", "🌭"], ["shrimp", "🦐"],
  ["salmon", "🐟"], ["tuna", "🐟"], ["tilapia", "🐟"], ["fish", "🐟"], ["cod", "🐟"], ["seafood", "🦐"],
  // dairy & eggs
  ["milk", "🥛"], ["cheese", "🧀"], ["egg", "🥚"], ["butter", "🧈"], ["yogurt", "🥛"],
  ["yoghurt", "🥛"], ["cream", "🍦"],
  // bakery
  ["bread", "🍞"], ["bagel", "🥯"], ["croissant", "🥐"], ["baguette", "🥖"], ["pretzel", "🥨"],
  ["muffin", "🧁"], ["cupcake", "🧁"], ["cake", "🎂"], ["waffle", "🧇"], ["pancake", "🥞"],
  ["donut", "🍩"], ["doughnut", "🍩"], ["tortilla", "🫓"], ["pita", "🫓"], ["naan", "🫓"], ["wrap", "🌯"],
  // pantry
  ["pizza", "🍕"], ["fries", "🍟"], ["rice", "🍚"], ["pasta", "🍝"], ["spaghetti", "🍝"],
  ["noodle", "🍜"], ["ramen", "🍜"], ["honey", "🍯"], ["syrup", "🍯"], ["jam", "🍯"],
  ["salt", "🧂"], ["nut", "🥜"], ["bean", "🫘"], ["lentil", "🫘"], ["chickpea", "🫘"],
  ["soup", "🥫"], ["broth", "🥫"], ["stock", "🥫"], ["canned", "🥫"], ["sauce", "🥫"],
  ["ketchup", "🥫"], ["mustard", "🥫"], ["cereal", "🥣"], ["oats", "🥣"], ["oatmeal", "🥣"],
  // snacks & candy
  ["popcorn", "🍿"], ["chip", "🍟"], ["crisp", "🍟"], ["cookie", "🍪"], ["chocolate", "🍫"],
  ["candy", "🍬"], ["cracker", "🍘"],
  // beverages
  ["water", "💧"], ["juice", "🧃"], ["soda", "🥤"], ["cola", "🥤"], [" pop ", "🥤"],
  ["beer", "🍺"], ["wine", "🍷"], ["coffee", "☕"], ["tea", "🍵"], ["gatorade", "🥤"], ["smoothie", "🥤"],
  // household
  ["tissue", "🧻"], ["napkin", "🧻"], ["soap", "🧼"], ["detergent", "🧴"], ["laundry", "🧺"],
  ["bleach", "🧽"], ["sponge", "🧽"], ["cleaner", "🧽"], ["garbage bag", "🗑️"], ["trash bag", "🗑️"],
  // personal care
  ["shampoo", "🧴"], ["conditioner", "🧴"], ["deodorant", "🧴"], ["razor", "🪒"], ["lotion", "🧴"],
  ["sunscreen", "🧴"], ["floss", "🪥"], ["mouthwash", "🪥"], ["sensodyne", "🪥"],
  ["vitamin", "💊"], ["medicine", "💊"], ["advil", "💊"], ["tylenol", "💊"], ["bandage", "🩹"],
  // baby & pet
  ["diaper", "🍼"], ["formula", "🍼"], ["litter", "🐱"], ["kibble", "🐾"],
];

const CATEGORY_EMOJI = {
  "Produce": "🥦", "Meat & Seafood": "🥩", "Dairy & Eggs": "🧀", "Bakery": "🍞",
  "Frozen": "🧊", "Pantry": "🥫", "Snacks & Candy": "🍫", "Beverages": "🥤",
  "Household": "🧽", "Personal Care": "🧴", "Baby & Pet": "🍼",
};

// Longest keyword first, so a specific term beats a generic substring it contains
// (pineapple before apple, grapefruit before grape, pepperoni before pepper).
const EMOJI_BY_LEN = [...EMOJI_KEYWORDS].sort((a, b) => b[0].length - a[0].length);

// Best-guess emoji for an item name: a specific keyword match, else the category default,
// else null (unknown → no auto-emoji rather than a wrong one).
export function emojiOf(name) {
  const n = ` ${String(name || "").toLowerCase()} `;
  for (const [kw, em] of EMOJI_BY_LEN) if (n.includes(kw)) return em;
  return CATEGORY_EMOJI[categoryOf(name)] || null;
}
