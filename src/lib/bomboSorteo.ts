// src/lib/bomboSorteo.ts
//
// Lógica PURA para JALAR LOS EQUIPOS DEL BOMBO del modo sorteo
// (decisión de Gonzalo, 2026-11-22): al crear la quiniela de liguilla,
// el bombo de 8 equipos ya no se tiene que escoger a mano escudo por
// escudo. La liga se elige en el selector del bombo (solo ligas con
// liguilla: ver src/lib/sports/ligasSorteo.ts) y la fuente, en orden
// de preferencia, es:
//
//   1. CUARTOS: si el proveedor ya lista los partidos de cuartos de
//      final de la liguilla de ESA liga, los 8 equipos salen de esos
//      4 partidos.
//   2. TABLA: si todavía no hay liguilla publicada, el bombo es el
//      top 8 de la tabla general de esa liga — LA MISMA que muestra
//      Posiciones (la ruta /api/tabla-liga ya la entrega recalculada
//      con el en vivo y la retención de 24 h de finales recientes;
//      aquí solo se toman sus primeras 8 filas, sin recalcular nada).
//
// EL ORDEN QUE SE GUARDA (quinielas.equipos_sorteo) es SIEMPRE el de
// SIEMBRA: 1° a 8° según la tabla, venga el bombo de la fuente que
// venga. Con la fuente de cuartos, los equipos detectados en las
// llaves se REORDENAN por su posición en la tabla antes de guardar.
// Así el orden guardado es la siembra y el tablero «Camino a la
// final» (src/lib/caminoFinal.ts) puede armar las llaves
// posicionales 1v8, 2v7, 3v6 y 4v5, que reproducen las llaves
// reales de la liguilla.
//
// EXCEPCIÓN REAL (2026-11-22): el llenado A MANO guarda el orden de
// selección — desmarcar un equipo y volverlo a marcar lo manda al
// final del arreglo — y ese orden NO es la siembra. Por eso el
// tablero ya no se fía del orden guardado: deriva la siembra de la
// tabla al mostrar (resolverSiembra, abajo), y el creador además
// reordena por tabla al guardar cuando la tabla está disponible.
//
// Los 8 equipos de liguilla ya no cambian (son los primeros 8 de la
// tabla); lo que puede variar es su posición, y con ella las llaves.
// Por eso la fuente de cuartos, cuando existe, manda sobre la tabla.
//
// CÓMO SE DETECTAN LOS CUARTOS (verificado contra la API real de
// TheSportsDB, temporadas 2025-2026 y 2026-2027 de la liga 4350):
// los partidos de liguilla NO traen ronda de fase regular: vienen con
// intRound 0 (play-in, cuartos, semifinales y final de ida del
// Apertura) o códigos altos (125, 200 en el Clausura), mientras la
// fase regular son las rondas 1..17. Como el play-in y las rondas
// posteriores comparten esos códigos, las llaves de cuartos se
// reconocen por el CUADRO, no por el código:
//   - ambos equipos están entre los 10 primeros de la tabla (la zona
//     que pelea liguilla: 6 directos + 4 de play-in);
//   - al menos uno es de los 6 directos (el play-in nunca enfrenta a
//     un directo, así que sus partidos quedan fuera solos);
//   - cada equipo aparece en UNA sola llave (la vuelta es la misma
//     pareja invertida y las rondas siguientes reusan equipos: se
//     ignoran porque sus equipos ya quedaron tomados).
// Solo si se juntan EXACTAMENTE 4 llaves con 8 equipos distintos se
// acepta la fuente; con cualquier duda se cae a la tabla, que es la
// fuente segura.
//
// El cruce al registro de equipos del Club (quinielas.equipos_sorteo
// guarda IDs, no nombres) usa el MISMO emparejamiento de siempre:
// nombre normalizado contra el nombre del proveedor o contra su
// nombre en español (capa nombresES). Como este archivo debe poder
// probarse en Node sin alias de rutas, el resolvedor de nombres en
// español se RECIBE como parámetro: la app pasa el verdadero
// (nombreEquipoES) y las pruebas también.
//
// Archivo PURO (solo tipos importados): sirve en cliente y en
// pruebas de Node.

import type { SportsFixture, StandingRow } from './sports/types';

/** Resolvedor de nombre en español (la app pasa nombreEquipoES). */
export type ResolverNombreES = (
  nombreOriginal: string,
  teamProviderId?: string | null
) => string;

/** Un equipo tal como viene de la fuente (tabla o partidos). */
export interface EquipoFuenteBombo {
  /** Nombre tal como lo da el proveedor (p. ej. "CD Guadalajara"). */
  nombre: string;
  /** ID del equipo en el proveedor, si la fuente lo trae. */
  teamProviderId: string | null;
}

