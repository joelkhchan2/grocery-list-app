# Grocery List App — Phase A1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Task 0 is manual (Joel, in the Supabase dashboard) and gates everything else.**

**Goal:** Ship the MVP: a shared, installable mobile PWA where Joel & Gabrielle manage multiple grocery lists (add/edit/check/delete items, quantities, per-item 🔔 watch toggle) with live sync, backed by Supabase, deployed on GitHub Pages.

**Architecture:** Zero-build vanilla JS (ES modules) + token CSS (Letter Ride pattern). Supabase JS from CDN for auth + Postgres + Realtime. A **dependency-injected data layer** (`db.js` receives the Supabase client) keeps CRUD testable with `node --test` and a fake client. Pure list/item logic (`model.js`) is fully unit-tested. UI (`ui.js`) is thin DOM render + handlers, verified manually. Realtime is **server-authoritative**: any change event → refetch that list & replace state, ignoring self-echo.

**Tech Stack:** HTML5 + vanilla JS ES modules + CSS (no framework, no build). `@supabase/supabase-js@2` via esm.sh. Node's built-in `node --test`. GitHub Pages + Actions.

## Global Constraints

- **No build step.** `index.html` loads `<script type="module" src="src/main.js">`. Modules import each other and Supabase via ESM CDN. Runs as static files.
- **Auth:** two accounts (email+password), one each for Joel and Gabrielle, sharing one household-global data set. **Public sign-ups MUST be disabled** in Supabase (Task 0). Session persists (Supabase default localStorage).
- **RLS scoped to the two household user ids** (`auth.uid() in (UID_1, UID_2)`), not the broad `authenticated` role. anon has no access. The two UIDs live only in the RLS policy (server-side), not in `config.js`.
- **Config** (`config.js`, committed — anon key is public by Supabase design; repo is private): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. **Never** commit the service key (that lives only in the grocery-watcher's Actions secrets, Phase 2c).
- **Watch-flag lifecycle:** `checked` (transient) and `watch` (persistent) are independent. "Clear checked" deletes only `checked=true AND watch=false`. Deleting a watched item requires a confirm.
- **Realtime merge:** server-authoritative refetch-and-replace; ignore self-echo via a per-mutation client id; `updated_at` last-write-wins.
- Pure logic in `model.js` is unit-tested; data layer in `db.js` tested with an injected fake client; UI verified manually. One commit per task, conventional-commit prefixes.

---

## File Structure

```
grocery-list-app/
├── index.html                     # app shell; loads src/main.js as a module
├── config.js                      # SUPABASE_URL, SUPABASE_ANON_KEY (UIDs live in RLS, not here)
├── manifest.webmanifest           # PWA manifest
├── sw.js                          # minimal service worker (app-shell cache)
├── src/
│   ├── main.js                    # entry: init client, auth gate, wire UI + realtime
│   ├── supabase.js                # createClient(config) — the one place the CDN import lives
│   ├── db.js                      # DI data layer: lists/items CRUD (client passed in)
│   ├── model.js                   # pure logic: quantity, clear-checked rule, realtime merge, sort
│   ├── auth.js                    # sign-in form + session helpers
│   ├── ui.js                      # DOM render + event handlers (lists home, list detail)
│   └── style.css                  # token-driven mobile-first CSS
├── tests/
│   ├── model.test.js              # node --test — pure logic
│   └── db.test.js                 # node --test — CRUD via injected fake client
├── supabase/schema.sql            # tables + RLS + updated_at trigger (run in Task 0)
├── assets/icon-192.png, icon-512.png   # PWA icons
├── package.json                   # scripts: test, serve
├── .github/workflows/pages.yml    # deploy to GitHub Pages
├── .github/workflows/test.yml     # node --test on push/PR
├── .gitignore
└── README.md
```

---

## Task 0: Supabase project setup (MANUAL — Joel, in the dashboard) — gates all other tasks

Not code. Produces the three config values + the live schema. Do this first; the app can't run without it.

- [ ] **Step 1: Create the project & the two accounts.**
  1. supabase.com → New project (free tier). Note the **Project URL** and **anon/public key** (Settings → API).
  2. Auth → Users → **Add user** → create **two** accounts (email + password), one each for Joel and Gabrielle. Copy **both User UIDs**.
  3. Auth → Providers/Settings → **disable "Allow new users to sign up"** (email signups off). This is the security gate — without it, the public anon key would let anyone self-register.

- [ ] **Step 2: Run the schema + RLS.** SQL Editor → paste and run `supabase/schema.sql` (created in Task 1, but the SQL is here so you can run it now):

```sql
-- lists + items
create table lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  sort_order int not null default 0,
  created_by uuid default auth.uid(),   -- who added it (for future "who added this" UI); null for admin/dashboard inserts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  name text not null,
  quantity int not null default 1,
  checked boolean not null default false,
  watch boolean not null default false,
  sort_order int not null default 0,
  created_by uuid default auth.uid(),   -- who added it (for future "who added this" UI); null for admin/dashboard inserts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_list_id_idx on items(list_id);

-- bump updated_at on every write
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger lists_touch before update on lists for each row execute function touch_updated_at();
create trigger items_touch before update on items for each row execute function touch_updated_at();

-- RLS scoped to the two household accounts (replace both placeholders with the real User UIDs)
alter table lists enable row level security;
alter table items enable row level security;
create policy household_lists on lists for all
  using (auth.uid() in ('HOUSEHOLD_USER_UUID_1', 'HOUSEHOLD_USER_UUID_2'))
  with check (auth.uid() in ('HOUSEHOLD_USER_UUID_1', 'HOUSEHOLD_USER_UUID_2'));
create policy household_items on items for all
  using (auth.uid() in ('HOUSEHOLD_USER_UUID_1', 'HOUSEHOLD_USER_UUID_2'))
  with check (auth.uid() in ('HOUSEHOLD_USER_UUID_1', 'HOUSEHOLD_USER_UUID_2'));

-- Realtime: publish both tables
alter publication supabase_realtime add table lists;
alter publication supabase_realtime add table items;
```

- [ ] **Step 3: Record the values.** For `config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (two values). The two **User UIDs** are substituted into the SQL policy above only (not `config.js`). **Go/no-go:** signing into each account via the Supabase API returns a session, and a `select` on `lists` as that user works (empty is fine). Provide the URL + anon key when dispatching Task 4.

---

## Task 1: Repo scaffold + schema file + CSS tokens

**Files:** Create `package.json`, `index.html`, `config.js`, `src/style.css`, `supabase/schema.sql`, `.gitignore`, `tests/` (empty), `README.md` (stub).

**Interfaces:** `package.json` scripts `test` (`node --test`) and `serve` (`python3 -m http.server 5173` or `npx serve`). `config.js` exports `{ SUPABASE_URL, SUPABASE_ANON_KEY }` (the two household UIDs live only in the RLS policy, not the client).

- [ ] **Step 1: `package.json`**

```json
{
  "name": "grocery-list-app",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 5173"
  }
}
```

- [ ] **Step 2: `config.js`** (values filled in Task 4 from Task 0; placeholders here so the app loads):

```js
// Public by design (Supabase anon key). RLS + disabled signups are the guard.
// The two household User UIDs are NOT here — they live only in the RLS policy
// (supabase/schema.sql), enforced server-side. The client needs just these two.
export const SUPABASE_URL = "https://REPLACE.supabase.co";
export const SUPABASE_ANON_KEY = "REPLACE_ANON_KEY";
```

- [ ] **Step 3: `index.html`** — app shell (mounts the app, registers the service worker, links manifest):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#16a34a">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="src/style.css">
  <title>Our Grocery Lists</title>
</head>
<body>
  <div id="status" role="status" hidden></div>
  <div id="app"><p class="loading">Loading…</p></div>
  <script type="module" src="src/main.js"></script>
  <script>
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
    // If the app module never boots (offline / CDN unreachable), replace the silent hang with a message.
    setTimeout(() => {
      const el = document.querySelector("#app .loading");
      if (el) el.textContent = "Can't reach the server — check your connection and reload.";
    }, 6000);
  </script>
</body>
</html>
```

