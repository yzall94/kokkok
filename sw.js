const CACHE_NAME = "kokkok-v1";
const STATIC_ASSETS = [
  "/kokkok/",
  "/kokkok/index.html",
  "/kokkok/reveal.html",
  "/kokkok/css/style.css",
  "/kokkok/js/app.js",
  "/kokkok/js/supabase-client.js",
  "/kokkok/js/reveal.js",
  "/kokkok/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("supabase.co")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
