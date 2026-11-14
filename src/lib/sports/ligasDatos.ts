// src/lib/sports/ligasDatos.ts
//
// DATOS CURADOS A MANO de cada liga, para el "Resumen" de la página de
// liga (campeón actual y club con más títulos, como los muestra
// 365Scores). TheSportsDB NO trae estos dos datos de forma confiable,
// así que viven aquí, escritos a mano, y se actualizan a mano cuando
// cambie un campeón (una línea por liga).
//
// Solo se siembra lo VERIFICADO con la referencia de Gonzalo
// (capturas de 365Scores del 2026-11-14): Liga MX. Las demás ligas
// quedan VACÍAS a propósito: la página de la liga oculta el dato que
// no esté aquí, en vez de inventarlo.

export interface LigaDatos {
  /** Nombre del campeón vigente, como se muestra (p. ej. "Cruz Azul"). */
  campeonActual?: string;
  /** Club con más títulos de la competición. */
  masTitulos?: { equipo: string; titulos: number };
}

/** Clave: ID de la liga en el proveedor (ver leagues.ts). */
export const LIGAS_DATOS: Record<string, LigaDatos> = {
  // Liga MX (4350) — Apertura 2026 en curso; datos de la referencia
  // de Gonzalo (365Scores, 2026-11-14).
  '4350': {
    campeonActual: 'Cruz Azul',
    masTitulos: { equipo: 'Club América', titulos: 16 },
  },
};

/** Datos curados de una liga; {} si no hay nada sembrado para ella. */
export function datosDeLiga(providerId: string): LigaDatos {
  return LIGAS_DATOS[providerId] ?? {};
}
