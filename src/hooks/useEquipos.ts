// src/hooks/useEquipos.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface EquipoData {
  id?: string;
  nombre: string;
  liga: string;
  logo_url: string;
}

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
      if (equipoEditandoId) {
        const { error } = await supabase
          .from('equipos')
          .update({ nombre: datos.nombre, logo_url: datos.logo_url, liga: datos.liga })
          .eq('id', equipoEditandoId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('equipos')
          .insert([datos]);
        if (error) {
          if (error.code === '23505') throw new Error('Este equipo ya está registrado.');
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