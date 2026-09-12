import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function usePerfilUsuario(usuarioActivo: any, onUpdate?: (datos: any) => void) {
  const [perfil, setPerfil] = useState<any>(usuarioActivo)
  const [estadisticas, setEstadisticas] = useState({ 
    jugadas: 0, 
    oros: 0, platas: 0, bronces: 0,
    pctPodios: 0,
    actividad: {
      enJuego: [] as any[],
      porJugar: [] as any[],
      ultimaCerrada: null as any
    }
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

        // CATÁLOGO DE EQUIPOS
        const { data: eqData } = await supabase.from('equipos').select('id, nombre, logo_url, liga');
        const equiposMap = eqData || [];
        if (eqData && isMounted) setEquiposInfo(eqData);

        const getNombreEquipo = (val: any) => {
          if (!val) return 'Desconocido';
          const valStr = String(val).toLowerCase().trim();
          const eq = equiposMap.find((e: any) => e.id === val || (e.nombre && e.nombre.toLowerCase().trim() === valStr));
          return eq?.nombre || val;
        };
        const getLogoEquipo = (val: any) => {
          if (!val) return null;
          const valStr = String(val).toLowerCase().trim();
          const eq = equiposMap.find((e: any) => e.id === val || (e.nombre && e.nombre.toLowerCase().trim() === valStr));
          return eq?.logo_url || null;
        };

        // 🚀 EXTRAER TICKETS COMPLETOS CON goles_totales_real
        const { data: misTickets, error: ticketsErr } = await supabase
          .from('tickets')
          .select('id, fecha_creacion, quiniela_id, puntos_totales, quinielas(nombre_jornada, estado, fecha_cierre, modalidad, goles_totales_real), pronosticos(eleccion_usuario, partidos(resultado_real, goles_local, goles_visitante, equipo_local, equipo_visitante))')
          .eq('usuario_id', usuarioActivo.id);

        if (ticketsErr) throw ticketsErr;

        if (!misTickets || misTickets.length === 0) {
          if (isMounted) setCargando(false);
          return;
        }

        const totalJugadas = misTickets.length;

        // 🚀 OBTENER TODOS LOS COMPETIDORES PARA CALCULAR RANKING
        const idsQuinielasJugadas = [...new Set(misTickets.map((t: any) => t.quiniela_id))];
        const { data: todosLosTickets } = await supabase
          .from('tickets')
          .select('usuario_id, quiniela_id, puntos_totales, prediccion_goles_total')
          .in('quiniela_id', idsQuinielasJugadas);

        // ORGANIZAR LA ACTIVIDAD RECIENTE Y RANKING
        const arrEnJuego: any[] = [];
        const arrPorJugar: any[] = [];
        const arrCerradas: any[] = [];
        const quinielasProcesadas = new Set<string>();
        
        let oros = 0, platas = 0, bronces = 0;
        let totalCerradas = 0;
        const ahora = new Date().getTime();

        misTickets.sort((a: any, b: any) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());

        misTickets.forEach((t: any) => {
          const q = t.quinielas;
          
          if (q && todosLosTickets) {
            // Calcular Ranking de este Ticket
            const competidores = todosLosTickets.filter(ct => ct.quiniela_id === t.quiniela_id);
            const golesReal = q.goles_totales_real || 0;
            
            competidores.sort((a, b) => {
              if (b.puntos_totales !== a.puntos_totales) return (b.puntos_totales || 0) - (a.puntos_totales || 0);
              const diffA = Math.abs((a.prediccion_goles_total || 0) - golesReal);
              const diffB = Math.abs((b.prediccion_goles_total || 0) - golesReal);
              return diffA - diffB;
            });

            const miIdx = competidores.findIndex(ct => ct.usuario_id === usuarioActivo.id);
            t.ranking = { posicion: miIdx >= 0 ? miIdx + 1 : 0, total: competidores.length };

            // Calcular Podios si está cerrada
            if (q.estado === 'cerrada') {
              totalCerradas++;
              if (miIdx === 0) oros++;
              else if (miIdx === 1) platas++;
              else if (miIdx === 2) bronces++;
            }
          }

          if (q && !quinielasProcesadas.has(q.nombre_jornada)) {
            quinielasProcesadas.add(q.nombre_jornada);

            // Inyectamos nombres y logos al ticket
            t.pronosticos?.forEach((pr: any) => {
              if (pr.partidos) {
                pr.partidos.nombre_local = getNombreEquipo(pr.partidos.equipo_local);
                pr.partidos.nombre_visitante = getNombreEquipo(pr.partidos.equipo_visitante);
                pr.partidos.logo_local = getLogoEquipo(pr.partidos.equipo_local);
                pr.partidos.logo_visitante = getLogoEquipo(pr.partidos.equipo_visitante);
              }
            });

            if (q.estado === 'cerrada') {
              arrCerradas.push(t);
            } else {
              const fechaCierre = q.fecha_cierre ? new Date(q.fecha_cierre).getTime() : 0;
              if (fechaCierre > 0 && fechaCierre < ahora) {
                arrEnJuego.push(t);
              } else {
                arrPorJugar.push(t);
              }
            }
          }
        });

        const ultimaCerrada = arrCerradas.length > 0 ? arrCerradas[0] : null;
        const pctPodios = totalCerradas > 0 ? Math.round(((oros + platas + bronces) / totalCerradas) * 100) : 0;

        if (isMounted) {
          setEstadisticas({ 
            jugadas: totalJugadas, 
            oros, platas, bronces, 
            pctPodios,
            actividad: {
              enJuego: arrEnJuego,
              porJugar: arrPorJugar,
              ultimaCerrada
            }
          });
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
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      await supabase.from('usuarios').update({ avatar_url: data.publicUrl }).eq('id', usuarioActivo.id);
      setPerfil((prev: any) => ({ ...prev, avatar_url: data.publicUrl }));
      if (onUpdate) onUpdate({ avatar_url: data.publicUrl }); 
      alert('¡Foto de perfil actualizada!');
    } catch (error: any) {
      alert('Error al subir la imagen.');
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
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const linkPublico = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('usuarios').update({ portada_url: linkPublico }).eq('id', usuarioActivo.id);
      setPerfil((prev: any) => ({ ...prev, portada_url: linkPublico }));
      if (onUpdate) onUpdate({ portada_url: linkPublico });
      alert('¡Foto de portada actualizada!');
    } catch (error: any) {
      alert(`⚠️ Falló la subida de portada.`);
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
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  return { perfil, estadisticas, equiposInfo, cargando, subiendoAvatar, subiendoPortada, guardandoPreferencias, error, subirAvatar, subirPortada, actualizarPreferencias, calcularEdad };
}