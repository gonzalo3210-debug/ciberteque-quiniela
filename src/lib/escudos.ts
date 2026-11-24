// src/lib/escudos.ts
//
// Resolución de ESCUDOS del catálogo EQUIPOS (tabla `equipos` de
// Supabase) para las vistas del Club (Jugar y las que lo adopten).
//
// EL BUG QUE ESTO ARREGLA (2026-11-23): el escudo se asociaba al
// partido por el NOMBRE EXACTO del equipo (minúsculas y trim, nada
// más). En la quiniela CUARTOS IDA + CHAMPIONS, PSV, PSG, Roma y
// Bayern Múnich salían como círculo con "?" aunque su URL de ESPN
// cargaba bien: el catálogo los tenía como "PSV Eindhoven",
// "Paris Saint-Germain", "AS Roma" y "Bayern Munich", y la quiniela
// usa los nombres cortos.
//
// LA SOLUCIÓN, en dos capas que no cambian lo que se ve hoy para los
// equipos que ya funcionan:
//
// 1) ID DE API (capa principal): cada equipo del catálogo puede
//    guardar su ID de TheSportsDB (columna `id_api`, migración
//    scripts/migraciones/2026-11-23-equipos-id-api.sql). Si lo tiene,
//    el escudo sale de la API por ese ID — vía la ruta propia
//    /api/escudo-equipo, que en el servidor llama lookupteam.php con
//    la llave premium ya en uso y redirige al badge oficial — y el
//    nombre deja de importar para ese equipo. Buscar por nombre en
//    la API NO es opción: su buscador es difuso (verificado el
//    2026-11-23: buscar "PSG" devuelve un equipo de eSports), por
//    eso el ID se captura una vez en el panel y queda fijo.
//
// 2) NOMBRES NORMALIZADOS + ALIAS (capa de respaldo): mientras un
//    equipo no tenga ID, el cruce nombre-de-la-quiniela ↔ catálogo
//    se hace con la clave normalizada (sin acentos, sin mayúsculas,
//    espacios colapsados) y con grupos de alias conocidos (el nombre
//    corto de la quiniela y el nombre largo del catálogo/API caen en
//    la MISMA clave). Así, un "PSV" de la quiniela encuentra al
//    "PSV Eindhoven" del catálogo aunque nadie le ponga ID todavía.
//
// PRIORIDAD del escudo de un equipo (resolverEscudoEquipo):
//   id_api  ->  logo_url manual  ->  null (la vista pinta su "?").
//
// OJO: archivo PURO (sin imports, sin red, sin Supabase) para poder
// usarse en componentes cliente y probarse con node
// (scripts/pruebas-escudos-api.mjs), igual que bomboSorteo.ts.

/** Fila mínima del catálogo que necesita la resolución de escudos. */
export interface EquipoEscudo {
  nombre: string;
  logo_url?: string | null;
  id_api?: string | null;
}

/**
 * Normaliza un nombre de equipo para compararlo: minúsculas, sin
 * acentos, espacios repetidos colapsados y sin espacios al borde.
 * (Mismo criterio que ya usaban useEquipos y Mis Jugadas; aquí queda
 * la copia compartida.)
 */
export function normalizarNombreEquipo(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita las marcas diacríticas (acentos)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Grupos de nombres equivalentes (ya normalizados) del mismo equipo:
 * el primero es la clave canónica del grupo. Cubre los choques
 * reales entre el nombre corto que usa una quiniela, el nombre del
 * catálogo y el nombre oficial que trae TheSportsDB. Para agregar un
 * equipo: una línea más, con todas sus variantes normalizadas.
 */
const GRUPOS_ALIAS: string[][] = [
  // Los 4 del bug del 2026-11-23:
  ['psv', 'psv eindhoven', 'psv eindhoven fc'],
  ['psg', 'paris saint-germain', 'paris saint germain', 'paris sg'],
  ['roma', 'as roma'],
  ['bayern munich', 'bayern munchen', 'fc bayern munchen', 'fc bayern munich', 'bayern'],
  // Otros choques frecuentes en ligas que el Club ya sigue:
  ['manchester united', 'man united', 'man utd', 'manchester utd'],
  ['manchester city', 'man city'],
  ['atletico de madrid', 'atletico madrid', 'atl madrid', 'atletico'],
  ['inter', 'inter de milan', 'internazionale', 'fc internazionale milano', 'inter milan'],
  ['tottenham', 'tottenham hotspur', 'spurs'],
  ['wolverhampton', 'wolves', 'wolverhampton wanderers'],
  ['west ham', 'west ham united'],
  ['newcastle', 'newcastle united'],
  ['brighton', 'brighton & hove albion', 'brighton and hove albion'],
  ['sporting cp', 'sporting lisboa', 'sporting de lisboa', 'sporting'],
  ['athletic', 'athletic club', 'athletic bilbao', 'athletic de bilbao'],
];

const ALIAS_A_CANONICO: Map<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const grupo of GRUPOS_ALIAS) {
    const canonico = grupo[0];
    for (const variante of grupo) mapa.set(variante, canonico);
  }
  return mapa;
})();

