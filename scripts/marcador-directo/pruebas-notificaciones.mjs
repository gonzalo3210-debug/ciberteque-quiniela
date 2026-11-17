// scripts/marcador-directo/pruebas-notificaciones.mjs
//
// Pruebas de la lógica PURA de notificaciones (logica.mjs) y de la
// detección de sonidos de la app (src/lib/sonidos.ts). Sin red, sin
// base de datos: se corre con `node scripts/marcador-directo/pruebas-notificaciones.mjs`.

import {
  calcularRankingProvisional,
  claveRecordatorioCierre,
  crearEstadoNotificaciones,
  debeRecordarCierre,
  detectarEventosNotificacion,
  marcarDespachadas,
  puntosPronostico,
} from './logica.mjs';

let pasan = 0;
let fallan = 0;
function ok(condicion, nombre) {
  if (condicion) {
    pasan++;
  } else {
    fallan++;
    console.error(`  ✗ FALLA: ${nombre}`);
  }
}
function eq(a, b, nombre) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${nombre} (esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)})`);
}

const P1 = {
  id: 'p1',
  quiniela_id: 'q1',
  equipo_local: 'América',
  equipo_visitante: 'Chivas',
  equipo_local_provider_id: 't-america',
  equipo_visitante_provider_id: 't-chivas',
};
const foto = (partidos, rankings = {}) => ({
  partidos,
  quinielas: { q1: { nombre: 'LMX J17' } },
  rankings,
});
const conMarcador = (gl, gv, esFinal = false) => ({
  ...P1,
  goles_local: gl,
  goles_visitante: gv,
  es_final: esFinal,
});

// ---------- puntosPronostico / ranking provisional ----------
{
  const partido = { goles_local: 2, goles_visitante: 1, resultado_real: 'L' };
  eq(puntosPronostico('marcador_exacto', '2-1', partido), 3, 'exacto: marcador clavado = 3');
  eq(puntosPronostico('marcador_exacto', '1-0', partido), 1, 'exacto: solo tendencia = 1');
  eq(puntosPronostico('marcador_exacto', '0-0', partido), 0, 'exacto: tendencia contraria = 0');
  eq(puntosPronostico('lev', 'L', partido), 1, 'LEV: tendencia = 1');
  eq(puntosPronostico('lev', 'E', partido), 0, 'LEV: fallo = 0');
  eq(puntosPronostico('lev', 'L', { goles_local: null, goles_visitante: null, resultado_real: null }), 0, 'sin resultado = 0');

  const tickets = [
    { id: 'ta', usuario_id: 'A', prediccion_goles_total: 29, pronosticos: [{ partido_id: 'p1', eleccion_usuario: '2-1' }] },
    { id: 'tb', usuario_id: 'B', prediccion_goles_total: 29, pronosticos: [{ partido_id: 'p1', eleccion_usuario: '1-0' }] },
    { id: 'tc', usuario_id: 'C', prediccion_goles_total: 29, pronosticos: [{ partido_id: 'p1', eleccion_usuario: '3-1' }] },
  ];
  const ranking = calcularRankingProvisional(
    { modalidad: 'marcador_exacto', goles_totales_real: null },
    tickets,
    [{ id: 'p1', ...partido }]
  );
  eq(ranking.map((f) => [f.usuario_id, f.puntos, f.posicion]), [['A', 3, 1], ['B', 1, 2], ['C', 1, 2]], 'ranking: orden y lugares compartidos en empate');
  eq(calcularRankingProvisional({ modalidad: 'sorteo', goles_totales_real: null }, tickets, []), [], 'sorteo: sin ranking provisional');
}

// ---------- gol simple + dedupe ----------
let estado = crearEstadoNotificaciones();
{
  let r = detectarEventosNotificacion(estado, foto([conMarcador(0, 0)]));
  eq(r.eventos.length, 0, 'línea base 0-0: sin eventos');
  estado = r.estadoNuevo;

  r = detectarEventosNotificacion(estado, foto([conMarcador(1, 0)]));
  eq(r.eventos.map((e) => e.tipo), ['gol_equipo', 'gol_boleto'], 'gol: salen los dos eventos');
  ok(r.eventos[0].titulo.includes('América'), 'gol: el título nombra al que anotó (local)');
  ok(r.eventos[0].cuerpo.includes('1-0'), 'gol: el cuerpo trae el marcador');
  eq(r.eventos[0].equipo_provider_ids, ['t-america', 't-chivas'], 'gol: ids de proveedor de ambos equipos');
  estado = marcarDespachadas(r.estadoNuevo, r.eventos.map((e) => e.clave));

  r = detectarEventosNotificacion(estado, foto([conMarcador(1, 0)]));
  eq(r.eventos.length, 0, 'misma foto tras despachar: nada se repite');
  estado = r.estadoNuevo;
}

// ---------- reinicio simulado: el estado en disco impide duplicar ----------
{
  const revivido = JSON.parse(JSON.stringify(estado));
  let r = detectarEventosNotificacion(revivido, foto([conMarcador(1, 0)]));
  eq(r.eventos.length, 0, 'tras reinicio, el 1-0 no se vuelve a anunciar');
  r = detectarEventosNotificacion(revivido, foto([conMarcador(2, 0)]));
  eq(r.eventos.map((e) => e.clave), ['gol:p1:2-0:equipos', 'gol:p1:2-0:boleto'], 'tras reinicio solo sale el gol nuevo');
}

// ---------- gol anulado ANTES del despacho: no sale nada ----------
{
  let e = crearEstadoNotificaciones();
  let r = detectarEventosNotificacion(e, foto([conMarcador(0, 0)]));
  e = r.estadoNuevo;
  r = detectarEventosNotificacion(e, foto([conMarcador(1, 0)]));
  eq(r.eventos.length, 2, 'anulado-antes: el gol se detecta (aún sin despachar)');
  e = r.estadoNuevo; // el despacho FALLÓ: no se marcó nada
  r = detectarEventosNotificacion(e, foto([conMarcador(0, 0)]));
  eq(r.eventos.length, 0, 'anulado-antes: si el gol nunca salió, no sale ni el gol ni la corrección');
}

// ---------- gol anulado DESPUÉS del despacho: sale la corrección ----------
{
  let e = crearEstadoNotificaciones();
  let r = detectarEventosNotificacion(e, foto([conMarcador(0, 0)]));
  e = r.estadoNuevo;
  r = detectarEventosNotificacion(e, foto([conMarcador(0, 1)]));
  e = marcarDespachadas(r.estadoNuevo, r.eventos.map((x) => x.clave));
  r = detectarEventosNotificacion(e, foto([conMarcador(0, 0)]));
  eq(r.eventos.map((x) => x.tipo), ['gol_anulado'], 'anulado-después: sale una corrección');
  ok(r.eventos[0].cuerpo.includes('0-0'), 'anulado-después: la corrección trae el marcador corregido');
  e = marcarDespachadas(r.estadoNuevo, r.eventos.map((x) => x.clave));
  r = detectarEventosNotificacion(e, foto([conMarcador(0, 0)]));
  eq(r.eventos.length, 0, 'anulado-después: la corrección no se repite');
}

// ---------- línea base a mitad de partido + fin de partido ----------
{
  let e = crearEstadoNotificaciones();
  let r = detectarEventosNotificacion(e, foto([conMarcador(2, 1)]));
  eq(r.eventos.length, 0, 'primera foto 2-1: línea base silenciosa');
  e = r.estadoNuevo;
  r = detectarEventosNotificacion(e, foto([conMarcador(2, 2)]));
  eq(r.eventos.length, 2, 'gol del visitante tras la base: sale');
  ok(r.eventos[0].titulo.includes('Chivas'), 'gol del visitante: el título lo nombra');
  e = marcarDespachadas(r.estadoNuevo, r.eventos.map((x) => x.clave));
  r = detectarEventosNotificacion(e, foto([conMarcador(2, 2, true)]));
  eq(r.eventos.map((x) => x.tipo), ['fin_partido'], 'al marcarse final sale fin_partido');
  e = marcarDespachadas(r.estadoNuevo, r.eventos.map((x) => x.clave));
  r = detectarEventosNotificacion(e, foto([conMarcador(2, 2, true)]));
  eq(r.eventos.length, 0, 'fin_partido no se repite');
}

// ---------- liderato ----------
{
  let e = crearEstadoNotificaciones();
  const rank1 = {
    q1: [
      { usuario_id: 'A', puntos: 3, posicion: 1 },
      { usuario_id: 'B', puntos: 1, posicion: 2 },
    ],
  };
  let r = detectarEventosNotificacion(e, foto([], rank1));
  eq(r.eventos.length, 0, 'liderato: primera foto es línea base');
  e = r.estadoNuevo;
  const rank2 = {
    q1: [
      { usuario_id: 'B', puntos: 6, posicion: 1 },
      { usuario_id: 'A', puntos: 3, posicion: 2 },
    ],
  };
  r = detectarEventosNotificacion(e, foto([], rank2));
  eq(
    r.eventos.map((x) => [x.tipo, x.usuarios[0]]).sort(),
    [['lider_nuevo', 'B'], ['rebasado', 'A']],
    'liderato: entra B (lider_nuevo) y sale A (rebasado)'
  );
  e = marcarDespachadas(r.estadoNuevo, r.eventos.map((x) => x.clave));
  r = detectarEventosNotificacion(e, foto([], rank2));
  eq(r.eventos.length, 0, 'liderato estable: sin eventos');
}

// ---------- recordatorio de cierre ----------
{
  const ahora = Date.parse('2026-11-20T16:00:00Z');
  ok(debeRecordarCierre('2026-11-20T17:30:00Z', ahora), 'cierre en 1.5 h: sí recuerda');
  ok(!debeRecordarCierre('2026-11-20T19:30:00Z', ahora), 'cierre en 3.5 h: aún no');
  ok(!debeRecordarCierre('2026-11-20T15:00:00Z', ahora), 'cierre ya pasado: no');
  ok(!debeRecordarCierre(null, ahora), 'sin fecha de cierre: no');
  eq(claveRecordatorioCierre('q1', 'u9'), 'cierre:q1:u9', 'clave de cierre');
}

// ---------- detección de sonidos (src/lib/sonidos.ts) ----------
{
  const { detectarEventosSonoros } = await import('../../src/lib/sonidos.ts');
  const antes = new Map([['a', { id: 'a', homeScore: 0, awayScore: 0, status: 'live' }]]);
  eq(detectarEventosSonoros(null, [{ id: 'a', homeScore: 1, awayScore: 0, status: 'live' }]), [], 'sonidos: sin foto previa no suena');
  eq(
    detectarEventosSonoros(antes, [{ id: 'a', homeScore: 1, awayScore: 0, status: 'live' }]).map((e) => e.tipo),
    ['gol'],
    'sonidos: sube el marcador → gol'
  );
  eq(
    detectarEventosSonoros(antes, [{ id: 'a', homeScore: 0, awayScore: 0, status: 'finished' }]).map((e) => e.tipo),
    ['final'],
    'sonidos: pasa a final → silbatazo'
  );
  eq(
    detectarEventosSonoros(antes, [{ id: 'a', homeScore: 1, awayScore: 0, status: 'finished' }]).map((e) => e.tipo),
    ['gol', 'final'],
    'sonidos: gol y final en el mismo refresco → los dos'
  );
  eq(
    detectarEventosSonoros(antes, [{ id: 'a', homeScore: 0, awayScore: 0, status: 'live' }]),
    [],
    'sonidos: sin cambios no suena'
  );
}

console.log(`\nPruebas de notificaciones: ${pasan} pasan, ${fallan} fallan.`);
process.exit(fallan > 0 ? 1 : 0);
