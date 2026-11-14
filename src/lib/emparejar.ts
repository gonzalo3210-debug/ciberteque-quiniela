// src/lib/emparejar.ts
//
// Emparejamiento entre los partidos de una JORNADA del Club (Supabase:
// nombres en español, hora guardada por la app) y los fixtures del
// proveedor (TheSportsDB: nombres en inglés, hora UTC).
//
// Es la pieza que comparten la pestaña 🎯 Quiniela y el filtro 🔴 Live
// de la sección Partidos: sin esto, "Portugal vs Dinamarca" de la
// jornada no se reconocería como el "Portugal vs Denmark" de la API.
//
// Reglas:
//  - Un equipo de la app coincide con uno de la API si su nombre
//    normalizado es igual al nombre original de la API O a su nombre
//    en español (capa de nombresES).
//  - Un partido coincide si coinciden AMBOS equipos (en cualquier
//    orientación: la app puede traer local/visita invertidos).
//  - Al emparejar una jornada completa, además la fecha en Mazatlán
//    debe caer a ±1 día (la app guarda la hora local y la API la UTC;
//    el margen absorbe el desfase) y cada fixture se usa una sola vez
//    (gana el partido de la jornada con la fecha más cercana).
//
// Archivo PURO (solo importa utilidades puras): sirve en cliente y en
// rutas de servidor.

import type { SportsFixture } from '@/lib/sports/types';
import {
  nombreEquipoES,
  normalizarNombreEquipo,
} from '@/lib/sports/nombresES';
import { fechaEnMazatlan, sumarDias } from '@/lib/fechaMazatlan';

/** Partido de jornada tal como vive en Supabase (campos que importan). */
export interface PartidoJornadaMin {
  id: string;
  equipo_local: string;
  equipo_visitante: string;
  fecha_hora_partido?: string | null;
}

/** ¿El nombre de equipo de la APP es este equipo de la API? */
export function esMismoEquipo(
  nombreApp: string,
  nombreApi: string,
  teamProviderIdApi?: string | null
): boolean {
  const buscado = normalizarNombreEquipo(nombreApp);
  if (buscado === normalizarNombreEquipo(nombreApi)) return true;
  return buscado === normalizarNombreEquipo(nombreEquipoES(nombreApi, teamProviderIdApi));
}

/** ¿Este fixture de la API es este partido de la jornada (por equipos)? */
export function coincideParEquipos(
  partido: PartidoJornadaMin,
  fixture: SportsFixture
): boolean {
  const directo =
    esMismoEquipo(partido.equipo_local, fixture.homeTeam, fixture.homeTeamProviderId) &&
    esMismoEquipo(partido.equipo_visitante, fixture.awayTeam, fixture.awayTeamProviderId);
  if (directo) return true;
  const cruzado =
    esMismoEquipo(partido.equipo_local, fixture.awayTeam, fixture.awayTeamProviderId) &&
    esMismoEquipo(partido.equipo_visitante, fixture.homeTeam, fixture.homeTeamProviderId);
  return cruzado;
}

/**
 * Clave de un par de equipos, independiente del orden y de acentos.
 * Para nombres de la API conviene pasarlos antes por nombreEquipoES
 * (ver claveParFixture), para que la clave viva en español como los
 * nombres de la app.
 */
export function claveParNombres(nombreA: string, nombreB: string): string {
  const a = normalizarNombreEquipo(nombreA);
  const b = normalizarNombreEquipo(nombreB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Clave de par de un fixture de la API, con los nombres en español. */
export function claveParFixture(fixture: SportsFixture): string {
  return claveParNombres(
    nombreEquipoES(fixture.homeTeam, fixture.homeTeamProviderId),
    nombreEquipoES(fixture.awayTeam, fixture.awayTeamProviderId)
  );
}

/** Número de día de un "YYYY-MM-DD" (para restar fechas sin husos). */
function numeroDia(ymd: string): number {
  return Math.floor(new Date(`${ymd}T12:00:00Z`).getTime() / 86_400_000);
}

/**
 * Empareja los partidos de una jornada con los fixtures de la API.
 * Devuelve un mapa partidoId → fixture. Los partidos sin pareja no
 * aparecen en el mapa: la vista los muestra con los datos de la app.
 */
export function emparejarPartidosJornada(
  partidos: PartidoJornadaMin[],
  fixtures: SportsFixture[]
): Map<string, SportsFixture> {
  interface Candidato {
    partidoId: string;
    fixture: SportsFixture;
    diferenciaDias: number;
  }
  const candidatos: Candidato[] = [];

  for (const partido of partidos) {
    if (!partido.fecha_hora_partido) continue;
    let fechaApp: string;
    try {
      fechaApp = fechaEnMazatlan(partido.fecha_hora_partido);
    } catch {
      continue;
    }
    for (const fixture of fixtures) {
      if (!coincideParEquipos(partido, fixture)) continue;
      const fechaApi = fixture.kickoffUtc
        ? fechaEnMazatlan(fixture.kickoffUtc)
        : fixture.date;
      if (!fechaApi) continue;
      const diferenciaDias = Math.abs(numeroDia(fechaApp) - numeroDia(fechaApi));
      if (diferenciaDias <= 1) {
        candidatos.push({ partidoId: partido.id, fixture, diferenciaDias });
      }
    }
  }

  // Greedy: primero las parejas de fecha más cercana; cada partido y
  // cada fixture se asignan una sola vez.
  candidatos.sort((a, b) => a.diferenciaDias - b.diferenciaDias);
  const resultado = new Map<string, SportsFixture>();
  const fixturesUsados = new Set<string>();
  for (const c of candidatos) {
    if (resultado.has(c.partidoId)) continue;
    if (fixturesUsados.has(c.fixture.providerId)) continue;
    resultado.set(c.partidoId, c.fixture);
    fixturesUsados.add(c.fixture.providerId);
  }
  return resultado;
}

/** Ventana "YYYY-MM-DD" que cubre las fechas de una jornada (±1 día). */
export function ventanaDeJornada(
  partidos: PartidoJornadaMin[]
): { desde: string; hasta: string } | null {
  const fechas: string[] = [];
  for (const p of partidos) {
    if (!p.fecha_hora_partido) continue;
    try {
      fechas.push(fechaEnMazatlan(p.fecha_hora_partido));
    } catch {
      // fecha ilegible: no aporta a la ventana
    }
  }
  if (fechas.length === 0) return null;
  fechas.sort();
  return {
    desde: sumarDias(fechas[0], -1),
    hasta: sumarDias(fechas[fechas.length - 1], 1),
  };
}
