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
//                           (OJO: responde 404 con la llave vigente,
//                           verificado 2026-11-17; getFixtures cae a
//                           eventsseason.php y filtra por intRound)
//   fixtures de temporada:  eventsseason.php?id={liga}&s={temporada}
//   próximos partidos:      eventsnextleague.php?id={liga}
//   tabla de posiciones:    lookuptable.php?l={liga}&s={temporada}
//   equipos de la liga:     search_all_teams.php?l={nombre oficial}
//   en vivo (v2, premium):  api/v2/json/livescore/soccer (llave en header)
//   línea de tiempo:        lookupevent.php?id={evento} +
//                           lookuptimeline.php?id={evento}
//   catálogo de ligas:      all_leagues.php (todas, con su deporte)
//   ficha de una liga:      lookupleague.php?id={liga}
// OJO: lookuptable devuelve el cuerpo VACÍO (200, 0 bytes) para torneos de
// grupos/copa (Champions, Nations League, Libertadores): getStandings lo
// trata como "sin tabla" y devuelve []. La cuenta es PREMIUM (Single
// Developer): livescore cada 2 min y límites amplios. Ver README.md.

import type { SportsProvider } from './provider';
import { getSupportedLeague, CHAMPIONS_PROVIDER_ID } from './leagues';
import { getFootballDataChampionsStandings } from './footballData';
import type {
  FixtureEvent,
  FixtureEventType,
  FixtureEventsResult,
  GetFixturesOptions,
  LeagueCatalogEntry,
  LeagueInfo,
  SportsFixture,
  SportsTeam,
  SportsTeamDetail,
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
  /** Nombre del evento: en deportes individuales (F1, tenis) es lo
   *  único que identifica la carrera/partido, porque no hay equipos. */
  strEvent?: string;
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
  // Dónde ver (no siempre viene; se lee defensivo):
  strTVStation?: string;
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

/** Ficha de un equipo (lookupteam.php). */
interface TsdbTeamDetail extends TsdbTeam {
  strStadium?: string;
  // strManager: TheSportsDB NO lo devuelve (verificado 2026-11-14 en
  // v1 y v2, la llave ni siquiera viene en la respuesta). Se declara
  // por si el proveedor lo empieza a publicar: se lee defensivo.
  strManager?: string;
}

/**
 * Evento crudo de la línea de tiempo (lookuptimeline.php). Forma
 * verificada contra la API real (2026-11-17, Liga MX y Premier):
 * strTimeline ∈ {Goal, Card, subst, Var}; strTimelineDetail precisa
 * (Normal Goal, Penalty, Missed Penalty, Own Goal, Yellow Card,
 * Red Card, Goal cancelled, ...); strHome = "Yes"/"No" dice de qué
 * lado es el equipo ACREDITADO (strTeam); en los autogoles el equipo
 * acreditado es el que RECIBE el gol, no el del jugador (verificado:
 * el autogol de Daniel Parra, jugador de Querétaro, vino acreditado
 * a Atlético de San Luis y sumó para San Luis).
 */
interface TsdbTimelineEvent {
  intTime?: string;
  strTimeline?: string;
  strTimelineDetail?: string;
  strPlayer?: string;
  strAssist?: string;
  strComment?: string;
  strHome?: string;
  strTeam?: string;
  idTeam?: string;
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

/** Códigos crudos que inequívocamente son "en curso" (mismo criterio que
 *  la ruta /api/en-vivo). */
const ESTADOS_EN_CURSO = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'LIVE']);

