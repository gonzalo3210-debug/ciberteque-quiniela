// src/lib/pushPreferencias.ts
//
// Tipos y constantes COMPARTIDAS de las notificaciones push: las usan
// el cliente (ajustes en Mi Perfil), las rutas /api/push/* y el
// despachador. Sin dependencias de navegador ni de servidor, para que
// cualquiera de los dos lados lo importe sin arrastrar lo del otro.

/** Qué avisos quiere recibir cada jugador (se guarda en jsonb). */
export interface PreferenciasPush {
  /** ⚽ Gol de uno de mis equipos seguidos (Siguiendo ⭐). */
  gol_equipos: boolean;
  /** ⚽ Gol en un partido de una quiniela donde tengo boleto. */
  gol_boleto: boolean;
  /** 👑 Cambios de liderato que me afectan: subo al 1° o me rebasan. */
  liderato: boolean;
  /** ⏰ La quiniela cierra en menos de 2 h y aún no tengo boleto. */
  cierre: boolean;
  /** 🏆 Premio acreditado tras la liquidación. */
  premio: boolean;
  /** 🏁 Terminó un partido de una quiniela donde tengo boleto. */
  fin_partido: boolean;
}

export const PREFERENCIAS_PUSH_DEFECTO: PreferenciasPush = {
  gol_equipos: true,
  gol_boleto: true,
  liderato: true,
  cierre: true,
  premio: true,
  fin_partido: false,
};

const CLAVES_PREF = Object.keys(
  PREFERENCIAS_PUSH_DEFECTO
) as (keyof PreferenciasPush)[];

/** Sanea un objeto cualquiera a PreferenciasPush completas. */
export function sanearPreferencias(valor: unknown): PreferenciasPush {
  const salida: PreferenciasPush = { ...PREFERENCIAS_PUSH_DEFECTO };
  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    for (const clave of CLAVES_PREF) {
      if (typeof obj[clave] === 'boolean') salida[clave] = obj[clave] as boolean;
    }
  }
  return salida;
}

/** Equipo seguido, tal como lo guarda Siguiendo (localStorage). */
export interface EquipoSeguidoPush {
  teamProviderId: string;
  teamName: string;
}

/** Sanea la lista de equipos seguidos que manda el cliente. */
export function sanearEquiposSeguidos(valor: unknown): EquipoSeguidoPush[] {
  if (!Array.isArray(valor)) return [];
  const salida: EquipoSeguidoPush[] = [];
  for (const item of valor.slice(0, 100)) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as EquipoSeguidoPush).teamProviderId === 'string' &&
      typeof (item as EquipoSeguidoPush).teamName === 'string'
    ) {
      salida.push({
        teamProviderId: (item as EquipoSeguidoPush).teamProviderId,
        teamName: (item as EquipoSeguidoPush).teamName,
      });
    }
  }
  return salida;
}

/** Tipos de evento que acepta POST /api/push/despachar. */
export type TipoEventoPush =
  | 'gol_equipo'
  | 'gol_boleto'
  | 'gol_anulado'
  | 'lider_nuevo'
  | 'rebasado'
  | 'fin_partido'
  | 'recordatorio_cierre'
  | 'premio';

/** Evento ya detectado (lo manda el programa de marcadores). */
export interface EventoPush {
  /** Clave única del evento: la base del dedupe (no se reenvía). */
  clave: string;
  tipo: TipoEventoPush;
  titulo: string;
  cuerpo: string;
  /** Ruta interna a abrir al tocar la notificación. */
  url?: string;
  /** Quiniela del evento (audiencia: quienes tienen boleto en ella). */
  quiniela_id?: string;
  /** IDs de proveedor de los equipos del partido (audiencia ⭐). */
  equipo_provider_ids?: string[];
  /** Audiencia explícita (liderato, cierre, premio). */
  usuarios?: string[];
}

/** Preferencia que filtra cada tipo de evento. */
export const PREF_DE_TIPO: Record<TipoEventoPush, keyof PreferenciasPush> = {
  gol_equipo: 'gol_equipos',
  gol_boleto: 'gol_boleto',
  gol_anulado: 'gol_boleto',
  lider_nuevo: 'liderato',
  rebasado: 'liderato',
  fin_partido: 'fin_partido',
  recordatorio_cierre: 'cierre',
  premio: 'premio',
};

export const TIPOS_EVENTO_PUSH: TipoEventoPush[] = Object.keys(
  PREF_DE_TIPO
) as TipoEventoPush[];
