# Grocery List App — Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Task 0 is manual (Joel, Supabase SQL Editor) and gates the data-layer tasks that read/write the new columns.** Builds on the shipped Phase A1 code (branch continues on `phase-a1`).

**Goal:** Redesign the working app into a warm, themeable, polished PWA with an in-app theme picker and a small set of item features (notes, free-text amounts, undo-on-delete, recent-item autocomplete, swipe-to-delete, check-to-Done).

**Architecture:** Keep the A1 module split (pure `model.js`, DI `db.js`, thin `ui.js`, `main.js` wiring, Supabase backend + realtime unchanged). Add `theme.js` (pure theme resolution + localStorage prefs). Visuals move to a `[data-theme]` CSS-variable system. Backend gains `items.note`, `items.quantity`→`amount` (text), and an `item_history` table for autocomplete.

**Tech Stack:** unchanged — HTML5 + vanilla JS ES modules + CSS, `@supabase/supabase-js@2` via esm.sh, `node --test`, GitHub Pages + Actions.

## Global Constraints

- **No build step**; static files; ES modules. Same as A1.
- **Backend/auth/realtime unchanged**: two accounts, RLS `auth.uid() in (UID_1, UID_2)`, server-authoritative realtime with self-echo suppression. Do not modify `auth.js`, `supabase.js`, or the realtime merge logic except where explicitly stated.
- **Theme prefs are per-device** (`localStorage`: `glTheme`, `glAutoDark`), never in Supabase. Default theme `bluegold`, auto-dark ON.
- **Themes** (exact palettes) are defined in the design spec §3.1 — copy hex values verbatim. Default `bluegold` = bg `#24408f`, card `#2f4db0`, accent (old gold) `#cdb24a`.
- **Amount is free text** (`"2"`, `"500 g"`); +/- stepper only for plain integers (`^\d+$`), min 1.
- **Deleting anything is undoable** (~5s Undo bar); watched items still confirm before delete.
- **Accessibility**: ≥48px tap targets; `rem` type; `prefers-reduced-motion` honored; no zoom lock; state never by color alone; decorative emoji `aria-hidden`.
- Pure logic (`theme.js`, `model.js`) unit-tested; `db.js` tested via injected fake client; UI/CSS spec-driven + manually verified (like A1 Task 5). One commit per task, conventional-commit prefixes.

---

## File Structure (delta from A1)

```
Create: src/theme.js, tests/theme.test.js, supabase/migrate-redesign.sql
Modify: src/model.js (+amount helpers), tests/model.test.js
        src/db.js (amount/note + item_history), tests/db.test.js
        src/ui.js (full render rewrite + Appearance view + undo)
        src/main.js (theme bootstrap, Appearance, undo, autocomplete wiring)
        src/style.css (full rewrite: token + [data-theme] system)
        index.html (pre-paint theme bootstrap + iOS meta)
        sw.js (cache → shell-v3, precache theme.js)
        supabase/schema.sql (fresh-install shape: amount text, note, item_history)
        README.md (theme picker + new fields note)
```

---

## Task 0: Run the migration (MANUAL — Joel, Supabase SQL Editor) — gates Tasks 4 & 8

The A1 schema is already live (items has `quantity int`, no `note`, no `item_history`), and local smoke-testing may have inserted a few rows — that's fine, the `int`→`text` conversion below is non-lossy (`1`→`"1"`, all other columns untouched). Run this once in the SQL Editor. It is the exact contents of `supabase/migrate-redesign.sql` (created in Task 1).

- [ ] **Step 1 (optional sanity):** `select count(*) from items;` — just to see how many rows the conversion touches (any count is fine; the migration is non-lossy).

- [ ] **Step 2:** Paste and run:

```sql
alter table items rename column quantity to amount;
alter table items alter column amount type text using amount::text;
alter table items alter column amount set default '1';
alter table items add column note text;

create table item_history (
  name_key text primary key,          -- lower(trim(name)); case-insensitive dedup key
  name text not null,                 -- display name, as last entered
  uses int not null default 1,
  last_amount text,
  last_note text,
  last_used timestamptz not null default now()
);
alter table item_history enable row level security;
create policy household_history on item_history for all
  using (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'))
  with check (auth.uid() in ('4ec75d05-7398-418c-99cf-aff7ac137602', 'c704c703-af29-461a-bb3c-651dd91ac5b1'));
```

