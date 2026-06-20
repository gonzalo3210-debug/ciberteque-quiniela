import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export function useCartelera(usuarioActivo: any, actualizarSaldo: (nuevoSaldo: number) => void) {
  const [quinielasActivas, setQuinielasActivas] = useState<any[]>([])
  const [quinielaActual, setQuinielaActual] = useState<any>(null)
  const [partidos, setPartidos] = useState<any[]>([])
  const [equiposInfo, setEquiposInfo] = useState<any[]>([])
  const [selecciones, setSelecciones] = useState<Record<string, string>>({})
  
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  
  const [golesTotales, setGolesTotales] = useState<string>('')
  
  const [mostrarReglas, setMostrarReglas] = useState(false) 
  const [aceptoReglas, setAceptoReglas] = useState(false) 
  const [yaParticipo, setYaParticipo] = useState(false) 

  const peticionEnCurso = useRef(false)

  useEffect(() => {
    async function cargarJornadasAbiertas() {
      try {
        setCargando(true)
        setErrorCarga(null)

        const { data: qData, error: qError } = await supabase
          .from('quinielas')
          .select(`
            id, nombre_jornada, precio_ticket, fecha_cierre, tipo_premiacion,
            partidos (id, equipo_local, equipo_visitante, fecha_hora)
          `)
          .eq('estado', 'abierta')
          .order('fecha_cierre', { ascending: true })

        if (qError) throw qError;

        const { data: eData, error: eError } = await supabase.from('equipos').select('*')
        if (eError) throw eError;
        if (eData) setEquiposInfo(eData)

        if (qData && qData.length > 0) {
          // 🔥 FILTRO ESTRICTO DE TIEMPO: Eliminamos las que ya caducaron aunque digan "abierta" en BD
          const ahora = new Date().getTime();
          const jornadasDisponibles = qData.filter(q => {
            const cierre = new Date(q.fecha_cierre ? q.fecha_cierre.substring(0, 16) : q.fecha_cierre).getTime();
            return cierre > ahora;
          });

          if (jornadasDisponibles.length > 0) {
            setQuinielasActivas(jornadasDisponibles);
            await cambiarQuinielaVisible(jornadasDisponibles[0]); 
          } else {
            setQuinielasActivas([]);
            setQuinielaActual(null);
          }
        } else {
          setQuinielasActivas([]);
          setQuinielaActual(null);
        }
      } catch (error: any) {
        console.error("Error al cargar datos:", error);
        setErrorCarga("No pudimos cargar la cartelera. Revisa tu conexión a internet.");
      } finally {
        setCargando(false)
      }
    }
    
    if (usuarioActivo?.id) { 
        cargarJornadasAbiertas()
    }
  }, [usuarioActivo?.id])

  // 🔥 SUSCRIPCIÓN INTELIGENTE: Si el admin la cierra, desaparece automáticamente de la vista
  useEffect(() => {
    if (!quinielaActual) return;

    const canalTiempoReal = supabase
      .channel(`monitoreo-cierre-${quinielaActual.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quinielas', filter: `id=eq.${quinielaActual.id}` },
        (payload: any) => {
          if (payload.new.estado !== 'abierta') {
            setQuinielasActivas(prev => {
                const filtradas = prev.filter(q => q.id !== payload.new.id);
                if (quinielaActual.id === payload.new.id) {
                    if (filtradas.length > 0) cambiarQuinielaVisible(filtradas[0]);
                    else setQuinielaActual(null);
                }
                return filtradas;
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(canalTiempoReal); };
  }, [quinielaActual?.id]);

  const cambiarQuinielaVisible = async (quiniela: any) => {
    setQuinielaActual(quiniela)
    
    const partidosAcomodados = [...(quiniela.partidos || [])].sort((a: any, b: any) => {
      if (!a.fecha_hora) return 1;
      if (!b.fecha_hora) return -1;
      return new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime();
    });
    
    setPartidos(partidosAcomodados)
    setSelecciones({}) 
    setGolesTotales('')
    setAceptoReglas(false) 

    if (usuarioActivo?.id) {
        const { data: ticketsPrevios } = await supabase
        .from('tickets')
        .select('id')
        .eq('usuario_id', usuarioActivo.id)
        .eq('quiniela_id', quiniela.id)

        setYaParticipo(ticketsPrevios && ticketsPrevios.length > 0 ? true : false)
    }
  }

  const esGratis = quinielaActual?.precio_ticket === 0;
  const bloqueadoPorParticipacion = esGratis && yaParticipo;

  const seleccionarOpcion = (partidoId: string, opcion: string) => {
    if (bloqueadoPorParticipacion) return 
    setSelecciones({ ...selecciones, [partidoId]: opcion })
  }

  const guardarQuiniela = async () => {
    if (peticionEnCurso.current) return { error: 'Tu jugada ya se está procesando...' }
    
    // 🔥 VERIFICACIÓN FINAL: Justo antes de guardar, comprobamos el tiempo real de nuevo
    const cierre = new Date(quinielaActual.fecha_cierre ? quinielaActual.fecha_cierre.substring(0, 16) : quinielaActual.fecha_cierre).getTime();
    if (new Date().getTime() > cierre) {
        return { error: '¡El tiempo límite acaba de expirar! La jornada ya no admite jugadas.' }
    }

    if (bloqueadoPorParticipacion) return { error: 'Solo se permite 1 participación por usuario.' }
    if (!aceptoReglas) return { error: 'Debes aceptar el reglamento.' }
    if (golesTotales === '') return { error: 'Por favor, anota el total de goles.' }

    const costoTicket = quinielaActual?.precio_ticket || 0
    const poderAdquisitivoTotal = Number(usuarioActivo.creditos_disponibles || 0) + Number(usuarioActivo.saldo_pesos || 0)

    if (costoTicket > 0 && poderAdquisitivoTotal < costoTicket) {
      return { error: 'No tienes saldo suficiente. Recarga en mostrador.' }
    }

    peticionEnCurso.current = true
    setGuardando(true)

    const seleccionesFinales = { ...selecciones }
    partidos.forEach(p => { if (!seleccionesFinales[p.id]) seleccionesFinales[p.id] = 'E' })

    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .insert([{ 
          usuario_id: usuarioActivo.id, 
          quiniela_id: quinielaActual.id, 
          metodo_ingreso: 'digital',
          prediccion_goles_total: parseInt(golesTotales) || 0
        }])
        .select().single()

      if (ticketError) throw ticketError

      const pronosticosAGuardar = Object.keys(seleccionesFinales).map(partidoId => ({
        ticket_id: ticketData.id, partido_id: partidoId, eleccion_usuario: seleccionesFinales[partidoId]
      }))

      const { error: pronoError } = await supabase.from('pronosticos').insert(pronosticosAGuardar)
      if (pronoError) throw pronoError

      if (costoTicket > 0) {
        let costoPendiente = costoTicket;
        let nuevoCreditos = Number(usuarioActivo.creditos_disponibles || 0);
        let nuevoSaldoPesos = Number(usuarioActivo.saldo_pesos || 0);

        if (nuevoCreditos >= costoPendiente) {
          nuevoCreditos -= costoPendiente;
        } else {
          costoPendiente -= nuevoCreditos;
          nuevoCreditos = 0;
          nuevoSaldoPesos -= costoPendiente;
        }

        await supabase.from('usuarios').update({ creditos_disponibles: nuevoCreditos, saldo_pesos: nuevoSaldoPesos }).eq('id', usuarioActivo.id)
        
        await supabase.from('transacciones_creditos').insert([{
          usuario_id: usuarioActivo.id, cantidad: -costoTicket, tipo_movimiento: 'juego_ticket', descripcion: `Ticket ${quinielaActual.nombre_jornada}`
        }])
        
        actualizarSaldo(nuevoCreditos + nuevoSaldoPesos)
      }

      setSelecciones({}) 
      setGolesTotales('')
      setAceptoReglas(false)
      if (esGratis) setYaParticipo(true)

      return { success: '¡Jugada guardada con éxito!' }
    } catch (error) {
      console.error(error)
      return { error: 'Error al guardar la jugada.' }
    } finally {
      peticionEnCurso.current = false
      setGuardando(false)
    }
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    const equipo = equiposInfo.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || null
  }

  return {
    cargando, errorCarga, quinielasActivas, quinielaActual, partidos, selecciones, golesTotales, guardando, mostrarReglas, aceptoReglas, yaParticipo, esGratis, bloqueadoPorParticipacion, setGolesTotales, setMostrarReglas, setAceptoReglas, cambiarQuinielaVisible, seleccionarOpcion, guardarQuiniela, obtenerLogo
  }
}