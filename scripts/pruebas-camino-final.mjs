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
  calcularLlavesCamino,
  colapsarIdaVuelta,
  detectarCambiosCamino,
  fotoCamino,
  infoLlaveCamino,
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

// ---------- 10) Llaves por siembra (sin partidos cargados) ----------------------
// El orden guardado del bombo (la siembra, 1° a 8°): es el caso de
// la sala de prueba de Gonzalo, jalada de la TABLA.
const ORDEN_BOMBO = [
  'América', 'Tigres', 'Cruz Azul', 'Toluca',
  'Pachuca', 'Pumas', 'Monterrey', 'Chivas',
];
const paresDe = (llaves) => llaves.map((l) => l.lados.map((s) => s.nombreEquipo));
const caminoSin = calcularCaminoFinal(PASES, [], 8);
const llavesSiembra = calcularLlavesCamino(caminoSin, [], ORDEN_BOMBO);
eq(llavesSiembra.fuentePrimeraRonda, 'siembra', 'sin partidos: la fuente de cuartos es la siembra');
eq(
  paresDe(llavesSiembra.porRonda[0]),
  [['América', 'Chivas'], ['Tigres', 'Monterrey'], ['Cruz Azul', 'Pumas'], ['Toluca', 'Pachuca']],
  'siembra clásica: llaves 1v8, 2v7, 3v6, 4v5'
);
eq(
  llavesSiembra.porRonda[0].map((l) => l.letra),
  ['A', 'B', 'C', 'D'],
  'las llaves de cuartos llevan letra en orden'
);
ok(
  llavesSiembra.porRonda[0].every((l) => l.partidoId === null),
  'las llaves por siembra no traen partido'
);
eq(
  llavesSiembra.porRonda[0][0].lados[0].pases.map((e) => e.pase.ticketId),
  ['t1', 't10'],
  'el lado de América trae a sus dos pases (jugadores del equipo)'
);
eq(llavesSiembra.porRonda[1], [], 'sin partidos no hay llaves de semifinal');
eq(llavesSiembra.porRonda[2], [], 'sin partidos no hay llave de final');
const llavesNada = calcularLlavesCamino(caminoSin, [], null);
eq(llavesNada.fuentePrimeraRonda, null, 'sin partidos y sin orden guardado: no hay fuente');
eq(llavesNada.porRonda[0], [], 'sin partidos y sin orden: cuartos sin llaves (la vista de hoy)');

// ---------- 11) Llaves desde los partidos reales del cuadro ---------------------
// Cruces DISTINTOS a los de la siembra: si el cuadro ya los trae,
// mandan los partidos aunque exista orden guardado.
const CUADRO_ALT = [
  partido('a1', 'América', 'Pachuca', null, null, false, '2026-12-05T19:00:00Z'),
  partido('a2', 'Tigres', 'Pumas', null, null, false, '2026-12-05T21:00:00Z'),
  partido('a3', 'Cruz Azul', 'Chivas', null, null, false, '2026-12-06T18:00:00Z'),
  partido('a4', 'Toluca', 'Monterrey', null, null, false, '2026-12-06T20:00:00Z'),
];
const llavesPartidos = calcularLlavesCamino(
  calcularCaminoFinal(PASES, CUADRO_ALT, 8),
  CUADRO_ALT,
  ORDEN_BOMBO
);
eq(llavesPartidos.fuentePrimeraRonda, 'partidos', 'con los 4 cruces cargados la fuente es partidos');
eq(
  paresDe(llavesPartidos.porRonda[0]),
  [['América', 'Pachuca'], ['Tigres', 'Pumas'], ['Cruz Azul', 'Chivas'], ['Toluca', 'Monterrey']],
  'las llaves son los cruces reales del cuadro, no la siembra'
);
eq(llavesPartidos.porRonda[0][0].partidoId, 'a1', 'la llave guarda el partido que la define');

