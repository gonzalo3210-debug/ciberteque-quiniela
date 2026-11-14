// src/lib/sports/computedStandings.ts
//
// TABLA CALCULADA POR LA APP — para las ligas SIN tabla oficial en el
// proveedor (hasStandings=false: Champions, Nations League, Libertadores,
// verificado 2026-11-13 que lookuptable devuelve el cuerpo vacío).
// En vez de solo mostrar "sin tabla", la app la calcula desde los
// resultados de la temporada que el adaptador ya trae (getFixtures).
//
// computeStandingsFromResults es PURA y testeable (sin red, sin estado):
// recibe los partidos de la temporada y devuelve una o varias tablas.
//
// QUÉ CUENTA: solo partidos FINALIZADOS (status 'finished' con marcador).
// 3 puntos por victoria, 1 por empate. Desempate: puntos → diferencia de
// goles → goles a favor → nombre (estable). NO se aplica enfrentamiento
// directo (head-to-head): complica los grupos con empates múltiples y el
// dato público no siempre lo permite reconstruir; queda documentado aquí.
//
// CÓMO SE AISLA LA FASE QUE SÍ ES DE TABLA (sin inventar datos):
// El calendario de temporada mezcla fases previas (clasificatorias a ida y
// vuelta) y llaves eliminatorias con la fase de grupos/liga. La señal que
// SÍ trae el dato es la RONDA (intRound): en una jornada de fase de
// grupos/liga ningún equipo juega dos veces en la misma ronda, y hay
// muchos partidos (≥ 8). Definición usada:
//   · "Ronda completa": ronda con ≥ 8 partidos donde ningún equipo
//     aparece más de una vez. (En clasificatorias a doble partido y en
//     llaves, el mismo equipo aparece 2 veces en la ronda; en la final,
//     la ronda trae 1 solo partido.)
//   · El "núcleo" de la fase son los equipos de las rondas completas.
//
// MODO 'unica' (Champions, formato actual de fase de liga):
//   Una sola tabla con los partidos de las rondas completas (las
//   clasificatorias quedan fuera). Verificado 2026-11-13: rondas 4-8,
//   18 partidos y 36 equipos cada una.
//
// MODO 'grupos' (Nations League y Libertadores):
//   1. Candidatos: partidos entre dos equipos del núcleo.
//   2. De ellos, los de "rondas de grupo": rondas con ≥ 8 candidatos
//      donde ningún equipo aparece más de una vez (esto deja fuera las
//      llaves: octavos/cuartos/semis repiten equipos en la ronda, y la
//      final trae 1 partido). Verificado: Libertadores → exactamente los
//      96 partidos de la fase de grupos; Nations → sus 156 (su calendario
//      ES solo fase de grupos, rondas 1-6).
//   3. Los grupos son las COMPONENTES del grafo de esos partidos (quién
//      juega contra quién): la membresía es un hecho del calendario, no
//      una invención. Verificado: Nations → 14 componentes (12 de 4 y 2
//      de 3, sus grupos reales); Libertadores → 8 componentes de 4.
//   4. Los NOMBRES oficiales de grupo ("Liga A, Grupo 2") NO vienen en el
//      dato: las tablas se etiquetan "Grupo 1", "Grupo 2", ... en orden
//      (tamaño y luego nombre del primer equipo). No se finge el nombre.
//
// Si algo no cuadra (sin rondas completas, un solo componente, etc.), la
// función cae a lo que sí se puede: la tabla única con lo que haya.

import type { SportsFixture, StandingRow } from './types';

export type ComputedTableMode = 'grupos' | 'unica';

export interface ComputedTable {
  /** "Grupo N" en modo grupos; null si es tabla única. */
  label: string | null;
  rows: StandingRow[];
}

const MIN_PARTIDOS_RONDA = 8;

const normalizeName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Clave estable de un equipo dentro de un partido. */
function teamKey(id: string | null, name: string): string {
  return id ? `id:${id}` : `nom:${normalizeName(name)}`;
}

interface TeamInfo {
  key: string;
  providerId: string | null;
  name: string;
  badgeUrl: string | null;
}

function infoEquipos(fixtures: SportsFixture[]): Map<string, TeamInfo> {
  const map = new Map<string, TeamInfo>();
  const add = (
    id: string | null,
    name: string,
    badge: string | null
  ): string => {
    const key = teamKey(id, name);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { key, providerId: id, name, badgeUrl: badge });
    } else if (!prev.badgeUrl && badge) {
      prev.badgeUrl = badge;
    }
    return key;
  };
  for (const f of fixtures) {
    add(f.homeTeamProviderId, f.homeTeam, f.homeBadgeUrl);
    add(f.awayTeamProviderId, f.awayTeam, f.awayBadgeUrl);
  }
  return map;
}

