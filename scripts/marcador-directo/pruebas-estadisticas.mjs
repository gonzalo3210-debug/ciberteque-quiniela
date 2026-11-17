// scripts/marcador-directo/pruebas-estadisticas.mjs
//
// Pruebas de la lógica PURA de estadísticas personales
// (src/lib/estadisticas.ts): historiales fabricados con cifras
// conocidas, sin red y sin base de datos. Se corre con:
//   node scripts/marcador-directo/pruebas-estadisticas.mjs

// estadisticas.ts importa './insignias' sin extensión (la forma que
// resuelve el bundler de Next); Node en modo ESM exige extensión, así
// que se registra un loader mínimo que reintenta con '.ts'.
import { register } from 'node:module';
const loader = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\\.[a-z]+$/.test(specifier)
    ) {
      return nextResolve(specifier + '.ts', context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);

const { calcularEstadisticas, nombreCortoJornada } = await import(
  '../../src/lib/estadisticas.ts'
);
const { calcularInsignias } = await import('../../src/lib/insignias.ts');

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

// Boleto base: clásica 'unico', mitad de tabla, sin hazañas.
let correlativo = 0;
function boleto(parcial = {}) {
  correlativo++;
  return {
    quinielaId: `q${correlativo}`,
    nombreJornada: `Jornada ${correlativo}`,
    modalidad: 'clasica',
    tipoPremiacion: 'unico',
    fechaCierre: null,
    posicion: 5,
    nivel: 5,
    tamanoGrupo1: 1,
    puntos: 0,
    exactos: 0,
    tendencias: 0,
    aciertos: 0,
    totalPronosticos: 10,
    ...parcial,
  };
}

// ---------- 1) Historial mixto con cifras conocidas --------------------
// Q1 clásica sin premio · Q2 exacto campeón · Q3 sorteo (no cuenta)
// · Q4 clásica top2 con DOS boletos (manda el mejor) · Q5 exacto
// top3 con 1° compartido.
const historial = [
  boleto({
    quinielaId: 'q1',
    nombreJornada: 'LMX J1',
    fechaCierre: '2026-08-01T00:00:00Z',
    posicion: 2, nivel: 2, puntos: 7, exactos: 7, tendencias: 7, aciertos: 7,
  }),
  boleto({
    quinielaId: 'q2',
    nombreJornada: 'LMX J2',
    modalidad: 'marcador_exacto',
    fechaCierre: '2026-08-08T00:00:00Z',
    posicion: 1, nivel: 1, puntos: 14, exactos: 4, tendencias: 2, aciertos: 6,
  }),
  boleto({
    quinielaId: 'q3',
    nombreJornada: 'SORTEO LIGUILLA',
    modalidad: 'sorteo',
    fechaCierre: '2026-08-10T00:00:00Z',
    posicion: 1, nivel: 1, puntos: 99, exactos: 9, tendencias: 9, aciertos: 9,
    totalPronosticos: 9,
  }),
  boleto({
    quinielaId: 'q4',
    nombreJornada: 'LMX J4',
    tipoPremiacion: 'top2',
    fechaCierre: '2026-08-15T00:00:00Z',
    posicion: 5, nivel: 5, puntos: 4, exactos: 4, tendencias: 4, aciertos: 4,
  }),
  boleto({
    quinielaId: 'q4',
    nombreJornada: 'LMX J4',
    tipoPremiacion: 'top2',
    fechaCierre: '2026-08-15T00:00:00Z',
    posicion: 2, nivel: 2, puntos: 8, exactos: 8, tendencias: 8, aciertos: 8,
  }),
  boleto({
    quinielaId: 'q5',
    nombreJornada: 'LMX J5',
    modalidad: 'marcador_exacto',
    tipoPremiacion: 'top3',
    fechaCierre: '2026-08-22T00:00:00Z',
    posicion: 1, nivel: 1, tamanoGrupo1: 2, puntos: 11, exactos: 3,
    tendencias: 2, aciertos: 5,
  }),
];
const stats = calcularEstadisticas(historial, { totalGanadoPremios: 1234 });
eq(stats.quinielasJugadas, 4, 'jugadas: 4 (el sorteo no cuenta)');
eq(stats.quinielasGanadas, 2, 'ganadas: Q2 y Q5 (1° compartido cuenta)');
eq(stats.premiosCobrados, 3, 'premios: Q2, Q4 (top2) y Q5');
eq(stats.pctPremios, 75, '% con premio: 3 de 4 = 75');
eq(stats.pronosticosJugados, 40, 'pronósticos: mejor boleto de 4 quinielas × 10');
eq(stats.aciertosTotales, 26, 'aciertos: 7+6+8+5 = 26');
eq(stats.exactosTotales, 7, 'exactos: solo marcador exacto (4+3); clásica no suma');
eq(stats.tendenciasTotales, 19, 'tendencias: 7+2+8+2 = 19');
eq(stats.precisionPct, 65, 'precisión: 26/40 = 65');
eq(stats.puntosTotales, 40, 'puntos: 7+14+8+11 = 40 (mejor boleto de Q4)');
eq(stats.promedioPuntos, 10, 'promedio: 40/4 = 10');
eq(stats.mejorQuiniela?.nombreJornada, 'LMX J2', 'mejor quiniela: LMX J2');
eq(stats.mejorQuiniela?.puntos, 14, 'mejor quiniela: 14 pts');
eq(stats.rachaActual, 3, 'racha: Q2, Q4 y Q5 cobrando seguidas');
eq(
  stats.serieUltimas.map((s) => s.puntos),
  [7, 14, 8, 11],
  'serie en orden cronológico, sin el sorteo'
);
eq(
  stats.serieUltimas.map((s) => s.nombreCorto),
  ['J1', 'J2', 'J4', 'J5'],
  'serie: nombres cortos'
);
eq(stats.totalGanadoPremios, 1234, 'dinero: pasa tal cual si la app lo da');

// Consistencia con la vitrina: mismos conteos que calcularInsignias.
const ins = calcularInsignias(historial);
eq(stats.quinielasJugadas, ins.quinielasJugadas, 'consistencia insignias: jugadas');
eq(stats.quinielasGanadas, ins.campeonatos, 'consistencia insignias: campeonatos');
eq(stats.premiosCobrados, ins.podios, 'consistencia insignias: podios');
eq(stats.rachaActual, ins.rachaActual, 'consistencia insignias: racha');

// Dinero sin dato confiable → null (la tarjeta no lo muestra).
eq(calcularEstadisticas(historial).totalGanadoPremios, null, 'dinero: sin opción → null');
eq(
  calcularEstadisticas(historial, { totalGanadoPremios: -5 }).totalGanadoPremios,
  null,
  'dinero: negativo → null'
);
eq(
  calcularEstadisticas(historial, { totalGanadoPremios: NaN }).totalGanadoPremios,
  null,
  'dinero: NaN → null'
);
eq(
  calcularEstadisticas(historial, { totalGanadoPremios: 0 }).totalGanadoPremios,
  0,
  'dinero: 0 sí es dato (no ganó nada aún)'
);

// ---------- 2) Historial vacío -----------------------------------------
const vacias = calcularEstadisticas([]);
eq(vacias.quinielasJugadas, 0, 'vacío: 0 jugadas');
eq(vacias.pctPremios, 0, 'vacío: % premio 0 (sin NaN)');
eq(vacias.precisionPct, 0, 'vacío: precisión 0 (sin NaN)');
eq(vacias.promedioPuntos, 0, 'vacío: promedio 0');
eq(vacias.mejorQuiniela, null, 'vacío: sin mejor quiniela');
eq(vacias.serieUltimas, [], 'vacío: serie vacía');
eq(vacias.rachaActual, 0, 'vacío: racha 0');

// Solo sorteo → como si no hubiera historial.
eq(
  calcularEstadisticas([boleto({ modalidad: 'sorteo', posicion: 1, puntos: 50 })])
    .quinielasJugadas,
  0,
  'solo sorteo: 0 jugadas'
);

// ---------- 3) Una sola quiniela ---------------------------------------
const una = calcularEstadisticas([
  boleto({
    quinielaId: 'u1',
    nombreJornada: 'LMX J9',
    fechaCierre: '2026-09-01T00:00:00Z',
    posicion: 1, nivel: 1, puntos: 1, tendencias: 1, aciertos: 1,
    totalPronosticos: 3,
  }),
]);
eq(una.quinielasJugadas, 1, 'una: 1 jugada');
eq(una.quinielasGanadas, 1, 'una: 1 ganada');
eq(una.pctPremios, 100, 'una: 100% con premio');
eq(una.precisionPct, 33.3, 'una: precisión 1/3 = 33.3');
eq(una.promedioPuntos, 1, 'una: promedio = sus puntos');
eq(una.mejorQuiniela?.nombreJornada, 'LMX J9', 'una: ella es la mejor');
eq(una.serieUltimas.length, 1, 'una: serie de 1');
eq(una.rachaActual, 1, 'una: racha 1');

// ---------- 4) Serie de las últimas 10 ----------------------------------
const doce = [];
for (let i = 1; i <= 12; i++) {
  doce.push(
    boleto({
      quinielaId: `s${i}`,
      nombreJornada: `LMX J${i}`,
      fechaCierre: `2026-01-${String(i).padStart(2, '0')}T00:00:00Z`,
      posicion: 4, nivel: 4, puntos: i, tendencias: i, aciertos: i,
    })
  );
}
const statsDoce = calcularEstadisticas(doce);
eq(statsDoce.serieUltimas.length, 10, 'serie: máximo 10');
eq(statsDoce.serieUltimas[0].puntos, 3, 'serie: empieza en la 3ª jugada');
eq(statsDoce.serieUltimas[0].nombreCorto, 'J3', 'serie: primera etiqueta J3');
eq(statsDoce.serieUltimas[9].puntos, 12, 'serie: termina en la última');
eq(statsDoce.puntosTotales, 78, 'doce: puntos 1+…+12 = 78');
eq(statsDoce.promedioPuntos, 6.5, 'doce: promedio 78/12 = 6.5');
eq(statsDoce.mejorQuiniela?.nombreJornada, 'LMX J12', 'doce: mejor = la de 12 pts');

// ---------- 5) Nombres cortos -------------------------------------------
eq(nombreCortoJornada('LMX J17'), 'J17', "corto: 'LMX J17' → 'J17'");
eq(nombreCortoJornada('Jornada 5'), 'J5', "corto: 'Jornada 5' → 'J5'");
eq(nombreCortoJornada('JORNADA 12'), 'J12', "corto: 'JORNADA 12' → 'J12'");
eq(nombreCortoJornada('NATIONS LEAGUE'), 'NATIONS', "corto: sin número → primera palabra");
eq(nombreCortoJornada('Fecha 3'), 'Fecha 3', 'corto: nombre ya corto queda tal cual');
eq(nombreCortoJornada(null), 'Jornada', 'corto: null → Jornada');

console.log(`\nestadísticas: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
