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
