// src/hooks/useEquipos.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface EquipoData {
  id?: string;
  nombre: string;
  liga: string;
  logo_url: string;
}

// Normaliza un texto para comparar nombres de equipo sin que importen
// mayúsculas, acentos ni espacios repetidos o de sobra.
// (Mismo criterio de normalización que usa la búsqueda de Mis Jugadas.)
const normalizarTextoEquipo = (valor: string) =>
  (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function useEquipos() {
  const [equipos, setEquipos] = useState<any[]>([]);
  const [cargandoEquipos, setCargandoEquipos] = useState(true);
  const [errorEquipos, setErrorEquipos] = useState<string | null>(null);

  const cargarEquipos = useCallback(async () => {
    setCargandoEquipos(true);
    setErrorEquipos(null);
    try {
      const { data, error: err } = await supabase
        .from('equipos')
        .select('*')
        .order('nombre');
      
      if (err) throw err;
      setEquipos(data || []);
    } catch (err: any) {
      setErrorEquipos(err.message);
      console.error("Error al cargar equipos:", err);
    } finally {
      setCargandoEquipos(false);
    }
  }, []);

  // Carga inicial automática
  useEffect(() => {
    cargarEquipos();
  }, [cargarEquipos]);

  // Función modular para guardar o actualizar
  const guardarEquipo = async (equipoEditandoId: string | null, datos: EquipoData) => {
    try {
      // ⚡ VALIDACIÓN ANTI-DUPLICADOS: la restricción de la BD solo distingue el
      // nombre EXACTO, así que antes se colaban variantes del mismo equipo
      // ("Benfica" / "benfica" / "Bénfica ") como registros distintos.
      // Comparamos el nombre NORMALIZADO dentro de la misma liga y, si ya
      // existe otro registro igual, no guardamos. Al editar se excluye el
      // propio equipo para poder guardar sin cambiar el nombre.
      const { data: existentes } = await supabase
        .from('equipos')
        .select('id, nombre, liga');
      if (existentes) {
        const nombreNorm = normalizarTextoEquipo(datos.nombre);
        const ligaNorm = normalizarTextoEquipo(datos.liga);
        const duplicado = existentes.some(eq =>
          eq.id !== equipoEditandoId &&
          normalizarTextoEquipo(eq.nombre) === nombreNorm &&
          normalizarTextoEquipo(eq.liga || 'Sin Liga') === ligaNorm
        );
        if (duplicado) throw new Error('Ese equipo ya está registrado.');
      }

      if (equipoEditandoId) {
        const { error } = await supabase
          .from('equipos')
          .update({ nombre: datos.nombre, logo_url: datos.logo_url, liga: datos.liga })
          .eq('id', equipoEditandoId);
        if (error) {
          if (error.code === '23505') throw new Error('Ese equipo ya está registrado.');
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('equipos')
          .insert([datos]);
        if (error) {
          if (error.code === '23505') throw new Error('Ese equipo ya está registrado.');
          throw error;
        }
      }
      await cargarEquipos(); // Refrescamos la lista tras guardar
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  return { 
    equipos, 
    cargandoEquipos, 
    errorEquipos, 
    cargarEquipos, 
    guardarEquipo 
  };
}