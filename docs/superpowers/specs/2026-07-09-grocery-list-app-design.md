# Grocery List App — Design Spec

- **Status:** Approved (design), pending spec-review
- **Date:** 2026-07-09
- **Owner:** Joel Chan (personal; private repo `joelkhchan2/grocery-list-app`)
- **Related:** feeds the existing `grocery-watcher` (replaces `watchlist.yaml` as the watch-list source, via a `SupabaseWatchListSource` adapter — grocery-watcher Phase 2c).

## 1. Purpose
A shared, mobile-first web app ("our own mini-Listonic") for Joel and Gabrielle to manage multiple grocery/shopping lists from their own phones. Any item can be flagged **🔔 watch for deals**; the grocery-watcher reads those flagged items each Wednesday. Built because Listonic's API is unusable for the watcher (no public app secret; Joel's account is Google-SSO).

## 2. Goals & non-goals
**Goals**
- Two people, separate phones, one shared set of lists, synced live.
- Real app-like UI: create/rename/delete lists; add/edit/delete/check-off items; quantities; per-item watch toggle.
- Installable to the home screen (PWA) on iOS + Android.
- Free-tier, low-maintenance; readable by the headless grocery-watcher.

**Non-goals (v1)**
- Native app-store build (Capacitor APK) — PWA covers it; Capacitor is a documented fallback only.
- Multi-household / sharing-permission systems / roles (just the two fixed household accounts, both with identical full access).
- Barcode scanning, price tracking, recipes, categories, notes — out of v1 (revisit after the UX review).
- Offline-first editing (v1 requires connectivity; graceful "reconnecting" state).

## 3. Users & context
Two users (Joel + Gabrielle), each on their own phone (assume one iOS, one Android — PWA covers both). Non-technical usage: adding/checking items must be tap-simple. Budget: free tiers only.

