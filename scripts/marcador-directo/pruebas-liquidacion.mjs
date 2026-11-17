// scripts/marcador-directo/pruebas-liquidacion.mjs
//
// Pruebas de la lógica PURA de la liquidación automática
// (liquidacion.mjs): la réplica de la liquidación manual de la app.
// Sin red, sin base de datos: se corre con
// `node scripts/marcador-directo/pruebas-liquidacion.mjs`.
//
// La fidelidad se prueba contra DOS liquidaciones reales ya hechas a
// mano por Gonzalo: NATIONS LEAGUE (2026-11-15) y LMX J16 (2026-11-08),
// reconstruidas con sus datos conocidos (marcadores, puntos,
// diferencias de goles y montos).

import {
  PORCENTAJE_PREMIO,
  calcularPremios,
  construirPlanLiquidacion,
  crearEstadoLiquidaciones,
  descripcionPremio,
  evaluarElegibilidad,
  evaluarVentana,
  fotoMarcadores,
  ganadoresPendientes,
  golesTotalesEfectivos,
  planPagoPremio,
  puntosTicketLiquidacion,
} from './liquidacion.mjs';

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

const partido = (id, gl, gv, res) => ({
  id,
  goles_local: gl,
  goles_visitante: gv,
  resultado_real: res,
  es_final: true,
});
const boleto = (id, uid, pred, picks) => ({
  id,
  usuario_id: uid,
  prediccion_goles_total: pred,
  pronosticos: Object.entries(picks).map(([partido_id, eleccion_usuario]) => ({
    partido_id,
    eleccion_usuario,
  })),
});

// ======================================================================
// CASO REAL 1 — NATIONS LEAGUE (marcador exacto, ganador único, $30)
// Real: 7 boletos, caja $210, premio $168. Ganador: Roberto Partida,
// 8 pts, DIF 8; Fernando Zuriel Ibarra Lopez, 8 pts, DIF 9; Gonzalo,
// 7 pts (3°). Goles totales reales: 39.
// ======================================================================
const partidosNL = [
  partido('m1', 3, 1, 'L'), // Italia 3-1 Francia
  partido('m2', 2, 1, 'L'), // Inglaterra 2-1 Croacia
  partido('m3', 0, 2, 'V'), // Rep. Checa 0-2 España
  partido('m4', 1, 3, 'V'), // Serbia 1-3 Alemania
  partido('m5', 1, 2, 'V'), // Argentina 1-2 Uruguay
  partido('m6', 1, 4, 'V'), // Portugal 1-4 Dinamarca
  partido('m7', 3, 2, 'L'), // Jamaica 3-2 México
  partido('m8', 2, 3, 'V'), // España 2-3 Inglaterra
  partido('m9', 4, 1, 'L'), // Bélgica 4-1 Italia
  partido('m10', 2, 1, 'L'), // Francia 2-1 Turquía
];
const quinielaNL = {
  id: 'q-nations',
  nombre_jornada: 'NATIONS LEAGUE',
  modalidad: 'marcador_exacto',
  tipo_premiacion: 'unico',
  precio_ticket: 30,
  estado: 'abierta',
  goles_totales_real: null,
};
const ticketsNL = [
  boleto('t-rob', 'u-roberto', 31, {
    m1: '3-1', m2: '2-1', m3: '1-2', m4: '2-0', m5: '0-1',
    m6: '2-1', m7: '1-2', m8: '2-1', m9: '1-2', m10: '1-1',
  }),
  boleto('t-fer', 'u-fernando', 30, {
    m1: '1-2', m2: '1-1', m3: '1-1', m4: '3-1', m5: '2-0',
    m6: '1-4', m7: '2-1', m8: '3-2', m9: '4-1', m10: '3-1',
  }),
  boleto('t-gon', 'u-gonzalo', 35, {
    m1: '2-0', m2: '3-1', m3: '0-2', m4: '0-2', m5: '2-1',
    m6: '3-1', m7: '0-1', m8: '1-3', m9: '2-2', m10: '0-0',
  }),
  boleto('t-f1', 'u-f1', 20, { m1: '1-1', m2: '1-1', m3: '1-1', m4: '1-1', m5: '1-1', m6: '1-1', m7: '1-1', m8: '1-1', m9: '1-1', m10: '1-1' }),
  boleto('t-f2', 'u-f2', 25, { m1: '1-1', m2: '1-1', m3: '1-1', m4: '1-1', m5: '1-1', m6: '1-1', m7: '1-1', m8: '1-1', m9: '1-1', m10: '1-1' }),
  boleto('t-f3', 'u-f3', 39, { m1: '1-1', m2: '1-1', m3: '1-1', m4: '1-1', m5: '1-1', m6: '1-1', m7: '1-1', m8: '1-1', m9: '1-1', m10: '1-1' }),
  boleto('t-f4', 'u-f4', 45, { m1: '1-1', m2: '1-1', m3: '1-1', m4: '1-1', m5: '1-1', m6: '1-1', m7: '1-1', m8: '1-1', m9: '1-1', m10: '1-1' }),
];
const nombresNL = {
  'u-roberto': 'Roberto Partida',
  'u-fernando': 'Fernando Zuriel Ibarra Lopez',
  'u-gonzalo': 'Gonzalo Montero',
};

