// src/lib/crearJornadaPayload.ts
//
// Construcción PURA de los renglones que se insertan al crear una
// jornada. Vive fuera del hook useCreadorJornadas para que el payload
// sea probable sin base de datos — y porque DOS vistas lo comparten:
// el formulario clásico y el asistente gráfico escriben en el MISMO
// estado del hook y envían con la MISMA función (crearJornadaCompleta),
// así que el payload es idéntico por construcción; estas pruebas lo
// dejan demostrado, no solo afirmado.
//
// Las reglas aquí son las de siempre, copiadas tal cual del hook:
//   - La fecha de cierre se interpreta como hora local del navegador
//     y se guarda en UTC (toISOString).
//   - equipos_sorteo solo viaja en modalidad sorteo (en las demás, []).
//   - Los partidos se ordenan por fecha/hora (los sin fecha, al final)
//     y en sorteo NO se insertan partidos.
//   - Un partido tecleado a mano lleva api_fixture_id null; el
//     importado de la API conserva su enlace.

import type {
  Modalidad,
  PartidoInput,
  TipoPremiacion,
} from '@/hooks/useCreadorJornadas';

/** El estado del formulario de creación, tal como lo guarda el hook. */
export interface FormularioJornada {
  nombreJornada: string;
  /** Texto del input (el hook lo guarda como string). */
  precioTicket: string;
  /** Valor de un input datetime-local: "YYYY-MM-DDTHH:mm". */
  fechaCierre: string;
  tipoPremiacion: TipoPremiacion;
  modalidad: Modalidad;
  soloAdmins: boolean;
  equiposSorteo: string[];
  partidosNuevos: PartidoInput[];
}

/** Renglón para la tabla quinielas (sin id: lo genera la base). */
export interface InsercionQuiniela {
  nombre_jornada: string;
  precio_ticket: number;
  fecha_cierre: string;
  tipo_premiacion: TipoPremiacion;
  estado: 'abierta';
  modalidad: Modalidad;
  solo_admins: boolean;
  equipos_sorteo: string[];
}

/** Renglón para la tabla partidos, sin quiniela_id (nace al insertar). */
export interface InsercionPartido {
  equipo_local: string;
  equipo_visitante: string;
  fecha_hora_partido: string | null;
  api_fixture_id: string | null;
}

export interface PayloadJornada {
  quiniela: InsercionQuiniela;
  /** Vacío en sorteo: esa modalidad no inserta partidos. */
  partidos: InsercionPartido[];
}

/**
 * Arma el payload completo de creación desde el estado del formulario.
 * No valida: la validación (nombre, cierre, 8 equipos) sigue viviendo
 * en crearJornadaCompleta, antes de llamar aquí.
 */
export function construirPayloadJornada(
  formulario: FormularioJornada
): PayloadJornada {
  const quiniela: InsercionQuiniela = {
    nombre_jornada: formulario.nombreJornada,
    precio_ticket: parseInt(formulario.precioTicket),
    fecha_cierre: new Date(formulario.fechaCierre).toISOString(),
    tipo_premiacion: formulario.tipoPremiacion,
    estado: 'abierta',
    modalidad: formulario.modalidad,
    solo_admins: formulario.soloAdmins,
    equipos_sorteo:
      formulario.modalidad === 'sorteo' ? [...formulario.equiposSorteo] : [],
  };

  if (formulario.modalidad === 'sorteo') {
    return { quiniela, partidos: [] };
  }

  const partidosOrdenados = [...formulario.partidosNuevos].sort((a, b) => {
    if (a.fecha_hora && b.fecha_hora)
      return (
        new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
      );
    if (a.fecha_hora && !b.fecha_hora) return -1;
    if (!a.fecha_hora && b.fecha_hora) return 1;
    return 0;
  });

  const partidos: InsercionPartido[] = partidosOrdenados.map((p) => ({
    equipo_local: p.local,
    equipo_visitante: p.visitante,
    fecha_hora_partido: p.fecha_hora
      ? new Date(p.fecha_hora).toISOString()
      : null,
    api_fixture_id: p.api_fixture_id ?? null,
  }));

  return { quiniela, partidos };
}
