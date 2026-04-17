/* SıraGO Service Worker — Web Push Notifications */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {
    try { payload = { title: 'SıraGO', body: event.data ? event.data.text() : '' }; } catch (_) {}
  }

  const title = payload.title || 'SıraGO';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo1-CHW0j2wI.png',
    badge: payload.badge || '/logo1-CHW0j2wI.png',
    tag: payload.tag || 'default',
    data: { url: payload.url || '/', ...(payload.data || {}) },
    vibrate: [200, 80, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Zaten açık bir sekme varsa ona odaklan
      for (const client of clientList) {
        if ('focus' in client) {
          try { client.navigate(url); } catch (_) {}
          return client.focus();
        }
      }
      // Yoksa yeni pencere aç
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
