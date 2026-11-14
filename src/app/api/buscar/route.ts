// src/app/api/buscar/route.ts
//
// Buscador 🔎 de la sección "⚽ Partidos" (rediseño 2026-11-14): busca
// por nombre de LIGA o de EQUIPO entre las ligas soportadas.
//
// La comparación es insensible a acentos/mayúsculas y pasa por la capa
// de nombres en español: "Dinamarca" encuentra al equipo que el
// proveedor llama "Denmark", y viceversa. Los equipos salen de
// getTeams() de cada liga (cacheado 24 h en el adaptador), así que
// buscar no dispara consultas frescas al proveedor.
//
// Respuesta: { ligas: [...], equipos: [...] } — el cliente abre la
// vista por equipo al tocar un equipo y las posiciones de la liga al
// tocar una liga.

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  SUPPORTED_LEAGUES,
  type SportsTeam,
} from '@/lib/sports';
import {
  nombreEquipoES,
  normalizarNombreEquipo,
} from '@/lib/sports/nombresES';

export const dynamic = 'force-dynamic';

const MAX_EQUIPOS = 24;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const nq = normalizarNombreEquipo(q);
    if (nq.length < 2) {
      return NextResponse.json({ ligas: [], equipos: [] });
    }

    const provider = getSportsProvider();

    // ----- Ligas por nombre (visible o del proveedor) -----
    const ligasCoinciden = SUPPORTED_LEAGUES.filter(
      (l) =>
        normalizarNombreEquipo(l.name).includes(nq) ||
        normalizarNombreEquipo(l.providerName).includes(nq)
    );
    const ligas = await Promise.all(
      ligasCoinciden.map(async (l) => {
        let badgeUrl: string | null = null;
        try {
          badgeUrl = await provider.getLeagueBadge(l.providerId);
        } catch {
          badgeUrl = null;
        }
        return {
          providerId: l.providerId,
          name: l.name,
          season: l.season,
          badgeUrl,
        };
      })
    );

    // ----- Equipos de todas las ligas soportadas -----
    const porLiga = await Promise.all(
      SUPPORTED_LEAGUES.map(async (liga) => {
        let teams: SportsTeam[] = [];
        try {
          teams = await provider.getTeams(liga.providerId);
        } catch (e) {
          console.error(`Buscar: fallaron los equipos de ${liga.name}:`, e);
        }
        return { liga, teams };
      })
    );

    const equipos: {
      leagueProviderId: string;
      leagueName: string;
      teamProviderId: string;
      teamName: string;
      badgeUrl: string | null;
      /** 0 = empieza con la búsqueda (mejor), 1 = solo la contiene. */
      prioridad: number;
    }[] = [];

    for (const { liga, teams } of porLiga) {
      for (const t of teams) {
        const nombreOriginal = normalizarNombreEquipo(t.name);
        const nombreEspanol = normalizarNombreEquipo(
          nombreEquipoES(t.name, t.providerId)
        );
        const coincide =
          nombreOriginal.includes(nq) || nombreEspanol.includes(nq);
        if (!coincide) continue;
        const prioridad =
          nombreOriginal.startsWith(nq) || nombreEspanol.startsWith(nq)
            ? 0
            : 1;
        equipos.push({
          leagueProviderId: liga.providerId,
          leagueName: liga.name,
          teamProviderId: t.providerId,
          teamName: t.name,
          badgeUrl: t.badgeUrl,
          prioridad,
        });
      }
    }

    equipos.sort(
      (a, b) =>
        a.prioridad - b.prioridad || a.teamName.localeCompare(b.teamName)
    );

    return NextResponse.json({
      ligas,
      equipos: equipos.slice(0, MAX_EQUIPOS).map(({ prioridad, ...e }) => e),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error en el buscador de partidos:', error);
    return NextResponse.json(
      { error: 'No se pudo completar la búsqueda. Intenta de nuevo.' },
      { status: 502 }
    );
  }
}
