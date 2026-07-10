const SHELL = "shell-v15";
// Precache the full local app (shell + all ES modules + config) so an offline same-origin
// load runs the app rather than hanging on a missing module fetch. The Supabase/esm.sh
// requests still go to the network (data must be live); if they fail, main.js shows the
// "Reconnecting…" banner and index.html's boot-timeout shows a friendly message.
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./config.js",
  "./src/style.css", "./src/main.js", "./src/supabase.js", "./src/db.js",
  "./src/model.js", "./src/auth.js", "./src/ui.js", "./src/theme.js", "./src/category.js"
];
self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS))));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;          // let Supabase/CDN go to network
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
