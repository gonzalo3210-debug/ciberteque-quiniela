// src/lib/sports/provider.ts
//
// LA PIEZA ÚNICA de datos deportivos externos.
// Toda la app pide partidos, tabla y logos a través de esta interfaz
// (vía getSportsProvider()); ningún componente ni hook debe hablar directo
// con un proveedor. Para migrar a API-Football el día que el Club crezca:
//   1. Crear ./apiFootball.ts implementando SportsProvider (la ruta
//      src/app/api/sincronizar-partidos ya habla con API-Football y sirve
//      de referencia de llaves y formas).
//   2. Cambiar UNA línea en getSportsProvider().
// Nada más se toca.

import type {
  FixtureEventsResult,
  FixtureTVListing,
  GetFixturesOptions,
  LeagueCatalogEntry,
  LeagueInfo,
  SportsFixture,
  SportsTeam,
  SportsTeamDetail,
  StandingRow,
  TeamLogoMap,
} from './types';

export interface SportsProvider {
  /** Identificador del proveedor activo ('thesportsdb', 'api-football', ...). */
  readonly name: string;

  /**
   * Partidos de una liga:
   * - con `round` + `season`: los de esa jornada;
   * - solo con `season`: el calendario de la temporada;
   * - sin opciones: los próximos partidos de la liga.
   */
  getFixtures(
    leagueProviderId: string,
    options?: GetFixturesOptions
  ): Promise<SportsFixture[]>;

  /** Tabla de posiciones de una liga en una temporada ("2026-2027"). */
  getStandings(
    leagueProviderId: string,
    season: string
  ): Promise<StandingRow[]>;

  /**
   * Marcadores EN VIVO de fútbol de TODAS las ligas (una sola consulta).
   * Incluye los partidos en curso y los recién terminados; cada quien
   * filtra por `leagueProviderId`. Es la fuente para recalcular la tabla
   * en vivo al caer gol (ver liveStandings.ts) y para la vista Live.
   */
  getLiveScores(): Promise<SportsFixture[]>;

  /**
   * Marcadores EN VIVO de un deporte dado ('Basketball', 'Baseball'...),
   * de TODAS sus ligas (una sola consulta); cada quien filtra por
   * `leagueProviderId`. Para 'Soccer' equivale a getLiveScores().
   * Es la vía para que las ligas que no son de fútbol (p. ej. la NBA)
   * también muestren marcador al momento en su página.
   */
  getLiveScoresBySport(sport: string): Promise<SportsFixture[]>;

  /**
   * Últimos resultados YA terminados de una liga (los más recientes,
   * ~15), con marcador final. Complementa el calendario de temporada:
   * como aquel payload es grande y va cacheado, su foto puede venir
   * vieja en la primera visita; esta respuesta es chica y fresca, y
   * la ruta la mezcla encima para que los resultados recientes
   * siempre se vean.
   */
  getPastResults(leagueProviderId: string): Promise<SportsFixture[]>;

  /** Equipos de una liga, con escudo. */
  getTeams(leagueProviderId: string): Promise<SportsTeam[]>;

  /**
   * URL del logo/escudo de la liga (para mostrar junto a su nombre).
   * Dato casi fijo (caché larga); null si el proveedor no trae logo.
   */
  getLeagueBadge(leagueProviderId: string): Promise<string | null>;

  /** Mapa nombre de equipo -> URL del escudo (para equipos.logo_url). */
  getTeamLogos(leagueProviderId: string): Promise<TeamLogoMap>;

  /**
   * Detalle de UN equipo (ficha del club: DT, estadio...). null si el
   * proveedor no conoce el equipo. El DT puede venir null aunque el
   * equipo exista: TheSportsDB hoy no lo publica (ver types.ts).
   */
  getTeamDetail(teamProviderId: string): Promise<SportsTeamDetail | null>;

  /**
   * Línea de tiempo de UN partido (goles, tarjetas, cambios...), con
   * los eventos YA clasificados a los tipos neutros de types.ts, más
   * la ficha del partido (equipos, marcador y estado al momento).
   * null si el proveedor no conoce el partido. Como la línea se lee
   * tal cual en cada consulta, un gol anulado por el VAR desaparece
   * solo del feed que la consume.
   */
  getFixtureEvents(
    fixtureProviderId: string
  ): Promise<FixtureEventsResult | null>;

  /**
   * Transmisiones de TV/streaming de UN partido (canal + país de
   * cada una, con logo si hay). Cobertura PARCIAL del proveedor:
   * muchos partidos no traen ninguna ([]) y abundan los canales de
   * EE.UU./Europa, casi nada de México. Es solo el respaldo del
   * canal curado de la quiniela (partidos.canal), que manda siempre
   * en la vista del partido.
   */
  getFixtureTV(fixtureProviderId: string): Promise<FixtureTVListing[]>;

  /**
   * Catálogo COMPLETO de ligas del proveedor (todas, no solo las
   * curadas del Club), con su deporte. Dato casi fijo: el adaptador
   * lo cachea 24 h.
   */
  getLeagueCatalog(): Promise<LeagueCatalogEntry[]>;

  /**
   * Ficha de UNA liga cualquiera del proveedor (nombre oficial,
   * deporte, temporada vigente y logo). null si no existe. Es la
   * pieza que permite abrir ligas fuera del catálogo curado.
   */
  getLeagueInfo(leagueProviderId: string): Promise<LeagueInfo | null>;
}

import { theSportsDbProvider } from './thesportsdb';

/** Proveedor activo de toda la app. Hoy: TheSportsDB. */
export function getSportsProvider(): SportsProvider {
  return theSportsDbProvider;
}
