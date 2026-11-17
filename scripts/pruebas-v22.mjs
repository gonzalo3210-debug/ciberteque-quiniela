// scripts/pruebas-v22.mjs
//
// Pruebas de la lógica PURA del paquete v22:
//  1) src/lib/empates.ts — detección de empate exacto en lugares de
//     premio y marca de "premio repartido" (espejo de
//     calcularPremios), con y sin empate, y con empates fuera de la
//     zona de premio.
//  2) src/lib/recuperacion.ts — normalización y comparación de la
//     palabra secreta, y la lógica del límite de intentos con
//     bloqueo temporal.
// Sin red ni base de datos: se corre con `node scripts/pruebas-v22.mjs`.

const {
  esEmpateExacto,
  gruposDeEmpate,
  porcentajesPorLugar,
  marcarEmpates,
  idsConPremioRepartido,
} = await import('../src/lib/empates.ts');

const {
  normalizarPalabraSecreta,
  palabraSecretaValida,
  hashPalabraSecreta,
  palabraSecretaCoincide,
  usuarioTienePalabraSecreta,
  estadoIntentosDesdeUsuario,
  evaluarBloqueoRecuperacion,
  registrarFalloRecuperacion,
  estadoTrasExitoRecuperacion,
  MAX_INTENTOS_RECUPERACION,
  MINUTOS_BLOQUEO_RECUPERACION,
} = await import('../src/lib/recuperacion.ts');

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

// =====================================================================
// 1) EMPATES Y PREMIO REPARTIDO
// =====================================================================
const fila = (id, puntos, golesDiff) => ({ id, puntos, golesDiff });

// --- Sin empate: nadie comparte ni reparte ---
{
  const tabla = [fila('a', 10, 2), fila('b', 9, 0), fila('c', 9, 3)];
  const m = marcarEmpates(tabla, 'unico');
  eq(m.get('a'), { compartido: false, premioRepartido: false }, 'sin empate: 1º limpio');
  eq(m.get('b'), { compartido: false, premioRepartido: false }, 'sin empate: 2º limpio');
  eq(m.get('c'), { compartido: false, premioRepartido: false }, 'sin empate: 3º limpio');
  eq(idsConPremioRepartido(tabla, 'unico').size, 0, 'sin empate: conjunto vacío');
}

// --- Empate exacto en el 1er lugar, modo unico: premio repartido ---
{
  const tabla = [fila('a', 10, 2), fila('b', 10, 2), fila('c', 8, 0)];
  const m = marcarEmpates(tabla, 'unico');
  eq(m.get('a'), { compartido: true, premioRepartido: true }, 'unico empate 1º: a reparte');
  eq(m.get('b'), { compartido: true, premioRepartido: true }, 'unico empate 1º: b reparte');
  eq(m.get('c'), { compartido: false, premioRepartido: false }, 'unico empate 1º: c fuera');
  eq([...idsConPremioRepartido(tabla, 'unico')].sort(), ['a', 'b'], 'unico empate 1º: ids');
}

// --- Empate FUERA de premios (2º lugar en modo unico): comparte, no reparte ---
{
  const tabla = [fila('a', 10, 0), fila('b', 9, 1), fila('c', 9, 1)];
  const m = marcarEmpates(tabla, 'unico');
  eq(m.get('b'), { compartido: true, premioRepartido: false }, 'unico empate 2º: comparte sin repartir');
  eq(m.get('c'), { compartido: true, premioRepartido: false }, 'unico empate 2º: comparte sin repartir (c)');
  eq(m.get('a').premioRepartido, false, 'unico empate 2º: el 1º no reparte');
}

// --- Mismos puntos pero distinta diferencia: NO es empate exacto ---
{
  const tabla = [fila('a', 10, 1), fila('b', 10, 4)];
  const m = marcarEmpates(tabla, 'unico');
  eq(m.get('a').compartido, false, 'puntos iguales, diff distinta: no comparten');
  eq(esEmpateExacto(tabla[0], tabla[1]), false, 'esEmpateExacto exige misma diferencia');
}

// --- top2: empate en el 2º lugar (el grupo ocupa los lugares 2 y 3) ---
{
  const tabla = [fila('a', 10, 0), fila('b', 9, 2), fila('c', 9, 2), fila('d', 5, 0)];
  const m = marcarEmpates(tabla, 'top2');
  eq(m.get('b').premioRepartido, true, 'top2 empate 2º: reparte (ocupa 2º y 3º, cobra el 30%)');
  eq(m.get('c').premioRepartido, true, 'top2 empate 2º: reparte (c)');
  eq(m.get('a').premioRepartido, false, 'top2 empate 2º: el 1º va solo');
  eq(m.get('d').compartido, false, 'top2 empate 2º: el 4º no comparte');
}

