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
//  - NUNCA escribe en un partido sin enlace confirmado con la API,
//    y no escribe si el marcador no cambió.
//  - La LIQUIDACIÓN AUTOMÁTICA (autorizada por Gonzalo el 2026-11-17)
//    es la única excepción al "nunca cierra": liquida quinielas por
//    puntos (NO sorteo) cuando TODOS sus partidos están finales y una
//    ventana de seguridad de 10 minutos pasa sin cambios en los
//    marcadores, replicando paso a paso la liquidación manual de la
//    app (ver liquidacion.mjs). Se apaga con LIQUIDACION_AUTO=off.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
import {
  construirPlanLiquidacion,
  crearEstadoLiquidaciones,
  descripcionPremio,
  evaluarElegibilidad,
  evaluarVentana,
  fotoMarcadores,
  ganadoresPendientes,
  golesTotalesEfectivos,
  planPagoPremio,
} from './liquidacion.mjs';

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
      '                También simula la liquidación automática ("LIQUIDARÍA: …").',
      '  --interval=N  Segundos entre ciclos (10 a 30; por defecto 20).',
      '',
      'Liquidación automática (autorizada por Gonzalo, 2026-11-17):',
      '  LIQUIDACION_AUTO=off        La apaga (default: activa).',
      '  LIQUIDACION_VENTANA_MIN=N   Ventana de seguridad en minutos (default 10, máx 10).',
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
  // Liquidación automática (autorizada por Gonzalo el 2026-11-17):
  // activa por defecto; LIQUIDACION_AUTO=off la apaga sin tocar
  // código. La ventana de seguridad es de 10 minutos y NUNCA más de
  // 10 (instrucción expresa de Gonzalo): LIQUIDACION_VENTANA_MIN solo
  // puede acortarla.
  const liquidacionAuto =
    (tomar('LIQUIDACION_AUTO') || 'on').trim().toLowerCase() !== 'off';
  let ventanaMin = Number(tomar('LIQUIDACION_VENTANA_MIN') ?? 10);
  if (!Number.isFinite(ventanaMin)) ventanaMin = 10;
  ventanaMin = Math.min(10, Math.max(0, ventanaMin));

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
    liquidacionAuto,
    ventanaMs: Math.round(ventanaMin * 60_000),
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