// ---------- 12) El eliminado se apaga DENTRO de su llave ---------------------------
const llavesCuartos = calcularLlavesCamino(trasCuartos, CUARTOS, ORDEN_BOMBO);
eq(llavesCuartos.fuentePrimeraRonda, 'partidos', 'tras cuartos: la fuente sigue siendo partidos');
const llaveA = llavesCuartos.porRonda[0][0];
eq(
  llaveA.lados.map((s) => s.nombreEquipo),
  ['América', 'Chivas'],
  'llave A: América vs Chivas'
);
eq(llaveA.lados[0].representante.estado, 'vivo', 'América sigue vivo dentro de su llave');
eq(llaveA.lados[1].representante.estado, 'eliminado', 'Chivas se apaga dentro de su llave');
eq(llaveA.lados[1].representante.caida.marcadorTexto, '0-2', 'la caída de Chivas viaja en su lado de la llave');
eq(
  paresDe(llavesCuartos.porRonda[1]),
  [['América', 'Cruz Azul'], ['Tigres', 'Pachuca']],
  'las semifinales se emparejan según los partidos cargados'
);
eq(
  JSON.stringify(calcularLlavesCamino(trasCuartos, CUARTOS, ORDEN_BOMBO)),
  JSON.stringify(llavesCuartos),
  'llaves deterministas: misma entrada, mismas llaves'
);

// ---------- 13) La final se empareja cuando el cuadro la define ---------------------
const TRAS_SEMIS2 = conMarcadores(SEMIS, {
  sf2: { golesLocal: 0, golesVisitante: 2, esFinal: true, resultadoReal: 'V' },
});
const llavesS2 = calcularLlavesCamino(
  calcularCaminoFinal(PASES, TRAS_SEMIS2, 8),
  TRAS_SEMIS2,
  ORDEN_BOMBO
);
eq(
  paresDe(llavesS2.porRonda[2]),
  [['América', 'Pachuca']],
  'con las dos semifinales finales, la final se empareja según su partido'
);
const llaveFinal = calcularLlavesCamino(completo, COMPLETO, ORDEN_BOMBO).porRonda[2][0];
eq(
  llaveFinal.lados.map((s) => s.nombreEquipo),
  ['América', 'Pachuca'],
  'llave de la final: América vs Pachuca'
);
eq(llaveFinal.lados[0].representante.estado, 'campeon', 'el campeón se ve coronado en su lado de la final');
eq(llaveFinal.lados[1].representante.estado, 'eliminado', 'el finalista caído se apaga en la llave');
eq(llaveFinal.lados[1].representante.caida.etapaNombre, 'Final', 'Pachuca cayó en la Final (desde su lado)');

// ---------- 14) Cuartos a medias no mandan: cae a la siembra -------------------------
const PARCIAL = CUADRO.slice(0, 2);
const llavesParcial = calcularLlavesCamino(
  calcularCaminoFinal(PASES, PARCIAL, 8),
  PARCIAL,
  ORDEN_BOMBO
);
eq(
  llavesParcial.fuentePrimeraRonda,
  'siembra',
  'con solo 2 cruces cargados no se aceptan los partidos: manda la siembra'
);
eq(llavesParcial.porRonda[0].length, 4, 'la siembra completa las 4 llaves');

// ---------- 15) Sala sin sortear: vacío elegante ---------------------------------------
const vacio = calcularLlavesCamino(calcularCaminoFinal([], [], 8), [], []);
eq(vacio.porRonda, [[], [], []], 'sin pases ni partidos: ninguna llave');
eq(vacio.fuentePrimeraRonda, null, 'sin pases ni partidos: sin fuente');

