import { getClient } from "./supabase.js";
import { currentSession, signIn, signOut, renderSignIn } from "./auth.js";
import * as db from "./db.js";
import { renderLists, renderListDetail, renderDeals, renderSuggestions, renderAppearance, showUndo, showSheet, showPrompt, showEmojiPicker, setMyStores } from "./ui.js";
import { loadPrefs, savePrefs, applyTheme, applyCustom, resolveActive } from "./theme.js";
import { isSelfEcho, selfEchoKey, bySortOrder } from "./model.js";
import { emojiOf } from "./category.js";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const client = getClient();
const pending = new Set();          // REAL row ids of in-flight local mutations (self-echo suppression)
let state = { view: "lists", listId: null };
let lastLists = [];                 // most recent fetchLists result (for move-target + list menus)
let lastItems = [];                 // most recent list-detail items (also the optimistic in-memory copy)
let lastUsuals = [];                // cached "your usuals" so an optimistic re-render needs no fetch
let storeFilter = null;             // transient: filter list detail to one store (null = all)
let refocusAddBar = false;          // after an add, keep the add-bar focused so the keyboard stays open
let realtimeTimer = null;           // debounce for realtime-driven refreshes
let netListenersBound = false;      // guards against re-adding window online/offline listeners on re-boot
let navState = { view: "lists", listId: null };  // mirrors the current screen for history/back sync

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

// Register the returned rows' id@updated_at so the write's OWN realtime echo is suppressed
// (a partner's later edit to the same row has a different updated_at and still refreshes).
function markSelfEcho(rows) {
  const keys = [].concat(rows || []).filter(Boolean).map(selfEchoKey);
  keys.forEach(k => pending.add(k));
  setTimeout(() => keys.forEach(k => pending.delete(k)), 4000);   // realtime echo arrival window
}

// Foreground write: run it, then refresh from the server. Use for mutations whose result the
// UI can't cheaply predict (add, rename, move, reorder, list ops).
async function mutate(fn) {
  try {
    markSelfEcho(await fn());
    await refresh();
  } catch (e) {
    setStatus("Couldn't save — check your connection.");
    try { await refresh(); } catch {}                // revert optimistic view to server truth
  }
}

// Background write: the caller already updated in-memory state + re-rendered optimistically
// (instant), so on success we do NOT refetch; on failure we refetch to roll back.
async function mutateBg(fn) {
  try {
    markSelfEcho(await fn());
  } catch (e) {
    setStatus("Couldn't save — check your connection.");
    try { await refresh(); } catch {}
  }
}

// Re-render the current view from the IN-MEMORY copies (no network) — for optimistic updates.
function renderFromMemory() {
  if (state.view !== "detail") return;
  const list = lastLists.find(l => l.id === state.listId);
  if (list) renderListDetail(app, list, lastItems, handlers, sortMode, lastUsuals, storeFilter);
}

async function doRender() {
  if (state.view === "settings") {
    renderAppearance(app, { ...prefs, haptics }, handlers);   // no data fetch needed
    return;
  }
  if (state.view === "deals") {
    const deals = await db.fetchDeals(client).catch(() => []);
    renderDeals(app, deals, handlers);
    return;
  }
  if (state.view === "lists") {
    lastLists = await db.fetchLists(client);
    const deals = await db.fetchDeals(client).catch(() => []);
    const dealInfo = { count: deals.length, buyNow: deals.filter((d) => d.buy_now).length };
    renderLists(app, lastLists.filter(l => !l.is_template), lastLists.filter(l => l.is_template), handlers, dealInfo);
  } else {
    lastLists = await db.fetchLists(client);
    const list = lastLists.find(l => l.id === state.listId);
    if (!list) { state = { view: "lists", listId: null }; return doRender(); }
    lastItems = await db.fetchItems(client, state.listId);
    lastUsuals = await db.topItems(client).catch(() => []);
    renderListDetail(app, list, lastItems, handlers, sortMode, lastUsuals, storeFilter);
  }
}

// Full refresh = fetch + render, but preserve scroll position and (after an add) the add-bar
// focus, so a re-render doesn't snap to top or drop the keyboard.
async function refresh() {
  const y = window.scrollY;
  const prevView = state.view;
  await doRender();
  if (state.view === prevView) window.scrollTo(0, y);
  if (refocusAddBar) {
    refocusAddBar = false;
    if (state.view === "detail") { const inp = app.querySelector(".addbar input"); if (inp) inp.focus(); }
  }
}

