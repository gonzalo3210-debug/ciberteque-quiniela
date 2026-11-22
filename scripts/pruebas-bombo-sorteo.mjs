// scripts/pruebas-bombo-sorteo.mjs
//
// Pruebas de la lógica PURA para jalar los equipos del bombo del
// sorteo (src/lib/bomboSorteo.ts), decisión de Gonzalo del
// 2026-11-22: el bombo se llena desde la tabla general (top 8) y, si
// el proveedor ya lista los partidos de cuartos de final de la
// liguilla, desde esos 4 partidos.
//
// Los datos de liguilla están modelados sobre la API REAL de
// TheSportsDB (verificado el 2026-11-22): en la temporada 2025-2026
// los partidos de play-in, cuartos, semifinales y final vinieron con
// intRound 0 (y 125/200 en el Clausura), mezclados y en orden
// cronológico; la fase regular son las rondas 1..17. En la temporada
// 2026-2027, al momento de escribir esto, la API aún NO lista ningún
// partido de liguilla (solo las 17 rondas), así que la fuente activa
// hoy es la tabla.
//
// Sin red ni base: se corre con `node scripts/pruebas-bombo-sorteo.mjs`.

const {
  top8DesdeTabla,
  llavesCuartosDesdeFixtures,
  sugerirBombo,
  mapearEquiposARegistro,
} = await import('../src/lib/bomboSorteo.ts');
const { nombreEquipoES } = await import('../src/lib/sports/nombresES.ts');

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

// ---------- Fábricas -------------------------------------------------------
function fila(rank, teamName, teamProviderId) {
  return {
    rank,
    teamName,
    teamProviderId,
    badgeUrl: null,
    played: 17,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: null,
  };
}

function fx(round, homeTeam, awayTeam, homeTeamProviderId, awayTeamProviderId) {
  return {
    providerId: `${homeTeam}-${awayTeam}-${round}`,
    leagueProviderId: '4350',
    season: '2026-2027',
    round,
    homeTeam,
    awayTeam,
    homeTeamProviderId,
    awayTeamProviderId,
    homeBadgeUrl: null,
    awayBadgeUrl: null,
    kickoffUtc: null,
    date: null,
    status: 'scheduled',
    statusRaw: null,
    progress: null,
    homeScore: null,
    awayScore: null,
    venue: null,
    tvStation: null,
  };
}

// IDs reales del proveedor (liga 4350, verificados contra la API).
const ID = {
  cruzAzul: '134196',
  america: '134193',
  chivas: '134206',
  atlas: '134195',
  toluca: '134204',
  monterrey: '134198',
  leon: '134207',
  pachuca: '134191',
  tijuana: '134202',
  santos: '134192',
  pumas: '134201',
  puebla: '134199',
  sanLuis: '136856',
  queretaro: '134194',
  tigres: '134197',
  atlante: '134203',
  necaxa: '135662',
  juarez: '136855',
};

// Tabla "de hoy" (los 8 primeros son el bombo si no hay liguilla).
const tablaHoy = [
  fila(1, 'Cruz Azul', ID.cruzAzul),
  fila(2, 'América', ID.america),
  fila(3, 'CD Guadalajara', ID.chivas),
  fila(4, 'Atlas', ID.atlas),
  fila(5, 'Toluca', ID.toluca),
  fila(6, 'Monterrey', ID.monterrey),
  fila(7, 'León', ID.leon),
  fila(8, 'Pachuca', ID.pachuca),
  fila(9, 'Tijuana', ID.tijuana),
  fila(10, 'Santos Laguna', ID.santos),
  fila(11, 'Pumas UNAM', ID.pumas),
  fila(12, 'Puebla', ID.puebla),
  fila(13, 'Atlético de San Luis', ID.sanLuis),
  fila(14, 'Querétaro', ID.queretaro),
  fila(15, 'Tigres UANL', ID.tigres),
  fila(16, 'Atlante', ID.atlante),
  fila(17, 'Necaxa', ID.necaxa),
  fila(18, 'Juárez', ID.juarez),
];

