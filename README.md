# Grocery List App

A shared, installable grocery-list PWA for two phones (vanilla JS + Supabase). Joel and Gabrielle each sign into their own account and see the same lists with live updates as items are added, checked off, or edited. Each item has a per-item 🔔 watch toggle: items marked "watch" feed into a separate grocery-watcher project, which tracks them for restocks or price drops.

Each item has a name, a free-text **amount** (e.g. "500 g", "2 L", or a plain number, which gets +/- steppers), and an optional **note**. The add box suggests recently used items as you type. Deleting an item (swipe left, or the delete control) can be undone; deleting a watched item asks for confirmation first, since it also feeds the grocery-watcher project.

## Themes & appearance

Tap ⚙️ → Appearance to pick from 8 themes. The default is **Terracotta**. There's also a "match system light/dark" option, which switches to the Midnight theme automatically when the phone is in dark mode.

Theme choice is remembered **per device**, stored in the browser's localStorage. It is not synced through Supabase, so each phone can have its own theme independent of the other.

## Running locally

```
npm run serve
```

This starts a static file server on `http://localhost:5173`. Open that URL in your browser.

To test from a phone on the same Wi-Fi network, find your machine's LAN IP (e.g. `ipconfig getifaddr en0` on macOS) and open `http://<your-ip>:5173` on the phone instead of `localhost`.

## Running tests

```
npm test
```

Runs the Node test suite (`node --test`) covering the pure logic (`model.js`), the Supabase data layer (`db.js`, via a fake client), and realtime self-echo suppression.

## Supabase setup (manual, one-time, "Task 0")

This app uses **two Supabase accounts**, one each for Joel and Gabrielle, with a shared set of lists (the data is household-global, so both accounts see and edit the same lists). Do this once, before the app can connect to real data:

1. Create a new Supabase project (free tier is fine).
2. In Authentication, create **two** users (email + password), one for each person, and **disable public sign-ups** so no one else can register. Copy each user's UID from its detail page.
3. In the SQL editor, run `supabase/schema.sql`. Before running it, replace `HOUSEHOLD_USER_UUID_1` and `HOUSEHOLD_USER_UUID_2` in the RLS policies with the two users' actual UIDs.
4. Copy two values into `config.js` at the repo root:
   - `SUPABASE_URL` — the project URL
   - `SUPABASE_ANON_KEY` — the project's anon/public key

   The two User UIDs do not go in `config.js`; they live only in the RLS policy, enforced server-side.

`config.js` is not a secret file. The URL and anon key are meant to be public in a client-side app; see "Security model" below for why that's safe here.

If you already set up a project against the earlier schema, run `supabase/migrate-redesign.sql` once too (adds `amount`, `note`, and the `item_history` table).

## Installing on a phone ("Add to Home Screen")

Once the app is deployed (see "Deploying" below) or running locally and reachable from the phone, install it so it behaves like a native app:

**iOS (Safari):**
1. Open the app URL in Safari.
2. Tap the Share icon.
3. Tap "Add to Home Screen".

**Android (Chrome):**
1. Open the app URL in Chrome.
2. Tap the install prompt if it appears, or open the menu (⋮) and tap "Install app" / "Add to Home Screen".

Do this on both phones, each signed into your own account, so both people get live updates.

## Deploying (GitHub Pages)

This repo includes two GitHub Actions workflows:

- `.github/workflows/test.yml` — runs `node --test` on every push and pull request.
- `.github/workflows/pages.yml` — deploys the static site to GitHub Pages on every push to `main` (also runnable manually via workflow_dispatch).

Before the deploy workflow can publish anything, enable Pages once, manually: repo **Settings → Pages → Source: GitHub Actions**. After that, pushes to `main` deploy automatically.

## Security model

There's no server and no secrets file: `config.js` ships the Supabase project URL and anon key directly in client-side code, and that file is committed to the repo. This is intentional, not an oversight. The anon key only grants what Row Level Security (RLS) allows, and RLS here is scoped to the two household user UIDs. Combined with public sign-ups being disabled, an attacker with the URL and anon key still can't read or write data unless they can also authenticate as one of the two household accounts. The real access control is RLS + disabled sign-ups, not secrecy of the anon key.
