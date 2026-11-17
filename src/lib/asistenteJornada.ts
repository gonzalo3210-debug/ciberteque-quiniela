// src/lib/asistenteJornada.ts
//
// Lógica PURA del ASISTENTE GRÁFICO de creación de jornadas (admin).
//
// El asistente es una vista alternativa del formulario clásico: ambos
// escriben en el MISMO estado de useCreadorJornadas y publican con la
// MISMA crearJornadaCompleta, así que el payload es el de siempre
// (demostrado en scripts/pruebas-crear-jornada.mjs). Aquí vive lo que
// la vista necesita decidir sin efectos: etiquetas de modalidad y
// premiación, el stepper de precio, qué le falta a la jornada para
// poder crearse y el resumen visual del último paso.

import type {
  FormularioJornada,
  InsercionPartido,
} from '@/lib/crearJornadaPayload';
import type { Modalidad, TipoPremiacion } from '@/hooks/useCreadorJornadas';

export interface EtiquetaOpcion {
  titulo: string;
  descripcion: string;
  icono: string;
}

export const ETIQUETAS_MODALIDAD: Record<Modalidad, EtiquetaOpcion> = {
  clasica: {
    titulo: 'Clásica L / E / V',
    descripcion: 'La de siempre: acierta si gana el local, hay empate o gana la visita.',
    icono: '⚽',
  },
  marcador_exacto: {
    titulo: 'Marcador Exacto',
    descripcion: 'Adivina el marcador: el exacto vale 3 puntos y la tendencia 1.',
    icono: '🎯',
  },
  sorteo: {
    titulo: 'Sorteo · Supervivencia',
    descripcion: 'Sala de 8 pases: el bombo asigna un equipo a cada quien y sobrevive el que siga ganando.',
    icono: '🎲',
  },
};

export const ETIQUETAS_PREMIACION: Record<TipoPremiacion, EtiquetaOpcion> = {
  unico: {
    titulo: 'Ganador Único',
    descripcion: 'Todo el premio (80% de la bolsa) para el 1er lugar.',
    icono: '🏆',
  },
  top2: {
    titulo: 'Top 2',
    descripcion: 'El 80% se reparte 70 / 30 entre 1° y 2°.',
    icono: '🥇',
  },
  top3: {
    titulo: 'Top 3',
    descripcion: 'El 80% se reparte 60 / 25 / 15 entre 1°, 2° y 3°.',
    icono: '🥉',
  },
  promo_unico: {
    titulo: 'Promo · 1 crédito al 1°',
    descripcion: 'Jornada gratis: el 1er lugar gana 1 crédito fijo.',
    icono: '🎁',
  },
  promo_top2: {
    titulo: 'Promo · 1 crédito al 1° y 2°',
    descripcion: 'Jornada gratis: 1 crédito fijo para 1° y 2°.',
    icono: '🎁',
  },
};

/** Los 4 pasos del asistente, en orden. */
export const PASOS_ASISTENTE = [
  'Tu jornada',
  'Partidos',
  'Precio y premio',
  'Resumen',
] as const;

/**
 * El stepper de precio trabaja sobre el MISMO texto que guarda el
 * hook (precioTicket es string): suma/resta sin bajar de 0 y devuelve
 * texto, para que el estado —y por tanto el payload— no cambie de
 * forma. Un texto no numérico se trata como 0.
 */
export function siguientePrecio(actual: string, delta: number): string {
  const numero = parseInt(actual);
  const base = Number.isNaN(numero) ? 0 : numero;
  return String(Math.max(0, base + delta));
}

/** Un renglón de partido cuenta como lleno si trae ambos equipos. */
export function partidoLleno(p: { local: string; visitante: string }): boolean {
  return p.local.trim() !== '' && p.visitante.trim() !== '';
}

/** Renglón tocado pero a medias: un equipo sí y el otro no. */
export function partidoAMedias(p: {
  local: string;
  visitante: string;
}): boolean {
  return (p.local.trim() === '') !== (p.visitante.trim() === '');
}

