// src/app/api/equipos-liga/route.ts
//
// Equipos de una liga SOPORTADA, para administrar Favoritos (seguir
// equipos con estrella) en la sección "⚽ Partidos".
//
// Ruta de servidor: ?liga={providerId}. Usa getTeams del adaptador
// (cacheado 24 h) y lo UNE con los equipos que aparecen en el calendario
// de la temporada: el catálogo del proveedor trae huecos en algunas ligas
// (verificado: Grecia 8 de 14, Liga MX 17 de 18), y así la lista para
// seguir equipos queda completa.

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
    const porId = new Map<string, SportsTeam>();

    // 1) Equipos únicos del calendario de la temporada (base completa).
    const fixtures = await provider.getFixtures(liga.providerId, {
      season: liga.season,
    });
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

    // 2) Catálogo del proveedor encima (nombre corto y escudo oficiales).
    try {
      const catalogo = await provider.getTeams(liga.providerId);
      for (const t of catalogo) {
        const previo = porId.get(t.providerId);
        porId.set(t.providerId, {
          providerId: t.providerId,
          name: t.name,
          shortName: t.shortName,
          badgeUrl: t.badgeUrl || previo?.badgeUrl || null,
        });
      }
    } catch {
      // Sin catálogo no pasa nada: ya está la lista del calendario.
    }

    const teams = [...porId.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

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
