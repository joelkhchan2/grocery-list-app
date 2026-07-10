import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryOf, CATEGORY_ORDER } from "../src/category.js";

test("categoryOf maps common items to sensible categories", () => {
  assert.equal(categoryOf("Bananas"), "Produce");
  assert.equal(categoryOf("Boneless skinless chicken breast"), "Meat & Seafood");
  assert.equal(categoryOf("2% milk 4L"), "Dairy & Eggs");
  assert.equal(categoryOf("Black Diamond cheese"), "Dairy & Eggs");
  assert.equal(categoryOf("Sourdough bread"), "Bakery");
  assert.equal(categoryOf("Sekka rice"), "Pantry");
  assert.equal(categoryOf("Miss Vickie's chips"), "Snacks & Candy");
  assert.equal(categoryOf("Premier Protein shake"), "Beverages");
  assert.equal(categoryOf("Paper towel"), "Household");
});

test("categoryOf falls back to Other for unknown items", () => {
  assert.equal(categoryOf("Widget 3000"), "Other");
  assert.equal(categoryOf(""), "Other");
  assert.equal(categoryOf(null), "Other");
});

test("Other is a valid category in the order list", () => {
  assert.ok(CATEGORY_ORDER.includes("Other"));
});
