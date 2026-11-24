// scripts/pruebas-escudos-api.mjs
//
// Pruebas de la lógica PURA de resolución de escudos del catálogo
// EQUIPOS (src/lib/escudos.ts), cambio aprobado por Gonzalo el
// 2026-11-23: el escudo se jala de TheSportsDB por el ID del equipo
// (columna id_api) en vez de depender de que el nombre del catálogo
// coincida letra por letra con el nombre de la quiniela.
//
// El caso central es el bug real de ese día: en CUARTOS IDA +
// CHAMPIONS la quiniela usa "PSV", "PSG", "Roma" y "Bayern Múnich",
// y el catálogo los tenía como "PSV Eindhoven", "Paris
// Saint-Germain", "AS Roma" y "Bayern Munich": salían con "?".
// Los IDs de abajo son los REALES de la API (verificados el
// 2026-11-23 con lookupteam.php): PSV 133768, PSG 133714,
// Roma 133682, Bayern 133664.
//
// Sin red ni base: se corre con `node scripts/pruebas-escudos-api.mjs`.

const {
  normalizarNombreEquipo,
  claveEquipo,
  urlEscudoApi,
  resolverEscudoEquipo,
  construirMapaEscudos,
  buscarEscudoEnMapa,
} = await import('../src/lib/escudos.ts');

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
  ok(a === b, `${nombre} (esperado: ${JSON.stringify(b)}, obtenido: ${JSON.stringify(a)})`);
}

// ---------- Normalización ---------------------------------------------------
eq(normalizarNombreEquipo('  Bayern   Múnich '), 'bayern munich', 'normalizar: acentos, espacios y mayúsculas');
eq(normalizarNombreEquipo('AS Roma'), 'as roma', 'normalizar: nombre simple');
eq(normalizarNombreEquipo(''), '', 'normalizar: vacío');

// ---------- Claves y alias: el bug del 2026-11-23 ----------------------------
eq(claveEquipo('PSV'), claveEquipo('PSV Eindhoven'), 'alias: PSV = PSV Eindhoven');
eq(claveEquipo('PSG'), claveEquipo('Paris Saint-Germain'), 'alias: PSG = Paris Saint-Germain');
eq(claveEquipo('Roma'), claveEquipo('AS Roma'), 'alias: Roma = AS Roma');
eq(claveEquipo('Bayern Múnich'), claveEquipo('Bayern Munich'), 'alias: Bayern Múnich = Bayern Munich');
eq(claveEquipo('Bayern Múnich'), claveEquipo('FC Bayern München'), 'alias: Bayern = FC Bayern München');
ok(claveEquipo('Roma') !== claveEquipo('Lazio'), 'alias: equipos distintos no comparten clave');
ok(claveEquipo('PSV') !== claveEquipo('PSG'), 'alias: PSV y PSG no se confunden');
eq(claveEquipo('Toluca'), 'toluca', 'sin alias: la clave es el nombre normalizado');

// ---------- URL del escudo por ID de API -------------------------------------
eq(urlEscudoApi('133664'), '/api/escudo-equipo?id=133664', 'urlEscudoApi: con ID');
eq(urlEscudoApi('  133682 '), '/api/escudo-equipo?id=133682', 'urlEscudoApi: recorta espacios');
eq(urlEscudoApi(''), null, 'urlEscudoApi: vacío = null');
eq(urlEscudoApi(null), null, 'urlEscudoApi: null = null');
eq(urlEscudoApi(undefined), null, 'urlEscudoApi: undefined = null');

// ---------- Prioridad de resolución ------------------------------------------
eq(
  resolverEscudoEquipo({ nombre: 'Bayern Múnich', logo_url: 'https://a.espncdn.com/bayern.png', id_api: '133664' }),
  '/api/escudo-equipo?id=133664',
  'prioridad: con id_api manda la API sobre el logo manual'
);
eq(
  resolverEscudoEquipo({ nombre: 'Toluca', logo_url: 'https://a.espncdn.com/toluca.png', id_api: null }),
  'https://a.espncdn.com/toluca.png',
  'prioridad: sin id_api se usa el logo manual, como hoy'
);
eq(
  resolverEscudoEquipo({ nombre: 'Toluca', logo_url: 'https://a.espncdn.com/toluca.png', id_api: '  ' }),
  'https://a.espncdn.com/toluca.png',
  'prioridad: id_api en blanco cuenta como sin ID'
);
eq(
  resolverEscudoEquipo({ nombre: 'Equipo Nuevo', logo_url: '', id_api: null }),
  null,
  'sin nada: null (la vista pinta su "?", como hoy)'
);
eq(
  resolverEscudoEquipo({ nombre: 'Equipo Nuevo', logo_url: null }),
  null,
  'sin nada (fila vieja sin id_api): null'
);

