// src/lib/sports/footballData.ts
//
// FUENTE SECUNDARIA de datos deportivos: football-data.org (API v4).
//
// Se usa para UNA sola cosa: la TABLA BASE de la UEFA Champions
// League (liga 4480). TheSportsDB no publica esa tabla (su
// lookuptable devuelve el cuerpo vacío: es fase de liga).
//
// LA BASE SE CALCULA DESDE LOS PARTIDOS, NO DESDE SU TABLA PUBLICADA
// (corrección de Gonzalo, 2026-11-25): la tabla que football-data
// publica (endpoint /standings) YA cuenta el partido EN CURSO con su
// marcador del momento (0-0 al arranque), y como la app además aplica
// ese mismo partido con la capa en vivo (computeLiveStandings), el
// partido se contaba DOS VECES: un empate fantasma (PJ +1, E +1,
// +1 punto a cada equipo) más el resultado real. Verificado en vivo
// el 2026-11-25 con el Sabah Baku–Barcelona: la tabla publicada ya
// traía el 0-1 en curso sumado mientras el endpoint de partidos aún
// lo marcaba TIMED. Por eso la base aquí se arma SOLO con partidos
// FINALIZADOS (status FINISHED) de la fase de liga (stage
// LEAGUE_STAGE) del endpoint /matches: la capa en vivo aplica el
// partido en curso una sola vez, con su marcador real, igual que en
// las demás ligas. Verificado el mismo día: la base calculada
// reproduce EXACTO los números de la tabla publicada para los 32
// equipos sin partido en curso (Barcelona: PJ 4, G3 E0 P1, GF 14 —
// sus 4 finalizados de las jornadas 1-4).
//
// Requiere el token gratuito en la variable de entorno
// FOOTBALL_DATA_TOKEN (registrado en football-data.org). Plan gratis:
// 10 peticiones/minuto — de sobra, porque la respuesta se cachea
// 1 hora (el hueco entre el silbatazo final y el refresco de la caché
// lo cierra el ajuste de finales recientes de la ruta, igual que con
// las demás ligas). Si falta el token o la fuente falla, quien llama
// (el adaptador) propaga el error y la ruta de la tabla cae al
// RESPALDO: la tabla calculada por la app desde los resultados (ver
// computedStandings.ts).
//
// Las filas se devuelven en la forma neutra StandingRow, con el
// NOMBRE canónico e ID de TheSportsDB para cada equipo (mapa abajo,
// verificado contra ambas APIs el 2026-11-14): así la capa de nombres
// en español (nombresES.ts), el resaltado de la vista por equipo y el
// recálculo en vivo siguen funcionando igual que con la fuente
// principal. El escudo sí es el de football-data (su `crest`), como se
// acordó. Un equipo futuro que no esté en el mapa cae a su ID y nombre
// tal como los da football-data.
//
// Orden y desempates: los mismos de las demás tablas calculadas de la
// app (puntos → diferencia de goles → goles a favor → nombre); NO se
// aplican los desempates oficiales UEFA (enfrentamiento directo y
// demás), igual que ya se documenta en computedStandings.ts.

import type { StandingRow } from './types';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/sports es solo para el servidor: no lo importes en componentes cliente.'
  );
}

const MATCHES_URL =
  'https://api.football-data.org/v4/competitions/CL/matches';

/** Caché de la respuesta: 1 hora (la tabla no necesita refresco constante). */
const CACHE_SEGUNDOS = 3600;

/**
 * Etapa de la FASE DE LIGA en football-data. Solo estos partidos
 * alimentan la tabla: las llaves (playoffs, octavos, ...) que la API
 * sume al calendario más adelante NO cuentan para esta tabla.
 */
const ETAPA_FASE_LIGA = 'LEAGUE_STAGE';

/**
 * Mapa equipo de football-data -> [ID en TheSportsDB, nombre canónico
 * en TheSportsDB]. Los 36 de la fase de liga 2026-2027.
 */
const EQUIPOS_FD_A_TSDB: Record<number, [string, string]> = {
  524: ['133714', 'Paris Saint-Germain'],
  86: ['133738', 'Real Madrid'],
  57: ['133604', 'Arsenal'],
  7397: ['134243', 'Como'],
  81: ['133739', 'Barcelona'],
  58: ['133601', 'Aston Villa'],
  65: ['133613', 'Manchester City'],
  64: ['133602', 'Liverpool'],
  851: ['133789', 'Club Brugge'],
  498: ['135708', 'Sporting CP'],
  90: ['133722', 'Real Betis'],
  4: ['133650', 'Borussia Dortmund'],
  5: ['133664', 'Bayern Munich'],
  10: ['133660', 'Stuttgart'],
  108: ['133681', 'Inter Milan'],
  2016: ['137261', 'LASK'],
  66: ['133612', 'Manchester United'],
  610: ['133804', 'Galatasaray'],
  613: ['133807', 'Fenerbahçe'],
  100: ['133682', 'Roma'],
  1887: ['134126', 'Shakhtar Donetsk'],
  5720: ['134570', 'Viking'],
  78: ['133729', 'Atlético Madrid'],
  674: ['133768', 'PSV Eindhoven'],
  5721: ['135497', 'Bodø/Glimt'],
  503: ['134114', 'Porto'],
  113: ['133670', 'Napoli'],
  94: ['133740', 'Villarreal'],
  1899: ['133753', 'AEK Athens'],
  721: ['134695', 'RB Leipzig'],
  10233: ['138341', 'Sabah Baku'],
  675: ['133758', 'Feyenoord'],
  546: ['133822', 'Lens'],
  930: ['136036', 'Slavia Prague'],
  521: ['133711', 'Lille'],
  7509: ['134090', 'Slovan Bratislava'],
};

