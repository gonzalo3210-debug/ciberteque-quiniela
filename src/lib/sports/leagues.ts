// src/lib/sports/leagues.ts
//
// IDs de liga EN EL PROVEEDOR activo (TheSportsDB) y el catálogo de ligas
// SOPORTADAS por la sección "⚽ Partidos" (decisión de Gonzalo 2026-11-13:
// una sola sección tipo 365Scores, nada de un botón por liga; las
// posiciones se filtran por liga dentro de la sección).
//
// Liga MX: idLeague 4350 ("Mexican Primera League"), verificado contra el
// listado oficial de ligas de TheSportsDB (thesportsdb.com/league/4350).
// Si se migra de proveedor, estos IDs cambian y SOLO se toca este archivo
// junto con la implementación nueva.
//
// OJO: este archivo es PURO (sin imports) para poder importarse también
// desde componentes cliente por su ruta directa ('@/lib/sports/leagues').
// NO importar aquí nada del servidor (thesportsdb.ts truena en cliente).
//
// `hasStandings` refleja lo VERIFICADO contra la API real (2026-11-13):
// lookuptable devuelve filas para las ligas locales; para Nations League,
// Champions y Copa Libertadores devuelve el cuerpo VACÍO (son torneos de
// grupos/copa sin tabla única en el proveedor) y la vista de Posiciones
// muestra un mensaje claro en vez de romperse.

export const LIGA_MX_PROVIDER_ID = '4350';

/** Temporada vigente de Liga MX en el formato del proveedor ("AAAA-AAAA"). */
export const LIGA_MX_SEASON = '2026-2027';

/** Esquema de zonas de color de la tabla de una liga. */
export type LeagueZones =
  | 'liga-mx' // 1-6 liguilla directa, 7-10 play-in
  | 'europa' // 1-4 Champions, 5 Europa League, últimos 3 descenso
  | null; // sin zonas (torneos de grupos/copa o formatos con rondas)

export interface SupportedLeague {
  /** ID de la liga en el proveedor. */
  providerId: string;
  /** Nombre para mostrar en la app. */
  name: string;
  /** Nombre oficial de la liga EN el proveedor (para search_all_teams). */
  providerName: string;
  /** Temporada vigente en el formato del proveedor. */
  season: string;
  /** Zonas de color de su tabla (si tiene). */
  zones: LeagueZones;
  /** ¿El proveedor devuelve tabla de posiciones para esta liga? */
  hasStandings: boolean;
  /**
   * Sin tabla oficial: cómo la calcula la app desde los resultados de la
   * temporada (ver computedStandings.ts). 'grupos' = tablas por grupo
   * derivadas de quién juega contra quién; 'unica' = una sola tabla con
   * los partidos de la fase principal. undefined = no se calcula.
   */
  computedTable?: 'grupos' | 'unica';
  /** ¿Nace seguida en Favoritos (localStorage) si el usuario no ha elegido? */
  defaultFollowed: boolean;
}

export const SUPPORTED_LEAGUES: SupportedLeague[] = [
  {
    providerId: LIGA_MX_PROVIDER_ID,
    name: 'Liga MX',
    providerName: 'Mexican Primera League',
    season: LIGA_MX_SEASON,
    zones: 'liga-mx',
    hasStandings: true,
    defaultFollowed: true,
  },
  {
    providerId: '4490',
    name: 'UEFA Nations League',
    providerName: 'UEFA Nations League',
    season: '2026-2027',
    zones: null,
    hasStandings: false, // verificado: lookuptable vacío (grupos)
    computedTable: 'grupos', // 14 grupos reales derivados del calendario
    defaultFollowed: true,
  },
  {
    providerId: '4480',
    name: 'UEFA Champions League',
    providerName: 'UEFA Champions League',
    season: '2026-2027',
    zones: null,
    hasStandings: false, // verificado: lookuptable vacío (fase de liga sin tabla en v1)
    computedTable: 'unica', // formato actual: fase de liga, una sola tabla
    defaultFollowed: true,
  },
  {
    providerId: '4328',
    name: 'Premier League',
    providerName: 'English Premier League',
    season: '2026-2027',
    zones: 'europa',
    hasStandings: true,
    defaultFollowed: false,
  },
  {
    providerId: '4335',
    name: 'La Liga',
    providerName: 'Spanish La Liga',
    season: '2026-2027',
    zones: 'europa',
    hasStandings: true,
    defaultFollowed: false,
  },
  {
    providerId: '4332',
    name: 'Serie A',
    providerName: 'Italian Serie A',
    season: '2026-2027',
    zones: 'europa',
    hasStandings: true,
    defaultFollowed: false,
  },
  {
    providerId: '4331',
    name: 'Bundesliga',
    providerName: 'German Bundesliga',
    season: '2026-2027',
    zones: 'europa',
    hasStandings: true,
    defaultFollowed: false,
  },
  {
    providerId: '4334',
    name: 'Ligue 1',
    providerName: 'French Ligue 1',
    season: '2026-2027',
    zones: 'europa',
    hasStandings: true,
    defaultFollowed: false,
  },
  {
    providerId: '4336',
    name: 'Superliga de Grecia',
    providerName: 'Greek Super League 1',
    season: '2026-2027',
    zones: null, // formato con rondas de campeonato/descenso: sin zonas simples
    hasStandings: true,
    defaultFollowed: false,
  },
  {
    providerId: '4501',
    name: 'Copa Libertadores',
    providerName: 'Copa Libertadores',
    season: '2026', // la Libertadores es de año calendario, no "2026-2027"
    zones: null,
    hasStandings: false, // verificado: lookuptable vacío (grupos + llaves)
    computedTable: 'grupos', // 8 grupos de 4 derivados del calendario
    defaultFollowed: false,
  },
];

const BY_ID = new Map(SUPPORTED_LEAGUES.map((l) => [l.providerId, l]));

/** Liga soportada por su ID de proveedor (o undefined si no lo es). */
export function getSupportedLeague(
  providerId: string
): SupportedLeague | undefined {
  return BY_ID.get(providerId);
}

/** Ligas que nacen seguidas en Favoritos. */
export const DEFAULT_FOLLOWED_LEAGUE_IDS: string[] = SUPPORTED_LEAGUES.filter(
  (l) => l.defaultFollowed
).map((l) => l.providerId);
