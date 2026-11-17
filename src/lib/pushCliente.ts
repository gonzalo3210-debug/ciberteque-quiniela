// src/lib/pushCliente.ts
//
// Lado NAVEGADOR de las notificaciones push: detección de soporte,
// suscripción/desuscripción contra /api/push/* y lectura de las
// preferencias guardadas. Los equipos seguidos (Siguiendo ⭐) viven en
// el localStorage de este navegador: cada guardado los espejea al
// servidor para que el despachador sepa a quién le importa cada
// equipo (ver equipos_seguidos en la migración).

import { leerFavoritos } from '@/lib/favoritos';
import {
  PREFERENCIAS_PUSH_DEFECTO,
  sanearPreferencias,
  type EquipoSeguidoPush,
  type PreferenciasPush,
} from '@/lib/pushPreferencias';

export function soportePush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** ¿Es iPhone/iPad? (en iOS el push web exige la PWA instalada). */
export function esIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** ¿La app ya corre instalada (pantalla de inicio / standalone)? */
export function esInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** En iOS sin instalar no se puede ni pedir el permiso: hay que guiar. */
export function esIosSinInstalar(): boolean {
  return esIOS() && !esInstalada();
}

function urlBase64AUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const texto = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = window.atob(texto);
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

/** Equipos seguidos en ESTE dispositivo, en el formato del servidor. */
export function equiposSeguidosParaPush(): EquipoSeguidoPush[] {
  return leerFavoritos().equipos.map((e) => ({
    teamProviderId: e.teamProviderId,
    teamName: e.teamName,
  }));
}

async function registro(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!soportePush()) return null;
  const reg = await registro();
  return reg.pushManager.getSubscription();
}

export type ResultadoActivacion =
  | { ok: true }
  | { ok: false; motivo: 'sin-soporte' | 'sin-llave' | 'denegado' | 'error'; detalle?: string };

/**
 * Pide el permiso, crea la suscripción del navegador y la guarda en
 * el servidor con las preferencias y los equipos seguidos actuales.
 */
export async function activarPush(
  usuarioId: string,
  preferencias: PreferenciasPush
): Promise<ResultadoActivacion> {
  if (!soportePush()) return { ok: false, motivo: 'sin-soporte' };
  const llavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!llavePublica) return { ok: false, motivo: 'sin-llave' };

  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return { ok: false, motivo: 'denegado' };

    const reg = await registro();
    const previa = await reg.pushManager.getSubscription();
    const sub =
      previa ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64AUint8Array(llavePublica),
      }));

    const guardado = await guardarEnServidor(usuarioId, sub, preferencias);
    return guardado
      ? { ok: true }
      : { ok: false, motivo: 'error', detalle: 'No se pudo guardar en el servidor.' };
  } catch (error) {
    return {
      ok: false,
      motivo: 'error',
      detalle: error instanceof Error ? error.message : 'Error desconocido.',
    };
  }
}

/** Re-guarda la suscripción actual (preferencias y/o equipos nuevos). */
export async function actualizarPush(
  usuarioId: string,
  preferencias: PreferenciasPush
): Promise<boolean> {
  const sub = await suscripcionActual();
  if (!sub) return false;
  return guardarEnServidor(usuarioId, sub, preferencias);
}

async function guardarEnServidor(
  usuarioId: string,
  sub: PushSubscription,
  preferencias: PreferenciasPush
): Promise<boolean> {
  try {
    const res = await fetch('/api/push/suscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: usuarioId,
        subscription: sub.toJSON(),
        preferencias,
        equipos_seguidos: equiposSeguidosParaPush(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Borra la suscripción del navegador y la del servidor. */
export async function desactivarPush(usuarioId: string): Promise<void> {
  const sub = await suscripcionActual();
  if (!sub) return;
  try {
    await fetch('/api/push/desuscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: usuarioId, endpoint: sub.endpoint }),
    });
  } catch {
    // Aunque el servidor no responda, se cancela la del navegador.
  }
  await sub.unsubscribe().catch(() => {});
}

/** Preferencias guardadas en el servidor para esta suscripción. */
export async function leerPreferenciasPush(
  usuarioId: string
): Promise<{ existe: boolean; preferencias: PreferenciasPush } | null> {
  const sub = await suscripcionActual();
  if (!sub) return null;
  try {
    const qs = new URLSearchParams({
      usuario_id: usuarioId,
      endpoint: sub.endpoint,
    });
    const res = await fetch(`/api/push/suscribir?${qs.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.existe) {
      return { existe: false, preferencias: { ...PREFERENCIAS_PUSH_DEFECTO } };
    }
    return { existe: true, preferencias: sanearPreferencias(data.preferencias) };
  } catch {
    return null;
  }
}
