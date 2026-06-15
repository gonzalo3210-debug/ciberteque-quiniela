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
  const [golesTotales, setGolesTotales] = useState<string>('')
  
  const [estaCerrada, setEstaCerrada] = useState(false)
  const [motivoCierre, setMotivoCierre] = useState('')

  const [mostrarReglas, setMostrarReglas] = useState(false) 
  const [aceptoReglas, setAceptoReglas] = useState(false) 
  const [yaParticipo, setYaParticipo] = useState(false) 

  // 🔥 Candado de seguridad sincrónico para evitar el doble cobro (Race Condition)
  const peticionEnCurso = useRef(false)

  // 1️⃣ CARGA INICIAL DE DATOS
  useEffect(() => {
    async function cargarJornadas() {
      try {
        setCargando(true)
        const { data: qData, error: qError } = await supabase
          .from('quinielas')
          .select(`
            id, nombre_jornada, precio_ticket, fecha_cierre, tipo_premiacion,
            partidos (id, equipo_local, equipo_visitante, fecha_hora, resultado_real)
          `)
          .eq('estado', 'abierta')
          .order('fecha_cierre', { ascending: true }) 

        if (qError) throw qError;

        const { data: eData, error: eError } = await supabase.from('equipos').select('*')
        
        if (eError) throw eError;

        if (qData && qData.length > 0) {
          setQuinielasActivas(qData)
          await cambiarQuinielaVisible(qData[0]) 
        }
        if (eData) {
          setEquiposInfo(eData)
        }
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setCargando(false)
      }
    }
    
    if (usuarioActivo) {
        cargarJornadas()
    }
  }, [usuarioActivo])

  // 2️⃣ 🔥 HITO 2: SUSCRIPCIÓN EN TIEMPO REAL (SOLO CIERRE DE JORNADA)
  useEffect(() => {
    if (!quinielaActual) return;

    const canalTiempoReal = supabase
      .channel(`monitoreo-cierre-${quinielaActual.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quinielas',
          filter: `id=eq.${quinielaActual.id}`
        },
        (payload: any) => {
          // Si el administrador cambia el estado a algo diferente de 'abierta'
          if (payload.new.estado !== 'abierta') {
            setEstaCerrada(true);
            setMotivoCierre('¡La jornada acaba de ser cerrada por el administrador! Ya no se aceptan más boletos.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalTiempoReal);
    };
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

    const fechaCierreCorta = quiniela.fecha_cierre ? quiniela.fecha_cierre.substring(0, 16) : null
    const fechaCierre = new Date(fechaCierreCorta || quiniela.fecha_cierre)
    const ahora = new Date()
    const yaPasoLaHora = ahora > fechaCierre
    // Verificamos si en la carga inicial ya traía resultados (como seguro extra)
    const yaHayResultados = quiniela.partidos.some((p: any) => p.resultado_real !== null)

    if (yaHayResultados) {
      setEstaCerrada(true)
      setMotivoCierre('Esta jornada ya cerró porque los resultados oficiales están siendo procesados.')
    } else if (yaPasoLaHora) {
      setEstaCerrada(true)
      setMotivoCierre('El tiempo límite para participar en esta jornada ha terminado.')
    } else {
      setEstaCerrada(false)
      setMotivoCierre('')
    }

    if (usuarioActivo) {
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
    if (estaCerrada || bloqueadoPorParticipacion) return 
    setSelecciones({ ...selecciones, [partidoId]: opcion })
  }

  const guardarQuiniela = async () => {
    // BLOQUEO INSTANTÁNEO (Protección contra doble clic)
    if (peticionEnCurso.current) {
        return { error: 'Tu jugada ya se está procesando, espera un momento...' }
    }

    if (estaCerrada) return { error: 'La jornada está cerrada.' }
    if (bloqueadoPorParticipacion) return { error: 'Solo se permite 1 participación por usuario en quinielas gratuitas.' }
    if (!aceptoReglas) return { error: 'Debes leer y aceptar el reglamento oficial para enviar tu boleto.' }
    if (golesTotales === '') return { error: '¡Falta información! Por favor, anota el total de goles para el desempate.' }

    const costoTicket = quinielaActual?.precio_ticket || 0

    if (costoTicket > 0 && usuarioActivo.creditos_disponibles < costoTicket) {
      return { error: 'No tienes créditos suficientes. Pasa a mostrador para recargar.' }
    }

    // ACTIVAMOS LOS CANDADOS ANTES DE PROCESAR
    peticionEnCurso.current = true
    setGuardando(true)

    const seleccionesFinales = { ...selecciones }
    partidos.forEach(p => {
      if (!seleccionesFinales[p.id]) {
        seleccionesFinales[p.id] = 'E' 
      }
    })

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
        ticket_id: ticketData.id,
        partido_id: partidoId,
        eleccion_usuario: seleccionesFinales[partidoId]
      }))

      const { error: pronoError } = await supabase.from('pronosticos').insert(pronosticosAGuardar)
      if (pronoError) throw pronoError

      if (costoTicket > 0) {
        const nuevoSaldo = usuarioActivo.creditos_disponibles - costoTicket
        const { error: updateError } = await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioActivo.id)
        if (updateError) throw updateError

        await supabase.from('transacciones_creditos').insert([{
          usuario_id: usuarioActivo.id,
          cantidad: -costoTicket,
          tipo_movimiento: 'juego_ticket',
          descripcion: `Ticket ${quinielaActual.nombre_jornada}`
        }])
        actualizarSaldo(nuevoSaldo)
      }

      setSelecciones({}) 
      setGolesTotales('')
      setAceptoReglas(false)
      
      if (esGratis) setYaParticipo(true)

      return { success: '¡Jugada guardada con éxito! Los partidos sin marcar se guardaron como Empate.' }

    } catch (error) {
      console.error(error)
      return { error: 'Error al guardar la jugada en la base de datos.' }
    } finally {
      // LIBERAMOS LOS CANDADOS SIEMPRE AL FINALIZAR
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
    cargando,
    quinielasActivas,
    quinielaActual,
    partidos,
    selecciones,
    golesTotales,
    guardando,
    estaCerrada,
    motivoCierre,
    mostrarReglas,
    aceptoReglas,
    yaParticipo,
    esGratis,
    bloqueadoPorParticipacion,
    setGolesTotales,
    setMostrarReglas,
    setAceptoReglas,
    cambiarQuinielaVisible,
    seleccionarOpcion,
    guardarQuiniela,
    obtenerLogo
  }
}