// src/app/api/tabla-liga/route.ts
//
// Tabla de posiciones DE UNA LIGA (no confundir con el ranking del Club
// entre jugadores, que vive en Supabase y no se toca aquí).
//
// Ruta de servidor generalizada por liga: ?liga={providerId} — una de
// las SOPORTADAS (src/lib/sports/leagues.ts) o cualquiera del catálogo
// del proveedor (el resolvedor verifica su tabla); sin parámetro =
// Liga MX.
// Pide la tabla al proveedor vía el adaptador único (cacheada 10 min) y, si
// la liga tiene partidos EN CURSO, devuelve también la tabla recalculada
// AL CAER GOL con computeLiveStandings (regla de Gonzalo 2026-11-13) en
// `liveRows`, para que la vista la marque "EN VIVO", y los marcadores en
// curso en `liveMatches`, para pintar el distintivo junto a cada equipo
// que está jugando (Bloque 4, 2026-11-14).
//
// FINALES RECIENTES (regla de Gonzalo 2026-11-21): la tabla oficial del
// proveedor tarda horas en recalcularse, así que un partido terminado
// salía del ajuste en vivo antes de entrar a la oficial y sus puntos
// "desaparecían". Ahora los finales de las últimas ~24 h que la oficial
// aún no cuenta se mantienen aplicados (finalesNoContados, con guarda
// anti doble conteo por partidos jugados) y la tabla recalculada se
// devuelve en el mismo `liveRows`.
//
// Champions League (4480): TheSportsDB no trae su tabla, así que el
// adaptador la pide a la fuente secundaria football-data.org y llega
// por el camino OFICIAL (calculated: false). Si esa fuente falla, esta
// ruta cae al RESPALDO: la tabla calculada por la app.
//
// Las ligas de grupos/copa sin tabla oficial (hasStandings=false:
// Nations League, Libertadores) se CALCULAN desde los resultados de la
// temporada (computeStandingsFromResults) y se responden con
// `calculated: true` y `groups` (una tabla por grupo, o una sola en
// formato fase de liga), para que la vista la marque como "Tabla
// calculada por la app", distinta de la oficial. La tabla en vivo al
// caer gol también aplica, por grupo (liveGroups).
// Las llaves de los proveedores nunca salen del servidor.

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  computeLiveStandings,
  computeStandingsFromResults,
  finalesNoContados,
  LIGA_MX_PROVIDER_ID,
  type ComputedTable,
  type LeagueZones,
  type LiveResult,
  type SportsFixture,
  type StandingRow,
  type SupportedLeague,
} from '@/lib/sports';
import { resolverLigaConTabla } from '@/lib/sports/ligaDinamica';

export const dynamic = 'force-dynamic';

interface LigaJson {
  providerId: string;
  name: string;
  season: string;
  zones: LeagueZones;
  hasStandings: boolean;
  badgeUrl: string | null;
}

interface EnVivoLiga {
  /** En la forma que pide el recálculo de la tabla. */
  resultados: LiveResult[];
  /** Partidos de la liga ya TERMINADOS según el feed en vivo (que
   *  conserva los recién terminados): cierran el hueco entre el
   *  silbatazo y el refresco del calendario de temporada cacheado,
   *  para el ajuste de finales recientes. */
  finales: SportsFixture[];
  /** Marcadores tal cual, para que la vista pinte el distintivo en
   *  vivo junto a cada equipo que está jugando (Bloque 4, 2026-11-14). */
  marcadores: {
    homeTeam: string;
    awayTeam: string;
    homeTeamProviderId: string | null;
    awayTeamProviderId: string | null;
    homeScore: number;
    awayScore: number;
    progress: string | null;
    statusRaw: string | null;
  }[];
}

/** Partidos EN VIVO de una liga (una sola llamada al livescore). */
async function enVivoDeLiga(ligaId: string): Promise<EnVivoLiga> {
  const enVivo = await getSportsProvider().getLiveScores();
  const deLaLiga = enVivo.filter(
    (f) =>
      f.leagueProviderId === ligaId &&
      f.status === 'live' &&
      f.homeScore !== null &&
      f.awayScore !== null
  );
  const finales = enVivo.filter(
    (f) =>
      f.leagueProviderId === ligaId &&
      f.status === 'finished' &&
      f.homeScore !== null &&
      f.awayScore !== null
  );
  return {
    finales,
    resultados: deLaLiga.map((f) => ({
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeTeamProviderId: f.homeTeamProviderId,
      awayTeamProviderId: f.awayTeamProviderId,
      homeScore: f.homeScore as number,
      awayScore: f.awayScore as number,
    })),
    marcadores: deLaLiga.map((f) => ({
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeTeamProviderId: f.homeTeamProviderId,
      awayTeamProviderId: f.awayTeamProviderId,
      homeScore: f.homeScore as number,
      awayScore: f.awayScore as number,
      progress: f.progress,
      statusRaw: f.statusRaw,
    })),
  };
}

