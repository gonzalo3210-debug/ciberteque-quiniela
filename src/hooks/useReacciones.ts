'use client'
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Reaccion {
  id: string;
  emisor_id: string;
  receptor_id: string;
  emoji: string;
  entidad_tipo: 'jugada' | 'partido' | 'posicion';
  entidad_id?: string;
  leida: boolean;
  fecha_envio: string;
  emisor?: {
    nombre: string;
    avatar_url: string | null;
  };
}

export function useReacciones() {
  const { usuario } = useAuth();
  const [reaccionesNoLeidas, setReaccionesNoLeidas] = useState<Reaccion[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorReaccion, setErrorReaccion] = useState<string | null>(null);

  // 🚀 Acción: Enviar, Cambiar o Quitar reacción (Lógica tipo Facebook)
  const enviarReaccion = useCallback(async (
    receptorId: string, 
    emoji: string, 
    entidadTipo: 'jugada' | 'partido' | 'posicion', 
    entidadId?: string
  ) => {
    if (!usuario?.id) {
      setErrorReaccion("Debes iniciar sesión para reaccionar.");
      return;
    }

    setEnviando(true);
    setErrorReaccion(null);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!receptorId || !uuidRegex.test(receptorId)) {
      setErrorReaccion("Error: El ID del destinatario no es válido.");
      setEnviando(false);
      return;
    }
    
    try {
      // 🔥 INGENIERÍA: Usamos .limit(1) en lugar de .maybeSingle() para evitar 
      // crasheos si quedaron reacciones duplicadas de pruebas anteriores.
      const { data: existentes, error: fetchError } = await supabase
        .from('reacciones')
        .select('id, emoji')
        .eq('emisor_id', usuario.id)
        .eq('entidad_id', entidadId)
        .eq('entidad_tipo', entidadTipo)
        .limit(1);

      if (fetchError) throw fetchError;

      // Extraemos el primer resultado si existe
      const existente = existentes && existentes.length > 0 ? existentes[0] : null;

      if (existente) {
        if (existente.emoji === emoji) {
          // Si es el mismo emoji, se lo QUITAMOS (Unlike)
          const { error: deleteError } = await supabase
            .from('reacciones')
            .delete()
            .eq('id', existente.id);
            
          if (deleteError) throw deleteError;
        } else {
          // Si es distinto, lo ACTUALIZAMOS (Change)
          const { error: updateError } = await supabase
            .from('reacciones')
            .update({ emoji, leida: false, fecha_envio: new Date().toISOString() })
            .eq('id', existente.id);
            
          if (updateError) throw updateError;
        }
      } else {
        // Si no existe, lo INSERTAMOS (Like)
        const { error: insertError } = await supabase
          .from('reacciones')
          .insert([
            { 
              emisor_id: usuario.id, 
              receptor_id: receptorId, 
              emoji,
              entidad_tipo: entidadTipo,
              entidad_id: entidadId,
              leida: false
            }
          ]); 
          
        if (insertError) throw insertError;
      }
      
    } catch (error: any) {
      const mensajeReal = error?.message || error?.details || JSON.stringify(error);
      console.error("Detalle técnico del error al guardar reacción:", mensajeReal);
      setErrorReaccion(mensajeReal || 'Error al conectar con la base de datos');
    } finally {
      setEnviando(false);
    }
  }, [usuario?.id]);

  // 📥 Acción: Recuperar reacciones pendientes
  const cargarReaccionesPendientes = useCallback(async (silencioso = false) => {
    if (!usuario?.id) return;

    if (!silencioso) setCargando(true);
    
    try {
      const { data, error } = await supabase
        .from('reacciones')
        .select(`
          *,
          emisor:usuarios!reacciones_emisor_id_fkey(nombre, avatar_url)
        `)
        .eq('receptor_id', usuario.id)
        .eq('leida', false)
        .order('fecha_envio', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setReaccionesNoLeidas(data as Reaccion[]);
      }
    } catch (error) {
      console.error("Error al cargar reacciones pendientes:", error);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [usuario?.id]);

  // ✅ Acción: Marcar como leídas
  const marcarComoLeidas = useCallback(async (reaccionesIds: string[]) => {
    if (reaccionesIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('reacciones')
        .update({ leida: true })
        .in('id', reaccionesIds);

      if (error) throw error;
      
      setReaccionesNoLeidas(prev => prev.filter(r => !reaccionesIds.includes(r.id)));
    } catch (error) {
      console.error("Error al marcar reacciones como leídas:", error);
    }
  }, []);

  // 🔌 CONEXIÓN EN TIEMPO REAL
  useEffect(() => {
    if (!usuario?.id) return;

    cargarReaccionesPendientes();

    const canalId = `canal_${usuario.id}_${Date.now()}`;

    const canalReacciones = supabase
      .channel(canalId)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'reacciones',
          filter: `receptor_id=eq.${usuario.id}`,
        },
        () => {
          cargarReaccionesPendientes(true);
        }
      )
      .subscribe(); 

    return () => {
      supabase.removeChannel(canalReacciones);
    };
  }, [usuario?.id, cargarReaccionesPendientes]);

  return { 
    enviarReaccion, 
    cargarReaccionesPendientes, 
    marcarComoLeidas,
    reaccionesNoLeidas, 
    enviando,
    cargando, 
    errorReaccion 
  };
}