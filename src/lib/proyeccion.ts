// src/lib/proyeccion.ts
//
// PROYECCIÓN EN VIVO ("si terminara ahorita") — cálculo PURO y
// compartido de puntos y tablas de una quiniela.
//
// Esta es LA implementación de las reglas de puntuación dentro de la
// app: la usa el ranking oficial (usePosiciones, con soloFinales:
// false, que es su comportamiento histórico: cuenta cualquier partido
// que ya tenga resultado capturado, final o parcial), la posición del
// jugador en Mis Jugadas y las vistas de proyección. El programa de
// marcadores (scripts/marcador-directo/logica.mjs) trae su propia
// réplica porque corre fuera de la app, verificada contra esta misma
// lógica.
//
// Reglas (idénticas a las del ranking oficial):
//  - Partido con resultado: marcador exacto en modalidad
//    marcador_exacto = 3 pts; acertar solo la tendencia L/E/V = 1 pt;
//    en las demás modalidades acertar la tendencia = 1 pt.
//  - Desempate: diferencia entre la predicción de goles totales del
//    boleto y el total REAL de goles, que es la SUMA de los goles
//    capturados en los partidos (totalGolesEfectivo, la misma regla
//    con la que liquida el programa de marcadores); el campo guardado
//    goles_totales_real solo es respaldo cuando ningún partido trae
//    goles. Sin ningún total vale 999 para todos (durante el juego,
//    en la práctica, manda puntos). Corrección 2026-11-21: antes se
//    leía solo el campo guardado, que se queda viejo si nadie guarda
//    desde el panel del árbitro (quedó en 1 con 16 goles jugados).
//  - Orden: puntos desc, diferencia asc; empate exacto en ambos =
//    lugar compartido.
//  - Sorteo NO se proyecta: es supervivencia por equipo asignado y su
//    orden sale de puntos_totales de la base.
//
// "En vivo" = partido con resultado capturado y es_final en falso
// (lo escribe el programa de marcadores o el panel del árbitro con
// GUARDAR AVANCE). "Solo finales" = cuentan únicamente los partidos
// con es_final en verdadero.

export type EstadoPronostico =
  | 'acierto_exacto'
  | 'acierto_lev'
  | 'fallo'
  | 'pendiente';

export interface PartidoPuntuable {
  id: string;
  goles_local?: number | null;
  goles_visitante?: number | null;
  resultado_real?: string | null;
  es_final?: boolean | null;
}

export interface PronosticoPuntuable {
  partido_id: string;
  eleccion_usuario?: string | null;
}

export interface TicketPuntuable {
  id: string;
  usuario_id?: string;
  prediccion_goles_total?: number | null;
  pronosticos?: PronosticoPuntuable[] | null;
}

export interface QuinielaPuntuable {
  modalidad?: string | null;
  goles_totales_real?: number | null;
}

export interface DetallePronostico {
  partidoId: string;
  puntos: number;
  estado: EstadoPronostico;
  enVivo: boolean;
  esFinal: boolean;
}

export interface FilaTabla {
  ticketId: string;
  usuarioId: string | null;
  puntos: number;
  golesDiff: number;
  posicion: number;
  aciertos: Record<string, EstadoPronostico>;
  detalle: DetallePronostico[];
}

export interface ProyeccionTicket {
  puntos: number;
  posicion: number;
  puntosSoloFinales: number;
  posicionSoloFinales: number;
  /** posicionSoloFinales - posicion: positivo = subió lugares. */
  movimiento: number;
  desgloseEnVivo: DetallePronostico[];
}

export interface ProyeccionQuiniela {
  hayEnVivo: boolean;
  hayActividad: boolean;
  tablaProyeccion: FilaTabla[];
  tablaSoloFinales: FilaTabla[];
  porTicket: Record<string, ProyeccionTicket>;
}

