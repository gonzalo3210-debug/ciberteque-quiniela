// src/lib/sports/ligaDinamica.ts
//
// Resolución de UNA liga por su ID de proveedor, para las rutas de
// servidor: si es una de las curadas del Club (leagues.ts) se usa su
// descriptor tal cual (nombres en español, zonas, datos curados); si
// no, se arma el descriptor desde la ficha del proveedor
// (lookupleague: nombre oficial, deporte y temporada vigente).
//
// SOLO SERVIDOR: importa el adaptador (provider.ts), que truena en
// el navegador. Las vistas nunca llaman esto: piden el detalle a
// /api/ligas-catalogo?liga={id} y convierten con
// ligaDinamicaASoportada (catalogo.ts).

import { getSupportedLeague, type SupportedLeague } from './leagues';
import { getSportsProvider } from './provider';

export interface LigaResuelta extends SupportedLeague {
  /** Deporte tal como lo nombra el proveedor ('Soccer', 'Basketball'...). */
  sport: string;
  /** ¿Es una de las ligas curadas del Club? */
  curada: boolean;
  /** Logo de la liga según la ficha del proveedor (solo dinámicas;
   *  las curadas lo piden por su camino de siempre). */
  badgeUrl: string | null;
}

/** Temporada "AAAA-AAAA" de respaldo si la ficha no trae la vigente. */
function temporadaDeRespaldo(): string {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  // Las temporadas europeas/americanas arrancan en la segunda mitad
  // del año: desde julio ya corre la del año en curso.
  return hoy.getMonth() >= 6 ? `${anio}-${anio + 1}` : `${anio - 1}-${anio}`;
}

/**
 * Descriptor de una liga por su ID, SIN verificar su tabla: para las
 * rutas de partidos/equipos/importar, a las que la tabla no les
 * importa. En las dinámicas, hasStandings queda tentativo (false) y
 * computedTable tentativo ('unica' si es fútbol): quien sí necesita
 * la tabla usa resolverLigaConTabla.
 */
export async function resolverLiga(
  providerId: string
): Promise<LigaResuelta | null> {
  const curada = getSupportedLeague(providerId);
  if (curada) {
    return { ...curada, sport: 'Soccer', curada: true, badgeUrl: null };
  }
  const info = await getSportsProvider().getLeagueInfo(providerId);
  if (!info || !info.name) return null;
  return {
    providerId,
    name: info.name,
    providerName: info.name,
    season: info.season || temporadaDeRespaldo(),
    zones: null,
    hasStandings: false,
    computedTable: info.sport === 'Soccer' ? 'unica' : undefined,
    defaultFollowed: false,
    sport: info.sport,
    curada: false,
    badgeUrl: info.badgeUrl,
  };
}

/**
 * Como resolverLiga, pero para las DINÁMICAS verifica contra la API
 * si lookuptable trae filas en su temporada: con filas, la tabla es
 * oficial (hasStandings); sin filas, solo el fútbol conserva la
 * tabla calculada ('unica') y los demás deportes quedan sin
 * Posiciones. La verificación va cacheada 10 min en el adaptador.
 */
export async function resolverLigaConTabla(
  providerId: string
): Promise<LigaResuelta | null> {
  const base = await resolverLiga(providerId);
  if (!base || base.curada) return base;
  let filas = 0;
  try {
    const rows = await getSportsProvider().getStandings(
      base.providerId,
      base.season
    );
    filas = rows.length;
  } catch {
    filas = 0;
  }
  return {
    ...base,
    hasStandings: filas > 0,
    computedTable:
      filas === 0 && base.sport === 'Soccer' ? 'unica' : undefined,
  };
}
