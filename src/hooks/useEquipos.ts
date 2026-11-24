// src/hooks/useEquipos.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarNombreEquipo } from '@/lib/escudos';

export interface EquipoData {
  id?: string;
  nombre: string;
  liga: string;
  logo_url: string;
  /** ID del equipo en TheSportsDB (idTeam). Con valor, el escudo se
   *  jala de la API y tiene prioridad sobre logo_url (ver
   *  src/lib/escudos.ts). Vacío/null = solo logo manual. */
  id_api?: string | null;
}

// Normaliza un texto para comparar nombres de equipo sin que importen
// mayúsculas, acentos ni espacios repetidos o de sobra.
// (La implementación vive en src/lib/escudos.ts, compartida con la
// resolución de escudos; aquí se mantiene el nombre histórico.)
const normalizarTextoEquipo = normalizarNombreEquipo;

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

      // id_api: texto limpio o null. Si la migración
      // 2026-11-23-equipos-id-api aún no se ha corrido en la base, el
      // guardado con el campo nuevo falla (columna inexistente): se
      // reintenta SIN id_api para no bloquear el registro del equipo,
      // y el ID se podrá capturar cuando la columna exista.
      const datosBase = { nombre: datos.nombre, logo_url: datos.logo_url, liga: datos.liga };
      const datosCompletos = { ...datosBase, id_api: (datos.id_api || '').trim() || null };
      const esErrorColumnaIdApi = (e: { code?: string; message?: string } | null) =>
        !!e && (e.code === 'PGRST204' || /id_api/.test(e.message || ''));

      if (equipoEditandoId) {
        let { error } = await supabase
          .from('equipos')
          .update(datosCompletos)
          .eq('id', equipoEditandoId);
        if (error && esErrorColumnaIdApi(error)) {
          ({ error } = await supabase
            .from('equipos')
            .update(datosBase)
            .eq('id', equipoEditandoId));
        }
        if (error) {
          if (error.code === '23505') throw new Error('Ese equipo ya está registrado.');
          throw error;
        }
      } else {
        let { error } = await supabase
          .from('equipos')
          .insert([datosCompletos]);
        if (error && esErrorColumnaIdApi(error)) {
          ({ error } = await supabase
            .from('equipos')
            .insert([datosBase]));
        }
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