// src/app/api/tabla-liga/route.ts
//
// Tabla de posiciones DE UNA LIGA (no confundir con el ranking del Club
// entre jugadores, que vive en Supabase y no se toca aquí).
//
// Ruta de servidor generalizada por liga: ?liga={providerId} — debe ser una
// de las SOPORTADAS (src/lib/sports/leagues.ts); sin parámetro = Liga MX.
// Pide la tabla al proveedor vía el adaptador único (cacheada 10 min) y, si
// la liga tiene partidos EN CURSO, devuelve también la tabla recalculada
// AL CAER GOL con computeLiveStandings (regla de Gonzalo 2026-11-13) en
// `liveRows`, para que la vista la marque "EN VIVO".
//
// Las ligas de grupos/copa (hasStandings=false: Champions, Nations League,
// Libertadores) no tienen tabla en el proveedor: la app la CALCULA desde
// los resultados de la temporada (computeStandingsFromResults) y la
// responde con `calculated: true` y `groups` (una tabla por grupo, o una
// sola en formato fase de liga), para que la vista la marque como
// "Tabla calculada por la app", distinta de la oficial. La tabla en vivo
// al caer gol también aplica, por grupo (liveGroups).
// La llave del proveedor nunca sale del servidor.

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  getSupportedLeague,
  computeLiveStandings,
  computeStandingsFromResults,
  LIGA_MX_PROVIDER_ID,
  type ComputedTable,
  type LiveResult,
  type StandingRow,
} from '@/lib/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ligaId = searchParams.get('liga') || LIGA_MX_PROVIDER_ID;
  const liga = getSupportedLeague(ligaId);

  if (!liga) {
    return NextResponse.json(
      { error: 'Liga no soportada.' },
      { status: 400 }
    );
  }

  // Logo de la liga (cacheado 7 días en el adaptador); fallo = sin logo.
  let badgeUrl: string | null = null;
  try {
    badgeUrl = await getSportsProvider().getLeagueBadge(liga.providerId);
  } catch {
    badgeUrl = null;
  }

  const ligaJson = {
    providerId: liga.providerId,
    name: liga.name,
    season: liga.season,
    zones: liga.zones,
    hasStandings: liga.hasStandings,
    badgeUrl,
  };

  if (!liga.hasStandings) {
    // Sin tabla oficial: si la liga trae modo de cálculo, se computa desde
    // los resultados de la temporada; si no, se responde vacío como antes.
    if (!liga.computedTable) {
      return NextResponse.json({
        league: ligaJson,
        hasStandings: false,
        calculated: false,
        rows: [],
        liveRows: null,
        hasLive: false,
        fetchedAt: new Date().toISOString(),
      });
    }
    try {
      const provider = getSportsProvider();
      const fixtures = await provider.getFixtures(liga.providerId, {
        season: liga.season,
      });
      const groups: ComputedTable[] = computeStandingsFromResults(
        fixtures,
        liga.computedTable
      );

      // Tabla EN VIVO al caer gol, por grupo: computeLiveStandings ignora
      // los resultados con equipos ajenos a cada tabla.
      let liveGroups: ComputedTable[] | null = null;
      try {
        const enVivo = await provider.getLiveScores();
        const resultados: LiveResult[] = enVivo
          .filter(
            (f) =>
              f.leagueProviderId === liga.providerId &&
              f.status === 'live' &&
              f.homeScore !== null &&
              f.awayScore !== null
          )
          .map((f) => ({
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            homeTeamProviderId: f.homeTeamProviderId,
            awayTeamProviderId: f.awayTeamProviderId,
            homeScore: f.homeScore as number,
            awayScore: f.awayScore as number,
          }));
        if (resultados.length > 0 && groups.length > 0) {
          const recalculadas = groups.map((g) => ({
            label: g.label,
            rows: computeLiveStandings(g.rows, resultados),
          }));
          const cambio = recalculadas.some((g, i) =>
            g.rows.some(
              (r, j) =>
                r.played !== groups[i].rows[j].played ||
                r.points !== groups[i].rows[j].points
            )
          );
          if (cambio) liveGroups = recalculadas;
        }
      } catch (e) {
        console.error(`Tabla calculada ${liga.name}: falló el en vivo:`, e);
      }

      return NextResponse.json({
        league: ligaJson,
        hasStandings: false,
        calculated: true,
        groups,
        liveGroups,
        hasLive: liveGroups !== null,
        rows: [],
        liveRows: null,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error al calcular la tabla de ${liga.name}:`, error);
      return NextResponse.json(
        {
          error: `No se pudo cargar la tabla de ${liga.name}. Intenta de nuevo en unos minutos.`,
        },
        { status: 502 }
      );
    }
  }

  try {
    const provider = getSportsProvider();
    const season = searchParams.get('season') || liga.season;
    const rows: StandingRow[] = await provider.getStandings(
      liga.providerId,
      season
    );

    // Tabla EN VIVO: si hay partidos de esta liga en curso, se recalcula
    // con sus marcadores actuales. Si el en vivo falla, se sigue oficial.
    let liveRows: StandingRow[] | null = null;
    try {
      const enVivo = await provider.getLiveScores();
      const resultados: LiveResult[] = enVivo
        .filter(
          (f) =>
            f.leagueProviderId === liga.providerId &&
            f.status === 'live' &&
            f.homeScore !== null &&
            f.awayScore !== null
        )
        .map((f) => ({
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          homeTeamProviderId: f.homeTeamProviderId,
          awayTeamProviderId: f.awayTeamProviderId,
          homeScore: f.homeScore as number,
          awayScore: f.awayScore as number,
        }));
      if (resultados.length > 0 && rows.length > 0) {
        liveRows = computeLiveStandings(rows, resultados);
      }
    } catch (e) {
      console.error(`Tabla ${liga.name}: falló el en vivo:`, e);
    }

    return NextResponse.json({
      league: { ...ligaJson, season },
      hasStandings: true,
      rows,
      liveRows,
      hasLive: liveRows !== null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error al obtener la tabla de ${liga.name}:`, error);
    return NextResponse.json(
      {
        error: `No se pudo cargar la tabla de ${liga.name}. Intenta de nuevo en unos minutos.`,
      },
      { status: 502 }
    );
  }
}