export type FuenteBombo = 'cuartos' | 'tabla';

export interface BomboSugerido {
  fuente: FuenteBombo;
  /**
   * Los equipos en ORDEN DE SIEMBRA (posición de tabla, 1° a 8°):
   * es el orden que se guarda en quinielas.equipos_sorteo, salga el
   * bombo de los cuartos o de la tabla.
   */
  equipos: EquipoFuenteBombo[];
}

/** Normalización ÚNICA de nombres (la misma de nombresES/caminoFinal). */
const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** ¿Este equipo del REGISTRO es este equipo de la FUENTE? (regla de emparejar.ts) */
function esMismoEquipoRegistro(
  nombreRegistro: string,
  fuente: EquipoFuenteBombo,
  nombreES: ResolverNombreES
): boolean {
  const buscado = normalizar(nombreRegistro);
  if (buscado === normalizar(fuente.nombre)) return true;
  return buscado === normalizar(nombreES(fuente.nombre, fuente.teamProviderId));
}

/**
 * El top 8 de la tabla general, en orden de posición. `rows` son las
 * filas que la app ya muestra en Posiciones (liveRows si la ruta las
 * trae, si no las oficiales): aquí solo se ordenan por rank y se
 * toman las primeras 8, sin recalcular nada.
 */
export function top8DesdeTabla(rows: StandingRow[]): EquipoFuenteBombo[] {
  return [...rows]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8)
    .map((r) => ({ nombre: r.teamName, teamProviderId: r.teamProviderId }));
}

/**
 * Resolvedor de posición en la tabla: por ID del proveedor si se
 * puede; si no, por el nombre en español normalizado. Devuelve null
 * si el equipo no aparece en la tabla.
 */
function resolvedorDeRank(
  rows: StandingRow[],
  nombreES: ResolverNombreES
): (nombre: string, id: string | null) => number | null {
  const rankPorId = new Map<string, number>();
  const rankPorNombre = new Map<string, number>();
  for (const r of rows) {
    if (r.teamProviderId) rankPorId.set(r.teamProviderId, r.rank);
    rankPorNombre.set(normalizar(nombreES(r.teamName, r.teamProviderId)), r.rank);
  }
  return (nombre, id) =>
    (id ? rankPorId.get(id) : undefined) ??
    rankPorNombre.get(normalizar(nombreES(nombre, id))) ??
    null;
}

/**
 * Reordena equipos por su posición en la tabla (orden de SIEMBRA).
 * Un equipo que no aparece en la tabla queda al final, conservando
 * su orden relativo. No muta la entrada.
 */
