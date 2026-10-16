// POS counter service worker (TASKS P2-10). Makes the app installable and
// keeps its static files (JS, CSS, icons) on the tablet. Sales, shifts and
// sign-in always go to the network: a till must never act on stale data, and
// a sale can't be taken offline (the backend prices it and takes the stock).

const CACHE = "pos-static-v1"

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  const isStatic =
    event.request.method === "GET" &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
  if (!isStatic) {
    return
  }
  // Hashed file names never change, so cache first.
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(event.request, copy))
          }
          return res
        })
    )
  )
})
