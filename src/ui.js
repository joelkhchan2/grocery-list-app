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

// Store picker options: the household's usual stores first, then other common GTA stores.
const MY_STORES = ["No Frills", "FreshCo", "Walmart", "Real Canadian Superstore", "Food Basics"];
const OTHER_STORES = ["Costco", "T&T", "Loblaws", "Metro", "Sobeys", "Longo's", "Farm Boy",
  "Fortinos", "Shoppers Drug Mart", "Adonis", "Btrust", "Bulk Barn", "Dollarama", "Whole Foods"];

// A native <select> for the item's store (real mobile picker). Empty = no store set.
function buildStoreSelect(item, handlers) {
  const mine = el("optgroup", { label: "My stores" });
  for (const s of MY_STORES) mine.append(el("option", { value: s, text: s }));
  const other = el("optgroup", { label: "Other stores" });
  for (const s of OTHER_STORES) other.append(el("option", { value: s, text: s }));
  const sel = el("select",
    { class: item.store ? "store-select set" : "store-select", "aria-label": "Store" },
    el("option", { value: "", text: "🛒 Store" }), mine, other);
  // Include an option for a legacy value not in the lists, so it still displays.
  if (item.store && !MY_STORES.includes(item.store) && !OTHER_STORES.includes(item.store)) {
    sel.append(el("option", { value: item.store, text: item.store }));
  }
  sel.value = item.store || "";
  sel.addEventListener("change", () => handlers.onSetStore(item, sel.value || null));
  return sel;
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

// Drag-to-reorder via a per-row handle. Rows are the direct children of `zone`,
// each with data-id and a `.drag-handle` child. Dragging only starts from the
// handle (which has touch-action:none in CSS), so it never fights list scrolling
// or the row's swipe-to-delete. On drop, calls onReorder(idsInNewOrder) if changed.
function enableHandleReorder(zone, onReorder) {
  let dragEl = null;
  let startY = 0;

  const rowsWithId = () => [...zone.children].filter((c) => c.dataset && c.dataset.id);

  zone.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle || !zone.contains(handle)) return;
    const row = handle.closest("[data-id]");
    if (!row) return;
    e.preventDefault();
    dragEl = row;
    startY = e.clientY;
    row.classList.add("dragging");
    try { handle.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    if (window.__glHaptic) window.__glHaptic(12);
  });

  zone.addEventListener("pointermove", (e) => {
    if (!dragEl) return;
    e.preventDefault();
    dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
  });

  const finish = (e) => {
    if (!dragEl) return;
    const dragged = dragEl;
    const before = rowsWithId().map((r) => r.dataset.id);
    const others = rowsWithId().filter((r) => r !== dragged);
    const y = e.clientY;
    const idx = others.filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top + rect.height / 2 < y;
    }).length;
    const order = others.map((r) => r.dataset.id);
    order.splice(idx, 0, dragged.dataset.id);
    dragged.classList.remove("dragging");
    dragged.style.transform = "";
    dragEl = null;
    if (order.join() !== before.join()) onReorder(order);
  };

  zone.addEventListener("pointerup", finish);
  zone.addEventListener("pointercancel", () => {
    if (dragEl) { dragEl.classList.remove("dragging"); dragEl.style.transform = ""; dragEl = null; }
  });
}

// ── Lists home ─────────────────────────────────────────────────────────────
export function renderLists(mount, lists, templates, handlers) {
  mount.textContent = "";

  mount.append(el("div", { class: "bar" },
    el("h1", { text: "Our Grocery Lists" }),
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Settings", text: "⚙️",
      on: { click: () => handlers.onOpenSettings() },
    })));

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
      main.append(el("button", {
        type: "button", class: "drag-handle", "aria-label": "Reorder list", text: "⠿",
        on: { click: (e) => e.stopPropagation() },
      }));
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

      // Progress: checked / total (only when the list has items).
      if (typeof list.item_count === "number" && list.item_count > 0) {
        main.append(el("span", {
          class: "count", "aria-label": "checked of total items",
          text: `${list.checked_count || 0}/${list.item_count}`,
        }));
      }

      // List actions menu (rename / duplicate / …). Stops propagation so it doesn't open the list.
      main.append(el("button", {
        type: "button", class: "icon-btn", "aria-label": "List actions", text: "⋯",
        on: { click: (e) => { e.stopPropagation(); handlers.onListMenu(list); } },
      }));

      // Red delete panel (revealed by left-swipe). List deletion cascades its items.
      const del = el("button", {
        type: "button", class: "row-delete", text: "Delete",
        on: {
          click: () => {
            if (confirm(`Delete list "${list.name}"? Its items will be removed too.`)) {
              handlers.onDeleteList(list.id);
            }
          },
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
        on: { click: () => { if (confirm(`Delete template "${t.name}"?`)) handlers.onDeleteList(t.id); } },
      });
      tbody.append(el("div", { class: "row", dataset: { id: t.id } }, main, del));
    }
    listEl.append(el("details", { class: "store-group", open: "" },
      el("summary", { class: "store-summary" }, el("span", { text: `Templates · ${templates.length}` })),
      tbody));
  }
  mount.append(listEl);

  mount.append(makeAddBar("New list…", "＋ New list", {
    onSubmit: (name) => handlers.onNewList(name),
  }));
}

