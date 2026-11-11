/* 離線快取。新增檔案時加進 FILES，並把 VERSION 加一（app.js 的 APP_VERSION、index.html 的 ?v= 也要一起改）。
   同網域還有 04、34、43、47：只刪自己開頭（books-）的快取。 */
const VERSION = 'books-v0.1.0';
const FILES = ['./', 'index.html', 'style.css?v=0.1.0', 'app.js?v=0.1.0', 'db.js?v=0.1.0', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'ahui-study.webp'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('books-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const fromCache = () => caches.match(e.request);
  const net = fetch(new Request(e.request.url, { cache: 'no-cache' })).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const give = r => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => fromCache().then(give), 3000);   // 網路很慢時先用快取打開
    net.then(r => { clearTimeout(timer); give(r); })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then(hit => hit || caches.match('index.html')).then(r => { give(r); if (!done) { done = true; resolve(Response.error()); } });
      });
  }));
});
