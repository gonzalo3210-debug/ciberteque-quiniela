// src/lib/fechaMazatlan.ts
//
// Utilidades de fecha/hora SIEMPRE en la zona de Gonzalo y sus jugadores:
// America/Mazatlan. El servidor puede correr en UTC y el navegador en
// cualquier zona; sin esto, "los partidos de hoy" saldrían corridos.
// Funciones puras: sirven igual en rutas de servidor y en componentes.

export const ZONA_MAZATLAN = 'America/Mazatlan';

const fmtFecha = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_MAZATLAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const fmtHora = new Intl.DateTimeFormat('es-MX', {
  timeZone: ZONA_MAZATLAN,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const fmtFechaCorta = new Intl.DateTimeFormat('es-MX', {
  timeZone: ZONA_MAZATLAN,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "YYYY-MM-DD" del instante en America/Mazatlan. */
export function fechaEnMazatlan(isoUtc: string): string {
  const parts = fmtFecha.formatToParts(new Date(isoUtc));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "YYYY-MM-DD" de HOY en America/Mazatlan. */
export function hoyEnMazatlan(): string {
  return fechaEnMazatlan(new Date().toISOString());
}

/** Suma días a un "YYYY-MM-DD" (aritmética en UTC al mediodía: sin brincos). */
export function sumarDias(fechaYmd: string, dias: number): string {
  const d = new Date(`${fechaYmd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Hora "HH:MM" del instante en America/Mazatlan. */
export function horaEnMazatlan(isoUtc: string): string {
  return fmtHora.format(new Date(isoUtc));
}

/** Etiqueta corta del día, p. ej. "vie 14 nov", en America/Mazatlan. */
export function fechaCortaEnMazatlan(isoUtc: string): string {
  return fmtFechaCorta.format(new Date(isoUtc));
}

const fmtFechaLarga = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'UTC', // la fecha YMD es un día calendario: se formatea tal cual
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Etiqueta larga de un día calendario "YYYY-MM-DD", p. ej.
 * "miércoles 12 de noviembre" (para el selector de día de Resultados).
 * Si es hoy/ayer/mañana en Mazatlán, antepone "Hoy · " / "Ayer · " / "Mañana · ".
 */
export function etiquetaFechaLarga(ymd: string): string {
  const larga = fmtFechaLarga.format(new Date(`${ymd}T12:00:00Z`));
  const hoy = hoyEnMazatlan();
  if (ymd === hoy) return `Hoy · ${larga}`;
  if (ymd === sumarDias(hoy, -1)) return `Ayer · ${larga}`;
  if (ymd === sumarDias(hoy, 1)) return `Mañana · ${larga}`;
  return larga;
}
