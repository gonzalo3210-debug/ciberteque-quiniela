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

// ---------- Puntos y ranking provisional (espejo de la app) -------------
//
// Réplica fiel del cálculo EN VIVO de src/hooks/usePosiciones.ts: con
// los marcadores actuales (aunque el partido siga en juego), cada
// pronóstico suma 3 si es el marcador exacto en modalidad
// marcador_exacto (1 si solo acierta la tendencia) y 1 si acierta la
// tendencia L/E/V en las demás modalidades. El desempate usa la
// diferencia contra el total REAL de goles: desde la corrección del
// 2026-11-21 (espejo de totalGolesEfectivo en src/lib/proyeccion.ts)
// ese total es la SUMA de los goles capturados en los partidos, con
// el campo guardado goles_totales_real solo de respaldo; sin ningún
// gol capturado ni campo guardado vale 999 para todos y el ranking
// provisional es, en la práctica, por puntos con lugares compartidos.

/** Tendencia L/E/V de una elección o marcador ("L", "2-1", …). */
export function eleccionATendencia(valor) {
  if (!valor) return null;
  const limpio = String(valor).replace(/\s+/g, '').toUpperCase();
  if (['L', 'E', 'V'].includes(limpio)) return limpio;
  if (limpio.includes('-')) {
    const [l, v] = limpio.split('-').map(Number);
    if (!Number.isNaN(l) && !Number.isNaN(v)) {
      if (l > v) return 'L';
      if (l < v) return 'V';
      return 'E';
    }
  }
  return null;
}

/**
 * Puntos provisionales de UN pronóstico con el marcador actual del
 * partido (0 si el partido aún no tiene ningún resultado).
 */
export function puntosPronostico(modalidad, eleccion, partido) {
  const tieneResultado =
    (partido.resultado_real !== null && partido.resultado_real !== undefined) ||
    (partido.goles_local !== null &&
      partido.goles_local !== undefined &&
      partido.goles_visitante !== null &&
      partido.goles_visitante !== undefined);
  if (!tieneResultado) return 0;

  const pickStr = String(eleccion ?? '').replace(/\s+/g, '');
  const realStr =
    partido.goles_local !== null &&
    partido.goles_local !== undefined &&
    partido.goles_visitante !== null &&
    partido.goles_visitante !== undefined
      ? `${partido.goles_local}-${partido.goles_visitante}`
      : String(partido.resultado_real ?? '').replace(/\s+/g, '');

  if (pickStr !== '' && pickStr === realStr) {
    return modalidad === 'marcador_exacto' ? 3 : 1;
  }
  const pickLEV = eleccionATendencia(pickStr);
  const realLEV = eleccionATendencia(realStr) || eleccionATendencia(partido.resultado_real);
  return pickLEV && realLEV && pickLEV === realLEV ? 1 : 0;
}

/**
 * Ranking provisional de una quiniela (NO sorteo: esa modalidad se
 * ordena con puntos_totales de la base, que este programa no toca).
 *
 * @param quiniela  { modalidad, goles_totales_real }
 * @param tickets   [{ id, usuario_id, prediccion_goles_total,
 *                     pronosticos: [{ partido_id, eleccion_usuario }] }]
 * @param partidos  [{ id, goles_local, goles_visitante, resultado_real }]
 * @returns [{ ticket_id, usuario_id, puntos, golesDiff, posicion }]
 *          ordenado como en la app (puntos desc, golesDiff asc,
 *          lugares compartidos en empate exacto).
 */
export function calcularRankingProvisional(quiniela, tickets, partidos) {
  if (quiniela.modalidad === 'sorteo') return [];
  const porId = new Map(partidos.map((p) => [p.id, p]));
  // Total real del desempate (corrección 2026-11-21, espejo de la
  // app): suma de los goles capturados; el campo guardado solo es
  // respaldo. Sin ninguno de los dos, -1 → diferencia 999.
  let sumaGoles = 0;
  let hayGoles = false;
  for (const p of partidos) {
    if (
      p.goles_local !== null &&
      p.goles_local !== undefined &&
      p.goles_visitante !== null &&
      p.goles_visitante !== undefined
    ) {
      sumaGoles += p.goles_local + p.goles_visitante;
      hayGoles = true;
    }
  }
  const golesReales = hayGoles
    ? sumaGoles
    : quiniela.goles_totales_real !== null && quiniela.goles_totales_real !== undefined
      ? quiniela.goles_totales_real
      : -1;

  const filas = tickets.map((ticket) => {
    let puntos = 0;
    for (const pron of ticket.pronosticos || []) {
      const partido = porId.get(pron.partido_id);
      if (partido) puntos += puntosPronostico(quiniela.modalidad, pron.eleccion_usuario, partido);
    }
    return {
      ticket_id: ticket.id,
      usuario_id: ticket.usuario_id,
      puntos,
      golesDiff:
        golesReales !== -1
          ? Math.abs((ticket.prediccion_goles_total || 0) - golesReales)
          : 999,
    };
  });

  filas.sort((a, b) => b.puntos - a.puntos || a.golesDiff - b.golesDiff);
  filas.forEach((fila, idx) => {
    if (idx > 0) {
      const anterior = filas[idx - 1];
      fila.posicion =
        fila.puntos === anterior.puntos && fila.golesDiff === anterior.golesDiff
          ? anterior.posicion
          : idx + 1;
    } else {
      fila.posicion = 1;
    }
  });
  return filas;
}