/** Minuto de juego como estado crudo: "67", "45+2", "90+3"... */
const MINUTO_COMO_ESTADO = /^\d+(\+\d+)?$/;

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
  // En curso SOLO con códigos conocidos o con el minuto numérico. Antes
  // CUALQUIER otro código se adivinaba como 'live' y el feed trae códigos
  // ajenos al juego (p. ej. de partidos aún no iniciados): así salían
  // partidos como EN VIVO horas o días antes de su inicio. Un código
  // desconocido ahora es 'unknown', nunca 'live'.
  if (ESTADOS_EN_CURSO.has(s.toUpperCase()) || MINUTO_COMO_ESTADO.test(s)) {
    return 'live';
  }
  return 'unknown';
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
  // Deportes individuales (Automovilismo, Tenis...): el evento no
  // trae equipos (strHomeTeam/strAwayTeam vienen nulos) y lo que
  // identifica la carrera o el partido es strEvent ("Bahrain
  // Testing 1 Day 1", "...Tiafoe vs Vukic"). Va como nombre a
  // mostrar del lado local para que la fila no salga en blanco;
  // sin IDs de equipo, nada se enlaza a páginas de equipo.
  const sinEquipos = !raw.strHomeTeam && !raw.strAwayTeam;
  return {
    providerId: raw.idEvent,
    leagueProviderId: raw.idLeague || leagueIdFallback,
    season: raw.strSeason || null,
    round: numOrNull(raw.intRound),
    homeTeam: raw.strHomeTeam || (sinEquipos ? raw.strEvent || '' : ''),
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
    tvStation: raw.strTVStation || null,
  };
}

