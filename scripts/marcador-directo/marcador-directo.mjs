// scripts/marcador-directo/marcador-directo.mjs
//
// PROGRAMA DE MARCADORES DIRECTOS del Club de Pronósticos.
//
// Mantiene los marcadores de las quinielas ABIERTAS al momento, leyendo
// el feed en vivo premium de TheSportsDB y escribiendo directo a
// Supabase. Es el ÚNICO escritor automático de marcadores: los avances
// ya no dependen de guardar a mano desde el panel (así fue como una vez
// la base marcó FINAL un partido al minuto 35 con el marcador parcial).
//
// Reglas de oro del programa:
//  - Un partido se marca FINAL solo si el feed dice terminado
//    (FT/AET/PEN/AWD). Jamás se adelanta un final.
//  - Durante el juego se confía SOLO en la API premium (regla acordada
//    con Gonzalo el 2026-11-14); no hay segunda fuente escribiendo.
//  - NUNCA cierra ni liquida una quiniela, NUNCA toca
//    goles_totales_real, NUNCA escribe en un partido sin enlace
//    confirmado con la API, y no escribe si el marcador no cambió.
//  - Un fallo de red o de la API se anota y se reintenta al siguiente
//    ciclo; el programa no se cae.
//  - Con la misma pasada detecta eventos de NOTIFICACIÓN push (gol,
//    gol anulado, fin de partido, cambios de liderato y recordatorios
//    de cierre) y los despacha a la app; si el despacho falla, los
//    marcadores ya quedaron y los eventos se reintentan al siguiente
//    ciclo. Sin PUSH_DISPATCH_SECRET no despacha nada.
//
// Uso (desde la raíz del repo, con las dependencias instaladas):
//   node scripts/marcador-directo/marcador-directo.mjs            (continuo)
//   node scripts/marcador-directo/marcador-directo.mjs --dry-run  (continuo, sin escribir)
//   node scripts/marcador-directo/marcador-directo.mjs --once     (una pasada y sale)
//   node scripts/marcador-directo/marcador-directo.mjs --once --dry-run
//   node scripts/marcador-directo/marcador-directo.mjs --interval=15
//
// Configuración: variables de entorno o el .env.local del repo (las del
// sistema tienen prioridad). Ver README.md de esta carpeta.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  calcularRankingProvisional,
  claveRecordatorioCierre,
  construirHerramientasNombres,
  crearEstadoNotificaciones,
  debeRecordarCierre,
  detectarEventosNotificacion,
  marcarDespachadas,
  normalizarNombreEquipo,
  planEscritura,
} from './logica.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(DIR, '..', '..');

// ---------- Log con hora de Mazatlán ------------------------------------

const fmtHoraLog = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mazatlan',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function log(mensaje) {
  console.log(`[${fmtHoraLog.format(new Date())}] ${mensaje}`);
}

// ---------- Argumentos ---------------------------------------------------

const args = process.argv.slice(2);
const MODO_ONCE = args.includes('--once');
const DRY_RUN = args.includes('--dry-run');
const AYUDA = args.includes('--help') || args.includes('-h');
const argIntervalo = args.find((a) => a.startsWith('--interval='));
let intervaloSeg = argIntervalo ? Number(argIntervalo.split('=')[1]) : 20;
if (!Number.isFinite(intervaloSeg)) intervaloSeg = 20;
intervaloSeg = Math.min(30, Math.max(10, Math.trunc(intervaloSeg)));

// Ventana de trabajo: partidos que inician en ≤15 min o que iniciaron
// hace ≤5 h (un partido con prórroga/penales y retrasos cabe de sobra).
const VENTANA_ANTES_MS = 15 * 60_000;
const VENTANA_DESPUES_MS = 5 * 60 * 60_000;

