// scripts/pruebas-v20.mjs
//
// Pruebas de la lógica PURA del paquete v20:
//   1) Higiene del catálogo del explorador (src/lib/sports/catalogo.ts):
//      fuera las pseudo-ligas internas ("_...") y orden con las
//      favoritas del jugador primero.
//   2) Formato de la línea de probabilidades al JUGAR
//      (src/lib/encuestaFormato.ts): segmentos L/E/V y texto compacto.
// Sin red, sin base de datos: se corre con `node scripts/pruebas-v20.mjs`.

const {
  esNombreLigaInterna,
  filtrarLigasVisibles,
  ordenarConFavoritas,
} = await import('../src/lib/sports/catalogo.ts');
const { segmentosProbabilidades, textoProbabilidades } = await import(
  '../src/lib/encuestaFormato.ts'
);

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

// ---------- 1) Pseudo-ligas internas ----------------------------------
eq(esNombreLigaInterna('_Defunct Soccer Teams'), true, '"_Defunct Soccer Teams" es interna');
eq(esNombreLigaInterna('_No League'), true, '"_No League" es interna');
eq(esNombreLigaInterna('_No League Soccer'), true, '"_No League Soccer" es interna');
eq(esNombreLigaInterna('  _oculta'), true, 'espacios antes del "_" también cuentan');
eq(esNombreLigaInterna('Liga MX'), false, '"Liga MX" es liga de verdad');
eq(esNombreLigaInterna('NBA'), false, '"NBA" es liga de verdad');
eq(esNombreLigaInterna(''), false, 'vacío no es interna');
eq(esNombreLigaInterna('Liga_del_Maestro'), false, '"_" a la mitad no es interna');

const catalogoSucio = [
  { providerId: '1', name: 'Liga MX' },
  { providerId: '2', name: '_No League' },
  { providerId: '3', name: 'Premier League' },
  { providerId: '4', name: '_Defunct Soccer Teams' },
  { providerId: '5', name: '_No League Soccer' },
];
eq(
  filtrarLigasVisibles(catalogoSucio).map((l) => l.providerId),
  ['1', '3'],
  'el filtro deja solo las ligas de verdad, en orden'
);
eq(catalogoSucio.length, 5, 'el filtro no muta la entrada');
eq(filtrarLigasVisibles([]), [], 'lista vacía -> lista vacía');

// ---------- 2) Orden con favoritas primero ----------------------------
const ligas = [
  { providerId: 'a', name: 'A' },
  { providerId: 'b', name: 'B' },
  { providerId: 'c', name: 'C' },
  { providerId: 'd', name: 'D' },
];
eq(
  ordenarConFavoritas(ligas, ['c', 'a']).map((l) => l.providerId),
  ['a', 'c', 'b', 'd'],
  'favoritas primero conservando su orden del catálogo (a antes que c aunque la lista de favoritas diga c,a)'
);
eq(
  ordenarConFavoritas(ligas, []).map((l) => l.providerId),
  ['a', 'b', 'c', 'd'],
  'sin favoritas el orden no cambia'
);
eq(
  ordenarConFavoritas(ligas, ['zzz']).map((l) => l.providerId),
  ['a', 'b', 'c', 'd'],
  'favorita que no está en la lista no rompe nada'
);
eq(
  ordenarConFavoritas(ligas, ['a', 'b', 'c', 'd']).map((l) => l.providerId),
  ['a', 'b', 'c', 'd'],
  'todas favoritas = mismo orden'
);
eq(ligas.map((l) => l.providerId), ['a', 'b', 'c', 'd'], 'ordenar no muta la entrada');

// ---------- 3) Formato de probabilidades ------------------------------
const segs = segmentosProbabilidades({ local: 45.2, empate: 27.6, visitante: 27.2 });
eq(
  segs.map((s) => [s.clave, s.pct, s.esMayor]),
  [
    ['L', 45, true],
    ['E', 28, false],
    ['V', 27, false],
  ],
  'segmentos L/E/V redondeados con el mayor marcado'
);
eq(
  textoProbabilidades({ local: 45.2, empate: 27.6, visitante: 27.2 }),
  '45% · 28% · 27%',
  'texto compacto "45% · 28% · 27%"'
);
const empateMayor = segmentosProbabilidades({ local: 40, empate: 40, visitante: 20 });
eq(
  empateMayor.map((s) => s.esMayor),
  [true, true, false],
  'empate en el mayor: se marcan los dos'
);
eq(
  textoProbabilidades({ local: 33.3, empate: 33.3, visitante: 33.4 }),
  '33% · 33% · 33%',
  'porcentajes parejos redondean sin tronar'
);
eq(
  segmentosProbabilidades({ local: 0, empate: 0, visitante: 100 })[2].esMayor,
  true,
  '100% visita se marca como mayor'
);

console.log(`\nv20: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