- [ ] **Step 4: `supabase/schema.sql`** — the exact SQL from Task 0 Step 2 (single source of truth; Joel runs it in the dashboard).

- [ ] **Step 5: `src/style.css`** — mobile-first token CSS. Define `:root` tokens (colors, spacing, radius) then component classes (`.bar`, `.row`, `.box`, `.bell`, `.addbar`, `.fab`, checked/muted states) matching the approved mockup (green accent `#16a34a`, white cards, check box, grey/green bell). Keep it small; no raw hex outside `:root`.

- [ ] **Step 6: `.gitignore`** (`node_modules/`, `.DS_Store`, `.superpowers/`), `README.md` stub (one-liner + `npm test` / `npm run serve`).

- [ ] **Step 7: Verify + commit.** `python3 -c "import ast"` n/a; just confirm `node --test` runs (0 tests OK) and `git commit -m "chore: scaffold grocery-list-app (static PWA shell, config, schema, tokens)"`.

---

## Task 2: `model.js` — pure logic (TDD)

**Files:** Create `src/model.js`, `tests/model.test.js`.

**Interfaces (pure, no I/O):**
- `bySortOrder(rows) -> rows` (stable sort by `sort_order`, then `created_at`).
- `clampQuantity(q, delta) -> int` (min 1).
- `idsToClear(items) -> string[]` — ids where `checked && !watch` (the watch-safe "clear checked").
- `mergeRealtime(serverItems, pendingIds) -> items` — server-authoritative: return serverItems as-is, but for any id in `pendingIds` (a local mutation still in flight) keep the local optimistic row if present in `localByIdGetter`… (kept simple: see below).
- `watchNames(items) -> string[]` — names where `watch` (for a local preview of what the watcher would see).

