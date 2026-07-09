import { test } from "node:test";
import assert from "node:assert/strict";
import { bySortOrder, idsToClear, watchNames, isSelfEcho } from "../src/model.js";
import { isNumericAmount, stepAmount } from "../src/model.js";

test("bySortOrder sorts by sort_order then created_at", () => {
  const rows = [{sort_order:2,created_at:"b"},{sort_order:1,created_at:"a"},{sort_order:1,created_at:"z"}];
  assert.deepEqual(bySortOrder(rows).map(r=>r.sort_order), [1,1,2]);
});

test("idsToClear removes checked non-watched, keeps watched", () => {
  const items = [
    {id:"a",checked:true,watch:false},   // clear
    {id:"b",checked:true,watch:true},    // KEEP (watched)
    {id:"c",checked:false,watch:false},  // keep (not checked)
  ];
  assert.deepEqual(idsToClear(items), ["a"]);
});

test("watchNames returns only watched item names", () => {
  const items = [{name:"Chicken",watch:true},{name:"Milk",watch:false},{name:"Coffee",watch:true}];
  assert.deepEqual(watchNames(items), ["Chicken","Coffee"]);
});

test("isSelfEcho suppresses own echoes (updates AND just-created ids) and passes remote changes", () => {
  // main.js adds a created row's real id to `pending` after the insert resolves,
  // so a create's own echo is suppressed just like an update's.
  const pending = new Set(["i1", "new-uuid"]);
  assert.equal(isSelfEcho({ id: "i1" }, pending), true);        // own update echo → skip
  assert.equal(isSelfEcho({ id: "new-uuid" }, pending), true);  // own create echo → skip
  assert.equal(isSelfEcho({ id: "remote" }, pending), false);   // real remote change → refresh
  assert.equal(isSelfEcho(undefined, pending), false);          // null-safe (deleted rows w/ no payload)
});

test("isNumericAmount only true for plain integers", () => {
  assert.equal(isNumericAmount("3"), true);
  assert.equal(isNumericAmount(" 3 "), true);
  assert.equal(isNumericAmount("500 g"), false);
  assert.equal(isNumericAmount(""), false);
});
test("stepAmount steps integers (min 1) and leaves text amounts alone", () => {
  assert.equal(stepAmount("2", 1), "3");
  assert.equal(stepAmount("1", -1), "1");
  assert.equal(stepAmount("500 g", 1), "500 g");
});
