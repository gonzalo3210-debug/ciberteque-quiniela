// src/lib/caminoFinal.ts
//
// Lógica PURA del tablero "🏁 CAMINO A LA FINAL" del modo sorteo.
//
// El sorteo asigna un equipo a cada pase (tickets.equipo_asignado_id,
// ver sorteoCeremonia.ts) y la supervivencia es simple: el pase vive
// mientras su equipo siga ganando en el cuadro eliminatorio de la
// quiniela, y queda eliminado cuando su equipo pierde un partido
// FINAL. Este módulo deriva ese recorrido de los datos reales — los
// partidos de la quiniela (que el admin agrega al cuadro y cuyo
// marcador captura el árbitro o el programa de marcadores) — sin
// escribir nada en la base y sin tocar el marcador manual de
// eliminación (tickets.puntos_totales < 0), que es otra cosa.
//
// CÓMO SE DERIVA (por equipo, partidos finales en orden cronológico):
//   - Ganar un partido final suma una victoria. La etapa de un pase
//     es su número de victorias: 0 = primera ronda del cuadro,
//     1 = la siguiente, etc. En el cuadro de 8: 0 Cuartos,
//     1 Semifinal, 2 Final, 3 Campeón.
//   - Perder un partido final elimina: la caída queda registrada con
//     la etapa en la que cayó (sus victorias hasta ahí), el rival y
//     el marcador. Una vez eliminado, ningún dato posterior lo revive.
//   - Ganador de un partido final: el de más goles; si los goles
//     empatan, manda resultado_real ('L'/'V' = ganó por penales, que
//     es como la app registra el resultado oficial); con 'E' o sin
//     resultado, ese partido no avanza ni elimina a nadie.
//   - Un partido NO final no avanza ni elimina a nadie. Si ya trae
//     goles y el equipo va perdiendo, el pase se marca "en riesgo"
//     SOLO como dato (la vista lo muestra como aviso parcial, sin
//     animación de avance/eliminación: nada es oficial hasta el
//     final).
//   - Campeón: todos los partidos de la quiniela son finales, queda
//     UN solo equipo sin derrota y ese equipo ganó el último partido
//     final. En el cuadro de 8 eso equivale a 3 victorias; la regla
//     del sobreviviente también degrada con gracia si el cuadro
//     tuviera otro tamaño (las etapas se nombran por su distancia a
//     la Final: …, Octavos, Cuartos, Semifinal, Final).
//
// Identidad de los equipos: en la tabla partidos los equipos viven
// por NOMBRE (equipo_local/equipo_visitante son texto), mientras los
// pases traen el id y el nombre del equipo asignado. El cruce es por
// nombre normalizado (minúsculas, sin acentos, sin espacios extra),
// el mismo criterio con el que la app resuelve logos por nombre.

import type { AsignacionSorteo } from './sorteoCeremonia';

/** Un partido del cuadro, tal como vive en la tabla partidos. */
export interface PartidoCamino {
  id: string;
  /** Nombre del equipo local (en la base es texto, no id). */
  equipoLocal: string;
  /** Nombre del equipo visitante. */
  equipoVisitante: string;
  golesLocal?: number | null;
  golesVisitante?: number | null;
  /** 'L' | 'E' | 'V' — el resultado oficial capturado, si existe. */
  resultadoReal?: string | null;
  esFinal?: boolean | null;
  /** ISO; ordena el recorrido cronológicamente. */
  fecha?: string | null;
}

export type EstadoCamino = 'vivo' | 'eliminado' | 'campeon';

/** Cómo y dónde cayó un pase eliminado. */
export interface CaidaCamino {
  /** Índice de la etapa en la que cayó (= victorias que llevaba). */
  etapaIndice: number;
  etapaNombre: string;
  rivalNombre: string;
  golesFavor: number;
  golesContra: number;
  /** Marcador desde el equipo del pase: "1-2". */
  marcadorTexto: string;
}

/** El siguiente partido de un pase vivo, si ya está en el cuadro. */
export interface ProximoPartidoCamino {
  rivalNombre: string;
  fecha: string | null;
  /** Ya empezó: trae goles capturados pero aún no es final. */
  enVivo: boolean;
  /** Va perdiendo ese partido parcial (el dato de "en riesgo"). */
  vaPerdiendo: boolean;
  golesFavor: number | null;
  golesContra: number | null;
}

