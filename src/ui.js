// ui.js — pure DOM render + event wiring. No Supabase here; all effects go through `handlers`.
// All user-provided text (list/item names, notes, amounts) is set via textContent / DOM APIs only —
// never interpolated into innerHTML.
import { bySortOrder, isNumericAmount, stepAmount } from "./model.js";
import { THEMES } from "./theme.js";

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

// ── Lists home ─────────────────────────────────────────────────────────────
export function renderLists(mount, lists, handlers) {
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
    for (const list of bySortOrder(lists)) {
      const main = el("div", {
        class: "row-main tappable",
        on: { click: () => handlers.onOpenList(list.id) },
      });
      if (list.emoji) main.append(el("span", { class: "emoji", text: list.emoji }));
      main.append(el("div", { class: "row-text" }, el("span", { class: "name", text: list.name })));

      // Rename — stops propagation so it edits the name instead of opening the list.
      main.append(el("button", {
        type: "button", class: "icon-btn", "aria-label": "Rename list", text: "✏️",
        on: {
          click: (e) => {
            e.stopPropagation();
            const next = prompt("Rename list", list.name);
            const t = next && next.trim();
            if (t && t !== list.name) handlers.onRenameList(list.id, t);
          },
        },
      }));

      if (typeof list.item_count === "number") {
        main.append(el("span", { class: "count", text: itemCountLabel(list.item_count) }));
      }

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

      listEl.append(el("div", { class: "row" }, main, del));
    }
  }
  mount.append(listEl);

  mount.append(makeAddBar("New list…", "＋ New list", {
    onSubmit: (name) => handlers.onNewList(name),
  }));
}

// ── List detail ─────────────────────────────────────────────────────────────
export function renderListDetail(mount, list, items, handlers) {
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
    const sorted = bySortOrder(items);
    const active = sorted.filter((i) => !i.checked);
    const done = sorted.filter((i) => i.checked);
    for (const item of active) listEl.append(buildItemRow(item, handlers));
    if (done.length) {
      listEl.append(el("div", { class: "done-divider" },
        el("span", { text: `Done · ${done.length}` }),
        el("button", {
          type: "button", class: "clear-checked", text: "Clear checked",
          on: { click: () => handlers.onClearChecked(items) },
        })));
      for (const item of done) listEl.append(buildItemRow(item, handlers));
    }
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
function buildItemRow(item, handlers) {
  const main = el("div", { class: "row-main" });

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
  // Secondary meta line: store picker + note.
  const meta = el("div", { class: "item-meta" }, buildStoreSelect(item, handlers));
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

  return el("div", { class: item.checked ? "row done" : "row" }, main, del);
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