eq(evaluarElegibilidad(quinielaNL, partidosNL).elegible, true, 'NL: quiniela elegible (todos finales)');
eq(golesTotalesEfectivos(quinielaNL, partidosNL), 39, 'NL: goles totales efectivos = 39');
const planNL = construirPlanLiquidacion(quinielaNL, ticketsNL, partidosNL, nombresNL);
eq(planNL.golesTotalesReal, 39, 'NL: el plan cierra con 39 goles');
eq(planNL.tabla[0].usuario_id, 'u-roberto', 'NL: 1° Roberto Partida');
eq(planNL.tabla[0].puntos, 8, 'NL: Roberto suma 8 pts');
eq(planNL.tabla[0].golesDiff, 8, 'NL: Roberto DIF 8');
eq(planNL.tabla[1].usuario_id, 'u-fernando', 'NL: 2° Fernando Zuriel');
eq(planNL.tabla[1].puntos, 8, 'NL: Fernando suma 8 pts');
eq(planNL.tabla[1].golesDiff, 9, 'NL: Fernando DIF 9 (el desempate lo baja al 2°)');
eq(planNL.tabla[2].puntos, 7, 'NL: Gonzalo 3° con 7 pts');
eq(planNL.totalRecaudado, 210, 'NL: caja $210 (7 × $30)');
eq(planNL.bolsaPremios, 168, 'NL: bolsa 80% = $168');
eq(planNL.comision, 42, 'NL: comisión 20% = $42');
eq(planNL.ganadores.length, 1, 'NL: un solo ganador');
eq(planNL.ganadores[0].usuario_id, 'u-roberto', 'NL: el ganador es Roberto');
eq(planNL.ganadores[0].cantidad, 168, 'NL: el premio es $168');
eq(planNL.ganadores[0].lugar, 'Nivel 1', 'NL: lugar "Nivel 1"');
eq(planNL.puntosPorTicket['t-rob'], 8, 'NL: puntos_totales a escribir de Roberto = 8');

// El pago real de Roberto: traía saldo −$60 y su billetera quedó en $108.
const pagoRob = planPagoPremio(
  { id: 'u-roberto', creditos_disponibles: 0, saldo_pesos: 0, deuda_pesos: 60 },
  planNL.ganadores[0].cantidad,
  descripcionPremio(planNL.ganadores[0], 'NATIONS LEAGUE')
);
eq(pagoRob.cobroDeuda, 60, 'NL pago: cobro automático de la deuda = $60');
eq(pagoRob.nuevoSaldo, 108, 'NL pago: la billetera queda en $108 (como en la real)');
eq(pagoRob.deudaRestante, 0, 'NL pago: deuda saldada');
eq(pagoRob.actualizacion, { creditos_disponibles: 0, saldo_pesos: 108, deuda_pesos: 0 }, 'NL pago: actualización de usuarios exacta');
eq(pagoRob.transacciones, [
  { usuario_id: 'u-roberto', cantidad: 168, tipo_movimiento: 'premio_quiniela', descripcion: 'Premio Nivel 1: NATIONS LEAGUE' },
  { usuario_id: 'u-roberto', cantidad: -60, tipo_movimiento: 'abono_deuda', descripcion: 'Cobro automático de saldo pendiente por premio ganado' },
], 'NL pago: movimientos exactos (premio completo + cobro de deuda)');

