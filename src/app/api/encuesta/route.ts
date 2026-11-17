// =====================================================================
// /api/encuesta — encuesta "¿Quién va a ganar?" (The Odds API)
// ---------------------------------------------------------------------
// GET  ?local=&visitante=&liga=<id TheSportsDB>&fecha=<ISO>
//      Los porcentajes 1-X-2 de UN partido (la vista del partido).
// POST { partidos: [{ id, local, visitante, liga?, fecha? }] }
//      Los porcentajes de TODA la jornada en una sola llamada (la
//      cartelera al JUGAR pinta la línea de % por partido). El
//      servidor pide cada deporte una sola vez y el caché de 45 min
//      de src/lib/odds.ts acota los créditos de The Odds API.
// Si ninguna casa cotiza un partido, su porcentajes va en null y la
// vista simplemente no muestra nada de ese partido.
// =====================================================================

import { NextResponse } from 'next/server';
import { encuestaPartido, encuestaJornada } from '@/lib/odds';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const local = (searchParams.get('local') || '').trim();
  const visitante = (searchParams.get('visitante') || '').trim();
  const liga = searchParams.get('liga');
  const fecha = searchParams.get('fecha');

  if (!local || !visitante) {
    return NextResponse.json(
      { porcentajes: null, error: 'Faltan local/visitante' },
      { status: 400 }
    );
  }

  try {
    const r = await encuestaPartido(local, visitante, liga, fecha);
    return NextResponse.json({
      porcentajes: r?.porcentajes ?? null,
      casas: r?.casas ?? 0,
      inicioUtc: r?.inicioUtc ?? null,
    });
  } catch {
    return NextResponse.json({ porcentajes: null, casas: 0 });
  }
}

const MAX_PARTIDOS_LOTE = 20;

interface PartidoLoteEntrante {
  id?: unknown;
  local?: unknown;
  visitante?: unknown;
  liga?: unknown;
  fecha?: unknown;
}

const textoONull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * POST: porcentajes de una jornada completa en UNA llamada.
 * Respuesta: { resultados: { [id]: { porcentajes, casas } | null } }.
 * Las entradas sin id o sin equipos se ignoran (no rompen el lote).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      partidos?: PartidoLoteEntrante[];
    } | null;
    const entrantes = Array.isArray(body?.partidos)
      ? body.partidos.slice(0, MAX_PARTIDOS_LOTE)
      : [];

    const validos: {
      id: string;
      local: string;
      visitante: string;
      liga: string | null;
      fecha: string | null;
    }[] = [];
    for (const p of entrantes) {
      const id = textoONull(p?.id);
      const local = textoONull(p?.local);
      const visitante = textoONull(p?.visitante);
      if (!id || !local || !visitante) continue;
      validos.push({
        id,
        local,
        visitante,
        liga: textoONull(p?.liga),
        fecha: textoONull(p?.fecha),
      });
    }

    const resueltos = await encuestaJornada(
      validos.map((p) => ({
        local: p.local,
        visitante: p.visitante,
        ligaProviderId: p.liga,
        fechaIso: p.fecha,
      }))
    );

    const resultados: Record<
      string,
      { porcentajes: { local: number; empate: number; visitante: number }; casas: number } | null
    > = {};
    validos.forEach((p, i) => {
      const r = resueltos[i];
      resultados[p.id] = r
        ? { porcentajes: r.porcentajes, casas: r.casas }
        : null;
    });
    return NextResponse.json({ resultados });
  } catch {
    return NextResponse.json({ resultados: {} });
  }
}
