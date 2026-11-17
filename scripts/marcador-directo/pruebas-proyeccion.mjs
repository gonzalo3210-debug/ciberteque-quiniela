// scripts/marcador-directo/pruebas-proyeccion.mjs
//
// Pruebas de la lógica PURA de la proyección en vivo de la app
// (src/lib/proyeccion.ts): la misma implementación que usa el
// ranking oficial. Sin red, sin base de datos: se corre con
// `node scripts/marcador-directo/pruebas-proyeccion.mjs`.

const {
  calcularProyeccion,
  calcularTabla,
  partidoEnVivo,
  puntosDePronostico,
} = await import('../../src/lib/proyeccion.ts');

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

// ---------- 1) Un partido en vivo cambia el liderato -------------------
// Marcador exacto. P1 final 2-1, P2 en vivo 0-1 (parcial), P3 sin empezar.
const partidos1 = [
  { id: 'p1', goles_local: 2, goles_visitante: 1, resultado_real: 'L', es_final: true },
  { id: 'p2', goles_local: 0, goles_visitante: 1, resultado_real: 'V', es_final: false },
  { id: 'p3', goles_local: null, goles_visitante: null, resultado_real: null, es_final: false },
];
const tickets1 = [
  { id: 'A', usuario_id: 'ua', prediccion_goles_total: 6, pronosticos: [
    { partido_id: 'p1', eleccion_usuario: '2-1' }, // exacto final: 3
    { partido_id: 'p2', eleccion_usuario: '1-0' }, // parcial 0-1: fallo
    { partido_id: 'p3', eleccion_usuario: '1-1' },
  ]},
  { id: 'B', usuario_id: 'ub', prediccion_goles_total: 6, pronosticos: [
    { partido_id: 'p1', eleccion_usuario: '1-0' }, // tendencia final: 1
    { partido_id: 'p2', eleccion_usuario: '0-1' }, // exacto parcial: 3
    { partido_id: 'p3', eleccion_usuario: '0-0' },
  ]},
];
const qExacto = { modalidad: 'marcador_exacto', goles_totales_real: null };
const proy1 = calcularProyeccion(qExacto, tickets1, partidos1);
ok(proy1 !== null, 'proyección existe en marcador_exacto');
eq(proy1.hayEnVivo, true, 'hay un partido en vivo');
eq(proy1.hayActividad, true, 'hay actividad (resultados capturados)');
eq(proy1.porTicket.A.puntosSoloFinales, 3, 'A: solo finales suma 3');
eq(proy1.porTicket.A.posicionSoloFinales, 1, 'A: con solo finales va 1°');
eq(proy1.porTicket.B.puntosSoloFinales, 1, 'B: solo finales suma 1');
eq(proy1.porTicket.B.posicionSoloFinales, 2, 'B: con solo finales va 2°');
eq(proy1.porTicket.B.puntos, 4, 'B: con el parcial suma 4');
eq(proy1.porTicket.B.posicion, 1, 'B: el gol en vivo lo sube al 1°');
eq(proy1.porTicket.A.posicion, 2, 'A: baja al 2° en la proyección');
eq(proy1.porTicket.B.movimiento, 1, 'B: movimiento ▲1');
eq(proy1.porTicket.A.movimiento, -1, 'A: movimiento ▼1');
eq(proy1.porTicket.B.desgloseEnVivo.length, 1, 'B: un partido en vivo en su desglose');
eq(proy1.porTicket.B.desgloseEnVivo[0].puntos, 3, 'B: el parcial le da 3 (exacto)');
eq(proy1.porTicket.B.desgloseEnVivo[0].estado, 'acierto_exacto', 'B: estado exacto en vivo');
eq(proy1.tablaProyeccion[0].ticketId, 'B', 'la tabla proyectada abre con B');

// ---------- 2) Empate en puntos: manda la diferencia de goles ----------
// Un solo partido final 1-0 (clásica). Total real de la jornada: 5.
const partidos2 = [
  { id: 'p1', goles_local: 1, goles_visitante: 0, resultado_real: 'L', es_final: true },
];
const mkTicket = (id, pred) => ({
  id, usuario_id: id, prediccion_goles_total: pred,
  pronosticos: [{ partido_id: 'p1', eleccion_usuario: 'L' }], // 1 pt para todos
});
const tabla2 = calcularTabla(
  { modalidad: 'clasica', goles_totales_real: 5 },
  [mkTicket('C', 5), mkTicket('D', 8), mkTicket('E', 8), mkTicket('F', 2)],
  partidos2
);
eq(tabla2.map((f) => f.ticketId), ['C', 'D', 'E', 'F'], 'orden: diff 0, luego diff 3 compartida, luego diff 3... (F también diff 3)');
eq(tabla2[0].posicion, 1, 'C (diff 0) va 1°');
eq(tabla2[1].posicion, 2, 'D va 2°');
eq(tabla2[2].posicion, 2, 'E comparte el 2° con D (mismos puntos y misma diff)');
eq(tabla2[3].posicion, 2, 'F también diff 3 → comparte el 2°');
// Sin total real capturado, la diff vale 999 para todos y el empate es total.
const tabla2b = calcularTabla(
  { modalidad: 'clasica', goles_totales_real: null },
  [mkTicket('C', 5), mkTicket('D', 8)],
  partidos2
);
eq(tabla2b[0].golesDiff, 999, 'sin goles_totales_real la diff es 999');
eq(tabla2b[1].posicion, 1, 'con diff 999 pareja, el 1° se comparte');

