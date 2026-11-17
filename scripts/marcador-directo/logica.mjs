// scripts/marcador-directo/logica.mjs
//
// Lógica PURA del programa de marcadores directos: sin red, sin base de
// datos, sin reloj propio (el "ahora" entra como parámetro). Así se puede
// probar con fixtures de ejemplo sin tocar Supabase ni la API.
//
// Los criterios NO se inventan aquí: son los mismos de la app.
//  - Clasificación de estados crudos de TheSportsDB: la de
//    src/lib/sports/thesportsdb.ts (mapStatusFields, ya corregida para
//    que un código desconocido NUNCA sea "en vivo") y la de la ruta
//    /api/en-vivo.
//  - Emparejamiento jornada↔API: el de src/lib/emparejar.ts (un equipo
//    coincide si su nombre normalizado es el original de la API o su
//    nombre en español de src/lib/sports/nombresES.ts; el partido
//    coincide si coinciden AMBOS equipos, en cualquier orientación, y
//    la fecha en Mazatlán cae a ±1 día).

// ---------- Fechas en America/Mazatlan (mismo criterio que
// src/lib/fechaMazatlan.ts: Intl con timeZone fijo) --------------------

const ZONA_MAZATLAN = 'America/Mazatlan';

const fmtFechaMazatlan = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_MAZATLAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" del instante en America/Mazatlan. */
export function fechaEnMazatlan(isoUtc) {
  const parts = fmtFechaMazatlan.formatToParts(new Date(isoUtc));
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Número de día de un "YYYY-MM-DD" (para restar fechas sin husos). */
export function numeroDia(ymd) {
  return Math.floor(new Date(`${ymd}T12:00:00Z`).getTime() / 86_400_000);
}

/** Días enteros entre dos instantes, comparados por su día en Mazatlán. */
export function diferenciaDiasMazatlan(isoA, isoB) {
  return Math.abs(
    numeroDia(fechaEnMazatlan(isoA)) - numeroDia(fechaEnMazatlan(isoB))
  );
}

// ---------- Nombres de equipo (criterio de nombresES/emparejar) --------

/**
 * Normalización ÚNICA de nombres: minúsculas, sin acentos, espacios
 * colapsados. Copia exacta del algoritmo de src/lib/sports/nombresES.ts
 * (normalizarNombreEquipo); el programa prefiere importar el original y
 * solo usa esta copia como respaldo (ver marcador-directo.mjs).
 */
export function normalizarNombreEquipo(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construye las herramientas de emparejamiento a partir de las dos
 * funciones de nombresES (la real importada o el respaldo equivalente):
 *   nombreEquipoES(nombreOriginal, teamProviderId) → nombre en español
 *   normalizarNombreEquipo(nombre) → nombre comparable
 */
export function construirHerramientasNombres(nombreEquipoES, normalizar) {
  /** ¿El nombre de equipo de la APP es este equipo de la API? */
  function esMismoEquipo(nombreApp, nombreApi, teamProviderIdApi) {
    const buscado = normalizar(nombreApp);
    if (buscado === normalizar(nombreApi)) return true;
    return buscado === normalizar(nombreEquipoES(nombreApi, teamProviderIdApi));
  }

  /** ¿Este fixture de la API es este partido de la base (por equipos)? */
  function coincideParEquipos(partido, fixture) {
    return orientacion(partido, fixture) !== null;
  }

  /**
   * Orientación del fixture respecto al partido de la base:
   * 'directo' (local↔local), 'cruzado' (invertidos) o null (no es el
   * mismo par de equipos). Si ambas orientaciones "coincidieran" (dos
   * equipos con el mismo nombre), se prefiere la directa.
   */
  function orientacion(partido, fixture) {
    const directo =
      esMismoEquipo(partido.equipo_local, fixture.homeTeam, fixture.homeTeamProviderId) &&
      esMismoEquipo(partido.equipo_visitante, fixture.awayTeam, fixture.awayTeamProviderId);
    if (directo) return 'directo';
    const cruzado =
      esMismoEquipo(partido.equipo_local, fixture.awayTeam, fixture.awayTeamProviderId) &&
      esMismoEquipo(partido.equipo_visitante, fixture.homeTeam, fixture.homeTeamProviderId);
    return cruzado ? 'cruzado' : null;
  }

  /**
   * Busca el fixture de temporada que enlaza con un partido sin
   * api_fixture_id. Regla conservadora: SOLO enlaza si hay exactamente
   * UN candidato (mismo par de equipos, fecha en Mazatlán a ±1 día) y
   * ese fixture no fue ya reclamado por otro partido en este ciclo.
   * Nunca adivina: ante la duda devuelve el motivo y no enlaza.
   *
   * @returns {{fixture: object} | {motivo: string, candidatos: number}}
   */
  function buscarEnlace(partido, fixtures, fixturesReclamados = new Set()) {
    if (!partido.fecha_hora_partido) {
      return { motivo: 'el partido no tiene fecha_hora_partido', candidatos: 0 };
    }
    const candidatos = [];
    for (const fixture of fixtures) {
      if (!coincideParEquipos(partido, fixture)) continue;
      const fechaApi = fixture.kickoffUtc || fixture.date;
      if (!fechaApi) continue;
      // fixture.date ya es "YYYY-MM-DD" (día del proveedor, UTC): se
      // compara directo; kickoffUtc se convierte a día en Mazatlán.
      const dias = fixture.kickoffUtc
        ? diferenciaDiasMazatlan(partido.fecha_hora_partido, fixture.kickoffUtc)
        : Math.abs(
            numeroDia(fechaEnMazatlan(partido.fecha_hora_partido)) -
              numeroDia(fixture.date)
          );
      if (dias <= 1) candidatos.push(fixture);
    }
    if (candidatos.length === 0) {
      return { motivo: 'ningún fixture coincide en equipos y fecha (±1 día)', candidatos: 0 };
    }
    if (candidatos.length > 1) {
      return {
        motivo: `ambiguo: ${candidatos.length} fixtures coinciden (p. ej. ida y vuelta)`,
        candidatos: candidatos.length,
      };
    }
    const fixture = candidatos[0];
    if (fixturesReclamados.has(fixture.providerId)) {
      return {
        motivo: 'el único candidato ya fue enlazado a otro partido en este ciclo',
        candidatos: 1,
      };
    }
    return { fixture };
  }

  return { esMismoEquipo, coincideParEquipos, orientacion, buscarEnlace };
}

// ---------- Estados del feed -------------------------------------------

/** Códigos crudos que inequívocamente son "en curso" (thesportsdb.ts). */
const ESTADOS_EN_CURSO = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'LIVE']);