// ---------- 16) Reproducción: la sala real de Gonzalo (2026-11-22) -------------------
// «PRUEBA LIGUILLA», 4 jugadores × 2 pases. Al llenar el bombo a
// mano, Gonzalo desmarcó al América y lo volvió a marcar: el orden
// guardado quedó en orden de SELECCIÓN, con el América (2° de la
// tabla) al final del arreglo. Sembrando sobre ese orden, las
// llaves salían Cruz Azul–América, Chivas–Pachuca, Atlas–León y
// Toluca–Monterrey (así se vio en vivo). El arreglo: la siembra se
// deriva de la TABLA (resolverSiembra) y las llaves correctas son
// 1v8, 2v7, 3v6, 4v5, cada lado con su número de posición.
const { resolverSiembra } = await import('../src/lib/bomboSorteo.ts');
const { nombreEquipoES } = await import('../src/lib/sports/nombresES.ts');
const EQ_SALA = {
  cruzAzul: { id: 's-cru', nombre: 'Cruz Azul' },
  america: { id: 's-ame', nombre: 'América' },
  chivas: { id: 's-chi', nombre: 'Chivas' },
  atlas: { id: 's-atl', nombre: 'Atlas' },
  toluca: { id: 's-tol', nombre: 'Toluca' },
  monterrey: { id: 's-mon', nombre: 'Monterrey' },
  leon: { id: 's-leo', nombre: 'León' },
  pachuca: { id: 's-pac', nombre: 'Pachuca' },
};
const PASES_SALA = [
  pase('s1', 'u-yajaira', 'Yajaira Robles', EQ_SALA.cruzAzul),
  pase('s2', 'u-yajaira', 'Yajaira Robles', EQ_SALA.monterrey),
  pase('s3', 'u-gonzalo', 'Gonzalo Montero', EQ_SALA.america),
  pase('s4', 'u-gonzalo', 'Gonzalo Montero', EQ_SALA.leon),
  pase('s5', 'u-dario', 'Darío Murillo', EQ_SALA.chivas),
  pase('s6', 'u-dario', 'Darío Murillo', EQ_SALA.pachuca),
  pase('s7', 'u-julio', 'Julio Montero', EQ_SALA.atlas),
  pase('s8', 'u-julio', 'Julio Montero', EQ_SALA.toluca),
];
// El orden EXACTO que quedó guardado en la sala (leído de la base).
const ORDEN_GUARDADO_SALA = [
  'Cruz Azul', 'Chivas', 'Atlas', 'Toluca',
  'Monterrey', 'León', 'Pachuca', 'América',
];
// La tabla real de la API a la jornada 17 (nombre e ID del proveedor).
const TABLA_SALA = [
  { rank: 1, teamName: 'Cruz Azul', teamProviderId: '134196' },
  { rank: 2, teamName: 'América', teamProviderId: '134193' },
  { rank: 3, teamName: 'CD Guadalajara', teamProviderId: '134206' },
  { rank: 4, teamName: 'Atlas', teamProviderId: '134195' },
  { rank: 5, teamName: 'Toluca', teamProviderId: '134204' },
  { rank: 6, teamName: 'Monterrey', teamProviderId: '134198' },
  { rank: 7, teamName: 'León', teamProviderId: '134207' },
  { rank: 8, teamName: 'Pachuca', teamProviderId: '134191' },
  { rank: 9, teamName: 'Tijuana', teamProviderId: '134202' },
  { rank: 10, teamName: 'Santos Laguna', teamProviderId: '134192' },
];
const caminoSala = calcularCaminoFinal(PASES_SALA, [], 8);
// El bug, tal cual se vio en vivo: sembrando sobre el orden guardado.
eq(
  paresDe(calcularLlavesCamino(caminoSala, [], ORDEN_GUARDADO_SALA).porRonda[0]),
  [['Cruz Azul', 'América'], ['Chivas', 'Pachuca'], ['Atlas', 'León'], ['Toluca', 'Monterrey']],
  'el bug: con el orden guardado en orden de selección, las llaves salen mal'
);
// El arreglo: la siembra sale de la tabla y las llaves se corrigen.
const siembraSala = resolverSiembra(ORDEN_GUARDADO_SALA, TABLA_SALA, nombreEquipoES);
const llavesSala = calcularLlavesCamino(caminoSala, [], siembraSala.orden, {
  posicionesSiembra: siembraSala.posiciones,
  siembraDesdeTabla: siembraSala.fuente === 'tabla',
});
eq(llavesSala.fuentePrimeraRonda, 'siembra', 'la sala sin partidos: la fuente es la siembra');
eq(llavesSala.siembraDesdeTabla, true, 'la siembra de la sala salió de la tabla');
eq(
  paresDe(llavesSala.porRonda[0]),
  [['Cruz Azul', 'Pachuca'], ['América', 'León'], ['Chivas', 'Monterrey'], ['Atlas', 'Toluca']],
  'con la siembra de tabla: Cruz Azul–Pachuca, América–León, Chivas–Monterrey, Atlas–Toluca'
);
eq(
  llavesSala.porRonda[0].map((l) => l.lados.map((s) => s.posicionSiembra)),
  [[1, 8], [2, 7], [3, 6], [4, 5]],
  'cada lado trae su número de posición según la tabla'
);
eq(
  llavesSala.porRonda[0][1].lados.map((s) => s.pases.map((e) => e.pase.nombreJugador)),
  [['Gonzalo Montero'], ['Gonzalo Montero']],
  'la llave B es el duelo de Gonzalo: su América (2) contra su León (7)'
);
// El respaldo queda marcado: sin tabla, la vista avisa (no calla).
const siembraGuardada = resolverSiembra(ORDEN_GUARDADO_SALA, null, nombreEquipoES);
const llavesGuardada = calcularLlavesCamino(caminoSala, [], siembraGuardada.orden, {
  posicionesSiembra: siembraGuardada.posiciones,
  siembraDesdeTabla: siembraGuardada.fuente === 'tabla',
});
eq(llavesGuardada.siembraDesdeTabla, false, 'sin tabla: la siembra por orden guardado queda marcada para el aviso');

