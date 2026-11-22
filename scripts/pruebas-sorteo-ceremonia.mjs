// scripts/pruebas-sorteo-ceremonia.mjs
//
// Pruebas de la lógica PURA de la ceremonia pública del sorteo
// (src/lib/sorteoCeremonia.ts): detección de que el sorteo ya ocurrió
// y el plan de revelado (orden estable, pases propios al final,
// determinismo). Sin red ni base de datos: se corre con
// `node scripts/pruebas-sorteo-ceremonia.mjs`.

const {
  sorteoRealizado,
  planRevelado,
  duracionTotalCeremonia,
  estadoRenglonCeremonia,
  comboEnBarajeo,
  DURACION_GIRO_MS,
  DURACION_REVELADO_MS,
  INTERVALO_BARAJEO_MS,
} = await import('../src/lib/sorteoCeremonia.ts');
const { sonidoCeremoniaActivo } = await import('../src/lib/sonidos.ts');

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
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    `${nombre} (esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)})`
  );
}

// ---------- 1) Detección: ¿ya se ejecutó el sorteo? ----------------------
eq(sorteoRealizado([]), false, 'sin pases no hay sorteo realizado');
eq(
  sorteoRealizado([{ equipo_asignado_id: null }, { equipo_asignado_id: null }]),
  false,
  'pases sin asignar: sorteo pendiente'
);
eq(
  sorteoRealizado([{ equipo_asignado_id: 'eq1' }, { equipo_asignado_id: null }]),
  false,
  'asignación parcial NO cuenta como realizado (la ceremonia espera)'
);
eq(
  sorteoRealizado([{ equipo_asignado_id: 'eq1' }, { equipo_asignado_id: 'eq2' }]),
  true,
  'todos asignados: sorteo realizado'
);

// ---------- 2) Plan de revelado: los propios al final --------------------
const asignacion = (ticketId, usuarioId, nombreJugador, equipoId) => ({
  ticketId,
  usuarioId,
  nombreJugador,
  equipoId,
  nombreEquipo: `Equipo ${equipoId}`,
  logoUrl: null,
});
// 8 pases de 8 jugadores; el espectador "yo" (u-yo) tiene el pase t5.
const sala = [
  asignacion('t1', 'u-ana', 'Ana', 'e1'),
  asignacion('t2', 'u-beto', 'Beto', 'e2'),
  asignacion('t3', 'u-caro', 'Caro', 'e3'),
  asignacion('t4', 'u-dany', 'Dany', 'e4'),
  asignacion('t5', 'u-yo', 'Gonzalo', 'e5'),
  asignacion('t6', 'u-elena', 'Elena', 'e6'),
  asignacion('t7', 'u-fede', 'Fede', 'e7'),
  asignacion('t8', 'u-gabi', 'Gabi', 'e8'),
];
const plan = planRevelado(sala, 'u-yo');
eq(plan.length, 8, 'el plan trae las 8 asignaciones');
eq(plan[7].asignacion.ticketId, 't5', 'mi pase se revela AL FINAL');
eq(plan[7].esPropio, true, 'el último paso está marcado como propio');
eq(
  plan.slice(0, 7).every((p) => !p.esPropio),
  true,
  'ningún paso ajeno se marca como propio'
);
eq(
  plan.map((p) => p.indice),
  [0, 1, 2, 3, 4, 5, 6, 7],
  'los índices van en orden de revelado'
);
eq(
  plan.slice(0, 7).map((p) => p.asignacion.nombreJugador),
  ['Ana', 'Beto', 'Caro', 'Dany', 'Elena', 'Fede', 'Gabi'],
  'los ajenos van en orden estable por nombre'
);

