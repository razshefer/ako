// Offline shell for Ako. App files are cache-first; content JSON is
// network-first so edited packs show up without bumping the version.
const VERSION = 'ako-v1';
const SHELL = [
  './',
  './index.html',
  './app/css/style.css',
  './app/js/main.js',
  './app/js/util.js',
  './app/js/store.js',
  './app/js/srs.js',
  './app/js/session.js',
  './app/js/content.js',
  './app/js/glossary.js',
  './app/js/sound.js',
  './app/js/components/bits.js',
  './app/js/components/celebrate.js',
  './app/js/components/conceptsheet.js',
  './app/js/components/exercise.js',
  './app/js/components/icons.js',
  './app/js/views/home.js',
  './app/js/views/session.js',
  './app/js/views/progress.js',
  './app/js/views/library.js',
  './app/js/views/settings.js',
  './app/js/views/flow.js',
  './app/manifest.webmanifest',
  './app/icons/icon-192.png',
  './app/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isContent = url.pathname.includes('/content/');

  if (isContent) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