// ---------- El mapa completo: la quiniela contra el catálogo -----------------
// Catálogo tal como estaba el 2026-11-23 ANTES de la corrección manual
// (nombres largos), ya con los IDs capturados:
const catalogo = [
  { nombre: 'PSV Eindhoven', logo_url: 'https://a.espncdn.com/i/teamlogos/soccer/500/148.png', id_api: '133768' },
  { nombre: 'Paris Saint-Germain', logo_url: 'https://a.espncdn.com/i/teamlogos/soccer/500/160.png', id_api: '133714' },
  { nombre: 'AS Roma', logo_url: 'https://a.espncdn.com/i/teamlogos/soccer/500/104.png', id_api: '133682' },
  { nombre: 'Bayern Munich', logo_url: 'https://a.espncdn.com/i/teamlogos/soccer/500/132.png', id_api: '133664' },
  { nombre: 'Toluca', logo_url: 'https://a.espncdn.com/i/teamlogos/soccer/500/2208.png', id_api: null },
  { nombre: 'Equipo Sin Logo', logo_url: '', id_api: null },
];
const mapa = construirMapaEscudos(catalogo);

// Los 4 del bug, buscados con el nombre CORTO de la quiniela:
eq(buscarEscudoEnMapa(mapa, 'PSV'), '/api/escudo-equipo?id=133768', 'bug: PSV (quiniela) encuentra su escudo por ID');
eq(buscarEscudoEnMapa(mapa, 'PSG'), '/api/escudo-equipo?id=133714', 'bug: PSG (quiniela) encuentra su escudo por ID');
eq(buscarEscudoEnMapa(mapa, 'Roma'), '/api/escudo-equipo?id=133682', 'bug: Roma (quiniela) encuentra su escudo por ID');
eq(buscarEscudoEnMapa(mapa, 'Bayern Múnich'), '/api/escudo-equipo?id=133664', 'bug: Bayern Múnich (quiniela) encuentra su escudo por ID');
// Y también con el nombre largo, por si otra quiniela lo trae así:
eq(buscarEscudoEnMapa(mapa, 'Paris Saint-Germain'), '/api/escudo-equipo?id=133714', 'bug: el nombre largo también resuelve');
// Sin ID pero con alias: el nombre corto encuentra el logo manual del largo.
const mapaSinIds = construirMapaEscudos(
  catalogo.map((e) => ({ ...e, id_api: null }))
);
eq(
  buscarEscudoEnMapa(mapaSinIds, 'PSV'),
  'https://a.espncdn.com/i/teamlogos/soccer/500/148.png',
  'respaldo por alias: sin ID, el nombre corto encuentra el logo manual'
);
eq(
  buscarEscudoEnMapa(mapaSinIds, 'Bayern Múnich'),
  'https://a.espncdn.com/i/teamlogos/soccer/500/132.png',
  'respaldo por alias: Bayern Múnich encuentra el logo de "Bayern Munich"'
);
// Comportamiento de hoy para el resto:
eq(buscarEscudoEnMapa(mapa, 'Toluca'), 'https://a.espncdn.com/i/teamlogos/soccer/500/2208.png', 'equipo normal: su logo manual');
eq(buscarEscudoEnMapa(mapa, 'Equipo Sin Logo'), null, 'equipo sin nada: null (sale el "?")');
eq(buscarEscudoEnMapa(mapa, 'Equipo Que No Existe'), null, 'equipo desconocido: null');
eq(buscarEscudoEnMapa(mapa, ''), null, 'nombre vacío: null');

// Duplicado viejo en el catálogo (mismo equipo, dos registros): gana el de la API.
const mapaDuplicado = construirMapaEscudos([
  { nombre: 'Roma', logo_url: 'https://a.espncdn.com/roma-viejo.png', id_api: null },
  { nombre: 'AS Roma', logo_url: 'https://a.espncdn.com/roma.png', id_api: '133682' },
]);
eq(buscarEscudoEnMapa(mapaDuplicado, 'Roma'), '/api/escudo-equipo?id=133682', 'duplicados: gana el registro con id_api');

// ---------- Resumen ----------------------------------------------------------
console.log(`\nPruebas de escudos por API: ${pasan} pasan, ${fallan} fallan.`);
if (fallan > 0) process.exit(1);
