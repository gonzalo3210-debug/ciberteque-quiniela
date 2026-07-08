import { supabase } from '@/lib/supabase';

/**
 * Obtiene todas las quinielas abiertas.
 * Si el usuario NO es admin, filtra automáticamente las que tienen solo_admins = true.
 */
export const obtenerQuinielasActivas = async (rolUsuario?: string) => {
  let consulta = supabase
    .from('quinielas')
    .select(`
      id, nombre_jornada, precio_ticket, fecha_cierre, tipo_premiacion, modalidad, solo_admins,
      partidos (id, equipo_local, equipo_visitante, fecha_hora, resultado_real)
    `)
    .eq('estado', 'abierta')
    .order('fecha_cierre', { ascending: true });

  // 🔥 Filtro de Privacidad Centralizado
  if (rolUsuario !== 'admin') {
    consulta = consulta.neq('solo_admins', true);
  }

  return await consulta;
};

// Aquí iremos agregando más consultas en el futuro (ej. obtenerPosiciones, obtenerHistorial, etc.)
// Agrega esto a tu src/lib/queries.ts

/**
 * Obtiene las quinielas para el módulo de posiciones.
 * Filtra jornadas privadas si el usuario no es admin.
 */
export const obtenerQuinielasParaPosiciones = async (rolUsuario?: string) => {
  let consulta = supabase
    .from('quinielas')
    .select(`
      *,
      partidos (*),
      tickets (*, pronosticos (*))
    `)
    .order('fecha_cierre', { ascending: false })
    .limit(10);

  // 🔥 Filtro de Privacidad Centralizado
  if (rolUsuario !== 'admin') {
    consulta = consulta.neq('solo_admins', true);
  }

  return await consulta;
};