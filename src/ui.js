// ui.js — pure DOM render + event wiring. No Supabase here; all effects go through `handlers`.
// All user-provided text (list/item names, notes, amounts) is set via textContent / DOM APIs only —
// never interpolated into innerHTML.
import { bySortOrder, isNumericAmount, stepAmount } from "./model.js";
import { THEMES } from "./theme.js";
import { categoryOf, CATEGORY_ORDER } from "./category.js";
import { MEMBERS } from "../config.js";

// Tiny element helper. `text` is safe (textContent). Structural strings are author-controlled.
// `on` is a map of event → handler; `dataset`/`style` are shallow-assigned; any other key is an attribute.
function el(tag, opts = {}, ...kids) {
  const n = document.createElement(tag);
  const { class: cls, text, on, style, dataset, ...attrs } = opts;
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (style) Object.assign(n.style, style);
  if (dataset) Object.assign(n.dataset, dataset);
  if (on) for (const [k, v] of Object.entries(on)) n.addEventListener(k, v);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

function itemCountLabel(n) {
  return `${n} item${n === 1 ? "" : "s"}`;
}

// Monochrome inline-SVG icons (inherit color via currentColor). Path data is
// author-controlled (no user input), so innerHTML is safe here.
const ICONS = {
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
  back: '<polyline points="15 18 9 12 15 6"></polyline>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"></circle><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"></circle>',
  drag: '<circle cx="9" cy="5" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="9" cy="19" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="15" cy="5" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="15" cy="19" r="1.5" fill="currentColor" stroke="none"></circle>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
  close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
};

function icon(name, size = 22) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  svg.innerHTML = ICONS[name] || "";
  return svg;
}

// Store picker options: the household's usual stores first, then other common GTA stores.
let MY_STORES = ["No Frills", "FreshCo", "Walmart", "Real Canadian Superstore", "Food Basics"];
export const DEFAULT_MY_STORES = MY_STORES.slice();
export function setMyStores(arr) { if (Array.isArray(arr)) MY_STORES = arr.slice(); }
export function getMyStores() { return MY_STORES.slice(); }
const OTHER_STORES = ["Costco", "T&T", "Loblaws", "Metro", "Sobeys", "Longo's", "Farm Boy",
  "Fortinos", "Shoppers Drug Mart", "Adonis", "Btrust", "Bulk Barn", "Dollarama", "Whole Foods"];

// Tappable store chip → opens the styled store picker. Empty = no store set.
function buildStoreChip(item, handlers) {
  return el("button", {
    type: "button", class: item.store ? "store-chip set" : "store-chip",
    "aria-label": item.store ? `Store: ${item.store}` : "Set store",
    text: item.store ? `🛒 ${item.store}` : "🛒 Store",
    on: { click: () => showStorePicker(item.store || null, (s) => handlers.onSetStore(item, s)) },
  });
}

// Append collapsible <details> sections for pre-built groups to a container.
function appendGroups(listEl, groups, handlers) {
  for (const grp of groups) {
    const body = el("div", { class: "store-group-body" });
    for (const item of grp.items) body.append(buildItemRow(item, handlers));
    listEl.append(el("details", { class: "store-group", open: "" },
      el("summary", { class: "store-summary" },
        el("span", { text: grp.label }),
        el("span", { class: "store-count", text: String(grp.items.length) })),
      body));
  }
}

// Group items by category (built-in dictionary) in CATEGORY_ORDER order.
function groupActiveByCategory(items) {
  const byCat = new Map();
  for (const it of items) {
    const c = categoryOf(it.name);
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(it);
  }
  return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({ label: c, items: byCat.get(c) }));
}

// Group items by store for the "group by store" view. Returns ordered groups:
// the household's stores first (in MY_STORES order), then other known/custom
// stores (alphabetical), then a "No store" group last. Item order within a
// group is preserved (callers pass an already-sorted array).
function groupActiveByStore(items) {
  const byStore = new Map();
  for (const it of items) {
    const key = it.store || "";
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key).push(it);
  }
  const groups = [];
  for (const s of [...MY_STORES, ...OTHER_STORES]) {
    if (byStore.has(s)) { groups.push({ label: s, items: byStore.get(s) }); byStore.delete(s); }
  }
  for (const s of [...byStore.keys()].filter((k) => k !== "").sort()) {
    groups.push({ label: s, items: byStore.get(s) }); byStore.delete(s);
  }
  if (byStore.has("")) groups.push({ label: "No store", items: byStore.get("") });
  return groups;
}

