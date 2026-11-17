// src/app/api/push/despachar/route.ts
//
// Recibe eventos YA DETECTADOS (del programa de marcadores directos)
// y manda los push a quien corresponda. Está protegida con un secreto
// de servidor (PUSH_DISPATCH_SECRET, header x-push-secret o Bearer):
// ningún navegador puede llamarla.
//
// POST { eventos: EventoPush[] } — ver src/lib/pushPreferencias.ts.
//
// Audiencia según el tipo:
//  - gol_equipo: suscriptores que siguen a alguno de los equipos del
//    partido (equipos_seguidos, espejo de Siguiendo ⭐) y tienen la
//    preferencia gol_equipos.
//  - gol_boleto / fin_partido: usuarios con boleto en la quiniela y
//    su preferencia correspondiente.
//  - gol_anulado: la unión de las dos audiencias anteriores (con
//    cualquiera de las dos preferencias basta).
//  - lider_nuevo / rebasado / recordatorio_cierre / premio: la lista
//    explícita `usuarios` del evento y su preferencia.
//
// Dedupe: antes de enviar se inserta (clave_evento, usuario_id) en
// notificaciones_enviadas; si ya existe, ese usuario no recibe el
// evento otra vez. Si la tabla aún no existe (migración sin correr),
// se envía sin dedupe y se avisa en la respuesta (sin_dedupe: true);
// el programa de marcadores lleva además su propio dedupe local.

import { NextResponse } from 'next/server';
import {
  enviarPush,
  supabaseServidor,
  type SuscripcionPush,
} from '@/lib/pushServidor';
import {
  PREF_DE_TIPO,
  TIPOS_EVENTO_PUSH,
  sanearPreferencias,
  sanearEquiposSeguidos,
  type EventoPush,
  type TipoEventoPush,
} from '@/lib/pushPreferencias';

export const dynamic = 'force-dynamic';

const MAX_EVENTOS = 100;

