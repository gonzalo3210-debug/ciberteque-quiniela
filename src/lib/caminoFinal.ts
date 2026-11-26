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
//
// LAS LLAVES (calcularLlavesCamino, al final del archivo): la
// presentación en forma de bracket que pidió Gonzalo — cada ronda
// agrupa a los equipos en llaves de dos lados (equipo + sus pases),
// como los cuadros de liguilla. El emparejamiento NO cambia la
// supervivencia (que sigue siendo la de arriba); solo agrupa:
//   1. PARTIDOS: si los partidos del cuadro ya emparejan a los
//      equipos de una ronda, esas son las llaves. Para la primera
//      ronda se acepta la fuente SOLO si cubre a todo el bombo.
//   2. SIEMBRA (solo primera ronda): si aún no hay partidos que la
//      cubran, se siembra por la POSICIÓN EN LA TABLA de cada
//      equipo, con el cuadro clásico: 1° vs 8°, 2° vs 7°, 3° vs 6°,
//      4° vs 5°. El orden que recibe esta función ya viene resuelto
//      por quien la llama (resolverSiembra en bomboSorteo.ts): la
//      posición sale de la tabla de la liga, NUNCA del orden de
//      selección ni del orden guardado en quinielas.equipos_sorteo
//      — ese arreglo puede ser el orden en que el admin marcó los
//      equipos a mano (desmarcar y re-marcar uno lo manda al
//      final). Solo si la tabla no resuelve a todo el bombo se usa
//      el orden guardado, y queda marcado (siembraDesdeTabla) para
//      que la vista lo avise en vez de emparejar callada.
// La ronda de cada partido se deriva de los estados ya calculados
// (la caída del perdedor marca la ronda de un partido final; en uno
// no final manda la etapa actual de sus equipos), sin recalcular
// ganadores por otra vía. El cuadro de la quiniela trae UN partido
// por llave, como ya supone la supervivencia.

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
  /**
   * Resultado de la IDA de esta llave, ya volteado a la orientación
   * de ESTE partido (el de vuelta): golesLocal/golesVisitante son los
   * que marcaron el local y el visitante DE LA VUELTA en la ida. Lo
   * rellena colapsarIdaVuelta cuando la ida ya es final y la vuelta
   * aún no: sirve para pintar el marcador global en el tablero.
   */
  ida?: { golesLocal: number; golesVisitante: number } | null;
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
  /**
   * Marcador GLOBAL de la llave (ida + lo que va de la vuelta),
   * desde el equipo del pase. Solo en las vueltas con ida ya final
   * (ver colapsarIdaVuelta); en partidos únicos queda null.
   */
  globalFavor?: number | null;
  globalContra?: number | null;
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
      // Vuelta con la ida ya final: el marcador que manda es el
      // GLOBAL de la llave (la ida más lo que vaya de la vuelta), y
      // el "en riesgo" se juzga contra ese global, no contra el
      // parcial del partido suelto.
      let globalFavor: number | null = null;
      let globalContra: number | null = null;
      if (p.ida) {
        const idaFavor = esLocal ? p.ida.golesLocal : p.ida.golesVisitante;
        const idaContra = esLocal ? p.ida.golesVisitante : p.ida.golesLocal;
        globalFavor = idaFavor + (enVivo ? golesFavor! : 0);
        globalContra = idaContra + (enVivo ? golesContra! : 0);
      }
      return {
        rivalNombre: esLocal ? p.equipoVisitante : p.equipoLocal,
        fecha: p.fecha ?? null,
        enVivo,
        vaPerdiendo:
          globalFavor !== null && globalContra !== null
            ? globalFavor < globalContra
            : enVivo
              ? golesFavor! < golesContra!
              : false,
        golesFavor: enVivo ? golesFavor! : null,
        golesContra: enVivo ? golesContra! : null,
        globalFavor,
        globalContra,
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

// ---------- Llaves a ida y vuelta (liguilla) --------------------------------

/** Opciones del colapso de llaves a ida y vuelta. */
export interface OpcionesIdaVuelta {
  /**
   * Posición de siembra (1 = mejor) por nombre de equipo
   * normalizado: con el global empatado en cuartos/semifinal avanza
   * el mejor posicionado (regla de la Liga MX). Sin posiciones, el
   * empate se resuelve solo con el resultado oficial de la vuelta
   * (penales), si existe.
   */
  posicionesSiembra?: Map<string, number> | null;
  /** Equipos del cuadro (8 en la liguilla); define las rondas. */
  cantidadEquipos?: number;
}

const DIEZ_DIAS_MS = 10 * 24 * 60 * 60 * 1000;

function tiempoDe(p: PartidoCamino): number {
  const t = p.fecha ? new Date(p.fecha).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function porFecha(partidos: PartidoCamino[]): PartidoCamino[] {
  return partidos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const va = tiempoDe(a.p);
      const vb = tiempoDe(b.p);
      if (va !== vb) return va - vb;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

/**
 * Colapsa las llaves a IDA Y VUELTA de la liguilla en la forma que
 * el camino entiende: UN partido decisivo por llave.
 *
 * El cuadro de la Liga MX no es a partido único: cada llave trae
 * dos partidos entre los mismos equipos (la vuelta invierte la
 * localía). Sin este colapso, perder la ida eliminaría al pase
 * antes de jugarse la vuelta. Reglas, por pareja de equipos con
 * dos partidos a no más de 10 días (la ida y su vuelta):
 *
 *   - Vuelta FINAL: la llave se decide por el MARCADOR GLOBAL. El
 *     partido que sale es uno solo, con los goles del global y la
 *     fecha de la vuelta. Si el global empata, en cuartos y
 *     semifinal avanza el MEJOR POSICIONADO en la tabla (la
 *     posición sale de `posicionesSiembra`); en la final del
 *     torneo no hay ventaja de posición: manda el resultado
 *     oficial de la vuelta (penales), y sin él nadie avanza ni cae.
 *   - Vuelta SIN ser final pero ida ya final: la ida se absorbe y
 *     la vuelta sale anotada con su resultado (`ida`, volteado a la
 *     orientación de la vuelta), para que el tablero pinte el
 *     global y juzgue el riesgo contra él. Nadie cae todavía.
 *   - Ida sin ser final (en vivo o por jugarse): la pareja pasa
 *     tal cual; el próximo partido del equipo es la ida.
 *
 * Parejas con un solo partido (cuadros a partido único, o una
 * vuelta que aún no se carga en ninguna quiniela) pasan intactas:
 * el camino las trata como siempre. Los partidos se agrupan por
 * pareja sin importar de qué quiniela vengan (quien llama ya
 * filtró los de la liguilla).
 */
export function colapsarIdaVuelta(
  partidos: PartidoCamino[],
  opciones?: OpcionesIdaVuelta
): PartidoCamino[] {
  const ordenados = porFecha(partidos);

  // Agrupar por pareja (sin orden) de equipos, en orden cronológico.
  const grupos = new Map<string, PartidoCamino[]>();
  for (const p of ordenados) {
    const clave = [
      normalizarNombreEquipo(p.equipoLocal),
      normalizarNombreEquipo(p.equipoVisitante),
    ]
      .sort()
      .join('|');
    const arr = grupos.get(clave) ?? [];
    arr.push(p);
    grupos.set(clave, arr);
  }

  const equipos = new Set<string>();
  for (const p of ordenados) {
    equipos.add(normalizarNombreEquipo(p.equipoLocal));
    equipos.add(normalizarNombreEquipo(p.equipoVisitante));
  }
  const rondasTotales = rondasDeCuadro(
    opciones?.cantidadEquipos && opciones.cantidadEquipos > 0
      ? opciones.cantidadEquipos
      : equipos.size
  );
  const posiciones = opciones?.posicionesSiembra ?? null;

  // Los grupos se resuelven en orden de DECISIÓN (la fecha de la
  // vuelta en las parejas; la del partido en los únicos), contando
  // victorias al vuelo: así, cuando una pareja se decide, ya se
  // sabe si es la final del torneo (ambos con rondasTotales-1
  // victorias) y si ahí aplica o no la ventaja de posición.
  interface Grupo {
    partidos: PartidoCamino[];
    decision: number;
  }
  const lista: Grupo[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length === 2) {
      const [ida, vuelta] = grupo;
      const tIda = tiempoDe(ida);
      const tVuelta = tiempoDe(vuelta);
      if (
        tIda !== Number.POSITIVE_INFINITY &&
        tVuelta !== Number.POSITIVE_INFINITY &&
        Math.abs(tVuelta - tIda) > DIEZ_DIAS_MS
      ) {
        // No son ida y vuelta de la misma llave (p. ej. el mismo
        // cruce en fase regular y en liguilla): pasan por separado.
        for (const p of grupo) lista.push({ partidos: [p], decision: tiempoDe(p) });
        continue;
      }
      lista.push({ partidos: [ida, vuelta], decision: tVuelta });
    } else {
      for (const p of grupo) lista.push({ partidos: [p], decision: tiempoDe(p) });
    }
  }
  lista.sort((a, b) => a.decision - b.decision);

  const victorias = new Map<string, number>();
  const contarSiDecidido = (p: PartidoCamino) => {
    if (!p.esFinal) return;
    const res = ganadorPartidoFinal(p);
    if (res) victorias.set(res.ganador, (victorias.get(res.ganador) ?? 0) + 1);
  };

  const salida: PartidoCamino[] = [];
  for (const grupo of lista) {
    if (grupo.partidos.length === 1) {
      salida.push(grupo.partidos[0]);
      contarSiDecidido(grupo.partidos[0]);
      continue;
    }
    const [ida, vuelta] = grupo.partidos;

    if (!vuelta.esFinal) {
      if (
        ida.esFinal &&
        ida.golesLocal !== null && ida.golesLocal !== undefined &&
        ida.golesVisitante !== null && ida.golesVisitante !== undefined
      ) {
        // La ida ya cayó: la vuelta carga su marcador, volteado a
        // la orientación de la vuelta (el local de la vuelta era el
        // visitante de la ida). La ida sola no decide nada.
        salida.push({
          ...vuelta,
          ida: {
            golesLocal: ida.golesVisitante,
            golesVisitante: ida.golesLocal,
          },
        });
      } else {
        salida.push(ida, vuelta);
      }
      continue;
    }

    // La vuelta es FINAL: la llave se decide aquí, por el global.
    const gl = vuelta.golesLocal;
    const gv = vuelta.golesVisitante;
    const il = ida.golesLocal;
    const iv = ida.golesVisitante;
    if (
      gl === null || gl === undefined ||
      gv === null || gv === undefined ||
      il === null || il === undefined ||
      iv === null || iv === undefined
    ) {
      // Sin los cuatro goles no hay global que calcular: manda la
      // vuelta sola, como partido único.
      salida.push(vuelta);
      contarSiDecidido(vuelta);
      continue;
    }
    // Global en la orientación de la vuelta.
    const aggL = gl + iv;
    const aggV = gv + il;
    const claveLocal = normalizarNombreEquipo(vuelta.equipoLocal);
    const claveVisitante = normalizarNombreEquipo(vuelta.equipoVisitante);
    const esFinalDelTorneo =
      (victorias.get(claveLocal) ?? 0) >= rondasTotales - 1 &&
      (victorias.get(claveVisitante) ?? 0) >= rondasTotales - 1;

    let resultadoReal: string | null;
    if (aggL > aggV) resultadoReal = 'L';
    else if (aggV > aggL) resultadoReal = 'V';
    else if (!esFinalDelTorneo && posiciones) {
      // Empate global en cuartos/semifinal: avanza el mejor
      // posicionado en la tabla.
      const posL = posiciones.get(claveLocal);
      const posV = posiciones.get(claveVisitante);
      if (posL !== undefined && posV !== undefined && posL !== posV) {
        resultadoReal = posL < posV ? 'L' : 'V';
      } else {
        resultadoReal = vuelta.resultadoReal ?? 'E';
      }
    } else {
      // Final del torneo (o sin posiciones): penales de la vuelta.
      resultadoReal = vuelta.resultadoReal ?? 'E';
    }

    const sintetico: PartidoCamino = {
      ...vuelta,
      golesLocal: aggL,
      golesVisitante: aggV,
      resultadoReal,
      esFinal: true,
    };
    salida.push(sintetico);
    contarSiDecidido(sintetico);
  }

  return porFecha(salida);
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

// ---------- Las llaves del cuadro (presentación en bracket) -----------------

/** Un lado de una llave: un equipo y los pases que lo tienen. */
export interface LadoLlaveCamino {
  /** Nombre normalizado del equipo (la identidad en todo el módulo). */
  clave: string;
  /** Nombre para mostrar (el del registro de equipos, si se conoce). */
  nombreEquipo: string;
  /** Pases con este equipo (en una sala de 8, normalmente uno). */
  pases: EstadoPaseCamino[];
  /**
   * Estado representativo del equipo (el de su primer pase): todos
   * los pases de un equipo comparten victorias, caída y próximo
   * partido, porque todo eso se deriva del equipo. Null si el equipo
   * no tiene pases (no debería pasar tras el sorteo).
   */
  representante: EstadoPaseCamino | null;
  /**
   * Su número de siembra (posición en la tabla; en el respaldo por
   * orden guardado, su posición en ese orden): la vista lo pinta
   * junto al escudo. Null si no se conoce ninguna posición.
   */
  posicionSiembra: number | null;
}

/** Una llave: dos lados que se enfrentan en una ronda. */
export interface LlaveCamino {
  /** Letra de la llave en la primera ronda (A, B, C…); null en otras. */
  letra: string | null;
  /** Índice de la ronda (0 = primera del cuadro). */
  ronda: number;
  lados: [LadoLlaveCamino, LadoLlaveCamino];
  /** Partido del cuadro que la define; null si salió de la siembra. */
  partidoId: string | null;
}

export interface LlavesCamino {
  /** Llaves por ronda, paralelo a las rondas del camino (sin Campeón). */
  porRonda: LlaveCamino[][];
  /** De dónde salieron las llaves de la primera ronda. */
  fuentePrimeraRonda: 'partidos' | 'siembra' | null;
  /**
   * La siembra usada salió de la TABLA de la liga (true) o del
   * orden guardado del bombo (false, el respaldo): la vista lo
   * distingue en la etiqueta y, si es el respaldo, muestra el aviso
   * de que la siembra es por orden guardado.
   */
  siembraDesdeTabla: boolean;
}

/** Opciones de siembra para calcularLlavesCamino. */
export interface OpcionesLlavesCamino {
  /**
   * Posición de siembra de cada equipo, por nombre normalizado
   * (la entrega resolverSiembra en bomboSorteo.ts). Sin ella, la
   * posición es el índice dentro del orden recibido.
   */
  posicionesSiembra?: Map<string, number> | null;
  /**
   * La siembra (el orden recibido) se derivó de la tabla de la
   * liga. Sin especificar se asume que sí, como antes.
   */
  siembraDesdeTabla?: boolean;
}

/**
 * Las llaves del cuadro para pintar el bracket. Pura y determinista:
 * no cambia estados, solo agrupa los ya calculados por
 * calcularCaminoFinal.
 *
 * @param camino      El resultado de calcularCaminoFinal.
 * @param partidos    Los mismos partidos del cuadro que se le dieron.
 * @param ordenBombo  Nombres de los equipos en ORDEN DE SIEMBRA
 *                    (1° primero): quien llama lo resuelve contra la
 *                    tabla con resolverSiembra (bomboSorteo.ts); el
 *                    orden guardado en quinielas.equipos_sorteo solo
 *                    se pasa como respaldo, marcado en `opciones`.
 *                    Sin orden no hay fuente de siembra y la primera
 *                    ronda solo puede salir de los partidos.
 * @param opciones    Posiciones de siembra y su procedencia (tabla u
 *                    orden guardado), para pintar el número de cada
 *                    lado y avisar cuando manda el respaldo.
 */
export function calcularLlavesCamino(
  camino: CaminoFinal,
  partidos: PartidoCamino[],
  ordenBombo?: string[] | null,
  opciones?: OpcionesLlavesCamino
): LlavesCamino {
  const rondas = camino.rondasTotales;
  const porRonda: LlaveCamino[][] = Array.from({ length: rondas }, () => []);

  // Pases y nombre visible por equipo.
  const pasesPorClave = new Map<string, EstadoPaseCamino[]>();
  const nombrePorClave = new Map<string, string>();
  for (const e of camino.pases) {
    const clave = normalizarNombreEquipo(e.pase.nombreEquipo);
    const arr = pasesPorClave.get(clave) ?? [];
    arr.push(e);
    pasesPorClave.set(clave, arr);
    if (!nombrePorClave.has(clave)) {
      nombrePorClave.set(clave, e.pase.nombreEquipo);
    }
  }
  if (ordenBombo) {
    for (const nombre of ordenBombo) {
      const clave = normalizarNombreEquipo(nombre);
      if (!nombrePorClave.has(clave)) nombrePorClave.set(clave, nombre);
    }
  }
  for (const p of partidos) {
    for (const nombre of [p.equipoLocal, p.equipoVisitante]) {
      const clave = normalizarNombreEquipo(nombre);
      if (!nombrePorClave.has(clave)) nombrePorClave.set(clave, nombre);
    }
  }

  // Equipos del bombo: los de los pases y los del orden guardado.
  const clavesBombo = new Set<string>(pasesPorClave.keys());
  if (ordenBombo) {
    for (const nombre of ordenBombo) {
      clavesBombo.add(normalizarNombreEquipo(nombre));
    }
  }

  // Posición de siembra por equipo: la que resuelva quien llama
  // (de la tabla); si no trae ninguna, el índice en el orden dado.
  const posicionPorClave: Map<string, number> | null =
    opciones?.posicionesSiembra ??
    (ordenBombo && ordenBombo.length > 0
      ? new Map(
          ordenBombo.map((n, i) => [normalizarNombreEquipo(n), i + 1])
        )
      : null);

  const ladoDe = (clave: string): LadoLlaveCamino => {
    const pases = pasesPorClave.get(clave) ?? [];
    return {
      clave,
      nombreEquipo: nombrePorClave.get(clave) ?? clave,
      pases,
      representante: pases[0] ?? null,
      posicionSiembra: posicionPorClave?.get(clave) ?? null,
    };
  };

  // Orden cronológico estable, el mismo de calcularCaminoFinal.
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

  /**
   * La ronda de un partido del cuadro, derivada de los estados: en
   * un partido FINAL con ganador, la ronda es donde cayó el perdedor
   * (equivale a las victorias del ganador menos una); en uno no
   * final, la etapa actual de sus equipos. Null si el partido no
   * empareja a dos equipos del bombo.
   */
  const rondaDePartido = (p: PartidoCamino): number | null => {
    const cl = normalizarNombreEquipo(p.equipoLocal);
    const cv = normalizarNombreEquipo(p.equipoVisitante);
    if (cl === cv || !clavesBombo.has(cl) || !clavesBombo.has(cv)) {
      return null;
    }
    const estL = pasesPorClave.get(cl)?.[0];
    const estV = pasesPorClave.get(cv)?.[0];
    if (p.esFinal) {
      const res = ganadorPartidoFinal(p);
      if (res) {
        const estPerdedor = res.perdedor === cl ? estL : estV;
        if (estPerdedor?.caida) return estPerdedor.caida.etapaIndice;
        const estGanador = res.ganador === cl ? estL : estV;
        if (estGanador) return Math.max(0, estGanador.victorias - 1);
        return null;
      }
    }
    if (estL && estV) return Math.min(estL.etapaIndice, estV.etapaIndice);
    if (estL) return estL.etapaIndice;
    if (estV) return estV.etapaIndice;
    return null;
  };

  // Llaves desde los partidos: por ronda, parejas sin repetir equipo
  // (la primera aparición manda; una vuelta o un cruce repetido se
  // ignora porque sus equipos ya quedaron tomados en esa ronda).
  const usadosPorRonda: Set<string>[] = Array.from(
    { length: rondas },
    () => new Set<string>()
  );
  for (const p of ordenados) {
    const r = rondaDePartido(p);
    if (r === null || r < 0 || r >= rondas) continue;
    const cl = normalizarNombreEquipo(p.equipoLocal);
    const cv = normalizarNombreEquipo(p.equipoVisitante);
    const usados = usadosPorRonda[r];
    if (usados.has(cl) || usados.has(cv)) continue;
    usados.add(cl);
    usados.add(cv);
    porRonda[r].push({
      letra: null,
      ronda: r,
      lados: [ladoDe(cl), ladoDe(cv)],
      partidoId: p.id,
    });
  }

  // Primera ronda: los partidos mandan SOLO si cubren a todo el
  // bombo; si no, se descarta lo parcial y se siembra por el orden
  // recibido (1° vs último, 2° vs penúltimo, …: en el cuadro de 8,
  // 1v8, 2v7, 3v6, 4v5). Ese orden es la siembra resuelta contra la
  // tabla por quien llama (o su respaldo marcado, el guardado).
  let fuentePrimeraRonda: 'partidos' | 'siembra' | null = null;
  const clavesEnLlaves0 = new Set<string>(
    porRonda[0].flatMap((l) => l.lados.map((s) => s.clave))
  );
  if (
    porRonda[0].length > 0 &&
    clavesBombo.size >= 2 &&
    clavesEnLlaves0.size === clavesBombo.size
  ) {
    fuentePrimeraRonda = 'partidos';
  } else if (ordenBombo && ordenBombo.length >= 2 && ordenBombo.length % 2 === 0) {
    const claves = ordenBombo.map((n) => normalizarNombreEquipo(n));
    const unicas = new Set(claves);
    if (
      unicas.size === claves.length &&
      claves.every((c) => clavesBombo.has(c))
    ) {
      const n = claves.length;
      const llavesSiembra: LlaveCamino[] = [];
      for (let i = 0; i < n / 2; i++) {
        llavesSiembra.push({
          letra: null,
          ronda: 0,
          lados: [ladoDe(claves[i]), ladoDe(claves[n - 1 - i])],
          partidoId: null,
        });
      }
      porRonda[0] = llavesSiembra;
      fuentePrimeraRonda = 'siembra';
    }
  }

  // Letras A, B, C… para las llaves de la primera ronda.
  porRonda[0].forEach((llave, i) => {
    llave.letra = String.fromCharCode(65 + i);
  });

  return {
    porRonda,
    fuentePrimeraRonda,
    siembraDesdeTabla: opciones?.siembraDesdeTabla ?? true,
  };
}
