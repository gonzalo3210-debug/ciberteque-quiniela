// src/lib/sonidos.ts
//
// Sonidos DENTRO de la app (WebAudio, sin archivos): gol y silbatazo
// final para la vista en vivo. Solo suenan si el jugador activó el
// toggle "🔊 Sonidos" (apagado por defecto) — ese clic es además el
// gesto que los navegadores exigen para dejar sonar audio.
// Excepción: la ceremonia del sorteo suena ENCENDIDA por defecto
// (ver sonidoCeremoniaActivo, más abajo).
//
// La detección (qué cambió entre un refresco y otro) es una función
// pura aparte: detectarEventosSonoros. La vista en vivo la alimenta
// con sus bloques de quiniela y favoritos; el resto de ligas no suena.

const CLAVE_PREF = 'club_pronosticos_sonidos_v1';

export function leerPreferenciaSonidos(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CLAVE_PREF) === '1';
  } catch {
    return false;
  }
}

export function guardarPreferenciaSonidos(activo: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_PREF, activo ? '1' : '0');
  } catch {
    // Sin almacenamiento: el toggle vive solo en esta sesión.
  }
}

/**
 * Lo que hay guardado de la preferencia, tal cual: '1', '0' o null si
 * el jugador nunca tocó el toggle de sonidos en este dispositivo.
 */
export function preferenciaSonidosGuardada(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CLAVE_PREF);
  } catch {
    return null;
  }
}

/**
 * PURA: ¿debe sonar la CEREMONIA del sorteo según la preferencia
 * guardada? Decisión (2026-11-22, pedida por Gonzalo): la ceremonia
 * es el momento cumbre del sorteo y suena ENCENDIDA por defecto —
 * quien nunca tocó el toggle la escucha igual. Una preferencia
 * explícita siempre manda: '1' suena y '0' es silencio. Cualquier
 * otro valor (o ninguno) cuenta como "nunca tocada".
 * El resto de la app (vista en vivo, camino a la final) sigue con la
 * regla de siempre: solo suena con el toggle activado.
 */
export function sonidoCeremoniaActivo(
  preferenciaGuardada: string | null
): boolean {
  if (preferenciaGuardada === '1') return true;
  if (preferenciaGuardada === '0') return false;
  return true;
}

/** La decisión de la ceremonia aplicada a lo guardado aquí. */
export function leerSonidoCeremoniaActivo(): boolean {
  return sonidoCeremoniaActivo(preferenciaSonidosGuardada());
}

// ---------- Detección pura ------------------------------------------------