// ---------- 1) Top 8 desde la tabla ---------------------------------------
{
  const top8 = top8DesdeTabla(tablaHoy);
  eq(
    top8.map((e) => e.nombre),
    ['Cruz Azul', 'América', 'CD Guadalajara', 'Atlas', 'Toluca', 'Monterrey', 'León', 'Pachuca'],
    'top 8 en orden de tabla'
  );
  eq(top8[2].teamProviderId, ID.chivas, 'el top 8 conserva el ID del proveedor');

  const desordenada = [...tablaHoy].reverse();
  eq(
    top8DesdeTabla(desordenada).map((e) => e.nombre),
    top8.map((e) => e.nombre),
    'el top 8 se ordena por rank aunque las filas vengan revueltas'
  );

  eq(top8DesdeTabla(tablaHoy.slice(0, 5)).length, 5, 'tabla corta: devuelve lo que hay');
  eq(top8DesdeTabla([]), [], 'tabla vacía: lista vacía');
}

// ---------- 2) Cuartos de final desde los partidos -------------------------
// Tabla de un torneo ya cerrado (como el Apertura 2025 real): los 6
// directos y la zona de play-in quedan así.
const tablaLiguilla = [
  fila(1, 'Toluca', ID.toluca),
  fila(2, 'Tigres UANL', ID.tigres),
  fila(3, 'Cruz Azul', ID.cruzAzul),
  fila(4, 'América', ID.america),
  fila(5, 'Monterrey', ID.monterrey),
  fila(6, 'CD Guadalajara', ID.chivas),
  fila(7, 'Juárez', ID.juarez),
  fila(8, 'Tijuana', ID.tijuana),
  fila(9, 'Pachuca', ID.pachuca),
  fila(10, 'Pumas UNAM', ID.pumas),
  fila(11, 'León', ID.leon),
  fila(12, 'Atlas', ID.atlas),
  fila(13, 'Santos Laguna', ID.santos),
  fila(14, 'Puebla', ID.puebla),
  fila(15, 'Atlético de San Luis', ID.sanLuis),
  fila(16, 'Querétaro', ID.queretaro),
  fila(17, 'Necaxa', ID.necaxa),
  fila(18, 'Atlante', ID.atlante),
];

// La liguilla tal como la API la mezcló en 2025 (intRound 0, en orden
// cronológico): play-in, cuartos ida, cuartos vuelta, semis y final.
const liguilla2025 = [
  // Play-in (nadie es top 6: no deben contar como llaves)
  fx(0, 'Tijuana', 'Juárez', ID.tijuana, ID.juarez),
  fx(0, 'Pachuca', 'Pumas UNAM', ID.pachuca, ID.pumas),
  fx(0, 'Juárez', 'Pachuca', ID.juarez, ID.pachuca),
  // Cuartos, ida
  fx(0, 'Monterrey', 'América', ID.monterrey, ID.america),
  fx(0, 'Tijuana', 'Tigres UANL', ID.tijuana, ID.tigres),
  fx(0, 'Juárez', 'Toluca', ID.juarez, ID.toluca),
  fx(0, 'CD Guadalajara', 'Cruz Azul', ID.chivas, ID.cruzAzul),
  // Cuartos, vuelta (mismas parejas invertidas: se ignoran)
  fx(0, 'América', 'Monterrey', ID.america, ID.monterrey),
  fx(0, 'Tigres UANL', 'Tijuana', ID.tigres, ID.tijuana),
  fx(0, 'Toluca', 'Juárez', ID.toluca, ID.juarez),
  fx(0, 'Cruz Azul', 'CD Guadalajara', ID.cruzAzul, ID.chivas),
  // Semifinales y final (equipos ya tomados: se ignoran)
  fx(0, 'Cruz Azul', 'Tigres UANL', ID.cruzAzul, ID.tigres),
  fx(0, 'Monterrey', 'Toluca', ID.monterrey, ID.toluca),
  fx(0, 'Tigres UANL', 'Toluca', ID.tigres, ID.toluca),
  fx(200, 'Toluca', 'Tigres UANL', ID.toluca, ID.tigres),
];

