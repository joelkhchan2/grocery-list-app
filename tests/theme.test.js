import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActive, THEMES, DEFAULT_THEME, DARK_THEME } from "../src/theme.js";

test("resolveActive returns chosen theme when auto-dark off", () => {
  assert.equal(resolveActive("teal", false, true), "teal");
  assert.equal(resolveActive("teal", false, false), "teal");
});
test("resolveActive switches to dark theme only when auto-dark on AND system dark", () => {
  assert.equal(resolveActive("bluegold", true, true), DARK_THEME);
  assert.equal(resolveActive("bluegold", true, false), "bluegold");
});
test("resolveActive falls back to default for an unknown key", () => {
  assert.equal(resolveActive("nope", false, false), DEFAULT_THEME);
});
test("THEMES includes the default and dark keys", () => {
  const keys = THEMES.map(t => t.key);
  assert.ok(keys.includes(DEFAULT_THEME));
  assert.ok(THEMES.find(t => t.key === DARK_THEME).dark === true);
});
