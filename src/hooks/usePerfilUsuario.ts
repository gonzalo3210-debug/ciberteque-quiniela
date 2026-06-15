import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function usePerfilUsuario(usuarioActivo: any, onUpdate?: (datos: any) => void) {
  const [perfil, setPerfil] = useState<any>(usuarioActivo)
  const [estadisticas, setEstadisticas] = useState({ jugadas: 0, aciertos: 0, seleccionesTotales: 0, oros: 0, platas: 0, bronces: 0 })
  const [equiposInfo, setEquiposInfo] = useState<any[]>([]) 
  const [cargando, setCargando] = useState(true)
  
  const [subiendoAvatar, setSubiendoAvatar] = useState(false)
  const [subiendoPortada, setSubiendoPortada] = useState(false) // 🆕 ESTADO DE LA PORTADA
  const [guardandoPreferencias, setGuardandoPreferencias] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true;
    
    async function cargarDatosFull() {
      if (!usuarioActivo?.id) {
        if (isMounted) setCargando(false);
        return;
      }

      setCargando(true);
      setError(null);

      try {
        const { data: userData, error: userErr } = await supabase
          .from('usuarios')
          .select('*') // Trae todo, incluyendo campos nulos y portada_url
          .eq('id', usuarioActivo.id)
          .single();
          
        if (userErr) throw userErr;
        if (isMounted) setPerfil(userData);

        const { data: eqData } = await supabase.from('equipos').select('id, nombre, logo_url, liga');
        if (eqData && isMounted) setEquiposInfo(eqData);

        const { data: misTickets } = await supabase
          .from('tickets')
          .select('quiniela_id, puntos_totales, pronosticos(partidos(resultado_real))')
          .eq('usuario_id', usuarioActivo.id);

        if (!misTickets || misTickets.length === 0) {
          if (isMounted) setCargando(false);
          return;
        }

        const totalJugadas = misTickets.length;
        let totalAciertos = 0;
        let seleccionesCalificadas = 0;

        misTickets.forEach((t: any) => {
          totalAciertos += (t.puntos_totales || 0);
          if (t.pronosticos) {
            t.pronosticos.forEach((pr: any) => {
              if (pr.partidos && pr.partidos.resultado_real !== null) seleccionesCalificadas++;
            });
          }
        });

        let oros = 0, platas = 0, bronces = 0;
        const idsQuinielasJugadas = [...new Set(misTickets.map((t: any) => t.quiniela_id))];

        const { data: quinielasCerradas } = await supabase
          .from('quinielas')
          .select('id, goles_totales_real')
          .in('id', idsQuinielasJugadas)
          .eq('estado', 'cerrada')
          .not('goles_totales_real', 'is', null);

        if (quinielasCerradas && quinielasCerradas.length > 0) {
          const idsCerradas = quinielasCerradas.map(q => q.id);
          const { data: todosLosTickets } = await supabase
            .from('tickets')
            .select('usuario_id, quiniela_id, puntos_totales, prediccion_goles_total')
            .in('quiniela_id', idsCerradas);

          if (todosLosTickets) {
            quinielasCerradas.forEach(quiniela => {
              const competidores = todosLosTickets.filter(t => t.quiniela_id === quiniela.id);
              competidores.sort((a, b) => {
                if (b.puntos_totales !== a.puntos_totales) return (b.puntos_totales || 0) - (a.puntos_totales || 0);
                const diffA = Math.abs((a.prediccion_goles_total || 0) - quiniela.goles_totales_real);
                const diffB = Math.abs((b.prediccion_goles_total || 0) - quiniela.goles_totales_real);
                return diffA - diffB;
              });

              const miPosicion = competidores.findIndex(t => t.usuario_id === usuarioActivo.id);
              if (miPosicion === 0) oros++;
              else if (miPosicion === 1) platas++;
              else if (miPosicion === 2) bronces++;
            });
          }
        }

        if (isMounted) {
          setEstadisticas({ jugadas: totalJugadas, aciertos: totalAciertos, seleccionesTotales: seleccionesCalificadas, oros, platas, bronces });
        }

      } catch (err: any) {
        const mensajeReal = err?.message || err?.details || err?.hint || JSON.stringify(err);
        console.error("Error cargando perfil completo:", mensajeReal, err);
        if (isMounted) setError('No pudimos cargar toda tu información. Intenta recargar la página.');
      } finally {
        if (isMounted) setCargando(false);
      }
    }

    cargarDatosFull();
    return () => { isMounted = false; }
  }, [usuarioActivo?.id]);

  // 📷 SUBIR FOTO DE PERFIL BLINDADA ANTI-CACHÉ
  const subirAvatar = async (e: any) => {
    try {
      setSubiendoAvatar(true);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop() || 'jpg';
      // 🔥 BLINDAJE: Usamos Date.now() para que Supabase no cachee la imagen anterior
      const filePath = `avatar_${usuarioActivo.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const linkPublico = data.publicUrl;

      await supabase.from('usuarios').update({ avatar_url: linkPublico }).eq('id', usuarioActivo.id);
      
      setPerfil((prev: any) => ({ ...prev, avatar_url: linkPublico }));
      if (onUpdate) onUpdate({ avatar_url: linkPublico }); 
      
      alert('¡Foto de perfil actualizada con éxito!');
    } catch (error: any) {
      alert('Error al subir la imagen. Asegúrate de que pesa menos de 2MB.');
      console.error(error);
    } finally {
      setSubiendoAvatar(false);
      if(e.target) e.target.value = ''; // Reseteamos input
    }
  };

  // 🖼️ SUBIR FOTO DE PORTADA BLINDADA ANTI-CACHÉ
  const subirPortada = async (e: any) => {
    try {
      setSubiendoPortada(true);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop() || 'jpg';
      const filePath = `portada_${usuarioActivo.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      // 🔥 FIX CLAVE: Forzamos el timestamp directo en la URL que se guarda
      const linkPublico = `${data.publicUrl}?t=${Date.now()}`;

      // Guardamos en el cajón de la BD
      const { error: dbError } = await supabase.from('usuarios').update({ portada_url: linkPublico }).eq('id', usuarioActivo.id);
      if (dbError) throw dbError;
      
      // 🔥 FIX CLAVE: Sincronizamos localmente y con la app padre
      setPerfil((prev: any) => ({ ...prev, portada_url: linkPublico }));
      if (onUpdate) onUpdate({ portada_url: linkPublico });
      
      alert('¡Foto de portada actualizada con éxito!');
    } catch (error: any) {
      const msg = error.message || error.details || 'Error desconocido';
      alert(`⚠️ Falló la subida de portada: ${msg}`);
      console.error("Detalle del error al subir portada:", error);
    } finally {
      setSubiendoPortada(false);
      if(e.target) e.target.value = ''; // Reseteamos input
    }
  };

  const actualizarPreferencias = async (datos: { fecha_nacimiento: string, equipo_favorito: string, pais_favorito: string }) => {
    try {
      setGuardandoPreferencias(true);
      const { error } = await supabase.from('usuarios').update(datos).eq('id', usuarioActivo.id);
      if (error) throw error;

      setPerfil((prev: any) => ({ ...prev, ...datos }));
      alert('¡Preferencias actualizadas con éxito!');
      return true;
    } catch (err) {
      alert('Hubo un error al guardar tus preferencias.');
      console.error(err);
      return false;
    } finally {
      setGuardandoPreferencias(false);
    }
  };

  const calcularEdad = (fechaNacimiento: string | null) => {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    return edad;
  };

  return { 
    perfil, 
    estadisticas, 
    equiposInfo, 
    cargando, 
    subiendoAvatar, 
    subiendoPortada, 
    guardandoPreferencias, 
    error, 
    subirAvatar, 
    subirPortada, 
    actualizarPreferencias, 
    calcularEdad 
  };
}