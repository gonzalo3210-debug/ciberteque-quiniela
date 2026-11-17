// src/lib/insignias.ts
//
// INSIGNIAS Y RACHAS — cálculo PURO del historial de un jugador.
//
// Recibe los boletos del jugador en quinielas CERRADAS de modos por
// puntos (clásica y marcador exacto) ya calificados —posición final
// con lugares compartidos, grupo de empate, aciertos exactos y de
// tendencia por boleto— y devuelve el catálogo de insignias con su
// estado, la racha actual de quinielas cobrando premio y los conteos
// base. Sin red y sin base de datos: el armado de los boletos vive en
// src/hooks/useInsignias.ts usando la tabla oficial compartida
// (src/lib/proyeccion.ts).
//
// Reglas:
//  - SORTEO NO CUENTA: su lógica es de supervivencia por equipo
//    asignado, no de puntos. Las quinielas de sorteo ni suman ni
//    rompen rachas: este módulo las ignora aunque vengan en el
//    historial (el armado ya las excluye; el filtro aquí es defensa).
//  - Los conteos de participación (Campeón, Tricampeón, Podio,
//    Constante, Veterano y la racha) son por QUINIELA DISTINTA: si el
//    jugador compró varios boletos en la misma jornada, cuenta su
//    mejor boleto (campeón si alguno quedó 1°, cobró si alguno
//    cobró). Francotirador y Quiniela Perfecta sí son por boleto:
//    basta que UN boleto de la jornada cumpla la hazaña.
//  - "Cobró premio" se deduce de la posición y del tipo de
//    premiación, replicando el reparto de la app
//    (src/utils/calculadoraPremios.ts): los grupos de empate exacto
//    (mismos puntos y misma diferencia de goles) se reparten la suma
//    de los porcentajes de los lugares que ocupan, así que un grupo
//    cobra si su lugar de inicio cae dentro de los lugares pagados:
//    'unico' → 1°, 'top2' → 1°–2°, 'top3' → 1°–3°. En promos:
//    'promo_unico' → el grupo 1 gana un crédito; 'promo_top2' → el
//    grupo 1 y, solo si el grupo 1 tuvo un único boleto, el grupo 2.
//  - La racha cuenta quinielas seguidas cobrando premio entre las
//    que el jugador SÍ jugó, en orden cronológico (fecha_cierre).
//    Una quiniela que no jugó no aparece en su historial y por tanto
//    no la rompe; una que jugó y no cobró, sí.

export interface BoletoHistorial {
  quinielaId: string;
  nombreJornada: string;
  /** 'clasica' | 'marcador_exacto' | 'sorteo' (sorteo se ignora). */
  modalidad: string | null;
  /** 'unico' | 'top2' | 'top3' | 'promo_unico' | 'promo_top2'. */
  tipoPremiacion: string | null;
  /** ISO de cierre de la quiniela: ordena el historial. */
  fechaCierre: string | null;
  /** Posición final del boleto (empates comparten posición). */
  posicion: number;
  /** Ordinal del grupo de empate del boleto (1 = primer grupo). */
  nivel: number;
  /** Cuántos boletos comparten el 1er lugar de esa quiniela. */
  tamanoGrupo1: number;
  puntos: number;
  /** Pronósticos con marcador exacto acertado en el boleto. */
  exactos: number;
  /** Pronósticos con puntos (exacto o solo tendencia). */
  aciertos: number;
  /** Total de pronósticos del boleto. */
  totalPronosticos: number;
}

export type IdInsignia =
  | 'campeon'
  | 'tricampeon'
  | 'francotirador'
  | 'perfecta'
  | 'en_racha'
  | 'constante'
  | 'veterano'
  | 'podio';

export interface DefinicionInsignia {
  id: IdInsignia;
  icono: string;
  nombre: string;
  /** Frase corta que se muestra cuando ya se ganó. */
  descripcion: string;
  /** Requisito en texto, para las que faltan. */
  requisito: string;
  /** Meta numérica del contador de progreso. */
  meta: number;
  /** Mayor = más rara; ordena los iconos del ranking. */
  rareza: number;
}

export interface EstadoInsignia extends DefinicionInsignia {
  ganada: boolean;
  /** Avance actual hacia la meta (campeonatos, quinielas, etc.). */
  progreso: number;
  /** Jornada donde se ganó (null si aún no). */
  quinielaNombre: string | null;
  /** fecha_cierre de esa jornada (null si aún no). */
  fecha: string | null;
}

export interface ResultadoInsignias {
  /** Catálogo completo, en orden de vitrina. */
  insignias: EstadoInsignia[];
  /** Solo las ganadas. */
  ganadas: EstadoInsignia[];
  /** Quinielas seguidas cobrando premio, contando desde la última jugada. */
  rachaActual: number;
  /** Quinielas distintas jugadas (cerradas, por puntos). */
  quinielasJugadas: number;
  /** Quinielas distintas ganadas (algún boleto en 1°). */
  campeonatos: number;
  /** Quinielas distintas terminadas en lugar de premio. */
  podios: number;
}

