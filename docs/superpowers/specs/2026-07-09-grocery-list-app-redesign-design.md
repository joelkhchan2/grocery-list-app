# Grocery List App — Redesign Design Spec

- **Status:** Approved (design), pending user review of this doc
- **Date:** 2026-07-09
- **Owner:** Joel Chan (personal; private repo `joelkhchan2/grocery-list-app`)
- **Builds on:** `2026-07-09-grocery-list-app-design.md` (original) + the shipped Phase A1 code. Backend, auth (two accounts + RLS), and realtime are unchanged; this spec covers the visual overhaul, a theme system, and a small set of item features. Research basis: the "Redesign Brief" from the design-research pass (Bring!, AnyList, Apple Reminders, Todoist, Google Keep; Material 3, Apple HIG, WCAG 2.2).

## 1. Purpose
Make the app feel polished and personal before it goes on Joel's and Gabrielle's phones. Replace the plain A1 styling with a warm, friendly, mobile-first look; add an in-app **theme picker**; and fold in four low-cost item features (notes, flexible amounts, undo-on-delete, recent-item autocomplete) plus two interactions (swipe-to-delete, check-to-Done).

## 2. Scope
**In:**
- Visual overhaul (warm & friendly layout, tokens, spacing, system font, tap targets, safe-area).
- Theme system + in-app picker (per-device), default Blue + Gold, plus an auto light/dark behavior.
- List detail: checked items sink into a faded "Done" group; sticky bottom add-bar.
- Swipe-left-to-delete with confirm on watched items + an Undo affordance after any delete.
- Item fields: free-text **amount** (replaces integer quantity), optional **note**.
- **Recent-items autocomplete** ("your usuals") when adding an item.

**Out / deferred (explicitly not now):**
- Category/aisle auto-grouping. Manual drag reorder. Per-store routing / store picker (the grocery-watcher already selects stores). "Last purchased" date UI (the `item_history` table sets it up cheaply for later). Prices/running totals, photo/AI capture, recipe import.

## 3. Visual system

**Layout (both screens):** soft tinted background; each list/item is a **rounded card** (radius ~14-16px) with a subtle shadow, comfortable ~52px min height, 16px screen padding. Flat sectioned rows (not dense tables, not heavy cards). One accent per theme (two-tone allowed). Checked items greyed + struck.

**Type:** native system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Sizes in `rem` (root left at UA default so Dynamic Type flows through): body/rows ~1.0625rem (17px), secondary ~0.8125rem, title ~1.4rem. 4-5 steps.

**Tap targets:** every interactive control ≥ **48×48 CSS px** hit area (visible glyph may be smaller, pad the hit area).

**Safe-area / installed PWA:** `viewport-fit=cover` (already set) + `env(safe-area-inset-*)` combined via `max()` (e.g. sticky add-bar `padding-bottom: max(16px, env(safe-area-inset-bottom))`). Add iOS meta (`apple-mobile-web-app-capable`, `-status-bar-style`, `-title`, `apple-touch-icon`). Never set `user-scalable=no` / `maximum-scale=1`.

**Motion:** check-off + undo transitions 200-350ms ease-out, all gated behind `prefers-reduced-motion: reduce` (instant fallback).

### 3.1 Themes
A theme is a full palette expressed as CSS custom properties. Applied by setting `data-theme` on `<html>`; CSS defines each palette under `[data-theme="…"]`. Palettes (hex; `--ontop` = text/icon color drawn on the accent):

| key | bg | card | text | sub | border | accent (`--ac`) | accent-2 (`--ac2`) | ontop |
|---|---|---|---|---|---|---|---|---|
| `bluegold` (default) | `#24408f` | `#2f4db0` | `#efe9d2` | `#aca375` | `#3f5cbd` | `#cdb24a` | `#cdb24a` | `#1a2c66` |
| `terracotta` | `#faf6ef` | `#ffffff` | `#2c2a26` | `#a99f8f` | `#e3dccb` | `#e0803a` | `#e0803a` | `#ffffff` |
| `green` | `#faf6ef` | `#ffffff` | `#2c2a26` | `#a99f8f` | `#e3dccb` | `#3f9d63` | `#3f9d63` | `#ffffff` |
| `berry` | `#faf6ef` | `#ffffff` | `#2c2a26` | `#a99f8f` | `#e3dccb` | `#cf5a75` | `#cf5a75` | `#ffffff` |
| `festive` | `#f7f3ec` | `#ffffff` | `#26312a` | `#9aa79c` | `#e3e0d3` | `#1f7a4d` | `#c0392b` | `#ffffff` |
| `midnight` (the dark theme) | `#131a24` | `#1c2530` | `#e9edf2` | `#8a97a6` | `#2b3745` | `#d4af37` | `#d4af37` | `#12161c` |
| `teal` | `#f2f7f6` | `#ffffff` | `#21302e` | `#93a4a1` | `#dde8e6` | `#159b93` | `#159b93` | `#ffffff` |
| `plumpeach` | `#f8f4f6` | `#ffffff` | `#2f2531` | `#a495a0` | `#ece2e8` | `#7b3f79` | `#ef9d6b` | `#ffffff` |