## 4. Stack
- **Frontend:** zero-build vanilla JS (ES modules) + token-driven CSS, mobile-first — the Letter Ride pattern (no framework, no build step; `index.html` → `src/main.js`). Supabase JS client loaded from CDN.
- **PWA:** a `manifest.webmanifest` (name, icons, `display: standalone`) + a minimal service worker (caches the app shell for install + fast load). Installable via "Add to Home Screen".
- **Backend:** **Supabase** — Postgres + Auth + auto REST (PostgREST) + Realtime.
- **Hosting:** **GitHub Pages** (static, free), deployed from the repo via GitHub Actions (or Pages' built-in build). Custom domain optional later.
- **Realtime:** Supabase Realtime subscriptions on `lists` and `items` so both phones reflect changes live.

## 5. Auth
**Two accounts, one each for Joel and Gabrielle** (email + password), sharing one set of lists. The data is household-global (no per-user ownership in the schema), so "shared" comes from the RLS rule allow-listing both user IDs, not from sharing one login. Each phone signs into its own account once; the Supabase session persists (stay logged in). Supabase Auth with email+password. No Google OAuth: with OAuth, sign-ups can't be fully disabled (any Google user could complete the flow), so the belt-and-suspenders of "sign-ups disabled + RLS" is lost, and the redirect flow is occasionally unreliable on an installed iOS home-screen PWA; email+password keeps individual logins without either drawback. The app's **anon key** is embedded in the static site (standard Supabase practice); **Row-Level Security is the real guard**.

**Public sign-ups MUST be disabled** (Supabase Dashboard → Auth → disable email signups) immediately after the two accounts are created — otherwise, because the anon key is public, anyone could self-register into the `authenticated` role. See §6 for the matching RLS scoping.

**Onboarding & recovery:** each person's credential is stored in their own password manager (or set on their phone directly); if forgotten, Joel resets it from the Supabase dashboard. Note: iOS home-screen PWAs may evict stored session storage after long dormancy, so an occasional re-login on iOS is expected and acceptable.

## 6. Data model (Postgres) + RLS
```
lists:  id (uuid pk) · name (text) · emoji (text null) · sort_order (int)
        · created_by (uuid null, default auth.uid()) · created_at (timestamptz) · updated_at (timestamptz default now())
items:  id (uuid pk) · list_id (uuid fk → lists) · name (text) · quantity (int default 1)
        · checked (bool default false) · watch (bool default false) · sort_order (int)
        · created_by (uuid null, default auth.uid()) · created_at · updated_at (timestamptz default now())
```
`updated_at` (bumped on write via a trigger or the client) is the reconciliation key for realtime merges (§11). `created_by` records the account that added each row (auto-set from `auth.uid()`); captured from day one so a future "who added this" UI (A2) needs no data backfill.

**RLS:** enable on both tables. The policy is scoped to the **two household user ids**, not the broad `authenticated` role: `USING (auth.uid() IN ('<UID_1>', '<UID_2>'))` (and the same `WITH CHECK`) for `all` commands on both tables (fill in the two accounts' uids at setup). Combined with **public sign-ups disabled** (§5), this means the public anon key alone grants nothing — no self-registration, and any authenticated session that isn't one of the two household accounts is denied. **anon** has no access. The grocery-watcher reads server-side with the **service key**, which bypasses RLS.

## 7. Features (MVP)
- **Lists home:** list of all lists with item counts; create (name + optional emoji), rename, delete (with confirm), reorder.
- **List detail:** items rendered as rows — tap the box to check/uncheck (checked sinks/greys), quantity control (default 1, +/−), a **🔔 watch toggle**, edit name (tap), delete (swipe or long-press). "Add item…" bar at the bottom. Optional "clear checked" action.
- **Watch-flag lifecycle (important):** `checked` (transient — bought it this trip) and `watch` (persistent — track for deals) are independent. **"Clear checked" deletes only rows where `checked=true AND watch=false`** — a watched item is never removed by a routine tidy-up; it just un-checks and stays. Deleting a **watched** item directly requires a confirm ("This item is on your deal-watch list — remove it anyway?"). This protects the §13 guarantee that a 🔔 item keeps appearing in the watcher.
- **Watch toggle:** per item; the set of `watch=true` items is what the grocery-watcher consumes.
- **Realtime:** edits on one phone appear on the other within a second.
- **Install:** PWA installable; app icon + splash.

## 8. Grocery-watcher integration (grocery-watcher Phase 2c — separate plan)
- `SupabaseWatchListSource(WatchListSource)` reads `GET {SUPABASE_URL}/rest/v1/items?watch=eq.true&select=name` with headers `apikey`/`Authorization: Bearer <service key>`. Maps each `name` → `WatchItem(name, keywords=watch_keywords_from_name(name))` (reusing the Phase-2b helper + interface).
- Config: `watchlist_source: supabase`; secrets `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (GitHub Actions secrets, read from `os.environ`, never echoed).
- A safe CI connectivity-check (counts only), mirroring the Listonic check pattern.
- `watchlist.yaml` remains a fallback source (flip `watchlist_source` back anytime).

## 9. Build phases
- **A1 (MVP):** Supabase project + schema + RLS + shared-account auth; the vanilla-JS PWA (lists + items CRUD + quantity + check + watch toggle + add-bar), realtime sync, deployed to a GitHub Pages URL both phones use and can install.
- **A2 (fast-follow, optional):** reordering polish, "clear checked" (with the watch-safe rule from §7), emoji picker, install prompt nicety, a **"who added this" indicator** (surfacing the `created_by` column already captured in A1), and the scheduled **monthly data-export** Action + **daily keepalive ping** (§11, §14).
- **Watcher Phase 2c:** the `SupabaseWatchListSource` adapter + config + secrets + connectivity check.
- **Interim feedback (cheap, do first):** after ~2 weeks of real use, Joel + Gabrielle note what's annoying; fix those directly.
- **Future (post-MVP):** a thorough **staff-level UX/UI + external-research-informed design review** (Joel's explicit ask), then a polish pass driven by it.

## 10. Testing
- App: `node --test` on the pure data/logic layer (item/list operations, serialization/normalization) with an injected Supabase client (dependency-injected, mockable) — Letter Ride's DI pattern.
- **Realtime reconciliation test (the highest-risk path):** a mocked-transport test that simulates (a) a local optimistic edit followed by the echoed realtime event for the same row, and (b) two out-of-order realtime events for one item — asserting the final rendered state is correct and idempotent (no flicker/stale-overwrite). Manual single-device UI can't reproduce this, so it must be covered here.
- Manual UI verification on a phone (install + basic flows).
- Watcher adapter: unit tests with a mocked HTTP transport (like the Listonic client) + CI connectivity-check.

## 11. Error handling & reliability
- App requires connectivity; show a "reconnecting…" state on network loss; optimistic UI on edits with Supabase persisting. No data loss on transient drops (Supabase client retries/reconnects realtime).
- **Realtime merge rule (server-authoritative, keep it simple):** on any realtime event for a list, the client **refetches that list's items and replaces local state** rather than surgically merging payloads. Local optimistic edits render immediately and are reconciled by that authoritative refetch; each local mutation carries a client id so the client **ignores its own echoed event** (avoids flicker), and `updated_at` breaks ties (last-write-wins). Keeps realtime robust without a bespoke merge/CRDT layer.
- **Data safety:** household data lives only in one free Supabase project. A scheduled **monthly CSV/`pg_dump` export** (small GitHub Action, service key) writes a backup so a paused-then-deleted project isn't total loss (see §14).
- Watcher: adapter failures raise → the existing failure-alarm; `watchlist.yaml` fallback preserves the weekly digest.

## 12. Security
- Anon key embedded in the static site is safe by Supabase design; RLS restricts all access to the two authenticated household accounts (anon denied).
- Service key (watcher) is a GitHub Actions secret only, never in the app or client, never echoed/logged.
- Each account's credentials known only to its owner (Joel or Gabrielle).

## 13. Success criteria
- Both phones sign in once, see and edit the same lists, and changes sync live.
- App installs to the home screen on both phones and feels like an app.
- Toggling 🔔 on an item makes it appear in the grocery-watcher's watch-list on the next Wednesday run (once Phase 2c ships).
- Runs on free tiers; no ongoing cost.

## 14. Open questions / risks
- iOS PWA limitations (no push; install is "Add to Home Screen" via Share sheet) — acceptable; we need no push.
- Supabase free-tier project **pausing after inactivity, and eventually being deleted** if left paused. A once-weekly watcher read has no margin against drift/outages, and a paused project needs a **manual dashboard "Resume"** (the service key can't unpause it). Mitigations: (a) a **lightweight daily keepalive ping** (a tiny scheduled Action hitting the REST endpoint) so it never approaches the pause window; (b) if a Wednesday failure-alarm fires, it may mean "go Resume the Supabase project," not just "check secrets" — document that in the watcher README; (c) the monthly export (§11) guards against the delete case.
- Realtime complexity in vanilla JS — Supabase JS handles subscriptions; keep the render simple (re-render list on change).
