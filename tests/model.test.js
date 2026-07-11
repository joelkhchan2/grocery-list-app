import { test } from "node:test";
import assert from "node:assert/strict";
import { bySortOrder, idsToClear, watchNames, isSelfEcho, selfEchoKey } from "../src/model.js";
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

test("isSelfEcho matches own writes by id+updated_at; a partner's later edit passes through", () => {
  // main.js registers `${id}@${updated_at}` after a write resolves; the matching echo is skipped.
  const pending = new Set([selfEchoKey({ id: "i1", updated_at: "t1" })]);
  assert.equal(isSelfEcho({ id: "i1", updated_at: "t1" }, pending), true);   // own echo → skip
  assert.equal(isSelfEcho({ id: "i1", updated_at: "t2" }, pending), false);  // partner edited same row → refresh
  assert.equal(isSelfEcho({ id: "remote", updated_at: "t9" }, pending), false);
  assert.equal(isSelfEcho(undefined, pending), false);                        // null-safe
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
