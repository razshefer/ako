// Offline shell for Ako. App files are cache-first; content JSON is
// network-first so edited packs show up without bumping the version.
//
// VERSION is a hash of the files listed below, written by `tools/stamp.py` and
// checked by the linter. Do not edit it by hand: a browser only installs a new
// worker when this file changes byte for byte, so a shell that changes while
// VERSION stays put is a deploy that never reaches an installed phone.
const VERSION = 'ako-6ee8f9066e';
const SHELL = [
  './',
  './index.html',
  './app/css/style.css',
  './app/js/main.js',
  './app/js/util.js',
  './app/js/store.js',
  './app/js/update.js',
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
  './app/icons/icon-maskable-512.png',
];

// Failure here is deliberately not caught. `addAll` is atomic, so one bad
// response writes nothing; swallowing that would let the worker activate with
// an empty cache, delete the previous one, and leave the app with no offline
// copy at all. Letting install reject makes the browser discard the candidate
// and retry later, so the working cache stays in place until a whole new shell
// has actually been fetched.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // `cache: 'reload'` bypasses the HTTP cache. Without it the browser can
      // satisfy addAll from its own still-fresh copies and the new worker
      // installs the old files under a new name.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// So the app can show which build it is actually running, rather than leaving
// "is my phone up to date?" to guesswork.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'version') e.ports?.[0]?.postMessage({ version: VERSION });
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
