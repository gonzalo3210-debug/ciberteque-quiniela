// scripts/pruebas-camino-final.mjs
//
// Pruebas de la lógica PURA del tablero "🏁 Camino a la final"
// (src/lib/caminoFinal.ts): derivación de etapas, eliminaciones,
// campeón y detección de cambios para animar, con un torneo
// fabricado de 8 equipos y 7 partidos revisado ronda por ronda.
// Sin red ni base de datos: se corre con
// `node scripts/pruebas-camino-final.mjs`.

const {
  calcularCaminoFinal,
  detectarCambiosCamino,
  fotoCamino,
  nombreEtapaCamino,
  normalizarNombreEquipo,
} = await import('../src/lib/caminoFinal.ts');

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

// ---------- Fixtures -------------------------------------------------------
// Equipos del bombo (ids como los de la base; en los partidos los
// equipos viven por NOMBRE, como en la tabla real).
const EQ = {
  america: { id: 'e-ame', nombre: 'América' },
  chivas: { id: 'e-chi', nombre: 'Chivas' },
  tigres: { id: 'e-tig', nombre: 'Tigres' },
  monterrey: { id: 'e-mon', nombre: 'Monterrey' },
  cruzAzul: { id: 'e-cru', nombre: 'Cruz Azul' },
  pumas: { id: 'e-pum', nombre: 'Pumas' },
  toluca: { id: 'e-tol', nombre: 'Toluca' },
  pachuca: { id: 'e-pac', nombre: 'Pachuca' },
};
const pase = (ticketId, usuarioId, nombreJugador, eq) => ({
  ticketId,
  usuarioId,
  nombreJugador,
  equipoId: eq.id,
  nombreEquipo: eq.nombre,
  logoUrl: null,
});
// 10 pases: Pachuca y América con DOS pases cada uno (jugadores
// distintos que avanzan juntos) y Gonzalo con dos pases en equipos
// distintos (América y Pachuca).
const PASES = [
  pase('t1', 'u-ana', 'Ana', EQ.america),
  pase('t2', 'u-beto', 'Beto', EQ.chivas),
  pase('t3', 'u-caro', 'Caro', EQ.tigres),
  pase('t4', 'u-dany', 'Dany', EQ.monterrey),
  pase('t5', 'u-elena', 'Elena', EQ.cruzAzul),
  pase('t6', 'u-fede', 'Fede', EQ.pumas),
  pase('t7', 'u-gabi', 'Gabi', EQ.toluca),
  pase('t8', 'u-hugo', 'Hugo', EQ.pachuca),
  pase('t9', 'u-gonzalo', 'Gonzalo', EQ.pachuca),
  pase('t10', 'u-gonzalo', 'Gonzalo', EQ.america),
];
const partido = (
  id,
  equipoLocal,
  equipoVisitante,
  golesLocal,
  golesVisitante,
  esFinal,
  fecha,
  resultadoReal = null
) => ({
  id,
  equipoLocal,
  equipoVisitante,
  golesLocal,
  golesVisitante,
  esFinal,
  fecha,
  resultadoReal,
});
// El cuadro completo SIN jugar (los 7 partidos por disputarse).
const CUADRO = [
  partido('qf1', 'América', 'Chivas', null, null, false, '2026-12-05T19:00:00Z'),
  partido('qf2', 'Tigres', 'Monterrey', null, null, false, '2026-12-05T21:00:00Z'),
  partido('qf3', 'Cruz Azul', 'Pumas', null, null, false, '2026-12-06T18:00:00Z'),
  partido('qf4', 'Toluca', 'Pachuca', null, null, false, '2026-12-06T20:00:00Z'),
  partido('sf1', 'America', 'Cruz Azul', null, null, false, '2026-12-09T20:00:00Z'), // sin acento a propósito
  partido('sf2', 'Tigres', 'Pachuca', null, null, false, '2026-12-10T20:00:00Z'),
  partido('f1', 'América', 'Pachuca', null, null, false, '2026-12-13T20:00:00Z'),
];
const conMarcadores = (base, cambios) =>
  base.map((p) => {
    const c = cambios[p.id];
    return c ? { ...p, ...c } : p;
  });
