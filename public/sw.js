const CACHE = "dom-os-shell-v2";
const CACHE_PREFIX = "dom-os-shell-";
const SHELL = ["/offline", "/icon.png", "/apple-icon.png", "/brand/dom-icon-mark.png"];

function isSafeShellRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (request.headers.has("authorization")) return false;
  return url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname);
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type !== "PURGE_DOM_SHELL_CACHE") return;
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => caches.match("/offline"))
    );
    return;
  }

  if (!isSafeShellRequest(request, url)) return;

  event.respondWith(
    caches.match(request).then(hit => {
      if (hit) return hit;
      return fetch(request).then(response => {
        if (!response.ok || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
