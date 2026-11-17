// src/app/api/push/suscribir/route.ts
//
// Guarda o actualiza la suscripción push del jugador logueado (la app
// no tiene sesión de servidor: el cliente manda su usuario_id, el
// mismo patrón de acceso que el resto del proyecto, sin RLS por ahora).
//
// POST {
//   usuario_id,
//   subscription: { endpoint, keys: { p256dh, auth } },   // PushSubscription.toJSON()
//   preferencias?: PreferenciasPush (parcial),
//   equipos_seguidos?: [{ teamProviderId, teamName }]     // espejo de Siguiendo ⭐
// }
// La fila se identifica por `endpoint` (único): re-suscribir el mismo
// navegador actualiza preferencias y equipos en la misma fila.
//
// GET ?usuario_id=&endpoint= → las preferencias guardadas de esa
// suscripción (para pintar los toggles en Mi Perfil).

import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/pushServidor';
import {
  sanearPreferencias,
  sanearEquiposSeguidos,
} from '@/lib/pushPreferencias';

export const dynamic = 'force-dynamic';

interface SuscripcionEntrante {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

function validarSuscripcion(sub: SuscripcionEntrante | undefined) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
  if (typeof p256dh !== 'string' || p256dh.length < 10) return null;
  if (typeof auth !== 'string' || auth.length < 5) return null;
  return { endpoint, p256dh, auth };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 });
  }

  const usuarioId = body?.usuario_id;
  if (typeof usuarioId !== 'string' || usuarioId.trim().length === 0) {
    return NextResponse.json({ error: 'Falta usuario_id.' }, { status: 400 });
  }

  const sub = validarSuscripcion(body?.subscription as SuscripcionEntrante);
  if (!sub) {
    return NextResponse.json(
      { error: 'Suscripción inválida: se espera endpoint https y llaves p256dh/auth.' },
      { status: 400 }
    );
  }

  const fila = {
    usuario_id: usuarioId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    preferencias: sanearPreferencias(body?.preferencias),
    equipos_seguidos: sanearEquiposSeguidos(body?.equipos_seguidos),
    user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseServidor()
    .from('suscripciones_push')
    .upsert(fila, { onConflict: 'endpoint' });

  if (error) {
    console.error('Error guardando suscripción push:', error.message);
    return NextResponse.json(
      { error: 'No se pudo guardar la suscripción.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const usuarioId = searchParams.get('usuario_id') || '';
  const endpoint = searchParams.get('endpoint') || '';
  if (!usuarioId || !endpoint) {
    return NextResponse.json(
      { error: 'Se requiere usuario_id y endpoint.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServidor()
    .from('suscripciones_push')
    .select('preferencias, equipos_seguidos')
    .eq('usuario_id', usuarioId)
    .eq('endpoint', endpoint)
    .maybeSingle();

  if (error) {
    console.error('Error leyendo suscripción push:', error.message);
    return NextResponse.json(
      { error: 'No se pudo leer la suscripción.' },
      { status: 502 }
    );
  }

  if (!data) return NextResponse.json({ existe: false });

  return NextResponse.json({
    existe: true,
    preferencias: sanearPreferencias(data.preferencias),
    equipos_seguidos: sanearEquiposSeguidos(data.equipos_seguidos),
  });
}