// Cuartos jugados: América 2-0 Chivas; Tigres 1-1 Monterrey (pasa
// Tigres por penales: resultadoReal 'L'); Cruz Azul 3-1 Pumas;
// Toluca 0-1 Pachuca.
const CUARTOS = conMarcadores(CUADRO, {
  qf1: { golesLocal: 2, golesVisitante: 0, esFinal: true, resultadoReal: 'L' },
  qf2: { golesLocal: 1, golesVisitante: 1, esFinal: true, resultadoReal: 'L' },
  qf3: { golesLocal: 3, golesVisitante: 1, esFinal: true, resultadoReal: 'L' },
  qf4: { golesLocal: 0, golesVisitante: 1, esFinal: true, resultadoReal: 'V' },
});
// Semifinal a medias: SF1 final (América 2-1 Cruz Azul); SF2 en vivo
// Tigres 0-1 Pachuca (parcial, NO final).
const SEMIS = conMarcadores(CUARTOS, {
  sf1: { golesLocal: 2, golesVisitante: 1, esFinal: true, resultadoReal: 'L' },
  sf2: { golesLocal: 0, golesVisitante: 1, esFinal: false },
});
// Torneo completo: SF2 cierra Tigres 0-2 Pachuca y la final es
// América 3-2 Pachuca.
const COMPLETO = conMarcadores(CUARTOS, {
  sf1: { golesLocal: 2, golesVisitante: 1, esFinal: true, resultadoReal: 'L' },
  sf2: { golesLocal: 0, golesVisitante: 2, esFinal: true, resultadoReal: 'V' },
  f1: { golesLocal: 3, golesVisitante: 2, esFinal: true, resultadoReal: 'L' },
});
const porTicket = (camino) =>
  Object.fromEntries(camino.pases.map((e) => [e.pase.ticketId, e]));

// ---------- 1) Nombres y etapas ---------------------------------------------
eq(normalizarNombreEquipo('  América '), 'america', 'normaliza acentos y espacios');
eq(normalizarNombreEquipo('Cruz Azul'), 'cruz azul', 'normaliza mayúsculas');
eq(nombreEtapaCamino(0, 3), 'Cuartos', 'cuadro de 8: etapa 0 = Cuartos');
eq(nombreEtapaCamino(1, 3), 'Semifinal', 'cuadro de 8: etapa 1 = Semifinal');
eq(nombreEtapaCamino(2, 3), 'Final', 'cuadro de 8: etapa 2 = Final');
eq(nombreEtapaCamino(0, 2), 'Semifinal', 'cuadro de 4: etapa 0 = Semifinal');
eq(nombreEtapaCamino(0, 4), 'Octavos', 'cuadro de 16: etapa 0 = Octavos');

// ---------- 2) Antes de cualquier partido: todos en Cuartos -----------------
const previo0 = calcularCaminoFinal(PASES, CUADRO, 8);
eq(previo0.rondasTotales, 3, 'cuadro de 8: 3 rondas');
eq(
  previo0.columnas.map((c) => c.nombre),
  ['Cuartos', 'Semifinal', 'Final', 'Campeón'],
  'columnas del tablero en orden'
);
eq(previo0.partidosFinales, 0, 'ningún partido final aún');
eq(previo0.hayCampeon, false, 'sin campeón al inicio');
ok(
  previo0.pases.every((e) => e.estado === 'vivo' && e.etapaIndice === 0),
  'todos vivos en la columna de Cuartos'
);
eq(previo0.porColumna[0].length, 10, 'los 10 pases abren en Cuartos');
eq(previo0.porColumna[3].length, 0, 'columna de Campeón vacía');
const est0 = porTicket(previo0);
eq(est0.t1.proximoPartido.rivalNombre, 'Chivas', 'América abre contra Chivas');
eq(est0.t1.proximoPartido.enVivo, false, 'su partido aún no empieza');
eq(est0.t1.enRiesgo, false, 'nadie en riesgo sin partidos jugados');
// Sin NINGÚN partido cargado: igual todos vivos, sin próximo definido.
const sinPartidos = calcularCaminoFinal(PASES, [], 8);
ok(
  sinPartidos.pases.every((e) => e.estado === 'vivo' && e.proximoPartido === null),
  'sin partidos en el cuadro: vivos y sin próximo partido'
);

