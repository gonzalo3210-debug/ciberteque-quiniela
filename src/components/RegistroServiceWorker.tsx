'use client';

// src/components/RegistroServiceWorker.tsx
//
// Registra el service worker (/sw.js) que recibe las notificaciones
// push. No pide ningún permiso: solo deja el worker instalado para
// cuando el jugador active los avisos desde Mi Perfil. Si el navegador
// no soporta service workers, no hace nada.

import { useEffect } from 'react';

export default function RegistroServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker no hay push; la app sigue igual.
    });
  }, []);

  return null;
}
