// Ha fejlesztői környezetben (localhost / 127.0.0.1) fut, azonnal töröljük a cache-t és leiratkozunk, hogy ne blokkolja a többi portot
if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => {
    e.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
    );
  });
  self.addEventListener('fetch', (e) => {
    // Közvetlen hálózati kérés, semmi cache
    return;
  });
} else {
  const CACHE_NAME = 'ai-latex-v1';
  const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
  ];

  self.addEventListener('install', (e) => {
    e.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(ASSETS);
      })
    );
  });

  self.addEventListener('fetch', (e) => {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        return cachedResponse || fetch(e.request);
      })
    );
  });
}
