// scripts/pruebas-invitaciones.mjs
//
// Pruebas de la lógica PURA de los enlaces de invitación
// (src/lib/invitaciones.ts): código derivado del id del usuario,
// validación y parseo del enlace, texto de WhatsApp y reconocimiento
// del error "columna inexistente" de la atribución. Sin red, sin base
// de datos y sin localStorage real: se corre con
// `node scripts/pruebas-invitaciones.mjs`.

const {
  codigoInvitacionDeUsuario,
  normalizarCodigoInvitacion,
  esCodigoInvitacionValido,
  enlaceConCodigo,
  enlaceInvitacion,
  extraerCodigoInvitacion,
  textoWhatsAppInvitacion,
  enlaceCompartirWhatsApp,
  esErrorColumnaInexistente,
  INCENTIVO_NUEVO_TEXTO,
} = await import('../src/lib/invitaciones.ts');

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

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = '99999999-8888-7777-6666-555555555555';

// ---------- 1) El código es estable, con formato y distinto por usuario ----------
const codigoA = codigoInvitacionDeUsuario(UUID_A);
ok(typeof codigoA === 'string', 'el código es una cadena');
eq(codigoA.length, 8, 'el código mide 8 caracteres');
ok(/^[0-9A-Z]{8}$/.test(codigoA), 'el código es solo dígitos y mayúsculas');
eq(codigoInvitacionDeUsuario(UUID_A), codigoA, 'mismo usuario -> mismo código (estable)');
ok(codigoInvitacionDeUsuario(UUID_B) !== codigoA, 'otro usuario -> otro código');
eq(codigoInvitacionDeUsuario(UUID_A.toUpperCase()), codigoA, 'el id en mayúsculas da el mismo código');
eq(codigoInvitacionDeUsuario(''), null, 'id vacío -> null');
eq(codigoInvitacionDeUsuario(null), null, 'id null -> null');
eq(codigoInvitacionDeUsuario(undefined), null, 'id undefined -> null');
eq(codigoInvitacionDeUsuario(123), null, 'id no-cadena -> null');

// ---------- 2) Códigos de muchos usuarios no chocan ----------
const codigos = new Set();
for (let i = 0; i < 200; i++) {
  codigos.add(codigoInvitacionDeUsuario(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));
}
eq(codigos.size, 200, '200 usuarios distintos -> 200 códigos distintos');

// ---------- 3) Normalización y validación ----------
eq(normalizarCodigoInvitacion(codigoA.toLowerCase()), codigoA, 'minúsculas -> mayúsculas');
eq(normalizarCodigoInvitacion(`  ${codigoA}  `), codigoA, 'espacios de más se recortan');
eq(normalizarCodigoInvitacion('AB-12 34CD'), 'AB1234CD', 'guiones y espacios internos se quitan');
eq(normalizarCodigoInvitacion('AB12'), null, 'código corto -> null');
eq(normalizarCodigoInvitacion('AB1234567'), null, 'código largo -> null');
eq(normalizarCodigoInvitacion('AB12!456'), null, 'caracteres raros -> null');
eq(normalizarCodigoInvitacion(''), null, 'vacío -> null');
eq(normalizarCodigoInvitacion(null), null, 'null -> null');
ok(esCodigoInvitacionValido('AB1234CD'), 'válido reconocido');
ok(!esCodigoInvitacionValido('AB12'), 'corto rechazado');

// ---------- 4) El enlace ----------
const enlaceA = enlaceInvitacion('https://ciberteque-quiniela.vercel.app', UUID_A);
eq(enlaceA, `https://ciberteque-quiniela.vercel.app/invitar?ref=${codigoA}`, 'enlace con origen y código del usuario');
eq(enlaceInvitacion('https://app.example.com/', UUID_A), `https://app.example.com/invitar?ref=${codigoA}`, 'la barra final del origen no duplica la diagonal');
eq(enlaceConCodigo('https://app.example.com', 'ab1234cd'), 'https://app.example.com/invitar?ref=AB1234CD', 'enlaceConCodigo normaliza el código a mayúsculas');
eq(enlaceInvitacion('https://app.example.com', ''), null, 'sin usuario no hay enlace');
eq(enlaceInvitacion('', UUID_A), null, 'sin origen no hay enlace');
eq(enlaceConCodigo('https://app.example.com', 'MALO'), null, 'código inválido no arma enlace');

