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
//   ?desde=&hasta=     rango EXACTO de días en Mazatlán (YYYY-MM-DD), para
//                      la pestaña Quiniela: trae los partidos de las ligas
//                      soportadas entre esas fechas (la jornada dura
//                      varios días y no cabe en la ventana normal).
//   ?liga=&equipo=     temporada completa de UN equipo en su liga (vista
//                      por equipo: últimos resultados y próximos partidos).
//   ?liga=             temporada completa de la LIGA (página de la liga:
//                      Resumen con destacado y pestaña Partidos).
//
// Respuesta ventana/fecha: { groups: [{ league, fixtures }], window }
// Respuesta equipo:        { league, teamProviderId, fixtures }
// Respuesta liga:          { league, fixtures }

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  SUPPORTED_LEAGUES,
  type SportsFixture,
  type SupportedLeague,
} from '@/lib/sports';
import { resolverLiga } from '@/lib/sports/ligaDinamica';
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

// ----- Mezcla segura del en vivo -------------------------------------------
// El feed en vivo del proveedor trae también partidos NO iniciados y con
// estados ajenos al juego; copiar su estado a ciegas marcaba partidos del
// calendario como EN VIVO horas o días antes de su inicio. La mezcla solo
// adopta estado/minuto/marcador cuando la entrada del feed está en juego
// de verdad o ya terminó, y jamás marca 'live' un partido cuyo inicio
// (según el calendario) aún no llega.

/** Estados crudos que NUNCA son "en juego" (mismo criterio que /api/en-vivo). */
const NO_EN_JUEGO = new Set([
  'FT',
  'AET',
  'AOT',
  'AWD',
  'WO',
  'PST',
  'CANC',
  'ABD',
  'PP',
  'NS',
  'TBD',
  'MATCH FINISHED',
]);

/** Estados crudos inequívocamente en curso (mismo criterio que
 *  /api/en-vivo). Q1–Q4/OT: cuartos y tiempo extra del básquetbol. */
const EN_CURSO = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'LIVE', 'Q1', 'Q2', 'Q3', 'Q4', 'OT']);

/**
 * ¿La entrada del feed está EN JUEGO ahora? Códigos en curso o, en su
 * defecto, el estado neutro 'live' CON minuto en vivo. 'PEN' solo cuenta
 * si trae progreso (la tanda en curso). Réplica de /api/en-vivo.
 */
function estaEnJuego(f: SportsFixture): boolean {
  const raw = (f.statusRaw || '').trim().toUpperCase();
  if (NO_EN_JUEGO.has(raw)) return false;
  if (EN_CURSO.has(raw)) return true;
  if (raw === 'PEN') return !!f.progress;
  return f.status === 'live' && !!f.progress;
}

/** ¿La entrada del feed puede pisar el estado del partido del calendario?
 *  Solo si está en juego de verdad o si ya terminó (para adoptar el
 *  marcador final). */
function mezclaValida(v: SportsFixture): boolean {
  return estaEnJuego(v) || v.status === 'finished';
}

/** ¿El inicio del partido aún no llega? Misma tolerancia de 5 min que el
 *  adaptador: un partido no puede estar en vivo antes de su hora. */
function kickoffEsFuturo(f: SportsFixture): boolean {
  if (!f.kickoffUtc) return false;
  const inicio = Date.parse(f.kickoffUtc);
  return !Number.isNaN(inicio) && Date.now() < inicio - 5 * 60_000;
}

/**
 * Mezcla segura del en vivo sobre un partido del calendario: adopta
 * estado/minuto/marcador del feed solo si la entrada está en juego o ya
 * terminó, y nunca marca 'live' un partido cuyo inicio aún no llega.
 */
function mezclarEnVivo(
  f: SportsFixture,
  v: SportsFixture | undefined
): SportsFixture {
  if (!v || !mezclaValida(v)) return f;
  if (v.status === 'live' && kickoffEsFuturo(f)) return f;
  return {
    ...f,
    status: v.status,
    statusRaw: v.statusRaw,
    progress: v.progress,
    homeScore: v.homeScore,
    awayScore: v.awayScore,
  };
}

/**
 * Mezcla de los ÚLTIMOS RESULTADOS (eventspastleague) sobre un partido
 * del calendario: si el proveedor ya lo trae terminado ahí pero la foto
 * del calendario (cacheada, payload grande) aún lo marca por jugar, se
 * adopta su estado final y su marcador. No pisa un partido en vivo ni
 * uno que el calendario ya trae terminado.
 */
function mezclarResultadosPasados(
  f: SportsFixture,
  p: SportsFixture | undefined
): SportsFixture {
  if (!p || p.status !== 'finished') return f;
  if (f.status === 'live' || f.status === 'finished') return f;
  return {
    ...f,
    status: p.status,
    statusRaw: p.statusRaw,
    homeScore: p.homeScore,
    awayScore: p.awayScore,
  };
}

/**
 * Mapa de en vivo para UNA liga: el feed general es solo de fútbol;
 * si la liga es de otro deporte se suma el feed de SU deporte
 * (livescore/{deporte} del adaptador) filtrado a esa liga. Fallo del
 * feed extra = se sigue con el general.
 */
async function vivoParaLiga(
  provider: ReturnType<typeof getSportsProvider>,
  liga: { providerId: string; sport?: string },
  base: Map<string, SportsFixture>
): Promise<Map<string, SportsFixture>> {
  const sport = (liga.sport || '').trim();
  if (!sport || sport === 'Soccer') return base;
  try {
    const delDeporte = await provider.getLiveScoresBySport(sport);
    const mapa = new Map(base);
    for (const f of delDeporte) {
      if (f.leagueProviderId === liga.providerId) mapa.set(f.providerId, f);
    }
    return mapa;
  } catch (e) {
    console.error(`Partidos: falló el en vivo de ${sport}:`, e);
    return base;
  }
}

