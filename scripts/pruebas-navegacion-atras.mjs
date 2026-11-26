// scripts/pruebas-navegacion-atras.mjs
//
// Pruebas del registro del botón «atrás» (src/lib/navegacionAtras.ts):
// la pila LIFO que la carcasa consulta en cada popstate para cerrar
// las vistas internas de los módulos antes de cambiar de módulo.
// Sin navegador: se corre con `node scripts/pruebas-navegacion-atras.mjs`.

const { registrarAtras, consumirAtras } = await import(
  '../src/lib/navegacionAtras.ts'
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

// Sin manejadores: nadie consume el atrás.
eq(consumirAtras(), false, 'sin manejadores, el atrás no se consume');

// Orden LIFO: el último registrado es el primero en recibirlo
// (la vista más interna: partido sobre equipo sobre liga).
{
  const orden = [];
  const quitarLiga = registrarAtras(() => { orden.push('liga'); return true; });
  const quitarEquipo = registrarAtras(() => { orden.push('equipo'); return true; });
  const quitarPartido = registrarAtras(() => { orden.push('partido'); return true; });

  eq(consumirAtras(), true, 'con manejadores, el atrás se consume');
  eq(orden, ['partido'], 'se cierra primero la vista más interna (partido)');

  quitarPartido();
  eq(consumirAtras(), true, 'tras cerrar el partido, el atrás sigue consumido');
  eq(orden, ['partido', 'equipo'], 'luego se cierra el equipo');

  quitarEquipo();
  quitarLiga();
  eq(consumirAtras(), false, 'sin vistas abiertas, el atrás vuelve a la carcasa');
}

// Un manejador que no consume deja pasar el atrás a la carcasa
// (no se intenta con el siguiente de la pila).
{
  let tocoElDeAbajo = false;
  const quitarAbajo = registrarAtras(() => { tocoElDeAbajo = true; return true; });
  const quitarArriba = registrarAtras(() => false);
  eq(consumirAtras(), false, 'si el de arriba no consume, el atrás no se consume');
  eq(tocoElDeAbajo, false, 'no se salta al siguiente manejador de la pila');
  quitarArriba();
  quitarAbajo();
}

// Un manejador que lanza un error no rompe el recorrido del atrás.
{
  const quitar = registrarAtras(() => { throw new Error('boom'); });
  eq(consumirAtras(), false, 'un manejador que falla no consume ni truena');
  quitar();
}

// Quitar dos veces el mismo registro no truena ni quita a otros.
{
  let cerro = false;
  const quitar = registrarAtras(() => { cerro = true; return true; });
  quitar();
  quitar();
  eq(consumirAtras(), false, 'el registro quitado ya no recibe el atrás');
  eq(cerro, false, 'el manejador quitado nunca se llamó');
}

console.log(`\nnavegacion-atras: ${pasan} pasan, ${fallan} fallan`);
if (fallan > 0) process.exit(1);