// ---------- Ida y vuelta de liguilla (colapsarIdaVuelta) -------------------
// La liguilla real de Gonzalo (Apertura 2026): cuartos a ida y
// vuelta. El tablero debe decidir por el GLOBAL y nadie cae en la
// ida. Siembra real: 1 Chivas, 2 Cruz Azul, 3 América, 4 Atlas,
// 5 Toluca, 6 Monterrey, 7 León, 8 Pachuca.
{
  const LEON = { id: 'e-leo', nombre: 'León' };
  const ATLAS = { id: 'e-atl', nombre: 'Atlas' };
  const PASES_LIG = [
    pase('L1', 'u-gon', 'Gonzalo', EQ.chivas),
    pase('L2', 'u-die', 'Diego', EQ.cruzAzul),
    pase('L3', 'u-laz', 'Lazariño', EQ.america),
    pase('L4', 'u-rob', 'Roberto', ATLAS),
    pase('L5', 'u-elv', 'Elvis', EQ.toluca),
    pase('L6', 'u-fab', 'Fabian', EQ.monterrey),
    pase('L7', 'u-seb', 'Sebastián', LEON),
    pase('L8', 'u-fra', 'Francisco', EQ.pachuca),
  ];
  const POSICIONES = new Map([
    ['chivas', 1], ['cruz azul', 2], ['america', 3], ['atlas', 4],
    ['toluca', 5], ['monterrey', 6], ['leon', 7], ['pachuca', 8],
  ]);
  // Ida: Toluca 2-0 Atlas (final); Monterrey 0-0 América (en vivo);
  // Pachuca–Chivas y León–Cruz Azul por jugarse. Vueltas cargadas.
  const LIGUILLA = [
    partido('i1', 'Toluca', 'Atlas', 2, 0, true, '2026-11-26T01:00:00Z', 'L'),
    partido('i2', 'Monterrey', 'América', 0, 0, false, '2026-11-26T03:10:00Z', 'E'),
    partido('i3', 'Pachuca', 'Chivas', null, null, false, '2026-11-27T01:00:00Z'),
    partido('i4', 'León', 'Cruz Azul', null, null, false, '2026-11-27T03:10:00Z'),
    partido('v1', 'Atlas', 'Toluca', null, null, false, '2026-11-29T01:00:00Z'),
    partido('v2', 'América', 'Monterrey', null, null, false, '2026-11-29T03:10:00Z'),
    partido('v3', 'Chivas', 'Pachuca', null, null, false, '2026-11-30T01:07:00Z'),
    partido('v4', 'Cruz Azul', 'León', null, null, false, '2026-11-30T03:00:00Z'),
  ];
  const colapsados = colapsarIdaVuelta(LIGUILLA, {
    posicionesSiembra: POSICIONES,
    cantidadEquipos: 8,
  });
  eq(colapsados.length, 7, 'ida y vuelta: la ida final se absorbe en su vuelta (8 partidos → 7)');
  const vueltaAtlas = colapsados.find((p) => p.id === 'v1');
  eq(
    vueltaAtlas.ida,
    { golesLocal: 0, golesVisitante: 2 },
    'la vuelta de Atlas trae la ida volteada (Atlas marcó 0, Toluca 2)'
  );
  const caminoLig = calcularCaminoFinal(PASES_LIG, colapsados, 8);
  const estadoDe = (nombre) =>
    caminoLig.pases.find((e) => e.pase.nombreEquipo === nombre);
  eq(estadoDe('Atlas').estado, 'vivo', 'Atlas NO cae por perder la ida 0-2: le falta la vuelta');
  eq(estadoDe('Atlas').proximoPartido.rivalNombre, 'Toluca', 'el próximo de Atlas es la vuelta vs Toluca');
  eq(estadoDe('Atlas').proximoPartido.globalFavor, 0, 'global de Atlas: 0');
  eq(estadoDe('Atlas').proximoPartido.globalContra, 2, 'global en contra de Atlas: 2');
  eq(estadoDe('Atlas').enRiesgo, true, 'Atlas va en riesgo por el global');
  eq(estadoDe('Toluca').proximoPartido.globalFavor, 2, 'global de Toluca: 2');
  eq(estadoDe('América').proximoPartido.enVivo, true, 'la ida de América en vivo se anuncia en vivo');
  eq(estadoDe('América').proximoPartido.globalFavor, null, 'sin ida final no hay global que pintar');
  eq(estadoDe('Chivas').proximoPartido.rivalNombre, 'Pachuca', 'Chivas espera su ida vs Pachuca');

  // La vuelta cae: Atlas gana 1-0 pero el global 1-2 lo deja fuera.
  const conVuelta = conMarcadores(LIGUILLA, {
    v1: { golesLocal: 1, golesVisitante: 0, esFinal: true, resultadoReal: 'L' },
  });
  const col2 = colapsarIdaVuelta(conVuelta, {
    posicionesSiembra: POSICIONES,
    cantidadEquipos: 8,
  });
  const sint = col2.find((p) => p.id === 'v1');
  eq([sint.golesLocal, sint.golesVisitante], [1, 2], 'la llave decidida trae el global (Atlas 1-2 Toluca)');
  const camino2 = calcularCaminoFinal(PASES_LIG, col2, 8);
  const atlas2 = camino2.pases.find((e) => e.pase.nombreEquipo === 'Atlas');
  eq(atlas2.estado, 'eliminado', 'con la vuelta final, Atlas sí cae');
  eq(atlas2.caida.marcadorTexto, '1-2', 'la caída de Atlas registra el global 1-2');
  eq(atlas2.caida.etapaNombre, 'Cuartos', 'Atlas cayó en Cuartos');
  const toluca2 = camino2.pases.find((e) => e.pase.nombreEquipo === 'Toluca');
  eq(toluca2.victorias, 1, 'Toluca suma la victoria de la llave');
  eq(toluca2.etapaIndice, 1, 'Toluca ya vive en Semifinal');

  // Empate global en cuartos: avanza el mejor posicionado (Atlas
  // 4° sobre Toluca 5°) aunque la vuelta la "gane" el local 2-0.
  const empateGlobal = conMarcadores(LIGUILLA, {
    v1: { golesLocal: 2, golesVisitante: 0, esFinal: true, resultadoReal: 'L' },
  });
  const col3 = colapsarIdaVuelta(empateGlobal, {
    posicionesSiembra: POSICIONES,
    cantidadEquipos: 8,
  });
  const sint3 = col3.find((p) => p.id === 'v1');
  eq([sint3.golesLocal, sint3.golesVisitante], [2, 2], 'global empatado 2-2');
  eq(sint3.resultadoReal, 'L', 'el empate global lo resuelve la posición: avanza Atlas (local)');
  const camino3 = calcularCaminoFinal(PASES_LIG, col3, 8);
  eq(
    camino3.pases.find((e) => e.pase.nombreEquipo === 'Toluca').estado,
    'eliminado',
    'Toluca cae por posición con el global empatado'
  );
  eq(
    camino3.pases.find((e) => e.pase.nombreEquipo === 'Atlas').victorias,
    1,
    'Atlas avanza por mejor posición'
  );

  // La FINAL no usa la posición: global empatado y penales de la
  // vuelta mandan (cuadro de 2 = la pareja ya es la final). Atlas
  // es el mejor posicionado (4° vs 5°): si mandara la posición,
  // avanzaría Atlas; los penales de la vuelta coronan a Toluca.
  const FINAL_IDA = [
    partido('fi', 'Atlas', 'Toluca', 1, 0, true, '2026-12-17T01:00:00Z', 'L'),
    partido('fv', 'Toluca', 'Atlas', 1, 0, true, '2026-12-20T01:00:00Z', 'L'),
  ];
  const colFin = colapsarIdaVuelta(FINAL_IDA, {
    posicionesSiembra: POSICIONES,
    cantidadEquipos: 2,
  });
  eq(colFin.length, 1, 'la final a ida y vuelta colapsa a un partido');
  eq(colFin[0].resultadoReal, 'L', 'en la final el global empatado lo deciden los penales de la vuelta, no la posición');
  const PASES_FIN = [
    pase('F1', 'u-rob', 'Roberto', ATLAS),
    pase('F2', 'u-elv', 'Elvis', EQ.toluca),
  ];
  const caminoFin = calcularCaminoFinal(PASES_FIN, colFin, 2);
  eq(
    caminoFin.pases.find((e) => e.pase.nombreEquipo === 'Toluca').estado,
    'campeon',
    'Toluca se corona por los penales de la vuelta, no Atlas por posición'
  );
  const sinPenales = colapsarIdaVuelta(
    conMarcadores(FINAL_IDA, { fv: { resultadoReal: null } }),
    { posicionesSiembra: POSICIONES, cantidadEquipos: 2 }
  );
  const caminoSin = calcularCaminoFinal(PASES_FIN, sinPenales, 2);
  eq(caminoSin.hayCampeon, false, 'final empatada sin resultado oficial: nadie se corona ni cae');

  // El mismo cruce a más de 10 días NO es ida y vuelta (fase
  // regular contra liguilla): cada partido cuenta por su lado.
  const LEJANOS = [
    partido('r1', 'Toluca', 'Atlas', 3, 0, true, '2026-10-01T01:00:00Z', 'L'),
    partido('r2', 'Atlas', 'Toluca', 1, 0, true, '2026-11-29T01:00:00Z', 'L'),
  ];
  eq(
    colapsarIdaVuelta(LEJANOS, { posicionesSiembra: POSICIONES, cantidadEquipos: 8 }).length,
    2,
    'cruces a más de 10 días no se colapsan'
  );
}