// Emoji palette for lists. Tap opens a bottom sheet; picking calls onPick(emoji)
// and "Remove emoji" calls onPick(null).
const EMOJI_CHOICES = ["🛒", "🥦", "🍎", "🥕", "🥛", "🧀", "🍞", "🥩", "🐟", "🍗",
  "🍅", "🧅", "🥚", "🍌", "🍫", "🍪", "🥤", "☕", "🧻", "🧼", "🧴", "🐶", "🐱", "👶",
  "🎉", "🎂", "🏠", "📦", "🧊", "🌮", "🍕", "🍺"];

function showEmojiPicker(onPick) {
  const prev = document.querySelector(".emoji-overlay");
  if (prev) prev.remove();
  const grid = el("div", { class: "emoji-grid" });
  const overlay = el("div", { class: "emoji-overlay" });
  for (const e of EMOJI_CHOICES) {
    grid.append(el("button", {
      type: "button", class: "emoji-choice", text: e,
      on: { click: () => { overlay.remove(); onPick(e); } },
    }));
  }
  const sheet = el("div", { class: "emoji-sheet" },
    el("div", { class: "emoji-title", text: "Pick an emoji" }),
    grid,
    el("button", {
      type: "button", class: "emoji-clear", text: "Remove emoji",
      on: { click: () => { overlay.remove(); onPick(null); } },
    }));
  overlay.append(sheet);
  overlay.addEventListener("click", (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// Generic bottom-sheet menu. options = [{ label, danger?, onClick }].
export function showSheet(title, options) {
  const prev = document.querySelector(".emoji-overlay");
  if (prev) prev.remove();
  const overlay = el("div", { class: "emoji-overlay" });
  const opts = el("div", { class: "sheet-options" });
  for (const o of options) {
    opts.append(el("button", {
      type: "button", class: o.danger ? "sheet-option danger" : "sheet-option", text: o.label,
      on: { click: () => { overlay.remove(); o.onClick(); } },
    }));
  }
  overlay.append(el("div", { class: "emoji-sheet" },
    el("div", { class: "emoji-title", text: title }),
    opts,
    el("button", { type: "button", class: "emoji-clear", text: "Cancel", on: { click: () => overlay.remove() } })));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// Styled text-input dialog (replaces native prompt). onSubmit(value) on Save.
export function showPrompt(title, value, onSubmit, { placeholder = "" } = {}) {
  const prev = document.querySelector(".emoji-overlay");
  if (prev) prev.remove();
  const overlay = el("div", { class: "emoji-overlay" });
  const input = el("input", { type: "text", class: "prompt-input", value: value || "", placeholder });
  const form = el("form", { class: "emoji-sheet" },
    el("div", { class: "emoji-title", text: title }),
    input,
    el("div", { class: "prompt-actions" },
      el("button", { type: "button", class: "prompt-cancel", text: "Cancel", on: { click: () => overlay.remove() } }),
      el("button", { type: "submit", class: "prompt-save", text: "Save" })));
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; overlay.remove(); onSubmit(v); });
  overlay.append(form);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

// Styled confirm dialog (replaces native confirm). onConfirm() on the danger action.
export function showConfirm(title, message, onConfirm, { confirmLabel = "Delete" } = {}) {
  const prev = document.querySelector(".emoji-overlay");
  if (prev) prev.remove();
  const overlay = el("div", { class: "emoji-overlay" });
  overlay.append(el("div", { class: "emoji-sheet" },
    el("div", { class: "emoji-title", text: title }),
    message ? el("p", { class: "confirm-msg", text: message }) : null,
    el("div", { class: "prompt-actions" },
      el("button", { type: "button", class: "prompt-cancel", text: "Cancel", on: { click: () => overlay.remove() } }),
      el("button", { type: "button", class: "prompt-save danger", text: confirmLabel,
        on: { click: () => { overlay.remove(); onConfirm(); } } }))));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// Inline edit: swap a display element for a text input in place. Commits on
// Enter/blur (only when changed), restores on Escape / no-change. A committing
// change triggers a re-render that replaces the whole row.
function inlineEdit(displayEl, value, commit, { placeholder = "" } = {}) {
  const orig = value == null ? "" : String(value);
  const input = el("input", { type: "text", class: "inline-input", value: orig, placeholder });
  let closed = false;
  const close = (save) => {
    if (closed) return;
    closed = true;
    if (save && input.value.trim() !== orig.trim()) commit(input.value);
    else input.replaceWith(displayEl);          // no change / cancel → restore display
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); close(true); }
    else if (e.key === "Escape") { e.preventDefault(); close(false); }
  });
  input.addEventListener("blur", () => close(true));
  displayEl.replaceWith(input);
  input.focus();
  input.select();
}

// Styled store picker (replaces the native <select>): My stores group, then Other.
function showStorePicker(current, onPick) {
  const prev = document.querySelector(".emoji-overlay");
  if (prev) prev.remove();
  const overlay = el("div", { class: "emoji-overlay" });
  const body = el("div", { class: "store-picker" });
  const group = (label, stores) => {
    body.append(el("div", { class: "store-group-label", text: label }));
    for (const s of stores) {
      body.append(el("button", {
        type: "button", class: s === current ? "store-opt on" : "store-opt", text: s,
        on: { click: () => { overlay.remove(); onPick(s); } },
      }));
    }
  };
  group("My stores", MY_STORES);
  group("Other stores", OTHER_STORES);
  overlay.append(el("div", { class: "emoji-sheet" },
    el("div", { class: "emoji-title", text: "Store" }),
    body,
    el("button", {
      type: "button", class: "emoji-clear", text: current ? "Remove store" : "Cancel",
      on: { click: () => { overlay.remove(); if (current) onPick(null); } },
    })));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// Drag-to-reorder via a per-row handle. Rows are the direct children of `zone`,
// each with data-id and a `.drag-handle` child. Dragging only starts from the
// handle (which has touch-action:none in CSS), so it never fights list scrolling
// or the row's swipe-to-delete. On drop, calls onReorder(idsInNewOrder) if changed.
function enableHandleReorder(zone, onReorder) {
  let dragEl = null;
  let startY = 0;            // pointer Y that maps to the dragged row's resting position
  let startOrder = [];

  const rowsWithId = () => [...zone.children].filter((c) => c.dataset && c.dataset.id);
  const settle = () => rowsWithId().forEach((r) => { r.style.transition = ""; r.style.transform = ""; });

  zone.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle || !zone.contains(handle)) return;
    const row = handle.closest("[data-id]");
    if (!row) return;
    e.preventDefault();
    dragEl = row;
    startY = e.clientY;
    startOrder = rowsWithId().map((r) => r.dataset.id);
    row.classList.add("dragging");
    try { handle.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    if (window.__glHaptic) window.__glHaptic(12);
  });

  zone.addEventListener("pointermove", (e) => {
    if (!dragEl) return;
    e.preventDefault();
    dragEl.style.transform = `translateY(${e.clientY - startY}px)`;

    // Which sibling should the dragged row now sit before? (null = drop at the end)
    const siblings = rowsWithId().filter((r) => r !== dragEl);
    let insertBefore = null;
    for (const r of siblings) {
      const rect = r.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) { insertBefore = r; break; }
    }
    if (insertBefore === dragEl.nextElementSibling) return;   // already in place

    // FLIP: record neighbour positions, move the dragged node, then animate the
    // displaced rows from their old spot to the new one so the gap opens smoothly.
    const firstTops = new Map(siblings.map((r) => [r, r.getBoundingClientRect().top]));
    const visualTop = dragEl.getBoundingClientRect().top;     // includes the finger offset
    zone.insertBefore(dragEl, insertBefore);
    dragEl.style.transform = "";
    const layoutTop = dragEl.getBoundingClientRect().top;     // new resting position
    startY = e.clientY - (visualTop - layoutTop);             // keep it under the finger (no jump)
    dragEl.style.transform = `translateY(${e.clientY - startY}px)`;

    for (const r of siblings) {
      const delta = firstTops.get(r) - r.getBoundingClientRect().top;
      if (!delta) continue;
      r.style.transition = "none";
      r.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        r.style.transition = "transform 160ms ease";
        r.style.transform = "";
      });
    }
  });

  const finish = () => {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    dragEl = null;
    const order = rowsWithId().map((r) => r.dataset.id);   // DOM already reflects the new order
    settle();
    if (order.join() !== startOrder.join()) onReorder(order);
  };

  zone.addEventListener("pointerup", finish);
  zone.addEventListener("pointercancel", () => {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    dragEl = null;
    // Cancelled mid-drag: restore the original DOM order, commit nothing.
    const byId = new Map(rowsWithId().map((r) => [r.dataset.id, r]));
    startOrder.forEach((id) => { const r = byId.get(id); if (r) zone.appendChild(r); });
    settle();
  });
}

