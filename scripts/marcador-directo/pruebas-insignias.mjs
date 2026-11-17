// scripts/marcador-directo/pruebas-insignias.mjs
//
// Pruebas de la lógica PURA de insignias y rachas
// (src/lib/insignias.ts): historiales fabricados, sin red y sin base
// de datos. Se corre con:
//   node scripts/marcador-directo/pruebas-insignias.mjs

const {
  calcularInsignias,
  boletoCobroPremio,
  boletoEsPerfecto,
  topInsignias,
} = await import('../../src/lib/insignias.ts');

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
  ok(JSON.stringify(a) === JSON.stringify(b), `${nombre} (esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)})`);
}

// Boleto base: quiniela clásica 'unico', mitad de tabla, sin hazañas.
let correlativo = 0;
function mkBoleto(extra = {}) {
  correlativo++;
  return {
    quinielaId: `q${correlativo}`,
    nombreJornada: `Jornada ${correlativo}`,
    modalidad: 'clasica',
    tipoPremiacion: 'unico',
    fechaCierre: `2026-0${1 + Math.floor((correlativo - 1) / 28)}-${String(((correlativo - 1) % 28) + 1).padStart(2, '0')}T18:00:00Z`,
    posicion: 5,
    nivel: 5,
    tamanoGrupo1: 1,
    puntos: 3,
    exactos: 0,
    aciertos: 3,
    totalPronosticos: 10,
    ...extra,
  };
}
const ganadora = (extra = {}) => mkBoleto({ posicion: 1, nivel: 1, ...extra });
const porId = (resultado, id) => resultado.insignias.find((i) => i.id === id);

// ---------- 1) Sin historial -------------------------------------------
{
  const r = calcularInsignias([]);
  eq(r.ganadas.length, 0, 'sin historial: ninguna insignia');
  eq(r.rachaActual, 0, 'sin historial: racha 0');
  eq(r.quinielasJugadas, 0, 'sin historial: 0 jugadas');
  eq(topInsignias(r).length, 0, 'sin historial: top vacío');
}

// ---------- 2) Campeón: el umbral es 1 triunfo --------------------------
{
  const sinTitulo = calcularInsignias([mkBoleto({ posicion: 2, nivel: 2 })]);
  eq(porId(sinTitulo, 'campeon').ganada, false, '2° lugar no es campeonato');
  const conTitulo = calcularInsignias([ganadora()]);
  eq(porId(conTitulo, 'campeon').ganada, true, '1er lugar = Campeón');
  eq(porId(conTitulo, 'campeon').quinielaNombre, 'Jornada 2', 'Campeón registra la jornada');
  eq(conTitulo.campeonatos, 1, 'campeonatos = 1');
}

// ---------- 3) Empate en 1er lugar cuenta como campeonato ---------------
{
  const compartido = ganadora({ tamanoGrupo1: 2 });
  const r = calcularInsignias([compartido]);
  eq(porId(r, 'campeon').ganada, true, '1° compartido también es campeonato');
  eq(boletoCobroPremio(compartido), true, '1° compartido en unico cobra (repartido)');
}

// ---------- 4) Tricampeón: a la tercera, no antes -----------------------
{
  const dos = calcularInsignias([ganadora(), ganadora()]);
  eq(porId(dos, 'tricampeon').ganada, false, 'con 2 títulos no hay Tricampeón');
  eq(porId(dos, 'tricampeon').progreso, 2, 'progreso de Tricampeón = 2');
  const tres = calcularInsignias([ganadora(), ganadora(), ganadora()]);
  eq(porId(tres, 'tricampeon').ganada, true, 'con 3 títulos sí hay Tricampeón');
  eq(porId(tres, 'tricampeon').quinielaNombre, tres.insignias.find(i => i.id === 'tricampeon').quinielaNombre, 'Tricampeón trae jornada');
}

// ---------- 5) Francotirador: 5 exactos en UNA quiniela -----------------
{
  const cuatro = calcularInsignias([mkBoleto({ exactos: 4 }), mkBoleto({ exactos: 4 })]);
  eq(porId(cuatro, 'francotirador').ganada, false, '4+4 en dos quinielas no suma: no hay Francotirador');
  const cinco = calcularInsignias([mkBoleto({ exactos: 5 })]);
  eq(porId(cinco, 'francotirador').ganada, true, '5 exactos en una quiniela = Francotirador');
}

