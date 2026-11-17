// src/lib/sorteoCeremonia.ts
//
// Lógica PURA de la CEREMONIA PÚBLICA del sorteo (vista del jugador).
//
// La modalidad sorteo ya existía: el admin ejecuta el sorteo con
// ejecutarSorteoMundial (useArbitro), que mezcla los 8 equipos y los
// asigna a los pases guardando tickets.equipo_asignado_id. Esa función
// y su aleatoriedad NO se tocan: la ceremonia es solo presentación —
// un REPLAY determinista de las asignaciones ya guardadas.
//
// Este módulo decide, sin efectos:
//   - si el sorteo ya ocurrió (todas las asignaciones presentes),
//   - el orden de revelado (estable; los pases del propio jugador se
//     revelan AL FINAL, para el suspenso de "¿qué equipo me tocó?"),
//   - y los tiempos de cada fase, para que la vista solo obedezca.

/** Una asignación pase → equipo, tal como quedó guardada en la base. */
export interface AsignacionSorteo {
  ticketId: string;
  usuarioId: string;
  nombreJugador: string;
  equipoId: string;
  nombreEquipo: string;
  logoUrl?: string | null;
}

/** Un paso del revelado: una asignación y si es del jugador que mira. */
export interface PasoRevelado {
  asignacion: AsignacionSorteo;
  esPropio: boolean;
  /** Posición en el orden de revelado (0 = primero). */
  indice: number;
}

/** Cuánto dura el giro del bombo antes del primer revelado. */
export const DURACION_GIRO_MS = 2600;
/** Cuánto se queda en pantalla cada asignación revelada. */
export const DURACION_REVELADO_MS = 1700;

/**
 * ¿Ya se ejecutó el sorteo? Hay pases y TODOS tienen equipo asignado.
 * (ejecutarSorteoMundial asigna todos a la vez; un estado parcial no
 * debería existir, y si existiera, la ceremonia espera a que esté
 * completo en vez de revelar a medias.)
 */
export function sorteoRealizado(
  tickets: { equipo_asignado_id?: string | null }[]
): boolean {
  return (
    tickets.length > 0 &&
    tickets.every((t) => !!t.equipo_asignado_id)
  );
}

/** Orden estable entre asignaciones ajenas: nombre y, en empate, ticket. */
function compararAsignaciones(
  a: AsignacionSorteo,
  b: AsignacionSorteo
): number {
  const porNombre = a.nombreJugador.localeCompare(b.nombreJugador, 'es');
  if (porNombre !== 0) return porNombre;
  if (a.ticketId < b.ticketId) return -1;
  if (a.ticketId > b.ticketId) return 1;
  return 0;
}

/**
 * El plan de revelado: primero las asignaciones de los demás (en orden
 * estable) y AL FINAL las del jugador que está mirando — su equipo es
 * el momento de suspenso de su ceremonia. Sin usuario (o si el jugador
 * no tiene pases), el orden es el estable para todos. Determinista: la
 * misma entrada siempre produce el mismo plan, así la ceremonia se
 * puede repetir ("ver de nuevo") y siempre cuenta la misma historia.
 */
export function planRevelado(
  asignaciones: AsignacionSorteo[],
  usuarioActualId?: string | null
): PasoRevelado[] {
  const ordenadas = [...asignaciones].sort(compararAsignaciones);
  const ajenas = usuarioActualId
    ? ordenadas.filter((a) => a.usuarioId !== usuarioActualId)
    : ordenadas;
  const propias = usuarioActualId
    ? ordenadas.filter((a) => a.usuarioId === usuarioActualId)
    : [];
  return [...ajenas, ...propias].map((asignacion, indice) => ({
    asignacion,
    esPropio: !!usuarioActualId && asignacion.usuarioId === usuarioActualId,
    indice,
  }));
}

/** Duración total de la ceremonia para n asignaciones (giro + revelados). */
export function duracionTotalCeremonia(cantidadAsignaciones: number): number {
  if (cantidadAsignaciones <= 0) return 0;
  return DURACION_GIRO_MS + cantidadAsignaciones * DURACION_REVELADO_MS;
}