export interface MarcadorSimple {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface EventoSonoro {
  tipo: 'gol' | 'final';
  id: string;
}

/**
 * Compara la foto anterior con la actual (solo partidos relevantes:
 * la vista pasa los de la quiniela y los de favoritos) y dice qué debe
 * sonar. Sin foto anterior (primera carga) no suena nada: la primera
 * foto es la línea base. Un gol y el final pueden caer en el mismo
 * refresco: se devuelven los dos, primero el gol.
 */
export function detectarEventosSonoros(
  previo: Map<string, MarcadorSimple> | null,
  actuales: MarcadorSimple[]
): EventoSonoro[] {
  if (!previo) return [];
  const eventos: EventoSonoro[] = [];
  for (const actual of actuales) {
    const antes = previo.get(actual.id);
    if (!antes) continue;

    const golesAntes =
      antes.homeScore !== null && antes.awayScore !== null
        ? antes.homeScore + antes.awayScore
        : null;
    const golesAhora =
      actual.homeScore !== null && actual.awayScore !== null
        ? actual.homeScore + actual.awayScore
        : null;
    if (golesAntes !== null && golesAhora !== null && golesAhora > golesAntes) {
      eventos.push({ tipo: 'gol', id: actual.id });
    }

    if (antes.status !== 'finished' && actual.status === 'finished') {
      eventos.push({ tipo: 'final', id: actual.id });
    }
  }
  return eventos;
}

// ---------- Reproducción (WebAudio) ----------------------------------------

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Llamar desde el clic del toggle: crea/reanuda el contexto de audio. */
export function desbloquearAudio(): void {
  contexto();
}

function tono(
  c: AudioContext,
  frecuencia: number,
  inicio: number,
  duracion: number,
  volumen = 0.12
): void {
  const osc = c.createOscillator();
  const ganancia = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = frecuencia;
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(volumen, inicio + 0.02);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  osc.connect(ganancia).connect(c.destination);
  osc.start(inicio);
  osc.stop(inicio + duracion + 0.05);
}

/** 🎉 Gol: tres notas subiendo (mi–sol–do). */
export function sonarGol(): void {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime;
  tono(c, 659.25, t, 0.12);
  tono(c, 783.99, t + 0.09, 0.12);
  tono(c, 1046.5, t + 0.18, 0.24);
}

function pitazo(c: AudioContext, inicio: number, duracion: number): void {
  // Ruido blanco filtrado a ~2.4 kHz: lo más parecido a un silbato
  // que sale de WebAudio sin archivos.
  const muestras = Math.max(1, Math.floor(c.sampleRate * duracion));
  const buffer = c.createBuffer(1, muestras, c.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;
  const fuente = c.createBufferSource();
  fuente.buffer = buffer;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 2400;
  filtro.Q.value = 8;
  const ganancia = c.createGain();
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(0.2, inicio + 0.02);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  fuente.connect(filtro).connect(ganancia).connect(c.destination);
  fuente.start(inicio);
  fuente.stop(inicio + duracion + 0.02);
}

/** 🏁 Silbatazo final: dos pitazos, el segundo más largo. */
export function sonarSilbatazo(): void {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime;
  pitazo(c, t, 0.16);
  pitazo(c, t + 0.24, 0.38);
}

/** Vibración corta en el celular al caer un gol (si el equipo la da). */
export function vibrarGol(): void {
  try {
    navigator.vibrate?.([70, 50, 70]);
  } catch {
    // Sin vibración disponible: no pasa nada.
  }
}

// ---------- Sonidos de la ceremonia del sorteo -----------------------------

function golpeTambor(
  c: AudioContext,
  inicio: number,
  duracion: number,
  volumen = 0.16
): OscillatorNode | null {
  // Un tom grave cuya frecuencia cae: lo más parecido a un golpe de
  // tambor que sale de un oscilador senoidal.
  const osc = c.createOscillator();
  const ganancia = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, inicio);
  osc.frequency.exponentialRampToValueAtTime(70, inicio + duracion);
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(volumen, inicio + 0.015);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  osc.connect(ganancia).connect(c.destination);
  osc.start(inicio);
  osc.stop(inicio + duracion + 0.05);
  return osc;
}

/**
 * 🥁 Redoble del bombo: golpes de tambor que se aceleran durante
 * `duracionMs`. Devuelve la función para detenerlo (si la ceremonia
 * se salta a la mitad, los golpes ya programados se cancelan).
 */
export function iniciarRedoble(duracionMs: number): () => void {
  const c = contexto();
  if (!c) return () => {};
  const t0 = c.currentTime + 0.03;
  const fuentes: OscillatorNode[] = [];
  let desplazamiento = 0;
  let paso = 0.15;
  while (desplazamiento < duracionMs / 1000) {
    const osc = golpeTambor(c, t0 + desplazamiento, 0.09, 0.1);
    if (osc) fuentes.push(osc);
    desplazamiento += paso;
    paso = Math.max(0.055, paso * 0.93);
  }
  return () => {
    for (const f of fuentes) {
      try {
        f.stop();
      } catch {
        // Ya sonó o ya se detuvo: no pasa nada.
      }
    }
  };
}

/** 🎯 Golpe de revelación: un tom seco y una nota brillante encima. */
export function sonarGolpe(): void {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime;
  golpeTambor(c, t, 0.22, 0.22);
  tono(c, 1318.5, t + 0.02, 0.16, 0.08);
}

/**
 * 🎰 Tick del barajeo: un clic cortísimo y suave que acompaña cada
 * cambio de pareja mientras el tablero se sigue barajando en el
 * revelado. Ruido breve filtrado a ~3.2 kHz y volumen bajo, para que
 * a 150 ms por cambio se oiga como el traqueteo de la rifa y no como
 * una alarma.
 */
export function sonarTickBarajeo(): void {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime;
  const duracion = 0.03;
  const muestras = Math.max(1, Math.floor(c.sampleRate * duracion));
  const buffer = c.createBuffer(1, muestras, c.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;
  const fuente = c.createBufferSource();
  fuente.buffer = buffer;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 3200;
  filtro.Q.value = 1.2;
  const ganancia = c.createGain();
  ganancia.gain.setValueAtTime(0.0001, t);
  ganancia.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
  fuente.connect(filtro).connect(ganancia).connect(c.destination);
  fuente.start(t);
  fuente.stop(t + duracion + 0.02);
}

/** 🎉 Fanfarria de cierre de la ceremonia: arpegio largo y brillante. */
export function sonarFanfarria(): void {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime;
  tono(c, 523.25, t, 0.14);
  tono(c, 659.25, t + 0.11, 0.14);
  tono(c, 783.99, t + 0.22, 0.14);
  tono(c, 1046.5, t + 0.33, 0.3);
  tono(c, 783.99, t + 0.55, 0.12, 0.09);
  tono(c, 1046.5, t + 0.66, 0.42, 0.13);
}
