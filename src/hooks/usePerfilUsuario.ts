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
      ultimaCerrada: null as any,
      historial: [] as any[]
    }
  })
  const [equiposInfo, setEquiposInfo] = useState<any[]>([]) 
  const [niveles, setNiveles] = useState<any[]>([])
  
  // 🚀 NUEVOS ESTADOS PARA REACCIONES
  const [reaccionesRecibidas, setReaccionesRecibidas] = useState<any[]>([])
  const [cargandoReacciones, setCargandoReacciones] = useState(true)
  
  const [cargando, setCargando] = useState(true)
  const [subiendoAvatar, setSubiendoAvatar] = useState(false)
  const [subiendoPortada, setSubiendoPortada] = useState(false) 
  const [guardandoPreferencias, setGuardandoPreferencias] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 🚀 LÓGICA DE REACCIONES (Deduplicadas y Agrupadas)
  const formatearReacciones = (data: any[]) => {
    const reaccionesUnicas = new Map();
    
    // Al iterar (vienen ordenadas por fecha descendente), nos quedamos solo con UNA reacción por usuario
    data.forEach(r => {
      if (!reaccionesUnicas.has(r.emisor_id)) {
        reaccionesUnicas.set(r.emisor_id, {
          id: r.id,
          emisorId: r.emisor_id,
          emoji: r.emoji,
          fecha: r.fecha_envio,
          emisorNombre: r.usuarios?.nombre || 'Anónimo',
          emisorAvatar: r.usuarios?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.usuarios?.nombre || '?')}&background=1e293b&color=3b82f6`
        });
      }
    });

    // Agrupamos por emoji para la UI
    const agrupadas: Record<string, { emoji: string, total: number, usuarios: any[] }> = {};
    Array.from(reaccionesUnicas.values()).forEach((r: any) => {
      if (!agrupadas[r.emoji]) agrupadas[r.emoji] = { emoji: r.emoji, total: 0, usuarios: [] };
      agrupadas[r.emoji].total += 1;
      agrupadas[r.emoji].usuarios.push(r);
    });

    // Retorna ordenadas de mayor a menor cantidad
    return Object.values(agrupadas).sort((a, b) => b.total - a.total);
  }

  const cargarReacciones = async (id: string) => {
    setCargandoReacciones(true)
    try {
      // ⚠️ AHORA FILTRAMOS EXCLUSIVAMENTE POR entidad_tipo = 'perfil'
      const { data, error } = await supabase
        .from('reacciones')
        .select(`
          id,
          emisor_id,
          emoji,
          fecha_envio,
          leida,
          entidad_tipo,
          usuarios!reacciones_emisor_id_fkey (nombre, avatar_url)
        `)
        .eq('receptor_id', id)
        .eq('entidad_tipo', 'perfil') 
        .order('fecha_envio', { ascending: false })

      if (error && error.code !== 'PGRST116') {
        const fallback = await supabase.from('reacciones')
          .select(`id, emisor_id, emoji, fecha_envio, leida, entidad_tipo, usuarios!emisor_id(nombre, avatar_url)`)
          .eq('receptor_id', id)
          .eq('entidad_tipo', 'perfil')
          .order('fecha_envio', { ascending: false });
        if(!fallback.error && fallback.data) setReaccionesRecibidas(formatearReacciones(fallback.data));
      } else if (data) {
        setReaccionesRecibidas(formatearReacciones(data))
      }
    } catch (error) {
      console.error('Error al cargar reacciones:', error)
    } finally {
      setCargandoReacciones(false)
    }
  }

  const alternarReaccion = async (emojiSeleccionado: string, receptorId: string) => {
    if (!usuarioActivo?.id) return;

    try {
      // Verificamos si el usuario ya reaccionó al PERFIL
      const { data: existente } = await supabase
        .from('reacciones')
        .select('*')
        .eq('emisor_id', usuarioActivo.id)
        .eq('receptor_id', receptorId)
        .eq('entidad_tipo', 'perfil')
        .order('fecha_envio', { ascending: false })
        .limit(1)
        .single();

      if (existente) {
        if (existente.emoji === emojiSeleccionado) {
          // Si tocó el mismo emoji consecutivo, lo borramos (Quitar reacción)
          await supabase.from('reacciones').delete().eq('id', existente.id);
        } else {
          // Si tocó un emoji distinto, lo actualizamos
          await supabase.from('reacciones')
            .update({ emoji: emojiSeleccionado, fecha_envio: new Date().toISOString() })
            .eq('id', existente.id);
            
          // Lógica de limpieza preventiva de duplicados viejos
          await supabase.from('reacciones')
            .delete()
            .eq('emisor_id', usuarioActivo.id)
            .eq('receptor_id', receptorId)
            .eq('entidad_tipo', 'perfil')
            .neq('id', existente.id);
        }
      } else {
        // Insertamos nueva reacción
        await supabase.from('reacciones').insert({
          emisor_id: usuarioActivo.id,
          receptor_id: receptorId,
          emoji: emojiSeleccionado,
          entidad_tipo: 'perfil'
        });
      }
      
      cargarReacciones(receptorId);
    } catch (error) {
      console.error('Error alternando reacción:', error);
    }
  }

  useEffect(() => {
    if (usuarioActivo?.id) {
      cargarReacciones(usuarioActivo.id)
    }
  }, [usuarioActivo?.id])

  // TU CARGA PRINCIPAL INTACTA
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

        
        const { data: dataNiveles } = await supabase.from('cat_niveles').select('*')
        if (dataNiveles && isMounted) setNiveles(dataNiveles)

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

        const { data: misTickets, error: ticketsErr } = await supabase
          .from('tickets')
          .select('id, fecha_creacion, quiniela_id, puntos_totales, quinielas(nombre_jornada, estado, fecha_cierre, modalidad, goles_totales_real), pronosticos(eleccion_usuario, partidos(*))')
          .eq('usuario_id', usuarioActivo.id);

        if (ticketsErr) throw ticketsErr;

        if (!misTickets || misTickets.length === 0) {
          if (isMounted) setCargando(false);
          return;
        }

        const totalJugadas = misTickets.length;

        // OBTENER TODOS LOS COMPETIDORES PARA CALCULAR RANKING
        const idsQuinielasJugadas = [...new Set(misTickets.map((t: any) => t.quiniela_id))];
        const { data: todosLosTickets } = await supabase
          .from('tickets')
          .select('usuario_id, quiniela_id, puntos_totales, prediccion_goles_total')
          .in('quiniela_id', idsQuinielasJugadas);

        // ORGANIZAR LA ACTIVIDAD RECIENTE Y RANKING
        const arrEnJuego: any[] = [];
        const arrPorJugar: any[] = [];
        const arrCerradas: any[] = [];
        const ticketsProcesados = new Set<string>();
        
        let oros = 0, platas = 0, bronces = 0;
        let totalCerradas = 0;
        const ahora = new Date().getTime();

        misTickets.sort((a: any, b: any) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());

        misTickets.forEach((t: any) => {
          const q = t.quinielas;
          
          if (q && todosLosTickets) {
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

            if (q.estado === 'cerrada') {
              totalCerradas++;
              if (miIdx === 0) oros++;
              else if (miIdx === 1) platas++;
              else if (miIdx === 2) bronces++;
            }
          }

          if (q && !ticketsProcesados.has(t.id)) {
            ticketsProcesados.add(t.id);

            let ptosEnVivo = 0;

            t.pronosticos?.forEach((pr: any) => {
              if (pr.partidos) {
                const p = pr.partidos;
                p.nombre_local = getNombreEquipo(p.equipo_local);
                p.nombre_visitante = getNombreEquipo(p.equipo_visitante);
                p.logo_local = getLogoEquipo(p.equipo_local);
                p.logo_visitante = getLogoEquipo(p.equipo_visitante);

                // 🚀 CÁLCULO DINÁMICO DE PUNTOS EN VIVO
                if (p.goles_local !== null && p.goles_local !== undefined) {
                  let miTendencia = pr.eleccion_usuario;
                  let aciertoExacto = false;
                  let tendenciaReal = p.resultado_real || (p.goles_local > p.goles_visitante ? 'L' : p.goles_visitante > p.goles_local ? 'V' : 'E');

                  if (miTendencia.includes('-')) {
                    const [ul, uv] = miTendencia.split('-').map(Number);
                    miTendencia = ul > uv ? 'L' : uv > ul ? 'V' : 'E';
                    aciertoExacto = pr.eleccion_usuario === `${p.goles_local}-${p.goles_visitante}`;
                  } else {
                    if (miTendencia === 'LOCAL') miTendencia = 'L';
                    if (miTendencia === 'VISITANTE') miTendencia = 'V';
                    if (miTendencia === 'EMPATE') miTendencia = 'E';
                    aciertoExacto = miTendencia === tendenciaReal;
                  }

                  const esExacto = q.modalidad?.toLowerCase().includes('exacto');
                  if (esExacto) {
                    if (aciertoExacto) ptosEnVivo += 3;
                    else if (miTendencia === tendenciaReal) ptosEnVivo += 1;
                  } else {
                    if (miTendencia === tendenciaReal) ptosEnVivo += 1;
                  }
                }
              }
            });

            if (q.estado !== 'cerrada' || ptosEnVivo > (t.puntos_totales || 0)) {
               t.puntos_totales = ptosEnVivo;
            }

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
              ultimaCerrada,
              historial: arrCerradas.slice(0, 5)
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

  const actualizarPreferencias = async (datos: { nombre?: string, telefono?: string, fecha_nacimiento?: string, equipo_favorito?: string, pais_favorito?: string, biografia?: string }) => {
    try {
      setGuardandoPreferencias(true);
      const { error } = await supabase.from('usuarios').update(datos).eq('id', usuarioActivo.id);
      if (error) throw error;
      setPerfil((prev: any) => ({ ...prev, ...datos }));
      alert('¡Perfil actualizado con éxito!');
      return true;
    } catch (err) {
      alert('Hubo un error al guardar tus datos.');
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

  return { perfil, estadisticas, equiposInfo, niveles, reaccionesRecibidas, alternarReaccion, cargandoReacciones, cargando, subiendoAvatar, subiendoPortada, guardandoPreferencias, error, subirAvatar, subirPortada, actualizarPreferencias, calcularEdad };
}