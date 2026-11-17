// public/sw.js — Service worker del Club de Pronósticos.
//
// Su ÚNICO trabajo hoy es recibir notificaciones push (Web Push API) y
// mostrarlas; al tocarlas abre la app en la pantalla que indique el
// aviso. A propósito NO intercepta fetch ni cachea nada: el resto de
// la app sigue funcionando exactamente igual que sin service worker.

self.addEventListener('install', () => {
  // Activarse en cuanto se instala, sin esperar a que se cierren las
  // pestañas viejas (no hay caché que invalidar).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { body: event.data ? event.data.text() : '' };
  }

  const titulo = datos.title || 'Club de Pronósticos';
  const opciones = {
    body: datos.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: datos.tag || undefined,
    data: { url: datos.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((ventanas) => {
        // Si la app ya está abierta, se enfoca y se navega al destino.
        for (const ventana of ventanas) {
          if ('focus' in ventana) {
            ventana.focus();
            if ('navigate' in ventana && destino !== '/') {
              ventana.navigate(destino).catch(() => {});
            }
            return;
          }
        }
        return self.clients.openWindow(destino);
      })
  );
});