/** Minuto de juego como estado crudo: "67", "45+2", "90+3"... */
const MINUTO_COMO_ESTADO = /^\d+(\+\d+)?$/;

const ESTADOS_TERMINADO = ['FT', 'AET', 'PEN', 'AWD', 'Match Finished'];

/**
 * Clasifica el estado crudo del feed v2, con el mismo criterio que
 * mapStatusFields de la app:
 * @returns {'live'|'finished'|'scheduled'|'postponed'|'unknown'}
 */
export function clasificarEstado(statusRaw, postponed) {
  const s = String(statusRaw ?? '').trim();
  if (postponed === 'yes' || s === 'PP' || s === 'CANC' || s === 'ABD') {
    return 'postponed';
  }
  if (s === 'NS' || s === '' || s === 'TBD') return 'scheduled';
  if (ESTADOS_TERMINADO.includes(s)) return 'finished';
  if (ESTADOS_EN_CURSO.has(s.toUpperCase()) || MINUTO_COMO_ESTADO.test(s)) {
    return 'live';
  }
  return 'unknown';
}

/** Resultado L/E/V derivado de un marcador (null si falta algún gol). */
export function derivarResultado(golesLocal, golesVisitante) {
  if (golesLocal === null || golesLocal === undefined) return null;
  if (golesVisitante === null || golesVisitante === undefined) return null;
  if (golesLocal > golesVisitante) return 'L';
  if (golesLocal < golesVisitante) return 'V';
  return 'E';
}

/** Tolerancia de relojes: un partido puede arrancar unos minutos antes. */
export const TOLERANCIA_INICIO_MS = 5 * 60_000;