interface FdTeam {
  id: number;
  name: string;
  crest: string | null;
}

interface FdMatch {
  stage: string | null;
  status: string;
  utcDate: string;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score?: {
    fullTime?: { home: number | null; away: number | null } | null;
  } | null;
}

interface FdMatchesResponse {
  matches?: FdMatch[];
}

function getToken(): string {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    throw new Error(
      'Falta FOOTBALL_DATA_TOKEN en el entorno. Regístralo gratis en ' +
        'football-data.org y ponlo en .env.local (ver src/lib/sports/README.md).'
    );
  }
  return token;
}

/**
 * Tabla BASE de la Champions League (fase de liga) calculada desde
 * los partidos FINALIZADOS de football-data.org, en la forma neutra
 * StandingRow. Los partidos en curso NO entran: los aplica la capa
 * en vivo con su marcador real (ver el encabezado). Lanza error si
 * falta el token, si la fuente falla o si no trae partidos de la
 * fase: quien llama decide el respaldo.
 */
export async function getFootballDataChampionsStandings(): Promise<
  StandingRow[]
> {
  const res = await fetch(MATCHES_URL, {
    headers: { 'X-Auth-Token': getToken() },
    next: { revalidate: CACHE_SEGUNDOS },
  });
  if (!res.ok) {
    throw new Error(
      `football-data.org respondió ${res.status} al pedir los partidos de Champions.`
    );
  }
  const data = (await res.json()) as FdMatchesResponse;
  const partidos = (data.matches || []).filter(
    (m) => m.stage === ETAPA_FASE_LIGA
  );
  if (partidos.length === 0) {
    throw new Error(
      'football-data.org no trajo partidos de la fase de liga de la Champions.'
    );
  }

  interface Acum {
    team: FdTeam;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    forma: { fecha: string; letra: string }[];
  }
  const porEquipo = new Map<number, Acum>();
  const asegurar = (team: FdTeam): Acum => {
    let a = porEquipo.get(team.id);
    if (!a) {
      a = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        forma: [],
      };
      porEquipo.set(team.id, a);
    } else if (!a.team.crest && team.crest) {
      a.team = team;
    }
    return a;
  };
  // Primero TODOS los equipos de la fase (también los que aún no
  // juegan: la tabla trae a los 36 desde la jornada 1).
  for (const m of partidos) {
    asegurar(m.homeTeam);
    asegurar(m.awayTeam);
  }

  // Solo partidos FINALIZADOS con marcador: los en curso los aplica
  // la capa en vivo y los programados aún no existen como resultado.
  for (const m of partidos) {
    if (m.status !== 'FINISHED') continue;
    const homeScore = m.score?.fullTime?.home;
    const awayScore = m.score?.fullTime?.away;
    if (homeScore === null || homeScore === undefined) continue;
    if (awayScore === null || awayScore === undefined) continue;
    const home = asegurar(m.homeTeam);
    const away = asegurar(m.awayTeam);

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      home.forma.push({ fecha: m.utcDate, letra: 'W' });
      away.forma.push({ fecha: m.utcDate, letra: 'L' });
    } else if (homeScore < awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      home.forma.push({ fecha: m.utcDate, letra: 'L' });
      away.forma.push({ fecha: m.utcDate, letra: 'W' });
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      home.forma.push({ fecha: m.utcDate, letra: 'D' });
      away.forma.push({ fecha: m.utcDate, letra: 'D' });
    }
  }

  const rows: StandingRow[] = [...porEquipo.values()].map((a) => {
    const mapeo = EQUIPOS_FD_A_TSDB[a.team.id];
    return {
      rank: 0,
      teamProviderId: mapeo ? mapeo[0] : String(a.team.id),
      teamName: mapeo ? mapeo[1] : a.team.name,
      badgeUrl: a.team.crest || null,
      played: a.played,
      won: a.won,
      drawn: a.drawn,
      lost: a.lost,
      goalsFor: a.goalsFor,
      goalsAgainst: a.goalsAgainst,
      goalDifference: a.goalsFor - a.goalsAgainst,
      points: a.points,
      // La forma se calcula de los finalizados (últimos 5, en orden
      // cronológico, letras "W/D/L" juntas como espera la vista). La
      // tabla publicada de football-data ni siquiera la trae siempre
      // (verificado 2026-11-25: venía en null).
      form:
        a.forma
          .sort((x, y) => x.fecha.localeCompare(y.fecha))
          .slice(-5)
          .map((x) => x.letra)
          .join('') || null,
    };
  });

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName)
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}