// ── Lists home ─────────────────────────────────────────────────────────────
export function renderLists(mount, lists, templates, handlers) {
  mount.textContent = "";

  mount.append(el("div", { class: "bar" },
    el("h1", { text: "Our Grocery Lists" }),
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Settings",
      on: { click: () => handlers.onOpenSettings() },
    }, icon("settings"))));

  const listEl = el("div", { class: "list" });
  if (!lists.length) {
    listEl.append(el("p", { class: "muted", text: "No lists yet — create one below" }));
  } else {
    const zone = el("div", { class: "reorder-zone" });
    for (const list of bySortOrder(lists)) {
      const main = el("div", {
        class: "row-main tappable",
        on: { click: () => handlers.onOpenList(list.id) },
      });
      main.append(el("span", {
        class: "drag-handle", "aria-hidden": "true",
        on: { click: (e) => e.stopPropagation() },
      }, icon("drag", 20)));
      main.append(el("button", {
        type: "button", class: list.emoji ? "emoji-btn" : "emoji-btn placeholder",
        "aria-label": list.emoji ? "Change list emoji" : "Add list emoji", text: list.emoji || "＋",
        on: {
          click: (e) => {
            e.stopPropagation();
            showEmojiPicker((emoji) => handlers.onSetListEmoji(list.id, emoji));
          },
        },
      }));
      main.append(el("div", { class: "row-text" }, el("span", { class: "name", text: list.name })));

      // Watch lists show a 🎯 count ("watching N"); shopping lists show checked / total.
      if (list.is_watchlist) {
        main.append(el("span", {
          class: "count watch-count", "aria-label": "items watched",
          text: `🎯 ${list.item_count || 0}`,
        }));
      } else if (typeof list.item_count === "number" && list.item_count > 0) {
        main.append(el("span", {
          class: "count", "aria-label": "checked of total items",
          text: `${list.checked_count || 0}/${list.item_count}`,
        }));
      }

      // List actions menu (rename / duplicate / …). Stops propagation so it doesn't open the list.
      main.append(el("button", {
        type: "button", class: "icon-btn", "aria-label": "List actions",
        on: { click: (e) => { e.stopPropagation(); handlers.onListMenu(list); } },
      }, icon("more")));

      // Red delete panel (revealed by left-swipe). List deletion cascades its items → styled confirm.
      const del = el("button", {
        type: "button", class: "row-delete", text: "Delete",
        on: {
          click: () => showConfirm(`Delete "${list.name}"?`, "Its items will be removed too.",
            () => handlers.onDeleteList(list.id)),
        },
      });

      zone.append(el("div", { class: "row", dataset: { id: list.id } }, main, del));
    }
    listEl.append(zone);
    enableHandleReorder(zone, (ids) => handlers.onReorderLists(ids));
  }

  // Templates section: tap "Use" to spin up a fresh copy as a normal list.
  if (templates && templates.length) {
    const tbody = el("div", { class: "store-group-body" });
    for (const t of templates) {
      const main = el("div", { class: "row-main" },
        el("span", { class: "emoji-btn", text: t.emoji || "📋" }),
        el("div", { class: "row-text" }, el("span", { class: "name", text: t.name })),
        el("button", {
          type: "button", class: "bulk-btn", text: "Use",
          on: { click: () => handlers.onUseTemplate(t.id) },
        }));
      const del = el("button", {
        type: "button", class: "row-delete", text: "Delete",
        on: { click: () => showConfirm(`Delete template "${t.name}"?`, "", () => handlers.onDeleteList(t.id)) },
      });
      tbody.append(el("div", { class: "row", dataset: { id: t.id } }, main, del));
    }
    listEl.append(el("details", { class: "store-group", open: "" },
      el("summary", { class: "store-summary" }, el("span", { text: `Templates · ${templates.length}` })),
      tbody));
  }
  // Secondary action: create a Watches list (standing "alert me under $X" items).
  listEl.append(el("button", {
    type: "button", class: "new-watchlist-btn", text: "🎯 New watch list",
    on: {
      click: () => showPrompt("Name your watch list", "Watches", (v) => {
        const t = (v || "").trim();
        if (t) handlers.onNewWatchList(t);
      }),
    },
  }));
  mount.append(listEl);

  mount.append(makeAddBar("New list…", "＋ New list", {
    onSubmit: (name) => handlers.onNewList(name),
  }));
}

