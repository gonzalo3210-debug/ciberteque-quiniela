// src/lib/sports/liveStandings.ts
//
// TABLA EN VIVO — decisión de Gonzalo (2026-11-13): la tabla de posiciones
// debe recalcularse AL CAER GOL, porque un gol puede mover posiciones.
//
// computeLiveStandings es una función PURA (sin red, sin estado): toma la
// tabla oficial del proveedor y los resultados EN CURSO y devuelve la tabla
// recalculada con esos marcadores como si ya hubieran terminado.
//
// Supuesto clave: `liveResults` trae SOLO partidos en curso que la tabla
// oficial TODAVÍA no cuenta. El refresco en vivo (cuando se construya el
// polling) debe invocarla cada vez que detecte un CAMBIO de marcador (gol)
// y pasarle los marcadores vigentes; al terminar un partido, ese resultado
// sale de `liveResults` y la tabla oficial se vuelve a pedir al proveedor.
//
// Criterios de orden (Liga MX): puntos, diferencia de goles, goles a favor.
// Si todo empata, se ordena por nombre para que el resultado sea estable.
// Los rangos se reasignan 1..N sin lugares compartidos, como la tabla oficial.
//
// Emparejamiento de equipos: primero por ID de proveedor (si el resultado
// lo trae y la fila también) y si no, por nombre normalizado (sin acentos,
// minúsculas). Un resultado con un equipo desconocido se ignora en silencio
// (p. ej. un partido de otra liga filtrado por error): es preferible eso a
// tronar el refresco en vivo.

import type { SportsFixture, StandingRow } from './types';

/** Marcador de un partido EN CURSO, todavía no contado en la tabla oficial. */
export interface LiveResult {
  homeTeam: string;
  awayTeam: string;
  /** ID del equipo local en el proveedor, si se conoce (empareja mejor). */
  homeTeamProviderId?: string | null;
  /** ID del equipo visitante en el proveedor, si se conoce. */
  awayTeamProviderId?: string | null;
  homeScore: number;
  awayScore: number;
}

const normalizeName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Recalcula la tabla de posiciones aplicando los resultados en vivo.
 * No muta `baseStandings`: devuelve filas nuevas.
 */