// Catálogo de ligas soportadas (espejo de src/lib/sports/leagues.ts:
// providerId + temporada que usa el proveedor). Solo se usa para buscar
// el enlace de partidos creados a mano sin api_fixture_id.
const LIGAS_CATALOGO = [
  { providerId: '4350', nombre: 'Liga MX', season: '2026-2027' },
  { providerId: '4328', nombre: 'Premier League', season: '2026-2027' },
  { providerId: '4335', nombre: 'La Liga', season: '2026-2027' },
  { providerId: '4332', nombre: 'Serie A', season: '2026-2027' },
  { providerId: '4331', nombre: 'Bundesliga', season: '2026-2027' },
  { providerId: '4334', nombre: 'Ligue 1', season: '2026-2027' },
  { providerId: '4336', nombre: 'Superliga de Grecia', season: '2026-2027' },
  { providerId: '4480', nombre: 'Champions League', season: '2026-2027' },
  { providerId: '4490', nombre: 'Nations League UEFA', season: '2026-2027' },
  { providerId: '5280', nombre: 'Nations League Concacaf', season: '2026-2027' },
  { providerId: '4501', nombre: 'Copa Libertadores', season: '2026' },
];

if (AYUDA) {
  console.log(
    [
      'Programa de marcadores directos del Club de Pronósticos.',
      '',
      '  node scripts/marcador-directo/marcador-directo.mjs [--once] [--dry-run] [--interval=20]',
      '',
      '  --once        Una sola pasada y sale.',
      '  --dry-run     Anota lo que ESCRIBIRÍA, sin escribir en la base.',
      '  --interval=N  Segundos entre ciclos (10 a 30; por defecto 20).',
    ].join('\n')
  );
  process.exit(0);
}

// ---------- Configuración (entorno / .env.local) -------------------------

/** Parser mínimo de .env (sin dependencias): KEY=VALUE por línea. */
function parseEnv(texto) {
  const out = {};
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const clave = t.slice(0, i).trim();
    let valor = t.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    out[clave] = valor;
  }
  return out;
}