// --- top2: empate triple en el 1º (ocupa 1º, 2º y 3º: suma 70+30+0) ---
{
  const tabla = [fila('a', 10, 3), fila('b', 10, 3), fila('c', 10, 3), fila('d', 2, 0)];
  const m = marcarEmpates(tabla, 'top2');
  ok(m.get('a').premioRepartido && m.get('b').premioRepartido && m.get('c').premioRepartido,
    'top2 empate triple en 1º: los tres reparten');
  eq(m.get('d').premioRepartido, false, 'top2 empate triple: el 4º queda fuera');
}

// --- top3: empate en el 3º reparte; empate en el 4º no ---
{
  const tabla = [fila('a', 10, 0), fila('b', 9, 0), fila('c', 8, 1), fila('d', 8, 1), fila('e', 7, 5), fila('f', 7, 5)];
  const m = marcarEmpates(tabla, 'top3');
  eq(m.get('c').premioRepartido, true, 'top3 empate 3º: reparte');
  eq(m.get('d').premioRepartido, true, 'top3 empate 3º: reparte (d)');
  eq(m.get('e'), { compartido: true, premioRepartido: false }, 'top3 empate 4º: comparte sin premio');
}

// --- Centinela sin goles reales (999/9999): nunca es empate ---
{
  const tabla = [fila('a', 0, 999), fila('b', 0, 999), fila('c', 0, 9999), fila('d', 0, 9999)];
  const m = marcarEmpates(tabla, 'unico');
  ok([...m.values()].every((x) => !x.compartido && !x.premioRepartido),
    'centinela 999/9999: nadie comparte lugar');
  eq(esEmpateExacto(fila('x', 5, 999), fila('y', 5, 999)), false, 'esEmpateExacto rechaza centinela');
}

// --- Promo: el empate comparte lugar pero el premio NO se reparte
//     (cada empatado gana su crédito completo, como en calcularPremios) ---
{
  const tabla = [fila('a', 10, 2), fila('b', 10, 2)];
  const m = marcarEmpates(tabla, 'promo_unico');
  eq(m.get('a'), { compartido: true, premioRepartido: false }, 'promo: comparte sin "repartir"');
  eq(porcentajesPorLugar('promo_top2'), [], 'promo no reparte dinero');
}

// --- Grupos y porcentajes base ---
{
  eq(porcentajesPorLugar('unico'), [1.0], 'porcentajes unico');
  eq(porcentajesPorLugar('top2'), [0.7, 0.3], 'porcentajes top2');
  eq(porcentajesPorLugar('top3'), [0.6, 0.25, 0.15], 'porcentajes top3');
  eq(porcentajesPorLugar(null), [], 'sin tipo: sin porcentajes');
  const grupos = gruposDeEmpate([fila('a', 9, 1), fila('b', 9, 1), fila('c', 9, 2), fila('d', 9, 1)]);
  eq(grupos.map((g) => g.map((f) => f.id)), [['a', 'b'], ['c'], ['d']],
    'grupos: solo consecutivos con empate exacto (d no se pega con a/b)');
  eq(marcarEmpates([], 'unico').size, 0, 'tabla vacía: sin marcas');
}

// =====================================================================
// 2) PALABRA SECRETA — normalización y hash
// =====================================================================
eq(normalizarPalabraSecreta('  Mi PERRO   Firulais '), 'mi perro firulais',
  'normaliza: minúsculas, trim y espacios colapsados');
eq(normalizarPalabraSecreta('Canción'), 'cancion', 'normaliza: quita acentos');
eq(normalizarPalabraSecreta('ÁÉÍÓÚ Ñ Ü'), 'aeiou n u', 'normaliza: vocales, ñ y diéresis');
eq(normalizarPalabraSecreta(''), '', 'normaliza: vacío');
eq(normalizarPalabraSecreta(null), '', 'normaliza: null');
ok(!palabraSecretaValida('sol'), 'palabra de 3 no pasa el mínimo');
ok(palabraSecretaValida('  sol y luna '), 'palabra con espacios extremos válida tras normalizar');

