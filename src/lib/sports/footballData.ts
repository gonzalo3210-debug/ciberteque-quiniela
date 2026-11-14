// src/lib/sports/footballData.ts
//
// FUENTE SECUNDARIA de datos deportivos: football-data.org (API v4).
//
// Se usa para UNA sola cosa: la TABLA OFICIAL de la UEFA Champions
// League (liga 4480). TheSportsDB no publica esa tabla (su
// lookuptable devuelve el cuerpo vacío: es fase de liga) y la que la
// app calculaba desde los resultados salía incompleta, porque la
// fuente principal no trae todas las jornadas. football-data.org sí
// trae la tabla TOTAL de la fase de liga (36 equipos).
//
// Requiere el token gratuito en la variable de entorno
// FOOTBALL_DATA_TOKEN (registrado en football-data.org). Plan gratis:
// 10 peticiones/minuto — de sobra, porque la tabla se cachea 1 hora.
// Si falta el token o la fuente falla, quien llama (el adaptador)
// propaga el error y la ruta de la tabla cae al RESPALDO: la tabla
// calculada por la app desde los resultados (ver computedStandings.ts).
//
// Las filas se devuelven en la forma neutra StandingRow, con el
// NOMBRE canónico e ID de TheSportsDB para cada equipo (mapa abajo,
// verificado contra ambas APIs el 2026-11-14): así la capa de nombres
// en español (nombresES.ts), el resaltado de la vista por equipo y el
// recálculo en vivo siguen funcionando igual que con la fuente
// principal. El escudo sí es el de football-data (su `crest`), como se
// acordó. Un equipo futuro que no esté en el mapa cae a su ID y nombre
// tal como los da football-data.

import type { StandingRow } from './types';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/sports es solo para el servidor: no lo importes en componentes cliente.'
  );
}

const STANDINGS_URL =
  'https://api.football-data.org/v4/competitions/CL/standings';

/** Caché de la tabla: 1 hora (la tabla no necesita refresco constante). */
const CACHE_SEGUNDOS = 3600;

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

interface FdStandingRow {
  position: number;
  team: FdTeam;
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

interface FdStandingsResponse {
  standings?: Array<{
    type: string;
    table: FdStandingRow[];
  }>;
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
 * Tabla oficial de la Champions League (fase de liga, tipo TOTAL)
 * desde football-data.org, en la forma neutra StandingRow.
 * Lanza error si falta el token, si la fuente falla o si no trae la
 * tabla: quien llama decide el respaldo.
 */
export async function getFootballDataChampionsStandings(): Promise<
  StandingRow[]
> {
  const res = await fetch(STANDINGS_URL, {
    headers: { 'X-Auth-Token': getToken() },
    next: { revalidate: CACHE_SEGUNDOS },
  });
  if (!res.ok) {
    throw new Error(
      `football-data.org respondió ${res.status} al pedir la tabla de Champions.`
    );
  }
  const data = (await res.json()) as FdStandingsResponse;
  const total = (data.standings || []).find((s) => s.type === 'TOTAL');
  if (!total || !total.table || total.table.length === 0) {
    throw new Error(
      'football-data.org no trajo la tabla TOTAL de la Champions.'
    );
  }
  return total.table.map((r) => {
    const mapeo = EQUIPOS_FD_A_TSDB[r.team.id];
    return {
      rank: r.position,
      teamProviderId: mapeo ? mapeo[0] : String(r.team.id),
      teamName: mapeo ? mapeo[1] : r.team.name,
      badgeUrl: r.team.crest || null,
      played: r.playedGames,
      won: r.won,
      drawn: r.draw,
      lost: r.lost,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalDifference,
      points: r.points,
      // football-data da la forma como "W,W,D,L,W" cuando la da; la
      // vista espera las letras juntas ("WWDLW").
      form: r.form ? r.form.replace(/,/g, '') : null,
    };
  });
}
