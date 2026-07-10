const SHELL = "shell-v18";
// App-shell cache for offline/install. Strategy is NETWORK-FIRST for same-origin
// files: always try the latest over the network and refresh the cache, falling back
// to cache only when offline. This (plus skipWaiting + clients.claim) means a new
// deploy takes effect on the next load — no more "fully close the app to update".
// Supabase / esm.sh requests always go straight to the network (data must be live).
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./config.js",
  "./src/style.css", "./src/main.js", "./src/supabase.js", "./src/db.js",
  "./src/model.js", "./src/auth.js", "./src/ui.js", "./src/theme.js", "./src/category.js"
];

self.addEventListener("install", (e) => e.waitUntil(
  caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));

self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // Supabase/CDN → network as-is
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request)));            // offline → serve cached shell
});
