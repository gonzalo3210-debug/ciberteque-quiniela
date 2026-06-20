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
  const [estaCerrada, setEstaCerrada] = useState(false)
  const [motivoCierre, setMotivoCierre] = useState('')

  const [mostrarReglas, setMostrarReglas] = useState(false) 
  const [aceptoReglas, setAceptoReglas] = useState(false) 
  const [yaParticipo, setYaParticipo] = useState(false) 

  const [radiografia, setRadiografia] = useState<any[]>([])
  const [cargandoRadiografia, setCargandoRadiografia] = useState(false)
  const [golesRealesEnVivo, setGolesRealesEnVivo] = useState<number | null>(null)

  const peticionEnCurso = useRef(false)

  useEffect(() => {
    async function cargarJornadas() {
      try {
        setCargando(true)
        setErrorCarga(null)

        // 🔥 AQUÍ AGREGAMOS es_final
        const { data: qData, error: qError } = await supabase
          .from('quinielas')
          .select(`
            id, nombre_jornada, precio_ticket, fecha_cierre, tipo_premiacion, goles_totales_real,
            partidos (id, equipo_local, equipo_visitante, fecha_hora, resultado_real, goles_local, goles_visitante, es_final)
          `)
          .eq('estado', 'abierta')

        if (qError) throw qError;

        const { data: eData, error: eError } = await supabase.from('equipos').select('*')
        if (eError) throw eError;

        if (eData) setEquiposInfo(eData)

        if (qData && qData.length > 0) {
          const ahora = new Date().getTime();
          const disponibles = qData.filter(q => new Date(q.fecha_cierre).getTime() > ahora);
          const bloqueadas = qData.filter(q => new Date(q.fecha_cierre).getTime() <= ahora);

          disponibles.sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime());
          bloqueadas.sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime());

          const quinielasOrdenadas = [...disponibles, ...bloqueadas];
          setQuinielasActivas(quinielasOrdenadas);
          
          const quinielaPorDefecto = disponibles.length > 0 ? disponibles[0] : quinielasOrdenadas[0];
          await cambiarQuinielaVisible(quinielaPorDefecto, true); 
        }
      } catch (error: any) {
        console.error("Error al cargar datos:", error);
        setErrorCarga("No pudimos cargar la cartelera. Revisa tu conexión a internet.");
      } finally {
        setCargando(false)
      }
    }
    
    if (usuarioActivo?.id) { 
        cargarJornadas()
    }
  }, [usuarioActivo?.id])

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
          if (payload.new.estado !== 'abierta') {
            setEstaCerrada(true);
            setMotivoCierre('¡La jornada acaba de ser cerrada por el administrador!');
            cargarRadiografia(quinielaActual, partidos);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalTiempoReal);
    };
  }, [quinielaActual?.id, partidos]);

  const cargarRadiografia = async (quinielaData: any, partidosActuales: any[]) => {
    setCargandoRadiografia(true)
    try {
      const { data: ticketsData, error } = await supabase
        .from('tickets')
        .select(`
          id,
          prediccion_goles_total,
          usuarios (nombre, avatar_url),
          pronosticos (partido_id, eleccion_usuario)
        `)
        .eq('quiniela_id', quinielaData.id)

      if (error) throw error;

      let golesRealesCalculados = 0;
      let hayGolesRegistrados = false;

      partidosActuales.forEach(p => {
        if (p.goles_local !== null && p.goles_visitante !== null) {
          golesRealesCalculados += p.goles_local + p.goles_visitante;
          hayGolesRegistrados = true;
        }
      });

      const golesOficiales = quinielaData.goles_totales_real !== null 
        ? quinielaData.goles_totales_real 
        : (hayGolesRegistrados ? golesRealesCalculados : -1);

      setGolesRealesEnVivo(golesOficiales !== -1 ? golesOficiales : null);

      if (ticketsData) {
        const ranking = ticketsData.map(ticket => {
          let aciertos = 0
          const picks: Record<string, string> = {}

          ticket.pronosticos.forEach((p: any) => {
            picks[p.partido_id] = p.eleccion_usuario
            const partido = partidosActuales.find(pt => pt.id === p.partido_id)
            if (partido && partido.resultado_real && partido.resultado_real === p.eleccion_usuario) {
              aciertos++
            }
          })

          const prediccionUsuario = ticket.prediccion_goles_total || 0;
          const golesDiff = golesOficiales !== -1 ? Math.abs(prediccionUsuario - golesOficiales) : 999;

          return {
            id: ticket.id,
            nombre: ticket.usuarios?.nombre || 'Jugador',
            avatar_url: ticket.usuarios?.avatar_url,
            goles: prediccionUsuario,
            golesDiff,
            aciertos,
            picks
          }
        })

        ranking.sort((a, b) => {
          if (b.aciertos !== a.aciertos) return b.aciertos - a.aciertos;
          return a.golesDiff - b.golesDiff;
        })

        setRadiografia(ranking)
      }
    } catch (err) {
      console.error("Error al cargar la radiografía:", err)
    } finally {
      setCargandoRadiografia(false)
    }
  }

  const cambiarQuinielaVisible = async (quiniela: any, cargaInicial = false) => {
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
    const yaHayResultados = quiniela.partidos.some((p: any) => p.resultado_real !== null)

    const estaCerradaCalculada = yaHayResultados || yaPasoLaHora;

    if (yaHayResultados) {
      setEstaCerrada(true)
      setMotivoCierre('Esta jornada está cerrada y en curso. Sigue los resultados en vivo:')
    } else if (yaPasoLaHora) {
      setEstaCerrada(true)
      setMotivoCierre('La jornada ya cerró. Revisa los pronósticos del resto:')
    } else {
      setEstaCerrada(false)
      setMotivoCierre('')
    }

    if (estaCerradaCalculada) {
      await cargarRadiografia(quiniela, partidosAcomodados)
    }

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
    if (estaCerrada || bloqueadoPorParticipacion) return 
    setSelecciones({ ...selecciones, [partidoId]: opcion })
  }

  const guardarQuiniela = async () => {
    if (peticionEnCurso.current) {
        return { error: 'Tu jugada ya se está procesando, espera un momento...' }
    }

    if (estaCerrada) return { error: 'La jornada está cerrada.' }
    if (bloqueadoPorParticipacion) return { error: 'Solo se permite 1 participación por usuario en quinielas gratuitas.' }
    if (!aceptoReglas) return { error: 'Debes leer y aceptar el reglamento oficial para enviar tu boleto.' }
    if (golesTotales === '') return { error: '¡Falta información! Por favor, anota el total de goles para el desempate.' }

    const costoTicket = quinielaActual?.precio_ticket || 0

    const saldoCreditos = Number(usuarioActivo.creditos_disponibles || 0)
    const saldoPesos = Number(usuarioActivo.saldo_pesos || 0)
    const poderAdquisitivoTotal = saldoCreditos + saldoPesos

    if (costoTicket > 0 && poderAdquisitivoTotal < costoTicket) {
      return { error: 'No tienes saldo suficiente en tu billetera. Pasa a mostrador para recargar.' }
    }

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
        let costoPendiente = costoTicket;
        let nuevoCreditos = saldoCreditos;
        let nuevoSaldoPesos = saldoPesos;

        if (nuevoCreditos >= costoPendiente) {
          nuevoCreditos -= costoPendiente;
          costoPendiente = 0;
        } else {
          costoPendiente -= nuevoCreditos;
          nuevoCreditos = 0;
          nuevoSaldoPesos -= costoPendiente;
        }

        const { error: updateError } = await supabase
          .from('usuarios')
          .update({ 
            creditos_disponibles: nuevoCreditos, 
            saldo_pesos: nuevoSaldoPesos 
          })
          .eq('id', usuarioActivo.id)

        if (updateError) throw updateError

        await supabase.from('transacciones_creditos').insert([{
          usuario_id: usuarioActivo.id,
          cantidad: -costoTicket, 
          tipo_movimiento: 'juego_ticket',
          descripcion: `Ticket ${quinielaActual.nombre_jornada}`
        }])
        
        actualizarSaldo(nuevoCreditos + nuevoSaldoPesos)
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
    errorCarga,
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
    radiografia,
    cargandoRadiografia,
    golesRealesEnVivo,
    setGolesTotales,
    setMostrarReglas,
    setAceptoReglas,
    cambiarQuinielaVisible,
    seleccionarOpcion,
    guardarQuiniela,
    obtenerLogo
  }
}