- [ ] **Step 1: failing tests** (`tests/model.test.js`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { bySortOrder, clampQuantity, idsToClear, watchNames } from "../src/model.js";

test("bySortOrder sorts by sort_order then created_at", () => {
  const rows = [{sort_order:2,created_at:"b"},{sort_order:1,created_at:"a"},{sort_order:1,created_at:"z"}];
  assert.deepEqual(bySortOrder(rows).map(r=>r.sort_order), [1,1,2]);
});

test("clampQuantity never goes below 1", () => {
  assert.equal(clampQuantity(1,-1), 1);
  assert.equal(clampQuantity(3,-1), 2);
  assert.equal(clampQuantity(1,+1), 2);
});

test("idsToClear removes checked non-watched, keeps watched", () => {
  const items = [
    {id:"a",checked:true,watch:false},   // clear
    {id:"b",checked:true,watch:true},    // KEEP (watched)
    {id:"c",checked:false,watch:false},  // keep (not checked)
  ];
  assert.deepEqual(idsToClear(items), ["a"]);
});

test("watchNames returns only watched item names", () => {
  const items = [{name:"Chicken",watch:true},{name:"Milk",watch:false},{name:"Coffee",watch:true}];
  assert.deepEqual(watchNames(items), ["Chicken","Coffee"]);
});
```

- [ ] **Step 2: run → fail** (`npm test` → module not found / assertions).

- [ ] **Step 3: implement `src/model.js`:**

```js
export function bySortOrder(rows) {
  return [...rows].sort((a, b) =>
    (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)));
}
export function clampQuantity(q, delta) {
  return Math.max(1, (q || 1) + delta);
}
export function idsToClear(items) {
  return items.filter(i => i.checked && !i.watch).map(i => i.id);
}
export function watchNames(items) {
  return items.filter(i => i.watch).map(i => i.name);
}
```

- [ ] **Step 4: run → pass. Commit** `feat: pure list/item logic (sort, quantity, watch-safe clear, watch names)`.

---

## Task 3: `db.js` — dependency-injected data layer (TDD with a fake client)

**Files:** Create `src/db.js`, `tests/db.test.js`.

**Interfaces:** every function takes the Supabase `client` as its first arg (DI → testable). Each returns `data` or throws on `error`.
- `fetchLists(client)`, `createList(client,{name,emoji})`, `renameList(client,id,name)`, `deleteList(client,id)`
- `fetchItems(client,listId)`, `addItem(client,listId,name)`, `updateItem(client,id,patch)` (patch = any of `{name,quantity,checked,watch}`), `deleteItem(client,id)`
- `clearChecked(client,items)` — deletes `idsToClear(items)` via `deleteItem`.

- [ ] **Step 1: failing tests** (`tests/db.test.js`) using a minimal chainable fake:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchItems, addItem, updateItem, clearChecked } from "../src/db.js";

// Fake mirroring supabase-js v2 semantics closely enough to catch real bugs:
// insert/update return null data UNLESS .select() is chained (return=minimal default);
// .single() unwraps to one object; .then() makes the builder awaitable to {data,error}.
function fakeClient(canned = {}) {
  const calls = [];
  const builder = (table) => {
    let mode = "select", payload = null, single = false, selected = false;
    const q = { table };
    q.select = () => { selected = true; return q; };
    q.single = () => { single = true; return q; };
    q.insert = (rows) => { mode = "insert"; payload = rows; calls.push(["insert", table, rows]); return q; };
    q.update = (patch) => { mode = "update"; payload = patch; calls.push(["update", table, patch]); return q; };
    q.delete = () => { mode = "delete"; calls.push(["delete", table]); return q; };
    q.eq = () => q;
    q.order = () => q;
    q.then = (res) => {
      let data;
      if (mode === "select") data = canned[table] ?? [];
      else if (mode === "delete") data = null;
      else data = selected ? [{ id: "generated-id", ...payload }] : null; // insert/update need .select()
      res({ data: single && Array.isArray(data) ? (data[0] ?? null) : data, error: null });
    };
    return q;
  };
  return { from: builder, _calls: calls };
}

test("fetchItems selects items for a list", async () => {
  const c = fakeClient({ items: [{ id: "x", name: "Milk", sort_order: 0, created_at: "a" }] });
  const items = await fetchItems(c, "list1");
  assert.equal(items[0].name, "Milk");
});

test("addItem inserts with the list id and returns the created row (with id)", async () => {
  const c = fakeClient();
  const row = await addItem(c, "list1", "Eggs");
  const insert = c._calls.find(x => x[0] === "insert");
  assert.equal(insert[1], "items");
  assert.equal(insert[2].list_id, "list1");
  assert.equal(insert[2].name, "Eggs");
  assert.equal(row.id, "generated-id");  // .select().single() gave back the row → id available for self-echo
});

test("updateItem sends the patch and returns the updated row", async () => {
  const c = fakeClient();
  const row = await updateItem(c, "i1", { checked: true });
  const upd = c._calls.find(x => x[0] === "update");
  assert.deepEqual(upd[2], { checked: true });
  assert.equal(row.id, "generated-id");
});

test("mutations without .select() return null (contract guard — proves the fake enforces it)", async () => {
  const c = fakeClient();
  const { data } = await c.from("items").insert({ name: "x" }); // no .select()
  assert.equal(data, null);
});

test("clearChecked deletes only checked non-watched", async () => {
  const c = fakeClient();
  await clearChecked(c, [{id:"a",checked:true,watch:false},{id:"b",checked:true,watch:true}]);
  const deletes = c._calls.filter(x => x[0] === "delete");
  assert.equal(deletes.length, 1); // only "a"
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement `src/db.js`:**

```js
import { idsToClear, bySortOrder } from "./model.js";

