import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { obtenerQuinielasActivas } from '@/lib/queries'

export function useCartelera(usuarioActivo: any, actualizarSaldo: (nuevoSaldo: number) => void) {
  const [quinielasActivas, setQuinielasActivas] = useState<any[]>([])
  const [quinielaActual, setQuinielaActual] = useState<any>(null)
  const [partidos, setPartidos] = useState<any[]>([])
  
  const [mapaLogos, setMapaLogos] = useState<Record<string, string>>({})
  const [selecciones, setSelecciones] = useState<Record<string, string>>({})
  
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  
  // Para modalidad clásica (L,E,V) seguimos usando estado manual.
  const [golesTotales, setGolesTotales] = useState<string>('')
  
  const [mostrarReglas, setMostrarReglas] = useState(false) 
  const [aceptoReglas, setAceptoReglas] = useState(false) 
  const [yaParticipo, setYaParticipo] = useState(false) 

  const [lugaresDisponibles, setLugaresDisponibles] = useState<number>(8)
  const [cantidadBoletos, setCantidadBoletos] = useState<number>(1)

  const peticionEnCurso = useRef(false)

  useEffect(() => {
    async function cargarJornadasAbiertas() {
      try {
        setCargando(true)
        setErrorCarga(null)

        const { data: qData, error: qError } = await obtenerQuinielasActivas(usuarioActivo?.rol);
        if (qError) throw qError;

        const { data: eData, error: eError } = await supabase.from('equipos').select('nombre, logo_url')
        if (eError) throw eError;
        
        if (eData) {
          const diccionarioLogos: Record<string, string> = {};
          eData.forEach(eq => {
            if (eq.nombre) diccionarioLogos[eq.nombre.toLowerCase().trim()] = eq.logo_url;
          });
          setMapaLogos(diccionarioLogos);
        }

        if (qData && qData.length > 0) {
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
    
    if (usuarioActivo?.id) cargarJornadasAbiertas()
  }, [usuarioActivo?.id, usuarioActivo?.rol])

  useEffect(() => {
    if (!quinielaActual) return;

    const canalTiempoReal = supabase
      .channel(`monitoreo-cierre-${quinielaActual.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quinielas', filter: `id=eq.${quinielaActual.id}` },
        (payload: any) => {
          const ocultarPorPrivacidad = payload.new.solo_admins === true && usuarioActivo?.rol !== 'admin';

          if (payload.new.estado !== 'abierta' || ocultarPorPrivacidad) {
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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets', filter: `quiniela_id=eq.${quinielaActual.id}` },
        () => {
           if (quinielaActual.modalidad === 'sorteo') {
               obtenerCupoSorteo(quinielaActual.id);
           }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(canalTiempoReal); };
  }, [quinielaActual?.id, usuarioActivo?.rol]);

  const obtenerCupoSorteo = async (quinielaId: string) => {
      const { count } = await supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('quiniela_id', quinielaId);
      const ocupados = count || 0;
      const libres = Math.max(0, 8 - ocupados);
      setLugaresDisponibles(libres);
      setCantidadBoletos(prev => Math.min(prev, libres === 0 ? 1 : libres)); 
  }

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
    setCantidadBoletos(1)

    if (quiniela.modalidad === 'sorteo') {
        await obtenerCupoSorteo(quiniela.id);
    }

    if (usuarioActivo?.id) {
        const { data: ticketsPrevios } = await supabase
        .from('tickets').select('id').eq('usuario_id', usuarioActivo.id).eq('quiniela_id', quiniela.id)

        setYaParticipo(ticketsPrevios && ticketsPrevios.length > 0 ? true : false)
    }
  }

  const esGratis = quinielaActual?.precio_ticket === 0;
  const esSorteo = quinielaActual?.modalidad === 'sorteo';
  const esMarcadorExacto = quinielaActual?.modalidad === 'marcador_exacto';
  
  const bloqueadoPorParticipacion = (esGratis && yaParticipo) || (esSorteo && lugaresDisponibles === 0);

  // ⚡ INGENIERÍA: CÁLCULO DERIVADO DE GOLES EN TIEMPO REAL
  const golesAutomaticos = Object.values(selecciones).reduce((acc, val) => {
    if (!val) return acc;
    const [l, v] = val.split('-');
    const numL = parseInt(l);
    const numV = parseInt(v);
    if (!isNaN(numL)) acc += numL;
    if (!isNaN(numV)) acc += numV;
    return acc;
  }, 0);

  const seleccionarOpcion = (partidoId: string, opcion: string) => {
    if (bloqueadoPorParticipacion) return 
    setSelecciones({ ...selecciones, [partidoId]: opcion })
  }

  const guardarQuiniela = async () => {
    if (peticionEnCurso.current) return { error: 'Tu jugada ya se está procesando...' }
    
    const cierre = new Date(quinielaActual.fecha_cierre ? quinielaActual.fecha_cierre.substring(0, 16) : quinielaActual.fecha_cierre).getTime();
    if (new Date().getTime() > cierre) return { error: '¡El tiempo límite acaba de expirar!' }

    if (bloqueadoPorParticipacion) {
        if (esSorteo) return { error: 'La sala está llena.' }
        if (esGratis) return { error: 'Promoción limitada a 1 boleto por cuenta.' }
    }
    
    if (!aceptoReglas) return { error: 'Debes aceptar el reglamento.' }
    
    if (!esSorteo) {
        // Validaciones estrictas unificadas
        const todasSeleccionadas = partidos.every(p => selecciones[p.id] && selecciones[p.id].trim() !== '');
        if (!todasSeleccionadas) return { error: 'Debes pronosticar todos los partidos antes de pagar.' }

        if (esMarcadorExacto) {
            const formatoCorrecto = partidos.every(p => /^\d+-\d+$/.test(selecciones[p.id]?.trim()));
            if (!formatoCorrecto) return { error: 'Por favor ingresa los goles de ambos equipos en todos los partidos.' }
        } else {
            if (golesTotales === '') return { error: 'Por favor, anota el total de goles de desempate.' }
        }
    }

    if (esSorteo) {
       const { count } = await supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('quiniela_id', quinielaActual.id);
       const libresActuales = Math.max(0, 8 - (count || 0));
       if (cantidadBoletos > libresActuales) {
           await obtenerCupoSorteo(quinielaActual.id);
           return { error: `Stock insuficiente. Solo quedan ${libresActuales} lugar(es).` }
       }
    }

    const costoTicket = quinielaActual?.precio_ticket || 0
    const costoTotal = esSorteo ? (costoTicket * cantidadBoletos) : costoTicket;
    const poderAdquisitivoTotal = Number(usuarioActivo.creditos_disponibles || 0) + Number(usuarioActivo.saldo_pesos || 0)

    if (costoTotal > 0 && poderAdquisitivoTotal < costoTotal) {
      return { error: `No tienes saldo suficiente para pagar $${costoTotal}.00. Recarga tu cuenta.` }
    }

    peticionEnCurso.current = true
    setGuardando(true)

    try {
      const ticketsAGuardar = esSorteo 
        ? Array.from({ length: cantidadBoletos }).map(() => ({
            usuario_id: usuarioActivo.id, 
            quiniela_id: quinielaActual.id, 
            metodo_ingreso: 'digital',
            prediccion_goles_total: 0
          }))
        : [{ 
            usuario_id: usuarioActivo.id, 
            quiniela_id: quinielaActual.id, 
            metodo_ingreso: 'digital',
            // ⚡ INGENIERÍA: Si es marcador exacto inyectamos la suma automática
            prediccion_goles_total: esMarcadorExacto ? golesAutomaticos : (parseInt(golesTotales) || 0)
          }];

      const { data: ticketsCreados, error: ticketError } = await supabase.from('tickets').insert(ticketsAGuardar).select();
      if (ticketError) throw ticketError;

      if (!esSorteo && ticketsCreados && ticketsCreados.length > 0) {
          const pronosticosAGuardar = Object.keys(selecciones).map(partidoId => ({
            ticket_id: ticketsCreados[0].id, 
            partido_id: partidoId, 
            eleccion_usuario: selecciones[partidoId].trim()
          }))

          const { error: pronoError } = await supabase.from('pronosticos').insert(pronosticosAGuardar)
          if (pronoError) throw pronoError
      }

      if (costoTotal > 0) {
        let costoPendiente = costoTotal;
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
          usuario_id: usuarioActivo.id, 
          cantidad: -costoTotal, 
          tipo_movimiento: 'juego_ticket', 
          descripcion: esSorteo ? `Compra de ${cantidadBoletos} pase(s) Sorteo ${quinielaActual.nombre_jornada}` : `Ticket ${quinielaActual.nombre_jornada}`
        }])
        
        actualizarSaldo(nuevoCreditos + nuevoSaldoPesos)
      }

      setSelecciones({}) 
      setGolesTotales('')
      setAceptoReglas(false)
      setYaParticipo(true)

      if (esSorteo) await obtenerCupoSorteo(quinielaActual.id);

      return { success: esSorteo ? `¡${cantidadBoletos} Lugar(es) asegurado(s) en el bombo!` : '¡Jugada guardada con éxito!' }
    } catch (error) {
      console.error(error)
      return { error: 'Error al procesar tu compra.' }
    } finally {
      peticionEnCurso.current = false
      setGuardando(false)
    }
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    return mapaLogos[nombreEquipo.toLowerCase().trim()] || null;
  }

  return {
    cargando, errorCarga, quinielasActivas, quinielaActual, partidos, selecciones, golesTotales, guardando, 
    mostrarReglas, aceptoReglas, yaParticipo, esGratis, esSorteo, esMarcadorExacto, bloqueadoPorParticipacion, 
    lugaresDisponibles, cantidadBoletos, golesAutomaticos, // ⚡ Exportamos la nueva variable
    setCantidadBoletos, setGolesTotales, setMostrarReglas, setAceptoReglas, cambiarQuinielaVisible, seleccionarOpcion, guardarQuiniela, obtenerLogo
  }
}