// ======================================================================
// CASO REAL 2 — LMX J16 (clásica L/E/V, ganador único, $30)
// Real: 8 boletos, caja $240, premio $192. Ganador: Juan Lopez, 7 pts
// (DIF 3); Fabian Altamirano, 7 pts (DIF 9); Roberto Partida, 6 pts.
// Goles totales reales: 29.
// ======================================================================
const partidosJ16 = [
  partido('j1', 3, 1, 'L'), partido('j2', 0, 0, 'E'), partido('j3', 1, 2, 'V'),
  partido('j4', 4, 2, 'L'), partido('j5', 1, 1, 'E'), partido('j6', 2, 0, 'L'),
  partido('j7', 0, 1, 'V'), partido('j8', 2, 2, 'E'), partido('j9', 1, 0, 'L'),
  partido('j10', 4, 2, 'L'),
];
const quinielaJ16 = {
  id: 'q-j16',
  nombre_jornada: 'LMX J16',
  modalidad: 'clasica',
  tipo_premiacion: 'unico',
  precio_ticket: 30,
  estado: 'abierta',
  goles_totales_real: null,
};
const ticketsJ16 = [
  boleto('t-juan', 'u-juan', 26, { j1: 'L', j2: 'E', j3: 'V', j4: 'L', j5: 'E', j6: 'L', j7: 'V', j8: 'L', j9: 'V', j10: 'E' }),
  boleto('t-fab', 'u-fabian', 38, { j1: 'L', j2: 'E', j3: 'V', j4: 'L', j5: 'L', j6: 'L', j7: 'V', j8: 'V', j9: 'L', j10: 'V' }),
  boleto('t-rob16', 'u-roberto', 29, { j1: 'L', j2: 'E', j3: 'V', j4: 'L', j5: 'E', j6: 'L', j7: 'L', j8: 'L', j9: 'V', j10: 'E' }),
  boleto('t-g1', 'u-g1', 10, { j1: 'E', j2: 'E', j3: 'E', j4: 'E', j5: 'E', j6: 'E', j7: 'E', j8: 'E', j9: 'E', j10: 'E' }),
  boleto('t-g2', 'u-g2', 15, { j1: 'E', j2: 'E', j3: 'E', j4: 'E', j5: 'E', j6: 'E', j7: 'E', j8: 'E', j9: 'E', j10: 'E' }),
  boleto('t-g3', 'u-g3', 20, { j1: 'E', j2: 'E', j3: 'E', j4: 'E', j5: 'E', j6: 'E', j7: 'E', j8: 'E', j9: 'E', j10: 'E' }),
  boleto('t-g4', 'u-g4', 25, { j1: 'E', j2: 'E', j3: 'E', j4: 'E', j5: 'E', j6: 'E', j7: 'E', j8: 'E', j9: 'E', j10: 'E' }),
  boleto('t-g5', 'u-g5', 40, { j1: 'E', j2: 'E', j3: 'E', j4: 'E', j5: 'E', j6: 'E', j7: 'E', j8: 'E', j9: 'E', j10: 'E' }),
];
const planJ16 = construirPlanLiquidacion(
  quinielaJ16,
  ticketsJ16,
  partidosJ16,
  { 'u-juan': 'Juan Lopez', 'u-fabian': 'Fabian Altamirano', 'u-roberto': 'Roberto Partida' }
);
eq(planJ16.golesTotalesReal, 29, 'J16: goles totales = 29');
eq(planJ16.tabla[0].usuario_id, 'u-juan', 'J16: 1° Juan Lopez');
eq(planJ16.tabla[0].puntos, 7, 'J16: Juan suma 7 pts');
eq(planJ16.tabla[0].golesDiff, 3, 'J16: Juan DIF 3');
eq(planJ16.tabla[1].puntos, 7, 'J16: Fabian también 7 pts');
eq(planJ16.tabla[1].golesDiff, 9, 'J16: Fabian DIF 9');
eq(planJ16.tabla[2].puntos, 6, 'J16: Roberto 3° con 6 pts');
eq(planJ16.totalRecaudado, 240, 'J16: caja $240 (8 × $30)');
eq(planJ16.bolsaPremios, 192, 'J16: premio $192');
eq(planJ16.ganadores, [
  { usuario_id: 'u-juan', nombre: 'Juan Lopez', cantidad: 192, lugar: 'Nivel 1' },
], 'J16: ganador único Juan Lopez con $192');

