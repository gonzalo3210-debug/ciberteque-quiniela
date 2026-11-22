// src/lib/quinielaSemana.ts
//
// Lógica PURA para elegir LA QUINIELA DE LA SEMANA (decisión de
// Gonzalo, 2026-11-22): cuando hay varias quinielas abiertas a la
// vez — la normal de cada semana más las especiales de $100 y $200,
// casi siempre de sorteo — la que aparece POR DEFECTO al entrar al
// módulo Jugar y a la pestaña de Partidos es LA DE LA SEMANA,
// porque ahí quiere que se junte la mayor cantidad de jugadores.
// Las demás NO se ocultan: quedan en el selector, ordenadas con
// esta misma preferencia.
//
// La regla, en orden:
//   1. Una quiniela REGULAR (modalidad distinta de 'sorteo') gana
//      a una de sorteo. La de sorteo solo es la de la semana si no
//      hay ninguna regular abierta.
//   2. Entre las de la misma clase, gana la de MÁS partidos (la
//      semanal trae 10; una especial regular trae menos).
//   3. Desempate: la de fecha_cierre más próxima.
//   4. Si todo empata, se conserva el orden en que venían (el sort
//      de JS es estable), que es el de la consulta: cierre más
//      próximo primero.
//
// Sin red ni base: los hooks ya traen modalidad, fecha_cierre y los
// partidos de cada quiniela; aquí solo se comparan esos rasgos.

/** Los datos mínimos de una quiniela para aplicar la preferencia. */
export interface RasgosPreferenciaQuiniela {
  modalidad?: string | null
  fechaCierre?: string | number | Date | null
  cantidadPartidos: number
}

function tiempoCierre(fecha: RasgosPreferenciaQuiniela['fechaCierre']): number {
  if (fecha === null || fecha === undefined) return Number.POSITIVE_INFINITY
  const t = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime()
  // Una fecha inválida nunca gana el desempate por cierre.
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/**
 * Comparador de la preferencia de la semana: negativo si `a` debe
 * ir antes que `b`, positivo si va después, 0 si empatan (y gana el
 * orden original).
 */
export function compararPreferenciaSemana(
  a: RasgosPreferenciaQuiniela,
  b: RasgosPreferenciaQuiniela
): number {
  const aSorteo = a.modalidad === 'sorteo' ? 1 : 0
  const bSorteo = b.modalidad === 'sorteo' ? 1 : 0
  if (aSorteo !== bSorteo) return aSorteo - bSorteo

  if (a.cantidadPartidos !== b.cantidadPartidos) {
    return b.cantidadPartidos - a.cantidadPartidos
  }

  const ta = tiempoCierre(a.fechaCierre)
  const tb = tiempoCierre(b.fechaCierre)
  if (ta !== tb) return ta - tb

  return 0
}

/**
 * Devuelve una copia de la lista ordenada por la preferencia de la
 * semana (la de la semana primero). No muta la lista original ni
 * quita elementos: todas las quinielas siguen en el selector.
 */
export function ordenarPorPreferenciaSemana<T>(
  items: readonly T[],
  rasgos: (item: T) => RasgosPreferenciaQuiniela
): T[] {
  return [...items].sort((x, y) =>
    compararPreferenciaSemana(rasgos(x), rasgos(y))
  )
}

/** La quiniela de la semana de la lista, o null si no hay ninguna. */
export function quinielaDeLaSemana<T>(
  items: readonly T[],
  rasgos: (item: T) => RasgosPreferenciaQuiniela
): T | null {
  const ordenadas = ordenarPorPreferenciaSemana(items, rasgos)
  return ordenadas.length > 0 ? ordenadas[0] : null
}
