// src/lib/navegacionAtras.ts
//
// El botón «atrás» del teléfono (Android) dentro de la app.
//
// La app es una sola página: los módulos se cambian por estado, no
// por URL, así que el historial del navegador traía una sola
// entrada y el botón de atrás SACABA de la app (queja de Gonzalo,
// 2026-11-25: «soy muy de darle para atrás con el botón del celular
// y me saca de la app»).
//
// La carcasa (src/app/page.tsx) integra la navegación con el
// historial: cada módulo visitado empuja una entrada y el botón de
// atrás regresa al módulo anterior; en el módulo raíz, el primer
// atrás avisa «toca de nuevo para salir» y solo el segundo sale.
//
// Este registro es la otra mitad: las vistas INTERNAS de un módulo
// (en Resultados: la página de una liga, el detalle de un equipo,
// el detalle de un partido) se registran mientras están abiertas
// para cerrarse con el mismo botón, de la más interna a la más
// externa (pila LIFO). La carcasa consulta el registro en cada
// popstate antes de cambiar de módulo.

import { useEffect, useRef } from 'react';

/** Devuelve true si el atrás quedó consumido por la vista. */
export type ManejadorAtras = () => boolean;

const pila: ManejadorAtras[] = [];

/**
 * Registra un manejador del botón atrás. Devuelve la función para
 * quitarlo (el cleanup del efecto que lo registró).
 */
export function registrarAtras(fn: ManejadorAtras): () => void {
  pila.push(fn);
  return () => {
    const i = pila.lastIndexOf(fn);
    if (i >= 0) pila.splice(i, 1);
  };
}

/**
 * Ofrece el atrás al manejador más interno. La carcasa lo llama en
 * cada popstate: si alguien lo consume, ella repone la entrada del
 * historial para no perder profundidad.
 */
export function consumirAtras(): boolean {
  const fn = pila[pila.length - 1];
  if (!fn) return false;
  try {
    return fn();
  } catch {
    return false;
  }
}

/**
 * Engancha una vista interna al botón atrás mientras está abierta:
 * al abrirse empuja su entrada del historial y registra el cierre;
 * al desmontarse o cerrarse, el registro se quita solo. Si el
 * usuario la cierra con el botón en pantalla de la propia vista, la
 * entrada empujada queda vieja y un atrás posterior simplemente la
 * absorbe (la carcasa la ignora), sin efectos visibles.
 */
export function useAtrasInterno(activo: boolean, cerrar: () => void) {
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  useEffect(() => {
    if (!activo) return;
    history.pushState({ clubInterno: true }, '');
    return registrarAtras(() => {
      cerrarRef.current();
      return true;
    });
  }, [activo]);
}