// ======================================================================
// Empates exactos y formatos de premiación
// ======================================================================
const tablaEmpate = [
  { ticket_id: 'a', usuario_id: 'ua', nombre: 'A', puntos: 5, golesDiff: 2, posicion: 1 },
  { ticket_id: 'b', usuario_id: 'ub', nombre: 'B', puntos: 5, golesDiff: 2, posicion: 1 },
  { ticket_id: 'c', usuario_id: 'uc', nombre: 'C', puntos: 4, golesDiff: 0, posicion: 3 },
  { ticket_id: 'd', usuario_id: 'ud', nombre: 'D', puntos: 3, golesDiff: 1, posicion: 4 },
];
const empateUnico = calcularPremios(tablaEmpate, 'unico', 30, 1, PORCENTAJE_PREMIO);
eq(empateUnico.totalBolsaPesos, 96, 'empate único: bolsa $96 (4 × $30 × 80%)');
eq(empateUnico.ganadores.map((g) => [g.usuario_id, g.cantidad, g.lugar]), [
  ['ua', 48, 'Nivel 1'],
  ['ub', 48, 'Nivel 1'],
], 'empate único: el 1° compartido se reparte la bolsa ($48 c/u)');
const empateTop2 = calcularPremios(tablaEmpate, 'top2', 30, 1, PORCENTAJE_PREMIO);
eq(empateTop2.ganadores.map((g) => g.cantidad), [48, 48], 'empate top2: el grupo suma 70%+30% y se lo reparte');
const top3 = calcularPremios(
  [
    { ticket_id: 'a', usuario_id: 'ua', nombre: 'A', puntos: 9, golesDiff: 1, posicion: 1 },
    { ticket_id: 'b', usuario_id: 'ub', nombre: 'B', puntos: 8, golesDiff: 1, posicion: 2 },
    { ticket_id: 'c', usuario_id: 'uc', nombre: 'C', puntos: 7, golesDiff: 1, posicion: 3 },
    ...Array.from({ length: 7 }, (_, i) => ({
      ticket_id: `x${i}`, usuario_id: `ux${i}`, nombre: `X${i}`, puntos: 1, golesDiff: 9, posicion: 4,
    })),
  ],
  'top3', 30, 1, PORCENTAJE_PREMIO
);
eq(top3.ganadores.map((g) => [g.cantidad, g.lugar]), [
  [144, 'Nivel 1'], [60, 'Nivel 2'], [36, 'Nivel 3'],
], 'top3 sin empate: 60/25/15 de $240 = $144/$60/$36');
const promo = calcularPremios(tablaEmpate, 'promo_unico', 30, 1, PORCENTAJE_PREMIO);
eq(promo.ganadores.map((g) => [g.usuario_id, g.cantidad, g.lugar]), [
  ['ua', 1, '1er Lugar'],
  ['ub', 1, '1er Lugar'],
], 'promo_unico: los empatados del 1° ganan 1 crédito');

// ======================================================================
// planPagoPremio: variantes de saldo y deuda
// ======================================================================
const pagoSimple = planPagoPremio(
  { id: 'u1', creditos_disponibles: 50, saldo_pesos: 20, deuda_pesos: 0 },
  100,
  'Premio Nivel 1: X'
);
eq(pagoSimple.nuevoSaldo, 170, 'pago sin deuda: creditos+saldo+premio quedan unificados ($170)');
eq(pagoSimple.transacciones.length, 1, 'pago sin deuda: un solo movimiento');
const pagoDeudaMayor = planPagoPremio(
  { id: 'u2', creditos_disponibles: 0, saldo_pesos: 0, deuda_pesos: 200 },
  120,
  'Premio Nivel 1: X'
);
eq(pagoDeudaMayor.cobroDeuda, 120, 'deuda mayor que el premio: se cobra todo el premio');
eq(pagoDeudaMayor.nuevoSaldo, 0, 'deuda mayor: no sobra nada para la billetera');
eq(pagoDeudaMayor.deudaRestante, 80, 'deuda mayor: quedan $80 de deuda');

// ======================================================================
// Puntos: detalles exactos de la app
// ======================================================================
const porId = new Map(partidosNL.map((p) => [p.id, p]));
eq(
  puntosTicketLiquidacion('marcador_exacto', boleto('x', 'ux', 0, { m1: 'L' }), porId),
  0,
  'marcador_exacto: elección sin "-" vale 0 (así lo hace la app)'
);
eq(
  puntosTicketLiquidacion(
    'marcador_exacto',
    boleto('x', 'ux', 0, { m1: '3-1' }),
    new Map([['m1', { id: 'm1', goles_local: null, goles_visitante: null, resultado_real: 'L' }]])
  ),
  0,
  'marcador_exacto: sin goles capturados no hay puntos (así lo hace la app)'
);
eq(
  puntosTicketLiquidacion('clasica', boleto('x', 'ux', 0, { m1: 'L' }), new Map([['m1', { id: 'm1', resultado_real: null }]])),
  0,
  'clásica: partido sin resultado no suma'
);