/** El estado derivado de UN pase dentro del camino. */
export interface EstadoPaseCamino {
  pase: AsignacionSorteo;
  victorias: number;
  /** Columna del tablero donde vive la ficha (0 = primera ronda). */
  etapaIndice: number;
  /** Nombre de su etapa actual; "Campeón" si ya ganó el torneo. */
  etapaNombre: string;
  estado: EstadoCamino;
  caida: CaidaCamino | null;
  proximoPartido: ProximoPartidoCamino | null;
  /** Perdiendo un partido en vivo: dato parcial, nada oficial. */
  enRiesgo: boolean;
}

export interface ColumnaCamino {
  indice: number;
  nombre: string;
  esCampeon: boolean;
}

export interface CaminoFinal {
  /** Rondas del cuadro (3 en el de 8 equipos). */
  rondasTotales: number;
  /** Columnas a pintar: una por ronda + la del Campeón. */
  columnas: ColumnaCamino[];
  /** Todos los pases con su estado, en orden estable. */
  pases: EstadoPaseCamino[];
  /** Pases agrupados por columna, paralelo a `columnas`. */
  porColumna: EstadoPaseCamino[][];
  hayCampeon: boolean;
  /** Id del equipo campeón (el de los pases ganadores), si lo hay. */
  campeonEquipoId: string | null;
  partidosTotales: number;
  partidosFinales: number;
}

// ---------- Utilidades internas -------------------------------------------