// ---------- 3) Jugador con DOS pases: ambos al final ----------------------
const salaDosPases = [
  ...sala.slice(0, 7),
  asignacion('t9', 'u-yo', 'Gonzalo', 'e8'),
].filter((a) => a.ticketId !== 't8');
const planDos = planRevelado(salaDosPases, 'u-yo');
eq(
  planDos.slice(-2).map((p) => p.asignacion.ticketId),
  ['t5', 't9'],
  'mis dos pases cierran la ceremonia, en orden estable entre ellos'
);
eq(
  planDos.slice(-2).every((p) => p.esPropio),
  true,
  'ambos pasos finales son propios'
);

// ---------- 4) Espectador y sin usuario ----------------------------------
const planEspectador = planRevelado(sala, 'u-fuera');
eq(
  planEspectador.every((p) => !p.esPropio),
  true,
  'espectador (sin pases): ningún paso es propio'
);
eq(
  planEspectador.map((p) => p.asignacion.nombreJugador),
  ['Ana', 'Beto', 'Caro', 'Dany', 'Elena', 'Fede', 'Gabi', 'Gonzalo'],
  'espectador: orden estable completo por nombre'
);
eq(
  planRevelado(sala, null).map((p) => p.asignacion.ticketId),
  planEspectador.map((p) => p.asignacion.ticketId),
  'sin usuario el plan es el mismo orden estable'
);

// ---------- 5) Casos borde y determinismo --------------------------------
eq(planRevelado([], 'u-yo'), [], 'sin asignaciones el plan es vacío');
const unPase = planRevelado([asignacion('t1', 'u-yo', 'Gonzalo', 'e1')], 'u-yo');
eq(unPase.length, 1, 'un solo pase: plan de un paso');
eq(unPase[0].esPropio, true, 'el único pase es propio y va primero/último');
const copiaEntrada = JSON.stringify(sala);
eq(
  JSON.stringify(planRevelado(sala, 'u-yo')),
  JSON.stringify(planRevelado(sala, 'u-yo')),
  'determinismo: misma entrada, mismo plan'
);
eq(JSON.stringify(sala), copiaEntrada, 'el plan NO muta la lista original');

// ---------- 6) Duraciones --------------------------------------------------
eq(duracionTotalCeremonia(0), 0, 'sin asignaciones la ceremonia dura 0');
eq(
  duracionTotalCeremonia(8),
  DURACION_GIRO_MS + 8 * DURACION_REVELADO_MS,
  'duración total = giro + un revelado por asignación'
);

// ---------- 7) Estado de los renglones del tablero -------------------------
eq(
  plan.map((_, i) => estadoRenglonCeremonia(i, 'giro', 0)),
  plan.map(() => 'barajando'),
  'en el giro TODOS los renglones se están barajando'
);
eq(
  plan.map((_, i) => estadoRenglonCeremonia(i, 'final', 0)),
  plan.map(() => 'fijado'),
  'al final TODOS los renglones están fijados'
);
for (let paso = 0; paso < plan.length; paso++) {
  eq(
    plan.map((_, i) => estadoRenglonCeremonia(i, 'revelando', paso)),
    plan.map((_, i) => (i <= paso ? 'fijado' : 'barajando')),
    `revelando el paso ${paso}: se fijaron exactamente los renglones 0..${paso} del plan`
  );
}
eq(
  plan.map(
    (_, i) =>
      estadoRenglonCeremonia(i, 'revelando', plan.length - 1) === 'fijado' &&
      plan[i].esPropio
  ),
  plan.map((_, i) => i === plan.length - 1),
  'el último renglón en fijarse es el del propio jugador (la cumbre del plan)'
);

