// src/hooks/usePosiciones.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { obtenerDatosAnidadosPosiciones, obtenerCatalogoUsuarios, obtenerCatalogoEquipos } from '@/lib/queries'
import { calcularTabla, diferenciaGoles } from '@/lib/proyeccion'
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

      const quinielasProcesadas = qData.map(q => {
        const partidosQ = [...(q.partidos || [])].sort((a: any, b: any) => {
          const tiempoA = new Date(a.fecha_hora_partido || a.fecha_hora || 0).getTime();
          const tiempoB = new Date(b.fecha_hora_partido || b.fecha_hora || 0).getTime();
          return tiempoA - tiempoB;
        });

        const ticketsQ = q.tickets || []

        // 🧮 Puntos, orden y posiciones con la implementación compartida
        // (src/lib/proyeccion.ts): soloFinales: false conserva el
        // comportamiento histórico del ranking — cuentan todos los
        // resultados capturados, finales o parciales en vivo. El
        // sorteo no pasa por la tabla: su orden sale de puntos_totales.
        const tablaOficial = q.modalidad !== 'sorteo'
          ? calcularTabla(q, ticketsQ, partidosQ, { soloFinales: false })
          : []
        const filaPorTicket = new Map(tablaOficial.map((f: any) => [f.ticketId, f]))
        const ordenPorTicket = new Map(tablaOficial.map((f: any, i: number) => [f.ticketId, i]))

        const ranking = ticketsQ.map((ticket: any) => {
          const fila = filaPorTicket.get(ticket.id)
          const golesDiff = fila ? fila.golesDiff : diferenciaGoles(ticket.prediccion_goles_total, q.goles_totales_real)

          const userData = mapaUsuarios[ticket.usuario_id] || { nombre: 'Jugador de Mostrador', avatar_url: null }
          const equipoAsignado = ticket.equipo_asignado_id ? mapaEquipos[ticket.equipo_asignado_id] : null

          return {
            id: ticket.id,
            usuario_id: ticket.usuario_id,
            nombre: userData.nombre,
            avatar_url: userData.avatar_url,
            prediccionGoles: ticket.prediccion_goles_total || 0,
            puntos: q.modalidad === 'sorteo' ? ticket.puntos_totales : (fila ? fila.puntos : 0),
            aciertos: fila ? fila.aciertos : {},
            golesDiff,
            pronosticos: ticket.pronosticos || [],
            equipoAsignado,
            conteoReacciones: mapaReacciones[ticket.id] || {},
            estaEliminado: q.modalidad === 'sorteo' && ticket.puntos_totales < 0,
            posicion: 0
          }
        })

        if (q.modalidad === 'sorteo') {
           ranking.sort((a: any, b: any) => {
              if (a.estaEliminado === b.estaEliminado) return 0;
              return a.estaEliminado ? 1 : -1;
           });
           ranking.forEach((item: any, idx: number) => {
             item.posicion = idx + 1;
           });
        } else {
           ranking.sort((a: any, b: any) => (ordenPorTicket.get(a.id) ?? 0) - (ordenPorTicket.get(b.id) ?? 0))
           ranking.forEach((item: any) => {
             const fila = filaPorTicket.get(item.id)
             item.posicion = fila ? fila.posicion : 1
           });
        }

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

      // Misma regla canónica que Mis Jugadas (grupoQuinielaTerminada):
      // una quiniela NO-sorteo está TERMINADA si está cerrada
      // (liquidada) O si tiene partidos y TODOS ya vencieron su
      // ventana de 3 h tras el inicio — así las jornadas viejas que
      // nunca se liquidaron ni capturaron completas dejan de contar
      // como activas. Un partido sin fecha cuenta como vencido solo
      // si el cierre de la quiniela también venció +3h. Sorteo: sin
      // cambios (terminada solo si está cerrada).
      const VENTANA_FIN_MS = 3 * 60 * 60 * 1000
      const ventanaVencida = (iso: string | null | undefined) => {
        if (!iso) return false
        const t = new Date(iso).getTime()
        return !isNaN(t) && t + VENTANA_FIN_MS < Date.now()
      }
      const quinielaTerminada = (q: any) => {
        if (q.modalidad === 'sorteo') return q.estado === 'cerrada'
        if (q.estado === 'cerrada') return true
        const ps = q.partidos || []
        if (ps.length === 0) return false
        return ps.every((p: any) => {
          const fh = p.fecha_hora_partido || p.fecha_hora
          return fh ? ventanaVencida(fh) : ventanaVencida(q.fecha_cierre)
        })
      }

      const activas = quinielasProcesadas
        .filter(q => !quinielaTerminada(q))
        .sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime())

      const pasadas = quinielasProcesadas
        .filter(q => quinielaTerminada(q))
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