// ======================================================================
// Elegibilidad: candados
// ======================================================================
eq(evaluarElegibilidad({ ...quinielaNL, modalidad: 'sorteo' }, partidosNL).elegible, false, 'sorteo: excluido de la automática');
eq(evaluarElegibilidad({ ...quinielaNL, estado: 'cerrada' }, partidosNL).elegible, false, 'ya cerrada: no se toca');
eq(
  evaluarElegibilidad(quinielaNL, partidosNL.map((p, i) => (i === 0 ? { ...p, es_final: false } : p))).elegible,
  false,
  'con un partido sin final: no elegible'
);
eq(
  evaluarElegibilidad(quinielaNL, partidosNL.map((p, i) => (i === 0 ? { ...p, resultado_real: null } : p))).elegible,
  false,
  'con un partido sin resultado: no elegible'
);
const sinGoles = partidosNL.map((p) => ({ ...p, goles_local: null, goles_visitante: null }));
eq(evaluarElegibilidad(quinielaNL, sinGoles).elegible, false, 'sin goles y sin total guardado: no elegible (la app pediría el total a mano)');
eq(
  evaluarElegibilidad({ ...quinielaNL, goles_totales_real: 39 }, sinGoles).elegible,
  true,
  'sin goles pero con total guardado: elegible y usa el guardado'
);
eq(golesTotalesEfectivos({ ...quinielaNL, goles_totales_real: 39 }, sinGoles), 39, 'total efectivo: manda el guardado si no hay goles');

// ======================================================================
// Ventana de seguridad de 10 minutos
// ======================================================================
const VENTANA = 10 * 60_000;
const T0 = 1_700_000_000_000;
const fotoA = fotoMarcadores(partidosNL, 39);
const fotoB = fotoMarcadores(
  partidosNL.map((p, i) => (i === 0 ? { ...p, goles_local: 4 } : p)),
  40
);
ok(fotoA !== fotoB, 'foto: un cambio de marcador produce otra foto');
let ev = evaluarVentana(undefined, fotoA, T0, VENTANA);
eq(ev.accion, 'iniciar', 'ventana: sin entrada previa → inicia');
ev = evaluarVentana(ev.entrada, fotoA, T0 + 5 * 60_000, VENTANA);
eq(ev.accion, 'esperar', 'ventana: misma foto a los 5 min → sigue esperando');
eq(ev.restantesMs, 5 * 60_000, 'ventana: restan 5 min');
ev = evaluarVentana({ foto: fotoA, desdeMs: T0 }, fotoB, T0 + 5 * 60_000, VENTANA);
eq(ev.accion, 'reiniciar', 'ventana: cambio de marcador a los 5 min → se reinicia');
eq(ev.entrada.desdeMs, T0 + 5 * 60_000, 'ventana: el reloj vuelve a cero en el reinicio');
ev = evaluarVentana({ foto: fotoB, desdeMs: T0 + 5 * 60_000 }, fotoB, T0 + 14 * 60_000, VENTANA);
eq(ev.accion, 'esperar', 'ventana: tras el reinicio, a los 9 min aún no liquida');
ev = evaluarVentana({ foto: fotoB, desdeMs: T0 + 5 * 60_000 }, fotoB, T0 + 15 * 60_000, VENTANA);
eq(ev.accion, 'liquidar', 'ventana: 10 min sin cambios tras el reinicio → a liquidar');

// Persistencia: el estado sobrevive el viaje a disco (JSON) y la
// segunda corrida no vuelve a liquidar ni a pagar.
const estado = crearEstadoLiquidaciones();
estado.liquidadas['q-nations'] = { nombre: 'NATIONS LEAGUE' };
const estadoDisco = JSON.parse(JSON.stringify(estado));
eq(estadoDisco.liquidadas['q-nations'].nombre, 'NATIONS LEAGUE', 'persistencia: la marca de liquidada sobrevive el viaje a disco');
const ganadoresNL = planNL.ganadores;
eq(ganadoresPendientes(ganadoresNL, []).length, 1, 'diario: sin pagos registrados, el ganador está pendiente');
eq(ganadoresPendientes(ganadoresNL, ['u-roberto']).length, 0, 'diario: tras pagar, no queda pendiente (segunda corrida no duplica)');

console.log(`\nliquidación: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
