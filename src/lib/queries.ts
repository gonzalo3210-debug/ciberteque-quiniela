import { supabase } from '@/lib/supabase';

/**
 * ==========================================
 * MÓDULO: CARTELERA Y QUINIELAS ACTIVAS
 * ==========================================
 */

/**
 * Obtiene todas las quinielas abiertas.
 * Filtra automáticamente las jornadas privadas (solo_admins = true) si el usuario NO es admin.
 */
export const obtenerQuinielasActivas = async (rolUsuario?: string) => {
  let consulta = supabase
    .from('quinielas')
    .select(`
      id, nombre_jornada, precio_ticket, fecha_cierre, tipo_premiacion, modalidad, solo_admins,
      partidos (id, equipo_local, equipo_visitante, fecha_hora_partido, resultado_real)
    `)
    .eq('estado', 'abierta')
    .order('fecha_cierre', { ascending: true });

  // 🔥 Filtro de Privacidad Centralizado
  if (rolUsuario !== 'admin') {
    consulta = consulta.neq('solo_admins', true);
  }

  return await consulta;
};


/**
 * ==========================================
 * MÓDULO: POSICIONES Y RANKING
 * ==========================================
 */

/**
 * Obtiene las quinielas recientes junto con TODOS sus partidos y tickets asociados.
 * Gracias a las llaves foráneas, extraemos la jerarquía completa en 1 sola petición.
 */
export const obtenerDatosAnidadosPosiciones = async (rolUsuario?: string, limite: number = 10) => {
  let consulta = supabase
    .from('quinielas')
    .select(`
      *,
      partidos (*),
      tickets (*, pronosticos (*))
    `)
    .order('fecha_cierre', { ascending: false })
    .limit(limite);

  // 🔥 Filtro de Privacidad Centralizado
  if (rolUsuario !== 'admin') {
    consulta = consulta.neq('solo_admins', true);
  }

  return await consulta;
};

/**
 * Obtiene el catálogo básico de usuarios para cruzar nombres y avatares 
 * con los tickets sin necesidad de hacer JOINs pesados en cada consulta.
 */
export const obtenerCatalogoUsuarios = async () => {
  return await supabase
    .from('usuarios')
    .select('id, nombre, avatar_url');
};

/**
 * Obtiene el catálogo de equipos para renderizar logos 
 * en sorteos y partidos.
 */
export const obtenerCatalogoEquipos = async () => {
  return await supabase
    .from('equipos')
    .select('id, nombre, logo_url');
};