/** Nombre comparable: minúsculas, sin acentos ni espacios extra. */
export function normalizarNombreEquipo(nombre: string): string {
  return (nombre || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Nombre de la etapa `indice` en un cuadro de `rondasTotales`. */
export function nombreEtapaCamino(
  indice: number,
  rondasTotales: number
): string {
  const desdeElFinal = rondasTotales - 1 - indice;
  if (desdeElFinal <= 0) return 'Final';
  if (desdeElFinal === 1) return 'Semifinal';
  if (desdeElFinal === 2) return 'Cuartos';
  if (desdeElFinal === 3) return 'Octavos';
  return `Ronda ${indice + 1}`;
}

/** Rondas de un cuadro de n equipos (potencia de dos o no). */
function rondasDeCuadro(cantidadEquipos: number): number {
  if (cantidadEquipos < 2) return 1;
  return Math.max(1, Math.ceil(Math.log2(cantidadEquipos)));
}

interface RecorridoEquipo {
  clave: string;
  victorias: number;
  caida: {
    rivalNombre: string;
    golesFavor: number;
    golesContra: number;
  } | null;
  /** Índice cronológico del último partido final ganado. */
  ganoUltimoFinal: boolean;
}

/** ¿Este partido final tiene ganador derivable? Devuelve la clave. */
function ganadorPartidoFinal(
  p: PartidoCamino
): { ganador: string; perdedor: string } | null {
  const gl = p.golesLocal;
  const gv = p.golesVisitante;
  if (gl === null || gl === undefined || gv === null || gv === undefined) {
    return null;
  }
  const local = normalizarNombreEquipo(p.equipoLocal);
  const visitante = normalizarNombreEquipo(p.equipoVisitante);
  if (gl > gv) return { ganador: local, perdedor: visitante };
  if (gv > gl) return { ganador: visitante, perdedor: local };
  // Goles empatados: solo desempata el resultado oficial (penales).
  const r = (p.resultadoReal || '').toUpperCase();
  if (r === 'L') return { ganador: local, perdedor: visitante };
  if (r === 'V') return { ganador: visitante, perdedor: local };
  return null;
}

// ---------- El cálculo -----------------------------------------------------

/**
 * El camino completo de la quiniela de sorteo: estado de cada pase,
 * agrupado por columna del tablero. Determinista y sin efectos.
 *
 * @param pases      Asignaciones pase→equipo ya guardadas.
 * @param partidos   Partidos del cuadro de ESTA quiniela.
 * @param cantidadEquiposCuadro  Equipos del bombo (8); si no se pasa,
 *                   se infiere de los equipos que aparecen en pases y
 *                   partidos.
 */
export function calcularCaminoFinal(
  pases: AsignacionSorteo[],
  partidos: PartidoCamino[],
  cantidadEquiposCuadro?: number
): CaminoFinal {
  // Orden cronológico estable: por fecha; sin fecha, al final y en
  // el orden en que llegaron.
  const ordenados = partidos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ta = a.p.fecha ? new Date(a.p.fecha).getTime() : NaN;
      const tb = b.p.fecha ? new Date(b.p.fecha).getTime() : NaN;
      const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
      const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
      if (va !== vb) return va - vb;
      return a.i - b.i;
    })
    .map((x) => x.p);

  // Equipos del cuadro: para las rondas y para saber quién sigue vivo.
  const clavesCuadro = new Set<string>();
  for (const pase of pases) {
    clavesCuadro.add(normalizarNombreEquipo(pase.nombreEquipo));
  }
  for (const p of ordenados) {
    clavesCuadro.add(normalizarNombreEquipo(p.equipoLocal));
    clavesCuadro.add(normalizarNombreEquipo(p.equipoVisitante));
  }
  const cantidadEquipos =
    cantidadEquiposCuadro && cantidadEquiposCuadro > 0
      ? cantidadEquiposCuadro
      : clavesCuadro.size;
  const rondasTotales = rondasDeCuadro(cantidadEquipos);

  // Recorrido por equipo: solo partidos FINALES con ganador.
  const recorridos = new Map<string, RecorridoEquipo>();
  const recorridoDe = (clave: string): RecorridoEquipo => {
    let r = recorridos.get(clave);
    if (!r) {
      r = { clave, victorias: 0, caida: null, ganoUltimoFinal: false };
      recorridos.set(clave, r);
    }
    return r;
  };
  const finales = ordenados.filter((p) => p.esFinal);
  let ultimoGanadorClave: string | null = null;
  for (const p of finales) {
    const res = ganadorPartidoFinal(p);
    if (!res) continue;
    const ganador = recorridoDe(res.ganador);
    const perdedor = recorridoDe(res.perdedor);
    const esLocalGanador =
      res.ganador === normalizarNombreEquipo(p.equipoLocal);
    // La caída se registra una sola vez: la primera derrota manda.
    if (!perdedor.caida) {
      perdedor.caida = {
        rivalNombre: esLocalGanador ? p.equipoLocal : p.equipoVisitante,
        golesFavor: esLocalGanador ? p.golesVisitante! : p.golesLocal!,
        golesContra: esLocalGanador ? p.golesLocal! : p.golesVisitante!,
      };
    }
    // El ya eliminado no suma victorias posteriores (datos raros no
    // reviven a nadie); el vivo sí avanza.
    if (!ganador.caida) ganador.victorias += 1;
    ultimoGanadorClave = res.ganador;
  }
  if (ultimoGanadorClave) {
    const r = recorridos.get(ultimoGanadorClave);
    if (r && !r.caida) r.ganoUltimoFinal = true;
  }

  const todosFinales =
    ordenados.length > 0 && finales.length === ordenados.length;

  // Campeón por la regla del sobreviviente.
  let campeonClave: string | null = null;
  if (todosFinales) {
    const vivos = [...clavesCuadro].filter((c) => !recorridos.get(c)?.caida);
    if (vivos.length === 1) {
      const r = recorridos.get(vivos[0]);
      if (r && r.victorias > 0 && r.ganoUltimoFinal) {
        campeonClave = vivos[0];
      }
    }
  }

  // Próximo partido y riesgo en vivo por equipo (solo no finales).
  const noFinales = ordenados.filter((p) => !p.esFinal);
  const proximoDe = (clave: string): ProximoPartidoCamino | null => {
    for (const p of noFinales) {
      const cl = normalizarNombreEquipo(p.equipoLocal);
      const cv = normalizarNombreEquipo(p.equipoVisitante);
      if (cl !== clave && cv !== clave) continue;
      const esLocal = cl === clave;
      const golesFavor = esLocal ? p.golesLocal : p.golesVisitante;
      const golesContra = esLocal ? p.golesVisitante : p.golesLocal;
      const enVivo =
        golesFavor !== null &&
        golesFavor !== undefined &&
        golesContra !== null &&
        golesContra !== undefined;
      return {
        rivalNombre: esLocal ? p.equipoVisitante : p.equipoLocal,
        fecha: p.fecha ?? null,
        enVivo,
        vaPerdiendo: enVivo ? golesFavor! < golesContra! : false,
        golesFavor: enVivo ? golesFavor! : null,
        golesContra: enVivo ? golesContra! : null,
      };
    }
    return null;
  };

  // Estado por pase.
  const estados: EstadoPaseCamino[] = pases.map((pase) => {
    const clave = normalizarNombreEquipo(pase.nombreEquipo);
    const rec = recorridos.get(clave);
    const victorias = rec?.victorias ?? 0;
    const esCampeon = campeonClave !== null && clave === campeonClave;
    if (esCampeon) {
      return {
        pase,
        victorias,
        etapaIndice: rondasTotales,
        etapaNombre: 'Campeón',
        estado: 'campeon' as const,
        caida: null,
        proximoPartido: null,
        enRiesgo: false,
      };
    }
    if (rec?.caida) {
      const etapaCaida = Math.min(victorias, rondasTotales - 1);
      return {
        pase,
        victorias,
        etapaIndice: etapaCaida,
        etapaNombre: nombreEtapaCamino(etapaCaida, rondasTotales),
        estado: 'eliminado' as const,
        caida: {
          etapaIndice: etapaCaida,
          etapaNombre: nombreEtapaCamino(etapaCaida, rondasTotales),
          rivalNombre: rec.caida.rivalNombre,
          golesFavor: rec.caida.golesFavor,
          golesContra: rec.caida.golesContra,
          marcadorTexto: `${rec.caida.golesFavor}-${rec.caida.golesContra}`,
        },
        proximoPartido: null,
        enRiesgo: false,
      };
    }
    const etapa = Math.min(victorias, rondasTotales - 1);
    const proximo = proximoDe(clave);
    return {
      pase,
      victorias,
      etapaIndice: etapa,
      etapaNombre: nombreEtapaCamino(etapa, rondasTotales),
      estado: 'vivo' as const,
      caida: null,
      proximoPartido: proximo,
      enRiesgo: !!proximo?.vaPerdiendo,
    };
  });

  // Orden estable dentro del tablero: vivos/campeón primero, luego
  // por nombre de jugador y ticket (el mismo criterio de la
  // ceremonia).
  const ordenadosEstados = [...estados].sort((a, b) => {
    const rango = (e: EstadoPaseCamino) => (e.estado === 'eliminado' ? 1 : 0);
    if (rango(a) !== rango(b)) return rango(a) - rango(b);
    const porNombre = a.pase.nombreJugador.localeCompare(
      b.pase.nombreJugador,
      'es'
    );
    if (porNombre !== 0) return porNombre;
    if (a.pase.ticketId < b.pase.ticketId) return -1;
    if (a.pase.ticketId > b.pase.ticketId) return 1;
    return 0;
  });

  const columnas: ColumnaCamino[] = [];
  for (let i = 0; i < rondasTotales; i++) {
    columnas.push({
      indice: i,
      nombre: nombreEtapaCamino(i, rondasTotales),
      esCampeon: false,
    });
  }
  columnas.push({ indice: rondasTotales, nombre: 'Campeón', esCampeon: true });

  const porColumna: EstadoPaseCamino[][] = columnas.map((c) =>
    ordenadosEstados.filter((e) => e.etapaIndice === c.indice)
  );

  const paseCampeon = ordenadosEstados.find((e) => e.estado === 'campeon');

  return {
    rondasTotales,
    columnas,
    pases: ordenadosEstados,
    porColumna,
    hayCampeon: !!paseCampeon,
    campeonEquipoId: paseCampeon ? paseCampeon.pase.equipoId : null,
    partidosTotales: ordenados.length,
    partidosFinales: finales.length,
  };
}

