// src/lib/invitaciones.ts
//
// ENLACE DE INVITACIÓN — lógica PURA de los enlaces personales con
// los que cada jugador invita amigos al Club (crecer la base).
// Sin red y sin base de datos: aquí solo se genera/valida el código,
// se arman el enlace y el texto de WhatsApp, se guarda el código del
// referente en localStorage y se reconoce el error de "columna
// inexistente" para la atribución protegida. La UI vive en
// src/components/TarjetaInvitacion.tsx (Mi Perfil) y en
// src/app/invitar/ (la página de aterrizaje pública).
//
// EL CÓDIGO — decisión y por qué:
//  - Cada jugador tiene UN código estable de 8 caracteres derivado
//    de su `usuarios.id` (uuid) con un hash cyrb53 con sal del Club,
//    en base36 (0-9A-Z). Mismo usuario → mismo código, siempre, sin
//    guardar nada nuevo: NO necesita migración para existir.
//  - No se usa el uuid crudo: son 36 caracteres con guiones,
//    imposible de dictar o pegar a mano sin error.
//  - No se usa el teléfono: es dato personal y adivinable (los
//    números del grupo se conocen); el enlace se pega en chats y
//    estados, no debe filtrar el número de nadie.
//  - No es secuencial ni invertible: del código no se puede sacar
//    el uuid ni "probar el siguiente". Para saber DE QUIÉN es un
//    código se recalcula el de cada usuario de la lista (lo puede
//    hacer el admin; una pieza futura lo puede mostrar en el
//    Gestor de Usuarios).
//
// LA ATRIBUCIÓN (quién invitó a quién):
//  - La landing guarda el código válido en localStorage
//    (CLAVE_CODIGO_REFERIDO) y el registro, al completarse, intenta
//    guardarlo en `usuarios.referido_por` (el CÓDIGO, no el uuid).
//  - Esa columna la agrega la migración
//    scripts/migraciones/2026-11-17-referido-invitacion.sql. Si la
//    migración aún no se corre, el insert falla con "columna
//    inexistente" y el registro se reintenta SIN el campo: la
//    atribución se pierde en ese caso, pero el registro jamás se
//    rompe por esto (ver esErrorColumnaInexistente).

/** Ruta pública de la página de aterrizaje de invitaciones. */
export const RUTA_INVITACION = '/invitar';

/** Parámetro de URL con el código del referente: ?ref=CODIGO. */
export const PARAM_REFERIDO = 'ref';

/** Clave de localStorage donde la landing deja el código del referente. */
export const CLAVE_CODIGO_REFERIDO = 'club_codigo_referido';

/** Columna de `usuarios` donde el registro guarda el código (migración). */
export const COLUMNA_REFERIDO = 'referido_por';

/** Incentivo vigente para jugadores nuevos (decisión de Gonzalo, 2026-11-11). */
export const INCENTIVO_NUEVO_TEXTO =
  'tu primer boleto a mitad de precio ($15)';

export const LARGO_CODIGO_INVITACION = 8;

const ALFABETO_CODIGO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PATRON_CODIGO = /^[0-9A-Z]{8}$/;

// Hash cyrb53 (de bryc, dominio público): 53 bits, rápido y con buena
// dispersión para cadenas cortas como un uuid. Determinista: la misma
// entrada da siempre el mismo número, en cualquier navegador.
function cyrb53(texto: string, semilla = 0): number {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * El código de invitación de un usuario, derivado de su id.
 * Estable y sin estado: se puede recalcular donde se necesite.
 * Devuelve null si el id no es una cadena con contenido.
 */
export function codigoInvitacionDeUsuario(usuarioId: unknown): string | null {
  if (typeof usuarioId !== 'string') return null;
  const id = usuarioId.trim().toLowerCase();
  if (!id) return null;
  let resto = cyrb53(`club-invitacion:${id}`, 2024);
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO_INVITACION; i++) {
    codigo = ALFABETO_CODIGO[resto % 36] + codigo;
    resto = Math.floor(resto / 36);
  }
  return codigo;
}

/**
 * Normaliza un código venga como venga (minúsculas, espacios, guiones
 * de un copiar-pegar descuidado) y lo devuelve solo si tiene el
 * formato exacto; si no, null.
 */
export function normalizarCodigoInvitacion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return PATRON_CODIGO.test(limpio) ? limpio : null;
}

/** ¿El valor es un código de invitación con formato válido? */
export function esCodigoInvitacionValido(valor: unknown): boolean {
  return normalizarCodigoInvitacion(valor) !== null;
}

/** El enlace personal completo a partir del ORIGEN del sitio y un código ya válido. */
export function enlaceConCodigo(origen: unknown, codigo: unknown): string | null {
  if (typeof origen !== 'string') return null;
  const base = origen.trim().replace(/\/+$/, '');
  const cod = normalizarCodigoInvitacion(codigo);
  if (!base || !cod) return null;
  return `${base}${RUTA_INVITACION}?${PARAM_REFERIDO}=${cod}`;
}