// ── List detail ─────────────────────────────────────────────────────────────
export function renderListDetail(mount, list, items, handlers, sortMode = "manual", usuals = [], storeFilter = null) {
  mount.textContent = "";

  mount.append(el("div", { class: "bar" },
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Back",
      on: { click: () => handlers.onBack() },
    }, icon("back")),
    el("h1", { text: list.name }),
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Settings",
      on: { click: () => handlers.onOpenSettings() },
    }, icon("settings"))));

  // Watch list: a distinct, simpler view — no checkboxes/steppers/clear; each row is a
  // standing "alert me under $X" watch. Same frame, watch-native rows.
  if (list.is_watchlist) {
    const watchEl = el("div", { class: "list" });
    if (!items.length) {
      watchEl.append(el("p", { class: "muted",
        text: "No watches yet — add one below and set a price to get alerted when a store hits it." }));
    } else {
      const zone = el("div", { class: "reorder-zone" });
      for (const item of bySortOrder(items)) zone.append(buildWatchRow(item, handlers));
      watchEl.append(zone);
      enableHandleReorder(zone, (ids) => handlers.onReorder(ids));
    }
    mount.append(watchEl);
    mount.append(makeAddBar("Add a watch…", "＋", {
      onSubmit: (name) => handlers.onAddWatchItem(name),
    }));
    return;
  }

  const listEl = el("div", { class: "list" });
  if (!items.length) {
    listEl.append(el("p", { class: "muted", text: "This list is empty — add an item below" }));
  } else {
    // Store filter (null = all stores; "" = items with no store; else a store name).
    const inStore = (i) => storeFilter == null || (storeFilter === "" ? !i.store : i.store === storeFilter);
    const active = items.filter((i) => !i.checked && inStore(i));
    const done = items.filter((i) => i.checked && inStore(i));
    const storesPresent = [...new Set(items.map((i) => i.store).filter(Boolean))].sort();
    const hasNoStore = items.some((i) => !i.store);

    // Controls: sort/group selector + client-side filter box.
    const sortSel = el("select", { class: "sort-select", "aria-label": "Sort" },
      el("option", { value: "manual", text: "Manual order" }),
      el("option", { value: "alpha", text: "A–Z" }),
      el("option", { value: "store", text: "By store" }),
      el("option", { value: "category", text: "By category" }));
    sortSel.value = sortMode;
    sortSel.addEventListener("change", () => handlers.onSetSort(sortSel.value));

    const filter = el("input", {
      type: "search", class: "filter-input", placeholder: "Filter items…", "aria-label": "Filter items",
    });
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      for (const row of listEl.querySelectorAll(".row")) {
        row.classList.toggle("filtered-out", q !== "" && !(row.dataset.name || "").includes(q));
      }
      for (const grp of listEl.querySelectorAll(".store-group")) {
        const anyVisible = [...grp.querySelectorAll(".row")].some((r) => !r.classList.contains("filtered-out"));
        grp.classList.toggle("filtered-out", !anyVisible);
      }
    });
    listEl.append(el("div", { class: "list-controls" }, sortSel, filter));

    // Store filter chips — only when items span 2+ store buckets. Filters to one store.
    if (storesPresent.length + (hasNoStore ? 1 : 0) >= 2) {
      const chips = el("div", { class: "store-filter" });
      const chip = (label, val) => el("button", {
        type: "button", class: storeFilter === val ? "sf-chip on" : "sf-chip", text: label,
        on: { click: () => handlers.onSetStoreFilter(val) },
      });
      chips.append(chip("All", null));
      for (const s of storesPresent) chips.append(chip(s, s));
      if (hasNoStore) chips.append(chip("No store", ""));
      listEl.append(chips);
    }

    // Bulk actions: check all active items / uncheck all done items.
    const bulk = el("div", { class: "bulk-actions" });
    if (active.length) {
      bulk.append(el("button", {
        type: "button", class: "bulk-btn", text: "Check all",
        on: { click: () => handlers.onCheckAll() },
      }));
    }
    if (done.length) {
      bulk.append(el("button", {
        type: "button", class: "bulk-btn", text: "Uncheck all",
        on: { click: () => handlers.onUncheckAll() },
      }));
    }
    if (bulk.children.length) listEl.append(bulk);

    // Active items, per sort mode. Manual mode allows drag-to-reorder via the handle.
    if (sortMode === "store") {
      appendGroups(listEl, groupActiveByStore(bySortOrder(active)), handlers);
    } else if (sortMode === "category") {
      appendGroups(listEl, groupActiveByCategory(bySortOrder(active)), handlers);
    } else if (sortMode === "alpha") {
      const ordered = [...active].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      for (const item of ordered) listEl.append(buildItemRow(item, handlers));
    } else {
      const zone = el("div", { class: "reorder-zone" });
      for (const item of bySortOrder(active)) zone.append(buildItemRow(item, handlers, { drag: true }));
      listEl.append(zone);
      enableHandleReorder(zone, (ids) => handlers.onReorder(ids));
    }

    if (done.length) {
      // Collapsible: tap the header to show/hide checked items; tap a checked
      // item's box to un-check it back onto the list. Open by default.
      const body = el("div", { class: "store-group-body" });
      for (const item of done) body.append(buildItemRow(item, handlers));
      listEl.append(el("details", { class: "store-group done-group", open: "" },
        el("summary", { class: "store-summary" },
          el("span", { text: `Done · ${done.length}` }),
          el("button", {
            type: "button", class: "clear-checked", text: "Clear checked",
            on: {
              click: (e) => { e.preventDefault(); e.stopPropagation(); handlers.onClearChecked(items); },
            },
          })),
        body));
    }
  }
  // "Your usuals" — quick-add chips from history, excluding items already on this list.
  const present = new Set(items.map((i) => String(i.name).toLowerCase()));
  const chips = (usuals || []).filter((u) => !present.has(String(u.name).toLowerCase())).slice(0, 10);
  if (chips.length) {
    const row = el("div", { class: "usuals" });
    for (const u of chips) {
      row.append(el("button", {
        type: "button", class: "usual-chip", text: `＋ ${u.name}`,
        on: { click: () => handlers.onPickSuggestion(u) },
      }));
    }
    listEl.append(el("div", { class: "usuals-wrap" },
      el("div", { class: "usuals-label", text: "Your usuals" }), row));
  }
  // One-time swipe hint (per session, motion-safe): briefly reveal the first row's
  // delete panel so users discover swipe-to-delete, then snap back.
  try {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && !sessionStorage.getItem("gl-swipe-hinted")) {
      const firstRow = listEl.querySelector(".row");
      if (firstRow && firstRow.scrollTo) {
        sessionStorage.setItem("gl-swipe-hinted", "1");
        setTimeout(() => {
          firstRow.scrollTo({ left: 46, behavior: "smooth" });
          setTimeout(() => firstRow.scrollTo({ left: 0, behavior: "smooth" }), 650);
        }, 450);
      }
    }
  } catch { /* no sessionStorage / scrollTo */ }

  mount.append(listEl);

  mount.append(makeAddBar("Add item…", "＋", {
    withSuggest: true,
    onInput: (value) => handlers.onAddQuery(value),
    onSubmit: (name) => handlers.onAddItem(name),
  }));
}