/** Minuto de juego desde el progreso crudo del feed ("68", "45+2"). */
function minutoDeProgreso(progreso) {
  const m = /^(\d+)/.exec(String(progreso ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * Filas para la tabla eventos_minuto (⚡ Minuto a minuto del Club) a
 * partir de los eventos de notificación ya detectados: un renglón por
 * gol (sale del evento gol_equipo; el gol_boleto es el mismo gol),
 * por gol anulado y por fin de partido. La `clave` es la misma dedupe
 * de los push y la tabla la tiene como única, así un reintento o un
 * reinicio nunca duplica el renglón (el guardado ignora duplicados).
 */
function filasEventosMinuto(eventos, minutosPorPartido) {
  const filas = [];
  for (const e of eventos) {
    if (!e.partido_id) continue;
    const comun = {
      partido_id: e.partido_id,
      quiniela_id: e.quiniela_id ?? null,
      goles_local: e.goles_local ?? null,
      goles_visitante: e.goles_visitante ?? null,
      minuto: minutosPorPartido.get(e.partido_id) ?? null,
    };
    if (e.tipo === 'gol_equipo') {
      filas.push({
        ...comun,
        tipo: 'gol',
        equipo_anoto: e.equipo_anoto ?? null,
        clave: `gol:${e.partido_id}:${e.goles_local}-${e.goles_visitante}`,
      });
    } else if (e.tipo === 'gol_anulado') {
      filas.push({ ...comun, tipo: 'gol_anulado', equipo_anoto: null, clave: e.clave });
    } else if (e.tipo === 'fin_partido') {
      filas.push({ ...comun, tipo: 'fin_partido', equipo_anoto: null, minuto: null, clave: e.clave });
    }
  }
  return filas;
}

/** Guarda las filas en eventos_minuto (el llamador lo trata best-effort). */
async function registrarEventosMinuto(sb, eventos, minutosPorPartido) {
  const filas = filasEventosMinuto(eventos, minutosPorPartido);
  if (filas.length === 0) return;
  const { error } = await sb
    .from('eventos_minuto')
    .upsert(filas, { onConflict: 'clave', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  log(`Minuto a minuto: ${filas.length} evento(s) del Club guardados.`);
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

  // Minuto del feed por partido del Club (para eventos_minuto).
  const minutosPorPartido = new Map();
  for (const p of partidosFoto) {
    const feed = p.api_fixture_id ? porId.get(String(p.api_fixture_id)) : null;
    const minuto = feed ? minutoDeProgreso(feed.progress) : null;
    if (minuto !== null) minutosPorPartido.set(p.id, minuto);
  }

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

  // ⚡ Minuto a minuto del Club: los mismos eventos alimentan la tabla
  // eventos_minuto que lee la app (la Liga MX no trae línea de tiempo
  // del proveedor). Best-effort y con dedupe por clave: si el despacho
  // push falla y el evento se regenera al siguiente ciclo, la fila no
  // se duplica.
  if (DRY_RUN) {
    for (const f of filasEventosMinuto(eventos, minutosPorPartido)) {
      log(
        `GUARDARÍA EVENTO MINUTO: [${f.tipo}] ${f.goles_local}-${f.goles_visitante}` +
          `${f.equipo_anoto ? ` · anotó ${f.equipo_anoto}` : ''} (clave ${f.clave})`
      );
    }
  } else if (eventos.length > 0) {
    try {
      await registrarEventosMinuto(sb, eventos, minutosPorPartido);
    } catch (e) {
      log(`Aviso: los eventos del Minuto a minuto no se guardaron este ciclo: ${e.message}`);
    }
  }

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

// ---------- Liquidación automática ------------------------------------------
//
// Autorizada por Gonzalo el 2026-11-17 (sustituye su clic en CERRAR Y
// LIQUIDAR). Replica la liquidación manual de la app en su mismo orden
// de escrituras (cerrarJornadaDefinitivo, useArbitro.ts):
//   1) puntos_totales de cada boleto (el GUARDAR AVANCE final),
//   2) quinielas: goles_totales_real + estado 'cerrada',
//   3) pago de cada premio (procesarPagoPremio: cobro de deuda y
//      movimientos premio_quiniela/abono_deuda),
//   4) notificaciones internas de resultado (best-effort),
//   5) push de "premio acreditado" (el disparador del tipo premio).
//
// Seguridad:
//  - Solo modos por puntos; el sorteo NUNCA se liquida solo.
//  - Ventana de seguridad (10 min, persistida): si cualquier marcador
//    cambia durante la ventana, el conteo se reinicia.
//  - Candado de cierre: la quiniela se re-lee justo antes de cerrar y
//    el update exige estado='abierta'; si alguien la cerró por otro
//    medio, NO se paga nada y queda registrado.
//  - Diario por quiniela (estado-liquidaciones.json) escrito ANTES de
//    la primera escritura en base: si el programa se corta a mitad de
//    los pagos, al volver reanuda SOLO lo que falta. Cada pago lleva
//    su propia etapa persistida (pagando → saldo → completo) para no
//    acreditar dos veces ni dejar movimientos sin dinero; si el saldo
//    de un ganador no cuadra ni con el antes ni con el después, la
//    quiniela se BLOQUEA para revisión manual (archivo REVISAR-*.txt)
//    en vez de seguir pagando a ciegas.

const RUTA_ESTADO_LIQ = path.join(DIR, 'estado-liquidaciones.json');
const DIR_RESUMENES = path.join(DIR, 'liquidaciones');

async function cargarEstadoLiquidaciones() {
  try {
    const datos = JSON.parse(await readFile(RUTA_ESTADO_LIQ, 'utf8'));
    if (datos && typeof datos === 'object' && datos.ventanas && datos.enCurso && datos.liquidadas) {
      return { ...crearEstadoLiquidaciones(), ...datos };
    }
  } catch {
    // Sin archivo o corrupto: se arranca sin ventanas ni diarios.
  }
  return crearEstadoLiquidaciones();
}

async function guardarEstadoLiquidaciones(liq) {
  if (DRY_RUN) return; // el modo seco no persiste nada
  try {
    await writeFile(RUTA_ESTADO_LIQ, JSON.stringify(liq), 'utf8');
  } catch (e) {
    log(`Aviso: no se pudo guardar el estado de liquidaciones: ${e.message}`);
  }
}

const CAMPOS_QUINIELA_LIQ =
  'id, nombre_jornada, precio_ticket, tipo_premiacion, modalidad, estado, goles_totales_real';

async function leerPartidosQuiniela(sb, qid) {
  const { data, error } = await sb
    .from('partidos')
    .select('id, quiniela_id, goles_local, goles_visitante, resultado_real, es_final')
    .eq('quiniela_id', qid);
  if (error) throw new Error(`leyendo partidos de la quiniela: ${error.message}`);
  return data ?? [];
}

async function leerTicketsQuiniela(sb, qid) {
  const { data, error } = await sb
    .from('tickets')
    .select('id, usuario_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)')
    .eq('quiniela_id', qid);
  if (error) throw new Error(`leyendo boletos de la quiniela: ${error.message}`);
  return data ?? [];
}

async function leerNombresUsuarios(sb, tickets) {
  const ids = [...new Set((tickets ?? []).map((t) => t.usuario_id).filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await sb.from('usuarios').select('id, nombre').in('id', ids);
  if (error) throw new Error(`leyendo nombres de usuarios: ${error.message}`);
  const mapa = {};
  for (const u of data ?? []) mapa[u.id] = u.nombre;
  return mapa;
}

const dinero = (n) => `$${Number(n ?? 0).toFixed(2)}`;

/**
 * Paga UN premio con la secuencia crash-safe del diario:
 *   (sin etapa) → se anota la intención con el plan y el saldo previo
 *   'pagando'   → se confirma/aplica la actualización de `usuarios`
 *   'saldo'     → se insertan los movimientos del plan
 *   'completo'  → no se vuelve a tocar jamás
 * Si al confirmar el saldo no cuadra ni con el previo ni con el
 * posterior, marca el pago 'bloqueado' y detiene la quiniela entera.
 */
async function pagarPremio(sb, estado, diario, ganador) {
  const uid = ganador.usuario_id;
  let det = diario.detallePagos[uid];

  if (!det) {
    // Candado por movimientos: si el premio de esta jornada ya existe
    // en transacciones (liquidación manual previa o un intento viejo),
    // no se acredita otra vez; queda marcado para revisión.
    const descripcion = descripcionPremio(ganador, diario.nombre);
    const { data: previos } = await sb
      .from('transacciones_creditos')
      .select('id, cantidad')
      .eq('usuario_id', uid)
      .eq('tipo_movimiento', 'premio_quiniela')
      .eq('descripcion', descripcion);
    if ((previos ?? []).some((t) => Number(t.cantidad) === Number(ganador.cantidad))) {
      det = { etapa: 'completo', yaExistia: true, cobroDeuda: 0, nuevoSaldo: null };
      diario.detallePagos[uid] = det;
      if (!diario.pagados.includes(uid)) diario.pagados.push(uid);
      await guardarEstadoLiquidaciones(estado.liq);
      log(
        `LIQUIDACIÓN ${diario.nombre}: ⚠️ ya existe el movimiento "${descripcion}" por ${dinero(ganador.cantidad)} ` +
          `para ${ganador.nombre}; se toma como pagado SIN volver a acreditar. Revisar a mano.`
      );
      return det;
    }

    const { data: userData, error: errL } = await sb
      .from('usuarios')
      .select('id, creditos_disponibles, saldo_pesos, deuda_pesos')
      .eq('id', uid)
      .single();
    if (errL || !userData) {
      throw new Error(`leyendo el saldo de ${ganador.nombre}: ${errL?.message ?? 'sin renglón de usuario'}`);
    }
    const plan = planPagoPremio(userData, ganador.cantidad, descripcion);
    det = {
      etapa: 'pagando',
      plan,
      saldoPrevioTotal: plan.saldoActual,
      saldoPrevioDeuda: plan.deudaInicial,
      cobroDeuda: plan.cobroDeuda,
      nuevoSaldo: plan.nuevoSaldo,
    };
    diario.detallePagos[uid] = det;
    await guardarEstadoLiquidaciones(estado.liq);
  }

  if (det.etapa === 'pagando') {
    const { data: userData, error: errL } = await sb
      .from('usuarios')
      .select('creditos_disponibles, saldo_pesos, deuda_pesos')
      .eq('id', uid)
      .single();
    if (errL || !userData) {
      throw new Error(`releyendo el saldo de ${ganador.nombre}: ${errL?.message ?? 'sin renglón de usuario'}`);
    }
    const totalActual =
      Number(userData.creditos_disponibles || 0) + Number(userData.saldo_pesos || 0);
    const deudaActual = Math.abs(Number(userData.deuda_pesos || 0));
    if (totalActual === det.plan.nuevoSaldo && deudaActual === det.plan.deudaRestante) {
      det.etapa = 'saldo'; // la actualización ya estaba aplicada
      await guardarEstadoLiquidaciones(estado.liq);
    } else if (totalActual === det.saldoPrevioTotal && deudaActual === det.saldoPrevioDeuda) {
      const { error: errU } = await sb
        .from('usuarios')
        .update(det.plan.actualizacion)
        .eq('id', uid);
      if (errU) throw new Error(`actualizando el saldo de ${ganador.nombre}: ${errU.message}`);
      det.etapa = 'saldo';
      await guardarEstadoLiquidaciones(estado.liq);
    } else {
      det.etapa = 'bloqueado';
      diario.bloqueada =
        `El saldo de ${ganador.nombre} no coincide ni con el estado previo al pago ` +
        `(total ${dinero(det.saldoPrevioTotal)}, deuda ${dinero(det.saldoPrevioDeuda)}) ni con el posterior ` +
        `(total ${dinero(det.plan.nuevoSaldo)}, deuda ${dinero(det.plan.deudaRestante)}); ` +
        `lo actual es total ${dinero(totalActual)}, deuda ${dinero(deudaActual)}. ` +
        'La liquidación de esta quiniela se detuvo para revisión manual: los ganadores restantes NO se pagaron.';
      await guardarEstadoLiquidaciones(estado.liq);
      await escribirAlertaRevision(diario).catch(() => {});
      throw new Error(diario.bloqueada);
    }
  }

  if (det.etapa === 'saldo') {
    const { error: errT } = await sb
      .from('transacciones_creditos')
      .insert(det.plan.transacciones);
    if (errT) {
      throw new Error(
        `registrando los movimientos de ${ganador.nombre}: ${errT.message} ` +
          '(el saldo YA quedó actualizado; el reintento solo inserta los movimientos)'
      );
    }
    det.etapa = 'completo';
    if (!diario.pagados.includes(uid)) diario.pagados.push(uid);
    await guardarEstadoLiquidaciones(estado.liq);
  }

  return det;
}

/** Notificaciones internas de resultado, como las del cierre manual. */
async function insertarNotificacionesInternas(sb, diario) {
  const { data: usuarios, error } = await sb.from('usuarios').select('id');
  if (error) throw new Error(error.message);
  const idsGanadores = new Set(diario.ganadores.map((g) => g.usuario_id));
  // La app excluye al usuario admin autenticado; el programa no tiene
  // sesión, así que el aviso interno llega a todos (incluido Gonzalo).
  const filas = (usuarios ?? []).map((u) => ({
    usuario_emisor_id: null,
    usuario_receptor_id: u.id,
    tipo: 'resultado',
    contenido: idsGanadores.has(u.id)
      ? `te felicita porque GANASTE en la ${diario.nombre} 🏆. ¡Tu premio ha sido procesado (se descontaron deudas pendientes si tenías)!`
      : `cerró oficialmente la ${diario.nombre}. 🏁 Los premios han sido repartidos, ¡revisa el podio!`,
  }));
  if (filas.length === 0) return;
  const { error: errI } = await sb.from('notificaciones').insert(filas);
  if (errI) throw new Error(errI.message);
}

function textoResumenLiquidacion(diario) {
  const lineas = [
    `🏆 LIQUIDACIÓN AUTOMÁTICA — ${diario.nombre}`,
    `Modalidad: ${diario.modalidad} · Premiación: ${diario.tipoPremiacion} · Boletos: ${diario.numBoletos} × ${dinero(diario.precioTicket)}`,
    `Caja total: ${dinero(diario.totalRecaudado)} · Bolsa de premios (80%): ${dinero(diario.bolsaPremios)} · Comisión (20%): ${dinero(diario.comision)}`,
    `Goles totales: ${diario.golesTotalesReal}`,
    '',
    'Desglose (el de la app):' + (diario.desgloseTexto || ' sin ganadores.'),
    '',
    'Tabla final:',
    ...diario.tabla.map(
      (f) => `${f.posicion}. ${f.nombre} — ${f.puntos} pts · DIF ${f.golesDiff}`
    ),
    '',
    'Pagos:',
  ];
  if (diario.ganadores.length === 0) lineas.push('- Sin ganadores: la bolsa queda en caja.');
  for (const g of diario.ganadores) {
    const det = diario.detallePagos[g.usuario_id] || {};
    if (det.yaExistia) {
      lineas.push(`- ${g.nombre} — ${g.lugar} — ${dinero(g.cantidad)} · YA EXISTÍA el movimiento (no se acreditó de nuevo; revisar)`);
    } else {
      lineas.push(
        `- ${g.nombre} — ${g.lugar} — premio ${dinero(g.cantidad)}` +
          (det.cobroDeuda > 0 ? ` · cobro de deuda ${dinero(det.cobroDeuda)}` : '') +
          (det.nuevoSaldo !== null && det.nuevoSaldo !== undefined
            ? ` · saldo resultante ${dinero(det.nuevoSaldo)}`
            : '')
      );
    }
  }
  return lineas.join('\n');
}

const slugNombre = (s) =>
  String(s ?? 'quiniela')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'quiniela';

async function escribirResumenLiquidacion(diario, texto) {
  await mkdir(DIR_RESUMENES, { recursive: true });
  const ruta = path.join(
    DIR_RESUMENES,
    `liquidacion-${slugNombre(diario.nombre)}-${String(diario.qid).slice(0, 8)}.txt`
  );
  await writeFile(ruta, texto + '\n', 'utf8');
  return ruta;
}

async function escribirAlertaRevision(diario) {
  await mkdir(DIR_RESUMENES, { recursive: true });
  const ruta = path.join(
    DIR_RESUMENES,
    `REVISAR-liquidacion-${slugNombre(diario.nombre)}-${String(diario.qid).slice(0, 8)}.txt`
  );
  const texto =
    `⚠️ LIQUIDACIÓN DETENIDA PARA REVISIÓN MANUAL — ${diario.nombre}\n\n` +
    `${diario.bloqueada ?? 'Motivo no registrado.'}\n\n` +
    `Quiniela: ${diario.qid}\n` +
    `Cerrada en base por el programa: ${diario.cerradaEnBase ? 'sí' : 'no'}\n` +
    `Ganadores del plan: ${diario.ganadores.map((g) => `${g.nombre} ${dinero(g.cantidad)}`).join(' · ') || 'ninguno'}\n` +
    `Pagados por completo: ${diario.pagados.length} de ${diario.ganadores.length}\n` +
    'El detalle por ganador vive en estado-liquidaciones.json (diario enCurso). ' +
    'Para reanudar tras corregir a mano, ajusta el diario o borra la entrada enCurso de esta quiniela.\n';
  await writeFile(ruta, texto, 'utf8');
  log(`LIQUIDACIÓN ${diario.nombre}: alerta de revisión guardada en ${ruta}`);
  return ruta;
}

/** Aborta el cierre porque la quiniela apareció cerrada por otro medio. */
async function abortarPorCierreAjeno(sb, config, estado, diario, estadoVisto) {
  diario.abortada =
    `la quiniela apareció como "${estadoVisto}" antes de que el programa la cerrara ` +
    '(¿liquidación manual en paralelo?). NO se pagó ningún premio desde el programa.';
  log(`LIQUIDACIÓN ${diario.nombre}: ⚠️ ABORTADA — ${diario.abortada}`);
  estado.liq.liquidadas[diario.qid] = {
    nombre: diario.nombre,
    en: new Date().toISOString(),
    resultado: 'abortada',
    detalle: diario.abortada,
  };
  delete estado.liq.enCurso[diario.qid];
  delete estado.liq.ventanas[diario.qid];
  await guardarEstadoLiquidaciones(estado.liq);
}

/**
 * Ejecuta (o reanuda) la liquidación de UNA quiniela siguiendo el
 * diario. Lanza en caso de error transitorio: el llamador anota y el
 * próximo ciclo reanuda donde el diario quedó.
 */
async function ejecutarLiquidacion(sb, config, estado, qid) {
  let diario = estado.liq.enCurso[qid];

  if (!diario) {
    const { data: q, error: errQ } = await sb
      .from('quinielas')
      .select(CAMPOS_QUINIELA_LIQ)
      .eq('id', qid)
      .single();
    if (errQ || !q) {
      delete estado.liq.ventanas[qid];
      await guardarEstadoLiquidaciones(estado.liq);
      return;
    }
    if (q.estado !== 'abierta') {
      log(
        `Liquidación automática: ${q.nombre_jornada} ya está cerrada (no por el programa); no se liquida.`
      );
      delete estado.liq.ventanas[qid];
      await guardarEstadoLiquidaciones(estado.liq);
      return;
    }
    const partidos = await leerPartidosQuiniela(sb, qid);
    const tickets = await leerTicketsQuiniela(sb, qid);
    if (tickets.length === 0) {
      log(`Liquidación automática: ${q.nombre_jornada} no tiene boletos; no hay nada que liquidar.`);
      delete estado.liq.ventanas[qid];
      await guardarEstadoLiquidaciones(estado.liq);
      return;
    }
    const nombres = await leerNombresUsuarios(sb, tickets);
    const plan = construirPlanLiquidacion(q, tickets, partidos, nombres);
    diario = {
      qid,
      nombre: q.nombre_jornada,
      modalidad: q.modalidad,
      tipoPremiacion: q.tipo_premiacion || 'unico',
      precioTicket: q.precio_ticket ?? 30,
      iniciadoEn: new Date().toISOString(),
      golesTotalesReal: plan.golesTotalesReal,
      numBoletos: tickets.length,
      totalRecaudado: plan.totalRecaudado,
      bolsaPremios: plan.bolsaPremios,
      comision: plan.comision,
      desgloseTexto: plan.desgloseTexto,
      tabla: plan.tabla,
      ganadores: plan.ganadores,
      puntosPorTicket: plan.puntosPorTicket,
      puntosEscritos: false,
      cerradaEnBase: false,
      pagados: [],
      detallePagos: {},
      notifInterna: false,
      notifIntentos: 0,
      pushEnviado: false,
      pushIntentos: 0,
    };
    estado.liq.enCurso[qid] = diario;
    // El diario queda en disco ANTES de la primera escritura en base.
    await guardarEstadoLiquidaciones(estado.liq);
    log(
      `Liquidación automática: liquidando ${diario.nombre} — caja ${dinero(plan.totalRecaudado)}, ` +
        `bolsa ${dinero(plan.bolsaPremios)}, ${plan.ganadores.length} ganador(es).`
    );
  }

  if (diario.bloqueada) return; // ya se alertó; no se insiste

  // 1) puntos_totales (el equivalente al GUARDAR AVANCE final).
  if (!diario.puntosEscritos) {
    for (const [ticketId, pts] of Object.entries(diario.puntosPorTicket)) {
      const { error } = await sb
        .from('tickets')
        .update({ puntos_totales: pts })
        .eq('id', ticketId);
      if (error) {
        throw new Error(`escribiendo puntos_totales del boleto ${ticketId}: ${error.message}`);
      }
    }
    diario.puntosEscritos = true;
    await guardarEstadoLiquidaciones(estado.liq);
  }

  // 2) Cierre: relectura inmediata + update condicionado a 'abierta'.
  if (!diario.cerradaEnBase) {
    const { data: q2 } = await sb
      .from('quinielas')
      .select('estado')
      .eq('id', qid)
      .single();
    if (!q2 || q2.estado !== 'abierta') {
      await abortarPorCierreAjeno(sb, config, estado, diario, q2?.estado ?? 'inexistente');
      return;
    }
    const { data: filas, error: errC } = await sb
      .from('quinielas')
      .update({ goles_totales_real: diario.golesTotalesReal, estado: 'cerrada' })
      .eq('id', qid)
      .eq('estado', 'abierta')
      .select('id');
    if (errC) throw new Error(`cerrando la quiniela: ${errC.message}`);
    if (!filas || filas.length === 0) {
      await abortarPorCierreAjeno(sb, config, estado, diario, 'cerrada entre la relectura y el update');
      return;
    }
    diario.cerradaEnBase = true;
    await guardarEstadoLiquidaciones(estado.liq);
    log(
      `Liquidación automática: ${diario.nombre} cerrada (goles totales ${diario.golesTotalesReal}). Pagando premios…`
    );
  }

  // 3) Pagos, uno por uno; el diario impide duplicar al reanudar.
  for (const ganador of diario.ganadores) {
    const detPrevio = diario.detallePagos[ganador.usuario_id];
    if (detPrevio?.etapa === 'completo') continue;
    const det = await pagarPremio(sb, estado, diario, ganador);
    if (!det.yaExistia) {
      log(
        `Liquidación automática: premio pagado a ${ganador.nombre} — ${dinero(ganador.cantidad)} (${ganador.lugar})` +
          (det.cobroDeuda > 0 ? ` · cobro de deuda ${dinero(det.cobroDeuda)}` : '') +
          (det.nuevoSaldo !== null && det.nuevoSaldo !== undefined
            ? ` · saldo resultante ${dinero(det.nuevoSaldo)}`
            : '')
      );
    }
  }

  // 4) Notificaciones internas (best-effort, como el cierre manual).
  if (!diario.notifInterna && diario.notifIntentos < 3) {
    try {
      await insertarNotificacionesInternas(sb, diario);
      diario.notifInterna = true;
      await guardarEstadoLiquidaciones(estado.liq);
    } catch (e) {
      diario.notifIntentos += 1;
      await guardarEstadoLiquidaciones(estado.liq);
      log(
        `Aviso: las notificaciones internas de ${diario.nombre} fallaron (intento ${diario.notifIntentos}/3): ${e.message} ` +
          '(los premios ya están pagados)'
      );
      if (diario.notifIntentos >= 3) diario.notifInterna = true;
    }
  }

  // 5) Push de premio acreditado: el disparador del tipo 'premio'.
  if (!diario.pushEnviado && diario.pushIntentos < 3) {
    if (config.pushSecret && diario.ganadores.length > 0) {
      const eventos = diario.ganadores.map((g) => ({
        tipo: 'premio',
        clave: `premio:${qid}:${g.usuario_id}`,
        usuarios: [g.usuario_id],
        quiniela_id: qid,
        titulo: `🏆 ¡Ganaste en ${diario.nombre}!`,
        cuerpo:
          `Tu premio de ${dinero(g.cantidad)} ya se procesó en tu billetera` +
          ((diario.detallePagos[g.usuario_id]?.cobroDeuda ?? 0) > 0
            ? ' (se cobró tu saldo pendiente)'
            : '') +
          '. ¡Felicidades!',
        url: '/',
      }));
      try {
        await despacharEventos(config, eventos);
        diario.pushEnviado = true;
        await guardarEstadoLiquidaciones(estado.liq);
        log(`Liquidación automática: push de premio despachado a ${eventos.length} ganador(es).`);
      } catch (e) {
        diario.pushIntentos += 1;
        await guardarEstadoLiquidaciones(estado.liq);
        log(
          `Aviso: el push de premio de ${diario.nombre} falló (intento ${diario.pushIntentos}/3): ${e.message} ` +
            '(los premios ya están pagados)'
        );
        if (diario.pushIntentos >= 3) diario.pushEnviado = true;
      }
    } else {
      diario.pushEnviado = true;
      await guardarEstadoLiquidaciones(estado.liq);
    }
  }

  // 6) Resumen (log + archivo por quiniela) y cierre del diario.
  const texto = textoResumenLiquidacion(diario);
  try {
    const ruta = await escribirResumenLiquidacion(diario, texto);
    log(`Liquidación automática: resumen guardado en ${ruta}`);
  } catch (e) {
    log(`Aviso: no se pudo guardar el archivo de resumen de ${diario.nombre}: ${e.message}`);
  }
  for (const linea of texto.split('\n')) log(linea);
  estado.liq.liquidadas[qid] = {
    nombre: diario.nombre,
    en: new Date().toISOString(),
    resultado: 'liquidada',
    ganadores: diario.ganadores.map((g) => ({
      nombre: g.nombre,
      cantidad: g.cantidad,
      lugar: g.lugar,
    })),
  };
  delete estado.liq.enCurso[qid];
  delete estado.liq.ventanas[qid];
  await guardarEstadoLiquidaciones(estado.liq);
}

/** Simulación en modo seco: calcula el plan y lo reporta sin escribir. */
async function simularLiquidacion(sb, q, partidos) {
  const tickets = await leerTicketsQuiniela(sb, q.id);
  if (tickets.length === 0) {
    log(`LIQUIDARÍA: ${q.nombre_jornada} no tiene boletos; no habría nada que liquidar.`);
    return;
  }
  const nombres = await leerNombresUsuarios(sb, tickets);
  const plan = construirPlanLiquidacion(q, tickets, partidos, nombres);
  log(
    `LIQUIDARÍA: ${q.nombre_jornada} — caja ${dinero(plan.totalRecaudado)} · bolsa (80%) ${dinero(plan.bolsaPremios)} · ` +
      `comisión ${dinero(plan.comision)} · goles totales ${plan.golesTotalesReal}`
  );
  for (const g of plan.ganadores) {
    const fila = plan.tabla.find((f) => f.usuario_id === g.usuario_id);
    log(
      `LIQUIDARÍA: → ${g.nombre} (${g.lugar}) ${dinero(g.cantidad)}` +
        (fila ? ` · ${fila.puntos} pts · DIF ${fila.golesDiff}` : '')
    );
  }
  if (plan.ganadores.length === 0) log('LIQUIDARÍA: → sin ganadores (la bolsa quedaría en caja).');
  log('LIQUIDARÍA: (modo seco: no se escribió nada; en modo real se liquida tras la ventana de seguridad sin cambios)');
}

/**
 * Paso de liquidación de cada ciclo: reanuda diarios a medias,
 * descubre quinielas con todos sus partidos finales y corre sus
 * ventanas de seguridad. Corre aunque no haya partidos en ventana.
 */
async function procesarLiquidaciones(sb, config, estado, ahoraMs) {
  if (!config.liquidacionAuto) return;

  // 1) Reanudar lo empezado (tiene prioridad sobre lo nuevo).
  for (const qid of Object.keys(estado.liq.enCurso)) {
    if (DRY_RUN) continue;
    try {
      await ejecutarLiquidacion(sb, config, estado, qid);
    } catch (e) {
      log(`LIQUIDACIÓN ${estado.liq.enCurso[qid]?.nombre ?? qid}: error al reanudar (se reintenta el próximo ciclo): ${e.message}`);
    }
  }

  // 2) Descubrir quinielas abiertas con todos los partidos finales.
  const { data: abiertas, error } = await sb
    .from('quinielas')
    .select(CAMPOS_QUINIELA_LIQ)
    .eq('estado', 'abierta');
  if (error) throw new Error(`leyendo quinielas para liquidar: ${error.message}`);

  for (const q of abiertas ?? []) {
    if (estado.liq.enCurso[q.id] || estado.liq.liquidadas[q.id]) continue;
    const partidos = await leerPartidosQuiniela(sb, q.id);
    const eleg = evaluarElegibilidad(q, partidos);
    const mapaVentanas = DRY_RUN ? estado.liqSecoVentanas : estado.liq.ventanas;

    if (!eleg.elegible) {
      if (mapaVentanas[q.id]) {
        delete mapaVentanas[q.id];
        if (!DRY_RUN) await guardarEstadoLiquidaciones(estado.liq);
        log(`Liquidación automática: la ventana de ${q.nombre_jornada} se canceló (${eleg.motivo}).`);
      }
      continue;
    }

    const foto = fotoMarcadores(partidos, golesTotalesEfectivos(q, partidos));
    const ev = evaluarVentana(mapaVentanas[q.id], foto, ahoraMs, config.ventanaMs);

    if (DRY_RUN) {
      if (ev.accion === 'iniciar' || ev.accion === 'reiniciar') {
        estado.liqSecoVentanas[q.id] = ev.entrada;
      }
      const claveReporte = `${q.id}:${foto}`;
      if (
        (ev.accion === 'liquidar' || MODO_ONCE) &&
        !estado.liqSecoReportadas.has(claveReporte)
      ) {
        estado.liqSecoReportadas.add(claveReporte);
        await simularLiquidacion(sb, q, partidos);
      }
      continue;
    }

    if (ev.accion === 'iniciar') {
      estado.liq.ventanas[q.id] = ev.entrada;
      await guardarEstadoLiquidaciones(estado.liq);
      log(
        `Liquidación automática: ${q.nombre_jornada} tiene TODOS sus partidos finales. ` +
          `Ventana de seguridad de ${Math.round(config.ventanaMs / 60_000)} min: si ningún marcador cambia, se liquida sola.`
      );
    } else if (ev.accion === 'reiniciar') {
      estado.liq.ventanas[q.id] = ev.entrada;
      await guardarEstadoLiquidaciones(estado.liq);
      log(
        `Liquidación automática: un marcador de ${q.nombre_jornada} cambió durante la ventana; ` +
          `el conteo de ${Math.round(config.ventanaMs / 60_000)} min se reinicia.`
      );
    } else if (ev.accion === 'liquidar') {
      try {
        await ejecutarLiquidacion(sb, config, estado, q.id);
      } catch (e) {
        log(`LIQUIDACIÓN ${q.nombre_jornada}: error (se reintenta el próximo ciclo): ${e.message}`);
      }
    }
  }
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

  // Liquidación automática: también corre sin partidos en ventana —
  // una quiniela con todos sus partidos finales ya no tiene trabajo
  // de marcadores, pero sí ventana corriendo o pagos por reanudar.
  try {
    await procesarLiquidaciones(sb, config, estado, ahoraMs);
  } catch (e) {
    log(`Aviso: la liquidación automática falló este ciclo: ${e.message}`);
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
    liq: await cargarEstadoLiquidaciones(),
    liqSecoVentanas: {},
    liqSecoReportadas: new Set(),
  };
  log(
    config.pushSecret
      ? `Notificaciones push: activas (despacho a ${new URL(config.pushUrl).host}).`
      : 'Notificaciones push: desactivadas (falta PUSH_DISPATCH_SECRET); los marcadores trabajan igual.'
  );
  log(
    config.liquidacionAuto
      ? `Liquidación automática: ACTIVA (ventana de seguridad de ${Math.round(config.ventanaMs / 60_000)} min sin cambios; modos por puntos, sorteo excluido).`
      : 'Liquidación automática: APAGADA (LIQUIDACION_AUTO=off); la liquidación sigue manual en la app.'
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
