// src/lib/bomboSorteo.ts
//
// Lógica PURA para JALAR LOS EQUIPOS DEL BOMBO del modo sorteo
// (decisión de Gonzalo, 2026-11-22): al crear la quiniela de liguilla,
// el bombo de 8 equipos ya no se tiene que escoger a mano escudo por
// escudo. La fuente, en orden de preferencia:
//
//   1. CUARTOS: si el proveedor ya lista los partidos de cuartos de
//      final de la liguilla de Liga MX, los 8 equipos salen de esos
//      4 partidos, en el orden en que vengan las llaves.
//   2. TABLA: si todavía no hay liguilla publicada, el bombo es el
//      top 8 de la tabla general — LA MISMA que muestra Posiciones
//      (la ruta /api/tabla-liga ya la entrega recalculada con el en
//      vivo y la retención de 24 h de finales recientes; aquí solo se
//      toman sus primeras 8 filas, sin recalcular nada).
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
  /** Los equipos en el orden de la fuente (llaves o tabla). */
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
 * Las 4 llaves de cuartos de final desde los partidos de la
 * temporada, o null si no se pueden reconocer completas (la liguilla
 * aún no está publicada, viene a medias o el cuadro no cuadra).
 * `fixtures` debe venir en orden cronológico (así los entrega
 * /api/partidos?liga=): las llaves salen en ese orden, local y visita
 * tal como vienen en el partido de ida.
 */
export function llavesCuartosDesdeFixtures(
  fixtures: SportsFixture[],
  rows: StandingRow[],
  nombreES: ResolverNombreES,
  rondasRegulares = 17
): EquipoFuenteBombo[] | null {
  if (rows.length < 10) return null;

  // Posición de cada equipo según la tabla (por ID del proveedor si
  // se puede; si no, por su nombre en español normalizado).
  const rankPorId = new Map<string, number>();
  const rankPorNombre = new Map<string, number>();
  for (const r of rows) {
    if (r.teamProviderId) rankPorId.set(r.teamProviderId, r.rank);
    rankPorNombre.set(normalizar(nombreES(r.teamName, r.teamProviderId)), r.rank);
  }
  const rankDe = (nombre: string, id: string | null): number | null =>
    (id ? rankPorId.get(id) : undefined) ??
    rankPorNombre.get(normalizar(nombreES(nombre, id))) ??
    null;

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
 * si no el top 8 de la tabla.
 */
export function sugerirBombo(
  fixtures: SportsFixture[],
  rows: StandingRow[],
  nombreES: ResolverNombreES
): BomboSugerido {
  const llaves = llavesCuartosDesdeFixtures(fixtures, rows, nombreES);
  if (llaves) return { fuente: 'cuartos', equipos: llaves };
  return { fuente: 'tabla', equipos: top8DesdeTabla(rows) };
}

export interface MapeoBombo {
  /** IDs del registro, en el orden de la fuente (solo los hallados). */
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
