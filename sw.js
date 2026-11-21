/* UangKu service worker
   Fungsinya: menyimpan tampilan app (halaman, library, font) supaya app bisa dibuka tanpa internet.
   Data keuangan dari Supabase TIDAK pernah disimpan di sini. App menyimpannya sendiri di HP.
   Setiap kali kamu mengubah index.html, naikkan angka VERSION di bawah (v1 menjadi v2, dst.)
   supaya HP yang sudah memasang app ikut memperbarui salinan lamanya. */

const VERSION = 'v1';
const CACHE = 'uangku-' + VERSION;

const CORE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&display=swap';
const LIBS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];
const EXTERNAL_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Satu file gagal diunduh tidak boleh menggagalkan semuanya
    await Promise.all([...CORE, ...LIBS].map(url => cache.add(url).catch(() => {})));
    await precacheFonts(cache);
    await self.skipWaiting();
  })());
});

// Unduh CSS font lalu file font di dalamnya, supaya huruf tetap benar saat offline
async function precacheFonts(cache) {
  try {
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const files = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(files.map(u => cache.add(u).catch(() => {})));
  } catch (e) { /* abaikan: font bawaan HP akan dipakai */ }
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('uangku-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Data keuangan selalu langsung ke Supabase, tidak lewat cache
  if (url.hostname.endsWith('.supabase.co')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.origin === self.location.origin || EXTERNAL_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Halaman utama: ambil versi terbaru kalau internet ada, pakai salinan HP kalau tidak ada atau terlalu lambat
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 4000);
    if (res && res.ok) cache.put('index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
  }
}

// File pendukung (ikon, library, font): tampilkan salinan HP dulu, perbarui diam-diam di belakang
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreVary: true });
  const refresh = fetch(req)
    .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  if (cached) { event.waitUntil(refresh); return cached; }
  return (await refresh) || Response.error();
}