// One swipe-to-delete row: .row → .row-main (100% wide) + .row-delete (revealed on left-swipe).
function buildItemRow(item, handlers, opts = {}) {
  // Delete is immediate + undoable (the Undo bar restores it, watch flag included),
  // so no confirm dialog is needed on a single item.
  const del = el("button", {
    type: "button", class: "row-delete", text: "Delete",
    on: { click: () => handlers.onDeleteItem(item) },
  });

  // Done row: minimal — just checkbox + struck name (+ swipe delete). Tap the box to un-check.
  if (item.checked) {
    const doneMain = el("div", { class: "row-main" },
      el("button", {
        type: "button", class: "box on", "aria-label": "Uncheck", "aria-pressed": "true",
        on: { click: () => handlers.onToggleCheck(item) },
      }),
      el("div", { class: "row-text" }, el("span", { class: "name", text: item.name })));
    return el("div", {
      class: "row done", dataset: { name: String(item.name || "").toLowerCase(), id: item.id },
    }, doneMain, del);
  }

  const main = el("div", { class: "row-main" });

  // Decorative drag handle (Manual sort). aria-hidden — the accessible reorder path
  // is Move up / Move down in the ⋯ menu.
  if (opts.drag) main.append(el("span", { class: "drag-handle", "aria-hidden": "true" }, icon("drag", 20)));

  // Checkbox — checked ✓ is drawn solely by CSS `.box.on::after`.
  main.append(el("button", {
    type: "button", class: "box", "aria-label": "Check off", "aria-pressed": "false",
    on: { click: () => handlers.onToggleCheck(item) },
  }));

  // Name gets its own line so it stays readable; the amount control + meta chips sit on
  // line 2, and the note (if any) on line 3. The ⋯ menu is the only right-column control.
  const text = el("div", { class: "row-text" },
    el("span", {
      class: "name", text: item.name,
      on: {
        click: (e) => inlineEdit(e.currentTarget, item.name, (v) => {
          const t = (v || "").trim();
          if (t && t !== item.name) handlers.onEditItem(item, t);
        }),
      },
    }));

  // Amount control — numeric gets a −/value/+ stepper (value tappable for free text);
  // a non-numeric amount is tap-to-edit text. Lives on line 2, right-aligned.
  let amountCtl;
  if (isNumericAmount(item.amount)) {
    amountCtl = el("div", { class: "stepper" },
      el("button", { type: "button", class: "step", "aria-label": "Fewer", text: "−",
        on: { click: () => handlers.onAmount(item, stepAmount(item.amount, -1)) } }),
      el("span", { class: "amount editable", text: String(item.amount).trim(), "aria-label": "Edit amount",
        on: { click: (e) => inlineEdit(e.currentTarget, item.amount, (v) => { const t = v.trim(); if (t && t !== String(item.amount).trim()) handlers.onEditAmount(item, t); }, { placeholder: "e.g. 500 g" }) } }),
      el("button", { type: "button", class: "step", "aria-label": "More", text: "+",
        on: { click: () => handlers.onAmount(item, stepAmount(item.amount, +1)) } }));
  } else {
    amountCtl = el("span", { class: "amount editable", text: item.amount || "", "aria-label": "Edit amount",
      on: { click: (e) => inlineEdit(e.currentTarget, item.amount, (v) => { const t = v.trim(); if (t && t !== String(item.amount || "").trim()) handlers.onEditAmount(item, t); }, { placeholder: "e.g. 500 g" }) } });
  }

  // Line 2: who · flags · store chip kept together (badge never orphans) on the left,
  // amount on the right.
  const primary = el("div", { class: "meta-primary" });
  const who = item.created_by && MEMBERS[item.created_by];
  if (who) {
    primary.append(el("span", {
      class: "who", "aria-label": `Added by ${who.initial}`, title: `Added by ${who.initial}`,
      text: who.initial, style: { background: who.color },
    }));
  }
  if (item.watch) primary.append(el("span", { class: "watch-flag" }, icon("bell", 14), document.createTextNode(" watch")));
  if (item.target_price != null) {
    primary.append(el("span", { class: "target-flag",
      text: `🎯 ≤ $${Number(item.target_price).toFixed(2)}`,
      title: "Deal-price alert target" }));
  }
  primary.append(buildStoreChip(item, handlers));
  text.append(el("div", { class: "meta-line" }, primary));   // line 2: store + flags, full width

  // Line 3: note (left, truncates if long) + amount control (right).
  const noteEl = item.note
    ? el("span", { class: "note", text: item.note,
        on: { click: (e) => inlineEdit(e.currentTarget, item.note, (v) => handlers.onEditNote(item, v.trim() || null)) } })
    : el("button", { type: "button", class: "add-note", text: "+ note",
        on: { click: (e) => inlineEdit(e.currentTarget, "", (v) => { const t = v.trim(); if (t) handlers.onEditNote(item, t); }, { placeholder: "note" }) } });
  text.append(el("div", { class: "row-line2" }, noteEl, amountCtl));
  main.append(text);

  // Overflow menu (watch toggle · target price · move to list · reorder). Keeps the row uncluttered.
  main.append(el("button", {
    type: "button", class: "icon-btn", "aria-label": "Item actions",
    on: { click: () => handlers.onItemMenu(item) },
  }, icon("more")));

  return el("div", {
    class: "row", dataset: { name: String(item.name || "").toLowerCase(), id: item.id },
  }, main, del);
}

