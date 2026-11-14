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

import type { StandingRow } from './types';

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