// ---------- 6) Quiniela perfecta según modalidad ------------------------
{
  const exactaPerfecta = mkBoleto({ modalidad: 'marcador_exacto', exactos: 10, aciertos: 10 });
  eq(boletoEsPerfecto(exactaPerfecta), true, 'exacto: 10/10 exactos = perfecta');
  const exactaConTendencia = mkBoleto({ modalidad: 'marcador_exacto', exactos: 9, aciertos: 10 });
  eq(boletoEsPerfecto(exactaConTendencia), false, 'exacto: un acierto de pura tendencia rompe la perfecta');
  const clasicaPerfecta = mkBoleto({ modalidad: 'clasica', exactos: 2, aciertos: 10 });
  eq(boletoEsPerfecto(clasicaPerfecta), true, 'clásica: 10/10 tendencias = perfecta');
  const vacio = mkBoleto({ totalPronosticos: 0, aciertos: 0, exactos: 0 });
  eq(boletoEsPerfecto(vacio), false, 'boleto sin pronósticos no es perfecta');
  const r = calcularInsignias([exactaPerfecta]);
  eq(porId(r, 'perfecta').ganada, true, 'la perfecta se gana en el historial');
}

// ---------- 7) Racha: se corta al no cobrar ------------------------------
{
  // cobro, cobro, no cobro, cobro → la racha actual es 1
  const r = calcularInsignias([
    ganadora(),
    mkBoleto({ posicion: 1, nivel: 1 }),
    mkBoleto({ posicion: 4, nivel: 4 }),
    ganadora(),
  ]);
  eq(r.rachaActual, 1, 'la racha se corta al no cobrar: queda en 1');
  eq(porId(r, 'en_racha').ganada, false, 'sin 3 seguidas no hay En Racha');
}
{
  // tres cobros seguidos al final
  const r = calcularInsignias([
    mkBoleto({ posicion: 6, nivel: 6 }),
    ganadora(), ganadora(), ganadora(),
  ]);
  eq(r.rachaActual, 3, 'tres cobros seguidos = racha 3');
  eq(porId(r, 'en_racha').ganada, true, 'racha 3 = insignia En Racha');
}
{
  // la insignia queda ganada aunque la racha actual ya se haya cortado
  const r = calcularInsignias([
    ganadora(), ganadora(), ganadora(),
    mkBoleto({ posicion: 8, nivel: 8 }),
  ]);
  eq(r.rachaActual, 0, 'tras no cobrar, la racha actual vuelve a 0');
  eq(porId(r, 'en_racha').ganada, true, 'la insignia En Racha, una vez ganada, se conserva');
}

// ---------- 8) Cobro según premiación ------------------------------------
{
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'top2', posicion: 2, nivel: 2 })), true, 'top2: el 2° cobra');
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'top2', posicion: 3, nivel: 3 })), false, 'top2: el 3° no cobra');
  // Empate en 1° en top2: el grupo ocupa los lugares 1 y 2; el siguiente (3°) queda fuera.
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'top2', posicion: 1, nivel: 1, tamanoGrupo1: 2 })), true, 'top2 con empate en 1°: el grupo cobra');
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'top3', posicion: 3, nivel: 3 })), true, 'top3: el 3° cobra');
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'promo_unico', posicion: 1, nivel: 1 })), true, 'promo_unico: grupo 1 gana crédito');
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'promo_unico', posicion: 2, nivel: 2 })), false, 'promo_unico: grupo 2 no gana');
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'promo_top2', posicion: 2, nivel: 2, tamanoGrupo1: 1 })), true, 'promo_top2: grupo 2 gana si el 1° fue único');
  eq(boletoCobroPremio(mkBoleto({ tipoPremiacion: 'promo_top2', posicion: 3, nivel: 2, tamanoGrupo1: 2 })), false, 'promo_top2: grupo 2 no gana si el 1° fue compartido');
}