function validarEvento(crudo: unknown): EventoPush | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const e = crudo as Record<string, unknown>;
  if (typeof e.clave !== 'string' || e.clave.length === 0) return null;
  if (!TIPOS_EVENTO_PUSH.includes(e.tipo as TipoEventoPush)) return null;
  if (typeof e.titulo !== 'string' || e.titulo.length === 0) return null;
  if (typeof e.cuerpo !== 'string' || e.cuerpo.length === 0) return null;
  return {
    clave: e.clave,
    tipo: e.tipo as TipoEventoPush,
    titulo: e.titulo,
    cuerpo: e.cuerpo,
    url: typeof e.url === 'string' ? e.url : undefined,
    quiniela_id: typeof e.quiniela_id === 'string' ? e.quiniela_id : undefined,
    equipo_provider_ids: Array.isArray(e.equipo_provider_ids)
      ? e.equipo_provider_ids.filter((x): x is string => typeof x === 'string')
      : undefined,
    usuarios: Array.isArray(e.usuarios)
      ? e.usuarios.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

export async function POST(request: Request) {
  const secreto = process.env.PUSH_DISPATCH_SECRET;
  const recibido =
    request.headers.get('x-push-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secreto || !recibido || recibido !== secreto) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 });
  }

  const crudos = Array.isArray(body?.eventos) ? body.eventos.slice(0, MAX_EVENTOS) : [];
  const eventos = crudos
    .map(validarEvento)
    .filter((e): e is EventoPush => e !== null);
  if (eventos.length === 0) {
    return NextResponse.json({ ok: true, eventos: 0, enviados: 0, omitidos: 0, limpiadas: 0 });
  }

  const sb = supabaseServidor();

  // ----- Cargas previas (una por corrida, no por evento) -------------
  const necesitaEquipos = eventos.some(
    (e) => e.tipo === 'gol_equipo' || e.tipo === 'gol_anulado'
  );
  const quinielasBoleto = new Set(
    eventos
      .filter(
        (e) =>
          (e.tipo === 'gol_boleto' || e.tipo === 'fin_partido' || e.tipo === 'gol_anulado') &&
          e.quiniela_id
      )
      .map((e) => e.quiniela_id as string)
  );

  let todasLasSubs: SuscripcionPush[] = [];
  if (necesitaEquipos) {
    const { data } = await sb
      .from('suscripciones_push')
      .select('id, usuario_id, endpoint, p256dh, auth, preferencias, equipos_seguidos');
    todasLasSubs = (data as SuscripcionPush[]) || [];
  }

  const boletosPorQuiniela = new Map<string, Set<string>>();
  for (const qid of quinielasBoleto) {
    const { data } = await sb.from('tickets').select('usuario_id').eq('quiniela_id', qid);
    boletosPorQuiniela.set(
      qid,
      new Set((data || []).map((t) => String(t.usuario_id)))
    );
  }

  const subsPorUsuario = new Map<string, SuscripcionPush[]>();
  const cacheSubs = async (usuarioId: string): Promise<SuscripcionPush[]> => {
    const previas = subsPorUsuario.get(usuarioId);
    if (previas) return previas;
    const deEquipos = todasLasSubs.filter((s) => s.usuario_id === usuarioId);
    if (deEquipos.length > 0) {
      subsPorUsuario.set(usuarioId, deEquipos);
      return deEquipos;
    }
    const { data } = await sb
      .from('suscripciones_push')
      .select('id, usuario_id, endpoint, p256dh, auth, preferencias, equipos_seguidos')
      .eq('usuario_id', usuarioId);
    const subs = (data as SuscripcionPush[]) || [];
    subsPorUsuario.set(usuarioId, subs);
    return subs;
  };

  let enviados = 0;
  let omitidos = 0;
  let limpiadas = 0;
  let dedupeDisponible = true;

  // ----- Despacho evento por evento -----------------------------------
  for (const evento of eventos) {
    const prefClave = PREF_DE_TIPO[evento.tipo];
    // usuario_id → suscripciones que SÍ deben recibir este evento
    const destinatarios = new Map<string, SuscripcionPush[]>();

    const agregar = (usuarioId: string, sub: SuscripcionPush) => {
      const arr = destinatarios.get(usuarioId) || [];
      if (!arr.some((s) => s.id === sub.id)) arr.push(sub);
      destinatarios.set(usuarioId, arr);
    };

    if (evento.tipo === 'gol_equipo' || evento.tipo === 'gol_anulado') {
      const ids = new Set(evento.equipo_provider_ids || []);
      for (const sub of todasLasSubs) {
        const sigue = sanearEquiposSeguidos(sub.equipos_seguidos).some((e) =>
          ids.has(e.teamProviderId)
        );
        if (!sigue) continue;
        const prefs = sanearPreferencias(sub.preferencias);
        if (prefs.gol_equipos) agregar(sub.usuario_id, sub);
      }
    }

    if (
      evento.tipo === 'gol_boleto' ||
      evento.tipo === 'fin_partido' ||
      evento.tipo === 'gol_anulado'
    ) {
      const conBoleto = evento.quiniela_id
        ? boletosPorQuiniela.get(evento.quiniela_id) || new Set<string>()
        : new Set<string>();
      for (const usuarioId of conBoleto) {
        const subs = await cacheSubs(usuarioId);
        for (const sub of subs) {
          const prefs = sanearPreferencias(sub.preferencias);
          const acepta =
            evento.tipo === 'gol_anulado'
              ? prefs.gol_boleto || prefs.gol_equipos
              : prefs[prefClave];
          if (acepta) agregar(usuarioId, sub);
        }
      }
    }

    if (
      evento.tipo === 'lider_nuevo' ||
      evento.tipo === 'rebasado' ||
      evento.tipo === 'recordatorio_cierre' ||
      evento.tipo === 'premio'
    ) {
      for (const usuarioId of evento.usuarios || []) {
        const subs = await cacheSubs(usuarioId);
        for (const sub of subs) {
          if (sanearPreferencias(sub.preferencias)[prefClave]) {
            agregar(usuarioId, sub);
          }
        }
      }
    }

    for (const [usuarioId, subs] of destinatarios) {
      // Dedupe por (clave, usuario): si ya se le mandó, no repetir.
      if (dedupeDisponible) {
        const { error } = await sb
          .from('notificaciones_enviadas')
          .insert({ clave_evento: evento.clave, usuario_id: usuarioId, tipo: evento.tipo });
        if (error) {
          if (error.code === '23505') {
            omitidos++;
            continue;
          }
          if (
            error.code === '42P01' ||
            /notificaciones_enviadas/.test(error.message || '')
          ) {
            dedupeDisponible = false;
            console.error(
              'La tabla notificaciones_enviadas no existe: se despacha sin dedupe. Corre la migración de scripts/migraciones/.'
            );
          }
        }
      }

      for (const sub of subs) {
        const r = await enviarPush(sub, {
          title: evento.titulo,
          body: evento.cuerpo,
          url: evento.url || '/',
          tag: evento.clave,
        });
        if (r === 'enviado') enviados++;
        else if (r === 'muerta') limpiadas++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    eventos: eventos.length,
    enviados,
    omitidos,
    limpiadas,
    ...(dedupeDisponible ? {} : { sin_dedupe: true }),
  });
}
