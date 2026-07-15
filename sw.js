const SHELL = "shell-v47";
// App-shell cache (same-origin) is NETWORK-FIRST: always try the latest, fall back to cache
// offline. RUNTIME is a long-lived CACHE-FIRST store for static CDN libs (esm.sh) + web fonts,
// so the app boots even when esm.sh is slow/unreachable and repeat loads skip the network for
// the big Supabase bundle. Supabase API/realtime is never cached (data must be live).
const RUNTIME = "cdn-v1";
const CDN_HOSTS = ["esm.sh", "fonts.googleapis.com", "fonts.gstatic.com"];
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./config.js",
  "./src/style.css", "./src/main.js", "./src/supabase.js", "./src/db.js",
  "./src/model.js", "./src/auth.js", "./src/ui.js", "./src/theme.js", "./src/category.js"
];

self.addEventListener("install", (e) => e.waitUntil(
  caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));

self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

function isCdn(url) {
  return CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Same-origin app shell: network-first, refresh cache, fall back to cache offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request)));
    return;
  }

  // Static CDN libs + fonts: cache-first (serve cached, else fetch once and cache). Reconstruct
  // the Response so redirected CDN responses (e.g. esm.sh version redirects) are cacheable.
  if (e.request.method === "GET" && isCdn(url)) {
    e.respondWith(caches.open(RUNTIME).then((cache) =>
      cache.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          copy.blob().then((body) => cache.put(e.request,
            new Response(body, { status: copy.status, statusText: copy.statusText, headers: copy.headers })
          )).catch(() => {});
        }
        return res;
      }))));
    return;
  }

  // Everything else cross-origin (Supabase REST/realtime) → straight to the network, uncached.
});