/** Últimos resultados de la liga como mapa por id (vacío si falla). */
async function pasadosParaLiga(
  provider: ReturnType<typeof getSportsProvider>,
  leagueProviderId: string
): Promise<Map<string, SportsFixture>> {
  try {
    const pasados = await provider.getPastResults(leagueProviderId);
    return new Map(pasados.map((f) => [f.providerId, f]));
  } catch (e) {
    console.error(`Partidos: fallaron los últimos resultados:`, e);
    return new Map();
  }
}

function ligaPublica(liga: SupportedLeague, badgeUrl: string | null = null) {
  return {
    providerId: liga.providerId,
    name: liga.name,
    season: liga.season,
    zones: liga.zones,
    hasStandings: liga.hasStandings,
    badgeUrl,
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

    // Modo rango exacto (?desde=&hasta=): manda sobre los demás modos de
    // ventana; si el rango viene invertido o inválido, se ignora.
    const esYmd = (s: string | null): s is string =>
      !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const desdeParam = searchParams.get('desde');
    const hastaParam = searchParams.get('hasta');
    const rangoValido =
      esYmd(desdeParam) && esYmd(hastaParam) && desdeParam <= hastaParam;

    const desde = rangoValido
      ? desdeParam
      : (fecha ?? sumarDias(hoy, -1));
    const hasta = rangoValido ? hastaParam : (fecha ?? sumarDias(hoy, dias));

    const provider = getSportsProvider();

    // Logos de liga (cacheados 7 días en el adaptador): para mostrarlos
    // junto al nombre en los encabezados de grupo. Fallo = sin logo.
    const logosLiga = new Map<string, string | null>();
    await Promise.all(
      SUPPORTED_LEAGUES.map(async (l) => {
        try {
          logosLiga.set(l.providerId, await provider.getLeagueBadge(l.providerId));
        } catch {
          logosLiga.set(l.providerId, null);
        }
      })
    );

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
      // Liga curada o cualquiera del catálogo del proveedor: el
      // resolvedor arma su descriptor (temporada incluida).
      const liga = await resolverLiga(ligaParam);
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

      // Últimos resultados encima del calendario (foto vieja) y mezcla
      // segura del en vivo (con el feed del deporte si no es fútbol).
      const pasadosEq = await pasadosParaLiga(provider, liga.providerId);
      const vivoEq = await vivoParaLiga(provider, liga, vivoPorId);
      delEquipo = delEquipo.map((f) =>
        mezclarEnVivo(
          mezclarResultadosPasados(f, pasadosEq.get(f.providerId)),
          vivoEq.get(f.providerId)
        )
      );

      delEquipo.sort((a, b) =>
        (a.kickoffUtc || '').localeCompare(b.kickoffUtc || '')
      );

      return NextResponse.json({
        league: ligaPublica(liga, logosLiga.get(liga.providerId) ?? liga.badgeUrl ?? null),
        teamProviderId: equipoParam,
        fixtures: delEquipo,
        fetchedAt: new Date().toISOString(),
      });
    }

    // ----- Modo liga (?liga= sin equipo): su temporada completa -----
    // Para la página de la liga (Resumen con destacado + Partidos).
    if (ligaParam) {
      const liga = await resolverLiga(ligaParam);
      if (!liga) {
        return NextResponse.json(
          { error: 'Liga no soportada.' },
          { status: 400 }
        );
      }
      let deLaLiga: SportsFixture[] = [];
      try {
        deLaLiga = await provider.getFixtures(liga.providerId, {
          season: liga.season,
        });
      } catch (e) {
        console.error(`Partidos: falló la liga ${ligaParam}:`, e);
      }

      // Escudos faltantes desde el mapa de equipos de la liga.
      if (deLaLiga.some((f) => !f.homeBadgeUrl || !f.awayBadgeUrl)) {
        try {
          const equipos = await provider.getTeams(liga.providerId);
          const porId = new Map(equipos.map((t) => [t.providerId, t.badgeUrl]));
          deLaLiga = deLaLiga.map((f) => ({
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

      // Últimos resultados encima del calendario (foto vieja) y mezcla
      // segura del en vivo (con el feed del deporte si no es fútbol:
      // así la NBA y demás ligas también muestran resultados y vivo).
      const pasadosLiga = await pasadosParaLiga(provider, liga.providerId);
      const vivoLiga = await vivoParaLiga(provider, liga, vivoPorId);
      deLaLiga = deLaLiga.map((f) =>
        mezclarEnVivo(
          mezclarResultadosPasados(f, pasadosLiga.get(f.providerId)),
          vivoLiga.get(f.providerId)
        )
      );

      deLaLiga.sort((a, b) =>
        (a.kickoffUtc || '').localeCompare(b.kickoffUtc || '')
      );

      return NextResponse.json({
        league: ligaPublica(liga, logosLiga.get(liga.providerId) ?? liga.badgeUrl ?? null),
        fixtures: deLaLiga,
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

        // Mezcla segura del en vivo: estado, minuto y marcador al momento
        // (los escudos se completan desde el feed como antes).
        enVentana = enVentana.map((f) => {
          const v = vivoPorId.get(f.providerId);
          if (!v) return f;
          return {
            ...mezclarEnVivo(f, v),
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
        return { league: ligaPublica(liga, logosLiga.get(liga.providerId) ?? null), fixtures: enVentana };
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