// ---------- 3) Solo cuartos jugados -------------------------------------------
const trasCuartos = calcularCaminoFinal(PASES, CUARTOS, 8);
const estC = porTicket(trasCuartos);
eq(trasCuartos.partidosFinales, 4, '4 partidos finales tras cuartos');
eq(trasCuartos.hayCampeon, false, 'aún no hay campeón tras cuartos');
eq(estC.t1.estado, 'vivo', 'América sigue vivo');
eq(estC.t1.etapaIndice, 1, 'América ya está en Semifinal');
eq(estC.t1.etapaNombre, 'Semifinal', 'etapa de América: Semifinal');
eq(estC.t1.victorias, 1, 'América lleva 1 victoria');
eq(estC.t10.etapaIndice, 1, 'el segundo pase de América avanza junto al primero');
eq(estC.t8.etapaIndice, 1, 'Pachuca (Hugo) avanza a Semifinal');
eq(estC.t9.etapaIndice, 1, 'Pachuca (Gonzalo) avanza junto a Hugo: mismo equipo');
eq(estC.t3.victorias, 1, 'Tigres avanzó por penales (goles 1-1, resultado L)');
eq(estC.t2.estado, 'eliminado', 'Chivas quedó eliminado');
eq(estC.t2.caida.etapaNombre, 'Cuartos', 'Chivas cayó en Cuartos');
eq(estC.t2.caida.rivalNombre, 'América', 'Chivas cayó contra América');
eq(estC.t2.caida.marcadorTexto, '0-2', 'marcador de la caída de Chivas: 0-2');
eq(estC.t4.caida.marcadorTexto, '1-1', 'Monterrey cayó en penales con 1-1');
eq(estC.t4.caida.rivalNombre, 'Tigres', 'Monterrey cayó contra Tigres');
eq(estC.t6.caida.marcadorTexto, '1-3', 'Pumas cayó 1-3');
eq(estC.t7.caida.rivalNombre, 'Pachuca', 'Toluca cayó contra Pachuca');
eq(
  trasCuartos.porColumna[0].map((e) => e.pase.ticketId).sort(),
  ['t2', 't4', 't6', 't7'],
  'la columna de Cuartos guarda a los 4 caídos'
);
eq(
  trasCuartos.porColumna[1].map((e) => e.pase.ticketId).sort(),
  ['t1', 't10', 't3', 't5', 't8', 't9'],
  'la columna de Semifinal trae a los 6 pases vivos'
);
eq(estC.t1.proximoPartido.rivalNombre, 'Cruz Azul', 'la semifinal de América es contra Cruz Azul (nombre sin acento en el partido, cruce correcto)');

// ---------- 4) Semifinal a medias (una final y una en vivo) -------------------
const trasSemis = calcularCaminoFinal(PASES, SEMIS, 8);
const estS = porTicket(trasSemis);
eq(trasSemis.partidosFinales, 5, '5 finales con la primera semifinal');
eq(estS.t1.etapaIndice, 2, 'América ya está en la Final');
eq(estS.t1.etapaNombre, 'Final', 'etapa de América: Final');
eq(estS.t1.proximoPartido.rivalNombre, 'Pachuca', 'América ya ve su final: contra Pachuca, que va ganando su semifinal');
eq(estS.t1.proximoPartido.enVivo, false, 'la final aún no se juega');
eq(estS.t5.estado, 'eliminado', 'Cruz Azul cayó en la semifinal');
eq(estS.t5.caida.etapaNombre, 'Semifinal', 'Cruz Azul cayó en Semifinal');
eq(estS.t5.caida.marcadorTexto, '1-2', 'Cruz Azul cayó 1-2');
eq(estS.t3.estado, 'vivo', 'Tigres sigue vivo: su partido NO es final');
eq(estS.t3.etapaIndice, 1, 'Tigres sigue en Semifinal mientras juega');
eq(estS.t3.enRiesgo, true, 'Tigres va perdiendo en vivo: en riesgo (solo dato)');
eq(estS.t3.proximoPartido.enVivo, true, 'el partido de Tigres está en vivo');
eq(estS.t8.enRiesgo, false, 'Pachuca va ganando en vivo: no está en riesgo');
eq(estS.t8.estado, 'vivo', 'Pachuca aún no avanza: el partido no es final');
eq(estS.t8.etapaIndice, 1, 'Pachuca sigue en Semifinal hasta el silbatazo');
eq(trasSemis.hayCampeon, false, 'sin campeón con semifinal a medias');

// ---------- 5) Torneo completo: hay campeón ------------------------------------
const completo = calcularCaminoFinal(PASES, COMPLETO, 8);
const estF = porTicket(completo);
eq(completo.partidosFinales, 7, 'los 7 partidos quedaron finales');
eq(completo.hayCampeon, true, 'hay campeón al cerrar el torneo');
eq(completo.campeonEquipoId, 'e-ame', 'el equipo campeón es América');
eq(estF.t1.estado, 'campeon', 'el pase de Ana (América) es campeón');
eq(estF.t10.estado, 'campeon', 'el segundo pase de América (Gonzalo) también es campeón');
eq(estF.t1.etapaNombre, 'Campeón', 'etapa del campeón: Campeón');
eq(estF.t1.etapaIndice, 3, 'el campeón vive en la última columna');
eq(estF.t1.victorias, 3, 'América ganó sus 3 partidos');
eq(estF.t9.estado, 'eliminado', 'el pase de Pachuca de Gonzalo cayó en la final');
eq(estF.t9.caida.etapaNombre, 'Final', 'Pachuca cayó en la Final');
eq(estF.t9.caida.marcadorTexto, '2-3', 'Pachuca cayó 2-3 en la final');
eq(
  completo.porColumna[3].map((e) => e.pase.ticketId).sort(),
  ['t1', 't10'],
  'la columna de Campeón trae los 2 pases de América'
);
eq(
  completo.porColumna[2].map((e) => e.pase.ticketId).sort(),
  ['t8', 't9'],
  'la columna de la Final guarda a los pases caídos ahí'
);
eq(estF.t3.caida.etapaNombre, 'Semifinal', 'Tigres terminó cayendo en Semifinal');
eq(estF.t3.caida.marcadorTexto, '0-2', 'Tigres cayó 0-2 ya con el partido final');

