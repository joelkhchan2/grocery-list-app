import { getClient } from "./supabase.js";
import { currentSession, signIn, signOut, renderSignIn } from "./auth.js";
import * as db from "./db.js";
import { renderLists, renderListDetail, renderSuggestions, renderAppearance, showUndo, showSheet, showPrompt, showEmojiPicker, setMyStores } from "./ui.js";
import { loadPrefs, savePrefs, applyTheme, applyCustom, resolveActive } from "./theme.js";
import { isSelfEcho, idsToClear, bySortOrder } from "./model.js";
import { emojiOf } from "./category.js";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const client = getClient();
const pending = new Set();          // REAL row ids of in-flight local mutations (self-echo suppression)
let state = { view: "lists", listId: null };
let lastLists = [];                 // most recent fetchLists result (for move-target + list menus)
let lastItems = [];                 // most recent list-detail items (for the item ⋯ menu: reorder)
let storeFilter = null;             // transient: filter list detail to one store (null = all)
let netListenersBound = false;      // guards against re-adding window online/offline listeners on re-boot

// Theme: apply saved prefs immediately (index.html already set data-theme pre-paint to avoid a flash;
// this keeps the JS state in sync and reacts to system dark-mode changes when auto-dark is on).
let prefs = loadPrefs();
const mq = matchMedia("(prefers-color-scheme: dark)");
applyTheme(resolveActive(prefs.theme, prefs.autoDark, mq.matches));
applyCustom(prefs);
mq.addEventListener("change", () => {
  if (prefs.autoDark) applyTheme(resolveActive(prefs.theme, prefs.autoDark, mq.matches));
});

let addQueryTimer = null;           // debounce for autocomplete queries
let sortMode = "manual";            // per-device list sort/group: manual | alpha | store | category
try { sortMode = localStorage.getItem("glSort") || "manual"; } catch { /* private mode */ }
let haptics = true;                 // per-device: vibrate on check / drag (where supported)
try { haptics = localStorage.getItem("glHaptics") !== "0"; } catch { /* private mode */ }
try { const s = localStorage.getItem("glMyStores"); if (s) setMyStores(JSON.parse(s)); } catch { /* private mode */ }