// A watch row: name + target-price chip + store chip. No checkbox/stepper (a watch is
// never "bought"); the ⋯ menu holds pause/resume + set price. Swipe-to-delete like other rows.
function buildWatchRow(item, handlers) {
  const del = el("button", {
    type: "button", class: "row-delete", text: "Delete",
    on: { click: () => handlers.onDeleteItem(item) },
  });
  const main = el("div", { class: "row-main" });
  main.append(el("span", { class: "drag-handle", "aria-hidden": "true" }, icon("drag", 20)));

  const text = el("div", { class: "row-text" },
    el("span", {
      class: item.watch ? "name" : "name paused", text: item.name,
      on: {
        click: (e) => inlineEdit(e.currentTarget, item.name, (v) => {
          const t = (v || "").trim();
          if (t && t !== item.name) handlers.onEditItem(item, t);
        }),
      },
    }));

  const targetChip = el("button", {
    type: "button", class: item.target_price != null ? "target-chip set" : "target-chip",
    text: item.target_price != null ? `🎯 ≤ $${Number(item.target_price).toFixed(2)}` : "🎯 Set price",
    "aria-label": "Set deal price",
    on: {
      click: () => showPrompt("Alert me at or under ($)",
        item.target_price != null ? String(item.target_price) : "",
        (v) => handlers.onSetTargetPrice(item, v), { placeholder: "e.g. 4.00 — blank to clear" }),
    },
  });
  text.append(el("div", { class: "meta-line" }, targetChip, buildStoreChip(item, handlers)));
  if (!item.watch) text.append(el("span", { class: "note", text: "paused — not alerting" }));
  main.append(text);

  main.append(el("button", {
    type: "button", class: "icon-btn", "aria-label": "Watch actions",
    on: { click: () => handlers.onWatchItemMenu(item) },
  }, icon("more")));

  return el("div", {
    class: "row", dataset: { name: String(item.name || "").toLowerCase(), id: item.id },
  }, main, del);
}