// Don't clobber an active text input or an in-progress drag with a realtime refresh.
function isBusy() {
  const a = document.activeElement;
  const typing = a && app.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
  return !!typing || !!document.querySelector(".row.dragging");
}
// Coalesce bursts of realtime events (e.g. the weekly ~40-row deals rewrite) into one refresh,
// and hold off while the user is mid-edit/drag.
function scheduleRefresh() {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(() => {
    if (isBusy()) { scheduleRefresh(); return; }
    refresh();
  }, 300);
}

// Navigate to a screen and record it in browser history, so the Pixel/OS back button (and
// the in-app back button, via history.back()) step back one screen instead of exiting the app.
function pushView(view, listId = null) {
  navState = { view, listId };
  state = { view, listId };
  try { history.pushState({ gl: navState }, ""); } catch { /* history unavailable */ }
  refresh();
}

// Non-drag reorder fallback for action-sheet menus: given the id being moved, the
// current ordered id list, and an apply(newIds) callback, returns Move up/down options
// (omitting the one that isn't possible at an end). Keeps the drag handle and the menu
// in sync — same reorder path (apply) either way.
function moveOpts(id, orderedIds, apply) {
  const idx = orderedIds.indexOf(id);
  const opts = [];
  if (idx > 0) opts.push({ label: "⬆ Move up", onClick: () => {
    const a = orderedIds.slice(); [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; apply(a);
  } });
  if (idx >= 0 && idx < orderedIds.length - 1) opts.push({ label: "⬇ Move down", onClick: () => {
    const a = orderedIds.slice(); [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; apply(a);
  } });
  return opts;
}

const handlers = {
  onOpenList: (id) => { storeFilter = null; pushView("detail", id); },
  onSetStoreFilter: (v) => { storeFilter = v; refresh(); },
  onOpenSettings: () => pushView("settings"),
  onOpenDeals: () => pushView("deals"),
  onBack: () => { try { history.back(); } catch { state = { view: "lists", listId: null }; refresh(); } },
  onNewList: (name) => mutate(() => db.createList(client, { name })),
  onRenameList: (id, name) => mutate(() => db.renameList(client, id, name), [id]),
  onDeleteList: (id) => mutate(() => db.deleteList(client, id), [id]),
  onAddItem: (name) => {
    clearTimeout(addQueryTimer);
    refocusAddBar = true;                              // keep the keyboard up for the next item
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
  onToggleCheck: (it) => {
    haptic(8);
    const next = !it.checked;
    const t = lastItems.find(i => i.id === it.id);
    if (t) { t.checked = next; const y = window.scrollY; renderFromMemory(); window.scrollTo(0, y); }  // instant
    return mutateBg(() => db.updateItem(client, it.id, { checked: next }));
  },
  onToggleWatch: (it) => mutate(() => db.updateItem(client, it.id, { watch: !it.watch }), [it.id]),
  onAmount: (it, amount) => {
    const t = lastItems.find(i => i.id === it.id);
    if (t) { t.amount = amount; const y = window.scrollY; renderFromMemory(); window.scrollTo(0, y); }  // instant
    return mutateBg(() => db.updateItem(client, it.id, { amount }));
  },
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
  onClearChecked: (items) => {
    // `items` is the currently VISIBLE set (store-filtered by the caller). Only checked,
    // non-watch items are removed; offer a batch Undo.
    const removable = items.filter((i) => i.checked && !i.watch);
    if (!removable.length) return;
    mutate(() => db.clearChecked(client, items), removable.map((i) => i.id));
    showUndo(document.body, `${removable.length} item${removable.length === 1 ? "" : "s"}`,
      () => mutate(() => db.reinsertItems(client, removable)));
  },
  onCheckAll: (ids) => mutate(() => db.checkItems(client, ids, true), ids || []),
  onUncheckAll: (ids) => mutate(() => db.checkItems(client, ids, false), ids || []),
  onReorder: (ids) => mutate(() => db.reorderItems(client, ids), ids),
  onReorderLists: (ids) => mutate(() => db.reorderLists(client, ids), ids),
  onMoveItem: (it, listId) => mutate(() => db.moveItem(client, it.id, listId), [it.id]),
  onDuplicateList: (id) => mutate(() => db.duplicateList(client, id)),
  onSaveTemplate: (id) => mutate(() => db.saveAsTemplate(client, id)),
  onUseTemplate: (id) => mutate(() => db.useTemplate(client, id)),
  onItemMenu: (it) => {
    const opts = [{
      label: it.emoji ? `${it.emoji} Change emoji` : "😊 Add emoji",
      onClick: () => showEmojiPicker((e) => handlers.onSetItemEmoji(it, e), it.emoji),
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
      const ids = bySortOrder(lastItems.filter((i) => !i.checked)).map((i) => i.id);
      opts.push(...moveOpts(it.id, ids, handlers.onReorder));
    }
    showSheet(it.name, opts);
  },
  onWatchItemMenu: (it) => {
    const opts = [
      { label: it.emoji ? `${it.emoji} Change emoji` : "😊 Add emoji",
        onClick: () => showEmojiPicker((e) => handlers.onSetItemEmoji(it, e), it.emoji) },
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
    ];
    if (sortMode === "manual") {
      const ids = bySortOrder(lastItems.filter((i) => !i.checked)).map((i) => i.id);
      opts.push(...moveOpts(it.id, ids, handlers.onReorder));
    }
    showSheet(it.name, opts);
  },
  onSetWatchStores: (it, arr) => mutate(() => db.updateItem(client, it.id, { watch_stores: (arr && arr.length) ? arr.join(", ") : null }), [it.id]),
  onSetTargetUnit: (it, unit) => mutate(() => db.updateItem(client, it.id, { target_unit: unit || null }), [it.id]),
  onSetMatchKeywords: (it, v) => mutate(() => db.updateItem(client, it.id, { match_keywords: (v || "").trim() || null }), [it.id]),
  onSetExcludeKeywords: (it, v) => mutate(() => db.updateItem(client, it.id, { negative_keywords: (v || "").trim() || null }), [it.id]),
  onListMenu: (list) => {
    const opts = [
      { label: "Rename list", onClick: () => showPrompt("Rename list", list.name, (v) => {
          const t = (v || "").trim();
          if (t && t !== list.name) handlers.onRenameList(list.id, t);
        }) },
      { label: "Duplicate list", onClick: () => handlers.onDuplicateList(list.id) },
      { label: "Save as template", onClick: () => handlers.onSaveTemplate(list.id) },
    ];
    // Reorder fallback for lists (drag handle is the primary path). Lists are always
    // manually ordered, so this isn't gated on sortMode.
    if (!list.is_template) {
      const ids = lastLists.filter((l) => !l.is_template).map((l) => l.id);
      opts.push(...moveOpts(list.id, ids, handlers.onReorderLists));
    }
    showSheet(list.name, opts);
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
    refocusAddBar = true;
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
  const onChange = (p) => { if (!isSelfEcho(p.new || p.old, pending)) scheduleRefresh(); };
  client.channel("db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, onChange)
    // Deals only surface on the home view; ignore their (bulk, weekly) churn elsewhere.
    .on("postgres_changes", { event: "*", schema: "public", table: "deals" },
      () => { if (state.view === "lists") scheduleRefresh(); })
    .subscribe();
  if (!netListenersBound) {
    netListenersBound = true;
    window.addEventListener("online", () => { setStatus(""); refresh(); });
    window.addEventListener("offline", () => setStatus("Reconnecting…"));
  }
}

// OS/browser back button: if a sheet/dialog is open, back closes it (staying on the screen);
// otherwise step back to the previous screen from history instead of exiting the app.
window.addEventListener("popstate", (e) => {
  const overlay = document.querySelector(".emoji-overlay");
  if (overlay) {
    overlay.remove();
    try { history.pushState({ gl: navState }, ""); } catch { /* ignore */ }  // re-consume: stay put
    return;
  }
  navState = (e.state && e.state.gl) || { view: "lists", listId: null };
  state = { view: navState.view || "lists", listId: navState.listId || null };
  storeFilter = null;
  refresh();
});

async function boot() {
  const session = await currentSession(client);
  if (!session) { renderSignIn(app, async (email, pw) => { await signIn(client, email, pw); boot(); }); return; }
  await refresh();
  navState = { view: "lists", listId: null };
  try { history.replaceState({ gl: navState }, ""); } catch { /* ignore */ }
  subscribeRealtime();
}
boot();
