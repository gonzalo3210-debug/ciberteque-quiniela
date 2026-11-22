// src/app/api/eventos-club/route.ts
//
// Eventos del ⚡ Minuto a minuto detectados por el CLUB (tabla
// eventos_minuto): los goles que el programa de marcadores detecta
// al comparar marcadores en cada pasada. Es la fuente de respaldo
// para las ligas cuya línea de tiempo el proveedor NO trae — la
// Liga MX, donde lookuptimeline devuelve null (verificado
// 2026-11-20) — y la vista los usa solo en los partidos cuya línea
// del proveedor vino vacía, para no duplicar eventos.
//
// Parámetros:
//   ?partidos={id,id,...}  IDs de partidos DEL CLUB (máx. 12)
//
// Respuesta:
//   { eventos: [{ partidoId, quinielaId, tipo, equipoAnoto,
//                 golesLocal, golesVisitante, minuto, fechaISO }],
//     fuentePendiente: boolean }
//
// Si la tabla aún no existe (la migración
// scripts/migraciones/2026-11-22-eventos-minuto-a-minuto.sql no se
// ha corrido), NO es un error para la vista: se devuelve la lista
// vacía con fuentePendiente: true y el Minuto a minuto sigue con lo
// del proveedor.

import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/pushServidor';

export const dynamic = 'force-dynamic';

const MAX_PARTIDOS = 12;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = [...new Set((searchParams.get('partidos') || '').split(','))]
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .slice(0, MAX_PARTIDOS);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Indica al menos un partido (?partidos=).' },
      { status: 400 }
    );
  }

  try {
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from('eventos_minuto')
      .select(
        'partido_id, quiniela_id, tipo, equipo_anoto, goles_local, goles_visitante, minuto, created_at'
      )
      .in('partido_id', ids)
      .order('created_at', { ascending: true });

    if (error) {
      // Tabla inexistente (PostgREST PGRST205 / Postgres 42P01):
      // la fuente del Club aún no se crea; la vista sigue sin ella.
      const mensaje = `${error.code || ''} ${error.message || ''}`;
      if (mensaje.includes('PGRST205') || mensaje.includes('42P01') || mensaje.includes('eventos_minuto')) {
        return NextResponse.json({ eventos: [], fuentePendiente: true });
      }
      throw error;
    }

    const eventos = (data || []).map((r: any) => ({
      partidoId: r.partido_id,
      quinielaId: r.quiniela_id ?? null,
      tipo: r.tipo,
      equipoAnoto: r.equipo_anoto ?? null,
      golesLocal: r.goles_local ?? null,
      golesVisitante: r.goles_visitante ?? null,
      minuto: r.minuto ?? null,
      fechaISO: r.created_at,
    }));

    return NextResponse.json({ eventos, fuentePendiente: false });
  } catch (error) {
    console.error('Error al obtener los eventos del club:', error);
    return NextResponse.json(
      {
        error:
          'No se pudieron cargar los eventos del club. Intenta de nuevo en unos minutos.',
      },
      { status: 502 }
    );
  }
}