// Sticky bottom add-bar. When `withSuggest`, embeds a persistent #suggest dropdown container
// that renderSuggestions() targets directly (so the <input> element — and its focus/caret —
// survive suggestion updates while typing).
function makeAddBar(placeholder, buttonLabel, { onSubmit, onInput, withSuggest } = {}) {
  const input = el("input", { type: "text", placeholder, "aria-label": placeholder });
  const form = el("form", { class: "addbar" });

  if (withSuggest) form.append(el("div", { id: "suggest", class: "suggest", hidden: "" }));
  form.append(input, el("button", { type: "submit", text: buttonLabel }));

  if (onInput) input.addEventListener("input", () => onInput(input.value));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    input.value = "";
    clearSuggest();
    onSubmit(name);
  });
  return form;
}

function clearSuggest() {
  const box = document.getElementById("suggest");
  if (!box) return;
  box.textContent = "";
  box.hidden = true;
}

// ── Autocomplete suggestions ─────────────────────────────────────────────────
// Updates ONLY the #suggest dropdown node. NEVER re-renders the list/detail view,
// so the add-bar input keeps focus and caret while the user types. Empty rows clears it.
export function renderSuggestions(rows, onPick) {
  const box = document.getElementById("suggest");
  if (!box) return;
  box.textContent = "";
  if (!rows || !rows.length) {
    box.hidden = true;
    return;
  }
  for (const row of rows) {
    const item = el("button", {
      type: "button", class: "suggest-item",
      on: { click: () => onPick(row) },
    }, el("span", { class: "name", text: row.name }));
    if (row.last_amount != null && String(row.last_amount).trim() !== "") {
      item.append(el("span", { class: "count", text: String(row.last_amount) }));
    }
    box.append(item);
  }
  box.hidden = false;
}

