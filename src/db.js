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
export async function createList(client, { name, emoji = null, is_watchlist = false }) {
  // .select().single() → return the created row (needed for self-echo id + the "returns data" contract;
  // supabase-js defaults to return=minimal / null data without .select()).
  // Only send is_watchlist when true so normal list creation still works if the column
  // migration hasn't run yet (unknown-column errors otherwise).
  const row = { name, emoji };
  if (is_watchlist) row.is_watchlist = true;
  return run(client.from("lists").insert(row).select().single());
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
export async function addItem(client, listId, { name, amount = "1", note = null, emoji = null }) {
  // Append after the current max sort_order (not 0 — otherwise new items collide at row 0).
  const last = await run(client.from("items").select("sort_order").eq("list_id", listId)
    .order("sort_order", { ascending: false }).limit(1));
  const nextOrder = (last && last[0] ? (last[0].sort_order || 0) : 0) + 1;
  const insert = { list_id: listId, name, amount, note, sort_order: nextOrder };
  if (emoji) insert.emoji = emoji;                    // auto-emoji guess; only send when we have one
  const row = await run(client.from("items").insert(insert).select().single());
  try { await historyUpsert(client, { name, amount, note }); } catch { /* non-fatal */ }
  return row;
}
// Undo: restore the FULL deleted row (every column: watch/target/emoji/store/keywords/…);
// the DB reassigns id + timestamps.
export async function reinsertItem(client, row) {
  const { id, created_at, updated_at, ...rest } = row;
  return run(client.from("items").insert(rest).select().single());
}
export async function reinsertItems(client, rows) {
  const payload = (rows || []).map(({ id, created_at, updated_at, ...rest }) => rest);
  return payload.length ? run(client.from("items").insert(payload).select()) : [];
}
export async function historyUpsert(client, { name, amount = null, note = null }) {
  const trimmed = String(name).trim();
  return run(client.from("item_history").upsert({
    name_key: trimmed.toLowerCase(), name: trimmed,
    last_amount: amount, last_note: note, last_used: new Date().toISOString(),
  }, { onConflict: "name_key" }));
}
export async function recentItems(client, prefix, limit = 6) {
  const p = (prefix || "").trim();
  if (!p) return [];
  const esc = p.replace(/[\\%_]/g, (c) => "\\" + c);   // treat "2%", "1/2" etc. literally in LIKE
  return run(client.from("item_history").select("*")
    .ilike("name", esc + "%").order("last_used", { ascending: false }).limit(limit));
}
// "Your usuals" — most-recently-used items regardless of prefix (for quick-add chips).
export async function topItems(client, limit = 12) {
  return (await run(client.from("item_history").select("*")
    .order("last_used", { ascending: false }).limit(limit))) || [];
}
// Price-history stats for an item (from the watcher's weekly log): cheapest + median over
// the last year of observations. Returns null when there's no history yet.
export async function priceStats(client, name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  const rows = await run(client.from("price_history").select("price, unit, observed_on")
    .eq("item_key", key).order("observed_on", { ascending: false }).limit(52));
  const prices = (rows || []).map((r) => Number(r.price)).filter((n) => isFinite(n)).sort((a, b) => a - b);
  if (!prices.length) return null;
  return {
    min: prices[0],
    median: prices[Math.floor(prices.length / 2)],
    count: prices.length,
    unit: (rows.find((r) => r.unit) || {}).unit || null,
  };
}
// Shared "Deals this week" written by the watcher. Buy-now items first.
export async function fetchDeals(client) {
  return (await run(client.from("deals").select("*")
    .order("buy_now", { ascending: false }).order("item"))) || [];
}
export async function updateItem(client, id, patch) {
  return run(client.from("items").update(patch).eq("id", id).select().single());
}
export async function deleteItem(client, id) {
  return run(client.from("items").delete().eq("id", id));
}
// Delete checked (non-watched) items in ONE request; returns the deleted ids (for self-echo).
export async function clearChecked(client, items) {
  const ids = idsToClear(items);
  if (ids.length) await run(client.from("items").delete().in("id", ids));
  return ids;
}
// Check / uncheck a specific set of ids in one request (scoped to the visible/filtered rows).
// .select() returns the affected rows so the caller can suppress their realtime self-echoes.
export async function checkItems(client, ids, checked) {
  if (!ids || !ids.length) return [];
  return run(client.from("items").update({ checked }).in("id", ids).select());
}
// Persist a new order (sort_order = index). Fired in parallel so a big drag is one round-trip
// deep instead of N sequential writes.
export async function reorderItems(client, ids) {
  await Promise.all(ids.map((id, i) => run(client.from("items").update({ sort_order: i }).eq("id", id))));
}
export async function reorderLists(client, ids) {
  await Promise.all(ids.map((id, i) => run(client.from("lists").update({ sort_order: i }).eq("id", id))));
}
// Move an item to a different list.
export async function moveItem(client, id, listId) {
  return run(client.from("items").update({ list_id: listId }).eq("id", id).select().single());
}
// Copy a list + its items into a new list (items reset to unchecked). Shared by
// duplicate / save-as-template / use-template.
async function copyList(client, listId, { isTemplate = false, suffix = "" }) {
  const src = (await run(client.from("lists").select("*").eq("id", listId)))?.[0];
  if (!src) return null;
  const listRow = { name: `${src.name}${suffix}`, emoji: src.emoji, is_template: isTemplate };
  if (src.is_watchlist) listRow.is_watchlist = true;   // a duplicated/template'd watch list stays one
  const newList = await run(client.from("lists").insert(listRow).select().single());
  const items = (await run(client.from("items").select("*").eq("list_id", listId))) || [];
  if (items.length) {
    await run(client.from("items").insert(items.map((it) => ({
      list_id: newList.id, name: it.name, amount: it.amount, unit: it.unit, note: it.note, store: it.store,
      watch: it.watch, emoji: it.emoji, sort_order: it.sort_order, checked: false,
      target_price: it.target_price, target_unit: it.target_unit, match_keywords: it.match_keywords,
      negative_keywords: it.negative_keywords, watch_stores: it.watch_stores,   // carry watch tuning
    }))));
  }
  return newList;
}
export function duplicateList(client, listId) { return copyList(client, listId, { suffix: " (copy)" }); }
export function saveAsTemplate(client, listId) { return copyList(client, listId, { isTemplate: true }); }
export function useTemplate(client, templateId) { return copyList(client, templateId, { isTemplate: false }); }
