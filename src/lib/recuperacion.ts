// src/lib/recuperacion.ts
//
// 🔐 Recuperación automática de sesión con PALABRA SECRETA.
//
// El login del Club es número de WhatsApp + NIP de 4 dígitos. Si el
// jugador olvida su NIP, antes solo le quedaba escribirle a Gonzalo.
// Con esta pieza define una palabra secreta (en Mi Perfil o al
// registrarse) y se recupera solo: número + palabra secreta → NIP
// nuevo. La palabra se guarda SIEMPRE con hash (SHA-256, el mismo
// patrón del NIP en Login/RegistroUsuario) ligado al id del usuario
// —nunca al teléfono, cuyo formato histórico varía— y jamás se
// muestra de vuelta. La recuperación cambia SOLO el NIP; el anterior
// nunca se revela (ni siquiera existe forma de leerlo: es hash).
//
// Columnas en `usuarios` (migración
// scripts/migraciones/2026-11-17-recuperacion-nip.sql):
//   palabra_secreta_hash        text        — hash de la palabra
//   recuperacion_intentos       int         — fallos seguidos
//   recuperacion_bloqueado_hasta timestamptz — bloqueo temporal
//
// Sin la migración, la app se comporta EXACTAMENTE como antes: las
// filas no traen estos campos, nadie "tiene palabra" y la salida
// sigue siendo el botón de WhatsApp con Gonzalo.
//
// ⚠️ Alcance honesto del límite de intentos: el contador vive en la
// fila del usuario y lo aplica el flujo de la app (igual que el
// captcha tras 5 intentos del login actual). Un límite infranqueable
// del lado del servidor requiere funciones de base/RLS — el proyecto
// de seguridad pendiente; esto es la misma postura que ya tiene el
// login hoy, no una regresión.

/** Columna con el hash de la palabra secreta. */
export const COLUMNA_PALABRA_SECRETA = 'palabra_secreta_hash';
/** Columna con el contador de fallos seguidos de recuperación. */
export const COLUMNA_INTENTOS_RECUPERACION = 'recuperacion_intentos';
/** Columna con el fin del bloqueo temporal de recuperación. */
export const COLUMNA_BLOQUEO_RECUPERACION = 'recuperacion_bloqueado_hasta';

/** Fallos seguidos que disparan el bloqueo temporal. */
export const MAX_INTENTOS_RECUPERACION = 5;
/** Duración del bloqueo temporal tras demasiados fallos. */
export const MINUTOS_BLOQUEO_RECUPERACION = 15;
/** Largo mínimo de la palabra secreta ya normalizada. */
export const LARGO_MINIMO_PALABRA_SECRETA = 4;

/**
 * Normaliza la palabra para guardarla/compararla: minúsculas, sin
 * acentos ni diéresis, sin espacios en los extremos y con los
 * espacios internos colapsados a uno. Así "  Mi PERRO   Firulais ",
 * "mi perro firulais" y "MÍ PERRO FIRULAIS" son la misma palabra.
 */