// ---------- 3) Boleto sin partidos en vivo ------------------------------
const tickets3 = [
  { id: 'G', usuario_id: 'ug', prediccion_goles_total: 4, pronosticos: [
    { partido_id: 'p1', eleccion_usuario: '0-0' }, // final: fallo
    { partido_id: 'p3', eleccion_usuario: '2-2' }, // sin empezar: pendiente
  ]},
];
const proy3 = calcularProyeccion(qExacto, tickets3, partidos1);
eq(proy3.porTicket.G.desgloseEnVivo.length, 0, 'G: ningún partido en vivo en su boleto');
eq(proy3.porTicket.G.puntos, proy3.porTicket.G.puntosSoloFinales, 'G: proyección = solo finales');
eq(proy3.porTicket.G.movimiento, 0, 'G: sin movimiento');

// ---------- 4) Quiniela sin ningún partido empezado ---------------------
const partidos4 = [
  { id: 'p1', goles_local: null, goles_visitante: null, resultado_real: null, es_final: false },
  { id: 'p2', goles_local: null, goles_visitante: null, resultado_real: null, es_final: false },
];
const proy4 = calcularProyeccion({ modalidad: 'clasica', goles_totales_real: null }, tickets1, partidos4);
eq(proy4.hayEnVivo, false, 'sin resultados no hay en vivo');
eq(proy4.hayActividad, false, 'sin resultados no hay actividad (proyección vacía)');
eq(proy4.tablaProyeccion.every((f) => f.puntos === 0), true, 'nadie suma sin resultados');

// ---------- 5) Reglas por modalidad con parciales -----------------------
// Clásica L/E/V: tendencia en vivo vale 1; marcador parcial sin goles
// (solo resultado_real capturado) también puntúa como en la app.
eq(puntosDePronostico('clasica', 'L', { id: 'x', goles_local: 1, goles_visitante: 0, resultado_real: 'L', es_final: false }).puntos, 1, 'clásica: tendencia en vivo = 1');
eq(puntosDePronostico('clasica', 'L', { id: 'x', goles_local: null, goles_visitante: null, resultado_real: 'L', es_final: false }).estado, 'acierto_exacto', 'clásica: pick L contra resultado_real L parcial = acierto (como el ranking oficial)');
eq(puntosDePronostico('marcador_exacto', '2-1', { id: 'x', goles_local: 2, goles_visitante: 1, resultado_real: 'L', es_final: false }).puntos, 3, 'marcador exacto parcial = 3');
eq(puntosDePronostico('marcador_exacto', '3-1', { id: 'x', goles_local: 2, goles_visitante: 1, resultado_real: 'L', es_final: false }).puntos, 1, 'marcador exacto: solo tendencia parcial = 1');
eq(puntosDePronostico('marcador_exacto', '2-1', { id: 'x', goles_local: 2, goles_visitante: 1, resultado_real: 'L', es_final: false }, { soloFinales: true }).estado, 'pendiente', 'con soloFinales el parcial no cuenta');
eq(puntosDePronostico('clasica', 'L', { id: 'x', goles_local: null, goles_visitante: null, resultado_real: null, es_final: true }).estado, 'pendiente', 'final sin resultado capturado = pendiente');
eq(partidoEnVivo({ goles_local: 0, goles_visitante: 0, resultado_real: 'E', es_final: false }), true, '0-0 parcial ya es partido en vivo');
eq(partidoEnVivo({ goles_local: 0, goles_visitante: 0, resultado_real: 'E', es_final: true }), false, '0-0 final ya no es en vivo');

// ---------- 6) Sorteo no se proyecta ------------------------------------
eq(calcularProyeccion({ modalidad: 'sorteo', goles_totales_real: null }, tickets1, partidos1), null, 'sorteo: proyección null');
eq(calcularTabla({ modalidad: 'sorteo', goles_totales_real: null }, tickets1, partidos1), [], 'sorteo: tabla vacía');

console.log(`\nproyección: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