export type CampoFaltante = 'nombre' | 'cierre' | 'partidos' | 'bombo';

export interface FaltanteAsistente {
  campo: CampoFaltante;
  mensaje: string;
}

/**
 * Qué le falta a la jornada para poder publicarse desde el asistente.
 * Incluye las guardas de siempre de crearJornadaCompleta (nombre,
 * cierre y, en sorteo, exactamente 8 equipos) y UNA guarda extra de
 * puro sentido común del asistente: en modos por puntos pide al menos
 * un partido completo y ningún renglón a medias (el formulario
 * clásico no la tiene y no se le agregó: su camino queda intacto).
 */
export function faltantesAsistente(
  formulario: FormularioJornada
): FaltanteAsistente[] {
  const faltantes: FaltanteAsistente[] = [];
  if (formulario.nombreJornada.trim() === '') {
    faltantes.push({ campo: 'nombre', mensaje: 'Ponle nombre a la jornada.' });
  }
  if (formulario.fechaCierre === '') {
    faltantes.push({
      campo: 'cierre',
      mensaje: 'Elige la fecha y hora de cierre.',
    });
  }
  if (formulario.modalidad === 'sorteo') {
    if (formulario.equiposSorteo.length !== 8) {
      faltantes.push({
        campo: 'bombo',
        mensaje: `El bombo lleva ${formulario.equiposSorteo.length}/8 equipos: elige exactamente 8.`,
      });
    }
  } else {
    if (formulario.partidosNuevos.some(partidoAMedias)) {
      faltantes.push({
        campo: 'partidos',
        mensaje: 'Hay un partido a medias: complétalo o quítalo.',
      });
    } else if (!formulario.partidosNuevos.some(partidoLleno)) {
      faltantes.push({
        campo: 'partidos',
        mensaje: 'Agrega al menos un partido.',
      });
    }
  }
  return faltantes;
}

/** ¿El paso indicado ya está completo para poder avanzar? */
export function pasoCompleto(
  formulario: FormularioJornada,
  paso: number
): boolean {
  const faltantes = faltantesAsistente(formulario);
  switch (paso) {
    case 0:
      return !faltantes.some(
        (f) => f.campo === 'nombre' || f.campo === 'cierre'
      );
    case 1:
      return !faltantes.some(
        (f) => f.campo === 'partidos' || f.campo === 'bombo'
      );
    default:
      // Precio/premiación siempre traen valores del estado (como en el
      // clásico) y el resumen es el destino final: no bloquean.
      return true;
  }
}

export interface ResumenAsistente {
  nombre: string;
  modalidad: EtiquetaOpcion;
  premiacion: EtiquetaOpcion;
  precio: number;
  soloAdmins: boolean;
  /** Partidos listos para insertar (los mismos del payload), en orden. */
  partidos: InsercionPartido[];
  /** Nombres de los equipos del bombo, en el orden elegido. */
  equiposBombo: string[];
}

/**
 * Lo que muestra la tarjeta de resumen: se alimenta del constructor
 * del payload para que lo que el admin ve sea EXACTAMENTE lo que se
 * va a insertar (mismo orden de partidos, mismos equipos del bombo).
 */
export function resumenAsistente(
  formulario: FormularioJornada,
  payload: { partidos: InsercionPartido[] },
  equipos: { id: string; nombre: string }[]
): ResumenAsistente {
  const nombrePorId = new Map(equipos.map((e) => [e.id, e.nombre]));
  const precio = parseInt(formulario.precioTicket);
  return {
    nombre: formulario.nombreJornada,
    modalidad: ETIQUETAS_MODALIDAD[formulario.modalidad],
    premiacion: ETIQUETAS_PREMIACION[formulario.tipoPremiacion],
    precio: Number.isNaN(precio) ? 0 : precio,
    soloAdmins: formulario.soloAdmins,
    partidos: payload.partidos,
    equiposBombo:
      formulario.modalidad === 'sorteo'
        ? formulario.equiposSorteo.map(
            (id) => nombrePorId.get(id) || 'Equipo'
          )
        : [],
  };
}
