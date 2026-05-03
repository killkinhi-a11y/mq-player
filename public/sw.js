// Cache names — bump version to force old cache cleanup
const STATIC_CACHE = 'mq-static-v1';
const API_CACHE = 'mq-api-v1';
const AUDIO_CACHE = 'mq-audio-v1';

const STATIC_ASSETS = [
  '/',
  '/play',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.svg',
];

// Audio caching — keep track of cached URLs for LRU eviction
const MAX_AUDIO_CACHE = 20;
const audioCacheUrls = [];

// ========== Helper strategies ==========

// Cache-first: try cache, fall back to network
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Cache audio with LRU eviction — max 20 tracks
async function cacheAudioWithLRU(request) {
  const url = request.url;

  // Try cache first
  const cached = await caches.match(request);
  if (cached) {
    // Move to end of LRU list (most recently used)
    const idx = audioCacheUrls.indexOf(url);
    if (idx !== -1) {
      audioCacheUrls.splice(idx, 1);
      audioCacheUrls.push(url);
    }
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      // Add new URL to LRU list
      audioCacheUrls.push(url);

      // Evict oldest if over limit
      while (audioCacheUrls.length > MAX_AUDIO_CACHE) {
        const oldestUrl = audioCacheUrls.shift();
        if (oldestUrl) {
          const cache = await caches.open(AUDIO_CACHE);
          // Use URL to create a request key for deletion
          cache.delete(oldestUrl).catch(() => {});
        }
      }

      const cache = await caches.open(AUDIO_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ========== Event handlers ==========

// Install: precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, API_CACHE, AUDIO_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => !validCaches.includes(key)).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: different strategies for different resource types
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // SSE streams — never cache
  if (url.pathname.endsWith('/sse')) return;

  // API calls — network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // Audio streams — cache first with LRU eviction
  if (
    url.pathname.includes('/soundcloud/') ||
    url.pathname.includes('/stream') ||
    url.pathname.includes('audio') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.m4a') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.endsWith('.wav') ||
    url.pathname.endsWith('.flac')
  ) {
    event.respondWith(cacheAudioWithLRU(event.request));
    return;
  }

  // Navigation: network-first with cache fallback for offline
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, STATIC_CACHE).catch(() => caches.match('/play')));
    return;
  }

  // Static assets (images, fonts, etc.): cache first
  event.respondWith(cacheFirst(event.request, STATIC_CACHE));
});

// Push notification handler (placeholder — requires VAPID keys)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'mq';
    const options = {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/icon-192.png',
      data: data.data || {},
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Silently handle malformed push data
  }
});

// Notification click handler — focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes('/play') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow('/play');
    })
  );
});
