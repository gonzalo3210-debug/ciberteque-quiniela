// src/lib/sports/types.ts
//
// Tipos NEUTROS de proveedor para datos deportivos externos.
// Ningún tipo de este archivo debe mencionar campos crudos de un proveedor
// concreto (TheSportsDB, API-Football, ...): la app consume SOLO estas
// formas, y cada implementación (ver ./provider.ts) traduce las suyas.

/** Equipo según el proveedor externo. */
export interface SportsTeam {
  /** ID del equipo en el proveedor (p. ej. idTeam de TheSportsDB). */
  providerId: string;
  /** Nombre completo del equipo (p. ej. "Tigres UANL"). */
  name: string;
  /** Nombre corto si el proveedor lo da (p. ej. "Tigres"). */
  shortName: string | null;
  /** URL del escudo/logo, lista para usarse como logo_url en la app. */
  badgeUrl: string | null;
}

export type FixtureStatus =
  | 'scheduled' // aún no se juega
  | 'live' // en curso
  | 'finished' // terminado
  | 'postponed' // pospuesto / cancelado
  | 'unknown';

/** Partido (fixture) según el proveedor externo. */
export interface SportsFixture {
  /** ID del partido en el proveedor (candidato a partidos.api_fixture_id). */
  providerId: string;
  leagueProviderId: string;
  /** Temporada en formato del proveedor, p. ej. "2026-2027". */
  season: string | null;
  /** Número de jornada/ronda, si el proveedor lo da. */
  round: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamProviderId: string | null;
  awayTeamProviderId: string | null;
  /** Fecha/hora de inicio en ISO 8601 UTC (strTimestamp), si existe. */
  kickoffUtc: string | null;
  /** Fecha local del partido (YYYY-MM-DD), si el proveedor la separa. */
  date: string | null;
  status: FixtureStatus;
  /** Estado crudo del proveedor, por si hace falta depurar. */
  statusRaw: string | null;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
}

/** Renglón de tabla de posiciones. */
export interface StandingRow {
  rank: number;
  teamProviderId: string | null;
  teamName: string;
  badgeUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Forma reciente cruda del proveedor (p. ej. "WWDLW"), si la da. */
  form: string | null;
}

export interface GetFixturesOptions {
  /** Temporada, p. ej. "2026-2027". Requerida si se pide una ronda. */
  season?: string;
  /** Jornada/ronda concreta; si se omite, se trae la temporada completa
   *  (o los próximos partidos si tampoco hay temporada). */
  round?: number;
}

/** Mapa nombre de equipo -> URL de su escudo. */
export type TeamLogoMap = Record<string, string>;