export function computeLiveStandings(
  baseStandings: StandingRow[],
  liveResults: LiveResult[]
): StandingRow[] {
  const rows: StandingRow[] = baseStandings.map((r) => ({ ...r }));

  const byProviderId = new Map<string, StandingRow>();
  const byName = new Map<string, StandingRow>();
  for (const row of rows) {
    if (row.teamProviderId) byProviderId.set(row.teamProviderId, row);
    byName.set(normalizeName(row.teamName), row);
  }

  const findRow = (
    providerId: string | null | undefined,
    teamName: string
  ): StandingRow | undefined =>
    (providerId ? byProviderId.get(providerId) : undefined) ??
    byName.get(normalizeName(teamName));

  for (const result of liveResults) {
    const home = findRow(result.homeTeamProviderId, result.homeTeam);
    const away = findRow(result.awayTeamProviderId, result.awayTeam);
    if (!home || !away || home === away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += result.homeScore;
    home.goalsAgainst += result.awayScore;
    away.goalsFor += result.awayScore;
    away.goalsAgainst += result.homeScore;

    if (result.homeScore > result.awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (result.homeScore < result.awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName)
  );

  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return rows;
}

export interface FinalesNoContadosOpciones {
  /** Momento de referencia (por defecto, ahora). */
  ahora?: Date;
  /**
   * Ventana desde el ARRANQUE del partido durante la cual su resultado
   * se mantiene aplicado si la tabla oficial no lo cuenta. El silbatazo
   * final llega ~2 h después del arranque, así que el default de 26 h
   * equivale a ~24 h después del final (la regla de Gonzalo).
   */
  ventanaHoras?: number;
  /** Resultados ya aplicados por otra vía (los EN VIVO): se excluyen
   *  por pareja de equipos para no contar un partido dos veces. */
  excluir?: LiveResult[];
}

/**
 * FINALES QUE LA TABLA OFICIAL TODAVÍA NO CUENTA — regla de Gonzalo
 * (2026-11-21): la tabla del proveedor se recalcula en sus propios
 * ciclos (verificado: el 2026-11-21 su última actualización era de
 * horas antes de los partidos de la tarde), así que al terminar un
 * partido su resultado "desaparecía" de la tabla: salía del ajuste en
 * vivo y la oficial aún no lo traía (León ganó y seguía con 23 puntos
 * en vez de 26). Desde esta regla, el resultado FINAL se mantiene
 * aplicado —igual que si siguiera en vivo— hasta 24 horas después,
 * cuando ya es seguro que la oficial muestra lo real.
 *
 * Función PURA: recibe la tabla oficial y el calendario de la
 * temporada y devuelve, en la forma LiveResult, SOLO los finales
 * recientes que la tabla aún no cuenta. La guarda anti doble conteo
 * es por PARTIDOS JUGADOS: por equipo se compara cuántos terminados
 * trae el calendario (dato que sí se actualiza al silbatazo) contra
 * cuántos cuenta la tabla oficial; un final solo se aplica si a
 * AMBOS equipos todavía les falta ese partido, y se aplican del más
 * reciente al más viejo (los que faltan son siempre los últimos).
 * Cuando el proveedor por fin actualiza su tabla, la guarda deja de
 * seleccionar el partido sola: no hay nada que apagar a mano.
 */
export function finalesNoContados(
  baseStandings: StandingRow[],
  fixtures: SportsFixture[],
  opciones: FinalesNoContadosOpciones = {}
): LiveResult[] {
  const ahora = opciones.ahora ?? new Date();
  const ventanaHoras = opciones.ventanaHoras ?? 26;
  if (baseStandings.length === 0) return [];

  const terminados = fixtures.filter(
    (f) =>
      f.status === 'finished' && f.homeScore !== null && f.awayScore !== null
  );
  if (terminados.length === 0) return [];

  const byProviderId = new Map<string, StandingRow>();
  const byName = new Map<string, StandingRow>();
  for (const row of baseStandings) {
    if (row.teamProviderId) byProviderId.set(row.teamProviderId, row);
    byName.set(normalizeName(row.teamName), row);
  }
  const findRow = (
    providerId: string | null,
    teamName: string
  ): StandingRow | undefined =>
    (providerId ? byProviderId.get(providerId) : undefined) ??
    byName.get(normalizeName(teamName));

  // Partidos terminados que debería llevar cada equipo según el
  // calendario vs los que la tabla oficial ya cuenta.
  const esperados = new Map<StandingRow, number>();
  const contados = new Map<StandingRow, number>();
  for (const row of baseStandings) {
    esperados.set(row, 0);
    contados.set(row, row.played);
  }
  const parejas = new Map<
    SportsFixture,
    { home: StandingRow; away: StandingRow }
  >();
  for (const f of terminados) {
    const home = findRow(f.homeTeamProviderId, f.homeTeam);
    const away = findRow(f.awayTeamProviderId, f.awayTeam);
    if (!home || !away || home === away) continue;
    parejas.set(f, { home, away });
    esperados.set(home, (esperados.get(home) ?? 0) + 1);
    esperados.set(away, (esperados.get(away) ?? 0) + 1);
  }

  const paresExcluidas = new Set(
    (opciones.excluir ?? []).map(
      (r) => `${normalizeName(r.homeTeam)}|${normalizeName(r.awayTeam)}`
    )
  );

  const limite = ahora.getTime() - ventanaHoras * 3600_000;
  const candidatos = terminados
    .filter((f) => {
      if (!parejas.has(f) || !f.kickoffUtc) return false;
      if (
        paresExcluidas.has(
          `${normalizeName(f.homeTeam)}|${normalizeName(f.awayTeam)}`
        )
      ) {
        return false;
      }
      const t = Date.parse(f.kickoffUtc);
      return Number.isFinite(t) && t >= limite && t <= ahora.getTime();
    })
    .sort(
      (a, b) =>
        Date.parse(b.kickoffUtc as string) - Date.parse(a.kickoffUtc as string)
    );

  const seleccionados: LiveResult[] = [];
  for (const f of candidatos) {
    const { home, away } = parejas.get(f) as {
      home: StandingRow;
      away: StandingRow;
    };
    if ((contados.get(home) ?? 0) >= (esperados.get(home) ?? 0)) continue;
    if ((contados.get(away) ?? 0) >= (esperados.get(away) ?? 0)) continue;
    contados.set(home, (contados.get(home) ?? 0) + 1);
    contados.set(away, (contados.get(away) ?? 0) + 1);
    seleccionados.push({
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeTeamProviderId: f.homeTeamProviderId,
      awayTeamProviderId: f.awayTeamProviderId,
      homeScore: f.homeScore as number,
      awayScore: f.awayScore as number,
    });
  }
  return seleccionados;
}
