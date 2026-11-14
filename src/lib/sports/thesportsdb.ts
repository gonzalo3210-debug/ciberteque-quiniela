// src/lib/sports/thesportsdb.ts
//
// Implementación de SportsProvider para TheSportsDB (API v1 + livescore v2).
// SOLO SERVIDOR: lee la llave de THESPORTSDB_API_KEY (sin prefijo
// NEXT_PUBLIC_) para que nunca llegue al navegador.
//
// Sin llave NO se inventa ninguna: getApiKey() truena con un error claro.
// La llave pública de prueba que menciona la guía ("3") solo debe ponerse
// como valor de la variable en el .env.local de quien pruebe, no aquí.
//
// Endpoints usados (v1):
//   fixtures de una ronda:  eventsround.php?id={liga}&r={ronda}&s={temporada}
//   fixtures de temporada:  eventsseason.php?id={liga}&s={temporada}
//   próximos partidos:      eventsnextleague.php?id={liga}
//   tabla de posiciones:    lookuptable.php?l={liga}&s={temporada}
//   equipos de la liga:     search_all_teams.php?l={nombre oficial}
//   en vivo (v2, premium):  api/v2/json/livescore/soccer (llave en header)
// OJO: lookuptable devuelve el cuerpo VACÍO (200, 0 bytes) para torneos de
// grupos/copa (Champions, Nations League, Libertadores): getStandings lo
// trata como "sin tabla" y devuelve []. La cuenta es PREMIUM (Single
// Developer): livescore cada 2 min y límites amplios. Ver README.md.

import type { SportsProvider } from './provider';
import { getSupportedLeague } from './leagues';
import type {
  GetFixturesOptions,
  SportsFixture,
  SportsTeam,
  StandingRow,
  TeamLogoMap,
  FixtureStatus,
} from './types';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/sports es solo para el servidor: no lo importes en componentes cliente.'
  );
}

const DEFAULT_BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

function getApiKey(): string {
  const key = process.env.THESPORTSDB_API_KEY;
  if (!key) {
    throw new Error(
      'Falta THESPORTSDB_API_KEY en el entorno. Regístrala gratis en ' +
        'thesportsdb.com y ponla en .env.local (ver src/lib/sports/README.md).'
    );
  }
  return key;
}

function baseUrl(): string {
  const custom = process.env.THESPORTSDB_BASE_URL;
  return (custom || DEFAULT_BASE_URL).replace(/\/$/, '');
}

/** fetch JSON contra TheSportsDB con caché por revalidación.
 *  OJO: hay endpoints que responden HTTP 200 con el cuerpo VACÍO cuando
 *  no tienen datos (p. ej. lookuptable de Champions/Nations/Libertadores);
 *  eso NO es un error: se devuelve null y el llamador lo trata como
 *  "sin datos". */