- [ ] **Step 3: Go/no-go:** "Success. No rows returned." `select amount, note from items limit 1` and `select * from item_history limit 1` both run without error (empty is fine). Tell the controller when done so Tasks 4/8 can be verified live.

**Rollback** (only valid before the new app writes any non-numeric amounts): `alter table items alter column amount type int using amount::int; alter table items rename column amount to quantity; alter table items drop column note; drop table item_history;`

**Deploy ordering:** the app is not yet on the phones (no repo/Pages exist), so running this migration now is safe. When we do deploy, ship the new code + the `sw.js` cache bump (Task 7) together with (or before) anything that relies on the new columns, so no old cached client is left writing the dropped `quantity`.

---

## Task 1: Schema files (fresh-install `schema.sql` + one-run `migrate-redesign.sql`)

**Files:** Modify `supabase/schema.sql`; Create `supabase/migrate-redesign.sql`.

- [ ] **Step 1:** In `supabase/schema.sql`, change the `items` table so `quantity int not null default 1` becomes `amount text not null default '1'`, and add `note text` (place `amount` where `quantity` was; add `note` after `watch`). Then append the `item_history` table (columns exactly: `name_key text primary key`, `name text not null`, `uses int not null default 1`, `last_amount text`, `last_note text`, `last_used timestamptz not null default now()`) + its RLS policy (same two UIDs, `for all using/with check auth.uid() in (…)`) after the existing `items` policy block, before the realtime publication section. (This keeps a from-scratch run correct; Joel's existing project uses the migration instead.)

- [ ] **Step 2:** Create `supabase/migrate-redesign.sql` with the exact SQL from Task 0 Step 2.

- [ ] **Step 3: Commit** `chore: redesign schema (amount text, note, item_history) + one-run migration`.

---

## Task 2: `theme.js` — theme catalog + resolution + prefs (TDD)

**Files:** Create `src/theme.js`, `tests/theme.test.js`.

**Interfaces (pure where noted):**
- `THEMES` — array of `{ key, label, dark }`. Keys/labels: bluegold "Blue + Gold" (dark:false), terracotta "Terracotta", green "Garden Green", berry "Berry", festive "Festive", midnight "Midnight" (dark:true), teal "Teal", plumpeach "Plum + Peach".
- `DEFAULT_THEME = "bluegold"`, `DARK_THEME = "midnight"`.
- `resolveActive(chosenKey, autoDark, systemDark)` — pure: returns `DARK_THEME` when `autoDark && systemDark`, else `chosenKey` (falling back to `DEFAULT_THEME` if `chosenKey` is unknown).
- `loadPrefs()` / `savePrefs({theme, autoDark})` — localStorage (`glTheme`, `glAutoDark`), defaults `{theme: DEFAULT_THEME, autoDark: true}`.
- `applyTheme(key)` — sets `document.documentElement.dataset.theme = key`.

- [ ] **Step 1: failing tests** (`tests/theme.test.js`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActive, THEMES, DEFAULT_THEME, DARK_THEME } from "../src/theme.js";

test("resolveActive returns chosen theme when auto-dark off", () => {
  assert.equal(resolveActive("teal", false, true), "teal");
  assert.equal(resolveActive("teal", false, false), "teal");
});
test("resolveActive switches to dark theme only when auto-dark on AND system dark", () => {
  assert.equal(resolveActive("bluegold", true, true), DARK_THEME);
  assert.equal(resolveActive("bluegold", true, false), "bluegold");
});
test("resolveActive falls back to default for an unknown key", () => {
  assert.equal(resolveActive("nope", false, false), DEFAULT_THEME);
});
test("THEMES includes the default and dark keys", () => {
  const keys = THEMES.map(t => t.key);
  assert.ok(keys.includes(DEFAULT_THEME));
  assert.ok(THEMES.find(t => t.key === DARK_THEME).dark === true);
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement `src/theme.js`:**

```js
export const DEFAULT_THEME = "bluegold";
export const DARK_THEME = "midnight";
export const THEMES = [
  { key: "bluegold", label: "Blue + Gold", dark: false },
  { key: "terracotta", label: "Terracotta", dark: false },
  { key: "green", label: "Garden Green", dark: false },
  { key: "berry", label: "Berry", dark: false },
  { key: "festive", label: "Festive", dark: false },
  { key: "midnight", label: "Midnight", dark: true },
  { key: "teal", label: "Teal", dark: false },
  { key: "plumpeach", label: "Plum + Peach", dark: false },
];
const KEYS = new Set(THEMES.map(t => t.key));

export function resolveActive(chosenKey, autoDark, systemDark) {
  if (autoDark && systemDark) return DARK_THEME;
  return KEYS.has(chosenKey) ? chosenKey : DEFAULT_THEME;
}
export function loadPrefs() {
  try {
    return {
      theme: localStorage.getItem("glTheme") || DEFAULT_THEME,
      autoDark: localStorage.getItem("glAutoDark") !== "0",
    };
  } catch { return { theme: DEFAULT_THEME, autoDark: true }; }
}
export function savePrefs({ theme, autoDark }) {
  try {
    localStorage.setItem("glTheme", theme);
    localStorage.setItem("glAutoDark", autoDark ? "1" : "0");
  } catch { /* private mode */ }
}
export function applyTheme(key) { document.documentElement.dataset.theme = key; }
```

- [ ] **Step 4: run → pass. Commit** `feat: theme catalog, resolution, and per-device prefs`.

---

## Task 3: `model.js` — amount helpers (TDD)

**Files:** Modify `src/model.js`, `tests/model.test.js`.

**Interfaces (pure):**
- `isNumericAmount(s)` — true iff `s` trimmed matches `^\d+$`.
- `stepAmount(s, delta)` — if numeric, returns `String(max(1, int + delta))`; else returns `s` unchanged.

- [ ] **Step 1: add failing tests** to `tests/model.test.js`:

```js
import { isNumericAmount, stepAmount } from "../src/model.js";
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
```

- [ ] **Step 2: run → fail. Step 3: implement in `src/model.js`:**

```js
export function isNumericAmount(s) { return /^\d+$/.test(String(s ?? "").trim()); }
export function stepAmount(s, delta) {
  if (!isNumericAmount(s)) return s;
  return String(Math.max(1, parseInt(String(s).trim(), 10) + delta));
}
```

- [ ] **Step 4: Remove dead code** — delete `clampQuantity` from `src/model.js` and its `test("clampQuantity never goes below 1", …)` block from `tests/model.test.js` (superseded by `stepAmount`; the A1 UI that used it is being rewritten in Task 6). Also remove `clampQuantity` from any import lines.

- [ ] **Step 5: run → all pass. Commit** `feat: free-text amount helpers; drop clampQuantity`.

---

## Task 4: `db.js` — amount/note + item_history (TDD with fake client)

**Files:** Modify `src/db.js`, `tests/db.test.js`. **Depends on Task 0 for live use; buildable/testable now against the fake client.**

**Interface changes:**
- `addItem(client, listId, { name, amount = "1", note = null })` — inserts `{ list_id, name, amount, note }`, returns the created row (`.select().single()`), then best-effort `historyUpsert`. (Signature changes from `addItem(client, listId, name)`.)
- `reinsertItem(client, row)` (NEW) — undo helper; re-inserts the FULL captured row (`{ list_id, name, amount, note, watch, checked, sort_order }`, new id is fine) so an undone delete preserves `watch`/`checked`/`sort_order` (a watched item keeps feeding the grocery-watcher). Returns the created row.
- `historyUpsert(client, { name, amount, note })` — upsert into `item_history` keyed on the normalized `name_key` (`lower(trim(name))`), storing the display `name`, `last_amount`, `last_note`, and `last_used: new Date().toISOString()`. `onConflict: "name_key"`. Best-effort: must not throw the add path.
- `recentItems(client, prefix, limit = 6)` — `select("*").ilike("name", prefix + "%").order("last_used", {ascending:false}).limit(limit)`; returns rows (`[]` on empty/blank prefix). Ranks by recency for v1 (the `uses` column exists for a future frequency ranking via an RPC — deferred).
- `updateItem(client, id, patch)` — unchanged; `patch` may now include `amount`/`note`.

Extend the fake client to support `.upsert(payload,{onConflict})`, `.ilike(col,val)`, `.limit(n)` (all return the builder; `.upsert` records a `["upsert", table, payload]` call and, like insert/update, returns null data unless `.select()` is chained).

**PostgREST assumption (verify live):** `.upsert(…, {onConflict:'name_key'})`, `.ilike`, and the upsert return shape are exercised only against our own fake here — they must be confirmed on the first live run (Task 8 Step 3), not treated as proven by the green fake tests.

- [ ] **Step 1: fix the stale test + add failing tests** in `tests/db.test.js`:
  - **Do NOT add a second `import … addItem`** — the file already imports it (line 3). Change that existing import to `import { fetchItems, addItem, updateItem, clearChecked, recentItems, reinsertItem } from "../src/db.js";` (adds `recentItems`, `reinsertItem`; `historyUpsert` is exercised indirectly via `addItem`).
  - **Replace the stale A1 test** `test("addItem inserts with the list id and returns the created row (with id)", …)` (which calls the old string signature `addItem(c, "list1", "Eggs")`) with the object-signature test below.
  - Extend the fake: `q.upsert = (rows,opts) => { mode="upsert"; payload=rows; calls.push(["upsert",table,rows]); return q; }; q.ilike = () => q; q.limit = () => q;` and in `.then()` treat `mode==="upsert"` exactly like insert/update (echo `[{id:"generated-id",...payload}]` when `.select()` chained, else `null`).
  - Add:

```js
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
```

- [ ] **Step 2: run → fail. Step 3: implement** in `src/db.js`:

```js
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
```

(v1 ranks suggestions by `last_used desc`, refreshed on every add via the upsert payload. The `uses` column exists for a future frequency ranking through an RPC — deferred, not wired now. Case-insensitive dedup is via the `name_key` primary key, so "Milk" and "milk" collapse to one history row.)

- [ ] **Step 4: run → pass (all prior + new; the rewritten stale test included). Commit** `feat: amount/note on items + item_history (recency autocomplete) + reinsertItem for undo`.

---

## Task 5: `style.css` — token + `[data-theme]` system (spec-driven)

**Files:** Rewrite `src/style.css`.

- [ ] **Step 1: implement.** Structure:
  - **Base tokens on `:root`**: spacing scale, radii (`--r-card:15px`, `--r-ctl:12px`), font sizes in `rem`, shadow, transition duration.
  - **`[data-theme="…"]` blocks** for all 8 keys, each setting `--bg, --card, --tx, --sub, --border, --ac, --ac2, --ontop` to the exact hex in design spec §3.1. Header-title color uses `--ac` (for colored-bg themes it may use a lighter tint — acceptable to use `--ac` directly).
  - **Layout**: `body{background:var(--bg);color:var(--tx);font:...system stack}`; `.bar` (sticky top header, flex, padding incl. `env(safe-area-inset-top)`); `.card`/`.row` rounded (`var(--r-card)`, `background:var(--card)`, subtle shadow, min-height 52px, gap); `.addbar` sticky bottom with `padding-bottom:max(var(--space),env(safe-area-inset-bottom))`.
  - **Controls**: checkbox `.box` (20px glyph, 48px hit area via padding). **Checked-box contract (single source of truth — Task 6 must match):** the checked class is `.box.on`, `.box.on{background:var(--ac)}` and the ✓ is drawn ONLY here via `.box.on::after{content:"✓";color:var(--ontop)}` — `ui.js` sets the class but renders no text glyph, so the ✓ never double-draws. `.step` (± buttons, outlined `var(--ac)`, 48px hit area); `.watch-toggle`/`.watch-tag` (the 🔔 — use the grayscale/opacity off-state from the A1 fix, or the `WATCH` pill using `--ac`); `.note`(muted second line); `.count`.
  - **Done section**: `.done-divider` (uppercase, `--sub`); `.row.done{opacity:.72}`, `.row.done .name{text-decoration:line-through;opacity:.5}`.
  - **Swipe-to-delete (scroll-snap)**: row is a horizontal scroll-snap container revealing a red delete panel on left-swipe; see spec §5. Keep a visible delete control too.
  - **Autocomplete dropdown**: `.suggest` list above the add-bar (`background:var(--card)`, rounded, shadow), `.suggest-item` rows (48px).
  - **Appearance/settings**: `.swatch-grid` (grid of theme swatches, selected has ring + ✓), `.toggle` (the match-system switch), sign-out control.
  - **Motion**: transitions on check/undo gated by `@media (prefers-reduced-motion: no-preference)`.
  - **Tap targets**: enforce `min-height:48px;min-width:48px` on all buttons.
  - No raw hex outside `:root`/`[data-theme]` blocks (shadows via rgb() are fine).

- [ ] **Step 2: Commit** `feat: token + multi-theme CSS system (warm layout, safe-area, a11y)`. (Visuals verified manually in Task 8.)

---

## Task 6: `ui.js` — render rewrite + Appearance view + undo (spec-driven)

**Files:** Rewrite `src/ui.js`. Keep it Supabase-free (all effects via `handlers`).

**Exports & handler contract (main.js depends on these exactly):**
- `renderLists(mount, lists, handlers)` — cards (emoji, name, `item_count`), "＋ New list", ⚙️ gear → `handlers.onOpenSettings()`. Empty state.
- `renderListDetail(mount, list, items, handlers)` — active items on top, then a "Done · N" divider and faded checked items; each item row: check `.box`→`onToggleCheck(item)` (**set the checked class to `box on` and render NO text glyph — the ✓ comes from CSS `.box.on::after`, per Task 5; do not reuse A1's `box checked`/text-"✓"**); name (tap → `onEditItem(item, name)`); **amount** — if `isNumericAmount(item.amount)` show `−`/value/`+` stepper calling `onAmount(item, stepAmount(item.amount, ±1))`, else show the text amount (tap → `onEditAmount(item, text)`); 🔔 `onToggleWatch(item)`; optional `.note` line; delete via swipe or control → `onDeleteItem(item)` (watched → confirm first). Bottom **add-bar** with an input calling `handlers.onAddQuery(text)` on input and `handlers.onAddItem(name)` on submit. Empty state.
- `renderSuggestions(rows, onPick)` (NEW) — updates ONLY the autocomplete dropdown node (a persistent `#suggest` container inside the add-bar), rendering each row (48px) wired to `onPick(row)`. **This must never re-run `renderListDetail`** — the add-bar `<input>` element must survive across suggestion updates so focus/caret aren't lost while typing. Empty `rows` clears the dropdown.
- `renderAppearance(mount, prefs, handlers)` — swatch grid from `THEMES` (import from `./theme.js`); tapping a swatch → `handlers.onPickTheme(key)`; "Match system light/dark" toggle → `handlers.onToggleAutoDark(bool)`; a **Sign out** control → `handlers.onSignOut()`; back → `handlers.onBack()`.
- `showUndo(mount, label, onUndo)` — renders a transient bar ("Deleted '<label>' — Undo") wired to `onUndo`, auto-dismiss ~5s. (May be a small helper appended to `document.body`.)
- All user text via `textContent`/escaping (no innerHTML interpolation of names/notes/amounts).

- [ ] **Step 1: implement** per the contract, reusing `bySortOrder`, `isNumericAmount`, `stepAmount` from `model.js` and `THEMES` from `theme.js`. Swatch backgrounds match the theme accents (small inline `style="background:…"` per key is acceptable here as presentational data). Export `renderLists, renderListDetail, renderSuggestions, renderAppearance, showUndo`.

- [ ] **Step 2: Commit** `feat: redesigned UI — cards, Done section, amount/notes, autocomplete, Appearance, undo`. (No unit tests; logic it uses is tested in Tasks 2/3; UI verified in Task 8.)

---

## Task 7: `index.html` bootstrap + `main.js` wiring + `sw.js` (spec-driven)

**Files:** Modify `index.html`, `src/main.js`, `sw.js`.

- [ ] **Step 1: `index.html`** — add a **pre-paint theme bootstrap** in `<head>` (before the stylesheet paints matters less than before app JS, but put it in `<head>` after the stylesheet link) that reads `localStorage.glTheme`/`glAutoDark` + `matchMedia('(prefers-color-scheme: dark)')` and sets `document.documentElement.dataset.theme` immediately, to avoid a theme flash:

```html
<script>
  try {
    var t = localStorage.getItem("glTheme") || "bluegold";
    var auto = localStorage.getItem("glAutoDark") !== "0";
    var darkSys = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = (auto && darkSys) ? "midnight" : t;
  } catch (e) {}
</script>
```
Also add iOS meta tags in `<head>`: `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=default`, `apple-mobile-web-app-title="Groceries"`, and an `apple-touch-icon` link to `assets/icon-192.png`.

- [ ] **Step 2: `main.js`** — **update the `ui.js` import** to `import { renderLists, renderListDetail, renderSuggestions, renderAppearance, showUndo } from "./ui.js";` (A1 imported only `renderLists, renderListDetail`). Import `theme.js` (`loadPrefs, savePrefs, applyTheme, resolveActive`). On boot: `const prefs = loadPrefs(); applyTheme(resolveActive(prefs.theme, prefs.autoDark, matchMedia(...).matches));` and add a `matchMedia('(prefers-color-scheme: dark)')` `change` listener that re-applies when auto-dark is on. Add a `settings` view to the state machine (`state.view === "settings"`) rendered via `renderAppearance`. Wire the new handlers:
  - `onOpenSettings` / `onBack` (from settings) — view switches (no data fetch needed for settings).
  - `onPickTheme(key)` → `savePrefs({theme:key, autoDark}); applyTheme(resolveActive(...)); re-render settings`.
  - `onToggleAutoDark(bool)` → save + re-apply.
  - `onAddItem(name)` → `mutate(() => db.addItem(client, state.listId, { name, amount:"1", note:null }))` (amount/note default; the editor sets them after).
  - `onAddQuery(text)` → debounced `db.recentItems(client, text)` → `renderSuggestions(rows, handlers.onPickSuggestion)`, updating ONLY the dropdown node. **Never call `renderListDetail` from here** — it would rebuild the add-bar input and drop the focus/caret mid-type.
  - `onPickSuggestion(row)` → `mutate(() => db.addItem(client, state.listId, { name: row.name, amount: row.last_amount || "1", note: row.last_note || null }))`.
  - `onAmount(item, amount)` / `onEditAmount(item, amount)` → `mutate(() => db.updateItem(client, item.id, { amount }), [item.id])`.
  - `onEditItem(item, name)` → update `{name}` (also nice: `historyUpsert` on rename — optional).
  - `onDeleteItem(item)` → capture the FULL row, `mutate(() => db.deleteItem(client, item.id), [item.id])`, then `showUndo(document.body, item.name, () => mutate(() => db.reinsertItem(client, item)))`. Using `reinsertItem` (not `addItem`) preserves `watch`/`checked`/`sort_order`, so an undone watched item still feeds the grocery-watcher.
  - **Remove the A1 `onQty` handler** (`onQty: (it, q) => … { quantity: q }`) — superseded by `onAmount`/`onEditAmount`, and `quantity` no longer exists.
  - Keep `onToggleCheck`, `onToggleWatch`, `onSignOut` as in A1 (sign-out now reachable from settings).
  Keep the existing `mutate`/`refresh`/realtime logic unchanged.

- [ ] **Step 3: `sw.js`** — bump `SHELL` to `"shell-v3"` and add `"./src/theme.js"` to `ASSETS`.

- [ ] **Step 4: `node --test`** (green — logic covered by Tasks 2-4) and `node --check` on `src/main.js`, `src/ui.js`, `src/theme.js`. **Commit** `feat: theme bootstrap + Appearance/undo/autocomplete wiring + SW v3`.

---

## Task 8: Verify + README (local + live)

**Files:** Modify `README.md`.

- [ ] **Step 1:** `README.md` — add a short "Themes & appearance" note (per-device picker, default Blue+Gold, match-system dark) and update the item description (amount can be text like "500 g"; notes; recent-item suggestions). Remove the stale "quantity is an integer" phrasing if present.
- [ ] **Step 2: Local smoke test** (controller): serve locally, hard-reload past the SW (bump ensures fresh), verify: theme applies + persists across reload (no flash); Appearance picker switches all 8 themes; match-system dark → midnight; add item, edit amount to "500 g" (stepper hides), add a numeric amount (stepper works), add a note; the add-bar input keeps focus while suggestions appear (doesn't reset mid-type); check item → sinks to Done; swipe/delete a **watched** item → Undo → it returns still watched; typing a used name suggests it; sign out from Appearance.
- [ ] **Step 3: Live checks (needs Task 0 done — this is the ONLY proof of the assumed PostgREST behavior; the fake can't validate it):** confirm amount/note persist to Supabase; the `item_history` upsert works (`onConflict:"name_key"` de-dupes "Milk"/"milk" to one row, `.ilike` matches, `last_used` refreshes on re-add); autocomplete pulls suggestions across a reload; an undone delete keeps `watch=true` in the DB; realtime still syncs two tabs.
- [ ] **Step 4: Commit** `docs: README theme picker + item fields` and report completion.

---

## Post-redesign: deploy (manual, Joel)
- [ ] `gh repo create joelkhchan2/grocery-list-app --private --source=. --push` (confirm first); enable Pages (Settings → Pages → GitHub Actions).
- [ ] Install on both phones (Add to Home Screen); each picks a theme; confirm live sync.
- [ ] Then grocery-watcher Phase 2c (`SupabaseWatchListSource`) as its own plan.

---

## Self-Review

**Spec coverage (redesign spec §1-§12):** warm layout + tokens → Tasks 5/6; theme system + picker + default bluegold + auto-dark → Tasks 2 (`theme.js`), 5 (`[data-theme]`), 6 (`renderAppearance`), 7 (bootstrap + wiring); safe-area/iOS meta → Tasks 5/7; check-to-Done + sticky add-bar → Tasks 5/6; swipe-to-delete + Undo + watched-confirm → Tasks 5/6/7; free-text amount (+ stepper rule) → Tasks 3/6; notes → Tasks 4/6; recent-items autocomplete → Tasks 4 (`recentItems`/`historyUpsert`) + 6 (dropdown) + 7 (wiring); data-model deltas + migration → Tasks 0/1; watcher unaffected → no watcher change; a11y (48px/rem/reduced-motion/no-zoom-lock/color-not-alone) → Tasks 5/7; testing → Tasks 2-4 unit + Task 8 manual. All spec sections map to a task.

**Placeholder scan:** the two UIDs in Task 0/1 SQL are the real household UIDs (as in the live schema), not placeholders. UI/CSS tasks are spec-driven (like A1 Task 5) with exact export/handler contracts and the palette table in the spec — no "TBD". `uses`-increment-on-conflict is explicitly scoped out for v1 (documented, not a gap).

**Type consistency:** `addItem` signature changes to `(client, listId, {name, amount, note})` — every call site is updated: `main.js` `onAddItem`/`onPickSuggestion` (Task 7), and the fake-client tests (Task 4, which also **replace** the stale A1 string-signature test rather than adding a duplicate import). The A1 `onQty` handler (wrote `{quantity}`) is **removed** in Task 7, and `clampQuantity` + its test are **removed** in Task 3 — no lingering `quantity` references. `undo` re-inserts via the new `reinsertItem(client, row)` (Task 4), preserving `watch`/`checked`/`sort_order`. `historyUpsert` keys on `name_key = lower(trim(name))` (matches the `item_history` PK in Tasks 0/1) and sets `last_used`; `recentItems` orders by `last_used`. `db.js` functions still take `client` first. `model.js` helpers (`isNumericAmount`, `stepAmount`) imported by `ui.js`. `theme.js` (`THEMES`/`resolveActive`/`applyTheme`/`loadPrefs`/`savePrefs`) used by `main.js` and `ui.js`. `ui.js` exports (`renderLists`, `renderListDetail`, `renderSuggestions`, `renderAppearance`, `showUndo`) match the updated `main.js` import (Task 7) and handler names; the checked-box class (`box on`, ✓ via CSS `::after` only) is pinned identically in Tasks 5 and 6. `sw.js` ASSETS gains `theme.js`.
