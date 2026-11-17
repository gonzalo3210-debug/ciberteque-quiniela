// src/lib/encuestaFormato.ts
//
// Formato de la línea compacta de probabilidades en la cartelera al
// JUGAR (paquete v20): convierte los porcentajes 1-X-2 de la encuesta
// (The Odds API, vía /api/encuesta) en los tres segmentos L · E · V
// que se pintan junto a las opciones del boleto, con el favorito
// marcado. Archivo PURO y sin dependencias: sirve en el cliente y en
// las pruebas de scripts/.

/** Porcentajes 1-X-2 tal como los devuelve la encuesta (0–100). */
export interface ProbabilidadesLEV {
  local: number;
  empate: number;
  visitante: number;
}

export interface SegmentoProbabilidad {
  clave: 'L' | 'E' | 'V';
  /** Porcentaje entero para mostrar (redondeado). */
  pct: number;
  /** ¿Es la opción con mayor probabilidad? (puede haber empate). */
  esMayor: boolean;
}

/**
 * Los tres segmentos en orden L, E, V. Los porcentajes se redondean
 * a enteros para la línea compacta (la vista del partido conserva
 * los decimales); por el redondeo la suma puede dar 99 o 101.
 */
export function segmentosProbabilidades(
  p: ProbabilidadesLEV
): SegmentoProbabilidad[] {
  const crudos: { clave: SegmentoProbabilidad['clave']; valor: number }[] = [
    { clave: 'L', valor: p.local },
    { clave: 'E', valor: p.empate },
    { clave: 'V', valor: p.visitante },
  ];
  const mayor = Math.max(p.local, p.empate, p.visitante);
  return crudos.map((s) => ({
    clave: s.clave,
    pct: Math.round(s.valor),
    esMayor: s.valor === mayor,
  }));
}

/** La línea en texto plano: "45% · 28% · 27%" (orden L · E · V). */
export function textoProbabilidades(p: ProbabilidadesLEV): string {
  return segmentosProbabilidades(p)
    .map((s) => `${s.pct}%`)
    .join(' · ');
}
