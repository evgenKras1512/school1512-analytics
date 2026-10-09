/* ============================================================
   SERVICE WORKER — «Школьная аналитика»
   Кэширование + offline-режим + PWA
   Пути ОТНОСИТЕЛЬНЫЕ (./) для совместимости с GitHub Pages
   ============================================================ */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `school-analytics-${CACHE_VERSION}`;

/* Ресурсы для кэширования при установке (offline shell)
   ВСЕ ПУТИ ОТНОСИТЕЛЬНЫЕ — начинаются с ./
*/
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

/* Ресурсы, которые не должны кэшироваться никогда */
const NEVER_CACHE = [
  '/api/',
  'chrome-extension://',
  'moz-extension://'
];

/* ============================================================
   УСТАНОВКА — кэшируем обязательные файлы
   ============================================================ */
self.addEventListener('install', (event) => {
  console.log('[SW] Установка...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Кэширую ресурсы:', PRECACHE_URLS);
        return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('[SW] Установка завершена');
        return self.skipWaiting();
      })
      .catch(err => {
        console.warn('[SW] Ошибка кэширования:', err);
      })
  );
});

/* ============================================================
   АКТИВАЦИЯ — удаляем старые версии кэша
   ============================================================ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('school-analytics-') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Удаляю старый кэш:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Активация завершена');
      return self.clients.claim();
    })
  );
});

/* ============================================================
   ПЕРЕХВАТ ЗАПРОСОВ
   Стратегия:
   - HTML: network-first (свежая версия → fallback на кэш)
   - Chart.js (CDN): cache-first (редко меняется)
   - Остальное: stale-while-revalidate
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Пропускаем не-GET и служебные запросы
  if (request.method !== 'GET') return;
  if (NEVER_CACHE.some(pattern => request.url.includes(pattern))) return;

  const url = new URL(request.url);

  // HTML — network-first
  if (request.headers.get('accept')?.includes('text/html')
      || url.pathname.endsWith('.html')
      || url.pathname === '/'
      || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Chart.js с CDN — cache-first
  if (url.hostname.includes('cdn.jsdelivr.net') || url.pathname.includes('chart')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Остальное — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

/* ============================================================
   СТРАТЕГИИ КЭШИРОВАНИЯ
   ============================================================ */

/* Network-first: пробуем сеть, при ошибке — кэш */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Для HTML возвращаем index.html как fallback
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }

    return new Response('Offline — ресурс недоступен', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* Cache-first: сначала кэш, потом сеть */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

/* Stale-while-revalidate: отдаём кэш, обновляем в фоне */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

/* ============================================================
   СООБЩЕНИЯ ОТ КЛИЕНТА
   ============================================================ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

/* ============================================================
   BACKGROUND SYNC
   ============================================================ */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
});