export const CATALOGO_INSIGNIAS: DefinicionInsignia[] = [
  {
    id: 'campeon',
    icono: '🏆',
    nombre: 'Campeón',
    descripcion: 'Ganaste una quiniela del Club.',
    requisito: 'Gana 1 quiniela (1er lugar, también compartido).',
    meta: 1,
    rareza: 5,
  },
  {
    id: 'tricampeon',
    icono: '👑',
    nombre: 'Tricampeón',
    descripcion: 'Tres quinielas ganadas. La corona pesa.',
    requisito: 'Gana 3 quinielas.',
    meta: 3,
    rareza: 7,
  },
  {
    id: 'francotirador',
    icono: '🎯',
    nombre: 'Francotirador',
    descripcion: 'Puntería fina: 5+ marcadores exactos en una quiniela.',
    requisito: 'Acerta 5 o más marcadores exactos en una sola quiniela.',
    meta: 5,
    rareza: 6,
  },
  {
    id: 'perfecta',
    icono: '💎',
    nombre: 'Quiniela Perfecta',
    descripcion: 'Pleno total: acertaste todos los partidos de una quiniela.',
    requisito: 'Acerta TODOS los partidos de una quiniela (en marcador exacto, todos exactos).',
    meta: 1,
    rareza: 8,
  },
  {
    id: 'en_racha',
    icono: '🔥',
    nombre: 'En Racha',
    descripcion: 'Tres quinielas seguidas cobrando premio.',
    requisito: 'Cobra premio en 3 quinielas seguidas de las que juegues.',
    meta: 3,
    rareza: 4,
  },
  {
    id: 'podio',
    icono: '🥈',
    nombre: 'Podio Habitual',
    descripcion: 'Cinco veces en lugares de premio. Cliente frecuente del podio.',
    requisito: 'Termina en lugares de premio 5 veces.',
    meta: 5,
    rareza: 3,
  },
  {
    id: 'constante',
    icono: '🎟️',
    nombre: 'Constante',
    descripcion: 'Diez quinielas jugadas. Aquí se viene a jugar siempre.',
    requisito: 'Juega 10 quinielas.',
    meta: 10,
    rareza: 1,
  },
  {
    id: 'veterano',
    icono: '🛡️',
    nombre: 'Veterano',
    descripcion: 'Veinticinco quinielas jugadas. De los fundadores del Club.',
    requisito: 'Juega 25 quinielas.',
    meta: 25,
    rareza: 2,
  },
];

/** ¿Este boleto cobró premio según su posición y la premiación? */
export function boletoCobroPremio(boleto: BoletoHistorial): boolean {
  const tipo = (boleto.tipoPremiacion || 'unico').toLowerCase();
  if (tipo === 'top2') return boleto.posicion <= 2;
  if (tipo === 'top3') return boleto.posicion <= 3;
  if (tipo === 'promo_unico') return boleto.nivel === 1;
  if (tipo === 'promo_top2') {
    return (
      boleto.nivel === 1 ||
      (boleto.nivel === 2 && boleto.tamanoGrupo1 === 1)
    );
  }
  // 'unico' y cualquier valor desconocido: solo el 1er lugar cobra.
  return boleto.posicion === 1;
}

/** ¿Este boleto es una quiniela perfecta según su modalidad? */
export function boletoEsPerfecto(boleto: BoletoHistorial): boolean {
  if (boleto.totalPronosticos <= 0) return false;
  if ((boleto.modalidad || '').toLowerCase() === 'marcador_exacto') {
    return boleto.exactos === boleto.totalPronosticos;
  }
  return boleto.aciertos === boleto.totalPronosticos;
}

interface Participacion {
  quinielaId: string;
  nombreJornada: string;
  fechaCierre: string | null;
  campeon: boolean;
  cobro: boolean;
  mejorExactos: number;
  perfecta: boolean;
}

/**
 * Calcula insignias y racha de un jugador desde sus boletos en
 * quinielas cerradas por puntos. Historial vacío → sin insignias y
 * racha 0.
 */
