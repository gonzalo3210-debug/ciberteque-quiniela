// src/lib/sports/ligasSorteo.ts
//
// LIGAS ELEGIBLES PARA EL MODO SORTEO (selector del bombo, pedido de
// Gonzalo del 2026-11-22): la modalidad de supervivencia NO es solo
// de Liga MX, pero el bombo solo se puede JALAR de ligas que se
// juegan con LIGUILLA — fase regular (o de grupos) y después llaves
// de eliminación de las que salen 8 equipos en cuartos. Las de
// torneo regular puro (Premier League, La Liga, Serie A, Bundesliga,
// Ligue 1) NO entran al selector: ahí no hay liguilla que jalar.
//
// La lista sale de la VERIFICACIÓN CONTRA LA API REAL de
// TheSportsDB (2026-11-22), no de memoria. Para cada candidata se
// revisó: (1) que lookuptable devuelva UNA tabla general usable por
// /api/tabla-liga (sin tabla única no hay top 8 confiable), (2) que
// eventsseason liste la fase de eliminación además de la regular, y
// (3) que su fase final sea de cuartos con 8 equipos. Resultado:
//
//   ✅ Liga MX (4350): tabla de 18, 17 rondas regulares; la liguilla
//      viene con intRound 0 o códigos altos (verificado 2025-2026).
//   ✅ Liga MX Femenil (5206): tabla de 18, 17 jornadas; su liguilla
//      (12 eventos con intRound 0) SÍ está en la API y la detección
//      por el cuadro extrajo sus 4 llaves reales del Apertura.
//   ✅ Liga de Expansión MX (4654): tabla de 16, 15 jornadas; 14
//      eventos con intRound 0 (repechaje + cuartos + semis) y la
//      detección extrajo sus 4 llaves reales del Apertura.
//
//   ❌ MLS (4346): su tabla viene COMBINADA de las dos conferencias
//      (30 equipos; clasifican 9 por conferencia, así que un top 8
//      combinado no representa ninguna fase) y eventsseason solo
//      devolvió 18 eventos sueltos: sin material para jalar.
//   ❌ Champions (4480), UEFA Nations League (4490), Liga de
//      Naciones Concacaf (5280) y Copa Libertadores (4501): son de
//      grupos/fase de liga SIN tabla general única en el proveedor
//      (la app la calcula por grupos); sin tabla única no hay top 8
//      ni cuadro contra el cual reconocer las llaves.
//   ❌ Superliga de Grecia (4336): su fase final es una ronda de
//      campeonato (mini-liga de 4), no llaves de eliminación de 8.
//   ❌ Honduras (4818) y Panamá (4819): su liguilla es de 6 equipos
//      (repechaje + semifinales), sin cuartos de 8.
//   ❌ Ecuador (4686): su segunda fase son hexagonales (la API los
//      numera como rondas normales), no eliminación directa.
//   ❌ Perú (4688): sus playoffs son de semifinales, sin cuartos
//      de 8, y la API no lista eventos fuera de la fase regular.
//   ❌ El Salvador (4816) y Guatemala (4817): tienen liguilla real,
//      pero la API no lista NINGÚN evento de su fase de eliminación
//      (El Salvador: solo las 22 rondas regulares) o ni siquiera
//      responde la ficha (Guatemala): fase no verificable = fuera.
//
// Archivo PURO (sin imports): lo usan el cliente y las pruebas de
// Node, igual que leagues.ts.

export interface LigaSorteo {
  /** ID de la liga en el proveedor (TheSportsDB). */
  providerId: string;
  /** Nombre para mostrar en el selector. */
  name: string;
  /**
   * Jornadas de su fase regular: los partidos con ronda mayor (o
   * con los códigos especiales del proveedor) son de liguilla. Es el
   * parámetro que usa la detección de llaves de bomboSorteo.ts.
   */
  rondasRegulares: number;
}

export const LIGAS_SORTEO: LigaSorteo[] = [
  { providerId: '4350', name: 'Liga MX', rondasRegulares: 17 },
  { providerId: '5206', name: 'Liga MX Femenil', rondasRegulares: 17 },
  { providerId: '4654', name: 'Liga de Expansión MX', rondasRegulares: 15 },
];

/** La liga del bombo por defecto: la de siempre, Liga MX. */
export const LIGA_SORTEO_DEFECTO: LigaSorteo = LIGAS_SORTEO[0];

const POR_ID = new Map(LIGAS_SORTEO.map((l) => [l.providerId, l]));

/** Liga elegible para el sorteo por su ID (undefined si no lo es). */
export function getLigaSorteo(providerId: string): LigaSorteo | undefined {
  return POR_ID.get(providerId);
}