async function run(q) { const { data, error } = await q; if (error) throw error; return data; }

export async function fetchLists(client) {
  return bySortOrder(await run(client.from("lists").select("*").order("sort_order")));
}
export async function createList(client, { name, emoji = null }) {
  // .select().single() → return the created row (needed for self-echo id + the "returns data" contract;
  // supabase-js defaults to return=minimal / null data without .select()).
  return run(client.from("lists").insert({ name, emoji }).select().single());
}
export async function renameList(client, id, name) {
  return run(client.from("lists").update({ name }).eq("id", id).select().single());
}
export async function deleteList(client, id) {
  return run(client.from("lists").delete().eq("id", id));
}
export async function fetchItems(client, listId) {
  return bySortOrder(await run(
    client.from("items").select("*").eq("list_id", listId).order("sort_order")));
}
export async function addItem(client, listId, name) {
  return run(client.from("items").insert({ list_id: listId, name }).select().single());
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
```

- [ ] **Step 4: run → pass. Commit** `feat: DI data layer (lists/items CRUD, watch-safe clearChecked)`.

---

## Task 4: `supabase.js` + `auth.js` + config values

**Files:** Create `src/supabase.js`, `src/auth.js`; fill real values into `config.js` (from Task 0).

**Interfaces:** `getClient()` (singleton Supabase client from config). `auth.js`: `currentSession(client)`, `signIn(client,email,password)`, `signOut(client)`, `renderSignIn(onSubmit)` (a minimal email+password form).

- [ ] **Step 1: `src/supabase.js`:**

```js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";
let _client;
export function getClient() {
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } });
  return _client;
}
```

- [ ] **Step 2: `src/auth.js`:**

```js
export async function currentSession(client) {
  const { data } = await client.auth.getSession();
  return data.session;
}
export async function signIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}
export async function signOut(client) { await client.auth.signOut(); }