/** Agrupa partidos por ronda (los sin ronda van a su propia cubeta). */
function porRonda(fixtures: SportsFixture[]): Map<string, SportsFixture[]> {
  const map = new Map<string, SportsFixture[]>();
  for (const f of fixtures) {
    const k = f.round === null ? 'sin-ronda' : `r${f.round}`;
    const arr = map.get(k);
    if (arr) arr.push(f);
    else map.set(k, [f]);
  }
  return map;
}

/** ¿Ningún equipo aparece más de una vez en estos partidos? */
function sinRepetidos(fixtures: SportsFixture[]): boolean {
  const vistos = new Set<string>();
  for (const f of fixtures) {
    const h = teamKey(f.homeTeamProviderId, f.homeTeam);
    const a = teamKey(f.awayTeamProviderId, f.awayTeam);
    if (vistos.has(h) || vistos.has(a)) return false;
    vistos.add(h);
    vistos.add(a);
  }
  return true;
}

/** Rondas completas: ≥ 8 partidos y ningún equipo repetido en la ronda. */
function rondasCompletas(
  fixtures: SportsFixture[]
): Map<string, SportsFixture[]> {
  const out = new Map<string, SportsFixture[]>();
  for (const [k, fs] of porRonda(fixtures)) {
    if (fs.length >= MIN_PARTIDOS_RONDA && sinRepetidos(fs)) {
      out.set(k, fs);
    }
  }
  return out;
}

/** Ámbito de una tabla calculada: completa, solo de local o solo de visita. */
export type AmbitoTabla = 'completa' | 'local' | 'visitante';

/**
 * Construye las filas de UNA tabla con los partidos dados.
 * Con ambito 'local' solo se acumula el renglón del equipo LOCAL de
 * cada partido (su PJ/GF/GC y su resultado son los de casa); con
 * 'visitante', solo el del VISITANTE. Es la tabla "de local / de
 * visita" de la página del equipo, estilo 365Scores.
 */