// ---------- 9) Sorteo intercalado: ni suma ni rompe ----------------------
{
  const sorteo = mkBoleto({ modalidad: 'sorteo', posicion: 1, nivel: 1 });
  const r = calcularInsignias([ganadora(), sorteo, ganadora(), ganadora()]);
  eq(r.quinielasJugadas, 3, 'la quiniela de sorteo no cuenta como jugada');
  eq(r.campeonatos, 3, 'el 1° de sorteo no cuenta como campeonato');
  eq(r.rachaActual, 3, 'el sorteo intercalado no rompe la racha');
  eq(porId(r, 'en_racha').ganada, true, 'la racha se completa pese al sorteo en medio');
}

// ---------- 10) Constante y Veterano: umbrales de participación ---------
{
  const nueve = calcularInsignias(Array.from({ length: 9 }, () => mkBoleto()));
  eq(porId(nueve, 'constante').ganada, false, '9 jugadas: aún no Constante');
  const diez = calcularInsignias(Array.from({ length: 10 }, () => mkBoleto()));
  eq(porId(diez, 'constante').ganada, true, '10 jugadas = Constante');
  eq(porId(diez, 'veterano').ganada, false, '10 jugadas: aún no Veterano');
  const veinticinco = calcularInsignias(Array.from({ length: 25 }, () => mkBoleto()));
  eq(porId(veinticinco, 'veterano').ganada, true, '25 jugadas = Veterano');
}

// ---------- 11) Podio habitual: 5 veces en premio ------------------------
{
  const cuatro = calcularInsignias([
    ...Array.from({ length: 4 }, () => mkBoleto({ tipoPremiacion: 'top3', posicion: 3, nivel: 3 })),
    mkBoleto({ posicion: 7, nivel: 7 }),
  ]);
  eq(cuatro.podios, 4, 'podios cuenta solo lugares de premio');
  eq(porId(cuatro, 'podio').ganada, false, '4 podios: aún no Podio Habitual');
  const cinco = calcularInsignias([
    ...Array.from({ length: 5 }, () => mkBoleto({ tipoPremiacion: 'top3', posicion: 2, nivel: 2 })),
  ]);
  eq(porId(cinco, 'podio').ganada, true, '5 podios = Podio Habitual');
}

// ---------- 12) Varios boletos en la misma quiniela cuentan una vez -----
{
  const q = 'q-doble';
  const r = calcularInsignias([
    mkBoleto({ quinielaId: q, posicion: 4, nivel: 4 }),
    mkBoleto({ quinielaId: q, posicion: 1, nivel: 1 }),
  ]);
  eq(r.quinielasJugadas, 1, 'dos boletos en una jornada = una quiniela jugada');
  eq(r.campeonatos, 1, 'el mejor boleto manda: campeonato cuenta una vez');
  eq(r.rachaActual, 1, 'la racha cuenta la jornada una sola vez');
}

// ---------- 13) El orden cronológico manda (no el de llegada) -----------
{
  // Llegan desordenadas: la más reciente (sin cobro) primero.
  const recienteSinCobro = mkBoleto({ fechaCierre: '2026-03-10T18:00:00Z', posicion: 9, nivel: 9 });
  const viejaConCobro = mkBoleto({ fechaCierre: '2026-01-10T18:00:00Z', posicion: 1, nivel: 1 });
  const r = calcularInsignias([recienteSinCobro, viejaConCobro]);
  eq(r.rachaActual, 0, 'la última jugada cronológica no cobró: racha 0 aunque llegó primero en la lista');
}

// ---------- 14) topInsignias: rareza primero, máximo 3 -------------------
{
  const historial = [
    ganadora({ exactos: 10, aciertos: 10, modalidad: 'marcador_exacto' }), // campeón + perfecta + francotirador
    ganadora(), ganadora(), // tricampeón
    ...Array.from({ length: 7 }, () => mkBoleto()), // constante (10 jugadas)
  ];
  const r = calcularInsignias(historial);
  const top = topInsignias(r, 3);
  eq(top.length, 3, 'el top muestra máximo 3');
  eq(top[0].id, 'perfecta', 'la más rara va primero (Quiniela Perfecta)');
  eq(top[1].id, 'tricampeon', 'la segunda más rara es Tricampeón');
  ok(top.every((i) => i.ganada), 'el top solo trae insignias ganadas');
}

console.log(`\ninsignias: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