// ---------- Detección de eventos para notificaciones push ----------------
//
// El programa compara la FOTO actual (marcadores + ranking
// provisional) contra el ESTADO que persiste entre ciclos y reinicios
// (estado-notificaciones.json). De esa comparación salen los eventos
// que se mandan a /api/push/despachar.
//
// Reglas:
//  - Línea base silenciosa: lo primero que se ve de un partido o de
//    un liderato se anota SIN notificar (nada de spamear el pasado al
//    arrancar el programa a mitad de jornada).
//  - Un gol se anuncia una sola vez por marcador: la clave incluye el
//    marcador tras el gol y queda en `despachadas` cuando el despacho
//    sale bien; ni un reinicio lo repite.
//  - Gol anulado (el total de goles BAJA entre fotos): si el gol
//    original nunca salió (no está en despachadas), no sale nada; si
//    ya salió, sale UNA corrección "gol anulado".
//  - Liderato: quien entra al 1° recibe lider_nuevo y quien sale del
//    1° recibe rebasado; la clave lleva sus puntos del momento, así
//    un vaivén con los mismos puntos no spamea y un liderato nuevo
//    con más puntos sí avisa.

/** Estado vacío de detección (la forma que se persiste en disco). */
export function crearEstadoNotificaciones() {
  return { v: 1, despachadas: [], partidos: {}, lideres: {} };
}

const MARCADOR_RE = /^(\d+)-(\d+)$/;

function totalDeMarcador(marcador) {
  const m = MARCADOR_RE.exec(marcador || '');
  return m ? Number(m[1]) + Number(m[2]) : null;
}

function marcadorDe(partido) {
  if (
    partido.goles_local === null ||
    partido.goles_local === undefined ||
    partido.goles_visitante === null ||
    partido.goles_visitante === undefined
  ) {
    return null;
  }
  return `${partido.goles_local}-${partido.goles_visitante}`;
}

/**
 * Detecta los eventos de UNA foto nueva.
 *
 * @param estado  El estado persistido (no se muta).
 * @param foto    { partidos: [...], quinielas: { [id]: { nombre } },
 *                  rankings: { [quinielaId]: filasDeRanking } }
 * @returns {{ eventos: object[], estadoNuevo: object }} — el llamador
 *          despacha `eventos` y, solo si el despacho sale bien,
 *          persiste estadoNuevo ya marcado con marcarDespachadas.
 */