/** Tendencia L/E/V de una elección o de un marcador ("L", "2-1", …). */
export function tendenciaLEV(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = String(valor).replace(/\s+/g, '').toUpperCase();
  if (['L', 'E', 'V'].includes(limpio)) return limpio;
  if (limpio.includes('-')) {
    const [l, v] = limpio.split('-').map(Number);
    if (!Number.isNaN(l) && !Number.isNaN(v)) {
      if (l > v) return 'L';
      if (l < v) return 'V';
      return 'E';
    }
  }
  return null;
}

function tieneGoles(partido: PartidoPuntuable): boolean {
  return (
    partido.goles_local !== null &&
    partido.goles_local !== undefined &&
    partido.goles_visitante !== null &&
    partido.goles_visitante !== undefined
  );
}

/** ¿El partido ya tiene algún resultado capturado (final o parcial)? */
export function partidoTieneResultado(partido: PartidoPuntuable): boolean {
  return (
    (partido.resultado_real !== null && partido.resultado_real !== undefined) ||
    tieneGoles(partido)
  );
}

/** Partido en juego: ya hay marcador parcial y aún no es final. */
export function partidoEnVivo(partido: PartidoPuntuable): boolean {
  return partidoTieneResultado(partido) && !partido.es_final;
}

/**
 * Total REAL de goles de la quiniela para el desempate: la SUMA de
 * los goles capturados en los partidos (con soloFinales, solo los de
 * partidos finales). Es la regla de golesTotalesEfectivos del
 * programa de marcadores (liquidacion.mjs): si hay goles capturados
 * manda su suma; si no hay ninguno, vale el campo guardado
 * goles_totales_real (o null). Así el ranking no depende de que
 * alguien guarde desde el panel del árbitro para tener el total
 * al corriente.
 */
export function totalGolesEfectivo(
  quiniela: QuinielaPuntuable,
  partidos: PartidoPuntuable[],
  soloFinales = false
): number | null {
  let suma = 0;
  let hayGoles = false;
  for (const p of partidos) {
    if (soloFinales && !p.es_final) continue;
    if (tieneGoles(p)) {
      suma += (p.goles_local as number) + (p.goles_visitante as number);
      hayGoles = true;
    }
  }
  if (hayGoles) return suma;
  return quiniela.goles_totales_real ?? null;
}

/** Diferencia de desempate de un boleto contra el total real. */
export function diferenciaGoles(
  prediccionGolesTotal: number | null | undefined,
  golesTotalesReal: number | null | undefined
): number {
  const reales =
    golesTotalesReal !== null && golesTotalesReal !== undefined
      ? golesTotalesReal
      : -1;
  return reales !== -1 ? Math.abs((prediccionGolesTotal || 0) - reales) : 999;
}

/**
 * Puntos de UN pronóstico contra el marcador ACTUAL de su partido.
 * Con soloFinales, un partido que no es final cuenta como pendiente.
 */
export function puntosDePronostico(
  modalidad: string | null | undefined,
  eleccion: string | null | undefined,
  partido: PartidoPuntuable,
  opciones?: { soloFinales?: boolean }
): { puntos: number; estado: EstadoPronostico } {
  const esFinal = Boolean(partido.es_final);
  if (opciones?.soloFinales && !esFinal) {
    return { puntos: 0, estado: 'pendiente' };
  }
  if (!partidoTieneResultado(partido)) {
    return { puntos: 0, estado: 'pendiente' };
  }

  const pickStr = String(eleccion ?? '').replace(/\s+/g, '');
  const realStr = tieneGoles(partido)
    ? `${partido.goles_local}-${partido.goles_visitante}`
    : String(partido.resultado_real ?? '').replace(/\s+/g, '');

  if (pickStr !== '' && pickStr === realStr) {
    return {
      puntos: modalidad === 'marcador_exacto' ? 3 : 1,
      estado: 'acierto_exacto',
    };
  }
  const pickLEV = tendenciaLEV(pickStr);
  const realLEV = tendenciaLEV(realStr) || tendenciaLEV(partido.resultado_real);
  if (pickLEV && realLEV && pickLEV === realLEV) {
    return { puntos: 1, estado: 'acierto_lev' };
  }
  return { puntos: 0, estado: 'fallo' };
}