export function ordenarPorSiembra(
  equipos: EquipoFuenteBombo[],
  rows: StandingRow[],
  nombreES: ResolverNombreES
): EquipoFuenteBombo[] {
  const rankDe = resolvedorDeRank(rows, nombreES);
  return equipos
    .map((e, i) => ({
      e,
      i,
      rank: rankDe(e.nombre, e.teamProviderId) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.i - b.i))
    .map((x) => x.e);
}

/** La siembra de un bombo, resuelta contra la tabla de su liga. */
export interface SiembraResuelta {
  /** Nombres de los equipos en orden de siembra (1° primero). */
  orden: string[];
  /** Posición de cada equipo, por nombre normalizado. */
  posiciones: Map<string, number>;
  /**
   * De dónde salió la siembra: 'tabla' = la posición real en la
   * tabla de la liga; 'guardada' = la tabla no resolvió a todo el
   * bombo y se usa el orden guardado (la vista lo AVISA: nada de
   * emparejar callada en un orden que no es la siembra).
   */
  fuente: 'tabla' | 'guardada';
}

/**
 * LA SIEMBRA REAL de un bombo ya guardado, derivada de la TABLA de
 * la liga (principio de Gonzalo, 2026-11-22): «el orden en que se
 * seleccionan no tiene que ver con el orden en la tabla; cada
 * equipo tiene su posición en la tabla». El orden guardado en
 * quinielas.equipos_sorteo puede ser el orden de SELECCIÓN del
 * admin: llenando a mano, si desmarca un equipo y lo vuelve a
 * marcar, el arreglo lo manda al final y la siembra se corrompe
 * (pasó en vivo: el América, 2° de la tabla, quedó 8° del arreglo y
 * las llaves salieron Cruz Azul–América en vez de Cruz Azul–
 * Pachuca). Por eso el tablero deriva la posición de cada equipo
 * de la tabla — la misma de /api/tabla-liga, liveRows si vienen,
 * si no las oficiales — y NUNCA del orden de selección ni del
 * orden guardado.
 *
 * `nombresBombo` son los nombres del REGISTRO del Club; el cruce
 * contra la tabla es por el nombre en español (nombresES), como en
 * el jalado. La tabla solo se acepta si TODOS los equipos del
 * bombo aparecen en ella con posiciones distintas; con cualquier
 * duda se cae al orden guardado y la fuente queda 'guardada'.
 * Excepción (2026-11-25): si el proveedor deja HUECOS en su tabla
 * (en vivo devolvió la de la Liga MX sin el León, saltando el
 * lugar 7) pero los equipos presentes confirman el orden guardado
 * y los faltantes ocupan exactamente los lugares saltados, la
 * siembra también se acepta como de tabla — el orden guardado
 * nació de esta misma tabla al crearse el bombo.
 */
export function resolverSiembra(
  nombresBombo: string[],
  rows: StandingRow[] | null,
  nombreES: ResolverNombreES
): SiembraResuelta {
  const posiciones = new Map<string, number>();
  if (rows && rows.length > 0 && nombresBombo.length > 0) {
    const rankPorNombre = new Map<string, number>();
    for (const r of rows) {
      rankPorNombre.set(normalizar(nombreES(r.teamName, r.teamProviderId)), r.rank);
      rankPorNombre.set(normalizar(r.teamName), r.rank);
    }
    const conRank = nombresBombo.map((nombre) => ({
      nombre,
      rank: rankPorNombre.get(normalizar(nombre)) ?? null,
    }));
    const ranks = conRank.map((x) => x.rank);
    if (ranks.every((r) => r !== null) && new Set(ranks).size === ranks.length) {
      const ordenadas = [...conRank].sort((a, b) => a.rank! - b.rank!);
      for (const x of ordenadas) posiciones.set(normalizar(x.nombre), x.rank!);
      return { orden: ordenadas.map((x) => x.nombre), posiciones, fuente: 'tabla' };
    }
    // Tabla con HUECOS del proveedor (ver la nota de arriba): los
    // presentes confirman el orden guardado y los faltantes caen
    // en los lugares que la tabla se saltó → siembra de tabla.
    const presentes = conRank.filter((x) => x.rank !== null);
    const faltantes = conRank.filter((x) => x.rank === null);
    if (faltantes.length > 0 && presentes.length > 0) {
      const ranksPresentes = presentes.map((x) => x.rank!) as number[];
      const distintos =
        new Set(ranksPresentes).size === ranksPresentes.length;
      const dentroDelCuadro = ranksPresentes.every(
        (r) => r >= 1 && r <= nombresBombo.length
      );
      const porRank = [...presentes]
        .sort((a, b) => a.rank! - b.rank!)
        .map((x) => x.nombre);
      const guardadoFiltrado = nombresBombo.filter((n) =>
        porRank.includes(n)
      );
      const ordenConsistente =
        JSON.stringify(porRank) === JSON.stringify(guardadoFiltrado);
      const usados = new Set(ranksPresentes);
      const huecos = new Set<number>();
      for (let i = 1; i <= nombresBombo.length; i++) {
        if (!usados.has(i)) huecos.add(i);
      }
      const faltantesEnHuecos = faltantes.every((x) =>
        huecos.has(nombresBombo.indexOf(x.nombre) + 1)
      );
      if (
        distintos &&
        dentroDelCuadro &&
        ordenConsistente &&
        faltantesEnHuecos &&
        huecos.size === faltantes.length
      ) {
        for (const x of conRank) {
          posiciones.set(
            normalizar(x.nombre),
            x.rank ?? nombresBombo.indexOf(x.nombre) + 1
          );
        }
        return { orden: [...nombresBombo], posiciones, fuente: 'tabla' };
      }
    }
  }
  // Respaldo: el orden guardado, con su posición posicional.
  nombresBombo.forEach((nombre, i) => {
    posiciones.set(normalizar(nombre), i + 1);
  });
  return { orden: [...nombresBombo], posiciones, fuente: 'guardada' };
}

/**
 * Las 4 llaves de cuartos de final desde los partidos de la
 * temporada, o null si no se pueden reconocer completas (la liguilla
 * aún no está publicada, viene a medias o el cuadro no cuadra).
 * `fixtures` debe venir en orden cronológico (así los entrega
 * /api/partidos?liga=): las llaves salen en ese orden, local y visita
 * tal como vienen en el partido de ida. OJO: el resultado viene en
 * orden de LLAVES (parejas consecutivas); quien lo guarde como
 * bombo debe pasarlo por ordenarPorSiembra, como hace sugerirBombo.
 */
export function llavesCuartosDesdeFixtures(
  fixtures: SportsFixture[],
  rows: StandingRow[],
  nombreES: ResolverNombreES,
  rondasRegulares = 17
): EquipoFuenteBombo[] | null {
  if (rows.length < 10) return null;

  const rankDe = resolvedorDeRank(rows, nombreES);

  // Partido de liguilla = fuera de las rondas de la fase regular.
  const esDeLiguilla = (f: SportsFixture): boolean =>
    f.round === null || f.round === 0 || f.round < 0 || f.round > rondasRegulares;

  const equiposTomados = new Set<string>();
  const llaves: EquipoFuenteBombo[][] = [];

  for (const f of fixtures) {
    if (!esDeLiguilla(f)) continue;
    const rankLocal = rankDe(f.homeTeam, f.homeTeamProviderId);
    const rankVisita = rankDe(f.awayTeam, f.awayTeamProviderId);
    if (rankLocal === null || rankVisita === null) continue;
    // Ambos deben pelear liguilla (top 10) y al menos uno debe ser
    // directo (top 6): el play-in queda fuera con esta sola regla.
    if (rankLocal > 10 || rankVisita > 10) continue;
    if (rankLocal > 6 && rankVisita > 6) continue;
    const claveLocal = normalizar(nombreES(f.homeTeam, f.homeTeamProviderId));
    const claveVisita = normalizar(nombreES(f.awayTeam, f.awayTeamProviderId));
    if (claveLocal === claveVisita) continue;
    // La vuelta y las rondas siguientes reusan equipos ya tomados.
    if (equiposTomados.has(claveLocal) || equiposTomados.has(claveVisita)) {
      continue;
    }
    equiposTomados.add(claveLocal);
    equiposTomados.add(claveVisita);
    llaves.push([
      { nombre: f.homeTeam, teamProviderId: f.homeTeamProviderId },
      { nombre: f.awayTeam, teamProviderId: f.awayTeamProviderId },
    ]);
    if (llaves.length === 4) break;
  }

  if (llaves.length !== 4) return null;
  return llaves.flat();
}

/**
 * La sugerencia completa del bombo: cuartos si la API ya los lista,
 * si no el top 8 de la tabla. `rondasRegulares` es el de LA LIGA
 * elegida (ver ligasSorteo.ts): lo que pase de ahí en los partidos
 * cuenta como liguilla al reconocer el cuadro.
 */
export function sugerirBombo(
  fixtures: SportsFixture[],
  rows: StandingRow[],
  nombreES: ResolverNombreES,
  rondasRegulares = 17
): BomboSugerido {
  const llaves = llavesCuartosDesdeFixtures(
    fixtures,
    rows,
    nombreES,
    rondasRegulares
  );
  if (llaves) {
    // El bombo se guarda en orden de SIEMBRA (ver la nota del
    // encabezado): las llaves detectadas se reordenan por la tabla.
    return {
      fuente: 'cuartos',
      equipos: ordenarPorSiembra(llaves, rows, nombreES),
    };
  }
  return { fuente: 'tabla', equipos: top8DesdeTabla(rows) };
}

export interface MapeoBombo {
  /** IDs del registro, en el orden de la lista recibida (solo los hallados). */
  ids: string[];
  /** Equipos hallados, con el nombre del registro (para mostrar). */
  asignados: { id: string; nombre: string }[];
  /**
   * Nombres EN ESPAÑOL de los equipos de la fuente que NO están en el
   * registro del Club: el bombo no se completa a ciegas con ellos; la
   * vista los reporta («no registrado: X») para elegirlos a mano en
   * cuanto existan en el registro.
   */
  noRegistrados: string[];
}

/**
 * Cruza los equipos de la fuente contra el registro de equipos del
 * Club y devuelve los IDs para quinielas.equipos_sorteo. Un mismo ID
 * no se asigna dos veces: si dos equipos de la fuente cayeran en el
 * mismo registro, el segundo cuenta como no registrado.
 */
export function mapearEquiposARegistro(
  fuente: EquipoFuenteBombo[],
  registro: { id: string; nombre: string }[],
  nombreES: ResolverNombreES
): MapeoBombo {
  const ids: string[] = [];
  const asignados: { id: string; nombre: string }[] = [];
  const noRegistrados: string[] = [];
  const idsUsados = new Set<string>();

  for (const eq of fuente) {
    const hallado = registro.find(
      (r) => !idsUsados.has(r.id) && esMismoEquipoRegistro(r.nombre, eq, nombreES)
    );
    if (hallado) {
      idsUsados.add(hallado.id);
      ids.push(hallado.id);
      asignados.push({ id: hallado.id, nombre: hallado.nombre });
    } else {
      noRegistrados.push(nombreES(eq.nombre, eq.teamProviderId));
    }
  }

  return { ids, asignados, noRegistrados };
}