export function renderSignIn(mount, onSubmit) {
  mount.innerHTML = `
    <form class="signin">
      <h1>Our Grocery Lists</h1>
      <input type="email" name="email" placeholder="Household email" autocomplete="username" required>
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      <p class="err" hidden></p>
    </form>`;
  const form = mount.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector(".err"); err.hidden = true;
    try { await onSubmit(form.email.value.trim(), form.password.value); }
    catch (ex) { err.textContent = "Sign-in failed — check the shared login."; err.hidden = false; }
  });
}
```

- [ ] **Step 3: fill `config.js`** with the real `SUPABASE_URL` / `SUPABASE_ANON_KEY` from Task 0 (the two User UIDs go into the RLS policy, not here).

- [ ] **Step 4: Verify + commit.** `node --test` still green (no new logic tests; auth verified manually in Task 8's live run). Commit `feat: Supabase client + shared-account auth (sign-in form + session)`.

---

## Task 5: `ui.js` — render + handlers (manual UI verification)

**Files:** Create `src/ui.js`.

**Interfaces:** `renderLists(mount, lists, handlers)` and `renderListDetail(mount, list, items, handlers)` where `handlers` are callbacks: `onOpenList`, `onNewList`, `onRenameList`, `onDeleteList`, `onAddItem`, `onToggleCheck`, `onQty`, `onToggleWatch`, `onEditItem`, `onDeleteItem`, `onBack`, `onClearChecked`, **`onSignOut`**. Pure DOM render from data + wiring events to callbacks; **no Supabase calls here** (main.js wires handlers → db.js). Renders the approved mockup: lists home (rows + counts + New list) and list detail (rows with check box, name, qty ±, 🔔 toggle, add-bar). Checked items greyed/struck; watched 🔔 green vs grey. Deleting a watched item calls a confirm first.

- [ ] **Step 1: implement `src/ui.js`** — compact but complete render functions using `bySortOrder` for order, buttons wired to the handler callbacks. Specifics:
  - **Sign out:** the lists-home header includes a small "Sign out" control wired to `onSignOut` (so the `main.js` handler is reachable).
  - **Empty states:** `renderLists` shows "No lists yet — create one below" when `lists` is empty; `renderListDetail` shows "This list is empty — add an item below" when `items` is empty (instead of a blank container).
  - **Delete confirm:** deletion of a `watch` item is guarded by `confirm("This item is on your deal-watch list — remove it anyway?")`.

- [ ] **Step 2: Commit** `feat: UI render + handlers for lists home and list detail`. (No unit tests — DOM/UX verified manually in Task 8; logic it depends on is already tested in `model.js`.)

---

## Task 6: `main.js` — wire everything + realtime (TDD the merge rule)

**Files:** Create `src/main.js`; add a realtime-merge test to `tests/model.test.js` (extend `model.js` with the pure merge helper).

**Interfaces:** extend `model.js` with `applyRealtime(serverItems, pending)` — pure: given the freshly-fetched server items and a `Set` of `pendingIds` (ids with a local mutation still in flight), return serverItems unchanged (server-authoritative) EXCEPT drop nothing; the pending set is used by `main.js` only to decide whether to skip a re-render triggered by its own echo. Keep the pure part tiny and tested; the subscription plumbing lives in `main.js` (manual/integration verified).

- [ ] **Step 1: failing test** — add to `tests/model.test.js`:

```js
import { isSelfEcho } from "../src/model.js";
test("isSelfEcho suppresses own echoes (updates AND just-created ids) and passes remote changes", () => {
  // main.js adds a created row's real id to `pending` after the insert resolves,
  // so a create's own echo is suppressed just like an update's.
  const pending = new Set(["i1", "new-uuid"]);
  assert.equal(isSelfEcho({ id: "i1" }, pending), true);        // own update echo → skip
  assert.equal(isSelfEcho({ id: "new-uuid" }, pending), true);  // own create echo → skip
  assert.equal(isSelfEcho({ id: "remote" }, pending), false);   // real remote change → refresh
  assert.equal(isSelfEcho(undefined, pending), false);          // null-safe (deleted rows w/ no payload)
});
```

**Note on reconciliation testing (spec §10):** the realtime model is *refetch-and-replace* (server-authoritative), which makes out-of-order events **safe by construction** — every event triggers a full re-fetch, so the final rendered state is always the latest server snapshot regardless of event order (no per-payload merge to get wrong). The only realtime logic worth unit-testing is therefore self-echo suppression (above); the cross-device "both phones update live" behavior is verified in the Post-A1 live run. (This corrects the earlier over-claim of a full merge test.)

- [ ] **Step 2: run → fail. Implement `isSelfEcho` in `model.js`:**

```js
export function isSelfEcho(row, pendingIds) { return pendingIds.has(row?.id); }
```

- [ ] **Step 3: implement `src/main.js`** — the wiring (verified manually + by the pure tests):

```js
import { getClient } from "./supabase.js";
import { currentSession, signIn, signOut, renderSignIn } from "./auth.js";
import * as db from "./db.js";
import { renderLists, renderListDetail } from "./ui.js";
import { isSelfEcho, idsToClear } from "./model.js";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const client = getClient();
const pending = new Set();          // REAL row ids of in-flight local mutations (self-echo suppression)
let state = { view: "lists", listId: null };

