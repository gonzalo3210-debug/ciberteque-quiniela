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
  /** Foto de perfil del jugador (usuarios.avatar_url), si tiene. */
  avatarUrl?: string | null;
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
 * Cada cuántos ms cambia el equipo que se baraja en un renglón del
 * tablero: rápido (efecto rifa) pero legible, sin marear.
 */
export const INTERVALO_BARAJEO_MS = 150;

/** Las fases de la ceremonia, en orden. */
export type FaseCeremonia = 'giro' | 'revelando' | 'final';

/** Cómo se ve un renglón del tablero: barajando equipos o ya fijado. */
export type EstadoRenglonCeremonia = 'barajando' | 'fijado';

/**
 * El estado de un renglón del tablero según la fase: en el giro todo
 * se baraja; revelando, ya se fijaron los renglones hasta el paso
 * actual (inclusive: el paso en curso es el que acaba de caer con su
 * golpe) y los demás siguen barajando; al final, todo fijado.
 */
export function estadoRenglonCeremonia(
  indice: number,
  fase: FaseCeremonia,
  pasoActual: number
): EstadoRenglonCeremonia {
  if (fase === "final") return "fijado";
  if (fase === "giro") return "barajando";
  return indice <= pasoActual ? "fijado" : "barajando";
}

/** Una pareja jugador↔equipo de mentiras, de las que enseña el barajeo. */
export interface ComboBarajeo {
  nombreJugador: string;
  nombreEquipo: string;
  logoUrl?: string | null;
}

/**
 * La pareja que enseña un renglón mientras se baraja: la barajeada
 * mueve JUGADORES Y EQUIPOS a la vez (cada renglón enseña
 * combinaciones cambiantes de un jugador con un equipo), como pidió
 * Gonzalo. Los ciclos son deterministas, con desfases por renglón,
 * para que en un mismo instante los renglones no repitan jugador ni
 * equipo entre sí. Y nunca cae en la pareja REAL del propio renglón:
 * esa solo aparece cuando el renglón se fija según el plan — el
 * barajeo es decoración, no un spoiler anticipado. (Con un solo pase
 * no hay otra pareja posible y se enseña la única que hay.)
 */
export function comboEnBarajeo(
  plan: readonly PasoRevelado[],
  tick: number,
  indiceRenglon: number
): ComboBarajeo | null {
  const n = plan.length;
  if (n === 0) return null;
  const real = plan[indiceRenglon];
  if (!real) return null;
  const mod = (x: number) => ((x % n) + n) % n;
  const jugador = plan[mod(tick + indiceRenglon * 3)].asignacion;
  let equipo = plan[mod(tick * 2 + indiceRenglon * 5)].asignacion;
  if (
    n > 1 &&
    jugador.ticketId === real.asignacion.ticketId &&
    equipo.equipoId === real.asignacion.equipoId
  ) {
    equipo = plan[mod(tick * 2 + indiceRenglon * 5 + 1)].asignacion;
  }
  return {
    nombreJugador: jugador.nombreJugador,
    nombreEquipo: equipo.nombreEquipo,
    logoUrl: equipo.logoUrl,
  };
}

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
