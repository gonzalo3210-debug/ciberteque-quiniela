// src/hooks/usePosiciones.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { obtenerDatosAnidadosPosiciones, obtenerCatalogoUsuarios, obtenerCatalogoEquipos } from '@/lib/queries'
import { useAuth } from '@/contexts/AuthContext' 

export function usePosiciones(rolUsuario?: string) {
  const { usuario } = useAuth(); 
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]) 
  const [quinielaActiva, setQuinielaActiva] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const PORCENTAJE_PREMIO = 0.80 

  const cargarDatos = useCallback(async (esCargaSilenciosa = false) => {
    if (!esCargaSilenciosa) setCargando(true)
    setErrorCarga(null)

    try {
      const { data: qData, error: qError } = await obtenerDatosAnidadosPosiciones(rolUsuario, 10);
      if (qError) throw qError;

      if (!qData || qData.length === 0) {
        setCargando(false)
        return
      }

      const todosLosTickets = qData.flatMap((q: any) => q.tickets || []);
      const ticketIds = todosLosTickets.map((t: any) => t.id);

      const [ 
        { data: uData, error: uError }, 
        { data: eData, error: eError },
        { data: rData } 
      ] = await Promise.all([
        obtenerCatalogoUsuarios(),
        obtenerCatalogoEquipos(),
        ticketIds.length > 0 
          ? supabase.from('reacciones').select('*').in('entidad_id', ticketIds).eq('entidad_tipo', 'jugada')
          : Promise.resolve({ data: [] })
      ]);

      if (uError) throw uError;
      if (eError) throw eError;
      
      const mapaUsuarios: Record<string, { nombre: string, avatar_url: string | null }> = {}
      if (uData) uData.forEach(u => mapaUsuarios[u.id] = { nombre: u.nombre, avatar_url: u.avatar_url })

      const mapaEquipos: Record<string, any> = {}
      if (eData) eData.forEach(e => mapaEquipos[e.id] = e)

      const mapaReacciones: Record<string, Record<string, {count: number, me: boolean, usuarios: any[]}>> = {};
      
      if (rData && Array.isArray(rData)) {
        rData.forEach((r: any) => {
          const tId = r.entidad_id;
          const emj = r.emoji;

          if (!mapaReacciones[tId]) mapaReacciones[tId] = {};
          if (!mapaReacciones[tId][emj]) {
            mapaReacciones[tId][emj] = { count: 0, me: false, usuarios: [] };
          }
          
          mapaReacciones[tId][emj].count += 1;
          
          const esMio = r.emisor_id === usuario?.id;
          if (esMio) {
            mapaReacciones[tId][emj].me = true; 
          }

          const emisorData = mapaUsuarios[r.emisor_id] || { nombre: 'Anónimo', avatar_url: null };
          
          mapaReacciones[tId][emj].usuarios.push({
            nombre: esMio ? 'Tú' : emisorData.nombre,
            avatar_url: emisorData.avatar_url
          });
        });
      }

      const getLEV = (marcador: string) => {
        if (!marcador) return null;
        const limpio = marcador.replace(/\s+/g, '').toUpperCase();
        if (['L', 'E', 'V'].includes(limpio)) return limpio;
        if (limpio.includes('-')) {
          const [l, v] = limpio.split('-').map(Number);
          if (!isNaN(l) && !isNaN(v)) {
            if (l > v) return 'L';
            if (l < v) return 'V';
            return 'E';
          }
        }
        return null;
      }

      const quinielasProcesadas = qData.map(q => {
        const partidosQ = [...(q.partidos || [])].sort((a: any, b: any) => {
          const tiempoA = new Date(a.fecha_hora_partido || a.fecha_hora || 0).getTime();
          const tiempoB = new Date(b.fecha_hora_partido || b.fecha_hora || 0).getTime();
          return tiempoA - tiempoB;
        });

        const ticketsQ = q.tickets || []

        const ranking = ticketsQ.map((ticket: any) => {
          let puntos = 0
          const aciertos: Record<string, string> = {}
          const pronosticosTicket = ticket.pronosticos || [] 

          if (q.modalidad !== 'sorteo') {
            pronosticosTicket.forEach((pron: any) => {
              const partido = partidosQ.find((p: any) => p.id === pron.partido_id)
              if (partido) {
                const tieneResultado = partido.resultado_real !== null || (partido.goles_local !== null && partido.goles_visitante !== null);
                
                if (tieneResultado) {
                  const pickStr = pron.eleccion_usuario?.replace(/\s+/g, '') || '';
                  let realStr = '';
                  
                  if (partido.goles_local !== null && partido.goles_visitante !== null) {
                    realStr = `${partido.goles_local}-${partido.goles_visitante}`;
                  } else {
                    realStr = partido.resultado_real?.replace(/\s+/g, '') || '';
                  }

                  if (pickStr === realStr) {
                    puntos += (q.modalidad === 'marcador_exacto' ? 3 : 1);
                    aciertos[pron.partido_id] = 'acierto_exacto';
                  } else {
                    const pickLEV = getLEV(pickStr);
                    const realLEV = getLEV(realStr) || getLEV(partido.resultado_real);
                    
                    if (pickLEV && realLEV && pickLEV === realLEV) {
                      puntos += 1;
                      aciertos[pron.partido_id] = 'acierto_lev';
                    } else {
                      aciertos[pron.partido_id] = 'fallo';
                    }
                  }
                } else {
                  aciertos[pron.partido_id] = 'pendiente';
                }
              }
            })
          }

          const golesReales = q.goles_totales_real !== null ? q.goles_totales_real : -1
          const golesDiff = golesReales !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesReales) : 999

          const userData = mapaUsuarios[ticket.usuario_id] || { nombre: 'Jugador de Mostrador', avatar_url: null }
          const equipoAsignado = ticket.equipo_asignado_id ? mapaEquipos[ticket.equipo_asignado_id] : null

          return {
            id: ticket.id,
            usuario_id: ticket.usuario_id, 
            nombre: userData.nombre,
            avatar_url: userData.avatar_url,
            prediccionGoles: ticket.prediccion_goles_total || 0,
            puntos: q.modalidad === 'sorteo' ? ticket.puntos_totales : puntos,
            aciertos,
            golesDiff,
            pronosticos: pronosticosTicket,
            equipoAsignado,
            conteoReacciones: mapaReacciones[ticket.id] || {}, 
            estaEliminado: q.modalidad === 'sorteo' && ticket.puntos_totales < 0
          }
        })

        if (q.modalidad === 'sorteo') {
           ranking.sort((a, b) => {
              if (a.estaEliminado === b.estaEliminado) return 0;
              return a.estaEliminado ? 1 : -1;
           });
        } else {
           ranking.sort((a, b) => {
             if (b.puntos !== a.puntos) return b.puntos - a.puntos
             return a.golesDiff - b.golesDiff
           })
        }

        ranking.forEach((item: any, idx) => {
          if (q.modalidad === 'sorteo') {
             item.posicion = idx + 1; 
          } else {
             if (idx > 0) {
               const anterior = ranking[idx - 1];
               if (item.puntos === anterior.puntos && item.golesDiff === anterior.golesDiff) {
                 item.posicion = anterior.posicion; 
               } else {
                 item.posicion = idx + 1; 
               }
             } else {
               item.posicion = 1;
             }
          }
        });

        const precioTicketMXN = q.precio_ticket ?? 30 
        const totalBoletos = ranking.length
        const recaudadoPesos = totalBoletos * precioTicketMXN
        const premioPesos = recaudadoPesos * PORCENTAJE_PREMIO

        return { 
          ...q, 
          ranking, 
          partidos: partidosQ, 
          recaudadoPesos, 
          premioPesos 
        }
      })

      const activas = quinielasProcesadas
        .filter(q => q.estado === 'abierta' || (q.estado === 'cerrada' && q.goles_totales_real === null && q.modalidad !== 'sorteo') || (q.estado === 'abierta' && q.modalidad === 'sorteo'))
        .sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime())

      const pasadas = quinielasProcesadas
        .filter(q => (q.estado === 'cerrada' && q.goles_totales_real !== null) || (q.estado === 'cerrada' && q.modalidad === 'sorteo'))
        .sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime())

      setQuinielasAbiertas(activas)
      setHistorial(pasadas)

      setQuinielaActiva((prevActiva) => {
        if (prevActiva) {
          const actualizada = quinielasProcesadas.find(q => q.id === prevActiva.id)
          return actualizada || (activas.length > 0 ? activas[0] : quinielasProcesadas[0])
        }
        return activas.length > 0 ? activas[0] : quinielasProcesadas[0]
      })

    } catch (error: any) {
      console.error("Error al cargar posiciones:", error)
      setErrorCarga("Hubo un problema de red al cargar el ranking. Por favor, reintenta en unos segundos.")
    } finally {
      setCargando(false)
    }
  }, [rolUsuario, usuario?.id]) 

  useEffect(() => {
    cargarDatos()

    let timeoutId: NodeJS.Timeout;
    const recargaSilenciosaRealtime = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        cargarDatos(true); // Recarga transparente
      }, 500); 
    };

    // ✨ CORRECCIÓN: 'postgres' no existe, debe ser 'postgres_changes'
    const canalPosiciones = supabase.channel('posiciones_publicas_blindado')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, recargaSilenciosaRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quinielas' }, recargaSilenciosaRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, recargaSilenciosaRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pronosticos' }, recargaSilenciosaRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reacciones' }, recargaSilenciosaRealtime)
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(canalPosiciones);
    }
  }, [cargarDatos])

  return {
    quinielasAbiertas,
    quinielaActiva,
    historial,
    cargando,
    errorCarga,
    setQuinielaActiva,
    recargarDatos: (esSilenciosa: boolean = false) => cargarDatos(esSilenciosa)
  }
}