// ---------- 5) Extraer el código de la URL ----------
eq(extraerCodigoInvitacion(`?ref=${codigoA}`), codigoA, 'de la parte de búsqueda');
eq(extraerCodigoInvitacion(`https://app.example.com/invitar?ref=${codigoA.toLowerCase()}`), codigoA, 'de la URL completa y en minúsculas');
eq(extraerCodigoInvitacion(`?ref=${codigoA}&otro=1`), codigoA, 'con más parámetros no estorba');
eq(extraerCodigoInvitacion('?ref=AB12'), null, 'código corto en la URL -> null');
eq(extraerCodigoInvitacion('?ref='), null, 'ref vacío -> null');
eq(extraerCodigoInvitacion('?otro=AB1234CD'), null, 'sin ref -> null');
eq(extraerCodigoInvitacion(''), null, 'cadena vacía -> null');
eq(extraerCodigoInvitacion(null), null, 'null -> null');
eq(extraerCodigoInvitacion('ref=AB1234CD'), 'AB1234CD', '"ref=..." suelto también se lee');

// ---------- 6) Texto de WhatsApp ----------
const enlaceEjemplo = 'https://app.example.com/invitar?ref=AB1234CD';
const conJornada = textoWhatsAppInvitacion({
  enlace: enlaceEjemplo,
  nombreJornada: 'LMX J17',
  precioBoleto: 30,
});
ok(conJornada.includes('LMX J17'), 'con jornada: nombra la jornada');
ok(conJornada.includes('$30'), 'con jornada: menciona el precio del boleto');
ok(conJornada.includes(INCENTIVO_NUEVO_TEXTO), 'con jornada: lleva el incentivo');
ok(conJornada.includes(enlaceEjemplo), 'con jornada: lleva el enlace');

const sinJornada = textoWhatsAppInvitacion({ enlace: enlaceEjemplo });
ok(!sinJornada.includes('LMX'), 'sin jornada: no inventa nombre');
ok(sinJornada.includes('Club de Pronósticos'), 'sin jornada: nombra al Club');
ok(sinJornada.includes(INCENTIVO_NUEVO_TEXTO), 'sin jornada: lleva el incentivo');
ok(sinJornada.includes(enlaceEjemplo), 'sin jornada: lleva el enlace');

const sinPrecio = textoWhatsAppInvitacion({ enlace: enlaceEjemplo, nombreJornada: 'J18', precioBoleto: null });
ok(sinPrecio.includes('J18'), 'con jornada sin precio: nombra la jornada y no truena');

const wa = enlaceCompartirWhatsApp(conJornada);
ok(wa.startsWith('https://wa.me/?text='), 'el enlace de WhatsApp usa wa.me sin número');
eq(decodeURIComponent(wa.slice('https://wa.me/?text='.length)), conJornada, 'el texto llega entero al otro lado del enlace');

// ---------- 7) Error "columna inexistente" ----------
ok(
  esErrorColumnaInexistente(
    { code: 'PGRST204', message: "Could not find the 'referido_por' column of 'usuarios' in the schema cache" },
    'referido_por'
  ),
  'PGRST204 de PostgREST se reconoce'
);
ok(
  esErrorColumnaInexistente(
    { code: '42703', message: 'column "referido_por" does not exist' },
    'referido_por'
  ),
  'el 42703 de Postgres con el nombre de la columna se reconoce'
);
ok(!esErrorColumnaInexistente({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'referido_por'), 'un duplicado NO es error de columna');
ok(!esErrorColumnaInexistente({ code: 'PGRST204', message: 'otro error' }, 'otra_columna'), 'PGRST204 de otra columna no se confunde');
ok(!esErrorColumnaInexistente(null, 'referido_por'), 'error null -> false');
ok(!esErrorColumnaInexistente(undefined, 'referido_por'), 'error undefined -> false');

console.log(`\nPruebas de invitaciones: ${pasan} pasan, ${fallan} fallan.`);
if (fallan > 0) process.exit(1);