/**
 * Decide qué escribir (si algo) para un partido enlazado, dado su renglón
 * actual en la base y su entrada en el feed en vivo.
 *
 * @param partido  Renglón de `partidos` (goles_local, goles_visitante,
 *                 resultado_real, es_final, estado_api, equipos).
 * @param feed     Entrada del livescore v2 ya mapeada: { statusRaw,
 *                 progress, homeScore, awayScore, kickoffUtc, homeTeam,
 *                 awayTeam, homeTeamProviderId, awayTeamProviderId }.
 * @param herramientas  Las de construirHerramientasNombres (orientación).
 * @param ahoraMs  Date.now() del llamador.
 * @returns {{accion:'escribir', cambios:object, esFinal:boolean, resumen:string}
 *          | {accion:'nada', motivo:string}}
 *
 * Reglas de oro:
 *  - El final SOLO se marca si el feed dice terminado (FT/AET/PEN/AWD).
 *  - Un "en vivo" o un "terminado" con hora de inicio aún en el futuro
 *    (más allá de la tolerancia) se ignora: el feed a veces anuncia
 *    partidos horas antes (así salían LIVE prematuros en Resultados).
 *  - Si nada cambió (mismos goles y mismo resultado), no se escribe.
 *    Que avance el minuto (estado_api '45'→'46') NO es un cambio.
 *  - Los goles se escriben en la orientación de la base: si el feed
 *    trae local/visita invertidos respecto al renglón, se cruzan.
 */
export function planEscritura(partido, feed, herramientas, ahoraMs) {
  const estado = clasificarEstado(feed.statusRaw, feed.postponed);

  if (estado === 'scheduled') {
    return { accion: 'nada', motivo: 'el feed aún lo marca no iniciado' };
  }
  if (estado === 'postponed') {
    return { accion: 'nada', motivo: 'el feed lo marca pospuesto/cancelado' };
  }
  if (estado === 'unknown') {
    return {
      accion: 'nada',
      motivo: `estado del feed no reconocido ("${feed.statusRaw ?? ''}"): no se toca`,
    };
  }

  // Cordura temporal (la misma del arreglo de Resultados): nada de
  // "en vivo" ni de "final" antes de la hora de inicio.
  const inicioMs = feed.kickoffUtc ? Date.parse(feed.kickoffUtc) : NaN;
  if (!Number.isNaN(inicioMs) && ahoraMs < inicioMs - TOLERANCIA_INICIO_MS) {
    return {
      accion: 'nada',
      motivo:
        estado === 'finished'
          ? 'el feed dice terminado pero la hora de inicio aún no llega: se ignora'
          : 'el feed dice en vivo pero la hora de inicio aún no llega: se ignora',
    };
  }

  if (feed.homeScore === null || feed.homeScore === undefined ||
      feed.awayScore === null || feed.awayScore === undefined) {
    return { accion: 'nada', motivo: 'el feed no trae marcador: no se inventa' };
  }

  // Orientación: los goles del feed deben caer en la orientación del
  // renglón de la base. Si los nombres no cuadran en ninguna orientación,
  // el enlace es sospechoso y NO se escribe.
  const orient = herramientas.orientacion(partido, feed);
  if (orient === null) {
    return {
      accion: 'nada',
      motivo: 'los equipos del feed no coinciden con los del renglón enlazado: no se escribe',
    };
  }
  const golesLocal = orient === 'cruzado' ? feed.awayScore : feed.homeScore;
  const golesVisitante = orient === 'cruzado' ? feed.homeScore : feed.awayScore;
  const resultado = derivarResultado(golesLocal, golesVisitante);
  const esFinal = estado === 'finished';

  const cambios = {
    goles_local: golesLocal,
    goles_visitante: golesVisitante,
    resultado_real: resultado,
    es_final: esFinal,
    estado_api: feed.statusRaw ?? null,
  };

  // ¿Cambió algo que importe? (El minuto en estado_api no cuenta.)
  const sinCambios =
    partido.goles_local === cambios.goles_local &&
    partido.goles_visitante === cambios.goles_visitante &&
    partido.resultado_real === cambios.resultado_real &&
    Boolean(partido.es_final) === cambios.es_final;
  if (sinCambios) {
    return { accion: 'nada', motivo: 'sin cambios en el marcador' };
  }

  const resumen =
    `${partido.equipo_local} ${golesLocal}-${golesVisitante} ${partido.equipo_visitante}` +
    (esFinal ? ' (FINAL)' : '');
  return { accion: 'escribir', cambios, esFinal, resumen };
}
