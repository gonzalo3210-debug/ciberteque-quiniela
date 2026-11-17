// scripts/pruebas-crear-jornada.mjs
//
// Pruebas del constructor PURO del payload de creación de jornadas
// (src/lib/crearJornadaPayload.ts), el que usan TANTO el formulario
// clásico como el asistente gráfico (ambos escriben en el mismo estado
// de useCreadorJornadas y envían con crearJornadaCompleta). Aquí se
// demuestra que un mismo estado produce el payload de siempre, campo
// por campo, en modalidad por puntos y en sorteo. Sin red ni base:
// se corre con `node scripts/pruebas-crear-jornada.mjs`.

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
  nombreJornada: 'LMX J17',
  precioTicket: '30',
  fechaCierre: '2026-11-20T18:00',
  tipoPremiacion: 'unico',
  modalidad: 'clasica',
  soloAdmins: false,
  equiposSorteo: [],
  partidosNuevos: [],
};

// ---------- 1) Dorado: clásica con partidos desordenados ------------------
// Tal como los deja el formulario: uno importado de la API (con
// enlace), uno a mano sin fecha y uno a mano con fecha temprana.
const formularioClasico = {
  ...base,
  partidosNuevos: [
    { local: 'Tigres', visitante: 'América', fecha_hora: '2026-11-21T20:00', api_fixture_id: '2487602' },
    { local: 'Puebla', visitante: 'San Luis', fecha_hora: '' },
    { local: 'Chivas', visitante: 'Cruz Azul', fecha_hora: '2026-11-20T19:00' },
  ],
};
const payloadClasico = construirPayloadJornada(formularioClasico);
eq(
  payloadClasico.quiniela,
  {
    nombre_jornada: 'LMX J17',
    precio_ticket: 30,
    fecha_cierre: new Date('2026-11-20T18:00').toISOString(),
    tipo_premiacion: 'unico',
    estado: 'abierta',
    modalidad: 'clasica',
    solo_admins: false,
    equipos_sorteo: [],
  },
  'quiniela clásica: el renglón de siempre, campo por campo'
);
ok(
  !Number.isNaN(Date.parse(payloadClasico.quiniela.fecha_cierre)),
  'la fecha de cierre viaja como instante ISO válido (UTC)'
);
eq(
  payloadClasico.partidos.map((p) => p.equipo_local),
  ['Chivas', 'Tigres', 'Puebla'],
  'los partidos se ordenan por fecha y el sin fecha va al final'
);
eq(
  payloadClasico.partidos[0],
  {
    equipo_local: 'Chivas',
    equipo_visitante: 'Cruz Azul',
    fecha_hora_partido: new Date('2026-11-20T19:00').toISOString(),
    api_fixture_id: null,
  },
  'partido a mano: fecha convertida a UTC y enlace null'
);
eq(
  payloadClasico.partidos[1].api_fixture_id,
  '2487602',
  'partido importado: conserva su api_fixture_id'
);
eq(
  payloadClasico.partidos[2].fecha_hora_partido,
  null,
  'partido sin fecha: fecha_hora_partido null'
);

// ---------- 2) Dorado: sorteo ----------------------------------------------
const formularioSorteo = {
  ...base,
  nombreJornada: 'SORTEO LIGUILLA',
  modalidad: 'sorteo',
  equiposSorteo: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
  // Aunque el estado trajera partidos, en sorteo no se insertan.
  partidosNuevos: [
    { local: 'X', visitante: 'Y', fecha_hora: '2026-12-01T20:00' },
  ],
};
const payloadSorteo = construirPayloadJornada(formularioSorteo);
eq(
  payloadSorteo.quiniela.equipos_sorteo,
  ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
  'sorteo: los 8 equipos del bombo viajan en la quiniela'
);
eq(payloadSorteo.partidos, [], 'sorteo: NO se insertan partidos');
ok(
  payloadSorteo.quiniela.equipos_sorteo !== formularioSorteo.equiposSorteo,
  'equipos_sorteo viaja como copia (mutar el payload no toca el estado)'
);

// ---------- 3) En puntos, equipos_sorteo siempre viaja vacío ---------------
const conEquiposResiduales = construirPayloadJornada({
  ...base,
  modalidad: 'marcador_exacto',
  equiposSorteo: ['e1', 'e2'],
});
eq(
  conEquiposResiduales.quiniela.equipos_sorteo,
  [],
  'marcador exacto: equipos_sorteo residuales NO viajan (como siempre)'
);

// ---------- 4) Asistente vs clásico: mismo estado, mismo payload -----------
// El asistente gráfico y el formulario clásico escriben en el MISMO
// estado del hook; dos estados iguales construidos por separado (como
// los dejaría cada vista) deben producir payloads idénticos.
const estadoDesdeClasico = JSON.parse(JSON.stringify(formularioClasico));
const estadoDesdeAsistente = {
  nombreJornada: 'LMX J17',
  precioTicket: '30',
  fechaCierre: '2026-11-20T18:00',
  tipoPremiacion: 'unico',
  modalidad: 'clasica',
  soloAdmins: false,
  equiposSorteo: [],
  partidosNuevos: [
    { local: 'Tigres', visitante: 'América', fecha_hora: '2026-11-21T20:00', api_fixture_id: '2487602' },
    { local: 'Puebla', visitante: 'San Luis', fecha_hora: '' },
    { local: 'Chivas', visitante: 'Cruz Azul', fecha_hora: '2026-11-20T19:00' },
  ],
};
eq(
  construirPayloadJornada(estadoDesdeAsistente),
  construirPayloadJornada(estadoDesdeClasico),
  'asistente y clásico: mismo estado ⇒ mismo payload, sin diferencias'
);
const estadoSorteoAsistente = JSON.parse(JSON.stringify(formularioSorteo));
eq(
  construirPayloadJornada(estadoSorteoAsistente),
  payloadSorteo,
  'sorteo desde el asistente: mismo payload que desde el clásico'
);

// ---------- 5) Detalles que no deben cambiar --------------------------------
eq(
  construirPayloadJornada({ ...base, precioTicket: '1' }).quiniela
    .precio_ticket,
  1,
  'el precio viaja como entero (parseInt del texto del input)'
);
const renglonesEnBlanco = construirPayloadJornada({
  ...base,
  partidosNuevos: [{ local: '', visitante: '', fecha_hora: '' }],
});
eq(
  renglonesEnBlanco.partidos,
  [
    {
      equipo_local: '',
      equipo_visitante: '',
      fecha_hora_partido: null,
      api_fixture_id: null,
    },
  ],
  'el renglón en blanco inicial pasa tal cual (el clásico nunca lo filtró)'
);

console.log(`\ncrear-jornada: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