/**
 * Tabla CALCULADA por la app desde los resultados de la temporada.
 * Es el camino normal de las ligas sin tabla oficial (Nations,
 * Libertadores) y el RESPALDO de la Champions si football-data.org
 * falla.
 */
async function respuestaTablaCalculada(
  liga: SupportedLeague,
  ligaJson: LigaJson
): Promise<NextResponse> {
  try {
    const provider = getSportsProvider();
    const fixtures = await provider.getFixtures(liga.providerId, {
      season: liga.season,
    });
    const groups: ComputedTable[] = computeStandingsFromResults(
      fixtures,
      liga.computedTable as 'grupos' | 'unica' | 'grupos-directos'
    );

    // Tabla EN VIVO al caer gol, por grupo: computeLiveStandings ignora
    // los resultados con equipos ajenos a cada tabla.
    let liveGroups: ComputedTable[] | null = null;
    let marcadores: EnVivoLiga['marcadores'] = [];
    try {
      const vivo = await enVivoDeLiga(liga.providerId);
      marcadores = vivo.marcadores;
      const resultados = vivo.resultados;
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
      liveMatches: marcadores,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ligaId = searchParams.get('liga') || LIGA_MX_PROVIDER_ID;
  // Liga curada o cualquiera del catálogo: el resolvedor, además de
  // armar el descriptor, verifica si la tabla oficial trae filas
  // (las dinámicas de fútbol sin tabla oficial caen a la calculada;
  // las de otros deportes quedan sin Posiciones).
  const liga = await resolverLigaConTabla(ligaId);

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

  const ligaJson: LigaJson = {
    providerId: liga.providerId,
    name: liga.name,
    season: liga.season,
    zones: liga.zones,
    hasStandings: liga.hasStandings,
    badgeUrl,
  };

  if (liga.hasStandings) {
    try {
      const provider = getSportsProvider();
      const season = searchParams.get('season') || liga.season;
      const rows: StandingRow[] = await provider.getStandings(
        liga.providerId,
        season
      );

      // Tabla EN VIVO: si hay partidos de esta liga en curso, se
      // recalcula con sus marcadores actuales. Si el en vivo falla, se
      // sigue oficial. Y si ningún marcador emparejó con la tabla (p.
      // ej. la Champions, cuya tabla viene de otra fuente), no se
      // marca "en vivo" una tabla que no cambió.
      // A los resultados en curso se suman los FINALES recientes que
      // la tabla oficial aún no cuenta (regla 2026-11-21, ver el
      // encabezado): sin esto, al silbatazo el resultado salía del
      // ajuste y los puntos desaparecían por horas.
      let liveRows: StandingRow[] | null = null;
      let marcadores: EnVivoLiga['marcadores'] = [];
      try {
        const vivo = await enVivoDeLiga(liga.providerId);
        marcadores = vivo.marcadores;
        let resultados = vivo.resultados;
        try {
          const deTemporada = await provider.getFixtures(liga.providerId, {
            season,
          });
          // El calendario de temporada se cachea 1 h y puede tardar en
          // marcar el final recién jugado; el feed en vivo sí lo trae
          // ya terminado, así que sus finales se suman sin duplicar
          // (mismo ID de partido del proveedor).
          const idsTemporada = new Set(deTemporada.map((f) => f.providerId));
          const fixtures = [
            ...deTemporada,
            ...vivo.finales.filter((f) => !idsTemporada.has(f.providerId)),
          ];
          const finales = finalesNoContados(rows, fixtures, {
            excluir: resultados,
          });
          if (finales.length > 0) resultados = [...resultados, ...finales];
        } catch (e) {
          console.error(`Tabla ${liga.name}: falló el ajuste de finales:`, e);
        }
        if (resultados.length > 0 && rows.length > 0) {
          const recalculada = computeLiveStandings(rows, resultados);
          const jugadosBase = rows.reduce((a, r) => a + r.played, 0);
          const jugadosVivo = recalculada.reduce((a, r) => a + r.played, 0);
          if (jugadosVivo !== jugadosBase) liveRows = recalculada;
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
        liveMatches: marcadores,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Sin respaldo calculado configurado: error como siempre. Con
      // respaldo (Champions si football-data.org falla): se calcula.
      if (!liga.computedTable) {
        console.error(`Error al obtener la tabla de ${liga.name}:`, error);
        return NextResponse.json(
          {
            error: `No se pudo cargar la tabla de ${liga.name}. Intenta de nuevo en unos minutos.`,
          },
          { status: 502 }
        );
      }
      console.error(
        `Tabla oficial de ${liga.name} falló; cayendo al respaldo calculado:`,
        error
      );
    }
  }

  // Camino calculado: ligas sin tabla oficial y respaldo de Champions.
  if (liga.computedTable) {
    return respuestaTablaCalculada(liga, ligaJson);
  }

  // Sin tabla oficial ni modo de cálculo: respuesta vacía.
  return NextResponse.json({
    league: ligaJson,
    hasStandings: false,
    calculated: false,
    rows: [],
    liveRows: null,
    hasLive: false,
    liveMatches: [],
    fetchedAt: new Date().toISOString(),
  });
}