{
  const h1 = await hashPalabraSecreta('Mi Perro', 'user-1');
  const h2 = await hashPalabraSecreta('mi perro', 'user-1');
  const h3 = await hashPalabraSecreta('mi perro', 'user-2');
  const h4 = await hashPalabraSecreta('mi gato', 'user-1');
  eq(h1, h2, 'hash: la normalización hace equivalentes las variantes');
  ok(h1 !== h3, 'hash: cambia con el usuario (ligado al id)');
  ok(h1 !== h4, 'hash: cambia con la palabra');
  ok(/^[0-9a-f]{64}$/.test(h1), 'hash: SHA-256 en hex de 64 caracteres');
  ok(await palabraSecretaCoincide('  MI PERRO ', 'user-1', h1), 'coincide con variantes de captura');
  ok(!(await palabraSecretaCoincide('mi gato', 'user-1', h1)), 'no coincide con otra palabra');
  ok(!(await palabraSecretaCoincide('mi perro', 'user-1', null)), 'sin hash guardado nunca coincide');
  ok(!(await palabraSecretaCoincide('mi perro', 'user-1', '')), 'hash vacío nunca coincide');
}

eq(usuarioTienePalabraSecreta({ palabra_secreta_hash: 'abc' }), true, 'tiene palabra: con hash');
eq(usuarioTienePalabraSecreta({ palabra_secreta_hash: null }), false, 'tiene palabra: hash nulo');
eq(usuarioTienePalabraSecreta({ id: 'x' }), false, 'tiene palabra: sin migración no hay palabra');
eq(usuarioTienePalabraSecreta(null), false, 'tiene palabra: usuario nulo');

// =====================================================================
// 3) LÍMITE DE INTENTOS
// =====================================================================
{
  const t0 = new Date('2026-11-17T12:00:00.000Z');
  let estado = estadoIntentosDesdeUsuario({});
  eq(estado, { intentos: 0, bloqueadoHasta: null }, 'intentos: fila sin columnas parte limpia');
  eq(evaluarBloqueoRecuperacion(estado, t0), { bloqueado: false, minutosRestantes: 0 },
    'intentos: sin bloqueo al inicio');

  // 4 fallos: aún sin bloqueo
  for (let i = 0; i < MAX_INTENTOS_RECUPERACION - 1; i++) {
    estado = registrarFalloRecuperacion(estado, t0);
  }
  eq(estado, { intentos: MAX_INTENTOS_RECUPERACION - 1, bloqueadoHasta: null },
    'intentos: 4 fallos cuentan sin bloquear');
  eq(evaluarBloqueoRecuperacion(estado, t0).bloqueado, false, 'intentos: 4 fallos no bloquean');

  // 5º fallo: bloqueo de 15 minutos y contador reiniciado
  estado = registrarFalloRecuperacion(estado, t0);
  eq(estado.intentos, 0, 'intentos: al bloquear el contador se reinicia');
  eq(estado.bloqueadoHasta, new Date(t0.getTime() + MINUTOS_BLOQUEO_RECUPERACION * 60000).toISOString(),
    'intentos: bloqueo hasta +15 min');
  const ev = evaluarBloqueoRecuperacion(estado, t0);
  ok(ev.bloqueado && ev.minutosRestantes === MINUTOS_BLOQUEO_RECUPERACION,
    'intentos: bloqueado con 15 minutos restantes');

  // Un fallo DURANTE el bloqueo no lo extiende ni cambia el estado
  const durante = registrarFalloRecuperacion(estado, new Date(t0.getTime() + 5 * 60000));
  eq(durante, estado, 'intentos: fallo durante el bloqueo no cambia nada');

  // A mitad del bloqueo quedan ~7-8 minutos (ceil de 7.5)
  const mitad = evaluarBloqueoRecuperacion(estado, new Date(t0.getTime() + 7.5 * 60000));
  ok(mitad.bloqueado && mitad.minutosRestantes === 8, 'intentos: minutos restantes redondean hacia arriba');

  // Al expirar: ya no bloquea, y el siguiente fallo parte de cero
  const tFin = new Date(t0.getTime() + MINUTOS_BLOQUEO_RECUPERACION * 60000);
  eq(evaluarBloqueoRecuperacion(estado, tFin).bloqueado, false, 'intentos: al expirar se desbloquea');
  eq(registrarFalloRecuperacion(estado, tFin), { intentos: 1, bloqueadoHasta: null },
    'intentos: tras expirar, el primer fallo cuenta desde 1');

  // Éxito: todo limpio
  eq(estadoTrasExitoRecuperacion(), { intentos: 0, bloqueadoHasta: null }, 'intentos: éxito limpia');

  // Lectura desde una fila real con valores guardados
  eq(
    estadoIntentosDesdeUsuario({ recuperacion_intentos: 3, recuperacion_bloqueado_hasta: '2026-11-17T12:15:00.000Z' }),
    { intentos: 3, bloqueadoHasta: '2026-11-17T12:15:00.000Z' },
    'intentos: lectura desde la fila'
  );
  eq(estadoIntentosDesdeUsuario({ recuperacion_intentos: -2 }).intentos, 0,
    'intentos: valores negativos se sanitan a 0');
}

console.log(`v22: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