async function cargarConfig() {
  let deArchivo = {};
  try {
    deArchivo = parseEnv(await readFile(path.join(RAIZ_REPO, '.env.local'), 'utf8'));
  } catch {
    // Sin .env.local: todo debe venir del entorno.
  }
  const tomar = (...claves) => {
    for (const c of claves) {
      if (process.env[c]) return process.env[c];
    }
    for (const c of claves) {
      if (deArchivo[c]) return deArchivo[c];
    }
    return null;
  };

  const supabaseUrl = tomar('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const serviceRole = tomar('SUPABASE_SERVICE_ROLE_KEY');
  const anon = tomar('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabaseKey = serviceRole || anon;
  const tsdbKey = tomar('THESPORTSDB_API_KEY');
  // Notificaciones push (opcionales): sin PUSH_DISPATCH_SECRET el
  // programa trabaja como siempre y no despacha nada.
  const pushUrl =
    tomar('PUSH_DISPATCH_URL') ||
    'https://ciberteque-quiniela.vercel.app/api/push/despachar';
  const pushSecret = tomar('PUSH_DISPATCH_SECRET');

  const faltan = [];
  if (!supabaseUrl) faltan.push('SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)');
  if (!supabaseKey) faltan.push('SUPABASE_SERVICE_ROLE_KEY (o la anon)');
  if (!tsdbKey) faltan.push('THESPORTSDB_API_KEY');
  if (faltan.length > 0) {
    throw new Error(
      `Falta configuración: ${faltan.join(', ')}. ` +
        'Ponla en el .env.local del repo o como variable de entorno (ver README.md).'
    );
  }
  return {
    supabaseUrl,
    supabaseKey,
    tipoLlave: serviceRole ? 'service_role' : 'anon',
    tsdbKey,
    pushUrl,
    pushSecret,
  };
}

// ---------- Nombres en español (el código de la app, con respaldo) -------

/**
 * Carga nombreEquipoES/normalizarNombreEquipo de la app. Primero intenta
 * importar src/lib/sports/nombresES.ts tal cual (Node ≥23.6 lo lee con
 * type-stripping; en Node 22 corre con --experimental-strip-types). Si
 * no se puede, cae a parsear su tabla ENTRADAS — el formato de esa tabla
 * es estable y está documentado en el propio archivo — y usa la copia
 * del algoritmo de normalización que vive en logica.mjs.
 */
async function cargarNombres() {
  const rutaTs = path.join(RAIZ_REPO, 'src', 'lib', 'sports', 'nombresES.ts');
  try {
    const mod = await import(`file://${rutaTs}`);
    if (
      typeof mod.nombreEquipoES === 'function' &&
      typeof mod.normalizarNombreEquipo === 'function'
    ) {
      return {
        nombreEquipoES: mod.nombreEquipoES,
        normalizar: mod.normalizarNombreEquipo,
        origen: 'código de la app (nombresES.ts importado)',
      };
    }
    throw new Error('el módulo no exporta lo esperado');
  } catch {
    const texto = await readFile(rutaTs, 'utf8');
    const entradas = [
      ...texto.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g),
    ].map((m) => ({ id: m[1], original: m[2], es: m[3] }));
    if (entradas.length === 0) {
      throw new Error('No se pudo cargar la tabla de nombres en español (ENTRADAS).');
    }
    const porId = new Map();
    const porNombre = new Map();
    for (const e of entradas) {
      if (e.original === e.es) continue; // mismo criterio que la app
      porId.set(e.id, e.es);
      porNombre.set(normalizarNombreEquipo(e.original), e.es);
    }
    const nombreEquipoES = (nombreOriginal, teamProviderId) => {
      if (teamProviderId && porId.has(teamProviderId)) return porId.get(teamProviderId);
      return porNombre.get(normalizarNombreEquipo(nombreOriginal)) ?? nombreOriginal;
    };
    return {
      nombreEquipoES,
      normalizar: normalizarNombreEquipo,
      origen: `tabla ENTRADAS de nombresES.ts (${entradas.length} nombres, respaldo)`,
    };
  }
}

// ---------- TheSportsDB ----------------------------------------------------

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** strTimestamp viene en UTC sin la "Z": se normaliza (igual que la app). */
function toUtcIso(ts) {
  if (!ts) return null;
  const t = String(ts).trim();
  if (!t) return null;
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) return t;
  return t.includes('T') ? `${t}Z` : t;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).pathname}`);
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

/** Feed en vivo v2 (premium): UNA llamada trae todos los partidos. */
async function traerEnVivo(tsdbKey) {
  const data = await fetchJson('https://www.thesportsdb.com/api/v2/json/livescore/soccer', {
    'X-API-KEY': tsdbKey,
  });
  return (data?.livescore ?? []).map((raw) => ({
    providerId: String(raw.idEvent),
    statusRaw: raw.strStatus || null,
    progress: raw.strProgress || null,
    homeTeam: raw.strHomeTeam || '',
    awayTeam: raw.strAwayTeam || '',
    homeTeamProviderId: raw.idHomeTeam || null,
    awayTeamProviderId: raw.idAwayTeam || null,
    homeScore: numOrNull(raw.intHomeScore),
    awayScore: numOrNull(raw.intAwayScore),
    kickoffUtc: toUtcIso(raw.strTimestamp),
    date: raw.dateEvent || null,
  }));
}

// Caché de fixtures de temporada por liga (para enlazar partidos sin
// api_fixture_id sin quemar llamadas: la temporada cambia poco).
const cacheTemporadas = new Map(); // providerId -> { en: ms, fixtures }
const TTL_TEMPORADA_MS = 10 * 60_000;

async function traerFixturesTemporada(tsdbKey, liga) {
  const previa = cacheTemporadas.get(liga.providerId);
  if (previa && Date.now() - previa.en < TTL_TEMPORADA_MS) return previa.fixtures;
  const url =
    `https://www.thesportsdb.com/api/v1/json/${tsdbKey}/eventsseason.php` +
    `?id=${encodeURIComponent(liga.providerId)}&s=${encodeURIComponent(liga.season)}`;
  const data = await fetchJson(url);
  const fixtures = (data?.events ?? []).map((raw) => ({
    providerId: String(raw.idEvent),
    homeTeam: raw.strHomeTeam || '',
    awayTeam: raw.strAwayTeam || '',
    homeTeamProviderId: raw.idHomeTeam || null,
    awayTeamProviderId: raw.idAwayTeam || null,
    kickoffUtc: toUtcIso(raw.strTimestamp),
    date: raw.dateEvent || null,
  }));
  cacheTemporadas.set(liga.providerId, { en: Date.now(), fixtures });
  return fixtures;
}

// ---------- Descubrimiento de trabajo --------------------------------------