function setStatus(msg) {            // transient inline banner (errors / reconnecting)
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.hidden = !msg;
  if (msg) setTimeout(() => { if (statusEl.textContent === msg) statusEl.hidden = true; }, 4000);
}

// Run a write; suppress its own realtime echo by the AFFECTED row id(s); surface errors to the user.
async function mutate(fn, knownIds = []) {
  knownIds.forEach(id => pending.add(id));
  try {
    const rows = await fn();                         // create/update fns return the affected row (db.js chains .select())
    const created = [].concat(rows || []).map(r => r && r.id).filter(Boolean);
    created.forEach(id => pending.add(id));           // covers creates whose id we didn't know up front
    await refresh();
    const all = knownIds.concat(created);
    setTimeout(() => all.forEach(id => pending.delete(id)), 1500);  // clear after the echo window
  } catch (e) {
    knownIds.forEach(id => pending.delete(id));
    setStatus("Couldn't save — check your connection.");
    try { await refresh(); } catch {}                // revert optimistic view to server truth
  }
}

async function refresh() {
  if (state.view === "lists") {
    renderLists(app, await db.fetchLists(client), handlers);
  } else {
    const lists = await db.fetchLists(client);
    const list = lists.find(l => l.id === state.listId);
    if (!list) { state = { view: "lists", listId: null }; return refresh(); }
    renderListDetail(app, list, await db.fetchItems(client, state.listId), handlers);
  }
}