// ---------- Detección de cambios (para animar) ------------------------------

/** La foto mínima de un pase para comparar entre refrescos. */
export interface FotoPaseCamino {
  etapaIndice: number;
  estado: EstadoCamino;
}

export type CambioCamino = 'avanzo' | 'eliminado' | 'campeon';

/** Foto ticketId → estado, lista para guardarla y comparar luego. */
export function fotoCamino(
  pases: EstadoPaseCamino[]
): Map<string, FotoPaseCamino> {
  return new Map(
    pases.map((e) => [
      e.pase.ticketId,
      { etapaIndice: e.etapaIndice, estado: e.estado },
    ])
  );
}

/**
 * Qué cambió entre la foto anterior y los estados actuales, por
 * pase: avanzó de etapa, quedó eliminado o se coronó campeón. Sin
 * foto anterior (primera carga) no hay cambios: esa foto es la línea
 * base, como en detectarEventosSonoros. Un pase que no estaba en la
 * foto no se anima (es nuevo en pantalla, no "se movió").
 */
export function detectarCambiosCamino(
  previo: Map<string, FotoPaseCamino> | null,
  actuales: EstadoPaseCamino[]
): Map<string, CambioCamino> {
  const cambios = new Map<string, CambioCamino>();
  if (!previo) return cambios;
  for (const actual of actuales) {
    const antes = previo.get(actual.pase.ticketId);
    if (!antes) continue;
    if (antes.estado !== 'campeon' && actual.estado === 'campeon') {
      cambios.set(actual.pase.ticketId, 'campeon');
    } else if (antes.estado === 'vivo' && actual.estado === 'eliminado') {
      cambios.set(actual.pase.ticketId, 'eliminado');
    } else if (
      actual.estado === 'vivo' &&
      actual.etapaIndice > antes.etapaIndice
    ) {
      cambios.set(actual.pase.ticketId, 'avanzo');
    }
  }
  return cambios;
}