async function descubrirPartidos(sb, ahoraMs) {
  const { data: quinielas, error: errQ } = await sb
    .from('quinielas')
    .select('id')
    .eq('estado', 'abierta');
  if (errQ) throw new Error(`leyendo quinielas: ${errQ.message}`);
  if (!quinielas || quinielas.length === 0) return [];

  const ids = quinielas.map((q) => q.id);
  const { data: partidos, error: errP } = await sb
    .from('partidos')
    .select(
      'id, quiniela_id, equipo_local, equipo_visitante, fecha_hora_partido, ' +
        'goles_local, goles_visitante, resultado_real, es_final, estado_api, api_fixture_id'
    )
    .in('quiniela_id', ids)
    .eq('es_final', false);
  if (errP) throw new Error(`leyendo partidos: ${errP.message}`);

  return (partidos ?? []).filter((p) => {
    if (!p.fecha_hora_partido) return false;
    const inicio = Date.parse(p.fecha_hora_partido);
    if (Number.isNaN(inicio)) return false;
    return inicio <= ahoraMs + VENTANA_ANTES_MS && inicio >= ahoraMs - VENTANA_DESPUES_MS;
  });
}

// ---------- Notificaciones push ---------------------------------------------
//
// Con la misma pasada que detecta goles y finales, el programa detecta
// eventos de aviso (gol, gol anulado, fin de partido, cambios de
// liderato y recordatorios de cierre) y los manda a /api/push/despachar
// con el secreto. La detección es lógica pura (logica.mjs); aquí solo
// se junta la foto, se despacha y se persiste el estado.
//
// El estado vive en estado-notificaciones.json junto al programa: es
// el dedupe que sobrevive a los reinicios (la ruta también dedupea en
// la base). Si el despacho falla, el estado NO avanza y los eventos se
// regeneran al siguiente ciclo. Y si algo de esto falla, los
// marcadores —que son lo primero— ya quedaron escritos.

const RUTA_ESTADO_NOTIF = path.join(DIR, 'estado-notificaciones.json');

async function cargarEstadoNotificaciones() {
  try {
    const datos = JSON.parse(await readFile(RUTA_ESTADO_NOTIF, 'utf8'));
    if (datos && typeof datos === 'object' && datos.partidos && datos.lideres) {
      return { ...crearEstadoNotificaciones(), ...datos };
    }
  } catch {
    // Sin archivo o corrupto: se arranca con estado vacío (línea base).
  }
  return crearEstadoNotificaciones();
}

async function guardarEstadoNotificaciones(estadoNotif) {
  if (DRY_RUN) return; // el modo seco no persiste nada
  try {
    await writeFile(RUTA_ESTADO_NOTIF, JSON.stringify(estadoNotif), 'utf8');
  } catch (e) {
    log(`Aviso: no se pudo guardar el estado de notificaciones: ${e.message}`);
  }
}

