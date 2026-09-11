import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function usePerfilUsuario(usuarioActivo: any, onUpdate?: (datos: any) => void) {
  const [perfil, setPerfil] = useState<any>(usuarioActivo)
  const [estadisticas, setEstadisticas] = useState({ 
    jugadas: 0, 
    tendenciaTotal: 0, 
    tendenciaAciertos: 0, 
    exactosTotal: 0, 
    exactosAciertos: 0, 
    oros: 0, platas: 0, bronces: 0 
  })
  const [equiposInfo, setEquiposInfo] = useState<any[]>([]) 
  const [cargando, setCargando] = useState(true)
  
  const [subiendoAvatar, setSubiendoAvatar] = useState(false)
  const [subiendoPortada, setSubiendoPortada] = useState(false) 
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
          .select('*') 
          .eq('id', usuarioActivo.id)
          .single();
          
        if (userErr) throw userErr;

        // CÁLCULO DE GANANCIAS
        const { data: txData } = await supabase
          .from('transacciones_creditos')
          .select('cantidad, descripcion')
          .eq('usuario_id', usuarioActivo.id)
          .gt('cantidad', 0); 

        if (txData) {
          userData.total_ganado = txData
            .filter((tx: any) => tx.descripcion && tx.descripcion.toUpperCase().includes('PREMIO'))
            .reduce((suma: number, tx: any) => suma + tx.cantidad, 0);
        }

        if (isMounted) setPerfil(userData);

        const { data: eqData } = await supabase.from('equipos').select('id, nombre, logo_url, liga');
        if (eqData && isMounted) setEquiposInfo(eqData);

        // EXTRAER TICKETS PARA ESTADÍSTICAS DETALLADAS
        const { data: misTickets } = await supabase
          .from('tickets')
          .select('quiniela_id, puntos_totales, quinielas(modalidad), pronosticos(eleccion_usuario, partidos(resultado_real, goles_local, goles_visitante))')
          .eq('usuario_id', usuarioActivo.id);

        if (!misTickets || misTickets.length === 0) {
          if (isMounted) setCargando(false);
          return;
        }

        const totalJugadas = misTickets.length;
        let tendenciaTotal = 0;
        let tendenciaAciertos = 0;
        let exactosTotal = 0;
        let exactosAciertos = 0;

        misTickets.forEach((t: any) => {
          const mod = t.quinielas?.modalidad;
          if (mod === 'sorteo' || !mod) return; 

          t.pronosticos?.forEach((pr: any) => {
            const p = pr.partidos;
            if (p && p.resultado_real !== null && p.goles_local !== null && p.goles_visitante !== null) {
              tendenciaTotal++;
              let userTendency = pr.eleccion_usuario;
              let matchExacto = false;

              if (userTendency.includes('-')) {
                const [ul, uv] = userTendency.split('-').map(Number);
                if (ul > uv) userTendency = 'LOCAL';
                else if (uv > ul) userTendency = 'VISITANTE';
                else userTendency = 'EMPATE';

                if (pr.eleccion_usuario === `${p.goles_local}-${p.goles_visitante}`) {
                  matchExacto = true;
                }
              }

              if (userTendency === p.resultado_real) {
                tendenciaAciertos++;
              }

              if (mod === 'marcador_exacto') {
                exactosTotal++;
                if (matchExacto) exactosAciertos++;
              }
            }
          });
        });

        // CÁLCULO DE PODIOS
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
          setEstadisticas({ jugadas: totalJugadas, tendenciaTotal, tendenciaAciertos, exactosTotal, exactosAciertos, oros, platas, bronces });
        }

      } catch (err: any) {
        console.error("Error cargando perfil completo:", err);
        if (isMounted) setError('No pudimos cargar toda tu información.');
      } finally {
        if (isMounted) setCargando(false);
      }
    }

    cargarDatosFull();
    return () => { isMounted = false; }
  }, [usuarioActivo?.id]);

  const subirAvatar = async (e: any) => {
    try {
      setSubiendoAvatar(true);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop() || 'jpg';
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
      
      alert('¡Foto de perfil actualizada!');
    } catch (error: any) {
      alert('Error al subir la imagen.');
      console.error(error);
    } finally {
      setSubiendoAvatar(false);
      if(e.target) e.target.value = ''; 
    }
  };

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
      const linkPublico = `${data.publicUrl}?t=${Date.now()}`;

      await supabase.from('usuarios').update({ portada_url: linkPublico }).eq('id', usuarioActivo.id);
      
      setPerfil((prev: any) => ({ ...prev, portada_url: linkPublico }));
      if (onUpdate) onUpdate({ portada_url: linkPublico });
      
      alert('¡Foto de portada actualizada!');
    } catch (error: any) {
      alert(`⚠️ Falló la subida de portada.`);
      console.error(error);
    } finally {
      setSubiendoPortada(false);
      if(e.target) e.target.value = ''; 
    }
  };

  const actualizarPreferencias = async (datos: { fecha_nacimiento: string, equipo_favorito: string, pais_favorito: string, biografia: string }) => {
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