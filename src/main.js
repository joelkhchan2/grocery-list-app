import { getClient } from "./supabase.js";
import { currentSession, signIn, signOut, renderSignIn } from "./auth.js";
import * as db from "./db.js";
import { renderLists, renderListDetail, renderSuggestions, renderAppearance, showUndo, showSheet } from "./ui.js";
import { loadPrefs, savePrefs, applyTheme, resolveActive } from "./theme.js";
import { isSelfEcho, idsToClear } from "./model.js";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const client = getClient();
const pending = new Set();          // REAL row ids of in-flight local mutations (self-echo suppression)
let state = { view: "lists", listId: null };
let lastLists = [];                 // most recent fetchLists result (for move-target + list menus)
let netListenersBound = false;      // guards against re-adding window online/offline listeners on re-boot

// Theme: apply saved prefs immediately (index.html already set data-theme pre-paint to avoid a flash;
// this keeps the JS state in sync and reacts to system dark-mode changes when auto-dark is on).
let prefs = loadPrefs();
const mq = matchMedia("(prefers-color-scheme: dark)");
applyTheme(resolveActive(prefs.theme, prefs.autoDark, mq.matches));
mq.addEventListener("change", () => {
  if (prefs.autoDark) applyTheme(resolveActive(prefs.theme, prefs.autoDark, mq.matches));
});

let addQueryTimer = null;           // debounce for autocomplete queries
let sortMode = "manual";            // per-device list sort/group: manual | alpha | store | category
try { sortMode = localStorage.getItem("glSort") || "manual"; } catch { /* private mode */ }
let haptics = true;                 // per-device: vibrate on check / drag (where supported)
try { haptics = localStorage.getItem("glHaptics") !== "0"; } catch { /* private mode */ }

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
    const usuals = await db.topItems(client).catch(() => []);
    renderListDetail(app, list, items, handlers, sortMode, usuals);
  }
}

const handlers = {
  onOpenList: (id) => { state = { view: "detail", listId: id }; refresh(); },
  onOpenSettings: () => { state = { view: "settings" }; refresh(); },
  onBack: () => { state = { view: "lists", listId: null }; refresh(); },
  onNewList: (name) => mutate(() => db.createList(client, { name })),
  onRenameList: (id, name) => mutate(() => db.renameList(client, id, name), [id]),
  onDeleteList: (id) => mutate(() => db.deleteList(client, id), [id]),
  onAddItem: (name) => {
    clearTimeout(addQueryTimer);
    mutate(() => db.addItem(client, state.listId, { name, amount: "1", note: null }));
  },
  onToggleCheck: (it) => { haptic(8); return mutate(() => db.updateItem(client, it.id, { checked: !it.checked }), [it.id]); },
  onToggleWatch: (it) => mutate(() => db.updateItem(client, it.id, { watch: !it.watch }), [it.id]),
  onAmount: (it, amount) => mutate(() => db.updateItem(client, it.id, { amount }), [it.id]),
  onEditAmount: (it, amount) => mutate(() => db.updateItem(client, it.id, { amount }), [it.id]),
  onEditItem: (it, name) => mutate(() => db.updateItem(client, it.id, { name }), [it.id]),
  onEditNote: (it, note) => mutate(() => db.updateItem(client, it.id, { note }), [it.id]),
  onSetStore: (it, store) => mutate(() => db.updateItem(client, it.id, { store }), [it.id]),
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
    const targets = lastLists.filter((l) => l.id !== state.listId && !l.is_template);
    if (!targets.length) { setStatus("No other list to move to."); return; }
    showSheet(`Move "${it.name}" to…`, targets.map((l) => ({
      label: (l.emoji ? l.emoji + " " : "") + l.name,
      onClick: () => handlers.onMoveItem(it, l.id),
    })));
  },
  onListMenu: (list) => {
    showSheet(list.name, [
      { label: "Rename list", onClick: () => {
          const next = prompt("Rename list", list.name);
          const t = next && next.trim();
          if (t && t !== list.name) handlers.onRenameList(list.id, t);
        } },
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
      { name: row.name, amount: row.last_amount || "1", note: row.last_note || null }));
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
