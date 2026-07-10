import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchLists, fetchItems, addItem, updateItem, clearChecked, recentItems, reinsertItem } from "../src/db.js";

// Fake mirroring supabase-js v2 semantics closely enough to catch real bugs:
// insert/update return null data UNLESS .select() is chained (return=minimal default);
// .single() unwraps to one object; .then() makes the builder awaitable to {data,error}.
function fakeClient(canned = {}) {
  const calls = [];
  const builder = (table) => {
    let mode = "select", payload = null, single = false, selected = false;
    const q = { table };
    q.select = () => { selected = true; return q; };
    q.single = () => { single = true; return q; };
    q.insert = (rows) => { mode = "insert"; payload = rows; calls.push(["insert", table, rows]); return q; };
    q.update = (patch) => { mode = "update"; payload = patch; calls.push(["update", table, patch]); return q; };
    q.delete = () => { mode = "delete"; calls.push(["delete", table]); return q; };
    q.upsert = (rows, opts) => { mode = "upsert"; payload = rows; calls.push(["upsert", table, rows]); return q; };
    q.eq = () => q;
    q.order = () => q;
    q.ilike = () => q;
    q.limit = () => q;
    q.then = (res) => {
      let data;
      if (mode === "select") data = canned[table] ?? [];
      else if (mode === "delete") data = null;
      else data = selected ? [{ id: "generated-id", ...payload }] : null; // insert/update/upsert need .select()
      res({ data: single && Array.isArray(data) ? (data[0] ?? null) : data, error: null });
    };
    return q;
  };
  return { from: builder, _calls: calls };
}

test("fetchLists computes item_count and checked_count from items", async () => {
  const c = fakeClient({
    lists: [{ id: "l1", name: "Groceries", sort_order: 0, created_at: "a" }],
    items: [
      { list_id: "l1", checked: false }, { list_id: "l1", checked: true }, { list_id: "l1", checked: true },
    ],
  });
  const lists = await fetchLists(c);
  assert.equal(lists[0].item_count, 3);
  assert.equal(lists[0].checked_count, 2);
});

test("fetchLists defaults counts to 0 when a list has no items", async () => {
  const c = fakeClient({ lists: [{ id: "l2", name: "Hardware", sort_order: 0, created_at: "a" }], items: [] });
  const lists = await fetchLists(c);
  assert.equal(lists[0].item_count, 0);
  assert.equal(lists[0].checked_count, 0);
});

test("fetchItems selects items for a list", async () => {
  const c = fakeClient({ items: [{ id: "x", name: "Milk", sort_order: 0, created_at: "a" }] });
  const items = await fetchItems(c, "list1");
  assert.equal(items[0].name, "Milk");
});

test("addItem inserts amount+note and upserts history under a normalized key", async () => {
  const c = fakeClient();
  const row = await addItem(c, "list1", { name: "Milk", amount: "2 L", note: "the oat one" });
  const ins = c._calls.find(x => x[0] === "insert");
  assert.equal(ins[2].list_id, "list1");
  assert.equal(ins[2].amount, "2 L");
  assert.equal(ins[2].note, "the oat one");
  assert.equal(row.id, "generated-id");
  const up = c._calls.find(x => x[0] === "upsert" && x[1] === "item_history");
  assert.ok(up);
  assert.equal(up[2].name_key, "milk");   // lower(trim(name)) dedup key
  assert.equal(up[2].name, "Milk");       // display name preserved
});
test("addItem defaults amount to '1' and note to null", async () => {
  const c = fakeClient();
  await addItem(c, "l1", { name: "Bananas" });
  const ins = c._calls.find(x => x[0] === "insert");
  assert.equal(ins[2].amount, "1");
  assert.equal(ins[2].note, null);
});
test("recentItems queries item_history by recency and returns rows", async () => {
  const c = fakeClient({ item_history: [{ name: "Milk", last_used: "2026-07-09" }] });
  const rows = await recentItems(c, "Mi");
  assert.equal(rows[0].name, "Milk");
});
test("recentItems returns [] for a blank prefix without querying", async () => {
  const c = fakeClient();
  assert.deepEqual(await recentItems(c, "  "), []);
});
test("reinsertItem restores all fields incl. watch/checked/sort_order", async () => {
  const c = fakeClient();
  await reinsertItem(c, { list_id:"l1", name:"Eggs", amount:"1", note:null, watch:true, checked:false, sort_order:2 });
  const ins = c._calls.find(x => x[0] === "insert");
  assert.equal(ins[2].watch, true);
  assert.equal(ins[2].sort_order, 2);
});
test("a history upsert failure does not break addItem", async () => {
  const c = fakeClient();
  c.from = ((orig) => (t) => t === "item_history" ? { upsert: () => { throw new Error("boom"); } } : orig(t))(c.from);
  const row = await addItem(c, "l1", { name: "Eggs" });   // must resolve, not throw
  assert.equal(row.id, "generated-id");
});

test("updateItem sends the patch and returns the updated row", async () => {
  const c = fakeClient();
  const row = await updateItem(c, "i1", { checked: true });
  const upd = c._calls.find(x => x[0] === "update");
  assert.deepEqual(upd[2], { checked: true });
  assert.equal(row.id, "generated-id");
});

test("mutations without .select() return null (contract guard — proves the fake enforces it)", async () => {
  const c = fakeClient();
  const { data } = await c.from("items").insert({ name: "x" }); // no .select()
  assert.equal(data, null);
});

test("clearChecked deletes only checked non-watched", async () => {
  const c = fakeClient();
  await clearChecked(c, [{id:"a",checked:true,watch:false},{id:"b",checked:true,watch:true}]);
  const deletes = c._calls.filter(x => x[0] === "delete");
  assert.equal(deletes.length, 1); // only "a"
});
