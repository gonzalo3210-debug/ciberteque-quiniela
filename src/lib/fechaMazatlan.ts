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
 * Instante UTC (ISO) -> valor para un input datetime-local en hora de
 * Mazatlán ("YYYY-MM-DDTHH:mm"). El guardado de la jornada interpreta
 * el campo como hora local del navegador; como el Club opera en
 * Mazatlán, así el instante que llega a la base es exactamente el del
 * API. (Vivía en ModuloJornadasEquipos; se compartió aquí para que el
 * asistente gráfico use la misma conversión.)
 */
export function utcADatetimeLocalMazatlan(isoUtc: string | null): string {
  if (!isoUtc) return '';
  const fecha = new Date(isoUtc);
  if (isNaN(fecha.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_MAZATLAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const p: Record<string, string> = {};
  for (const parte of partes) p[parte.type] = parte.value;
  const hora = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hora}:${p.minute}`;
}

/** Instante UTC (ISO) -> texto legible en hora de Mazatlán. */
export function textoFechaMazatlan(isoUtc: string | null): string {
  if (!isoUtc) return 'Sin horario en el API';
  const fecha = new Date(isoUtc);
  if (isNaN(fecha.getTime())) return 'Sin horario en el API';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_MAZATLAN,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

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
