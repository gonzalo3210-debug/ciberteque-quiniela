// scripts/pruebas-quiniela-semana.mjs
//
// Pruebas de la lógica PURA para elegir LA QUINIELA DE LA SEMANA
// (src/lib/quinielaSemana.ts), decisión de Gonzalo del 2026-11-22:
// con varias quinielas abiertas a la vez (la semanal más las
// especiales de $100 y $200), la que aparece por defecto al entrar
// a Jugar y a la pestaña de Partidos es la de la semana — la
// regular con más partidos — y las demás quedan en el selector.
//
// Sin red ni base: se corre con `node scripts/pruebas-quiniela-semana.mjs`.

const {
  compararPreferenciaSemana,
  ordenarPorPreferenciaSemana,
  quinielaDeLaSemana,
} = await import('../src/lib/quinielaSemana.ts');

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
  ok(a === b, `${nombre} (esperado: ${b}, obtenido: ${a})`);
}

// Los rasgos tal cual los leen los hooks (modalidad, cierre, partidos).
const rasgos = (q) => ({
  modalidad: q.modalidad,
  fechaCierre: q.fecha_cierre,
  cantidadPartidos: q.partidos,
});
const regular = (nombre, partidos, fecha_cierre, modalidad = 'puntos') => ({
  nombre,
  modalidad,
  partidos,
  fecha_cierre,
});
const sorteo = (nombre, partidos, fecha_cierre) => ({
  nombre,
  modalidad: 'sorteo',
  partidos,
  fecha_cierre,
});

// ---------- 1. La semanal le gana al sorteo aunque el sorteo cierre antes ---
{
  const especialSorteo = sorteo('SORTEO $200', 0, '2026-11-23T18:00:00');
  const semanal = regular('LMX J18', 10, '2026-11-27T18:00:00');
  eq(
    quinielaDeLaSemana([especialSorteo, semanal], rasgos)?.nombre,
    'LMX J18',
    'la regular de 10 partidos gana al sorteo que cierra antes'
  );
  eq(
    quinielaDeLaSemana([semanal, especialSorteo], rasgos)?.nombre,
    'LMX J18',
    'la regular gana al sorteo sin importar el orden de llegada'
  );
}

// ---------- 2. La clase manda sobre el conteo: regular > sorteo ------------
{
  const sorteoGrande = sorteo('SORTEO $100', 12, '2026-11-23T18:00:00');
  const semanal = regular('LMX J18', 10, '2026-11-27T18:00:00');
  eq(
    quinielaDeLaSemana([sorteoGrande, semanal], rasgos)?.nombre,
    'LMX J18',
    'un sorteo con más partidos no le quita el default a la regular'
  );
}

// ---------- 3. Regular contra especial regular: más partidos ---------------
{
  const especial = regular('CHAMPIONS $100', 6, '2026-11-24T10:30:00', 'marcador_exacto');
  const semanal = regular('LMX J18', 10, '2026-11-27T18:00:00');
  eq(
    quinielaDeLaSemana([especial, semanal], rasgos)?.nombre,
    'LMX J18',
    'la regular de 10 partidos gana a la especial regular de 6'
  );
}

// ---------- 4. Dos semanales: cierre más próximo ----------------------------
{
  const tarde = regular('LMX J19', 10, '2026-12-04T18:00:00');
  const pronto = regular('LMX J18', 10, '2026-11-27T18:00:00');
  eq(
    quinielaDeLaSemana([tarde, pronto], rasgos)?.nombre,
    'LMX J18',
    'entre dos semanales de 10 gana la de cierre más próximo'
  );
}

// ---------- 5. Solo sorteos: el sorteo es el default ------------------------
{
  const unico = sorteo('SORTEO LIGUILLA', 0, '2026-11-25T18:00:00');
  eq(
    quinielaDeLaSemana([unico], rasgos)?.nombre,
    'SORTEO LIGUILLA',
    'con un solo sorteo abierto, el sorteo es el default'
  );
  const lejos = sorteo('SORTEO $200', 0, '2026-11-26T18:00:00');
  const cerca = sorteo('SORTEO $100', 0, '2026-11-25T18:00:00');
  eq(
    quinielaDeLaSemana([lejos, cerca], rasgos)?.nombre,
    'SORTEO $100',
    'entre dos sorteos iguales gana el de cierre más próximo'
  );
}

// ---------- 6. Lista vacía ---------------------------------------------------
{
  eq(quinielaDeLaSemana([], rasgos), null, 'lista vacía: no hay quiniela de la semana');
  eq(ordenarPorPreferenciaSemana([], rasgos).length, 0, 'lista vacía: el orden sale vacío');
}

// ---------- 7. El orden del selector: todas, la semana primero --------------
{
  const especialSorteo = sorteo('SORTEO $200', 0, '2026-11-23T18:00:00');
  const especial = regular('CHAMPIONS $100', 6, '2026-11-24T10:30:00', 'marcador_exacto');
  const semanal = regular('LMX J18', 10, '2026-11-27T18:00:00');
  const entrada = [especialSorteo, especial, semanal];
  const orden = ordenarPorPreferenciaSemana(entrada, rasgos).map((q) => q.nombre);
  eq(orden[0], 'LMX J18', 'en el selector la de la semana sale primera');
  eq(orden.length, 3, 'el selector no esconde ninguna quiniela');
  eq(
    entrada.map((q) => q.nombre).join(','),
    'SORTEO $200,CHAMPIONS $100,LMX J18',
    'ordenar no muta la lista original'
  );
}

// ---------- 8. Empate total: se conserva el orden de llegada ----------------
{
  const a = regular('PRIMERA', 10, '2026-11-27T18:00:00');
  const b = regular('SEGUNDA', 10, '2026-11-27T18:00:00');
  eq(
    compararPreferenciaSemana(rasgos(a), rasgos(b)),
    0,
    'con todo igual, el comparador empata'
  );
  eq(
    ordenarPorPreferenciaSemana([a, b], rasgos)[0]?.nombre,
    'PRIMERA',
    'con todo igual se conserva el orden en que venían'
  );
}

// ---------- Resumen ----------------------------------------------------------
console.log(`\nPruebas de la quiniela de la semana: ${pasan} pasan, ${fallan} fallan.`);
if (fallan > 0) process.exit(1);
