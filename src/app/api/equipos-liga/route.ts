// src/app/api/equipos-liga/route.ts
//
// Equipos de una liga SOPORTADA, para administrar Favoritos (seguir
// equipos con estrella) en la sección "⚽ Partidos".
//
// Ruta de servidor: ?liga={providerId}. Usa getTeams del adaptador
// (cacheado 24 h). OJO: hay ligas donde el proveedor no llena su catálogo
// de equipos (verificado: UEFA Nations League devuelve 0); en ese caso la
// lista se arma desde el propio calendario de la temporada (equipos únicos
// con su escudo), para que igual se puedan seguir selecciones.

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  getSupportedLeague,
  type SportsTeam,
} from '@/lib/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ligaId = searchParams.get('liga') || '';
  const liga = getSupportedLeague(ligaId);

  if (!liga) {
    return NextResponse.json(
      { error: 'Liga no soportada.' },
      { status: 400 }
    );
  }

  try {
    const provider = getSportsProvider();
    let teams: SportsTeam[] = await provider.getTeams(liga.providerId);

    if (teams.length === 0) {
      // Rescate: equipos únicos del calendario de la temporada.
      const fixtures = await provider.getFixtures(liga.providerId, {
        season: liga.season,
      });
      const porId = new Map<string, SportsTeam>();
      for (const f of fixtures) {
        if (f.homeTeamProviderId && !porId.has(f.homeTeamProviderId)) {
          porId.set(f.homeTeamProviderId, {
            providerId: f.homeTeamProviderId,
            name: f.homeTeam,
            shortName: null,
            badgeUrl: f.homeBadgeUrl,
          });
        }
        if (f.awayTeamProviderId && !porId.has(f.awayTeamProviderId)) {
          porId.set(f.awayTeamProviderId, {
            providerId: f.awayTeamProviderId,
            name: f.awayTeam,
            shortName: null,
            badgeUrl: f.awayBadgeUrl,
          });
        }
      }
      teams = [...porId.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }

    return NextResponse.json({
      league: {
        providerId: liga.providerId,
        name: liga.name,
        season: liga.season,
      },
      teams,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error al obtener los equipos de ${liga.name}:`, error);
    return NextResponse.json(
      {
        error: `No se pudieron cargar los equipos de ${liga.name}. Intenta de nuevo en unos minutos.`,
      },
      { status: 502 }
    );
  }
}
