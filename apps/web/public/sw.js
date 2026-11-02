// Service worker BIGBIIM : mode hors-ligne partiel (écran S07). À coder : cache, page /hors-ligne.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
