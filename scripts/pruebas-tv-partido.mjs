// scripts/pruebas-tv-partido.mjs
//
// Pruebas de la lógica PURA de "dónde ver" desde el proveedor
// (src/lib/sports/tvListados.ts): normalizar los listados crudos de
// TV de lookuptv.php y traducir países a español. Sin red: se corre
// con `node scripts/pruebas-tv-partido.mjs`.

const { normalizarListadosTV, nombrePaisES } = await import(
  '../src/lib/sports/tvListados.ts'
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

// ---------- 1) Entradas sin datos -> [] --------------------------------
eq(normalizarListadosTV(null), [], 'null -> []');
eq(normalizarListadosTV(undefined), [], 'undefined -> []');
eq(normalizarListadosTV([]), [], 'lista vacía -> []');
eq(normalizarListadosTV('no-es-lista'), [], 'no-arreglo -> []');
eq(normalizarListadosTV([null, 42, 'x']), [], 'entradas no-objeto -> []');

// ---------- 2) El caso real verificado: Liga MX por Peacock ------------
eq(
  normalizarListadosTV([
    {
      strChannel: 'Peacock Premium',
      strCountry: 'United States',
      strLogo: 'https://ejemplo.com/peacock.png',
    },
  ]),
  [
    {
      channel: 'Peacock Premium',
      country: 'United States',
      logoUrl: 'https://ejemplo.com/peacock.png',
    },
  ],
  'un listado completo pasa tal cual'
);

// ---------- 3) Entradas sin canal no muestran nada ---------------------
eq(
  normalizarListadosTV([
    { strCountry: 'Mexico' },
    { strChannel: '', strCountry: 'Mexico' },
    { strChannel: '   ', strCountry: 'Mexico' },
    { strChannel: 'NULL', strCountry: 'Mexico' },
    { strChannel: null, strCountry: 'Mexico' },
  ]),
  [],
  'sin nombre de canal (vacío, espacios, "NULL", null) -> descartadas'
);

// ---------- 4) Textos se limpian: espacios y "NULL" --------------------
eq(
  normalizarListadosTV([
    { strChannel: '  Canal 5 ', strCountry: 'NULL', strLogo: '' },
  ]),
  [{ channel: 'Canal 5', country: null, logoUrl: null }],
  'canal recortado; país "NULL" y logo vacío -> null'
);

// ---------- 5) Duplicados: mismo canal y país, una sola vez ------------
eq(
  normalizarListadosTV([
    { strChannel: 'ESPN', strCountry: 'Mexico', strLogo: '' },
    { strChannel: 'espn', strCountry: 'MEXICO', strLogo: 'https://ejemplo.com/espn.png' },
    { strChannel: 'ESPN', strCountry: 'United States', strLogo: '' },
  ]),
  [
    { channel: 'ESPN', country: 'Mexico', logoUrl: 'https://ejemplo.com/espn.png' },
    { channel: 'ESPN', country: 'United States', logoUrl: null },
  ],
  'duplicado canal+país se funde (y rescata el logo); otro país es otro listado'
);

// ---------- 6) El orden del proveedor se conserva ----------------------
eq(
  normalizarListadosTV([
    { strChannel: 'B', strCountry: 'Spain' },
    { strChannel: 'A', strCountry: 'Spain' },
  ]).map((l) => l.channel),
  ['B', 'A'],
  'orden de llegada conservado'
);

// ---------- 7) Países a español -----------------------------------------
eq(nombrePaisES('United States'), 'Estados Unidos', 'United States -> Estados Unidos');
eq(nombrePaisES('Mexico'), 'México', 'Mexico -> México');
eq(nombrePaisES('  spain '), 'España', 'con espacios y minúsculas -> España');
eq(nombrePaisES('United Kingdom'), 'Reino Unido', 'United Kingdom -> Reino Unido');
eq(nombrePaisES('País Inventado'), 'País Inventado', 'país desconocido pasa tal cual');
eq(nombrePaisES(null), null, 'país null -> null');
eq(nombrePaisES(''), null, 'país vacío -> null');
eq(nombrePaisES('NULL'), null, 'país "NULL" -> null');

console.log(`\nPruebas de TV: ${pasan} pasan, ${fallan} fallan.`);
if (fallan > 0) process.exit(1);
