import { idsToClear, bySortOrder } from "./model.js";

async function run(q) { const { data, error } = await q; if (error) throw error; return data; }

export async function fetchLists(client) {
  const lists = bySortOrder(await run(client.from("lists").select("*").order("sort_order")));
  // One lightweight pass over items gives both total and checked counts per list (for home progress).
  const items = (await run(client.from("items").select("list_id, checked"))) || [];
  const total = {}, done = {};
  for (const it of items) {
    total[it.list_id] = (total[it.list_id] || 0) + 1;
    if (it.checked) done[it.list_id] = (done[it.list_id] || 0) + 1;
  }
  return lists.map((l) => ({ ...l, item_count: total[l.id] || 0, checked_count: done[l.id] || 0 }));
}
export async function createList(client, { name, emoji = null }) {
  // .select().single() → return the created row (needed for self-echo id + the "returns data" contract;
  // supabase-js defaults to return=minimal / null data without .select()).
  return run(client.from("lists").insert({ name, emoji }).select().single());
}
export async function renameList(client, id, name) {
  return run(client.from("lists").update({ name }).eq("id", id).select().single());
}
export async function updateList(client, id, patch) {
  return run(client.from("lists").update(patch).eq("id", id).select().single());
}
export async function deleteList(client, id) {
  return run(client.from("lists").delete().eq("id", id));
}
export async function fetchItems(client, listId) {
  return bySortOrder(await run(
    client.from("items").select("*").eq("list_id", listId).order("sort_order")));
}
export async function addItem(client, listId, { name, amount = "1", note = null }) {
  const row = await run(
    client.from("items").insert({ list_id: listId, name, amount, note }).select().single());
  try { await historyUpsert(client, { name, amount, note }); } catch { /* non-fatal */ }
  return row;
}
export async function reinsertItem(client, row) {
  // Undo: restore the full deleted row (watch/checked/sort_order preserved; a new id is fine).
  const { list_id, name, amount = "1", note = null, watch = false, checked = false, sort_order = 0 } = row;
  return run(client.from("items")
    .insert({ list_id, name, amount, note, watch, checked, sort_order }).select().single());
}
export async function historyUpsert(client, { name, amount = null, note = null }) {
  const trimmed = String(name).trim();
  return run(client.from("item_history").upsert({
    name_key: trimmed.toLowerCase(), name: trimmed,
    last_amount: amount, last_note: note, last_used: new Date().toISOString(),
  }, { onConflict: "name_key" }));
}
export async function recentItems(client, prefix, limit = 6) {
  if (!prefix || !prefix.trim()) return [];
  return run(client.from("item_history").select("*")
    .ilike("name", prefix.trim() + "%").order("last_used", { ascending: false }).limit(limit));
}
export async function updateItem(client, id, patch) {
  return run(client.from("items").update(patch).eq("id", id).select().single());
}
export async function deleteItem(client, id) {
  return run(client.from("items").delete().eq("id", id));
}
export async function clearChecked(client, items) {
  for (const id of idsToClear(items)) await deleteItem(client, id);
}
// Persist a new order: set each row's sort_order to its index.
export async function reorderItems(client, ids) {
  for (let i = 0; i < ids.length; i++) {
    await run(client.from("items").update({ sort_order: i }).eq("id", ids[i]));
  }
}
export async function reorderLists(client, ids) {
  for (let i = 0; i < ids.length; i++) {
    await run(client.from("lists").update({ sort_order: i }).eq("id", ids[i]));
  }
}
// Bulk check / uncheck every item in a list (one request). .select() returns the
// affected rows so the caller can suppress their realtime self-echoes.
export async function checkAll(client, listId, checked) {
  return run(client.from("items").update({ checked }).eq("list_id", listId).select());
}