export function normalizarPalabraSecreta(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** ¿La palabra ya normalizada cumple el largo mínimo? */
export function palabraSecretaValida(texto: string | null | undefined): boolean {
  return normalizarPalabraSecreta(texto).length >= LARGO_MINIMO_PALABRA_SECRETA;
}

async function sha256Hex(texto: string): Promise<string> {
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (!subtle) {
    // Mismo respaldo débil que encriptarNIP cuando no hay WebCrypto
    // (contextos no seguros): determinista, nunca peor que el patrón
    // ya existente en la app.
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
      const char = texto.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  const msgUint8 = new TextEncoder().encode(texto);
  const hashBuffer = await subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash de la palabra secreta de un usuario. Se liga al ID (estable
 * para siempre), no al teléfono (cuyo formato guardado ha cambiado
 * con los años y obligó al login a probar varios formatos).
 */
export async function hashPalabraSecreta(
  palabra: string,
  usuarioId: string
): Promise<string> {
  const normalizada = normalizarPalabraSecreta(palabra);
  return sha256Hex(`PS-${usuarioId}-${normalizada}-CiberTequeSeguro2024`);
}

/** ¿La palabra escrita coincide con el hash guardado? */
export async function palabraSecretaCoincide(
  palabra: string,
  usuarioId: string,
  hashGuardado: string | null | undefined
): Promise<boolean> {
  if (!hashGuardado) return false;
  const calculado = await hashPalabraSecreta(palabra, usuarioId);
  return calculado === hashGuardado;
}

/** ¿Esta fila de usuario ya trae las columnas de la migración? */
export function usuarioTieneRecuperacion(usuario: any): boolean {
  return Boolean(usuario) && COLUMNA_PALABRA_SECRETA in usuario;
}

/** ¿El usuario ya definió su palabra secreta? */
export function usuarioTienePalabraSecreta(usuario: any): boolean {
  return (
    usuarioTieneRecuperacion(usuario) &&
    typeof usuario[COLUMNA_PALABRA_SECRETA] === 'string' &&
    usuario[COLUMNA_PALABRA_SECRETA].length > 0
  );
}

// ---------------------------------------------------------------------
// Límite de intentos (lógica pura; el estado vive en la fila)
// ---------------------------------------------------------------------

export interface EstadoIntentosRecuperacion {
  intentos: number;
  bloqueadoHasta: string | null;
}

export const ESTADO_INTENTOS_LIMPIO: EstadoIntentosRecuperacion = {
  intentos: 0,
  bloqueadoHasta: null,
};

/** Lee el estado de intentos desde una fila de `usuarios`. */
export function estadoIntentosDesdeUsuario(usuario: any): EstadoIntentosRecuperacion {
  const intentos = Number(usuario?.[COLUMNA_INTENTOS_RECUPERACION]);
  const hasta = usuario?.[COLUMNA_BLOQUEO_RECUPERACION];
  return {
    intentos: Number.isFinite(intentos) && intentos > 0 ? Math.floor(intentos) : 0,
    bloqueadoHasta: typeof hasta === 'string' && hasta ? hasta : null,
  };
}

/** ¿El estado está bloqueado a esta hora? ¿Cuántos minutos faltan? */
export function evaluarBloqueoRecuperacion(
  estado: EstadoIntentosRecuperacion,
  ahora: Date = new Date()
): { bloqueado: boolean; minutosRestantes: number } {
  if (!estado.bloqueadoHasta) return { bloqueado: false, minutosRestantes: 0 };
  const fin = new Date(estado.bloqueadoHasta).getTime();
  if (isNaN(fin) || fin <= ahora.getTime()) {
    return { bloqueado: false, minutosRestantes: 0 };
  }
  return {
    bloqueado: true,
    minutosRestantes: Math.max(1, Math.ceil((fin - ahora.getTime()) / 60000)),
  };
}

/**
 * Registra un fallo y devuelve el estado nuevo a guardar:
 * - Si el bloqueo sigue vigente, el estado no cambia.
 * - Si el bloqueo ya expiró, la cuenta parte de cero.
 * - Al llegar a MAX_INTENTOS_RECUPERACION fallos seguidos, se
 *   bloquea por MINUTOS_BLOQUEO_RECUPERACION y el contador se
 *   reinicia (al expirar el bloqueo se empieza limpio).
 */
export function registrarFalloRecuperacion(
  estado: EstadoIntentosRecuperacion,
  ahora: Date = new Date()
): EstadoIntentosRecuperacion {
  if (evaluarBloqueoRecuperacion(estado, ahora).bloqueado) return estado;
  const base = estado.bloqueadoHasta
    ? { ...ESTADO_INTENTOS_LIMPIO }
    : { intentos: estado.intentos, bloqueadoHasta: null };
  const intentos = base.intentos + 1;
  if (intentos >= MAX_INTENTOS_RECUPERACION) {
    const hasta = new Date(
      ahora.getTime() + MINUTOS_BLOQUEO_RECUPERACION * 60000
    ).toISOString();
    return { intentos: 0, bloqueadoHasta: hasta };
  }
  return { intentos, bloqueadoHasta: null };
}

/** Estado tras una recuperación exitosa: todo limpio. */
export function estadoTrasExitoRecuperacion(): EstadoIntentosRecuperacion {
  return { ...ESTADO_INTENTOS_LIMPIO };
}

/**
 * ¿Este error de Supabase es "la columna de recuperación aún no
 * existe" (la migración no se ha corrido)? Mismo criterio probado que
 * esErrorColumnaInexistente de invitaciones: el mensaje debe nombrar
 * a una de las columnas de esta pieza.
 */
export function esErrorColumnaRecuperacion(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (typeof e.message !== 'string') return false;
  const columnas = [
    COLUMNA_PALABRA_SECRETA,
    COLUMNA_INTENTOS_RECUPERACION,
    COLUMNA_BLOQUEO_RECUPERACION,
  ];
  if (!columnas.some((c) => (e.message as string).includes(c))) return false;
  return (
    e.code === 'PGRST204' ||
    e.code === '42703' ||
    /could not find|does not exist|no existe/i.test(e.message)
  );
}