{
  const llaves = llavesCuartosDesdeFixtures(liguilla2025, tablaLiguilla, nombreEquipoES);
  ok(llaves !== null, 'con liguilla completa SÍ se detectan los cuartos');
  eq(
    (llaves || []).map((e) => e.nombre),
    ['Monterrey', 'América', 'Tijuana', 'Tigres UANL', 'Juárez', 'Toluca', 'CD Guadalajara', 'Cruz Azul'],
    'las llaves salen en el orden de la ida, sin play-in ni vueltas'
  );

  // Los códigos altos del Clausura (125) también son liguilla.
  const clausura = liguilla2025.map((f) => ({ ...f, round: f.round === 0 ? 125 : f.round }));
  eq(
    (llavesCuartosDesdeFixtures(clausura, tablaLiguilla, nombreEquipoES) || []).map((e) => e.nombre),
    (llaves || []).map((e) => e.nombre),
    'con intRound 125 (Clausura) se detectan igual'
  );

  // Solo fase regular (lo que la API trae HOY): no hay cuartos.
  const soloRegular = [1, 2, 3].flatMap((r) => [
    fx(r, 'Cruz Azul', 'América', ID.cruzAzul, ID.america),
    fx(r, 'Toluca', 'Monterrey', ID.toluca, ID.monterrey),
  ]);
  eq(
    llavesCuartosDesdeFixtures(soloRegular, tablaLiguilla, nombreEquipoES),
    null,
    'sin partidos de liguilla no hay cuartos (null)'
  );

  // Liguilla a medias (solo 3 llaves de cuartos): no se acepta.
  const aMedias = liguilla2025.slice(0, 6);
  eq(
    llavesCuartosDesdeFixtures(aMedias, tablaLiguilla, nombreEquipoES),
    null,
    'con menos de 4 llaves no se acepta la fuente'
  );

  // Un equipo fuera del top 10 no puede colarse a una llave.
  const conColado = [
    fx(0, 'Monterrey', 'América', ID.monterrey, ID.america),
    fx(0, 'León', 'Toluca', ID.leon, ID.toluca), // León es 11° en tablaLiguilla
    fx(0, 'Tijuana', 'Tigres UANL', ID.tijuana, ID.tigres),
    fx(0, 'Juárez', 'Toluca', ID.juarez, ID.toluca),
    fx(0, 'CD Guadalajara', 'Cruz Azul', ID.chivas, ID.cruzAzul),
  ];
  eq(
    (llavesCuartosDesdeFixtures(conColado, tablaLiguilla, nombreEquipoES) || []).map((e) => e.nombre),
    ['Monterrey', 'América', 'Tijuana', 'Tigres UANL', 'Juárez', 'Toluca', 'CD Guadalajara', 'Cruz Azul'],
    'la "llave" con un 11° se salta y las buenas sí salen'
  );

  // Sin tabla suficiente no se puede reconocer el cuadro.
  eq(
    llavesCuartosDesdeFixtures(liguilla2025, tablaLiguilla.slice(0, 8), nombreEquipoES),
    null,
    'con menos de 10 filas de tabla no se detectan cuartos'
  );
}

// ---------- 3) La sugerencia completa --------------------------------------
{
  const sinLiguilla = sugerirBombo([], tablaHoy, nombreEquipoES);
  eq(sinLiguilla.fuente, 'tabla', 'sin liguilla la fuente es la tabla');
  eq(sinLiguilla.equipos.length, 8, 'la sugerencia por tabla trae 8');

  const conLiguilla = sugerirBombo(liguilla2025, tablaLiguilla, nombreEquipoES);
  eq(conLiguilla.fuente, 'cuartos', 'con liguilla la fuente preferida es cuartos');
  eq(conLiguilla.equipos[0].nombre, 'Monterrey', 'la sugerencia por cuartos abre con la primera llave');
}

