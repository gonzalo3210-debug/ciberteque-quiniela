// src/lib/estadisticas.ts
//
// ESTADÍSTICAS PERSONALES — cálculo PURO del historial de un jugador.
//
// Recibe el MISMO historial que las insignias (BoletoHistorial[]:
// boletos en quinielas CERRADAS de modos por puntos, ya calificados
// con la tabla oficial por src/hooks/useInsignias.ts) y devuelve las
// cifras de la tarjeta "📊 Mis estadísticas" de Mi Perfil. Sin red y
// sin base de datos.
//
// Reglas (las mismas del Club, sin duplicar criterios):
//  - SORTEO NO CUENTA: ni suma ni aparece en la serie (el armado ya
//    lo excluye; el filtro aquí es defensa, igual que en insignias).
//  - Quinielas jugadas, ganadas (1° incluido compartido), premios
//    cobrados, % con premio y la RACHA ACTUAL salen de
//    calcularInsignias con el mismo historial: una sola regla, y la
//    tarjeta nunca contradice a la vitrina de insignias.
//  - Puntos y precisión se calculan por QUINIELA con el MEJOR boleto
//    del jugador en esa jornada (más puntos; en empate, más
//    aciertos) — el mismo criterio de "manda su mejor boleto" de las
//    insignias. La precisión desglosa por modalidad: en marcador
//    exacto, exactos (3 pts) y tendencias (1 pt); en clásica todos
//    los aciertos son tendencias L/E/V y no hay "exactos".
//  - El dinero (totalGanadoPremios) NO se calcula aquí: llega como
//    dato ya confiable de la app (Perfil lo suma de
//    transacciones_creditos, descripciones de PREMIO, y lo muestra
//    como "Ganancias Totales"). Si no viene, queda null y la tarjeta
//    simplemente no muestra esa cifra; jamás se inventa un monto.

import {
  calcularInsignias,
  type BoletoHistorial,
} from './insignias';

export interface MejorQuiniela {
  nombreJornada: string;
  puntos: number;
  fechaCierre: string | null;
}

export interface PuntoSerie {
  /** Etiqueta corta para la gráfica (p. ej. 'J17'). */
  nombreCorto: string;
  nombreJornada: string;
  puntos: number;
  fechaCierre: string | null;
}

export interface ResultadoEstadisticas {
  /** Quinielas distintas jugadas (cerradas, por puntos). */
  quinielasJugadas: number;
  /** Quinielas ganadas (algún boleto en 1°, incluido compartido). */
  quinielasGanadas: number;
  /** Quinielas terminadas en lugar de premio. */
  premiosCobrados: number;
  /** % de quinielas jugadas con premio (0 si no ha jugado). */
  pctPremios: number;
  /** Pronósticos jugados (del mejor boleto de cada quiniela). */
  pronosticosJugados: number;
  /** Pronósticos con puntos (exactos + tendencias). */
  aciertosTotales: number;
  /** Marcadores exactos (solo de quinielas de marcador exacto). */
  exactosTotales: number;
  /** Aciertos de solo tendencia (L/E/V en clásica; 1 pt en exacto). */
  tendenciasTotales: number;
  /** % de aciertos sobre pronósticos jugados, 1 decimal. */
  precisionPct: number;
  /** Suma de puntos del mejor boleto de cada quiniela. */
  puntosTotales: number;
  /** Promedio de puntos por quiniela, 1 decimal. */
  promedioPuntos: number;
  /** Su mejor quiniela por puntos (null sin historial). */
  mejorQuiniela: MejorQuiniela | null;
  /** Quinielas seguidas cobrando premio (regla de insignias). */
  rachaActual: number;
  /** Últimas 10 quinielas jugadas, en orden cronológico. */
  serieUltimas: PuntoSerie[];
  /** Total ganado en premios según la app (null = sin dato). */
  totalGanadoPremios: number | null;
}

export interface OpcionesEstadisticas {
  /** Total ganado en premios ya calculado por la app, si lo hay. */
  totalGanadoPremios?: number | null;
}

/**
 * Etiqueta corta de una jornada para la gráfica: 'LMX J17' → 'J17',
 * 'Jornada 5' → 'J5'; sin número de jornada, la primera palabra
 * (máx. 9 caracteres) o el nombre tal cual si ya es corto.
 */
export function nombreCortoJornada(nombre: string | null | undefined): string {
  const limpio = (nombre || 'Jornada').trim();
  const conNumero = limpio.match(/(?:jornada|j)\s*(\d+)/i);
  if (conNumero) return `J${conNumero[1]}`;
  if (limpio.length <= 9) return limpio;
  const primeraPalabra = limpio.split(/\s+/)[0];
  return primeraPalabra.length <= 9
    ? primeraPalabra
    : limpio.slice(0, 8);
}

interface ParticipacionStats {
  quinielaId: string;
  nombreJornada: string;
  fechaCierre: string | null;
  orden: number;
  puntos: number;
  exactos: number;
  tendencias: number;
  aciertos: number;
  totalPronosticos: number;
}

