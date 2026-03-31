self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open('app-shell-v1');
    await cache.addAll(['/','/manifest.webmanifest']);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    try {
      const network = await fetch(event.request);
      return network;
    } catch (e) {
      const cache = await caches.open('app-shell-v1');
      const cached = await cache.match(event.request);
      return cached || Response.error();
    }
  })());
});
