// src/app/api/partidos/route.ts
//
// Partidos de las ligas SOPORTADAS (ver src/lib/sports/leagues.ts) para la
// sección "⚽ Partidos" (vistas Favoritos y Resultados, estilo 365Scores).
//
// Ruta de servidor: por cada liga trae el calendario de la temporada vía el
// adaptador único (cacheado 1 h) y lo recorta a una ventana de días en
// America/Mazatlan: desde AYER hasta HOY + `dias` (1 por defecto; Favoritos
// pide 7 para mostrar próximos partidos). Encima mezcla los marcadores EN
// VIVO (una sola consulta v2, cacheada 60 s) para estado/minuto/marcador al
// momento. La llave del proveedor nunca sale del servidor.
//
// Modos (parámetros):
//   ?dias=N            ventana ayer → hoy+N (defecto N=1).
//   ?fecha=YYYY-MM-DD  SOLO ese día (selector de día de Resultados); filtra
//                      el MISMO calendario de temporada cacheado, sin
//                      consultas extra al proveedor.
//   ?liga=&equipo=     temporada completa de UN equipo en su liga (vista
//                      por equipo: últimos resultados y próximos partidos).
//
// Respuesta ventana/fecha: { groups: [{ league, fixtures }], window }
// Respuesta equipo:        { league, teamProviderId, fixtures }

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  getSupportedLeague,
  SUPPORTED_LEAGUES,
  type SportsFixture,
  type SupportedLeague,
} from '@/lib/sports';
import {
  fechaEnMazatlan,
  hoyEnMazatlan,
  sumarDias,
} from '@/lib/fechaMazatlan';

export const dynamic = 'force-dynamic';

/** Fecha del partido en Mazatlán: del kickoff UTC; si no hay, la del proveedor. */
function fechaDelPartido(f: SportsFixture): string | null {
  if (f.kickoffUtc) {
    try {
      return fechaEnMazatlan(f.kickoffUtc);
    } catch {
      return f.date;
    }
  }
  return f.date;
}

const rangoEstado = (f: SportsFixture): number => {
  switch (f.status) {
    case 'live':
      return 0;
    case 'scheduled':
      return 1;
    case 'finished':
      return 2;
    case 'postponed':
      return 3;
    default:
      return 4;
  }
};

/** Orden dentro de la liga: en vivo primero, luego por jugar (por hora),
 *  al final los terminados (el más reciente primero). */
function compararPartidos(a: SportsFixture, b: SportsFixture): number {
  const r = rangoEstado(a) - rangoEstado(b);
  if (r !== 0) return r;
  const ka = a.kickoffUtc || '';
  const kb = b.kickoffUtc || '';
  return a.status === 'finished' ? kb.localeCompare(ka) : ka.localeCompare(kb);
}

