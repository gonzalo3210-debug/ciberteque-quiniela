// scripts/pruebas-asistente-jornada.mjs
//
// Pruebas de la lógica PURA del asistente gráfico de jornadas
// (src/lib/asistenteJornada.ts) y de la equivalencia de payloads: el
// asistente y el formulario clásico escriben en el mismo estado de
// useCreadorJornadas, así que una jornada armada "a la asistente"
// (stepper de precio, partidos agregados en otro orden) debe producir
// EXACTAMENTE el mismo payload que la misma jornada "a la clásica".
// Sin red ni base: se corre con `node scripts/pruebas-asistente-jornada.mjs`.

const {
  siguientePrecio,
  partidoLleno,
  partidoAMedias,
  faltantesAsistente,
  pasoCompleto,
  resumenAsistente,
} = await import('../src/lib/asistenteJornada.ts');
const { construirPayloadJornada } = await import(
  '../src/lib/crearJornadaPayload.ts'
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

const base = {
  nombreJornada: '',
  precioTicket: '1',
  fechaCierre: '',
  tipoPremiacion: 'unico',
  modalidad: 'clasica',
  soloAdmins: false,
  equiposSorteo: [],
  partidosNuevos: [{ local: '', visitante: '', fecha_hora: '' }],
};

// ---------- 1) Stepper de precio ------------------------------------------
eq(siguientePrecio('30', 5), '35', 'stepper +5');
eq(siguientePrecio('30', -1), '29', 'stepper −1');
eq(siguientePrecio('0', -5), '0', 'el stepper no baja de 0');
eq(siguientePrecio('', 30), '30', 'texto vacío se trata como 0');
eq(siguientePrecio('abc', 1), '1', 'texto no numérico se trata como 0');

// ---------- 2) Renglones de partido ----------------------------------------
ok(partidoLleno({ local: 'Chivas', visitante: 'Atlas' }), 'renglón lleno');
ok(!partidoLleno({ local: 'Chivas', visitante: '' }), 'sin visita no está lleno');
ok(partidoAMedias({ local: 'Chivas', visitante: '' }), 'a medias: solo local');
ok(partidoAMedias({ local: ' ', visitante: 'Atlas' }), 'a medias: solo visita');
ok(!partidoAMedias({ local: '', visitante: '' }), 'renglón en blanco no es "a medias"');

// ---------- 3) Faltantes -----------------------------------------------------
eq(
  faltantesAsistente(base).map((f) => f.campo),
  ['nombre', 'cierre', 'partidos'],
  'formulario vacío: faltan nombre, cierre y partidos'
);
const sorteoIncompleto = {
  ...base,
  nombreJornada: 'SORTEO',
  fechaCierre: '2026-12-01T18:00',
  modalidad: 'sorteo',
  equiposSorteo: ['e1', 'e2', 'e3', 'e4', 'e5'],
};
eq(
  faltantesAsistente(sorteoIncompleto),
  [{ campo: 'bombo', mensaje: 'El bombo lleva 5/8 equipos: elige exactamente 8.' }],
  'sorteo con 5 equipos: solo falta el bombo, con su conteo'
);
eq(
  faltantesAsistente({ ...sorteoIncompleto, equiposSorteo: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'] }),
  [],
  'sorteo completo: sin faltantes'
);
eq(
  faltantesAsistente({
    ...base,
    nombreJornada: 'J1',
    fechaCierre: '2026-11-20T18:00',
    partidosNuevos: [{ local: 'Chivas', visitante: '', fecha_hora: '' }],
  }).map((f) => f.campo),
  ['partidos'],
  'un partido a medias bloquea con su propio mensaje'
);

// ---------- 4) Pasos ---------------------------------------------------------
const paso0Listo = { ...base, nombreJornada: 'J1', fechaCierre: '2026-11-20T18:00' };
ok(!pasoCompleto(base, 0), 'paso 1 incompleto sin nombre ni cierre');
ok(pasoCompleto(paso0Listo, 0), 'paso 1 completo con nombre y cierre');
ok(!pasoCompleto(paso0Listo, 1), 'paso 2 incompleto sin partidos');
ok(
  pasoCompleto(
    { ...paso0Listo, partidosNuevos: [{ local: 'Chivas', visitante: 'Atlas', fecha_hora: '' }] },
    1
  ),
  'paso 2 completo con un partido lleno'
);
ok(pasoCompleto(base, 2), 'paso 3 (precio) nunca bloquea: trae valores del estado');
ok(pasoCompleto(base, 3), 'paso 4 (resumen) es el destino: no bloquea');

// ---------- 5) Resumen alimentado del payload --------------------------------
const formularioResumen = {
  ...paso0Listo,
  precioTicket: '30',
  partidosNuevos: [
    { local: 'Tigres', visitante: 'América', fecha_hora: '2026-11-21T20:00', api_fixture_id: '2487602' },
    { local: 'Chivas', visitante: 'Cruz Azul', fecha_hora: '2026-11-20T19:00' },
  ],
};
const payloadResumen = construirPayloadJornada(formularioResumen);
const resumen = resumenAsistente(formularioResumen, payloadResumen, []);
eq(resumen.partidos, payloadResumen.partidos, 'el resumen muestra los partidos DEL PAYLOAD (mismo orden)');
eq(resumen.precio, 30, 'el resumen muestra el precio como número');
eq(resumen.modalidad.titulo, 'Clásica L / E / V', 'etiqueta de modalidad clásica');
const resumenSorteo = resumenAsistente(
  { ...sorteoIncompleto, equiposSorteo: ['e2', 'e1'] },
  construirPayloadJornada({ ...sorteoIncompleto, equiposSorteo: ['e2', 'e1'] }),
  [
    { id: 'e1', nombre: 'América' },
    { id: 'e2', nombre: 'Chivas' },
  ]
);
eq(
  resumenSorteo.equiposBombo,
  ['Chivas', 'América'],
  'el resumen del bombo resuelve nombres en el orden elegido'
);

// ---------- 6) Equivalencia asistente vs clásico -----------------------------
// A la clásica: precio tecleado "30" y partidos tecleados en orden de
// captura. A la asistente: precio con stepper desde el default "1"
// (+5 seis veces, −1 una vez ⇒ 30) y partidos agregados en el orden
// de la lista de la API. El payload ordena por fecha: deben coincidir.
let precioAsistente = '1';
for (let i = 0; i < 6; i++) precioAsistente = siguientePrecio(precioAsistente, 5);
precioAsistente = siguientePrecio(precioAsistente, -1);
eq(precioAsistente, '30', 'el stepper llega a 30 desde el default');
const estadoClasico = {
  nombreJornada: 'LMX J17',
  precioTicket: '30',
  fechaCierre: '2026-11-20T18:00',
  tipoPremiacion: 'unico',
  modalidad: 'clasica',
  soloAdmins: false,
  equiposSorteo: [],
  partidosNuevos: [
    { local: 'Puebla', visitante: 'San Luis', fecha_hora: '2026-11-20T18:00', api_fixture_id: '2487596' },
    { local: 'Tigres', visitante: 'América', fecha_hora: '2026-11-21T20:00', api_fixture_id: '2487602' },
    { local: 'Chivas', visitante: 'Cruz Azul', fecha_hora: '2026-11-22T16:07', api_fixture_id: '2487603' },
  ],
};
const estadoAsistente = {
  ...estadoClasico,
  precioTicket: precioAsistente,
  partidosNuevos: [
    estadoClasico.partidosNuevos[2],
    estadoClasico.partidosNuevos[0],
    estadoClasico.partidosNuevos[1],
  ],
};
eq(
  construirPayloadJornada(estadoAsistente),
  construirPayloadJornada(estadoClasico),
  'payload del asistente ≡ payload del clásico para la misma jornada'
);

console.log(`\nasistente-jornada: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