// ── Appearance / settings ─────────────────────────────────────────────────────
export function renderAppearance(mount, prefs, handlers) {
  mount.textContent = "";

  mount.append(el("div", { class: "bar" },
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Back",
      on: { click: () => handlers.onBack() },
    }, icon("back")),
    el("h1", { text: "Appearance" })));

  const settings = el("div", { class: "settings" });

  settings.append(el("span", { class: "settings-label", text: "Theme" }));
  const grid = el("div", { class: "swatch-grid" });
  for (const theme of THEMES) {
    // data-theme lets the swatch self-preview its own palette (var(--bg)/--ac resolve inside it).
    const swatch = el("button", {
      type: "button",
      class: theme.key === prefs.theme ? "swatch selected" : "swatch",
      dataset: { theme: theme.key },
      "aria-pressed": String(theme.key === prefs.theme),
      on: { click: () => handlers.onPickTheme(theme.key) },
    },
      el("span", { class: "swatch-name", text: theme.label }),
      el("span", { class: "swatch-chips" },
        el("span", { class: "swatch-chip" }),
        el("span", { class: "swatch-chip two" })));
    grid.append(swatch);
  }
  settings.append(grid);

  settings.append(el("div", { class: "toggle-row" },
    el("span", { class: "label", text: "Match system light/dark" }),
    el("button", {
      type: "button",
      class: prefs.autoDark ? "toggle on" : "toggle",
      role: "switch", "aria-checked": String(!!prefs.autoDark), "aria-label": "Match system light/dark",
      on: { click: () => handlers.onToggleAutoDark(!prefs.autoDark) },
    })));

  settings.append(el("div", { class: "toggle-row" },
    el("span", { class: "label", text: "Haptic feedback" }),
    el("button", {
      type: "button",
      class: prefs.haptics ? "toggle on" : "toggle",
      role: "switch", "aria-checked": String(!!prefs.haptics), "aria-label": "Haptic feedback",
      on: { click: () => handlers.onToggleHaptics(!prefs.haptics) },
    })));

  // My stores — customize the list shown first in each item's store picker.
  settings.append(el("span", { class: "settings-label", text: "My stores" }));
  const storeEdit = el("div", { class: "store-edit" });
  for (const s of getMyStores()) {
    storeEdit.append(el("div", { class: "store-edit-row" },
      el("span", { class: "grow", text: s }),
      el("button", {
        type: "button", class: "icon-btn danger", "aria-label": `Remove ${s}`,
        on: { click: () => handlers.onSetMyStores(getMyStores().filter((x) => x !== s)) },
      }, icon("close", 18))));
  }
  const addInput = el("input", { type: "text", class: "prompt-input", placeholder: "Add a store" });
  const addForm = el("form", { class: "store-add" }, addInput,
    el("button", { type: "submit", class: "prompt-save", text: "Add" }));
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = addInput.value.trim();
    if (v && !getMyStores().includes(v)) handlers.onSetMyStores([...getMyStores(), v]);
  });
  storeEdit.append(addForm);
  settings.append(storeEdit);

  settings.append(el("button", {
    type: "button", class: "signout", text: "Sign out",
    on: { click: () => handlers.onSignOut() },
  }));

  mount.append(settings);
}

// ── Undo toast ────────────────────────────────────────────────────────────────
let undoTimer = null;
export function showUndo(mount, label, onUndo) {
  // Clear any prior undo bar + timer so toasts never stack.
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  document.querySelectorAll(".undo").forEach((n) => n.remove());

  const dismiss = () => {
    if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
    bar.remove();
  };

  const bar = el("div", { class: "undo" },
    el("span", {}, document.createTextNode("Deleted "),
      el("span", { class: "name", text: `‘${label}’` }),
      document.createTextNode(" — ")),
    el("button", {
      type: "button", text: "Undo",
      on: { click: () => { dismiss(); onUndo(); } },
    }));

  document.body.append(bar);
  undoTimer = setTimeout(dismiss, 5000);
}
