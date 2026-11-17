// src/lib/pushServidor.ts
//
// Lado SERVIDOR de las notificaciones push: cliente de Supabase con la
// llave de servicio si está configurada (si no, la anónima, el mismo
// patrón que el programa de marcadores: el proyecto aún no tiene RLS)
// y el envío con web-push, limpiando las suscripciones muertas.
//
// SOLO se importa desde rutas /api/* — jamás desde un componente.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// web-push v4 es ESM con exports nombrados (sin default): así lo
// aceptan tanto tsc como el bundler de Next 16.
import { sendNotification, setVapidDetails } from 'web-push';

let cliente: SupabaseClient | null = null;

export function supabaseServidor(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !llave) {
    throw new Error(
      'Falta configurar Supabase en el servidor (URL y llave de servicio o anónima).'
    );
  }
  cliente = createClient(url, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}

let vapidListo = false;

/** Configura VAPID la primera vez que se va a enviar de verdad. */
function asegurarVapid(): void {
  if (vapidListo) return;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const sujeto = process.env.VAPID_SUBJECT || 'mailto:notificaciones@ciberteque.app';
  if (!publica || !privada) {
    throw new Error(
      'Faltan las llaves VAPID en el servidor (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).'
    );
  }
  setVapidDetails(sujeto, publica, privada);
  vapidListo = true;
}

/** Fila de suscripciones_push, tal como se usa para enviar. */
export interface SuscripcionPush {
  id: string;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preferencias: unknown;
  equipos_seguidos: unknown;
}

export type ResultadoEnvio = 'enviado' | 'muerta' | 'fallo';

/**
 * Manda UN push a una suscripción. Si el servicio de notificaciones
 * responde 404/410, la suscripción ya no existe: se borra de la base
 * y se devuelve 'muerta'.
 */
export async function enviarPush(
  suscripcion: SuscripcionPush,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<ResultadoEnvio> {
  asegurarVapid();
  try {
    await sendNotification(
      {
        endpoint: suscripcion.endpoint,
        keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth },
      },
      JSON.stringify(payload)
    );
    return 'enviado';
  } catch (error) {
    const codigo = (error as { statusCode?: number })?.statusCode;
    if (codigo === 404 || codigo === 410) {
      await supabaseServidor()
        .from('suscripciones_push')
        .delete()
        .eq('id', suscripcion.id);
      return 'muerta';
    }
    console.error('Error enviando push:', codigo || '', (error as Error)?.message || error);
    return 'fallo';
  }
}
