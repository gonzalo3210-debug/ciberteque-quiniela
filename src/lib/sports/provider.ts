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
  GetFixturesOptions,
  SportsFixture,
  SportsTeam,
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

  /** Equipos de una liga, con escudo. */
  getTeams(leagueProviderId: string): Promise<SportsTeam[]>;

  /** Mapa nombre de equipo -> URL del escudo (para equipos.logo_url). */
  getTeamLogos(leagueProviderId: string): Promise<TeamLogoMap>;
}

import { theSportsDbProvider } from './thesportsdb';

/** Proveedor activo de toda la app. Hoy: TheSportsDB. */
export function getSportsProvider(): SportsProvider {
  return theSportsDbProvider;
}