Header title uses the accent (or a lighter accent tint on colored-bg themes). Contrast note (WCAG): where the accent is used as *text* or a meaningful border it must clear 4.5:1 / 3:1; pale accents are used as fills only, never as body text. Bought/not-bought is never conveyed by hue alone (strikethrough + opacity + check glyph carry it).

### 3.2 Theme picker & light/dark
- **Appearance screen** (opened from the ⚙️ gear): a grid of theme swatches (tap to apply instantly) + a **"Match system light/dark"** toggle + a **Sign out** control.
- **Storage:** per device in `localStorage` (`glTheme`, `glAutoDark`). No backend, no sync (each phone can differ). Applied before first paint to avoid a flash (inline bootstrap in `index.html` reads `localStorage` and sets `data-theme`).
- **Auto light/dark (kept simple):** when "Match system" is ON, the app shows the user's chosen theme while the system is in light mode and switches to **`midnight`** while the system is in dark mode (listening to `matchMedia('(prefers-color-scheme: dark)')`). When OFF, the chosen theme is always used. This avoids maintaining a dark variant of every theme.
- **Default:** first launch = `bluegold`, Match-system = ON.

## 4. Screens
- **Lists home:** title "Our Lists" + ⚙️ gear; each list = rounded card with emoji, name, item count; "＋ New list" action; empty state ("No lists yet — create one below").
- **List detail:** back + list name + ⚙️ gear; active items as cards (checkbox, name, amount/stepper, 🔔 watch, note line if present); a **"Done · N"** divider with checked items below, faded; sticky bottom add-bar with the recent-items autocomplete; empty state ("This list is empty — add an item below").
- **Appearance (settings):** §3.2.

## 5. Item features (detail)

**Amount (replaces integer quantity):** free-text string, e.g. `"2"`, `"500 g"`, `"2 L"`, `"1 dozen"`. Stored as `items.amount text`. The +/- stepper is shown only when the amount is a plain positive integer (regex `^\d+$`); tapping +/- increments/decrements that integer (min 1). For non-numeric amounts, the +/- is hidden and the amount is edited by tapping it (text input). Empty/absent amount renders nothing.

**Note:** optional `items.note text`; rendered as a small muted second line under the item name; edited in the item editor. Never required.

**Undo after delete:** deleting an item (via swipe or the delete control) removes it and shows a transient **"Deleted '<name>' — Undo"** bar for ~5s. Undo re-inserts the row (same fields; a new id is fine). Watched items still get the confirm dialog *before* delete; undo is the safety net for everything.

**Swipe-to-delete:** swipe a row left to reveal/trigger delete (implemented with CSS `scroll-snap` reveal, minimal JS; a visible delete control remains for accessibility/non-swipe). Confirm on watched items as today.

**Recent-items autocomplete ("your usuals"):** as the user types in the add-bar, suggest matching names from the household's item history. Backed by an `item_history` table (see §6) upserted whenever an item is added. Suggestions rank by `uses` desc then recency; tapping one fills the name (and its `last_amount`/`last_note` if present, so re-adding a usual is one tap). Prefix/substring match, case-insensitive, capped at ~6 suggestions.