// ── List detail ─────────────────────────────────────────────────────────────
export function renderListDetail(mount, list, items, handlers, sortMode = "manual", usuals = []) {
  mount.textContent = "";

  mount.append(el("div", { class: "bar" },
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Back", text: "‹",
      on: { click: () => handlers.onBack() },
    }),
    el("h1", { text: list.name }),
    el("button", {
      type: "button", class: "icon-btn", "aria-label": "Settings", text: "⚙️",
      on: { click: () => handlers.onOpenSettings() },
    })));

  const listEl = el("div", { class: "list" });
  if (!items.length) {
    listEl.append(el("p", { class: "muted", text: "This list is empty — add an item below" }));
  } else {
    const active = items.filter((i) => !i.checked);
    const done = items.filter((i) => i.checked);

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
  mount.append(listEl);

  mount.append(makeAddBar("Add item…", "＋", {
    withSuggest: true,
    onInput: (value) => handlers.onAddQuery(value),
    onSubmit: (name) => handlers.onAddItem(name),
  }));
}

// Prompt to edit an item's amount as free text ("2", "500 g", "2 L"). Works from
// the numeric stepper too, so a plain count can be turned into "500 g".
function editAmountPrompt(item, handlers) {
  const next = prompt("Amount (e.g. 2, 500 g, 2 L)", item.amount || "");
  if (next === null) return;                         // cancelled
  const t = next.trim();
  if (t && t !== String(item.amount || "").trim()) handlers.onEditAmount(item, t);
}

// Prompt to add / edit / clear an item's note. Blank input removes the note.
function editNotePrompt(item, handlers) {
  const next = prompt("Note (leave blank to remove)", item.note || "");
  if (next === null) return;                         // cancelled
  const t = next.trim();
  handlers.onEditNote(item, t === "" ? null : t);
}

// One swipe-to-delete row: .row → .row-main (100% wide) + .row-delete (revealed on left-swipe).
function buildItemRow(item, handlers, opts = {}) {
  const main = el("div", { class: "row-main" });

  if (opts.drag) {
    main.append(el("button", {
      type: "button", class: "drag-handle", "aria-label": "Reorder item", text: "⠿",
    }));
  }

  // Checkbox — checked state is `box on` with NO glyph; the ✓ is drawn solely by CSS `.box.on::after`.
  main.append(el("button", {
    type: "button", class: item.checked ? "box on" : "box",
    "aria-label": item.checked ? "Uncheck" : "Check off", "aria-pressed": String(!!item.checked),
    on: { click: () => handlers.onToggleCheck(item) },
  }));

  // Name + note stack. Tap name → rename; tap note → edit/clear; "+ note" → add.
  const text = el("div", { class: "row-text" },
    el("span", {
      class: "name", text: item.name,
      on: {
        click: () => {
          const next = prompt("Edit item", item.name);
          const trimmed = next && next.trim();
          if (trimmed && trimmed !== item.name) handlers.onEditItem(item, trimmed);
        },
      },
    }));
  // Secondary meta line: who-added initial + store picker + note.
  const meta = el("div", { class: "item-meta" });
  const who = item.created_by && MEMBERS[item.created_by];
  if (who) {
    meta.append(el("span", {
      class: "who", "aria-label": `Added by ${who.initial}`, title: `Added by ${who.initial}`,
      text: who.initial, style: { background: who.color },
    }));
  }
  meta.append(buildStoreSelect(item, handlers));
  if (item.note) {
    meta.append(el("span", { class: "note", text: item.note,
      on: { click: () => editNotePrompt(item, handlers) } }));
  } else {
    meta.append(el("button", { type: "button", class: "add-note", text: "+ note",
      on: { click: () => editNotePrompt(item, handlers) } }));
  }
  text.append(meta);
  main.append(text);

  // Amount — numeric gets a −/value/+ stepper; the value is tappable to switch to
  // free text (e.g. "500 g"). A non-numeric amount is tap-to-edit text.
  if (isNumericAmount(item.amount)) {
    main.append(el("div", { class: "stepper" },
      el("button", {
        type: "button", class: "step", "aria-label": "Fewer", text: "−",
        on: { click: () => handlers.onAmount(item, stepAmount(item.amount, -1)) },
      }),
      el("span", {
        class: "amount editable", text: String(item.amount).trim(), "aria-label": "Edit amount",
        on: { click: () => editAmountPrompt(item, handlers) },
      }),
      el("button", {
        type: "button", class: "step", "aria-label": "More", text: "+",
        on: { click: () => handlers.onAmount(item, stepAmount(item.amount, +1)) },
      })));
  } else {
    main.append(el("span", {
      class: "amount editable", text: item.amount || "", "aria-label": "Edit amount",
      on: { click: () => editAmountPrompt(item, handlers) },
    }));
  }

  // Watch bell.
  main.append(el("button", {
    type: "button", class: item.watch ? "watch-toggle on" : "watch-toggle",
    "aria-label": item.watch ? "Watching for deals" : "Watch for deals",
    "aria-pressed": String(!!item.watch), text: "🔔",
    on: { click: () => handlers.onToggleWatch(item) },
  }));

  // Overflow menu (move to another list).
  main.append(el("button", {
    type: "button", class: "icon-btn", "aria-label": "Item actions", text: "⋯",
    on: { click: () => handlers.onItemMenu(item) },
  }));

  // Red delete panel (revealed by left-swipe, also a real focusable button).
  const del = el("button", {
    type: "button", class: "row-delete", text: "Delete",
    on: {
      click: () => {
        if (item.watch && !confirm("This item is on your deal-watch list — remove it anyway?")) return;
        handlers.onDeleteItem(item);
      },
    },
  });

  return el("div", {
    class: item.checked ? "row done" : "row",
    dataset: { name: String(item.name || "").toLowerCase(), id: item.id },
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
      type: "button", class: "icon-btn", "aria-label": "Back", text: "‹",
      on: { click: () => handlers.onBack() },
    }),
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