/** El enlace personal completo de un usuario (origen + su código). */
export function enlaceInvitacion(origen: unknown, usuarioId: unknown): string | null {
  const codigo = codigoInvitacionDeUsuario(usuarioId);
  if (!codigo) return null;
  return enlaceConCodigo(origen, codigo);
}

/**
 * Saca el código del referente de una URL completa, de su parte de
 * búsqueda ("?ref=...") o de un "ref=..." suelto. Un código con mal
 * formato cuenta como si no viniera: devuelve null.
 */
export function extraerCodigoInvitacion(texto: unknown): string | null {
  if (typeof texto !== 'string' || !texto) return null;
  let busqueda = texto;
  const indice = busqueda.indexOf('?');
  if (indice >= 0) busqueda = busqueda.slice(indice + 1);
  try {
    const params = new URLSearchParams(busqueda);
    return normalizarCodigoInvitacion(params.get(PARAM_REFERIDO));
  } catch {
    return null;
  }
}

export interface DatosTextoInvitacion {
  /** El enlace personal que va al final del mensaje. */
  enlace: string;
  /** Nombre de la quiniela abierta, si hay una (p. ej. "LMX J17"). */
  nombreJornada?: string | null;
  /** Precio normal del boleto de esa quiniela, si se conoce. */
  precioBoleto?: number | null;
}

/**
 * El texto listo para WhatsApp. Con quiniela abierta la nombra (y el
 * precio si viene); sin quiniela, mensaje genérico del Club. En
 * ambos casos lleva el incentivo de bienvenida y el enlace.
 */
export function textoWhatsAppInvitacion(datos: DatosTextoInvitacion): string {
  const jornada = (datos.nombreJornada || '').trim();
  const lineas: string[] = [];
  if (jornada) {
    lineas.push(`⚽ ¡Te invito a jugar la ${jornada} en el Club de Pronósticos!`);
    lineas.push(
      datos.precioBoleto && datos.precioBoleto > 0
        ? `El boleto cuesta $${datos.precioBoleto} y la bolsa se reparte en premios: pronostica los partidos, suma puntos y gana. 🏆`
        : 'Pronostica los partidos, suma puntos y gana la bolsa. 🏆'
    );
  } else {
    lineas.push('⚽ ¡Te invito al Club de Pronósticos!');
    lineas.push(
      'Cada jornada pronosticamos los partidos, sumamos puntos y el mejor se lleva la bolsa. 🏆'
    );
  }
  lineas.push(`🎟️ Como jugador nuevo, ${INCENTIVO_NUEVO_TEXTO}.`);
  lineas.push(`👉 Únete aquí: ${datos.enlace}`);
  return lineas.join('\n');
}

/** Enlace de compartir por WhatsApp (sin número: abre el selector de chats). */
export function enlaceCompartirWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

// ---------------------------------------------------------------------
// El código del referente en localStorage. Todo va con try/catch y
// revisión de window: en modo privado o sin almacenamiento estas
// funciones simplemente no hacen nada y la app sigue igual.
// ---------------------------------------------------------------------

function almacenamientoLocal(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Guarda el código del referente (ya validado) para el registro. */
export function guardarCodigoReferido(codigo: unknown): boolean {
  const cod = normalizarCodigoInvitacion(codigo);
  const storage = almacenamientoLocal();
  if (!cod || !storage) return false;
  try {
    storage.setItem(CLAVE_CODIGO_REFERIDO, cod);
    return true;
  } catch {
    return false;
  }
}

/** El código del referente guardado, o null si no hay o no es válido. */
export function leerCodigoReferido(): string | null {
  const storage = almacenamientoLocal();
  if (!storage) return null;
  try {
    return normalizarCodigoInvitacion(storage.getItem(CLAVE_CODIGO_REFERIDO));
  } catch {
    return null;
  }
}

/** Borra el código guardado (al completarse el registro, se haya usado o no). */
export function limpiarCodigoReferido(): void {
  const storage = almacenamientoLocal();
  if (!storage) return;
  try {
    storage.removeItem(CLAVE_CODIGO_REFERIDO);
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
}

/**
 * ¿Este error de Supabase/PostgREST es "la columna no existe en el
 * esquema"? Es la señal de que la migración de `referido_por` aún no
 * se corre: el registro se reintenta sin ese campo y nadie se queda
 * fuera por la atribución. PostgREST lo reporta con código PGRST204
 * y el nombre de la columna en el mensaje.
 */
export function esErrorColumnaInexistente(error: unknown, columna: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (typeof e.message !== 'string') return false;
  // El mensaje debe nombrar a ESTA columna: el de PostgREST siempre lo
  // hace ("Could not find the 'referido_por' column of 'usuarios'…"),
  // y así un error de otra columna no se confunde con este.
  if (!e.message.includes(columna)) return false;
  return (
    e.code === 'PGRST204' ||
    /could not find|does not exist|no existe/i.test(e.message)
  );
}