function construirTabla(
  partidos: SportsFixture[],
  equipos: TeamInfo[],
  ambito: AmbitoTabla = 'completa'
): StandingRow[] {
  interface Acum {
    info: TeamInfo;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    points: number;
    forma: { kickoff: string; letra: string }[];
  }
  const porClave = new Map<string, Acum>();
  for (const info of equipos) {
    porClave.set(info.key, {
      info,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
      forma: [],
    });
  }

  const cuentaLocal = ambito !== 'visitante';
  const cuentaVisita = ambito !== 'local';

  for (const f of partidos) {
    if (f.status !== 'finished') continue;
    if (f.homeScore === null || f.awayScore === null) continue;
    const home = porClave.get(teamKey(f.homeTeamProviderId, f.homeTeam));
    const away = porClave.get(teamKey(f.awayTeamProviderId, f.awayTeam));
    if (!home || !away || home === away) continue;

    if (cuentaLocal) {
      home.played += 1;
      home.gf += f.homeScore;
      home.ga += f.awayScore;
    }
    if (cuentaVisita) {
      away.played += 1;
      away.gf += f.awayScore;
      away.ga += f.homeScore;
    }
    const ko = f.kickoffUtc || f.date || '';
    if (f.homeScore > f.awayScore) {
      if (cuentaLocal) {
        home.won += 1;
        home.points += 3;
        home.forma.push({ kickoff: ko, letra: 'W' });
      }
      if (cuentaVisita) {
        away.lost += 1;
        away.forma.push({ kickoff: ko, letra: 'L' });
      }
    } else if (f.homeScore < f.awayScore) {
      if (cuentaVisita) {
        away.won += 1;
        away.points += 3;
        away.forma.push({ kickoff: ko, letra: 'W' });
      }
      if (cuentaLocal) {
        home.lost += 1;
        home.forma.push({ kickoff: ko, letra: 'L' });
      }
    } else {
      if (cuentaLocal) {
        home.drawn += 1;
        home.points += 1;
        home.forma.push({ kickoff: ko, letra: 'D' });
      }
      if (cuentaVisita) {
        away.drawn += 1;
        away.points += 1;
        away.forma.push({ kickoff: ko, letra: 'D' });
      }
    }
  }

  const rows: StandingRow[] = [...porClave.values()].map((a) => ({
    rank: 0,
    teamProviderId: a.info.providerId,
    teamName: a.info.name,
    badgeUrl: a.info.badgeUrl,
    played: a.played,
    won: a.won,
    drawn: a.drawn,
    lost: a.lost,
    goalsFor: a.gf,
    goalsAgainst: a.ga,
    goalDifference: a.gf - a.ga,
    points: a.points,
    form: a.forma
      .sort((x, y) => x.kickoff.localeCompare(y.kickoff))
      .slice(-5)
      .map((x) => x.letra)
      .join(''),
  }));

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

/**
 * UNA tabla calculada en un ámbito (completa / solo local / solo
 * visitante) desde los resultados dados, SIN el aislamiento de fases
 * de computeStandingsFromResults: cuenta todos los partidos
 * finalizados que le pasen. La usa la página del equipo para su
 * selector Completa · Local · Visitante (con los partidos de la liga
 * ya filtrados por la ruta). Mismos desempates que el resto del
 * módulo: puntos → diferencia → goles a favor → nombre.
 */
export function computeStandingsAmbito(
  fixtures: SportsFixture[],
  ambito: AmbitoTabla
): StandingRow[] {
  if (fixtures.length === 0) return [];
  const infos = infoEquipos(fixtures);
  return construirTabla(fixtures, [...infos.values()], ambito);
}

/**
 * Calcula la(s) tabla(s) de posiciones desde los resultados de la
 * temporada. Ver el encabezado del archivo para el algoritmo y sus límites.
 */
export function computeStandingsFromResults(
  fixtures: SportsFixture[],
  mode: ComputedTableMode
): ComputedTable[] {
  if (fixtures.length === 0) return [];
  const infos = infoEquipos(fixtures);
  const completas = rondasCompletas(fixtures);

  if (mode === 'unica') {
    const deFase = [...completas.values()].flat();
    const base = deFase.length > 0 ? deFase : fixtures;
    const equipos = [...new Set(base.flatMap((f) => [
      teamKey(f.homeTeamProviderId, f.homeTeam),
      teamKey(f.awayTeamProviderId, f.awayTeam),
    ]))]
      .map((k) => infos.get(k))
      .filter((x): x is TeamInfo => !!x);
    return [{ label: null, rows: construirTabla(base, equipos) }];
  }

  // ----- modo 'grupos' -----
  const nucleo = new Set<string>();
  for (const fs of completas.values()) {
    for (const f of fs) {
      nucleo.add(teamKey(f.homeTeamProviderId, f.homeTeam));
      nucleo.add(teamKey(f.awayTeamProviderId, f.awayTeam));
    }
  }
  const candidatos =
    nucleo.size > 0
      ? fixtures.filter(
          (f) =>
            nucleo.has(teamKey(f.homeTeamProviderId, f.homeTeam)) &&
            nucleo.has(teamKey(f.awayTeamProviderId, f.awayTeam))
        )
      : fixtures;

  const deGrupo: SportsFixture[] = [];
  for (const fs of porRonda(candidatos).values()) {
    if (fs.length >= MIN_PARTIDOS_RONDA && sinRepetidos(fs)) deGrupo.push(...fs);
  }
  const base = deGrupo.length > 0 ? deGrupo : candidatos;

  // Componentes del grafo de partidos (quién juega contra quién).
  const padre = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r) as string;
    let c = x;
    while (padre.get(c) !== c) {
      const sig = padre.get(c) as string;
      padre.set(c, r);
      c = sig;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) padre.set(ra, rb);
  };
  for (const f of base) {
    const h = teamKey(f.homeTeamProviderId, f.homeTeam);
    const a = teamKey(f.awayTeamProviderId, f.awayTeam);
    if (!padre.has(h)) padre.set(h, h);
    if (!padre.has(a)) padre.set(a, a);
    union(h, a);
  }
  const componentes = new Map<string, TeamInfo[]>();
  for (const info of infos.values()) {
    if (!padre.has(info.key)) continue;
    const r = find(info.key);
    const arr = componentes.get(r);
    if (arr) arr.push(info);
    else componentes.set(r, [info]);
  }

  const grupos = [...componentes.values()];
  if (grupos.length <= 1) {
    const equipos = grupos[0] ?? [...infos.values()];
    return [{ label: null, rows: construirTabla(base, equipos) }];
  }

  grupos.sort(
    (a, b) =>
      b.length - a.length ||
      [...a]
        .map((t) => t.name)
        .sort()[0]
        .localeCompare([...b].map((t) => t.name).sort()[0])
  );

  return grupos.map((equipos, i) => {
    const claves = new Set(equipos.map((t) => t.key));
    const partidos = base.filter(
      (f) =>
        claves.has(teamKey(f.homeTeamProviderId, f.homeTeam)) &&
        claves.has(teamKey(f.awayTeamProviderId, f.awayTeam))
    );
    return {
      label: `Grupo ${i + 1}`,
      rows: construirTabla(partidos, equipos),
    };
  });
}
