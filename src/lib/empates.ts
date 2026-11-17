// src/lib/empates.ts
//
// 🤝 Empates exactos y premios repartidos — UNA sola verdad.
//
// Un empate exacto es: mismos puntos Y misma diferencia contra el
// total de goles real. Quienes empatan comparten el lugar, y si ese
// lugar (o alguno de los que el grupo ocupa) tiene premio en dinero,
// el premio se reparte entre ellos. Esta es exactamente la regla que
// aplica la liquidación (calcularPremios en
// src/utils/calculadoraPremios.ts, que agrupa por empates exactos y
// suma los porcentajes de los lugares que el grupo ocupa); este
// módulo la espejea para poder PINTARLA en el ranking sin recalcular
// premios: si mañana cambia la calculadora, hay que cambiar esto.
//
// Centinela de "sin goles reales": cuando la quiniela aún no tiene
// goles_totales_real, la diferencia vale 999 (diferenciaGoles en
// src/lib/proyeccion.ts) o 9999 según la pantalla. Una diferencia
// centinela NO es un empate: nadie comparte lugar por ella.

/** Diferencias mayores o iguales a esto son centinela, no un dato. */
export const GOLES_DIFF_CENTINELA = 999;

export interface FilaRankingEmpate {
  id: string;
  puntos: number;
  golesDiff: number;
}

export interface MarcaEmpate {
  /** El jugador comparte su lugar con al menos otro (empate exacto). */
  compartido: boolean;
  /**
   * El lugar compartido está en zona de premio en dinero y el premio
   * se divide entre los empatados (modos unico/top2/top3). En modos
   * promo cada empatado gana su crédito completo: NO es "repartido".
   */
  premioRepartido: boolean;
}

/** ¿Dos filas tienen un empate exacto (puntos y diferencia reales)? */
export function esEmpateExacto(
  a: FilaRankingEmpate,
  b: FilaRankingEmpate
): boolean {
  return (
    a.puntos === b.puntos &&
    a.golesDiff === b.golesDiff &&
    a.golesDiff < GOLES_DIFF_CENTINELA &&
    b.golesDiff < GOLES_DIFF_CENTINELA
  );
}

/**
 * Agrupa filas CONSECUTIVAS con empate exacto. La entrada debe venir
 * en el orden oficial de la tabla (puntos desc, diferencia asc), como
 * la entregan calcularTabla / el ranking de Posiciones: los empatados
 * siempre quedan pegados.
 */
export function gruposDeEmpate<T extends FilaRankingEmpate>(
  filasOrdenadas: T[]
): T[][] {
  const grupos: T[][] = [];
  for (const fila of filasOrdenadas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && esEmpateExacto(ultimo[0], fila)) {
      ultimo.push(fila);
    } else {
      grupos.push([fila]);
    }
  }
  return grupos;
}

/**
 * Porcentaje de la bolsa por lugar según el tipo de premiación —
 * espejo de calcularPremios. Los modos promo devuelven [] porque no
 * reparten dinero (dan créditos completos por ganador).
 */
export function porcentajesPorLugar(tipoPremiacion: string | null | undefined): number[] {
  switch ((tipoPremiacion || '').toLowerCase()) {
    case 'unico':
      return [1.0];
    case 'top2':
      return [0.7, 0.3];
    case 'top3':
      return [0.6, 0.25, 0.15];
    default:
      return [];
  }
}

/**
 * Marca, por id de fila (boleto), si comparte lugar y si su premio en
 * dinero se reparte. Réplica fiel de la agrupación de
 * calcularPremios: un grupo ocupa tantos lugares como miembros
 * tenga; si la suma de porcentajes de esos lugares es mayor a cero,
 * el grupo cobra y —si son 2 o más— el premio se reparte.
 */
export function marcarEmpates(
  filasOrdenadas: FilaRankingEmpate[],
  tipoPremiacion: string | null | undefined
): Map<string, MarcaEmpate> {
  const marcas = new Map<string, MarcaEmpate>();
  const porcentajes = porcentajesPorLugar(tipoPremiacion);
  const grupos = gruposDeEmpate(filasOrdenadas);

  let lugarActual = 0; // índice 0 = primer lugar
  for (const grupo of grupos) {
    let porcentajeGrupo = 0;
    for (let j = 0; j < grupo.length; j++) {
      if (lugarActual + j < porcentajes.length) {
        porcentajeGrupo += porcentajes[lugarActual + j];
      }
    }
    const compartido = grupo.length > 1;
    const premioRepartido = compartido && porcentajeGrupo > 0;
    for (const fila of grupo) {
      marcas.set(fila.id, { compartido, premioRepartido });
    }
    lugarActual += grupo.length;
  }
  return marcas;
}

/** Atajo: solo los ids cuyo premio en dinero se reparte. */
export function idsConPremioRepartido(
  filasOrdenadas: FilaRankingEmpate[],
  tipoPremiacion: string | null | undefined
): Set<string> {
  const ids = new Set<string>();
  for (const [id, marca] of marcarEmpates(filasOrdenadas, tipoPremiacion)) {
    if (marca.premioRepartido) ids.add(id);
  }
  return ids;
}