const handlers = {
  onOpenList: (id) => { state = { view: "detail", listId: id }; refresh(); },
  onBack: () => { state = { view: "lists", listId: null }; refresh(); },
  onNewList: (name) => mutate(() => db.createList(client, { name })),
  onRenameList: (id, name) => mutate(() => db.renameList(client, id, name), [id]),
  onDeleteList: (id) => mutate(() => db.deleteList(client, id), [id]),
  onAddItem: (name) => mutate(() => db.addItem(client, state.listId, name)),
  onToggleCheck: (it) => mutate(() => db.updateItem(client, it.id, { checked: !it.checked }), [it.id]),
  onToggleWatch: (it) => mutate(() => db.updateItem(client, it.id, { watch: !it.watch }), [it.id]),
  onQty: (it, q) => mutate(() => db.updateItem(client, it.id, { quantity: q }), [it.id]),
  onEditItem: (it, name) => mutate(() => db.updateItem(client, it.id, { name }), [it.id]),
  onDeleteItem: (it) => mutate(() => db.deleteItem(client, it.id), [it.id]),
  onClearChecked: (items) => mutate(() => db.clearChecked(client, items), idsToClear(items)),
  onSignOut: async () => { await signOut(client); boot(); },
};

function subscribeRealtime() {
  // Server-authoritative: any change refetches & replaces. Out-of-order events are inherently
  // safe (we always render the latest full fetch); own echoes are dropped via the pending set.
  const onChange = (p) => { if (!isSelfEcho(p.new || p.old, pending)) refresh(); };
  client.channel("db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, onChange)
    .subscribe();
  window.addEventListener("online", () => { setStatus(""); refresh(); });
  window.addEventListener("offline", () => setStatus("Reconnecting…"));
}

async function boot() {
  const session = await currentSession(client);
  if (!session) { renderSignIn(app, async (email, pw) => { await signIn(client, email, pw); boot(); }); return; }
  await refresh();
  subscribeRealtime();
}
boot();
```

- [ ] **Step 4: run `npm test` (green). Commit** `feat: wire app — auth gate, CRUD handlers, server-authoritative realtime`.

---

## Task 7: PWA (manifest + service worker + icons)

**Files:** Create `manifest.webmanifest`, `sw.js`, `assets/icon-192.png`, `assets/icon-512.png`.

- [ ] **Step 1: `manifest.webmanifest`:**

```json
{
  "name": "Our Grocery Lists",
  "short_name": "Groceries",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#16a34a",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: `sw.js`** — minimal app-shell cache (network-first for Supabase/CDN, cache-first for the shell) so it installs and loads fast; do NOT cache Supabase API responses (data must be live):

```js
const SHELL = "shell-v1";
// Precache the full local app (shell + all ES modules + config) so an offline same-origin
// load runs the app rather than hanging on a missing module fetch. The Supabase/esm.sh
// requests still go to the network (data must be live); if they fail, main.js shows the
// "Reconnecting…" banner and index.html's boot-timeout shows a friendly message.
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./config.js",
  "./src/style.css", "./src/main.js", "./src/supabase.js", "./src/db.js",
  "./src/model.js", "./src/auth.js", "./src/ui.js"
];
self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS))));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;          // let Supabase/CDN go to network
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

- [ ] **Step 3: icons** — generate two simple PNG icons (a 🛒 on the green `#16a34a`) at 192 and 512. (Any quick generator; commit the PNGs.)

- [ ] **Step 4: Commit** `feat: PWA manifest + app-shell service worker + icons`.

---

## Task 8: GitHub Pages deploy + CI + README

**Files:** Create `.github/workflows/pages.yml`, `.github/workflows/test.yml`, flesh out `README.md`.

- [ ] **Step 1: `test.yml`** — run `node --test` on push/PR:

```yaml
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: node --test
```

- [ ] **Step 2: `pages.yml`** — deploy the static files to GitHub Pages on push to main:

```yaml
name: pages
on:
  push: { branches: [main] }
  workflow_dispatch: {}
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deploy.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: "." }
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: `README.md`** — what it is; local run (`npm run serve` → open `localhost:5173` on phone via LAN); the Task-0 Supabase setup recap; **"Add to Home Screen"** install steps for iOS (Share → Add to Home Screen) and Android; note the `config.js` values are public-by-design and RLS+disabled-signups are the guard.

- [ ] **Step 4: Enable Pages** (repo Settings → Pages → Source: GitHub Actions) — manual, note it in README.

- [ ] **Step 5: Commit** `ci: GitHub Pages deploy + node --test CI + README`.

---

## Post-A1: live validation (manual, Joel)

- [ ] `gh repo create joelkhchan2/grocery-list-app --private --source=. --push` (confirm first). Enable Pages.
- [ ] Open the Pages URL on both phones, each sign into your own account, **Add to Home Screen** on each.
- [ ] Create a list, add items, check one off, toggle 🔔 on a couple, edit a quantity — confirm the other phone updates live.
- [ ] Confirm RLS: signed out (or a random anon) can't read the data.
- [ ] Deferred to **A2**: reordering polish, "clear checked" button, emoji picker, the monthly export Action + daily keepalive ping (spec §11/§14).
- [ ] Deferred to **grocery-watcher Phase 2c**: the `SupabaseWatchListSource` adapter reading `watch=true` items.

---

## Self-Review

**Spec coverage (design §1–§14):** two-people/shared/live-sync → Tasks 4,6 (two-account auth sharing household-global data + server-authoritative realtime). App-like UI (lists/items CRUD, quantity, check, 🔔) → Tasks 5,6 + the approved mockup. PWA install iOS+Android → Task 7. Free-tier/low-maintenance + watcher-readable → Task 0 (Supabase) + the data model. Auth = two accounts (own login each, shared data), **signups disabled**, **RLS allow-lists both household uids** → Task 0 + config. Data model + `updated_at` trigger → Task 0/1. Watch-flag lifecycle (clear-checked = `checked && !watch`, confirm on deleting watched) → Task 2 (`idsToClear`) + Task 5 (confirm). Realtime (server-authoritative refetch-and-replace; self-echo suppressed by **real row id** — creates add their returned id to `pending` after insert) → Task 6 (`isSelfEcho` + `mutate`); out-of-order events are safe by construction (always render the latest fetch), so no bespoke merge test is claimed — self-echo is unit-tested, cross-device is the Post-A1 live check. **Error/offline handling** (§11 "reconnecting"): `mutate` try/catch → inline `#status` banner + revert-to-server refresh; `online`/`offline` listeners; index.html boot-timeout message → Task 1/6. Mutations chain `.select()` so they return the row (real Supabase would return null otherwise); the fake client enforces this → Task 3. Empty states + reachable sign-out → Task 5. SW precaches all local modules → Task 7. Testing: pure logic (Task 2), DI data layer incl. the `.select()` contract guard (Task 3), self-echo (Task 6); UI + cross-device realtime verified manually (Task 5 / Post-A1). Hosting = GitHub Pages → Task 8. Watcher integration + monthly export + keepalive → deferred (Phase 2c / A2).

**Placeholder scan:** `config.js` values and the SQL's `HOUSEHOLD_USER_UUID_1`/`_2` are intentional fill-ins from the manual Task 0 (real values Joel provides), not TODOs — every code block is otherwise complete. Icons (Task 7) are a generated asset, not code.

**Type consistency:** `db.js` functions all take `client` first and are called that way in `main.js` handlers. `model.js` helpers (`bySortOrder`, `idsToClear`, `isSelfEcho`, `clampQuantity`, `watchNames`) are imported where used (db.js, main.js) and each is unit-tested. `ui.js` render signatures (`renderLists`, `renderListDetail`) match their `main.js` call sites; handler callback names match between `ui.js` wiring and the `handlers` object in `main.js`. Supabase client shape (`.from().select/insert/update/delete/eq/order`, `.auth.*`, `.channel().on().subscribe()`) is used consistently and mirrored by the fake client in `db.test.js`.