/**
 * Clave de cruce de un nombre de equipo: normalizada y, si el nombre
 * pertenece a un grupo de alias, reducida a la clave canónica del
 * grupo. Dos nombres del mismo equipo (corto/largo, con/sin acentos)
 * producen la misma clave; dos equipos distintos, claves distintas.
 */
export function claveEquipo(nombre: string): string {
  const normalizado = normalizarNombreEquipo(nombre);
  return ALIAS_A_CANONICO.get(normalizado) || normalizado;
}

/** ID de API utilizable (texto no vacío) o null. */
export function idApiValido(idApi: string | null | undefined): string | null {
  const limpio = (idApi || '').trim();
  return limpio ? limpio : null;
}

/**
 * URL que pinta el escudo de un equipo DESDE la API, usando solo su
 * ID de TheSportsDB. No es la URL del proveedor: es la ruta propia
 * /api/escudo-equipo, que en el servidor resuelve el badge oficial
 * (lookupteam, cacheado 24 h) y redirige a él; el navegador cachea la
 * imagen 24 h. Si la API no tuviera badge para ese ID, la ruta
 * redirige al logo genérico de ESPN (el mismo respaldo que usan los
 * onError de la app), nunca a una imagen rota.
 */
export function urlEscudoApi(idApi: string | null | undefined): string | null {
  const id = idApiValido(idApi);
  if (!id) return null;
  return `/api/escudo-equipo?id=${encodeURIComponent(id)}`;
}

/**
 * El escudo de UN registro del catálogo, con la prioridad acordada:
 * primero el de la API (si hay ID), luego el logo manual, y si no hay
 * nada, null (cada vista pinta su respaldo actual: el "?" en Jugar).
 */
export function resolverEscudoEquipo(equipo: EquipoEscudo): string | null {
  const porApi = urlEscudoApi(equipo.id_api);
  if (porApi) return porApi;
  const manual = (equipo.logo_url || '').trim();
  return manual ? manual : null;
}

/**
 * Construye el mapa clave-de-equipo -> URL de escudo a partir de las
 * filas del catálogo. Cada equipo se registra bajo SU clave (nombre
 * normalizado/alias), así el cruce ya no depende del nombre exacto.
 * Si dos registros cayeran en la misma clave (duplicados viejos), se
 * prefiere el que tenga ID de API; entre iguales, el primero con
 * escudo gana y no se pisa con un nulo.
 */
export function construirMapaEscudos(
  equipos: EquipoEscudo[]
): Record<string, string> {
  const mapa: Record<string, string> = {};
  const conApi = new Set<string>();
  for (const eq of equipos || []) {
    if (!eq?.nombre) continue;
    const url = resolverEscudoEquipo(eq);
    if (!url) continue;
    const clave = claveEquipo(eq.nombre);
    const tieneApi = !!idApiValido(eq.id_api);
    if (!mapa[clave] || (tieneApi && !conApi.has(clave))) {
      mapa[clave] = url;
      if (tieneApi) conApi.add(clave);
      else conApi.delete(clave);
    }
  }
  return mapa;
}

/** Busca el escudo de un nombre de equipo (el de la quiniela) en el mapa. */
export function buscarEscudoEnMapa(
  mapa: Record<string, string>,
  nombreEquipo: string
): string | null {
  if (!nombreEquipo) return null;
  return mapa[claveEquipo(nombreEquipo)] || null;
}
