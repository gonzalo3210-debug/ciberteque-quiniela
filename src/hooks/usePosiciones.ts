// src/hooks/usePosiciones.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
// 🔥 Importamos nuestras consultas centralizadas
import { obtenerDatosAnidadosPosiciones, obtenerCatalogoUsuarios, obtenerCatalogoEquipos } from '@/lib/queries'

export function usePosiciones(rolUsuario?: string) {
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
      // ⚡ 1. LLAMADA OPTIMIZADA: Trae quinielas + partidos + tickets + pronósticos de un solo golpe
      const { data: qData, error: qError } = await obtenerDatosAnidadosPosiciones(rolUsuario, 10);
      if (qError) throw qError;

      if (!qData || qData.length === 0) {
        setCargando(false)
        return
      }

      // ⚡ 2. CATÁLOGOS LIGEROS EN PARALELO
      const [ 
        { data: uData, error: uError }, 
        { data: eData, error: eError } 
      ] = await Promise.all([
        obtenerCatalogoUsuarios(),
        obtenerCatalogoEquipos()
      ]);

      if (uError) throw uError;
      if (eError) throw eError;
      
      const mapaUsuarios: Record<string, { nombre: string, avatar_url: string | null }> = {}
      if (uData) uData.forEach(u => mapaUsuarios[u.id] = { nombre: u.nombre, avatar_url: u.avatar_url })

      const mapaEquipos: Record<string, any> = {}
      if (eData) eData.forEach(e => mapaEquipos[e.id] = e)

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

      // ⚡ 3. PROCESAMIENTO EN MEMORIA (El array anidado ya trae la data lista)
      const quinielasProcesadas = qData.map(q => {
        // 🛠️ CORRECCIÓN DE INGENIERÍA: Ordenamos los partidos cronológicamente antes de procesar
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
            nombre: userData.nombre,
            avatar_url: userData.avatar_url,
            prediccionGoles: ticket.prediccion_goles_total || 0,
            puntos: q.modalidad === 'sorteo' ? ticket.puntos_totales : puntos,
            aciertos,
            golesDiff,
            pronosticos: pronosticosTicket,
            equipoAsignado,
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
  }, [rolUsuario]) 

  useEffect(() => {
    cargarDatos()

    const canalPosiciones = supabase.channel('posiciones_publicas_blindado')
      .on('postgres', { event: '*', schema: 'public', table: 'partidos' }, () => {
        cargarDatos(true);
      })
      .on('postgres', { event: '*', schema: 'public', table: 'quinielas' }, () => {
        cargarDatos(true);
      })
      .on('postgres', { event: '*', schema: 'public', table: 'tickets' }, () => {
        cargarDatos(true);
      })
      .on('postgres', { event: '*', schema: 'public', table: 'pronosticos' }, () => {
        cargarDatos(true);
      })
      .subscribe();

    return () => {
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
    recargarDatos: () => cargarDatos(false)
  }
}