/**
 * Tabla completa de una quiniela (NO sorteo): puntos por boleto,
 * orden oficial y lugares compartidos. Con soloFinales: true solo
 * puntúan los partidos finales; con false cuentan también los
 * parciales en vivo (el comportamiento histórico del ranking).
 */
export function calcularTabla(
  quiniela: QuinielaPuntuable,
  tickets: TicketPuntuable[],
  partidos: PartidoPuntuable[],
  opciones?: { soloFinales?: boolean }
): FilaTabla[] {
  if (quiniela.modalidad === 'sorteo') return [];
  const soloFinales = Boolean(opciones?.soloFinales);
  const porId = new Map(partidos.map((p) => [p.id, p]));
  // Total real para el desempate: suma de los goles capturados (con
  // el mismo criterio de finales que los puntos), NO solo el campo
  // guardado — ver totalGolesEfectivo.
  const golesReales = totalGolesEfectivo(quiniela, partidos, soloFinales);

  const filas: FilaTabla[] = tickets.map((ticket) => {
    let puntos = 0;
    const aciertos: Record<string, EstadoPronostico> = {};
    const detalle: DetallePronostico[] = [];
    for (const pron of ticket.pronosticos || []) {
      const partido = porId.get(pron.partido_id);
      if (!partido) continue;
      const r = puntosDePronostico(
        quiniela.modalidad,
        pron.eleccion_usuario,
        partido,
        { soloFinales }
      );
      puntos += r.puntos;
      aciertos[pron.partido_id] = r.estado;
      detalle.push({
        partidoId: pron.partido_id,
        puntos: r.puntos,
        estado: r.estado,
        enVivo: partidoEnVivo(partido),
        esFinal: Boolean(partido.es_final),
      });
    }
    return {
      ticketId: ticket.id,
      usuarioId: ticket.usuario_id ?? null,
      puntos,
      golesDiff: diferenciaGoles(ticket.prediccion_goles_total, golesReales),
      posicion: 0,
      aciertos,
      detalle,
    };
  });

  filas.sort((a, b) => b.puntos - a.puntos || a.golesDiff - b.golesDiff);
  filas.forEach((fila, idx) => {
    if (idx > 0) {
      const anterior = filas[idx - 1];
      fila.posicion =
        fila.puntos === anterior.puntos && fila.golesDiff === anterior.golesDiff
          ? anterior.posicion
          : idx + 1;
    } else {
      fila.posicion = 1;
    }
  });
  return filas;
}

/**
 * Proyección completa: la tabla con parciales + finales contra la
 * tabla de solo finales, con el movimiento de cada boleto y el
 * desglose de sus partidos en vivo. Devuelve null en sorteo.
 */
export function calcularProyeccion(
  quiniela: QuinielaPuntuable,
  tickets: TicketPuntuable[],
  partidos: PartidoPuntuable[]
): ProyeccionQuiniela | null {
  if (quiniela.modalidad === 'sorteo') return null;

  const hayEnVivo = partidos.some((p) => partidoEnVivo(p));
  const hayActividad = partidos.some((p) => partidoTieneResultado(p));

  const tablaProyeccion = calcularTabla(quiniela, tickets, partidos, {
    soloFinales: false,
  });
  const tablaSoloFinales = calcularTabla(quiniela, tickets, partidos, {
    soloFinales: true,
  });
  const finalesPorTicket = new Map(
    tablaSoloFinales.map((f) => [f.ticketId, f])
  );

  const porTicket: Record<string, ProyeccionTicket> = {};
  for (const fila of tablaProyeccion) {
    const finales = finalesPorTicket.get(fila.ticketId);
    porTicket[fila.ticketId] = {
      puntos: fila.puntos,
      posicion: fila.posicion,
      puntosSoloFinales: finales ? finales.puntos : 0,
      posicionSoloFinales: finales ? finales.posicion : fila.posicion,
      movimiento: (finales ? finales.posicion : fila.posicion) - fila.posicion,
      desgloseEnVivo: fila.detalle.filter((d) => d.enVivo),
    };
  }

  return { hayEnVivo, hayActividad, tablaProyeccion, tablaSoloFinales, porTicket };
}
