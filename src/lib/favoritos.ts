// src/lib/favoritos.ts
//
// Favoritos de la sección "⚽ Partidos" (ligas y equipos que sigue cada
// jugador), estilo 365Scores. V1: se guardan SOLO en el dispositivo
// (localStorage), sin cambio de esquema en Supabase. Si el usuario nunca ha
// elegido, nacen seguidas las ligas marcadas defaultFollowed en
// src/lib/sports/leagues.ts (Liga MX, Nations League y Champions).

import { DEFAULT_FOLLOWED_LEAGUE_IDS } from '@/lib/sports/leagues';

export interface EquipoSeguido {
  leagueProviderId: string;
  teamProviderId: string;
  teamName: string;
  badgeUrl: string | null;
}

export interface Favoritos {
  /** IDs de proveedor de las ligas seguidas. */
  ligas: string[];
  /** Equipos seguidos (con su liga de origen). */
  equipos: EquipoSeguido[];
}

const CLAVE = 'club_pronosticos_favoritos_v1';

export function favoritosPorDefecto(): Favoritos {
  return { ligas: [...DEFAULT_FOLLOWED_LEAGUE_IDS], equipos: [] };
}

/** Lee los favoritos guardados; si no hay (o están rotos), los de defecto. */
export function leerFavoritos(): Favoritos {
  if (typeof window === 'undefined') return favoritosPorDefecto();
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (!raw) return favoritosPorDefecto();
    const data = JSON.parse(raw) as Partial<Favoritos>;
    return {
      ligas: Array.isArray(data.ligas)
        ? data.ligas.filter((x): x is string => typeof x === 'string')
        : [],
      equipos: Array.isArray(data.equipos)
        ? data.equipos.filter(
            (e): e is EquipoSeguido =>
              !!e &&
              typeof e.leagueProviderId === 'string' &&
              typeof e.teamProviderId === 'string' &&
              typeof e.teamName === 'string'
          )
        : [],
    };
  } catch {
    return favoritosPorDefecto();
  }
}

export function guardarFavoritos(favoritos: Favoritos): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(favoritos));
  } catch {
    // Sin almacenamiento disponible: los favoritos viven solo en memoria.
  }
}