function ligaPublica(liga: SupportedLeague) {
  return {
    providerId: liga.providerId,
    name: liga.name,
    season: liga.season,
    zones: liga.zones,
    hasStandings: liga.hasStandings,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const diasPedidos = Number(searchParams.get('dias') || '1');
    const dias = Number.isFinite(diasPedidos)
      ? Math.min(7, Math.max(1, Math.trunc(diasPedidos)))
      : 1;

    const hoy = hoyEnMazatlan();

    // Modo día concreto (?fecha=YYYY-MM-DD): la ventana es ese solo día.
    const fechaParam = searchParams.get('fecha');
    const fecha =
      fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)
        ? fechaParam
        : null;
    const desde = fecha ?? sumarDias(hoy, -1);
    const hasta = fecha ?? sumarDias(hoy, dias);

    const provider = getSportsProvider();

    // En vivo: si falla, la ruta sigue sin marcadores al momento.
    let enVivo: SportsFixture[] = [];
    try {
      enVivo = await provider.getLiveScores();
    } catch (e) {
      console.error('Partidos: no se pudo traer el en vivo:', e);
    }
    const vivoPorId = new Map(enVivo.map((f) => [f.providerId, f]));

    // ----- Modo equipo (?liga=&equipo=): su temporada completa -----
    const ligaParam = searchParams.get('liga');
    const equipoParam = searchParams.get('equipo');
    if (ligaParam && equipoParam) {
      const liga = getSupportedLeague(ligaParam);
      if (!liga) {
        return NextResponse.json(
          { error: 'Liga no soportada.' },
          { status: 400 }
        );
      }
      let delEquipo: SportsFixture[] = [];
      try {
        const temporada = await provider.getFixtures(liga.providerId, {
          season: liga.season,
        });
        delEquipo = temporada.filter(
          (f) =>
            f.homeTeamProviderId === equipoParam ||
            f.awayTeamProviderId === equipoParam
        );
      } catch (e) {
        console.error(`Partidos: falló el equipo ${equipoParam}:`, e);
      }

      // Escudos faltantes desde el mapa de equipos de la liga.
      if (delEquipo.some((f) => !f.homeBadgeUrl || !f.awayBadgeUrl)) {
        try {
          const equipos = await provider.getTeams(liga.providerId);
          const porId = new Map(equipos.map((t) => [t.providerId, t.badgeUrl]));
          delEquipo = delEquipo.map((f) => ({
            ...f,
            homeBadgeUrl:
              f.homeBadgeUrl ||
              (f.homeTeamProviderId
                ? porId.get(f.homeTeamProviderId) ?? null
                : null),
            awayBadgeUrl:
              f.awayBadgeUrl ||
              (f.awayTeamProviderId
                ? porId.get(f.awayTeamProviderId) ?? null
                : null),
          }));
        } catch {
          // Sin mapa de equipos: se muestran sin escudo.
        }
      }

      // Mezcla del en vivo para sus partidos en curso.
      delEquipo = delEquipo.map((f) => {
        const v = vivoPorId.get(f.providerId);
        if (!v) return f;
        return {
          ...f,
          status: v.status,
          statusRaw: v.statusRaw,
          progress: v.progress,
          homeScore: v.homeScore,
          awayScore: v.awayScore,
        };
      });

      delEquipo.sort((a, b) =>
        (a.kickoffUtc || '').localeCompare(b.kickoffUtc || '')
      );

      return NextResponse.json({
        league: ligaPublica(liga),
        teamProviderId: equipoParam,
        fixtures: delEquipo,
        fetchedAt: new Date().toISOString(),
      });
    }

    const groups = await Promise.all(
      SUPPORTED_LEAGUES.map(async (liga) => {
        let fixtures: SportsFixture[] = [];
        try {
          fixtures = await provider.getFixtures(liga.providerId, {
            season: liga.season,
          });
        } catch (e) {
          console.error(`Partidos: falló la liga ${liga.name}:`, e);
        }

        let enVentana = fixtures.filter((f) => {
          const d = fechaDelPartido(f);
          return d !== null && d >= desde && d <= hasta;
        });

        // Escudos: el calendario ya los trae; si faltara alguno, se completa
        // con el mapa de equipos de la liga (cacheado 24 h).
        if (enVentana.some((f) => !f.homeBadgeUrl || !f.awayBadgeUrl)) {
          try {
            const equipos = await provider.getTeams(liga.providerId);
            const porId = new Map(
              equipos.map((t) => [t.providerId, t.badgeUrl])
            );
            enVentana = enVentana.map((f) => ({
              ...f,
              homeBadgeUrl:
                f.homeBadgeUrl ||
                (f.homeTeamProviderId
                  ? porId.get(f.homeTeamProviderId) ?? null
                  : null),
              awayBadgeUrl:
                f.awayBadgeUrl ||
                (f.awayTeamProviderId
                  ? porId.get(f.awayTeamProviderId) ?? null
                  : null),
            }));
          } catch {
            // Sin mapa de equipos: los partidos se muestran sin escudo.
          }
        }

        // Mezcla del en vivo: estado, minuto y marcador al momento.
        enVentana = enVentana.map((f) => {
          const v = vivoPorId.get(f.providerId);
          if (!v) return f;
          return {
            ...f,
            status: v.status,
            statusRaw: v.statusRaw,
            progress: v.progress,
            homeScore: v.homeScore,
            awayScore: v.awayScore,
            homeBadgeUrl: f.homeBadgeUrl || v.homeBadgeUrl,
            awayBadgeUrl: f.awayBadgeUrl || v.awayBadgeUrl,
          };
        });

        // Partidos en vivo de la liga que no vengan en el calendario
        // recortado (p. ej. reprogramados): se agregan si caen en ventana.
        const ids = new Set(enVentana.map((f) => f.providerId));
        for (const v of enVivo) {
          if (v.leagueProviderId !== liga.providerId || ids.has(v.providerId)) {
            continue;
          }
          const d = fechaDelPartido(v);
          if (d !== null && d >= desde && d <= hasta) enVentana.push(v);
        }

        enVentana.sort(compararPartidos);
        return { league: ligaPublica(liga), fixtures: enVentana };
      })
    );

    return NextResponse.json({
      groups,
      window: { desde, hasta },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al obtener los partidos:', error);
    return NextResponse.json(
      {
        error:
          'No se pudieron cargar los partidos. Intenta de nuevo en unos minutos.',
      },
      { status: 502 }
    );
  }
}
