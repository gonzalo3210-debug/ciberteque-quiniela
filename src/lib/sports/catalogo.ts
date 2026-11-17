// src/lib/sports/catalogo.ts
//
// Catálogo DINÁMICO de ligas y deportes (todas las del proveedor, no
// solo las curadas del Club en leagues.ts): nombres de deporte en
// español para mostrar, qué deportes tienen equipos enlazables a su
// página, y la forma "liga vista" con la que las rutas y las vistas
// abren una liga cualquiera por su ID de proveedor.
//
// Archivo PURO (solo importa tipos y el catálogo curado): sirve en
// cliente y en rutas de servidor. La resolución contra la API (qué
// temporada trae una liga, si tiene tabla...) vive en el servidor:
// src/lib/sports/ligaDinamica.ts y la ruta /api/ligas-catalogo.

import type { SupportedLeague } from './leagues';
import type { LeagueCatalogEntry } from './types';

/**
 * Nombre en español de cada deporte, para mostrar. La clave es el
 * deporte TAL COMO lo nombra el proveedor en all_leagues (strSport).
 * Ojo: al MMA el proveedor lo llama "Fighting". Si un deporte no está
 * en el mapa, se muestra su nombre del proveedor tal cual.
 */
export const NOMBRE_DEPORTE_ES: Record<string, string> = {
  Soccer: 'Fútbol',
  Basketball: 'Básquetbol',
  'American Football': 'Fútbol Americano',
  Baseball: 'Béisbol',
  'Ice Hockey': 'Hockey sobre Hielo',
  Motorsport: 'Automovilismo',
  Tennis: 'Tenis',
  Fighting: 'MMA',
  Rugby: 'Rugby',
  Volleyball: 'Voleibol',
  Handball: 'Balonmano',
  Cricket: 'Críquet',
  Golf: 'Golf',
  ESports: 'eSports',
  Cycling: 'Ciclismo',
  Athletics: 'Atletismo',
  Skiing: 'Esquí',
  'Field Hockey': 'Hockey sobre Césped',
  Netball: 'Netball',
  Lacrosse: 'Lacrosse',
  'Australian Football': 'Fútbol Australiano',
  'Table Tennis': 'Tenis de Mesa',
  Badminton: 'Bádminton',
  Darts: 'Dardos',
  Snooker: 'Snooker',
  Gymnastics: 'Gimnasia',
  Gaelic: 'Deportes Gaélicos',
  Gambling: 'Apuestas',
  Watersports: 'Deportes Acuáticos',
  Wintersports: 'Deportes de Invierno',
  'Extreme Sports': 'Deportes Extremos',
  Skating: 'Patinaje',
  'Multi Sports': 'Multideporte',
  Olympics: 'Olimpiadas',
  Weightlifting: 'Halterofilia',
  Shooting: 'Tiro',
  Climbing: 'Escalada',
  Equestrian: 'Equitación',
};

/** Nombre del deporte para mostrar (español si se conoce). */
export function nombreDeporteES(sport: string): string {
  return NOMBRE_DEPORTE_ES[sport] || sport;
}

/**
 * Deportes DE EQUIPO: sus participantes tienen página propia en la
 * app (Resumen · Partidos · Posiciones). En los demás (Automovilismo,
 * Tenis, MMA, Golf...) los nombres de las filas son pilotos, tenistas
 * o peleadores: NO se enlazan, para no abrir páginas de equipo rotas.
 */
const DEPORTES_CON_EQUIPOS: ReadonlySet<string> = new Set([
  'Soccer',
  'Basketball',
  'American Football',
  'Baseball',
  'Ice Hockey',
  'Rugby',
  'Volleyball',
  'Handball',
  'Cricket',
  'Field Hockey',
  'Netball',
  'Lacrosse',
  'Australian Football',
  'Gaelic',
]);

/** ¿Los participantes de este deporte tienen página de equipo? */
export function deporteTieneEquipos(sport: string | null | undefined): boolean {
  if (!sport) return true; // sin dato (ligas curadas): son de fútbol
  return DEPORTES_CON_EQUIPOS.has(sport);
}

/**
 * Una liga cualquiera lista para abrirse en la página de liga: es la
 * respuesta de detalle de /api/ligas-catalogo?liga={id}, donde el
 * servidor ya resolvió temporada y si hay tabla.
 */
export interface LigaDinamica {
  providerId: string;
  /** Nombre para mostrar: el curado en español si la liga es del
   *  Club; si no, el nombre oficial del proveedor, tal cual. */
  name: string;
  /** Deporte tal como lo nombra el proveedor. */
  sport: string;
  /** Temporada vigente en el formato del proveedor. */
  season: string;
  badgeUrl: string | null;
  /** ¿lookuptable devolvió filas para esta liga y temporada? */
  hasStandings: boolean;
  /**
   * Sin tabla oficial, ¿la app la calcula desde los resultados de la
   * temporada? Solo se ofrece en Fútbol ('unica'); en otros deportes
   * la pestaña Posiciones se oculta.
   */
  computedStandings: boolean;
  /** ¿Es una de las ligas curadas del Club (leagues.ts)? */
  curada: boolean;
}

/** LigaDinamica -> la forma SupportedLeague que consumen las vistas
 *  (PaginaLiga, TablaLiga). Las ligas dinámicas no traen zonas ni
 *  datos curados: nombre y temporada son los del proveedor. */
export function ligaDinamicaASoportada(d: LigaDinamica): SupportedLeague {
  return {
    providerId: d.providerId,
    name: d.name,
    providerName: d.name,
    season: d.season,
    zones: null,
    hasStandings: d.hasStandings,
    computedTable: d.computedStandings ? 'unica' : undefined,
    defaultFollowed: false,
  };
}

/** Deporte con sus ligas, tal como lo agrupa /api/ligas-catalogo. */
export interface DeporteConLigas {
  /** Deporte tal como lo nombra el proveedor. */
  sport: string;
  /** Nombre en español para mostrar. */
  nombreES: string;
  ligas: (LeagueCatalogEntry & { curada: boolean })[];
}

// ---------- Higiene y orden del catálogo (explorador 🌎 Ligas) ------

/**
 * El catálogo del proveedor trae pseudo-ligas INTERNAS cuyos nombres
 * empiezan con "_" ("_Defunct Soccer Teams", "_No League",
 * "_No League Soccer"...): no son ligas de verdad y ensucian la
 * lista y los conteos por deporte del explorador. Se detectan por
 * ese prefijo.
 */
export function esNombreLigaInterna(nombre: string): boolean {
  return nombre.trimStart().startsWith('_');
}

/** Quita las pseudo-ligas internas de una lista del catálogo. */
export function filtrarLigasVisibles<T extends { name: string }>(
  ligas: T[]
): T[] {
  return ligas.filter((l) => !esNombreLigaInterna(l.name));
}

/**
 * Orden del explorador con las ligas FAVORITAS del jugador primero:
 * partición estable — las favoritas conservan su orden relativo de
 * entrada (el del catálogo: curadas primero, luego A-Z) y el resto
 * queda detrás, también en su orden de entrada.
 */
export function ordenarConFavoritas<T extends { providerId: string }>(
  ligas: T[],
  favoritas: readonly string[]
): T[] {
  if (favoritas.length === 0) return [...ligas];
  const set = new Set(favoritas);
  const primero: T[] = [];
  const resto: T[] = [];
  for (const l of ligas) {
    (set.has(l.providerId) ? primero : resto).push(l);
  }
  return [...primero, ...resto];
}