/** Exactos del boleto según modalidad (en clásica no hay marcadores). */
function exactosDelBoleto(boleto: BoletoHistorial): number {
  return (boleto.modalidad || '').toLowerCase() === 'marcador_exacto'
    ? boleto.exactos
    : 0;
}

/** Tendencias del boleto según modalidad (en clásica, todo acierto). */
function tendenciasDelBoleto(boleto: BoletoHistorial): number {
  return (boleto.modalidad || '').toLowerCase() === 'marcador_exacto'
    ? boleto.tendencias
    : boleto.aciertos;
}

/**
 * Calcula las estadísticas personales desde el historial del
 * jugador. Historial vacío → todo en cero, sin mejor quiniela y
 * serie vacía (la tarjeta invita a jugar la primera).
 */
export function calcularEstadisticas(
  historial: BoletoHistorial[],
  opciones?: OpcionesEstadisticas
): ResultadoEstadisticas {
  // Conteos y racha: la regla oficial de insignias, sin duplicarla.
  const base = calcularInsignias(historial);

  // Agrupar por quiniela con el mejor boleto (puntos, luego
  // aciertos), ignorando sorteo.
  const porQuiniela = new Map<string, ParticipacionStats>();
  historial.forEach((boleto, idx) => {
    if ((boleto.modalidad || '').toLowerCase() === 'sorteo') return;
    const previa = porQuiniela.get(boleto.quinielaId);
    const mejorQuePrevia =
      !previa ||
      boleto.puntos > previa.puntos ||
      (boleto.puntos === previa.puntos && boleto.aciertos > previa.aciertos);
    if (mejorQuePrevia) {
      porQuiniela.set(boleto.quinielaId, {
        quinielaId: boleto.quinielaId,
        nombreJornada: boleto.nombreJornada,
        fechaCierre: boleto.fechaCierre,
        orden: previa ? previa.orden : idx,
        puntos: boleto.puntos,
        exactos: exactosDelBoleto(boleto),
        tendencias: tendenciasDelBoleto(boleto),
        aciertos: boleto.aciertos,
        totalPronosticos: boleto.totalPronosticos,
      });
    }
  });

  // Orden cronológico por fecha_cierre; sin fecha, al final y en el
  // orden en que llegaron (igual que en insignias).
  const participaciones = [...porQuiniela.values()].sort((a, b) => {
    const ta = a.fechaCierre ? new Date(a.fechaCierre).getTime() : NaN;
    const tb = b.fechaCierre ? new Date(b.fechaCierre).getTime() : NaN;
    if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
    if (!isNaN(ta) && isNaN(tb)) return -1;
    if (isNaN(ta) && !isNaN(tb)) return 1;
    return a.orden - b.orden;
  });

  const jugadas = base.quinielasJugadas;
  const pronosticosJugados = participaciones.reduce(
    (s, p) => s + p.totalPronosticos,
    0
  );
  const aciertosTotales = participaciones.reduce((s, p) => s + p.aciertos, 0);
  const exactosTotales = participaciones.reduce((s, p) => s + p.exactos, 0);
  const tendenciasTotales = participaciones.reduce(
    (s, p) => s + p.tendencias,
    0
  );
  const puntosTotales = participaciones.reduce((s, p) => s + p.puntos, 0);

  let mejorQuiniela: MejorQuiniela | null = null;
  for (const p of participaciones) {
    if (!mejorQuiniela || p.puntos > mejorQuiniela.puntos) {
      mejorQuiniela = {
        nombreJornada: p.nombreJornada,
        puntos: p.puntos,
        fechaCierre: p.fechaCierre,
      };
    }
  }

  const dinero = opciones?.totalGanadoPremios;

  return {
    quinielasJugadas: jugadas,
    quinielasGanadas: base.campeonatos,
    premiosCobrados: base.podios,
    pctPremios:
      jugadas > 0 ? Math.round((base.podios / jugadas) * 100) : 0,
    pronosticosJugados,
    aciertosTotales,
    exactosTotales,
    tendenciasTotales,
    precisionPct:
      pronosticosJugados > 0
        ? Math.round((aciertosTotales / pronosticosJugados) * 1000) / 10
        : 0,
    puntosTotales,
    promedioPuntos:
      participaciones.length > 0
        ? Math.round((puntosTotales / participaciones.length) * 10) / 10
        : 0,
    mejorQuiniela,
    rachaActual: base.rachaActual,
    serieUltimas: participaciones.slice(-10).map((p) => ({
      nombreCorto: nombreCortoJornada(p.nombreJornada),
      nombreJornada: p.nombreJornada,
      puntos: p.puntos,
      fechaCierre: p.fechaCierre,
    })),
    totalGanadoPremios:
      typeof dinero === 'number' && Number.isFinite(dinero) && dinero >= 0
        ? dinero
        : null,
  };
}