async function despacharEventos(config, eventos) {
  const res = await fetch(config.pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-push-secret': config.pushSecret,
    },
    body: JSON.stringify({ eventos }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`el despachador respondió HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

function describirEvento(e) {
  return `[${e.tipo}] ${e.titulo} — ${e.cuerpo}`;
}

/**
 * Junta la foto (marcadores actuales + ranking provisional de las
 * quinielas con partidos en ventana), detecta eventos y los despacha.
 * `planes` trae los cambios de ESTE ciclo (en seco aún no están en la
 * base; en real ya se escribieron, y sobreponerlos no cambia nada).
 */
async function procesarNotificaciones(sb, config, herramientas, estado, partidosVentana, porId, planes) {
  const quinielaIds = [...new Set(partidosVentana.map((p) => p.quiniela_id))];
  if (quinielaIds.length === 0) return;

  const { data: quinielas, error: errQ } = await sb
    .from('quinielas')
    .select('id, nombre_jornada, modalidad, goles_totales_real')
    .in('id', quinielaIds);
  if (errQ) throw new Error(`leyendo quinielas para notificar: ${errQ.message}`);
  const quinielaPorId = new Map((quinielas ?? []).map((q) => [q.id, q]));

  const { data: partidosQ, error: errP } = await sb
    .from('partidos')
    .select(
      'id, quiniela_id, equipo_local, equipo_visitante, goles_local, goles_visitante, ' +
        'resultado_real, es_final, api_fixture_id'
    )
    .in('quiniela_id', quinielaIds);
  if (errP) throw new Error(`leyendo partidos para notificar: ${errP.message}`);

  const partidosFoto = (partidosQ ?? []).map((p) => {
    const fila = { ...p };
    const plan = planes.get(p.id);
    if (plan) Object.assign(fila, plan);
    // IDs de proveedor por equipo (para la audiencia de Siguiendo ⭐):
    // salen del feed de este ciclo, cruzados a la orientación de la base.
    let localProviderId = null;
    let visitanteProviderId = null;
    const feed = fila.api_fixture_id ? porId.get(String(fila.api_fixture_id)) : null;
    if (feed) {
      const orient = herramientas.orientacion(fila, feed);
      if (orient === 'directo') {
        localProviderId = feed.homeTeamProviderId;
        visitanteProviderId = feed.awayTeamProviderId;
      } else if (orient === 'cruzado') {
        localProviderId = feed.awayTeamProviderId;
        visitanteProviderId = feed.homeTeamProviderId;
      }
    }
    return {
      ...fila,
      equipo_local_provider_id: localProviderId,
      equipo_visitante_provider_id: visitanteProviderId,
    };
  });

  const rankings = {};
  for (const qid of quinielaIds) {
    const quiniela = quinielaPorId.get(qid);
    if (!quiniela || quiniela.modalidad === 'sorteo') continue;
    const { data: tickets, error: errT } = await sb
      .from('tickets')
      .select('id, usuario_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)')
      .eq('quiniela_id', qid);
    if (errT) throw new Error(`leyendo tickets para notificar: ${errT.message}`);
    rankings[qid] = calcularRankingProvisional(
      quiniela,
      tickets ?? [],
      partidosFoto.filter((p) => p.quiniela_id === qid)
    );
  }

  const foto = {
    partidos: partidosFoto,
    quinielas: Object.fromEntries(
      [...quinielaPorId.values()].map((q) => [q.id, { nombre: q.nombre_jornada }])
    ),
    rankings,
  };

  const { eventos, estadoNuevo } = detectarEventosNotificacion(estado.notif, foto);

  if (eventos.length === 0) {
    estado.notif = estadoNuevo;
    await guardarEstadoNotificaciones(estado.notif);
    return;
  }

  if (DRY_RUN) {
    for (const e of eventos) log(`NOTIFICARÍA: ${describirEvento(e)} (clave ${e.clave})`);
    return; // en seco el estado no avanza ni se persiste
  }

  const resultado = await despacharEventos(config, eventos);
  estado.notif = marcarDespachadas(
    estadoNuevo,
    eventos.map((e) => e.clave)
  );
  await guardarEstadoNotificaciones(estado.notif);
  log(
    `Notificaciones: ${eventos.length} evento(s) despachados · ` +
      `enviados ${resultado.enviados ?? '?'} · omitidos ${resultado.omitidos ?? '?'} · ` +
      `suscripciones limpiadas ${resultado.limpiadas ?? '?'}` +
      (resultado.sin_dedupe ? ' · OJO: la ruta no encontró la tabla de dedupe (¿corriste la migración?)' : '')
  );
}

const fmtHoraCierre = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mazatlan',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Recordatorios de cierre: quinielas abiertas que cierran en menos de
 * 2 h; avisa una sola vez a cada jugador SIN boleto en esa quiniela.
 * Se revisa como mucho una vez por minuto (no depende de que haya
 * partidos en ventana).
 */
async function chequearCierres(sb, config, estado, ahoraMs) {
  if (ahoraMs - estado.ultimoChequeoCierre < 60_000) return;
  estado.ultimoChequeoCierre = ahoraMs;

  const { data: quinielas, error } = await sb
    .from('quinielas')
    .select('id, nombre_jornada, fecha_cierre')
    .eq('estado', 'abierta');
  if (error) throw new Error(`leyendo cierres: ${error.message}`);

  const porCerrar = (quinielas ?? []).filter((q) =>
    debeRecordarCierre(q.fecha_cierre, ahoraMs)
  );
  if (porCerrar.length === 0) return;

  const { data: usuarios, error: errU } = await sb.from('usuarios').select('id');
  if (errU) throw new Error(`leyendo usuarios para cierres: ${errU.message}`);
  const todos = (usuarios ?? []).map((u) => String(u.id));

  const eventos = [];
  for (const q of porCerrar) {
    const { data: tickets } = await sb
      .from('tickets')
      .select('usuario_id')
      .eq('quiniela_id', q.id);
    const conBoleto = new Set((tickets ?? []).map((t) => String(t.usuario_id)));
    const hora = fmtHoraCierre.format(new Date(q.fecha_cierre));
    for (const uid of todos) {
      if (conBoleto.has(uid)) continue;
      const clave = claveRecordatorioCierre(q.id, uid);
      if (estado.notif.despachadas.includes(clave)) continue;
      eventos.push({
        tipo: 'recordatorio_cierre',
        clave,
        usuarios: [uid],
        titulo: '⏰ La quiniela cierra pronto',
        cuerpo: `${q.nombre_jornada} cierra a las ${hora} y aún no tienes boleto. ¡No te quedes fuera!`,
        url: '/',
      });
    }
  }
  if (eventos.length === 0) return;

  if (DRY_RUN) {
    for (const e of eventos) log(`NOTIFICARÍA: ${describirEvento(e)} (clave ${e.clave})`);
    return;
  }

  const resultado = await despacharEventos(config, eventos);
  estado.notif = marcarDespachadas(
    estado.notif,
    eventos.map((e) => e.clave)
  );
  await guardarEstadoNotificaciones(estado.notif);
  log(
    `Recordatorios de cierre: ${eventos.length} jugador(es) sin boleto · ` +
      `enviados ${resultado.enviados ?? '?'}`
  );
}

// ---------- Un ciclo --------------------------------------------------------

async function ciclo(sb, config, herramientas, estado) {
  const ahoraMs = Date.now();
  const partidos = await descubrirPartidos(sb, ahoraMs);

  // Recordatorios de cierre: corren aunque no haya partidos en
  // ventana (el cierre suele ser horas antes del primer partido).
  if (config.pushSecret || DRY_RUN) {
    try {
      await chequearCierres(sb, config, estado, ahoraMs);
    } catch (e) {
      log(`Aviso: el chequeo de cierres falló: ${e.message}`);
    }
  }

  if (partidos.length === 0) {
    if (ahoraMs - estado.ultimoAvisoSinTrabajo >= 5 * 60_000) {
      log('Sin partidos en ventana en las quinielas abiertas; sigo revisando.');
      estado.ultimoAvisoSinTrabajo = ahoraMs;
    }
    return;
  }

  log(
    `En ventana: ${partidos.length} partido(s): ` +
      partidos.map((p) => `${p.equipo_local} vs ${p.equipo_visitante}`).join(' · ')
  );

  // 1) Enlace de los que no tienen api_fixture_id (p. ej. la jornada
  //    creada a mano). Solo con candidato único y confiado.
  const sinEnlace = partidos.filter((p) => !p.api_fixture_id);
  if (sinEnlace.length > 0) {
    let fixturesTodas = estado.fixturesTodas;
    if (!fixturesTodas || ahoraMs - estado.fixturesTodasEn >= TTL_TEMPORADA_MS) {
      fixturesTodas = [];
      for (const liga of LIGAS_CATALOGO) {
        try {
          fixturesTodas.push(...(await traerFixturesTemporada(config.tsdbKey, liga)));
        } catch (e) {
          log(`Aviso: no se pudo traer la temporada de ${liga.nombre}: ${e.message}`);
        }
      }
      estado.fixturesTodas = fixturesTodas;
      estado.fixturesTodasEn = ahoraMs;
    }
    const reclamados = new Set(
      partidos.filter((p) => p.api_fixture_id).map((p) => String(p.api_fixture_id))
    );
    for (const partido of sinEnlace) {
      const r = herramientas.buscarEnlace(partido, fixturesTodas, reclamados);
      if (!r.fixture) {
        log(
          `Sin enlace para ${partido.equipo_local} vs ${partido.equipo_visitante}: ${r.motivo}. Se salta.`
        );
        continue;
      }
      reclamados.add(r.fixture.providerId);
      partido.api_fixture_id = r.fixture.providerId;
      if (DRY_RUN) {
        log(
          `ENLACE (seco): ${partido.equipo_local} vs ${partido.equipo_visitante} → api_fixture_id=${r.fixture.providerId}. No se guardó.`
        );
      } else {
        const { error } = await sb
          .from('partidos')
          .update({ api_fixture_id: r.fixture.providerId })
          .eq('id', partido.id);
        if (error) {
          log(`Error guardando el enlace de ${partido.equipo_local}: ${error.message}`);
          partido.api_fixture_id = null;
        } else {
          log(
            `Enlazado: ${partido.equipo_local} vs ${partido.equipo_visitante} → api_fixture_id=${r.fixture.providerId}`
          );
        }
      }
    }
  }

  const enlazados = partidos.filter((p) => p.api_fixture_id);
  const porId = new Map();
  const planes = new Map();

  if (enlazados.length > 0) {
    // 2) Una sola llamada al feed en vivo para todos.
    const enVivo = await traerEnVivo(config.tsdbKey);
    for (const f of enVivo) porId.set(f.providerId, f);

    // 3) Decidir y (salvo dry-run) escribir, partido por partido.
    for (const partido of enlazados) {
      const feed = porId.get(String(partido.api_fixture_id));
      if (!feed) continue; // aún no aparece en el feed: nada que hacer
      const plan = planEscritura(partido, feed, herramientas, ahoraMs);
      if (plan.accion === 'nada') continue;
      planes.set(partido.id, plan.cambios);
      const antes =
        `${partido.goles_local ?? '–'}-${partido.goles_visitante ?? '–'}` +
        (partido.es_final ? ' (FINAL)' : '');
      if (DRY_RUN) {
        log(`ESCRIBIRÍA: ${plan.resumen} · antes ${antes} · final=${plan.esFinal ? 'sí' : 'no'}`);
        continue;
      }
      const { error } = await sb
        .from('partidos')
        .update(plan.cambios)
        .eq('id', partido.id)
        .eq('es_final', false); // doble candado: jamás resucitar un final
      if (error) {
        log(`Error escribiendo ${plan.resumen}: ${error.message}`);
      } else {
        log(
          `Marcador: ${plan.resumen} · antes ${antes} · final=${plan.esFinal ? 'sí' : 'no'}`
        );
      }
    }
  }

  // 4) Notificaciones push: al final del ciclo y sin poder tumbarlo;
  //    los marcadores ya quedaron escritos, que son lo primero.
  if (config.pushSecret || DRY_RUN) {
    try {
      await procesarNotificaciones(sb, config, herramientas, estado, partidos, porId, planes);
    } catch (e) {
      log(`Aviso: las notificaciones fallaron este ciclo: ${e.message}`);
    }
  }
}

// ---------- Programa principal ----------------------------------------------

let detenido = false;
process.on('SIGINT', () => {
  detenido = true;
});
process.on('SIGTERM', () => {
  detenido = true;
});

function dormir(ms) {
  return new Promise((resolve) => {
    const fin = Date.now() + ms;
    const tick = () => {
      if (detenido || Date.now() >= fin) return resolve();
      setTimeout(tick, Math.min(250, fin - Date.now()));
    };
    tick();
  });
}

async function main() {
  const config = await cargarConfig();
  const nombres = await cargarNombres();
  const herramientas = construirHerramientasNombres(
    nombres.nombreEquipoES,
    nombres.normalizar
  );
  const sb = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(
    `Marcadores directos iniciado · llave Supabase: ${config.tipoLlave}` +
      ` · nombres: ${nombres.origen}` +
      ` · intervalo ${intervaloSeg}s${DRY_RUN ? ' · MODO SECO (no escribe)' : ''}` +
      `${MODO_ONCE ? ' · una sola pasada' : ''}`
  );
  if (config.tipoLlave === 'anon') {
    log(
      'Aviso: usando la llave anónima. Funciona mientras RLS esté apagado; ' +
        'la correcta a futuro es SUPABASE_SERVICE_ROLE_KEY (ver README.md).'
    );
  }

  const estado = {
    ultimoAvisoSinTrabajo: 0,
    fixturesTodas: null,
    fixturesTodasEn: 0,
    ultimoChequeoCierre: 0,
    notif: await cargarEstadoNotificaciones(),
  };
  log(
    config.pushSecret
      ? `Notificaciones push: activas (despacho a ${new URL(config.pushUrl).host}).`
      : 'Notificaciones push: desactivadas (falta PUSH_DISPATCH_SECRET); los marcadores trabajan igual.'
  );

  do {
    try {
      await ciclo(sb, config, herramientas, estado);
    } catch (e) {
      log(`Error en el ciclo (se reintenta al siguiente): ${e.message}`);
    }
    if (MODO_ONCE || detenido) break;
    await dormir(intervaloSeg * 1000);
  } while (!detenido);

  log('Marcadores directos detenido. Hasta luego.');
}

main().catch((e) => {
  console.error(`No se pudo iniciar: ${e.message}`);
  process.exit(1);
});