// ---------- 6) Partido final SIN goles no mueve a nadie -------------------------
const finalSinGoles = conMarcadores(CUADRO, {
  qf1: { esFinal: true, golesLocal: null, golesVisitante: null },
});
const estSG = porTicket(calcularCaminoFinal(PASES, finalSinGoles, 8));
eq(estSG.t1.victorias, 0, 'final sin goles capturados: América no suma victoria');
eq(estSG.t2.estado, 'vivo', 'final sin goles: Chivas no queda eliminado');

// ---------- 7) Detección de cambios para la animación -----------------------------
eq(
  detectarCambiosCamino(null, trasCuartos.pases).size,
  0,
  'sin foto previa no se anima nada (primera carga = línea base)'
);
const cambiosCS = detectarCambiosCamino(fotoCamino(trasCuartos.pases), trasSemis.pases);
eq(cambiosCS.get('t1'), 'avanzo', 'América avanzó a la Final: se anima el avance');
eq(cambiosCS.get('t5'), 'eliminado', 'Cruz Azul cayó: se anima la eliminación');
eq(cambiosCS.has('t3'), false, 'Tigres en vivo sin cambio de etapa: no se anima');
const cambiosSF = detectarCambiosCamino(fotoCamino(trasSemis.pases), completo.pases);
eq(cambiosSF.get('t1'), 'campeon', 'América se coronó: animación de campeón');
eq(cambiosSF.get('t10'), 'campeon', 'su segundo pase también se corona');
eq(cambiosSF.get('t8'), 'eliminado', 'Pachuca cayó en la final: eliminación');
eq(
  detectarCambiosCamino(fotoCamino(completo.pases), completo.pases).size,
  0,
  'sin cambios entre refrescos no se anima nada'
);

// ---------- 8) Degradación: cuadro de 4 equipos -------------------------------------
const PASES4 = [
  pase('x1', 'u1', 'Uno', EQ.america),
  pase('x2', 'u2', 'Dos', EQ.chivas),
  pase('x3', 'u3', 'Tres', EQ.tigres),
  pase('x4', 'u4', 'Cuatro', EQ.pumas),
];
const CUADRO4 = [
  partido('s1', 'América', 'Chivas', 1, 0, true, '2026-12-05T19:00:00Z', 'L'),
  partido('s2', 'Tigres', 'Pumas', 2, 2, true, '2026-12-05T21:00:00Z', 'V'),
  partido('ff', 'América', 'Pumas', 2, 1, true, '2026-12-08T20:00:00Z', 'L'),
];
const camino4 = calcularCaminoFinal(PASES4, CUADRO4, 4);
eq(camino4.rondasTotales, 2, 'cuadro de 4: 2 rondas');
eq(
  camino4.columnas.map((c) => c.nombre),
  ['Semifinal', 'Final', 'Campeón'],
  'cuadro de 4: columnas Semifinal, Final y Campeón'
);
const estX = porTicket(camino4);
eq(estX.x1.estado, 'campeon', 'América campeón del cuadro de 4 con 2 victorias');
eq(estX.x4.caida.etapaNombre, 'Final', 'Pumas cayó en la Final del cuadro de 4');
eq(estX.x2.caida.etapaNombre, 'Semifinal', 'Chivas cayó en Semifinal del cuadro de 4');

// ---------- 9) Determinismo y no mutación -------------------------------------------
const copia = JSON.stringify({ PASES, COMPLETO });
eq(
  JSON.stringify(calcularCaminoFinal(PASES, COMPLETO, 8)),
  JSON.stringify(completo),
  'determinismo: misma entrada, mismo camino'
);
eq(JSON.stringify({ PASES, COMPLETO }), copia, 'el cálculo NO muta sus entradas');

console.log(`\ncamino-final: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
