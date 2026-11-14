// src/app/api/en-vivo/route.ts
//
// Partidos EN VIVO ahora mismo, para el filtro 🔴 Live de la sección
// "⚽ Partidos" (rediseño 2026-11-14).
//
// Una sola consulta al proveedor (livescore v2, cacheado 60 s en el
// adaptador) trae TODOS los partidos en curso del momento. Aquí se
// quedan:
//   - los de las ligas SOPORTADAS de la sección, y
//   - los que coincidan con los pares de equipos de la jornada del
//     Club que mande el cliente en ?pares=Local|Visitante;Local|Visitante
//     (los partidos de quiniela a veces son de competencias fuera de
//     las ligas soportadas —p. ej. amistosos de selecciones— y Gonzalo
//     pidió que en Live vayan PRIMERO los de la quiniela).
// La CLASIFICACIÓN por prioridad (quiniela → favoritos → resto) la
// hace el cliente, que es quien conoce la jornada y los favoritos del
// dispositivo. La llave del proveedor nunca sale del servidor.

import { NextResponse } from 'next/server';
import { getSportsProvider, getSupportedLeague } from '@/lib/sports';
import { claveParFixture, claveParNombres } from '@/lib/emparejar';

export const dynamic = 'force-dynamic';

/** Pares "Local|Visitante" separados por ";" → claves comparables. */
function clavesDePares(paresParam: string | null): Set<string> {
  const claves = new Set<string>();
  if (!paresParam) return claves;
  for (const par of paresParam.split(';')) {
    const [local, visitante] = par.split('|').map((s) => (s || '').trim());
    if (local && visitante) claves.add(claveParNombres(local, visitante));
  }
  return claves;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const paresQuiniela = clavesDePares(searchParams.get('pares'));

    const provider = getSportsProvider();
    const todos = await provider.getLiveScores();
    const fixtures = todos
      .filter(
        (f) =>
          getSupportedLeague(f.leagueProviderId) ||
          paresQuiniela.has(claveParFixture(f))
      )
      .sort((a, b) => (a.kickoffUtc || '').localeCompare(b.kickoffUtc || ''));

    return NextResponse.json({
      fixtures,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al obtener los partidos en vivo:', error);
    return NextResponse.json(
      {
        error:
          'No se pudieron cargar los partidos en vivo. Intenta de nuevo en unos minutos.',
      },
      { status: 502 }
    );
  }
}
