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

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  construirHerramientasNombres,
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

// ---------- Un ciclo --------------------------------------------------------

async function ciclo(sb, config, herramientas, estado) {
  const ahoraMs = Date.now();
  const partidos = await descubrirPartidos(sb, ahoraMs);

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
  if (enlazados.length === 0) return;

  // 2) Una sola llamada al feed en vivo para todos.
  const enVivo = await traerEnVivo(config.tsdbKey);
  const porId = new Map(enVivo.map((f) => [f.providerId, f]));

  // 3) Decidir y (salvo dry-run) escribir, partido por partido.
  for (const partido of enlazados) {
    const feed = porId.get(String(partido.api_fixture_id));
    if (!feed) continue; // aún no aparece en el feed: nada que hacer
    const plan = planEscritura(partido, feed, herramientas, ahoraMs);
    if (plan.accion === 'nada') continue;
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

  const estado = { ultimoAvisoSinTrabajo: 0, fixturesTodas: null, fixturesTodasEn: 0 };

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
