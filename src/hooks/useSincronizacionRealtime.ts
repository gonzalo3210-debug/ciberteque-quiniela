import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export function useSincronizacionRealtime(tabla: string, onUpdate: () => void, habilitarNotificacion: boolean = false) {
  useEffect(() => {
    const canal = supabase
      .channel(`sincronizacion-${tabla}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla },
        () => {
          if (habilitarNotificacion) {
            toast('Datos actualizados en tiempo real', { icon: '🔄', duration: 2000 });
          }
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [tabla, onUpdate, habilitarNotificacion]);
}