// ---------- 4) Mapeo al registro de equipos del Club ------------------------
const registro = [
  { id: 'e-cruz', nombre: 'Cruz Azul' },
  { id: 'e-ame', nombre: 'América' },
  { id: 'e-chi', nombre: 'Chivas' },
  { id: 'e-atlas', nombre: 'Atlas' },
  { id: 'e-tol', nombre: 'Toluca' },
  { id: 'e-mty', nombre: 'Monterrey' },
  { id: 'e-leon', nombre: 'León' },
  { id: 'e-pach', nombre: 'Pachuca' },
  { id: 'e-pumas', nombre: 'Pumas' },
  { id: 'e-tigres', nombre: 'Tigres' },
  { id: 'e-juarez', nombre: 'Juárez' },
  { id: 'e-tij', nombre: 'Tijuana' },
  { id: 'e-sanluis', nombre: 'Atlético San Luis' },
];

{
  const mapeo = mapearEquiposARegistro(top8DesdeTabla(tablaHoy), registro, nombreEquipoES);
  eq(
    mapeo.ids,
    ['e-cruz', 'e-ame', 'e-chi', 'e-atlas', 'e-tol', 'e-mty', 'e-leon', 'e-pach'],
    'el top 8 se mapea a IDs en orden (CD Guadalajara → Chivas por nombresES)'
  );
  eq(mapeo.noRegistrados, [], 'con registro completo no falta nadie');

  const mapeoCuartos = mapearEquiposARegistro(
    llavesCuartosDesdeFixtures(liguilla2025, tablaLiguilla, nombreEquipoES),
    registro,
    nombreEquipoES
  );
  eq(
    mapeoCuartos.ids,
    ['e-mty', 'e-ame', 'e-tij', 'e-tigres', 'e-juarez', 'e-tol', 'e-chi', 'e-cruz'],
    'las llaves se mapean en su orden (Tigres UANL → Tigres, Pumas no va aquí)'
  );

  // Equipo que no está en el registro: se reporta, no se inventa.
  const sinAtlas = registro.filter((r) => r.nombre !== 'Atlas');
  const mapeoFaltante = mapearEquiposARegistro(top8DesdeTabla(tablaHoy), sinAtlas, nombreEquipoES);
  eq(mapeoFaltante.ids.length, 7, 'sin Atlas en el registro quedan 7 IDs');
  eq(mapeoFaltante.noRegistrados, ['Atlas'], 'el faltante se reporta por su nombre');

  // Nombre del proveedor que difiere del registro SIN pasar por
  // nombresES: en la temporada 2025-2026 la API llamó «CF America»
  // al América en los eventos. Hoy no se adivina: se reporta como no
  // registrado para elegirlo a mano (caso borde conocido).
  const mapeoVariante = mapearEquiposARegistro(
    [{ nombre: 'CF America', teamProviderId: ID.america }],
    registro,
    nombreEquipoES
  );
  eq(mapeoVariante.ids, [], '«CF America» no se mapea a ciegas');
  eq(mapeoVariante.noRegistrados, ['CF America'], '«CF America» se reporta tal cual');

  // El mismo ID del registro no se asigna dos veces.
  const duplicado = mapearEquiposARegistro(
    [
      { nombre: 'Pumas UNAM', teamProviderId: ID.pumas },
      { nombre: 'Pumas UNAM', teamProviderId: ID.pumas },
    ],
    registro,
    nombreEquipoES
  );
  eq(duplicado.ids, ['e-pumas'], 'un ID no se repite en el bombo');
  eq(duplicado.noRegistrados, ['Pumas'], 'la segunda aparición cuenta como no registrada');
}

// ---------- Resumen ---------------------------------------------------------
console.log(`\nPruebas del bombo del sorteo: ${pasan} pasan, ${fallan} fallan.`);
if (fallan > 0) process.exit(1);