export function calcularInsignias(
  historial: BoletoHistorial[]
): ResultadoInsignias {
  // Agrupar por quiniela (la participación vale por jornada, con el
  // mejor boleto) e ignorar sorteo.
  const porQuiniela = new Map<string, Participacion & { orden: number }>();
  historial.forEach((boleto, idx) => {
    if ((boleto.modalidad || '').toLowerCase() === 'sorteo') return;
    let p = porQuiniela.get(boleto.quinielaId);
    if (!p) {
      p = {
        quinielaId: boleto.quinielaId,
        nombreJornada: boleto.nombreJornada,
        fechaCierre: boleto.fechaCierre,
        campeon: false,
        cobro: false,
        mejorExactos: 0,
        perfecta: false,
        orden: idx,
      };
      porQuiniela.set(boleto.quinielaId, p);
    }
    if (boleto.posicion === 1) p.campeon = true;
    if (boletoCobroPremio(boleto)) p.cobro = true;
    if (boleto.exactos > p.mejorExactos) p.mejorExactos = boleto.exactos;
    if (boletoEsPerfecto(boleto)) p.perfecta = true;
  });

  // Orden cronológico por fecha_cierre; sin fecha, al final y en el
  // orden en que llegaron (historial estable).
  const participaciones = [...porQuiniela.values()].sort((a, b) => {
    const ta = a.fechaCierre ? new Date(a.fechaCierre).getTime() : NaN;
    const tb = b.fechaCierre ? new Date(b.fechaCierre).getTime() : NaN;
    if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
    if (!isNaN(ta) && isNaN(tb)) return -1;
    if (isNaN(ta) && !isNaN(tb)) return 1;
    return a.orden - b.orden;
  });

  const quinielasJugadas = participaciones.length;
  const campeonatos = participaciones.filter((p) => p.campeon).length;
  const podios = participaciones.filter((p) => p.cobro).length;
  const maxExactos = participaciones.reduce(
    (max, p) => Math.max(max, p.mejorExactos),
    0
  );

  // Racha actual: desde la última jugada hacia atrás mientras cobre.
  let rachaActual = 0;
  for (let i = participaciones.length - 1; i >= 0; i--) {
    if (!participaciones[i].cobro) break;
    rachaActual++;
  }

  // Primera vez que cada hazaña se cumplió (para fecha y jornada).
  const primerCampeonato = participaciones.find((p) => p.campeon) || null;
  let tercerCampeonato: Participacion | null = null;
  let quintoPodio: Participacion | null = null;
  let rachaDeTres: Participacion | null = null;
  {
    let triunfos = 0;
    let cobros = 0;
    let racha = 0;
    for (const p of participaciones) {
      if (p.campeon) {
        triunfos++;
        if (triunfos === 3) tercerCampeonato = p;
      }
      if (p.cobro) {
        cobros++;
        racha++;
        if (cobros === 5) quintoPodio = p;
        if (racha === 3 && !rachaDeTres) rachaDeTres = p;
      } else {
        racha = 0;
      }
    }
  }
  const primeraPerfecta = participaciones.find((p) => p.perfecta) || null;
  const primerFrancotirador =
    participaciones.find((p) => p.mejorExactos >= 5) || null;
  const decimaJugada = participaciones[9] || null;
  const vigesimoquintaJugada = participaciones[24] || null;

  const datos: Record<
    IdInsignia,
    { progreso: number; ganadaEn: Participacion | null }
  > = {
    campeon: {
      progreso: campeonatos,
      ganadaEn: campeonatos >= 1 ? primerCampeonato : null,
    },
    tricampeon: {
      progreso: campeonatos,
      ganadaEn: campeonatos >= 3 ? tercerCampeonato : null,
    },
    francotirador: {
      progreso: maxExactos,
      ganadaEn: primerFrancotirador,
    },
    perfecta: {
      progreso: primeraPerfecta ? 1 : 0,
      ganadaEn: primeraPerfecta,
    },
    en_racha: {
      progreso: rachaDeTres ? 3 : rachaActual,
      ganadaEn: rachaDeTres,
    },
    podio: {
      progreso: podios,
      ganadaEn: podios >= 5 ? quintoPodio : null,
    },
    constante: {
      progreso: quinielasJugadas,
      ganadaEn: quinielasJugadas >= 10 ? decimaJugada : null,
    },
    veterano: {
      progreso: quinielasJugadas,
      ganadaEn: quinielasJugadas >= 25 ? vigesimoquintaJugada : null,
    },
  };

  const insignias: EstadoInsignia[] = CATALOGO_INSIGNIAS.map((def) => {
    const d = datos[def.id];
    return {
      ...def,
      ganada: d.ganadaEn !== null,
      progreso: Math.min(d.progreso, def.meta),
      quinielaNombre: d.ganadaEn ? d.ganadaEn.nombreJornada : null,
      fecha: d.ganadaEn ? d.ganadaEn.fechaCierre : null,
    };
  });

  return {
    insignias,
    ganadas: insignias.filter((i) => i.ganada),
    rachaActual,
    quinielasJugadas,
    campeonatos,
    podios,
  };
}

/**
 * Las insignias que se muestran junto al nombre en el ranking: las
 * ganadas, primero las más raras y en empate de rareza las más
 * recientes, hasta `max`.
 */
export function topInsignias(
  resultado: ResultadoInsignias | null | undefined,
  max = 3
): EstadoInsignia[] {
  if (!resultado) return [];
  return [...resultado.ganadas]
    .sort((a, b) => {
      if (b.rareza !== a.rareza) return b.rareza - a.rareza;
      const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
      const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
      return tb - ta;
    })
    .slice(0, max);
}