async function tsdbFetch<T>(
  path: string,
  revalidateSeconds: number
): Promise<T | null> {
  const url = `${baseUrl()}/${getApiKey()}/${path}`;
  const res = await fetch(url, { next: { revalidate: revalidateSeconds } });
  if (!res.ok) {
    throw new Error(`TheSportsDB respondió ${res.status} en ${path}`);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

const V2_BASE_URL = 'https://www.thesportsdb.com/api/v2/json';

/** fetch JSON contra la API v2 (premium): la llave viaja en el encabezado
 *  X-API-KEY, no en la URL. Misma tolerancia a cuerpo vacío que la v1. */
async function tsdbV2Fetch<T>(
  path: string,
  revalidateSeconds: number
): Promise<T | null> {
  const res = await fetch(`${V2_BASE_URL}/${path}`, {
    headers: { 'X-API-KEY': getApiKey() },
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    throw new Error(`TheSportsDB v2 respondió ${res.status} en ${path}`);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

// ---------- Formas crudas de TheSportsDB (solo viven en este archivo) -------

interface TsdbEvent {
  idEvent: string;
  idLeague?: string;
  strSeason?: string;
  intRound?: string;
  dateEvent?: string;
  strTime?: string;
  strTimestamp?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string;
  strProgress?: string;
  strPostponed?: string;
  strVenue?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
}

/** Partido en vivo según la API v2 (livescore): trae escudos y progreso. */
interface TsdbLiveScore {
  idEvent: string;
  idLeague?: string;
  strSeason?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string;
  strProgress?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strVenue?: string;
}

interface TsdbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string;
  // La v1 ha usado ambos nombres según el endpoint:
  strTeamBadge?: string;
  strBadge?: string;
}

interface TsdbStanding {
  intRank?: string;
  idTeam?: string;
  strTeam?: string;
  strBadge?: string;
  intPlayed?: string;
  intWin?: string;
  intDraw?: string;
  intLoss?: string;
  intGoalsFor?: string;
  intGoalsAgainst?: string;
  intGoalDifference?: string;
  intPoints?: string;
  strForm?: string;
}

// ---------- Traducción a los tipos neutros ----------------------------------

const numOrNull = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const numOrZero = (v: string | undefined): number => numOrNull(v) ?? 0;

function mapStatusFields(
  status: string | undefined,
  postponed: string | undefined
): FixtureStatus {
  const s = (status || '').trim();
  if (postponed === 'yes' || s === 'PP' || s === 'CANC' || s === 'ABD') {
    return 'postponed';
  }
  if (s === 'NS' || s === '' || s === 'TBD') return 'scheduled';
  // 'AWD' = partido adjudicado (p. ej. 0-3 por decisión): quedó finalizado
  // con marcador oficial; sin esto salía como "en vivo" para siempre.
  if (['FT', 'AET', 'PEN', 'AWD', 'Match Finished'].includes(s)) {
    return 'finished';
  }
  // Cualquier otro código ("1H", "HT", "2H", minutos, etc.) = en curso.
  return s ? 'live' : 'unknown';
}

function mapStatus(raw: TsdbEvent): FixtureStatus {
  return mapStatusFields(raw.strStatus, raw.strPostponed);
}

/**
 * strTimestamp viene en UTC pero SIN la "Z" (p. ej. "2026-11-13T19:45:00").
 * Sin la Z, el navegador lo interpretaría como hora local y todo se movería;
 * aquí se normaliza a ISO con Z. (Verificado: Serbia-Alemania 19:45 UTC =
 * 12:45 en Mazatlán, como quedó en la quiniela del Club.)
 */
function toUtcIso(ts: string | undefined): string | null {
  if (!ts) return null;
  const t = ts.trim();
  if (!t) return null;
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) return t;
  return t.includes('T') ? `${t}Z` : t;
}

function mapEvent(raw: TsdbEvent, leagueIdFallback: string): SportsFixture {
  return {
    providerId: raw.idEvent,
    leagueProviderId: raw.idLeague || leagueIdFallback,
    season: raw.strSeason || null,
    round: numOrNull(raw.intRound),
    homeTeam: raw.strHomeTeam || '',
    awayTeam: raw.strAwayTeam || '',
    homeTeamProviderId: raw.idHomeTeam || null,
    awayTeamProviderId: raw.idAwayTeam || null,
    homeBadgeUrl: raw.strHomeTeamBadge || null,
    awayBadgeUrl: raw.strAwayTeamBadge || null,
    kickoffUtc: toUtcIso(raw.strTimestamp),
    date: raw.dateEvent || null,
    status: mapStatus(raw),
    statusRaw: raw.strStatus || null,
    progress: raw.strProgress || null,
    homeScore: numOrNull(raw.intHomeScore),
    awayScore: numOrNull(raw.intAwayScore),
    venue: raw.strVenue || null,
  };
}

function mapLiveScore(raw: TsdbLiveScore): SportsFixture {
  return {
    providerId: raw.idEvent,
    leagueProviderId: raw.idLeague || '',
    season: raw.strSeason || null,
    round: null,
    homeTeam: raw.strHomeTeam || '',
    awayTeam: raw.strAwayTeam || '',
    homeTeamProviderId: raw.idHomeTeam || null,
    awayTeamProviderId: raw.idAwayTeam || null,
    homeBadgeUrl: raw.strHomeTeamBadge || null,
    awayBadgeUrl: raw.strAwayTeamBadge || null,
    kickoffUtc: toUtcIso(raw.strTimestamp),
    date: raw.dateEvent || null,
    status: mapStatusFields(raw.strStatus, undefined),
    statusRaw: raw.strStatus || null,
    progress: raw.strProgress || null,
    homeScore: numOrNull(raw.intHomeScore),
    awayScore: numOrNull(raw.intAwayScore),
    venue: raw.strVenue || null,
  };
}

function mapTeam(raw: TsdbTeam): SportsTeam {
  return {
    providerId: raw.idTeam,
    name: raw.strTeam,
    shortName: raw.strTeamShort || null,
    badgeUrl: raw.strBadge || raw.strTeamBadge || null,
  };
}

// ---------- Implementación ---------------------------------------------------

async function getFixtures(
  leagueProviderId: string,
  options: GetFixturesOptions = {}
): Promise<SportsFixture[]> {
  const { season, round } = options;
  let path: string;
  let revalidate = 300; // 5 min
  if (round !== undefined) {
    if (!season) {
      throw new Error(
        'getFixtures: para pedir una ronda hay que indicar la temporada (season).'
      );
    }
    path =
      `eventsround.php?id=${encodeURIComponent(leagueProviderId)}` +
      `&r=${round}&s=${encodeURIComponent(season)}`;
  } else if (season) {
    path =
      `eventsseason.php?id=${encodeURIComponent(leagueProviderId)}` +
      `&s=${encodeURIComponent(season)}`;
    revalidate = 3600; // el calendario de temporada cambia poco
  } else {
    path = `eventsnextleague.php?id=${encodeURIComponent(leagueProviderId)}`;
  }
  const data = await tsdbFetch<{ events: TsdbEvent[] | null }>(path, revalidate);
  // TheSportsDB responde events: null cuando no hay datos (no es error).
  return (data?.events ?? []).map((e) => mapEvent(e, leagueProviderId));
}

async function getStandings(
  leagueProviderId: string,
  season: string
): Promise<StandingRow[]> {
  const path =
    `lookuptable.php?l=${encodeURIComponent(leagueProviderId)}` +
    `&s=${encodeURIComponent(season)}`;
  const data = await tsdbFetch<{ table: TsdbStanding[] | null }>(path, 600);
  return (data?.table ?? []).map((r) => ({
    rank: numOrZero(r.intRank),
    teamProviderId: r.idTeam || null,
    teamName: r.strTeam || '',
    badgeUrl: r.strBadge || null,
    played: numOrZero(r.intPlayed),
    won: numOrZero(r.intWin),
    drawn: numOrZero(r.intDraw),
    lost: numOrZero(r.intLoss),
    goalsFor: numOrZero(r.intGoalsFor),
    goalsAgainst: numOrZero(r.intGoalsAgainst),
    goalDifference: numOrZero(r.intGoalDifference),
    points: numOrZero(r.intPoints),
    form: r.strForm || null,
  }));
}

async function getTeams(leagueProviderId: string): Promise<SportsTeam[]> {
  // OJO: lookup_all_teams.php YA NO EXISTE en TheSportsDB (404 "endpoint
  // not found"); el endpoint vigente es search_all_teams.php y busca por
  // el NOMBRE oficial de la liga, no por su ID. El nombre vive en el
  // catálogo de ligas soportadas (leagues.ts -> providerName).
  const liga = getSupportedLeague(leagueProviderId);
  if (!liga) {
    throw new Error(
      `getTeams: la liga ${leagueProviderId} no está en el catálogo de ligas soportadas.`
    );
  }
  const path = `search_all_teams.php?l=${encodeURIComponent(liga.providerName)}`;
  const data = await tsdbFetch<{ teams: TsdbTeam[] | null }>(path, 86400);
  return (data?.teams ?? []).map(mapTeam);
}

async function getTeamLogos(leagueProviderId: string): Promise<TeamLogoMap> {
  const teams = await getTeams(leagueProviderId);
  const logos: TeamLogoMap = {};
  for (const team of teams) {
    if (team.badgeUrl) logos[team.name] = team.badgeUrl;
  }
  return logos;
}

/**
 * Marcadores en vivo de fútbol (API v2 premium, UNA consulta para todas
 * las ligas). La fuente refresca cada 2 minutos; aquí se cachea 60 s para
 * que el polling de los clientes (cada 2 min contra NUESTRA ruta) no queme
 * cuota. Trae también los recién terminados (status 'finished').
 */
async function getLiveScores(): Promise<SportsFixture[]> {
  const data = await tsdbV2Fetch<{ livescore: TsdbLiveScore[] | null }>(
    'livescore/soccer',
    60
  );
  return (data?.livescore ?? []).map(mapLiveScore);
}

export const theSportsDbProvider: SportsProvider = {
  name: 'thesportsdb',
  getFixtures,
  getStandings,
  getTeams,
  getTeamLogos,
  getLiveScores,
};
