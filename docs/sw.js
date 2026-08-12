const SHELL_CACHE = 'accounting-shell-v2';
const API_CACHE = 'accounting-api-v2';

const SHELL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/supabaseClient.js',
  './js/config.js',
  './js/bankStatementParser.js',
  './vendor/chart.umd.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 网络优先：在线时始终请求最新版本，网站更新后无需等待也无需手动改版本号；
// 只有离线取不到网络时才退回缓存里最后一次成功的响应，保留 PWA 离线可用性。
// 写操作（POST/PATCH/DELETE）从不读缓存，失败就是失败，避免呈现假成功。
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (request.method === 'GET') {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
  }
});