## 6. Data model deltas (fold into the fresh schema — DB is empty)
```
items:  + note text (null)
        quantity int  →  amount text (default '1')      -- free-text amount/unit
        (existing: id, list_id, name, checked, watch, sort_order, created_by, created_at, updated_at)

item_history (NEW, household-global, powers autocomplete + future "last purchased"):
  name text primary key,            -- trimmed as entered; matched case-insensitively
  uses int not null default 1,
  last_amount text,
  last_note text,
  last_used timestamptz not null default now()
```
- **RLS on `item_history`:** same as the other tables — `for all using/with check (auth.uid() in (UID_1, UID_2))`. Enable RLS; add to the realtime publication only if we want cross-device suggestion freshness (optional; not required for v1).
- **Upsert on add:** when an item is added, `insert … on conflict (name) do update set uses = uses + 1, last_amount = …, last_note = …, last_used = now()`. Case-insensitivity handled by storing/looking up on `lower(name)` (a normalized approach; see plan).
- `quantity`→`amount` rename is free (no rows yet); the A1 schema in `supabase/schema.sql` is updated in place so Task 0 stays a single run. **Because Joel already ran the A1 schema, the redesign plan includes a small idempotent migration snippet** (`alter table items rename column quantity to amount; alter table items alter column amount type text using amount::text; alter column set default '1'; add column note text; create table item_history …`) that he runs once in the SQL Editor.

## 7. Grocery-watcher impact
None. The watcher reads `watch=true` item **names**; `amount`/`note`/`item_history` don't affect it. Phase 2c's `SupabaseWatchListSource` is unchanged.

## 8. Architecture / files
- `src/theme.js` (NEW): theme definitions (keys + which are dark), `applyTheme`, `resolveActive(chosen, autoDark, systemDark)`, `loadPrefs`/`savePrefs` (localStorage). Pure resolution logic is unit-tested.
- `src/model.js`: add `isNumericAmount(s)`, `stepAmount(s, delta)` (pure, unit-tested); keep existing helpers.
- `src/db.js`: `addItem` now takes `{name, amount, note}` and upserts `item_history`; add `recentItems(client, prefix)`, `historyUpsert`; `updateItem` patch may include `amount`/`note`.
- `src/ui.js`: rewritten render for the new layout (cards, Done section, amount/stepper, note line, swipe affordance, autocomplete dropdown); new Appearance/settings view; undo bar.
- `src/main.js`: theme bootstrap + Appearance wiring, undo handling, autocomplete wiring, `data-theme` on load.
- `src/style.css`: full rewrite to the token + theme system (`[data-theme]` palettes, safe-area, motion, tap targets).
- `index.html`: pre-paint theme bootstrap + iOS meta tags.
- `sw.js`: bump cache (`shell-v3`); precache `theme.js`.
- `supabase/schema.sql`: updated to the new shape; plus a `supabase/migrate-redesign.sql` one-run migration for the already-created project.
- Tests: `theme.test.js` (resolveActive light/dark/auto), `model.test.js` (amount helpers), `db.test.js` (addItem writes amount/note + history upsert; recentItems query shape).

## 9. Accessibility
48px targets; per-theme contrast checked (accent-as-text clears 4.5:1, borders 3:1); `rem` type + Dynamic Type; `prefers-reduced-motion` honored; no zoom lock; state never by color alone; decorative emoji `aria-hidden` with text labels retained.

## 10. Testing
Pure logic (`theme.js` resolution, `model.js` amount helpers) unit-tested with `node --test`. Data layer (`db.js`) tested with the injected fake client (amount/note persisted, history upserted, recent-items query built correctly). UI, swipe, autocomplete dropdown, theme switching, and dark-mode behavior verified manually on device (and in the local browser). Realtime unchanged from A1.

## 11. Success criteria
- App looks warm and finished; both phones can pick a theme independently and it persists; Blue+Gold default; dark mode follows the system when Match-system is on.
- Items support free-text amounts and notes; +/- steps numeric amounts; deleting anything can be undone; watched items still confirm.
- Typing a previously-used item suggests it; tapping the suggestion fills it (one-tap re-add of usuals).
- The 🔔 watch flow is unchanged and still feeds the grocery-watcher.

## 12. Open questions / risks
- Swipe-to-delete via `scroll-snap` must not fight the browser's back-swipe on iOS; keep the visible delete control as the reliable path.
- `item_history` grows unbounded in theory; for a two-person household it's negligible (cap suggestions in the query, not the table).
- Pre-paint theme bootstrap must run before CSS paints to avoid a flash; inline `<script>` in `<head>` reading `localStorage`.