function haptic(ms = 10) {
  if (haptics && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}
// Expose so the UI layer can buzz on drag-grab / check without importing main.
window.__glHaptic = haptic;

function setStatus(msg) {            // transient inline banner (errors / reconnecting)
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.hidden = !msg;
  if (msg) setTimeout(() => { if (statusEl.textContent === msg) statusEl.hidden = true; }, 4000);
}

// Run a write; suppress its own realtime echo by the AFFECTED row id(s); surface errors to the user.
async function mutate(fn, knownIds = []) {
  knownIds.forEach(id => pending.add(id));
  let created = [];
  try {
    const rows = await fn();                         // create/update fns return the affected row (db.js chains .select())
    created = [].concat(rows || []).map(r => r && r.id).filter(Boolean);
    created.forEach(id => pending.add(id));           // covers creates whose id we didn't know up front
    await refresh();
    const all = knownIds.concat(created);
    setTimeout(() => all.forEach(id => pending.delete(id)), 1500);  // clear after the echo window
  } catch (e) {
    knownIds.concat(created).forEach(id => pending.delete(id));
    setStatus("Couldn't save — check your connection.");
    try { await refresh(); } catch {}                // revert optimistic view to server truth
  }
}

async function refresh() {
  if (state.view === "settings") {
    renderAppearance(app, { ...prefs, haptics }, handlers);   // no data fetch needed
    return;
  }
  if (state.view === "lists") {
    lastLists = await db.fetchLists(client);
    renderLists(app, lastLists.filter(l => !l.is_template), lastLists.filter(l => l.is_template), handlers);
  } else {
    lastLists = await db.fetchLists(client);
    const list = lastLists.find(l => l.id === state.listId);
    if (!list) { state = { view: "lists", listId: null }; return refresh(); }
    const items = await db.fetchItems(client, state.listId);
    lastItems = items;
    const usuals = await db.topItems(client).catch(() => []);
    renderListDetail(app, list, items, handlers, sortMode, usuals, storeFilter);
  }
}

const handlers = {
  onOpenList: (id) => { storeFilter = null; state = { view: "detail", listId: id }; refresh(); },
  onSetStoreFilter: (v) => { storeFilter = v; refresh(); },
  onOpenSettings: () => { state = { view: "settings" }; refresh(); },
  onBack: () => { state = { view: "lists", listId: null }; refresh(); },
  onNewList: (name) => mutate(() => db.createList(client, { name })),
  onRenameList: (id, name) => mutate(() => db.renameList(client, id, name), [id]),
  onDeleteList: (id) => mutate(() => db.deleteList(client, id), [id]),
  onAddItem: (name) => {
    clearTimeout(addQueryTimer);
    mutate(() => db.addItem(client, state.listId, { name, amount: "1", note: null, emoji: emojiOf(name) }));
  },
  onNewWatchList: (name) => mutate(() => db.createList(client, { name, is_watchlist: true })),
  onAddWatchItem: (name) => {
    const n = (name || "").trim();
    if (!n) return;
    // A watch-list item is a standing watch: create it, then flag watch=true so it feeds the watcher.
    mutate(async () => {
      const row = await db.addItem(client, state.listId, { name: n, amount: "1", note: null, emoji: emojiOf(n) });
      return row && row.id ? db.updateItem(client, row.id, { watch: true }) : row;
    });
  },
  onToggleCheck: (it) => { haptic(8); return mutate(() => db.updateItem(client, it.id, { checked: !it.checked }), [it.id]); },
  onToggleWatch: (it) => mutate(() => db.updateItem(client, it.id, { watch: !it.watch }), [it.id]),
  onAmount: (it, amount) => mutate(() => db.updateItem(client, it.id, { amount }), [it.id]),
  onEditAmount: (it, amount) => mutate(() => db.updateItem(client, it.id, { amount }), [it.id]),
  onEditItem: (it, name) => mutate(() => db.updateItem(client, it.id, { name }), [it.id]),
  onEditNote: (it, note) => mutate(() => db.updateItem(client, it.id, { note }), [it.id]),
  onSetStore: (it, store) => mutate(() => db.updateItem(client, it.id, { store }), [it.id]),
  onSetItemEmoji: (it, emoji) => mutate(() => db.updateItem(client, it.id, { emoji: emoji || null }), [it.id]),
  onSetTargetPrice: (it, raw) => {
    const s = (raw || "").trim();
    if (s === "") return mutate(() => db.updateItem(client, it.id, { target_price: null }), [it.id]);
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    if (!isFinite(n) || n <= 0) { setStatus("Enter a price like 4.00"); return; }
    // A target implies you want the deal watched — turn on 🔔 alongside it.
    return mutate(() => db.updateItem(client, it.id, { target_price: n, watch: true }), [it.id]);
  },
  onSetListEmoji: (id, emoji) => mutate(() => db.updateList(client, id, { emoji }), [id]),
  onSetSort: (mode) => {
    sortMode = mode;
    try { localStorage.setItem("glSort", mode); } catch { /* private mode */ }
    refresh();
  },
  onDeleteItem: (it) => {
    mutate(() => db.deleteItem(client, it.id), [it.id]);
    // reinsertItem (not addItem) preserves watch/checked/sort_order so an undone watch still feeds the watcher.
    showUndo(document.body, it.name, () => mutate(() => db.reinsertItem(client, it)));
  },
  onClearChecked: (items) => mutate(() => db.clearChecked(client, items), idsToClear(items)),
  onCheckAll: () => mutate(() => db.checkAll(client, state.listId, true)),
  onUncheckAll: () => mutate(() => db.checkAll(client, state.listId, false)),
  onReorder: (ids) => mutate(() => db.reorderItems(client, ids), ids),
  onReorderLists: (ids) => mutate(() => db.reorderLists(client, ids), ids),
  onMoveItem: (it, listId) => mutate(() => db.moveItem(client, it.id, listId), [it.id]),
  onDuplicateList: (id) => mutate(() => db.duplicateList(client, id)),
  onSaveTemplate: (id) => mutate(() => db.saveAsTemplate(client, id)),
  onUseTemplate: (id) => mutate(() => db.useTemplate(client, id)),
  onItemMenu: (it) => {
    const opts = [{
      label: it.emoji ? `${it.emoji} Change emoji` : "😊 Add emoji",
      onClick: () => showEmojiPicker((e) => handlers.onSetItemEmoji(it, e)),
    }, {
      label: it.watch ? "Stop watching for deals" : "🔔 Watch for deals",
      onClick: () => handlers.onToggleWatch(it),
    }, {
      label: it.target_price != null
        ? `🎯 Deal price: $${Number(it.target_price).toFixed(2)} (edit)`
        : "🎯 Set deal price",
      onClick: () => showPrompt("Alert me at or under ($)",
        it.target_price != null ? String(it.target_price) : "",
        (v) => handlers.onSetTargetPrice(it, v), { placeholder: "e.g. 4.00 — blank to clear" }),
    }];
    const targets = lastLists.filter((l) => l.id !== state.listId && !l.is_template);
    if (targets.length) {
      opts.push({
        label: "Move to another list…",
        onClick: () => showSheet(`Move "${it.name}" to…`, targets.map((l) => ({
          label: (l.emoji ? l.emoji + " " : "") + l.name,
          onClick: () => handlers.onMoveItem(it, l.id),
        }))),
      });
    }
    if (sortMode === "manual") {
      const active = bySortOrder(lastItems.filter((i) => !i.checked));
      const idx = active.findIndex((i) => i.id === it.id);
      const ids = active.map((i) => i.id);
      if (idx > 0) opts.push({ label: "Move up", onClick: () => {
        const a = ids.slice(); [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; handlers.onReorder(a);
      } });
      if (idx >= 0 && idx < active.length - 1) opts.push({ label: "Move down", onClick: () => {
        const a = ids.slice(); [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; handlers.onReorder(a);
      } });
    }
    showSheet(it.name, opts);
  },
  onWatchItemMenu: (it) => {
    showSheet(it.name, [
      { label: it.emoji ? `${it.emoji} Change emoji` : "😊 Add emoji",
        onClick: () => showEmojiPicker((e) => handlers.onSetItemEmoji(it, e)) },
      { label: it.watch ? "⏸ Pause alerts" : "▶ Resume alerts", onClick: () => handlers.onToggleWatch(it) },
      { label: it.target_price != null
          ? `🎯 Deal price: $${Number(it.target_price).toFixed(2)} (edit)`
          : "🎯 Set deal price",
        onClick: async () => {
          const s = await db.priceStats(client, it.name).catch(() => null);
          const u = s && s.unit ? "/" + s.unit : "";
          const hint = s
            ? `Seen as low as $${s.min.toFixed(2)}${u} · median $${s.median.toFixed(2)}${u} over ${s.count} week${s.count === 1 ? "" : "s"}`
            : "No price history yet — the watcher logs prices each week.";
          showPrompt("Alert me at or under ($)",
            it.target_price != null ? String(it.target_price) : "",
            (v) => handlers.onSetTargetPrice(it, v), { placeholder: "e.g. 4.00 — blank to clear", hint });
        } },
      { label: it.target_unit ? `📏 Price is per ${it.target_unit}` : "📏 Price is flat (per package)",
        onClick: () => showSheet("Price is per…", [
          { label: "Flat price (per package)", onClick: () => handlers.onSetTargetUnit(it, null) },
          { label: "per lb", onClick: () => handlers.onSetTargetUnit(it, "lb") },
          { label: "per kg", onClick: () => handlers.onSetTargetUnit(it, "kg") },
          { label: "per 100g", onClick: () => handlers.onSetTargetUnit(it, "100g") },
          { label: "each", onClick: () => handlers.onSetTargetUnit(it, "ea") },
        ]) },
      { label: it.match_keywords ? `🔤 Match words: ${it.match_keywords}` : "🔤 Match words (advanced)",
        onClick: () => showPrompt("Match words (comma-separated; blank = use the item name)",
          it.match_keywords || "",
          (v) => handlers.onSetMatchKeywords(it, v), { placeholder: "e.g. dempster bread, dempsters bread" }) },
      { label: it.negative_keywords ? `🚫 Exclude words: ${it.negative_keywords}` : "🚫 Exclude words (advanced)",
        onClick: () => showPrompt("Exclude words (comma-separated; a deal is skipped if it contains one)",
          it.negative_keywords || "",
          (v) => handlers.onSetExcludeKeywords(it, v), { placeholder: "e.g. hamburger, hot dog, bagel" }) },
    ]);
  },
  onSetWatchStores: (it, arr) => mutate(() => db.updateItem(client, it.id, { watch_stores: (arr && arr.length) ? arr.join(", ") : null }), [it.id]),
  onSetTargetUnit: (it, unit) => mutate(() => db.updateItem(client, it.id, { target_unit: unit || null }), [it.id]),
  onSetMatchKeywords: (it, v) => mutate(() => db.updateItem(client, it.id, { match_keywords: (v || "").trim() || null }), [it.id]),
  onSetExcludeKeywords: (it, v) => mutate(() => db.updateItem(client, it.id, { negative_keywords: (v || "").trim() || null }), [it.id]),
  onListMenu: (list) => {
    showSheet(list.name, [
      { label: "Rename list", onClick: () => showPrompt("Rename list", list.name, (v) => {
          const t = (v || "").trim();
          if (t && t !== list.name) handlers.onRenameList(list.id, t);
        }) },
      { label: "Duplicate list", onClick: () => handlers.onDuplicateList(list.id) },
      { label: "Save as template", onClick: () => handlers.onSaveTemplate(list.id) },
    ]);
  },
  onToggleHaptics: (bool) => {
    haptics = bool;
    try { localStorage.setItem("glHaptics", bool ? "1" : "0"); } catch { /* private mode */ }
    if (bool) haptic(12);
    refresh();
  },
  onSetMyStores: (arr) => {
    setMyStores(arr);
    try { localStorage.setItem("glMyStores", JSON.stringify(arr)); } catch { /* private mode */ }
    refresh();
  },
  // Autocomplete: debounced history lookup that updates ONLY the #suggest dropdown.
  // Must NOT call refresh()/renderListDetail — that would rebuild the add-bar input and drop focus/caret.
  onAddQuery: (text) => {
    clearTimeout(addQueryTimer);
    addQueryTimer = setTimeout(async () => {
      const rows = await db.recentItems(client, text);
      renderSuggestions(rows, handlers.onPickSuggestion);
    }, 200);
  },
  onPickSuggestion: (row) => {
    clearTimeout(addQueryTimer);
    mutate(() => db.addItem(client, state.listId,
      { name: row.name, amount: row.last_amount || "1", note: row.last_note || null, emoji: emojiOf(row.name) }));
  },
  onPickTheme: (key) => {
    prefs = { ...prefs, theme: key };
    savePrefs(prefs);
    applyTheme(resolveActive(prefs.theme, prefs.autoDark, mq.matches));
    refresh();                                        // re-render settings so the selected swatch updates
  },
  onToggleAutoDark: (bool) => {
    prefs = { ...prefs, autoDark: bool };
    savePrefs(prefs);
    applyTheme(resolveActive(prefs.theme, prefs.autoDark, mq.matches));
    refresh();
  },
  onPickFont: (key) => {
    prefs = { ...prefs, font: key };
    savePrefs(prefs); applyCustom(prefs); refresh();
  },
  onSetFontScale: (scale) => {
    prefs = { ...prefs, fontScale: scale };
    savePrefs(prefs); applyCustom(prefs); refresh();
  },
  onSetCustomColor: (kind, hex) => {          // kind: ac | tx | bg; hex or null to clear
    prefs = { ...prefs, colors: { ...prefs.colors, [kind]: hex || null } };
    savePrefs(prefs); applyCustom(prefs); refresh();
  },
  onResetCustom: () => {
    prefs = { ...prefs, font: "system", fontScale: 1, colors: {} };
    savePrefs(prefs); applyCustom(prefs); refresh();
  },
  onSignOut: async () => { await signOut(client); boot(); },
};

function subscribeRealtime() {
  client.removeAllChannels();       // drop any prior subscription so re-sign-in doesn't stack channels
  // Server-authoritative: any change refetches & replaces. Out-of-order events are inherently
  // safe (we always render the latest full fetch); own echoes are dropped via the pending set.
  const onChange = (p) => { if (!isSelfEcho(p.new || p.old, pending)) refresh(); };
  client.channel("db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, onChange)
    .subscribe();
  if (!netListenersBound) {
    netListenersBound = true;
    window.addEventListener("online", () => { setStatus(""); refresh(); });
    window.addEventListener("offline", () => setStatus("Reconnecting…"));
  }
}

async function boot() {
  const session = await currentSession(client);
  if (!session) { renderSignIn(app, async (email, pw) => { await signIn(client, email, pw); boot(); }); return; }
  await refresh();
  subscribeRealtime();
}
boot();