function mapLiveScore(raw: TsdbLiveScore): SportsFixture {
  const kickoffUtc = toUtcIso(raw.strTimestamp);
  let status = mapStatusFields(raw.strStatus, undefined);
  // Cordura temporal: un partido NO puede estar en vivo antes de su hora
  // de inicio, pero el feed v2 a veces lo anuncia en curso horas antes.
  // Si el inicio aún no llega (con 5 min de tolerancia por relojes y
  // arranques ligeramente adelantados), se fuerza a programado.
  if (status === 'live' && kickoffUtc) {
    const inicio = Date.parse(kickoffUtc);
    if (!Number.isNaN(inicio) && Date.now() < inicio - 5 * 60_000) {
      status = 'scheduled';
    }
  }
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
    kickoffUtc,
    date: raw.dateEvent || null,
    status,
    statusRaw: raw.strStatus || null,
    progress: raw.strProgress || null,
    homeScore: numOrNull(raw.intHomeScore),
    awayScore: numOrNull(raw.intAwayScore),
    venue: raw.strVenue || null,
    tvStation: null, // el livescore v2 no trae canal de TV
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

/** Texto del proveedor que en realidad significa "sin dato". */
function textoUtil(v: string | undefined): string | null {
  const t = (v || '').trim();
  if (!t || t.toUpperCase() === 'NULL') return null;
  return t;
}

/**
 * Clasifica un evento crudo de la línea de tiempo. La tabla de
 * equivalencias está en types.ts (FixtureEventType) y salió de
 * payloads reales, no de adivinar: ojo que el penal FALLADO también
 * viene con strTimeline "Goal" (su detalle es "Missed Penalty") y
 * que el gol anulado por el VAR no trae entrada "Goal": solo la
 * entrada Var/"Goal cancelled".
 */
function clasificarEventoTimeline(raw: TsdbTimelineEvent): FixtureEventType {
  const tipo = (raw.strTimeline || '').trim();
  const detalle = (raw.strTimelineDetail || '').trim();
  if (tipo === 'Goal') {
    if (detalle === 'Penalty') return 'gol_penal';
    if (detalle === 'Missed Penalty') return 'penal_fallado';
    if (detalle === 'Own Goal') return 'autogol';
    return 'gol';
  }
  if (tipo === 'Card') {
    return detalle.toLowerCase().includes('red') ? 'roja' : 'amarilla';
  }
  if (tipo === 'subst') return 'cambio';
  if (tipo === 'Var') {
    return detalle === 'Goal cancelled' ? 'gol_anulado' : 'otro';
  }
  return 'otro';
}

function mapTimelineEvent(
  raw: TsdbTimelineEvent,
  evento: TsdbEvent
): FixtureEvent {
  const etiqueta = (raw.intTime || '').trim();
  const minutoNum = Number.parseInt(etiqueta, 10);
  // Lado del equipo acreditado: strHome manda; si no viniera, se
  // deduce comparando idTeam contra los equipos del partido.
  let side: 'home' | 'away' | null = null;
  if (raw.strHome === 'Yes') side = 'home';
  else if (raw.strHome === 'No') side = 'away';
  else if (raw.idTeam && raw.idTeam === evento.idHomeTeam) side = 'home';
  else if (raw.idTeam && raw.idTeam === evento.idAwayTeam) side = 'away';
  return {
    minute: Number.isFinite(minutoNum) ? minutoNum : null,
    minuteLabel: etiqueta,
    type: clasificarEventoTimeline(raw),
    player: textoUtil(raw.strPlayer),
    assist: textoUtil(raw.strAssist),
    teamName: textoUtil(raw.strTeam),
    side,
    comment: textoUtil(raw.strComment),
    detailRaw: textoUtil(raw.strTimelineDetail),
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
    try {
      const data = await tsdbFetch<{ events: TsdbEvent[] | null }>(
        `eventsround.php?id=${encodeURIComponent(leagueProviderId)}` +
          `&r=${round}&s=${encodeURIComponent(season)}`,
        revalidate
      );
      return (data?.events ?? []).map((e) => mapEvent(e, leagueProviderId));
    } catch {
      // Respaldo verificado (2026-11-17): eventsround.php responde 404
      // con la llave vigente (probado con Liga MX y Premier League),
      // pero eventsseason.php trae la temporada completa y cada evento
      // lleva su intRound: la ronda se filtra aquí y el resultado es el
      // mismo. Si el endpoint directo revive, se usa sin tocar nada.
      const data = await tsdbFetch<{ events: TsdbEvent[] | null }>(
        `eventsseason.php?id=${encodeURIComponent(leagueProviderId)}` +
          `&s=${encodeURIComponent(season)}`,
        3600
      );
      return (data?.events ?? [])
        .map((e) => mapEvent(e, leagueProviderId))
        .filter((f) => f.round === round);
    }
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
  // Champions League: TheSportsDB no publica su tabla (lookuptable
  // vacío); la oficial viene de la fuente secundaria football-data.org
  // (ver footballData.ts). Si esa fuente falla, el error sube y la ruta
  // de la tabla cae al respaldo calculado por la app.
  if (leagueProviderId === CHAMPIONS_PROVIDER_ID) {
    return getFootballDataChampionsStandings();
  }
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
  // el NOMBRE oficial de la liga, no por su ID. El nombre sale del
  // catálogo de ligas soportadas (leagues.ts -> providerName) o, para
  // ligas fuera de ese catálogo, de la ficha de la liga (lookupleague).
  const liga = getSupportedLeague(leagueProviderId);
  let nombre = liga?.providerName;
  if (!nombre) {
    nombre = (await getLeagueInfo(leagueProviderId))?.name;
  }
  if (!nombre) {
    throw new Error(
      `getTeams: no se conoce el nombre oficial de la liga ${leagueProviderId}.`
    );
  }
  const path = `search_all_teams.php?l=${encodeURIComponent(nombre)}`;
  const data = await tsdbFetch<{ teams: TsdbTeam[] | null }>(path, 86400);
  return (data?.teams ?? []).map(mapTeam);
}

/**
 * Logo/escudo de la liga (lookupleague: strBadge, con strLogo de respaldo).
 * Es dato casi fijo: se cachea 7 días. Si la liga no trae ninguno, null.
 */
async function getLeagueBadge(leagueProviderId: string): Promise<string | null> {
  const path = `lookupleague.php?id=${encodeURIComponent(leagueProviderId)}`;
  const data = await tsdbFetch<{
    leagues: { strBadge?: string; strLogo?: string }[] | null;
  }>(path, 604800); // 7 días
  const liga = data?.leagues?.[0];
  return liga?.strBadge || liga?.strLogo || null;
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
 * Detalle de un equipo (lookupteam.php): nombre, escudo, estadio y DT.
 * El DT (strManager) en la práctica llega null: TheSportsDB no lo
 * publica en su API (verificado 2026-11-14); se lee defensivo por si
 * algún día lo agrega. Dato casi fijo: se cachea 1 día.
 */
async function getTeamDetail(
  teamProviderId: string
): Promise<SportsTeamDetail | null> {
  const path = `lookupteam.php?id=${encodeURIComponent(teamProviderId)}`;
  const data = await tsdbFetch<{ teams: TsdbTeamDetail[] | null }>(
    path,
    86400
  );
  const raw = data?.teams?.[0];
  if (!raw) return null;
  return {
    providerId: raw.idTeam,
    name: raw.strTeam,
    badgeUrl: raw.strBadge || raw.strTeamBadge || null,
    manager: raw.strManager?.trim() ? raw.strManager : null,
    stadium: raw.strStadium?.trim() ? raw.strStadium : null,
  };
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

/**
 * Línea de tiempo de un partido (lookupevent + lookuptimeline en
 * paralelo). La ficha se cachea 2 min y la línea solo 60 s: el feed
 * "minuto a minuto" se refresca con la vista (cada 2 min) y así un
 * gol anulado por el VAR deja de aparecer en cuanto el proveedor
 * corrige su línea, igual que pasa con el marcador.
 * Si el partido no existe en el proveedor, null; si existe pero su
 * línea viene vacía (pasa en partidos viejos o de ligas chicas), se
 * devuelve la ficha con events: [].
 */
async function getFixtureEvents(
  fixtureProviderId: string
): Promise<FixtureEventsResult | null> {
  const id = encodeURIComponent(fixtureProviderId);
  const [eventoData, timelineData] = await Promise.all([
    tsdbFetch<{ events: TsdbEvent[] | null }>(`lookupevent.php?id=${id}`, 120),
    tsdbFetch<{ timeline: TsdbTimelineEvent[] | null }>(
      `lookuptimeline.php?id=${id}`,
      60
    ),
  ]);
  const raw = eventoData?.events?.[0];
  if (!raw) return null;
  const fixture = mapEvent(raw, raw.idLeague || '');
  const events = (timelineData?.timeline ?? [])
    .map((t) => mapTimelineEvent(t, raw))
    // Cronológico ascendente; el sort es estable, así que los eventos
    // del mismo minuto conservan el orden en que los da el proveedor.
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  return { fixture, events };
}

/**
 * Catálogo COMPLETO de ligas del proveedor (all_leagues.php: más de
 * 1,500 ligas de todos los deportes). Dato casi fijo: se cachea 24 h.
 * Se descartan entradas sin ID o sin nombre (el catálogo trae ligas
 * extintas con datos incompletos).
 */
async function getLeagueCatalog(): Promise<LeagueCatalogEntry[]> {
  const data = await tsdbFetch<{
    leagues:
      | { idLeague?: string; strLeague?: string; strSport?: string }[]
      | null;
  }>('all_leagues.php', 86400);
  const entradas: LeagueCatalogEntry[] = [];
  for (const l of data?.leagues ?? []) {
    const providerId = (l.idLeague || '').trim();
    const name = (l.strLeague || '').trim();
    if (!providerId || !name) continue;
    entradas.push({
      providerId,
      name,
      sport: (l.strSport || '').trim() || 'Soccer',
    });
  }
  return entradas;
}

/**
 * Ficha de una liga cualquiera (lookupleague.php): nombre oficial,
 * deporte, temporada vigente (strCurrentSeason) y logo. Se cachea
 * 24 h. null si el proveedor no conoce la liga.
 */
async function getLeagueInfo(
  leagueProviderId: string
): Promise<LeagueInfo | null> {
  const path = `lookupleague.php?id=${encodeURIComponent(leagueProviderId)}`;
  const data = await tsdbFetch<{
    leagues:
      | {
          idLeague?: string;
          strLeague?: string;
          strSport?: string;
          strCurrentSeason?: string;
          strBadge?: string;
          strLogo?: string;
        }[]
      | null;
  }>(path, 86400);
  const raw = data?.leagues?.[0];
  if (!raw) return null;
  return {
    providerId: raw.idLeague || leagueProviderId,
    name: (raw.strLeague || '').trim(),
    sport: (raw.strSport || '').trim() || 'Soccer',
    season: (raw.strCurrentSeason || '').trim(),
    badgeUrl: raw.strBadge || raw.strLogo || null,
  };
}

export const theSportsDbProvider: SportsProvider = {
  name: 'thesportsdb',
  getFixtures,
  getStandings,
  getTeams,
  getTeamLogos,
  getTeamDetail,
  getLeagueBadge,
  getLiveScores,
  getFixtureEvents,
  getLeagueCatalog,
  getLeagueInfo,
};