// ---------- 8) Barajeo de parejas completas --------------------------------
ok(
  INTERVALO_BARAJEO_MS >= 120 && INTERVALO_BARAJEO_MS <= 180,
  `el barajeo cambia rápido pero legible (${INTERVALO_BARAJEO_MS} ms, entre 120 y 180)`
);
eq(comboEnBarajeo([], 0, 0), null, 'sin plan no hay combo de barajeo');
eq(
  comboEnBarajeo(plan, 3, 99),
  null,
  'renglón fuera del plan: sin combo'
);
const jugadoresSala = new Set(sala.map((a) => a.nombreJugador));
const equiposSala = new Set(sala.map((a) => a.nombreEquipo));
let combosSalenDeLaSala = true;
let comboNuncaEsLaReal = true;
let comboCambia = true;
for (let tick = 0; tick < 40; tick++) {
  for (let i = 0; i < plan.length; i++) {
    const combo = comboEnBarajeo(plan, tick, i);
    if (!jugadoresSala.has(combo.nombreJugador)) combosSalenDeLaSala = false;
    if (!equiposSala.has(combo.nombreEquipo)) combosSalenDeLaSala = false;
    const real = plan[i].asignacion;
    if (
      combo.nombreJugador === real.nombreJugador &&
      combo.nombreEquipo === real.nombreEquipo
    ) {
      comboNuncaEsLaReal = false;
    }
    const siguiente = comboEnBarajeo(plan, tick + 1, i);
    if (
      siguiente.nombreJugador === combo.nombreJugador &&
      siguiente.nombreEquipo === combo.nombreEquipo
    ) {
      comboCambia = false;
    }
  }
}
ok(combosSalenDeLaSala, 'todo combo de barajeo sale de los jugadores y equipos de la sala');
ok(
  comboNuncaEsLaReal,
  'el barajeo NUNCA enseña la pareja real de un renglón antes de que se fije'
);
ok(comboCambia, 'de un tick al siguiente la pareja de cada renglón cambia (se mueve)');
eq(
  JSON.stringify(comboEnBarajeo(plan, 7, 2)),
  JSON.stringify(comboEnBarajeo(plan, 7, 2)),
  'el barajeo es determinista: mismo tick y renglón, mismo combo'
);
{
  const nombresTick = plan.map((_, i) => comboEnBarajeo(plan, 5, i).nombreJugador);
  const equiposTick = plan.map((_, i) => comboEnBarajeo(plan, 5, i).nombreEquipo);
  eq(
    new Set(nombresTick).size,
    plan.length,
    'en un mismo instante ningún jugador se repite entre renglones'
  );
  eq(
    new Set(equiposTick).size,
    plan.length,
    'en un mismo instante ningún equipo se repite entre renglones'
  );
}
{
  const unPlan = planRevelado(
    [asignacion('t1', 'u-yo', 'Gonzalo', 'e1')],
    'u-yo'
  );
  const combo = comboEnBarajeo(unPlan, 4, 0);
  eq(
    [combo.nombreJugador, combo.nombreEquipo],
    ['Gonzalo', 'Equipo e1'],
    'con un solo pase el barajeo enseña la única pareja que hay'
  );
}

// ---------- 9) Sonido de la ceremonia: encendido por defecto -------------
// Decisión de Gonzalo (2026-11-22): la ceremonia suena aunque el
// jugador nunca haya activado el toggle global de sonidos; solo un
// «no» explícito guardado la calla.
eq(
  sonidoCeremoniaActivo(null),
  true,
  'sin preferencia guardada la ceremonia SUENA (encendida por defecto)'
);
eq(
  sonidoCeremoniaActivo('1'),
  true,
  'preferencia explícita «1»: la ceremonia suena'
);
eq(
  sonidoCeremoniaActivo('0'),
  false,
  'preferencia explícita «0»: la ceremonia calla (el «no» guardado manda)'
);
eq(
  sonidoCeremoniaActivo(''),
  true,
  'valor vacío cuenta como nunca tocada: suena'
);
eq(
  sonidoCeremoniaActivo('otra-cosa'),
  true,
  'valor desconocido cuenta como nunca tocada: suena'
);
eq(
  sonidoCeremoniaActivo(undefined),
  true,
  'sin valor (undefined) cuenta como nunca tocada: suena'
);

console.log(`\nsorteo-ceremonia: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