// ---------- infoLlaveCamino: los datos de la tarjeta horizontal ------------
// La tarjeta nueva muestra los partidos UNA vez por llave, con los
// goles orientados al lado izquierdo (lado A) de la tarjeta.
{
  const CRUDOS = [
    partido('i1', 'Toluca', 'Atlas', 2, 0, true, '2026-11-26T01:00:00Z', 'L'),
    partido('i2', 'Monterrey', 'América', 0, 0, false, '2026-11-26T03:10:00Z', 'E'),
    partido('i3', 'Pachuca', 'Chivas', null, null, false, '2026-11-27T01:00:00Z'),
    partido('v1', 'Atlas', 'Toluca', null, null, false, '2026-11-29T01:00:00Z'),
    partido('v2', 'América', 'Monterrey', null, null, false, '2026-11-29T03:10:00Z'),
    partido('v3', 'Chivas', 'Pachuca', null, null, false, '2026-11-30T01:07:00Z'),
  ];
  // Llave Atlas (A) vs Toluca (B): la ida la jugó de visitante.
  const infoAT = infoLlaveCamino('Atlas', 'Toluca', CRUDOS);
  eq(infoAT.esIdaYVuelta, true, 'infoLlave: Atlas–Toluca es ida y vuelta');
  eq([infoAT.ida.golesA, infoAT.ida.golesB], [0, 2], 'infoLlave: la ida se voltea al lado A (Atlas 0-2 Toluca)');
  eq(infoAT.ida.esFinal, true, 'infoLlave: la ida de Atlas ya es final');
  eq(infoAT.vuelta.golesA, null, 'infoLlave: la vuelta de Atlas aún no tiene goles');
  eq(infoAT.vuelta.fecha, '2026-11-29T01:00:00Z', 'infoLlave: la vuelta trae su fecha');
  eq([infoAT.globalA, infoAT.globalB], [0, 2], 'infoLlave: global parcial Atlas 0-2 Toluca');

  // América (A) vs Monterrey (B): la ida va en vivo 0-0.
  const infoAM = infoLlaveCamino('América', 'Monterrey', CRUDOS);
  eq(infoAM.ida.enVivo, true, 'infoLlave: la ida de América está en vivo');
  eq([infoAM.ida.golesA, infoAM.ida.golesB], [0, 0], 'infoLlave: ida América 0-0');
  eq(infoAM.globalA, null, 'infoLlave: sin ida final no hay global');

  // Chivas (A) vs Pachuca (B): nada jugado; la ida se anuncia por fecha.
  const infoCP = infoLlaveCamino('Chivas', 'Pachuca', CRUDOS);
  eq(infoCP.ida.golesA, null, 'infoLlave: la ida de Chivas no tiene marcador');
  eq(infoCP.ida.fecha, '2026-11-27T01:00:00Z', 'infoLlave: la ida de Chivas trae su fecha');
  eq(infoCP.vuelta.fecha, '2026-11-30T01:07:00Z', 'infoLlave: la vuelta de Chivas trae su fecha');

  // Sin partidos entre los dos: todo vacío.
  const infoVacia = infoLlaveCamino('Atlas', 'Chivas', CRUDOS);
  eq(infoVacia.ida, null, 'infoLlave: sin cruce no hay ida');
  eq(infoVacia.esIdaYVuelta, false, 'infoLlave: sin cruce no es ida y vuelta');

  // Partido único (cuadro a un juego): no es ida y vuelta y el
  // global no se duplica bajo el marcador.
  const UNICO = [
    partido('u1', 'Atlas', 'Toluca', 2, 1, true, '2026-12-05T01:00:00Z', 'L'),
  ];
  const infoUnico = infoLlaveCamino('Atlas', 'Toluca', UNICO);
  eq(infoUnico.esIdaYVuelta, false, 'infoLlave: partido único no es ida y vuelta');
  eq(infoUnico.globalA, null, 'infoLlave: en partido único no se pinta global aparte');
}

console.log(`\ncamino-final: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