export function detectarEventosNotificacion(estado, foto) {
  const estadoNuevo = {
    v: 1,
    despachadas: [...(estado.despachadas || [])],
    partidos: { ...(estado.partidos || {}) },
    lideres: { ...(estado.lideres || {}) },
  };
  const yaDespachadas = new Set(estadoNuevo.despachadas);
  const eventos = [];
  const emitidas = new Set();
  const emitir = (evento) => {
    if (yaDespachadas.has(evento.clave) || emitidas.has(evento.clave)) return;
    emitidas.add(evento.clave);
    eventos.push(evento);
  };

  const nombreQuiniela = (qid) => foto.quinielas?.[qid]?.nombre || 'tu quiniela';

  // ----- Partidos: goles, goles anulados y finales -----
  for (const partido of foto.partidos || []) {
    const marcadorActual = marcadorDe(partido);
    const previo = estado.partidos?.[partido.id];
    const registro = {
      marcador: marcadorActual ?? previo?.marcador ?? null,
      esFinal: Boolean(partido.es_final),
    };

    if (!previo) {
      // Primera vez que se ve este partido: línea base silenciosa.
      estadoNuevo.partidos[partido.id] = registro;
      continue;
    }

    if (previo.marcador && marcadorActual) {
      const totalAntes = totalDeMarcador(previo.marcador);
      const totalAhora = totalDeMarcador(marcadorActual);
      const [lAntes, vAntes] = previo.marcador.split('-').map(Number);

      if (totalAntes !== null && totalAhora !== null && totalAhora > totalAntes) {
        let anoto = null;
        if (partido.goles_local > lAntes) anoto = partido.equipo_local;
        else if (partido.goles_visitante > vAntes) anoto = partido.equipo_visitante;
        const base = {
          quiniela_id: partido.quiniela_id,
          equipo_provider_ids: [
            partido.equipo_local_provider_id,
            partido.equipo_visitante_provider_id,
          ].filter(Boolean),
          titulo: anoto ? `⚽ ¡GOL de ${anoto}!` : '⚽ ¡GOL!',
          cuerpo:
            `${partido.equipo_local} ${marcadorActual} ` +
            `${partido.equipo_visitante} · ${nombreQuiniela(partido.quiniela_id)}`,
          url: '/',
        };
        emitir({ ...base, tipo: 'gol_equipo', clave: `gol:${partido.id}:${marcadorActual}:equipos` });
        emitir({ ...base, tipo: 'gol_boleto', clave: `gol:${partido.id}:${marcadorActual}:boleto` });
      } else if (totalAntes !== null && totalAhora !== null && totalAhora < totalAntes) {
        // Gol anulado: solo se corrige si el aviso original SÍ salió.
        const salioGol =
          yaDespachadas.has(`gol:${partido.id}:${previo.marcador}:equipos`) ||
          yaDespachadas.has(`gol:${partido.id}:${previo.marcador}:boleto`);
        if (salioGol) {
          emitir({
            tipo: 'gol_anulado',
            clave: `anulado:${partido.id}:${previo.marcador}`,
            quiniela_id: partido.quiniela_id,
            equipo_provider_ids: [
              partido.equipo_local_provider_id,
              partido.equipo_visitante_provider_id,
            ].filter(Boolean),
            titulo: '🚫 Gol anulado',
            cuerpo:
              `El VAR anuló un gol: ${partido.equipo_local} ${marcadorActual} ` +
              `${partido.equipo_visitante} · ${nombreQuiniela(partido.quiniela_id)}`,
            url: '/',
          });
        }
      }
    }

    if (partido.es_final && !previo.esFinal) {
      emitir({
        tipo: 'fin_partido',
        clave: `fin:${partido.id}`,
        quiniela_id: partido.quiniela_id,
        titulo: '🏁 Partido terminado',
        cuerpo:
          `${partido.equipo_local} ${marcadorActual ?? previo.marcador ?? ''} ` +
          `${partido.equipo_visitante} · ${nombreQuiniela(partido.quiniela_id)}`,
        url: '/',
      });
    }

    estadoNuevo.partidos[partido.id] = registro;
  }

  // ----- Liderato por quiniela -----
  for (const [qid, ranking] of Object.entries(foto.rankings || {})) {
    const nuevos = [...new Set(ranking.filter((f) => f.posicion === 1).map((f) => f.usuario_id))];
    const previos = estado.lideres?.[qid];
    if (previos === undefined) {
      // Primera foto de esta quiniela: línea base silenciosa.
      estadoNuevo.lideres[qid] = nuevos;
      continue;
    }
    const puntosDe = (uid) => {
      const fila = ranking.find((f) => f.usuario_id === uid && f.posicion === 1) ||
        ranking.find((f) => f.usuario_id === uid);
      return fila ? fila.puntos : 0;
    };
    for (const uid of nuevos) {
      if (!previos.includes(uid)) {
        emitir({
          tipo: 'lider_nuevo',
          clave: `lider:${qid}:${uid}:${puntosDe(uid)}`,
          usuarios: [uid],
          titulo: '👑 ¡Vas en primer lugar!',
          cuerpo: `Vas líder en ${nombreQuiniela(qid)} con ${puntosDe(uid)} pts (con los marcadores actuales).`,
          url: '/',
        });
      }
    }
    for (const uid of previos) {
      if (!nuevos.includes(uid)) {
        emitir({
          tipo: 'rebasado',
          clave: `rebasado:${qid}:${uid}:${puntosDe(uid)}`,
          usuarios: [uid],
          titulo: '⚠️ Te rebasaron',
          cuerpo: `Ya no vas en primer lugar en ${nombreQuiniela(qid)}. ¡Aún puedes remontar!`,
          url: '/',
        });
      }
    }
    estadoNuevo.lideres[qid] = nuevos;
  }

  return { eventos, estadoNuevo };
}

/**
 * Anota las claves como despachadas (tope FIFO: se conservan las
 * últimas 500 para que el archivo de estado no crezca sin fin).
 */
export function marcarDespachadas(estado, claves) {
  const despachadas = [...(estado.despachadas || [])];
  for (const clave of claves) {
    if (!despachadas.includes(clave)) despachadas.push(clave);
  }
  return { ...estado, despachadas: despachadas.slice(-500) };
}

/** ¿La quiniela cierra dentro del margen (y aún no cierra)? */
export function debeRecordarCierre(fechaCierreIso, ahoraMs, margenMs = 2 * 60 * 60_000) {
  if (!fechaCierreIso) return false;
  const cierre = Date.parse(fechaCierreIso);
  if (Number.isNaN(cierre)) return false;
  const falta = cierre - ahoraMs;
  return falta > 0 && falta <= margenMs;
}

/** Clave de dedupe del recordatorio de cierre (una vez por jugador). */
export function claveRecordatorioCierre(quinielaId, usuarioId) {
  return `cierre:${quinielaId}:${usuarioId}`;
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
