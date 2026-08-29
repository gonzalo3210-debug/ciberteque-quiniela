'use client'
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useNotificaciones() {
  const { usuario, cargandoSesion } = useAuth(); 
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [noLeidas, setNoLeidas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarNotificaciones = useCallback(async () => {
    if (cargandoSesion) return;

    if (!usuario || !usuario.id) {
      setCargando(false);
      return;
    }

    setCargando(true);

    const { data: notifs, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_receptor_id', usuario.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error al cargar notificaciones:", error);
      setCargando(false);
      return;
    }

    if (notifs && notifs.length > 0) {
      const emisorIds = notifs.map(n => n.usuario_emisor_id).filter(id => id);
      const uniqueEmisorIds = [...new Set(emisorIds)];

      if (uniqueEmisorIds.length > 0) {
        const { data: emisores } = await supabase
          .from('usuarios')
          .select('id, nombre, avatar_url')
          .in('id', uniqueEmisorIds);

        notifs.forEach(n => {
          if (n.usuario_emisor_id && emisores) {
            n.emisor = emisores.find(e => e.id === n.usuario_emisor_id) || null;
          }
        });
      }

      setNotificaciones(notifs);
      setNoLeidas(notifs.filter(n => !n.leida));
    } else {
      setNotificaciones([]);
      setNoLeidas([]);
    }

    setCargando(false);
  }, [usuario, cargandoSesion]);

  useEffect(() => {
    cargarNotificaciones();

    let channel: any;
    
    if (usuario && usuario.id) {
      channel = supabase.channel(`canal_notificaciones_vivo_${usuario.id}`)
        .on('postgres_changes', {
          event: '*', 
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_receptor_id=eq.${usuario.id}`
        }, () => {
          cargarNotificaciones();
        })
        .subscribe();
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [usuario, cargarNotificaciones]);

  const marcarComoLeidas = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setNoLeidas(prev => prev.filter(n => !ids.includes(n.id)));
    setNotificaciones(prev => prev.map(n => ids.includes(n.id) ? { ...n, leida: true } : n));
    await supabase.from('notificaciones').update({ leida: true }).in('id', ids);
  };

  // 🗑️ NUEVA FUNCIÓN PARA BORRADO TOTAL
  const limpiarTodasLasNotificaciones = async () => {
    if (!usuario || !usuario.id) return;
    
    // Eliminación optimista en pantalla
    setNotificaciones([]);
    setNoLeidas([]);
    
    // Borrado físico en Supabase
    await supabase.from('notificaciones').delete().eq('usuario_receptor_id', usuario.id);
  };

  return { notificaciones, noLeidas, cargando, cargarNotificaciones, marcarComoLeidas, limpiarTodasLasNotificaciones };
}