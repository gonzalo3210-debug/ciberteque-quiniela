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
  ordenarPorSiembra,
  sugerirBombo,
  mapearEquiposARegistro,
  resolverSiembra,
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
  // El bombo se GUARDA en orden de siembra (1° a 8° de la tabla),
  // aunque la fuente sean las llaves: así la siembra posicional del
  // tablero (1v8, 2v7, 3v6, 4v5) reproduce las llaves reales.
  eq(
    conLiguilla.equipos.map((e) => e.nombre),
    ['Toluca', 'Tigres UANL', 'Cruz Azul', 'América', 'Monterrey', 'CD Guadalajara', 'Juárez', 'Tijuana'],
    'la sugerencia por cuartos sale en orden de siembra, no en orden de llaves'
  );

  // ordenarPorSiembra directo: el que no está en la tabla va al
  // final sin mover a los demás, y la entrada no se muta.
  const desorden = [
    { nombre: 'Tijuana', teamProviderId: ID.tijuana },
    { nombre: 'Equipo Fantasma', teamProviderId: null },
    { nombre: 'Toluca', teamProviderId: ID.toluca },
  ];
  eq(
    ordenarPorSiembra(desorden, tablaLiguilla, nombreEquipoES).map((e) => e.nombre),
    ['Toluca', 'Tijuana', 'Equipo Fantasma'],
    'ordenarPorSiembra: por rank de tabla y el desconocido al final'
  );
  eq(desorden[0].nombre, 'Tijuana', 'ordenarPorSiembra NO muta su entrada');
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

  // El mapeo de la SUGERENCIA por cuartos (lo que de verdad se
  // guarda en equipos_sorteo) sale en orden de siembra.
  const mapeoSugerencia = mapearEquiposARegistro(
    sugerirBombo(liguilla2025, tablaLiguilla, nombreEquipoES).equipos,
    registro,
    nombreEquipoES
  );
  eq(
    mapeoSugerencia.ids,
    ['e-tol', 'e-tigres', 'e-cruz', 'e-ame', 'e-mty', 'e-chi', 'e-juarez', 'e-tij'],
    'el bombo guardado desde cuartos queda en orden de siembra (1° a 8°)'
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

// ---------- 5) Selector de liga: catálogo y ligas hermanas ------------------
// (Extensión 2026-11-22: el bombo ya no es solo de Liga MX; el
// selector ofrece SOLO ligas con liguilla verificadas contra la API
// real — ver src/lib/sports/ligasSorteo.ts.)
const { LIGAS_SORTEO, LIGA_SORTEO_DEFECTO, getLigaSorteo } = await import(
  '../src/lib/sports/ligasSorteo.ts'
);

{
  eq(
    LIGAS_SORTEO.map((l) => l.providerId),
    ['4350', '5206', '4654'],
    'el selector ofrece Liga MX, Liga MX Femenil y Liga de Expansión MX'
  );
  eq(LIGA_SORTEO_DEFECTO.providerId, '4350', 'la liga por defecto es Liga MX');
  eq(getLigaSorteo('5206')?.name, 'Liga MX Femenil', 'getLigaSorteo encuentra la Femenil');
  eq(getLigaSorteo('4654')?.rondasRegulares, 15, 'Expansión tiene 15 rondas regulares');
  // Las de torneo regular puro y las no verificadas quedan FUERA.
  for (const [id, nombre] of [
    ['4328', 'Premier League'],
    ['4335', 'La Liga'],
    ['4346', 'MLS'],
    ['4480', 'Champions League'],
    ['4501', 'Copa Libertadores'],
  ]) {
    eq(getLigaSorteo(id), undefined, `${nombre} (${id}) NO es elegible para el sorteo`);
  }
}

// Fábrica de fixtures para las ligas hermanas (su leagueProviderId
// difiere del de Liga MX; la detección no depende de él).
function fxLiga(leagueProviderId, round, homeTeam, awayTeam, homeId, awayId) {
  return { ...fx(round, homeTeam, awayTeam, homeId, awayId), leagueProviderId };
}

// --- Liga MX Femenil (5206): tabla de 18 y llaves 1v8/2v7/3v6/4v5 ---
const F = {
  ame: 'f-ame', tig: 'f-tig', pach: 'f-pach', gdl: 'f-gdl', mty: 'f-mty',
  tol: 'f-tol', pum: 'f-pum', jua: 'f-jua', ca: 'f-ca', leon: 'f-leon',
};
const tablaFemenil = [
  fila(1, 'América Femenil', F.ame),
  fila(2, 'Tigres UANL Femenil', F.tig),
  fila(3, 'Pachuca Femenil', F.pach),
  fila(4, 'CD Guadalajara Femenil', F.gdl),
  fila(5, 'Monterrey Femenil', F.mty),
  fila(6, 'Toluca Femenil', F.tol),
  fila(7, 'Pumas UNAM Femenil', F.pum),
  fila(8, 'Juárez Femenil', F.jua),
  fila(9, 'Cruz Azul Femenil', F.ca),
  fila(10, 'León Femenil', F.leon),
  ...[11, 12, 13, 14, 15, 16, 17, 18].map((r) =>
    fila(r, `Equipo Femenil ${r}`, `f-x${r}`)
  ),
];
const cuartosFemenil = [
  fxLiga('5206', 0, 'Juárez Femenil', 'América Femenil', F.jua, F.ame),
  fxLiga('5206', 0, 'Pumas UNAM Femenil', 'Tigres UANL Femenil', F.pum, F.tig),
  fxLiga('5206', 0, 'Toluca Femenil', 'Pachuca Femenil', F.tol, F.pach),
  fxLiga('5206', 0, 'Monterrey Femenil', 'CD Guadalajara Femenil', F.mty, F.gdl),
  // Vueltas (se ignoran)
  fxLiga('5206', 0, 'América Femenil', 'Juárez Femenil', F.ame, F.jua),
  fxLiga('5206', 0, 'Tigres UANL Femenil', 'Pumas UNAM Femenil', F.tig, F.pum),
];

{
  const sug = sugerirBombo(cuartosFemenil, tablaFemenil, nombreEquipoES, 17);
  eq(sug.fuente, 'cuartos', 'Femenil: con su liguilla publicada la fuente es cuartos');
  eq(
    sug.equipos.map((e) => e.nombre),
    [
      'América Femenil', 'Tigres UANL Femenil',
      'Pachuca Femenil', 'CD Guadalajara Femenil',
      'Monterrey Femenil', 'Toluca Femenil',
      'Pumas UNAM Femenil', 'Juárez Femenil',
    ],
    'Femenil: el bombo se guarda en orden de siembra (1° a 8° de su tabla)'
  );

  const sinLiguilla = sugerirBombo([], tablaFemenil, nombreEquipoES, 17);
  eq(sinLiguilla.fuente, 'tabla', 'Femenil: sin liguilla cae a su tabla');
  eq(sinLiguilla.equipos[0].nombre, 'América Femenil', 'Femenil: el top 8 abre con su líder');
}

// --- Liga de Expansión MX (4654): 16 equipos, 15 rondas regulares ---
const X = {
  paz: 'x-paz', ven: 'x-ven', mor: 'x-mor', can: 'x-can', udg: 'x-udg',
  tla: 'x-tla', pir: 'x-pir', dur: 'x-dur', tap: 'x-tap', tep: 'x-tep',
};
const tablaExpansion = [
  fila(1, 'Atlético La Paz', X.paz),
  fila(2, 'Venados', X.ven),
  fila(3, 'Atlético Morelia', X.mor),
  fila(4, 'Cancún', X.can),
  fila(5, 'Leones Negros UdeG', X.udg),
  fila(6, 'Tlaxcala', X.tla),
  fila(7, 'Piratas', X.pir),
  fila(8, 'Alacranes de Durango', X.dur),
  fila(9, 'Tapatío', X.tap),
  fila(10, 'Tepatitlán', X.tep),
  ...[11, 12, 13, 14, 15, 16].map((r) => fila(r, `Equipo Expansión ${r}`, `x-x${r}`)),
];
const liguillaExpansion = [
  // Repechaje (nadie es top 6: no cuenta como llave)
  fxLiga('4654', 0, 'Piratas', 'Tepatitlán', X.pir, X.tep),
  fxLiga('4654', 0, 'Alacranes de Durango', 'Tapatío', X.dur, X.tap),
  // Cuartos, ida
  fxLiga('4654', 0, 'Alacranes de Durango', 'Atlético La Paz', X.dur, X.paz),
  fxLiga('4654', 0, 'Piratas', 'Venados', X.pir, X.ven),
  fxLiga('4654', 0, 'Tlaxcala', 'Atlético Morelia', X.tla, X.mor),
  fxLiga('4654', 0, 'Leones Negros UdeG', 'Cancún', X.udg, X.can),
];

{
  const sug = sugerirBombo(liguillaExpansion, tablaExpansion, nombreEquipoES, 15);
  eq(sug.fuente, 'cuartos', 'Expansión: con su liguilla la fuente es cuartos');
  eq(
    sug.equipos.map((e) => e.nombre),
    [
      'Atlético La Paz', 'Venados',
      'Atlético Morelia', 'Cancún',
      'Leones Negros UdeG', 'Tlaxcala',
      'Piratas', 'Alacranes de Durango',
    ],
    'Expansión: sin el repechaje y en orden de siembra (1° a 8°)'
  );

  // El parámetro de rondas manda: si los cuartos vinieran numerados
  // como ronda 16, con las 15 rondas de Expansión SÍ son liguilla;
  // con las 17 de Liga MX serían "fase regular" y se caería a tabla.
  const cuartosRonda16 = liguillaExpansion
    .filter((f) => f.homeTeam !== 'Tepatitlán' && f.awayTeam !== 'Tapatío')
    .map((f) => ({ ...f, round: 16 }));
  eq(
    sugerirBombo(cuartosRonda16, tablaExpansion, nombreEquipoES, 15).fuente,
    'cuartos',
    'Expansión (15 rondas): la ronda 16 cuenta como liguilla'
  );
  eq(
    sugerirBombo(cuartosRonda16, tablaExpansion, nombreEquipoES).fuente,
    'tabla',
    'con el default de Liga MX (17), la ronda 16 sería regular y manda la tabla'
  );
}

// ---------- resolverSiembra: la posición sale de la tabla -------------------
// La sala real de Gonzalo (2026-11-22): llenó el bombo A MANO con
// los 8 ya seleccionados, DESMARCÓ al América y lo volvió a marcar;
// el orden guardado quedó en orden de selección, con el América
// (2° de la tabla) al final. La tabla de abajo es la real de la
// API (nombres e IDs del proveedor, jornada 17).
{
  const tablaReal = [
    fila(1, 'Cruz Azul', '134196'),
    fila(2, 'América', '134193'),
    fila(3, 'CD Guadalajara', '134206'),
    fila(4, 'Atlas', '134195'),
    fila(5, 'Toluca', '134204'),
    fila(6, 'Monterrey', '134198'),
    fila(7, 'León', '134207'),
    fila(8, 'Pachuca', '134191'),
    fila(9, 'Tijuana', '134202'),
    fila(10, 'Santos Laguna', '134192'),
  ];
  const guardadoRevuelto = [
    'Cruz Azul', 'Chivas', 'Atlas', 'Toluca',
    'Monterrey', 'León', 'Pachuca', 'América',
  ];
  const siembra = resolverSiembra(guardadoRevuelto, tablaReal, nombreEquipoES);
  eq(siembra.fuente, 'tabla', 'resolverSiembra: con la tabla completa la fuente es la tabla');
  eq(
    siembra.orden,
    ['Cruz Azul', 'América', 'Chivas', 'Atlas', 'Toluca', 'Monterrey', 'León', 'Pachuca'],
    'resolverSiembra: el orden sale de la tabla, no del orden guardado (el América vuelve al 2°)'
  );
  eq(siembra.posiciones.get('america'), 2, 'resolverSiembra: América es el 2 aunque se guardó al final');
  eq(siembra.posiciones.get('chivas'), 3, 'resolverSiembra: Chivas cruza contra «CD Guadalajara» por nombresES');
  eq(siembra.posiciones.get('pachuca'), 8, 'resolverSiembra: Pachuca es el 8');

  const sinTabla = resolverSiembra(guardadoRevuelto, null, nombreEquipoES);
  eq(sinTabla.fuente, 'guardada', 'resolverSiembra: sin tabla, la fuente es el orden guardado (avisado)');
  eq(sinTabla.orden, guardadoRevuelto, 'resolverSiembra: sin tabla se conserva el orden guardado');
  eq(sinTabla.posiciones.get('america'), 8, 'resolverSiembra: en el respaldo la posición es la del orden guardado');

  const incompleta = resolverSiembra(
    guardadoRevuelto,
    tablaReal.filter((r) => r.teamName !== 'Pachuca'),
    nombreEquipoES
  );
  eq(incompleta.fuente, 'guardada', 'resolverSiembra: si un equipo no aparece en la tabla, cae al orden guardado');
  eq(
    resolverSiembra(guardadoRevuelto, [], nombreEquipoES).fuente,
    'guardada',
    'resolverSiembra: tabla vacía = respaldo guardado'
  );
}

// ---------- Resumen ---------------------------------------------------------
console.log(`\nPruebas del bombo del sorteo: ${pasan} pasan, ${fallan} fallan.`);
if (fallan > 0) process.exit(1);
