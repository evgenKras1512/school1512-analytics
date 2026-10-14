/* ============================================================
   SERVICE WORKER v3.0.0
   ============================================================ */
const CACHE_VERSION = 'v3.0.0';
const CACHE_NAME = `school-analytics-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

const NEVER_CACHE = ['/api/', 'chrome-extension://', 'moz-extension://'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n.startsWith('school-analytics-') && n !== CACHE_NAME)
        .map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (NEVER_CACHE.some(p => req.url.includes(p))) return;

  const url = new URL(req.url);

  if (req.headers.get('accept')?.includes('text/html')
      || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const c = await caches.open(CACHE_NAME);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fb = await caches.match('./index.html');
    if (fb) return fb;
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const c = await caches.open(CACHE_NAME);
      c.put(req, res.clone());
    }
    return res;
  } catch { return new Response('Offline', { status: 503 }); }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') caches.keys().then(n => n.forEach(x => caches.delete(x)));
});
