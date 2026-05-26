'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminPanel({ actualizarSaldoGlobal }: { actualizarSaldoGlobal?: (id: string, nuevo: number) => void }) {
  
  // 🌐 AQUÍ PONES EL LINK DE TU PÁGINA PÚBLICA PARA QUE SE VAYA EN EL WHATSAPP
  const ENLACE_PUBLICO_RANKING = "https://tu-sitio-en-vercel.app/ranking" // <-- CÁMBIALO POR TU LINK REAL

  // --- ESTADOS GLOBALES ---
  const [adminVista, setAdminVista] = useState<'recargas' | 'resultados' | 'crear' | 'equipos' | 'captura'>('recargas')
  
  // Estados para Recargas e Historial
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [historialActivo, setHistorialActivo] = useState<string | null>(null)
  const [datosHistorial, setDatosHistorial] = useState<any[]>([])

  // Estados para Resultados / Árbitro
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([])
  const [quiniela, setQuiniela] = useState<any>(null)
  const [partidos, setPartidos] = useState<any[]>([])
  const [resultadosReales, setResultadosReales] = useState<Record<string, string>>({})
  const [marcadoresReales, setMarcadoresReales] = useState<Record<string, { l: string, v: string }>>({}) 
  const [golesReales, setGolesReales] = useState<string>('')
  const [calificando, setCalificando] = useState(false)
  const [rankingAdmin, setRankingAdmin] = useState<any[]>([]) 
  const [tipoImpresion, setTipoImpresion] = useState<'tickets' | 'sabana' | 'recibo' | null>(null)
  const [ticketAImprimir, setTicketAImprimir] = useState<any>(null)

  // Estados para Creador de Jornadas
  const [equipos, setEquipos] = useState<any[]>([])
  const [nombreJornada, setNombreJornada] = useState('')
  const [precioTicket, setPrecioTicket] = useState('1')
  const [fechaCierre, setFechaCierre] = useState('')
  const [tipoPremiacion, setTipoPremiacion] = useState<'unico' | 'top2' | 'top3'>('unico')
  const [partidosNuevos, setPartidosNuevos] = useState([{ local: '', visitante: '', fecha_hora: '' }])
  const [creando, setCreando] = useState(false)
  const [ligaFiltroJornada, setLigaFiltroJornada] = useState('Todas')
  const [cargadoBorrador, setCargadoBorrador] = useState(false) 

  // Estados para Edición de Jornada
  const [editandoQuinielaId, setEditandoQuinielaId] = useState<string | null>(null)
  const [editNombreJornada, setEditNombreJornada] = useState('')
  const [editFechaCierre, setEditFechaCierre] = useState('')
  const [editTipoPremiacion, setEditTipoPremiacion] = useState<'unico' | 'top2' | 'top3'>('unico')
  const [editPartidos, setEditPartidos] = useState<any[]>([])
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  // Estados: Para Edición de Ticket (Jugada)
  const [editandoTicketId, setEditandoTicketId] = useState<string | null>(null)
  const [editTicketNombre, setEditTicketNombre] = useState('')
  const [editTicketGoles, setEditTicketGoles] = useState('')
  const [editTicketSelecciones, setEditTicketSelecciones] = useState<Record<string, string>>({})
  const [guardandoEdicionTicket, setGuardandoEdicionTicket] = useState(false)

  // Estados para Equipos
  const [formEquipoNombre, setFormEquipoNombre] = useState('')
  const [formEquipoLogo, setFormEquipoLogo] = useState('')
  const [formEquipoLiga, setFormEquipoLiga] = useState('')
  const [equipoEditandoId, setEquipoEditandoId] = useState<string | null>(null)
  const [guardandoEquipo, setGuardandoEquipo] = useState(false)
  const [busquedaEquipo, setBusquedaEquipo] = useState('')
  const [filtroLigaEquipo, setFiltroLigaEquipo] = useState('Todas')

  // Estados para Captura Físico
  const [capTelefono, setCapTelefono] = useState('')
  const [capNombre, setCapNombre] = useState('')
  const [capUsuarioId, setCapUsuarioId] = useState<string | null>(null)
  const [capSelecciones, setCapSelecciones] = useState<Record<string, string>>({})
  const [capGoles, setCapGoles] = useState('')
  const [guardandoCaptura, setGuardandoCaptura] = useState(false)
  const [linkWaReciente, setLinkWaReciente] = useState<string | null>(null)

  const VALOR_CREDITO = 30 
  const PORCENTAJE_PREMIO = 0.80 
  const PORCENTAJE_ADMIN = 0.20 

  const ligasDinamicas = Array.from(new Set(equipos.map(e => e.liga || 'Sin Liga'))).sort()

  // --- EFECTOS ---
  useEffect(() => {
    const borrador = localStorage.getItem('ciberteque_borrador_jornada')
    if (borrador) {
      try {
        const datos = JSON.parse(borrador)
        if (datos.nombreJornada) setNombreJornada(datos.nombreJornada)
        if (datos.precioTicket) setPrecioTicket(datos.precioTicket)
        if (datos.fechaCierre) setFechaCierre(datos.fechaCierre)
        if (datos.tipoPremiacion) setTipoPremiacion(datos.tipoPremiacion)
        if (datos.partidosNuevos && datos.partidosNuevos.length > 0) setPartidosNuevos(datos.partidosNuevos)
      } catch (error) {}
    }
    setCargadoBorrador(true)
  }, [])

  useEffect(() => {
    if (!cargadoBorrador) return 
    localStorage.setItem('ciberteque_borrador_jornada', JSON.stringify({ nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos }))
  }, [nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos, cargadoBorrador])

  useEffect(() => { cargarEquiposDB() }, [])

  useEffect(() => {
    if (adminVista === 'resultados' || adminVista === 'captura') cargarPartidosJornada()
  }, [adminVista])

  // --- FUNCIONES ---
  const cargarEquiposDB = async () => {
    const { data: eq } = await supabase.from('equipos').select('*').order('nombre')
    if (eq) setEquipos(eq)
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    const equipo = equipos.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || null
  }

  const verHistorial = async (usuarioId: string, forceRefresh = false) => {
    if (historialActivo === usuarioId && !forceRefresh) { setHistorialActivo(null); return }
    setHistorialActivo(usuarioId)
    const { data } = await supabase.from('transacciones_creditos').select('*').eq('usuario_id', usuarioId).order('created_at', { ascending: false }).limit(15)
    if (data) setDatosHistorial(data)
  }

  const buscarUsuarios = async () => {
    if (!busqueda) return
    setCargando(true)
    const { data } = await supabase.from('usuarios').select('*').or(`nombre.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`).limit(5)
    if (data) setUsuarios(data)
    setCargando(false)
  }

  const recargarCreditos = async (usuarioId: string, saldoActual: number, cantidad: number) => {
    const nuevoSaldo = saldoActual + cantidad
    const { error } = await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioId)
    if (!error) {
      await supabase.from('transacciones_creditos').insert([{ usuario_id: usuarioId, cantidad: cantidad, tipo_movimiento: 'recarga_manual' }])
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuarioId, nuevoSaldo)
      
      await buscarUsuarios() 
      if (historialActivo === usuarioId) {
        await verHistorial(usuarioId, true)
      }
      alert('¡Recarga exitosa!')
    }
  }

  const cargarPartidosJornada = async () => {
    const { data: abiertas } = await supabase
      .from('quinielas')
      .select('id, nombre_jornada, precio_ticket, goles_totales_real, fecha_cierre, estado, tipo_premiacion, partidos (id, equipo_local, equipo_visitante, resultado_real, fecha_hora, goles_local, goles_visitante)')
      .eq('estado', 'abierta')
      .order('fecha_cierre', { ascending: true })
      
    if (abiertas && abiertas.length > 0) {
      setQuinielasAbiertas(abiertas)
      if (!quiniela || !abiertas.find(q => q.id === quiniela.id)) cargarDetallesQuiniela(abiertas[0])
      else cargarDetallesQuiniela(abiertas.find(q => q.id === quiniela.id))
    } else { setQuinielasAbiertas([]); setQuiniela(null); setPartidos([]); setRankingAdmin([]) }
  }

  const cargarDetallesQuiniela = async (qData: any) => {
    setQuiniela(qData)
    setPartidos(qData.partidos || [])
    
    const res: Record<string, string> = {}
    const marcs: Record<string, { l: string, v: string }> = {}
    
    let sumaGolesCalculada = 0;
    let hayGoles = false;
    
    qData.partidos.forEach((p: any) => { 
      if (p.resultado_real) res[p.id] = p.resultado_real;
      
      if (p.goles_local !== null && p.goles_local !== undefined && p.goles_visitante !== null && p.goles_visitante !== undefined) {
        marcs[p.id] = { l: p.goles_local.toString(), v: p.goles_visitante.toString() };
        
        // Sumamos al vuelo para corregir errores viejos de base de datos
        sumaGolesCalculada += p.goles_local + p.goles_visitante;
        hayGoles = true;
      }
    })
    
    setResultadosReales(res)
    setMarcadoresReales(marcs) 
    
    // Si hay goles reales ya anotados, obligamos a que el recuadro muestre la suma real
    // Si no hay nada, respeta lo que diga la base de datos
    if (hayGoles) {
      setGolesReales(sumaGolesCalculada.toString());
    } else {
      setGolesReales(qData.goles_totales_real !== null ? qData.goles_totales_real.toString() : '');
    }

    const { data: tData } = await supabase.from('tickets').select('id, usuario_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)').eq('quiniela_id', qData.id)
    const { data: uData } = await supabase.from('usuarios').select('id, nombre, telefono')
    const mapaU: Record<string, any> = {}
    if (uData) uData.forEach(u => mapaU[u.id] = { nombre: u.nombre, telefono: u.telefono })
    
    if (tData) {
      const rCalc = tData.map(ticket => {
        let pts = 0
        const prons: Record<string, string> = {}
        ticket.pronosticos.forEach((pr: any) => {
          prons[pr.partido_id] = pr.eleccion_usuario
          const p = qData.partidos.find((par: any) => par.id === pr.partido_id)
          if (p && p.resultado_real === pr.eleccion_usuario) pts++
        })
        
        // Compara contra la suma real calculada, no contra el error de la DB
        const golesRealesAct = hayGoles ? sumaGolesCalculada : (qData.goles_totales_real !== null ? qData.goles_totales_real : -1);
        const golesDiff = golesRealesAct !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesRealesAct) : 999;

        return { 
          id: ticket.id, 
          nombre: mapaU[ticket.usuario_id]?.nombre || 'Mostrador', 
          telefono: mapaU[ticket.usuario_id]?.telefono || '', 
          puntos: pts, 
          prediccionGoles: ticket.prediccion_goles_total, 
          golesDiff: golesDiff, 
          pronosticosDiccionario: prons 
        }
      }).sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return a.golesDiff - b.golesDiff;
      })
      setRankingAdmin(rCalc)
    }
  }

  // 🔥 NUEVA LÓGICA DE SUMA AUTOMÁTICA INFALIBLE
  const handleMarcadorExacto = (partidoId: string, tipo: 'l' | 'v', valor: string) => {
    const numValor = valor.replace(/[^0-9]/g, ''); 
    
    // Primero, preparamos cómo van a quedar los marcadores
    const nuevosMarcadores = {
      ...marcadoresReales,
      [partidoId]: {
        ...(marcadoresReales[partidoId] || { l: '', v: '' }),
        [tipo]: numValor
      }
    };

    const nuevosResultados = { ...resultadosReales };
    let sumaTotal = 0;
    let hayGoles = false;

    // Repasamos todos los partidos para sumar TODO lo que haya
    partidos.forEach(p => {
      const marcadorP = nuevosMarcadores[p.id] || { l: '', v: '' };
      const ml = parseInt(marcadorP.l);
      const mv = parseInt(marcadorP.v);
      
      // Checar si hay que pintar la L, E o V
      if (marcadorP.l !== '' && marcadorP.v !== '' && !isNaN(ml) && !isNaN(mv)) {
        if (ml > mv) nuevosResultados[p.id] = 'L';
        else if (ml === mv) nuevosResultados[p.id] = 'E';
        else nuevosResultados[p.id] = 'V';
      }

      // Sumar los goles
      if (!isNaN(ml)) { sumaTotal += ml; hayGoles = true; }
      if (!isNaN(mv)) { sumaTotal += mv; hayGoles = true; }
    });
    
    // Actualizamos toda la pantalla de un solo golpe
    setMarcadoresReales(nuevosMarcadores);
    setResultadosReales(nuevosResultados);
    setGolesReales(hayGoles ? sumaTotal.toString() : '');
  }

  const guardarYCalificar = async () => {
    setCalificando(true)
    try {
      for (const pId of Object.keys(resultadosReales || {})) {
        const l_val = marcadoresReales[pId]?.l;
        const v_val = marcadoresReales[pId]?.v;
        
        await supabase.from('partidos').update({ 
          resultado_real: resultadosReales[pId],
          goles_local: (l_val !== undefined && l_val !== '') ? parseInt(l_val) : null,
          goles_visitante: (v_val !== undefined && v_val !== '') ? parseInt(v_val) : null
        }).eq('id', pId)
      }
      
      if (golesReales !== '') {
        // Al guardar, reescribimos goles_totales_real con la suma correcta
        await supabase.from('quinielas').update({ goles_totales_real: parseInt(golesReales) }).eq('id', quiniela.id)
      }

      const { data: tickets } = await supabase.from('tickets').select('id, pronosticos (partido_id, eleccion_usuario)').eq('quiniela_id', quiniela.id)
      if (tickets) {
        for (const ticket of tickets) {
          let puntos = 0
          const pronos = ticket.pronosticos || []
          for (const pronostico of pronos) {
            if (resultadosReales[pronostico.partido_id] === pronostico.eleccion_usuario) puntos++
          }
          await supabase.from('tickets').update({ puntos_totales: puntos }).eq('id', ticket.id)
        }
      }
      alert('¡Avance guardado con éxito! Posiciones actualizadas.')
      await cargarPartidosJornada()
    } catch (error) {
      alert('Hubo un error al guardar el avance.')
    } finally {
      setCalificando(false)
    }
  }

  const compartirAvanceGrupo = () => {
    if (!quiniela) return alert('No hay jornada seleccionada.');
    
    let partidosJugados = 0;
    partidos.forEach(p => { if (resultadosReales[p.id]) partidosJugados++; });

    const totalBoletosAdmin = rankingAdmin?.length || 0;
    const precioBoletoCrds = quiniela.precio_ticket || 1;
    const bolsaPesos = totalBoletosAdmin * precioBoletoCrds * VALOR_CREDITO * PORCENTAJE_PREMIO;

    let texto = `🏆 *AVANCE DE QUINIELA: ${quiniela.nombre_jornada}* 🏆\n\n`;
    texto += `⚽ Partidos finalizados: *${partidosJugados} de ${partidos.length}*\n`;
    texto += `💰 Bolsa Actual: *$${bolsaPesos.toFixed(0)} MXN*\n\n`;
    
    texto += `🔥 *TOP LÍDERES ACTUALES* 🔥\n`;
    const topJugadores = rankingAdmin.slice(0, 10);
    if (topJugadores.length === 0) {
      texto += `Aún no hay participantes.\n`;
    } else {
      topJugadores.forEach((r, i) => {
        let medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
        texto += `${medalla} ${r.nombre} - *${r.puntos} pts*\n`;
      });
    }

    texto += `\n💻 *Revisa la tabla COMPLETA en vivo aquí:*\n`;
    texto += `👉 ${ENLACE_PUBLICO_RANKING}\n\n`;
    texto += `_¡Suerte a todos!_`;

    navigator.clipboard.writeText(texto).then(() => {
      alert('📋 ¡Resumen y Enlace copiados al portapapeles!\n\nVe a tu grupo de WhatsApp y dale a "Pegar" (Paste).');
    }).catch(() => {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    });
  }

  const enviarWhatsAppBoleto = (jugador: any) => {
    const tel = jugador.telefono;
    if (!tel || tel.trim() === '') {
      alert(`No hay un número de WhatsApp registrado válido para ${jugador.nombre}.`);
      return;
    }
    const msg = `🎫 *QUINIELA CIBERTEQUE*\nHola ${jugador.nombre}, tu jugada para *${quiniela.nombre_jornada}* está registrada correctamente. ¡Mucha suerte!\n\nPuedes seguir los resultados en vivo aquí:\n${ENLACE_PUBLICO_RANKING}`;
    window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  const cerrarJornadaDefinitivo = async () => {
    if (!quiniela) return
    if (golesReales === '') return alert('🚨 Ingresa primero el "Resultado Oficial" de goles totales.')
    if (!rankingAdmin || rankingAdmin.length === 0) return alert('No hay tickets registrados.')

    const totalBoletos = rankingAdmin.length || 0
    const totalRecaudadoPesos = totalBoletos * (quiniela.precio_ticket || 1) * VALOR_CREDITO
    const premioBolsa80 = totalRecaudadoPesos * PORCENTAJE_PREMIO
    let desgloseTexto = '';
    const tPremio = quiniela.tipo_premiacion || 'unico';

    if (tPremio === 'unico') {
      desgloseTexto = `Ganador 1er Lugar: ${rankingAdmin[0].nombre} -> $${premioBolsa80.toFixed(0)} MXN (100%)`;
    } else if (tPremio === 'top2') {
      const p1 = premioBolsa80 * 0.70;
      const p2 = rankingAdmin.length > 1 ? premioBolsa80 * 0.30 : 0;
      desgloseTexto = `1er Lugar: ${rankingAdmin[0].nombre} -> $${p1.toFixed(0)} MXN (70%)\n2do Lugar: ${rankingAdmin[1]?.nombre || 'N/A'} -> $${p2.toFixed(0)} MXN (30%)`;
    } else if (tPremio === 'top3') {
      const p1 = premioBolsa80 * 0.60;
      const p2 = rankingAdmin.length > 1 ? premioBolsa80 * 0.25 : 0;
      const p3 = rankingAdmin.length > 2 ? premioBolsa80 * 0.15 : 0;
      desgloseTexto = `1er Lugar: ${rankingAdmin[0].nombre} -> $${p1.toFixed(0)} MXN (60%)\n2do Lugar: ${rankingAdmin[1]?.nombre || 'N/A'} -> $${p2.toFixed(0)} MXN (25%)\n3er Lugar: ${rankingAdmin[2]?.nombre || 'N/A'} -> $${p3.toFixed(0)} MXN (15%)`;
    }

    const confirmar = window.confirm(`⚠️ ¿DENTRO DE CAJA REAL? ⚠️\n\nVas a cerrar la jornada de forma DEFINITIVA.\n\nFormato: ${tPremio.toUpperCase()}\nBolsa total a entregar: $${premioBolsa80.toFixed(0)} MXN\n\nDesglose de Premiación:\n${desgloseTexto}\n\n¿Confirmas la liquidación de premios?`)
    if (!confirmar) return

    setCalificando(true)
    try {
      for (const pId of Object.keys(resultadosReales || {})) {
        const l_val = marcadoresReales[pId]?.l;
        const v_val = marcadoresReales[pId]?.v;
        
        await supabase.from('partidos').update({ 
          resultado_real: resultadosReales[pId],
          goles_local: (l_val !== undefined && l_val !== '') ? parseInt(l_val) : null,
          goles_visitante: (v_val !== undefined && v_val !== '') ? parseInt(v_val) : null
        }).eq('id', pId)
      }
      await supabase.from('quinielas').update({ goles_totales_real: parseInt(golesReales), estado: 'cerrada' }).eq('id', quiniela.id)
      alert(`🎉 ¡Jornada Cerrada Exitosamente!\n\nRealiza los pagos correspondientes en mostrador.`)
      await cargarPartidosJornada()
    } catch (e) {
      alert('Error al liquidar la jornada.')
    } finally {
      setCalificando(false)
    }
  }

  const agregarPartidoInput = () => {
    const ultimaFecha = partidosNuevos.length > 0 ? partidosNuevos[partidosNuevos.length - 1].fecha_hora : '';
    setPartidosNuevos([...partidosNuevos, { local: '', visitante: '', fecha_hora: ultimaFecha }]);
  }
  
  const actualizarPartidoInput = (index: number, campo: 'local' | 'visitante' | 'fecha_hora', valor: string) => {
    const nuevos = [...partidosNuevos]
    nuevos[index] = { ...nuevos[index], [campo]: valor }
    setPartidosNuevos(nuevos)
  }

  const moverPartido = (index: number, direccion: number) => {
    const nuevos = [...partidosNuevos]
    const temp = nuevos[index]
    nuevos[index] = nuevos[index + direccion]
    nuevos[index + direccion] = temp
    setPartidosNuevos(nuevos)
  }

  const eliminarPartido = (index: number) => {
    const nuevos = partidosNuevos.filter((_, i) => i !== index)
    setPartidosNuevos(nuevos)
  }

  const crearJornadaCompleta = async () => {
    if (!nombreJornada || !fechaCierre) return alert("Ponle nombre a la jornada y fecha de cierre.")
    setCreando(true)
    try {
      const { data: q, error: qErr } = await supabase.from('quinielas').insert([{ 
        nombre_jornada: nombreJornada, 
        precio_ticket: parseInt(precioTicket), 
        fecha_cierre: fechaCierre, 
        tipo_premiacion: tipoPremiacion, 
        estado: 'abierta' 
      }]).select().single()
      
      if (qErr) throw qErr
      
      const partidosOrdenados = [...partidosNuevos].sort((a, b) => {
        if (a.fecha_hora && b.fecha_hora) return new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
        if (a.fecha_hora && !b.fecha_hora) return -1
        if (!a.fecha_hora && b.fecha_hora) return 1
        return 0
      })

      const partidosData = partidosOrdenados.map(p => ({ 
        quiniela_id: q.id, equipo_local: p.local, equipo_visitante: p.visitante, fecha_hora: p.fecha_hora || null 
      }))
      
      await supabase.from('partidos').insert(partidosData)
      localStorage.removeItem('ciberteque_borrador_jornada')
      alert("¡Jornada creada con éxito!")
      setNombreJornada('')
      setFechaCierre('')
      setTipoPremiacion('unico')
      setPartidosNuevos([{ local: '', visitante: '', fecha_hora: '' }])
      setAdminVista('recargas')
    } catch (e) {
      alert("Error al crear la jornada")
    } finally {
      setCreando(false)
    }
  }

  const iniciarEdicionJornada = () => {
    if (!quiniela) return
    setEditandoQuinielaId(quiniela.id)
    setEditNombreJornada(quiniela.nombre_jornada)
    setEditFechaCierre(quiniela.fecha_cierre ? quiniela.fecha_cierre.substring(0, 16) : '')
    setEditTipoPremiacion(quiniela.tipo_premiacion || 'unico')
    setEditPartidos(partidos.map(p => ({
      id: p.id, equipo_local: p.equipo_local, equipo_visitante: p.equipo_visitante, fecha_hora: p.fecha_hora ? p.fecha_hora.substring(0, 16) : ''
    })))
  }

  const actualizarPartidoEditado = (index: number, campo: 'equipo_local' | 'equipo_visitante' | 'fecha_hora', valor: string) => {
    const nuevos = [...editPartidos]
    nuevos[index] = { ...nuevos[index], [campo]: valor }
    setEditPartidos(nuevos)
  }

  const guardarCambiosJornada = async () => {
    if (!editNombreJornada || !editFechaCierre) return alert("El nombre y la fecha de cierre son obligatorios.")
    setGuardandoEdicion(true)
    try {
      const { error: qErr } = await supabase.from('quinielas').update({
          nombre_jornada: editNombreJornada, fecha_cierre: editFechaCierre, tipo_premiacion: editTipoPremiacion
        }).eq('id', editandoQuinielaId)
      if (qErr) throw qErr

      for (const p of editPartidos) {
        const { error: pErr } = await supabase.from('partidos').update({
            equipo_local: p.equipo_local, equipo_visitante: p.equipo_visitante, fecha_hora: p.fecha_hora || null
          }).eq('id', p.id)
        if (pErr) throw pErr
      }
      alert("¡Jornada actualizada!")
      setEditandoQuinielaId(null)
      await cargarPartidosJornada() 
    } catch (error: any) {
      alert("Error: " + error.message)
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const abrirEdicionTicket = (jugador: any) => {
    setEditandoTicketId(jugador.id)
    setEditTicketNombre(jugador.nombre)
    setEditTicketGoles(jugador.prediccionGoles.toString())
    setEditTicketSelecciones({ ...jugador.pronosticosDiccionario })
  }

  const seleccionarOpcionEditTicket = (partidoId: string, opcion: string) => {
    setEditTicketSelecciones({ ...editTicketSelecciones, [partidoId]: opcion })
  }

  const guardarEdicionTicket = async () => {
    if(!editandoTicketId || !editTicketGoles) return alert('El desempate de goles es obligatorio.')
    setGuardandoEdicionTicket(true)
    try {
      await supabase.from('tickets').update({ prediccion_goles_total: parseInt(editTicketGoles) }).eq('id', editandoTicketId)
      await supabase.from('pronosticos').delete().eq('ticket_id', editandoTicketId)
      
      const pronsData = Object.keys(editTicketSelecciones).map(pId => ({
        ticket_id: editandoTicketId,
        partido_id: pId,
        eleccion_usuario: editTicketSelecciones[pId]
      }))
      
      await supabase.from('pronosticos').insert(pronsData)

      alert('✅ ¡Jugada actualizada correctamente!')
      setEditandoTicketId(null)
      await cargarPartidosJornada() 
    } catch(e:any) {
      alert('Error al actualizar jugada: ' + e.message)
    } finally {
      setGuardandoEdicionTicket(false)
    }
  }

  const iniciarEdicionEquipo = (equipo: any) => { 
    setEquipoEditandoId(equipo.id)
    setFormEquipoNombre(equipo.nombre)
    setFormEquipoLogo(equipo.logo_url || '')
    setFormEquipoLiga(equipo.liga || '')
    window.scrollTo({ top: 0, behavior: 'smooth' }) 
  }
  
  const cancelarEdicionEquipo = () => { 
    setEquipoEditandoId(null)
    setFormEquipoNombre('')
    setFormEquipoLogo('')
    setFormEquipoLiga('') 
  }

  const guardarEquipo = async () => {
    if (!formEquipoNombre) return alert('El nombre es obligatorio')
    setGuardandoEquipo(true)
    const urlLogoFinal = formEquipoLogo.trim() || 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
    const ligaFinal = formEquipoLiga.trim() || 'Sin Liga'
    try {
      if (equipoEditandoId) { 
        await supabase.from('equipos').update({ nombre: formEquipoNombre.trim(), logo_url: urlLogoFinal, liga: ligaFinal }).eq('id', equipoEditandoId) 
      } 
      else { 
        const { error } = await supabase.from('equipos').insert([{ nombre: formEquipoNombre.trim(), logo_url: urlLogoFinal, liga: ligaFinal }])
        if (error) { if (error.code === '23505') throw new Error('Equipo ya registrado.'); throw error; } 
      }
      alert('¡Equipo guardado con éxito!')
      cancelarEdicionEquipo()
      await cargarEquiposDB()
    } catch (err: any) { 
      alert(err.message || 'Error al guardar') 
    } finally { 
      setGuardandoEquipo(false) 
    }
  }

  const equiposVisiblesEnGaleria = (equipos || []).filter(e => {
    const coincideTexto = (e.nombre || '').toLowerCase().includes(busquedaEquipo.toLowerCase())
    const coincideLiga = filtroLigaEquipo === 'Todas' || e.liga === filtroLigaEquipo
    return coincideTexto && coincideLiga
  })

  const equiposAgrupados = ligasDinamicas.reduce((acc, liga) => {
    const eq = equiposVisiblesEnGaleria.filter(e => (e.liga || 'Sin Liga') === liga)
    if (eq.length > 0) acc[liga] = eq
    return acc
  }, {} as Record<string, any[]>)

  const buscarClienteParaCaptura = async (tel: string) => {
    setLinkWaReciente(null) 
    setCapTelefono(tel)
    if (tel && tel.length >= 10) {
      const { data } = await supabase.from('usuarios').select('id, nombre').eq('telefono', tel).single()
      if (data) { setCapUsuarioId(data.id); setCapNombre(data.nombre) } 
      else { setCapUsuarioId(null); setCapNombre('') }
    } else {
      setCapUsuarioId(null); setCapNombre('')
    }
  }

  const seleccionarOpcionCaptura = (partidoId: string, opcion: string) => {
    setCapSelecciones({ ...capSelecciones, [partidoId]: opcion })
  }

  const guardarCapturaFisica = async () => {
    if (!capTelefono || !capNombre || !capGoles || !quiniela) return alert('Faltan datos.')
    setGuardandoCaptura(true)
    try {
      let uid = capUsuarioId
      let creditosActuales = 0

      if (!uid) {
        const { data: nu } = await supabase.from('usuarios').insert([{ nombre: capNombre, telefono: capTelefono, creditos_disponibles: 0 }]).select().single()
        uid = nu.id
        creditosActuales = 0
      } else {
        const { data: eu } = await supabase.from('usuarios').select('creditos_disponibles').eq('id', uid).single()
        if (eu) creditosActuales = eu.creditos_disponibles || 0
      }

      const seleccionesFinales = { ...capSelecciones }
      partidos.forEach(p => { if (!seleccionesFinales[p.id]) seleccionesFinales[p.id] = 'E' })
      
      const precio = quiniela.precio_ticket || 1
      let nuevoSaldo = creditosActuales

      if (creditosActuales >= precio) {
        nuevoSaldo = creditosActuales - precio
        await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', uid)
      } else {
        const faltante = precio - creditosActuales
        await supabase.from('transacciones_creditos').insert([{ 
          usuario_id: uid, 
          cantidad: faltante, 
          tipo_movimiento: 'recarga_manual', 
          descripcion: 'Pago parcial/total en mostrador' 
        }])
        nuevoSaldo = 0
        await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', uid)
      }

      const { data: tk } = await supabase.from('tickets').insert([{ usuario_id: uid, quiniela_id: quiniela.id, metodo_ingreso: 'fisico', prediccion_goles_total: parseInt(capGoles) }]).select().single()
      
      const prons = Object.keys(seleccionesFinales).map(pId => ({ ticket_id: tk.id, partido_id: pId, eleccion_usuario: seleccionesFinales[pId] }))
      await supabase.from('pronosticos').insert(prons)
      
      await supabase.from('transacciones_creditos').insert([{ 
        usuario_id: uid, 
        cantidad: -precio, 
        tipo_movimiento: 'juego_ticket_fisico', 
        descripcion: `Ticket físico ${quiniela.nombre_jornada}` 
      }])
      
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(uid, nuevoSaldo)

      const msg = `🎫 *QUINIELA CIBERTEQUE*\nHola ${capNombre}, tu jugada para *${quiniela.nombre_jornada}* se guardó correctamente. ¡Mucha suerte!`
      setLinkWaReciente(`https://wa.me/52${capTelefono}?text=${encodeURIComponent(msg)}`)
      setTicketAImprimir({ nombre: capNombre, telefono: capTelefono, selecciones: seleccionesFinales, goles: capGoles })
      alert('🎟️ ¡Boleto guardado!')
      setCapTelefono(''); setCapNombre(''); setCapSelecciones({}); setCapGoles(''); await cargarPartidosJornada()
    } catch (e: any) { alert(e.message) } finally { setGuardandoCaptura(false) }
  }

  const activarImpresion = (tipo: 'tickets' | 'sabana' | 'recibo') => {
    setTipoImpresion(tipo)
    setTimeout(() => window.print(), 200)
  }

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const d = new Date(fechaDB.substring(0, 16));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  const capturaCerradaPorFecha = quiniela && quiniela.fecha_cierre ? new Date() > new Date(quiniela.fecha_cierre.substring(0, 16)) : false;
  const capturaCerradaPorResultados = (partidos || []).some(p => p.resultado_real !== null);
  const bloqueoCapturaAdmin = capturaCerradaPorFecha || capturaCerradaPorResultados;

  const totalBoletosAdmin = rankingAdmin?.length || 0
  const precioBoletoCrds = quiniela ? (quiniela.precio_ticket || 1) : 1
  const cajaTotalPesos = totalBoletosAdmin * precioBoletoCrds * VALOR_CREDITO
  const cajaPremioPesos = cajaTotalPesos * PORCENTAJE_PREMIO
  const cajaCiberPesos = cajaTotalPesos * PORCENTAJE_ADMIN
  const ganadorActualAdmin = totalBoletosAdmin > 0 ? rankingAdmin[0] : null

  useEffect(() => {
    const handleAfterPrint = () => setTipoImpresion(null)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  // --- RENDER ---
  return (
    <>
      <div className="w-full max-w-4xl bg-slate-900/80 p-6 rounded-2xl border border-blue-900/30 mt-8 shadow-2xl print:hidden animate-in slide-in-from-bottom-4 duration-500">
        
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 border-b border-slate-800 pb-4 gap-4">
          <h2 className="text-2xl font-black text-blue-400 flex items-center gap-2 italic uppercase">
            <span>⚙️</span> CONTROL CIBERTEQUE
          </h2>
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shadow-inner overflow-x-auto w-full lg:w-auto">
            <button onClick={() => setAdminVista('recargas')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'recargas' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>💰 Recargas</button>
            <button onClick={() => setAdminVista('captura')} className={`px-4 py-2 rounded-md font-black text-xs uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1 ${adminVista === 'captura' ? 'bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20' : 'text-amber-500 hover:text-amber-400 hover:bg-slate-800'}`}>⚡ Captura Física</button>
            <button onClick={() => setAdminVista('crear')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'crear' ? 'bg-green-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>➕ Nueva Jornada</button>
            <button onClick={() => setAdminVista('equipos')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'equipos' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>🛡️ Equipos</button>
            <button onClick={() => setAdminVista('resultados')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'resultados' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>⚽ Árbitro / Impresión</button>
          </div>
        </div>

        {/* --- VISTA: RECARGAS --- */}
        {adminVista === 'recargas' && (
           <div className="animate-in fade-in duration-300">
             <div className="flex gap-2 mb-8">
              <input type="text" placeholder="Buscar cliente (Nombre o WhatsApp)..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 transition-all" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarUsuarios()} />
              <button onClick={buscarUsuarios} className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-lg font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-blue-900/40">Buscar</button>
            </div>
            
            <div className="space-y-4">
              {(usuarios || []).map(u => (
                <div key={u.id} className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <p className="font-black text-white uppercase tracking-tight">{u.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">{u.telefono}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] uppercase text-slate-500 font-bold">Saldo Actual:</span>
                        <span className="text-green-400 font-black text-lg drop-shadow-[0_0_8px_rgba(74,222,128,0.2)]">{u.creditos_disponibles}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => verHistorial(u.id)} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all text-white">📜 Historial</button>
                      <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 1)} className="bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all">+1</button>
                      <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 5)} className="bg-green-600 hover:bg-green-500 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all">+5</button>
                      <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 10)} className="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all">+10</button>
                    </div>
                  </div>

                  {historialActivo === u.id && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                      <table className="w-full text-xs text-slate-400">
                        <thead>
                          <tr className="uppercase border-b border-slate-700 text-[10px] font-bold">
                            <th className="pb-2 text-left w-1/4">Fecha</th>
                            <th className="pb-2 text-left w-2/4">Concepto del Movimiento</th>
                            <th className="pb-2 text-center w-[12%]">Cantidad</th>
                            <th className="pb-2 text-right w-[13%] text-blue-400">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let saldoAcumulado = u.creditos_disponibles;
                            return datosHistorial.map((mov: any) => {
                              const saldoEnEseMomento = saldoAcumulado;
                              saldoAcumulado -= mov.cantidad; 
                              return (
                                <tr key={mov.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                  <td className="py-2.5">{new Date(mov.created_at).toLocaleDateString()}</td>
                                  <td className="py-2.5 text-slate-300 font-medium">{mov.descripcion || mov.tipo_movimiento.replace(/_/g, ' ')}</td>
                                  <td className={`py-2.5 text-center font-black ${mov.cantidad > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {mov.cantidad > 0 ? '+' : ''}{mov.cantidad}
                                  </td>
                                  <td className="py-2.5 text-right font-black text-blue-400">{saldoEnEseMomento}</td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                      {datosHistorial.length === 0 && <p className="text-center text-slate-500 text-xs mt-4 italic">No hay movimientos recientes.</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- VISTA: CAPTURA FÍSICA --- */}
        {adminVista === 'captura' && (
          <div className="animate-in fade-in duration-300">
            {quinielasAbiertas.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-bold uppercase w-full mb-1">Selecciona la jornada a capturar:</span>
                {quinielasAbiertas.map(qa => (
                  <button key={qa.id} onClick={() => cargarDetallesQuiniela(qa)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${quiniela?.id === qa.id ? 'bg-amber-500 text-slate-900 shadow-md' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                    {qa.nombre_jornada}
                  </button>
                ))}
              </div>
            )}

            {!quiniela ? (
              <p className="text-center text-slate-500 py-10 font-bold uppercase tracking-widest">No hay jornada activa para capturar.</p>
            ) : (
              <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-6 shadow-inner relative overflow-hidden">
                {bloqueoCapturaAdmin && (
                  <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                    <span className="text-5xl mb-4">🛑</span>
                    <h2 className="text-2xl font-black text-red-500 uppercase tracking-widest mb-2">Captura Bloqueada</h2>
                    <p className="text-slate-300 font-bold text-xs uppercase max-w-sm">
                      {capturaCerradaPorResultados ? 'Ya se ingresaron resultados reales.' : 'La fecha de cierre ha expirado.'}
                    </p>
                  </div>
                )}
                <div className="mb-6 border-b border-amber-900/50 pb-4">
                  <h3 className="text-amber-500 font-black uppercase tracking-widest text-lg flex items-center gap-2">⚡ Captura Rápida: {quiniela.nombre_jornada}</h3>
                  <p className="text-xs text-amber-200/50 uppercase mt-1">Ingresa el papel del cliente rápidamente.</p>
                </div>

                {linkWaReciente && (
                  <div className="mb-6 bg-green-950/40 border border-green-600/50 p-4 rounded-xl text-center shadow-lg shadow-green-900/20 animate-in zoom-in-95">
                    <p className="text-green-400 font-bold text-xs uppercase mb-3">✅ Captura Guardada Exitosamente. Elige una opción:</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                      <a href={linkWaReciente} target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-500 text-white font-black px-5 py-3 rounded-lg text-xs uppercase tracking-widest transition-all shadow-md">
                        📲 Enviar WhatsApp
                      </a>
                      <button onClick={() => activarImpresion('recibo')} className="bg-white hover:bg-slate-200 text-green-900 font-black px-5 py-3 rounded-lg text-xs uppercase tracking-widest transition-all shadow-md">
                        🖨️ Imprimir Recibo Lleno
                      </button>
                    </div>
                    <button onClick={() => setLinkWaReciente(null)} className="block mx-auto mt-4 text-[10px] text-slate-500 hover:text-white uppercase underline">Ocultar esto y capturar otro boleto</button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  <div>
                    <label className="text-[10px] text-amber-500/80 font-bold uppercase mb-2 block">WhatsApp del Papel</label>
                    <input type="text" placeholder="10 dígitos..." value={capTelefono} onChange={(e) => buscarClienteParaCaptura(e.target.value)} className="w-full bg-slate-900 border border-amber-900/50 rounded-lg px-4 py-3 text-white outline-none focus:border-amber-500 font-mono text-lg transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] text-amber-500/80 font-bold uppercase mb-2 block">Nombre del Cliente</label>
                    <input type="text" placeholder="Ej. Juan Pérez" value={capNombre} onChange={(e) => setCapNombre(e.target.value)} className={`w-full bg-slate-900 border rounded-lg px-4 py-3 text-white outline-none font-bold uppercase transition-all ${capUsuarioId ? 'border-green-900/50 text-green-400' : 'border-amber-900/50 focus:border-amber-500'}`} disabled={capUsuarioId !== null} />
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 mb-8">
                  {(partidos || []).map((p, idx) => (
                    <div key={p.id} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                      <div className="flex-1 text-right text-xs font-bold text-slate-300 uppercase pr-3">{p.equipo_local}</div>
                      <div className="flex gap-1 w-[120px]">
                        {['L', 'E', 'V'].map(opc => (
                          <button key={opc} onClick={() => seleccionarOpcionCaptura(p.id, opc)} className={`flex-1 py-1 rounded text-xs font-black border transition-all ${capSelecciones[p.id] === opc ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-600'}`}>{opc}</button>
                        ))}
                      </div>
                      <div className="flex-1 text-left text-xs font-bold text-slate-300 uppercase pl-3">{p.equipo_visitante}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="w-full md:w-1/3">
                    <label className="text-[10px] text-amber-500/80 font-bold uppercase mb-2 block">Desempate (Goles)</label>
                    <input type="number" placeholder="00" value={capGoles} onChange={(e) => setCapGoles(e.target.value)} className="w-full bg-slate-900 border border-amber-900/50 rounded-lg px-4 py-3 text-center text-2xl font-black text-white focus:border-amber-500 outline-none transition-all" />
                  </div>
                  <button onClick={guardarCapturaFisica} disabled={guardandoCaptura} className={`w-full md:w-2/3 py-4 rounded-xl font-black uppercase tracking-widest transition-all ${guardandoCaptura ? 'bg-slate-700 text-slate-500' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(245,158,11,0.4)]'}`}>
                    {guardandoCaptura ? 'Procesando...' : 'Guardar Ticket Físico'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- VISTA: CREAR Y EQUIPOS --- */}
        {adminVista === 'crear' && (
           <div className="space-y-6 animate-in fade-in duration-300">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
             <div>
               <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Nombre de la Jornada</label>
               <input type="text" placeholder="Ej. Jornada 1" value={nombreJornada} onChange={(e) => setNombreJornada(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-green-500 transition-all text-sm font-bold" />
             </div>
             <div>
               <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Cierre de Quiniela</label>
               <input type="datetime-local" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-green-500 transition-all text-sm" />
             </div>
             <div>
               <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Precio (Créditos)</label>
               <input type="number" value={precioTicket} onChange={(e) => setPrecioTicket(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-green-500 transition-all text-center font-black text-sm" />
             </div>
             <div>
               <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Tipo de Premiación</label>
               <select value={tipoPremiacion} onChange={(e: any) => setTipoPremiacion(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-green-500 transition-all text-xs font-bold h-[46px]">
                 <option value="unico">Ganador Único (100% al 1ro)</option>
                 <option value="top2">Top 2 (70% - 30%)</option>
                 <option value="top3">Top 3 (60% - 25% - 15%)</option>
               </select>
             </div>
           </div>
           <div className="bg-slate-950/30 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
             <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">🎯 Filtrar buscador por Liga:</span>
             <select value={ligaFiltroJornada} onChange={(e) => setLigaFiltroJornada(e.target.value)} className="w-full md:w-auto bg-slate-900 text-xs py-2 px-4 rounded-lg border border-slate-700 text-white font-bold outline-none focus:border-green-500">
               <option value="Todas">Mostrar Todas las Ligas</option>
               {ligasDinamicas.map(l => <option key={l} value={l}>{l}</option>)}
             </select>
           </div>
           <div className="space-y-4">
             <label className="text-[10px] text-slate-500 font-bold uppercase block">Partidos de la Jornada</label>
             <datalist id="lista-equipos">
               {equipos.filter(e => ligaFiltroJornada === 'Todas' ? true : e.liga === ligaFiltroJornada).map(e => <option key={e.id} value={e.nombre} />)}
             </datalist>
             {(partidosNuevos || []).map((p, idx) => (
               <div key={idx} className="flex flex-col gap-3 bg-slate-800/30 p-4 rounded-xl border border-slate-800 shadow-sm relative group">
                 <div className="flex justify-between items-center border-b border-slate-700/50 pb-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Partido {idx + 1}</span>
                    <div className="flex gap-1">
                      <button onClick={() => moverPartido(idx, -1)} disabled={idx === 0} className="p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-all" title="Subir">⬆️</button>
                      <button onClick={() => moverPartido(idx, 1)} disabled={idx === partidosNuevos.length - 1} className="p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-all" title="Bajar">⬇️</button>
                      <button onClick={() => eliminarPartido(idx)} disabled={partidosNuevos.length === 1} className="p-1.5 bg-red-950/30 border border-red-900/50 rounded text-red-500 hover:text-red-400 hover:bg-red-900/50 disabled:opacity-30 transition-all ml-2" title="Eliminar Partido">🗑️</button>
                    </div>
                 </div>
                 <div className="flex flex-col md:flex-row items-center gap-3">
                   <input list="lista-equipos" placeholder="Local..." value={p.local} onChange={(e) => actualizarPartidoInput(idx, 'local', e.target.value)} className="flex-1 w-full bg-slate-900 text-sm p-3 rounded-lg border border-slate-700 text-white outline-none focus:border-green-500 font-bold uppercase" />
                   <span className="text-xs font-black text-slate-600 italic">VS</span>
                   <input list="lista-equipos" placeholder="Visita..." value={p.visitante} onChange={(e) => actualizarPartidoInput(idx, 'visitante', e.target.value)} className="flex-1 w-full bg-slate-900 text-sm p-3 rounded-lg border border-slate-700 text-white outline-none focus:border-green-500 font-bold uppercase" />
                 </div>
                 <div className="w-full mt-1">
                    <label className="text-[9px] text-slate-500 font-bold uppercase mb-1 block">Horario del Partido (Opcional)</label>
                    <input type="datetime-local" value={p.fecha_hora} onChange={(e) => actualizarPartidoInput(idx, 'fecha_hora', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-green-500 transition-all text-xs font-bold" />
                 </div>
               </div>
             ))}
             <button onClick={agregarPartidoInput} className="w-full py-4 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 font-black text-[10px] uppercase hover:bg-slate-800 hover:text-white transition-all">+ Agregar otro partido</button>
           </div>
           <button onClick={crearJornadaCompleta} disabled={creando} className="w-full bg-green-600 py-4 rounded-xl font-black uppercase tracking-[0.2em] shadow-xl shadow-green-900/20 hover:scale-[1.02] active:scale-95 transition-all flex justify-center items-center gap-2">
             {creando ? 'Publicando...' : <><span>🚀</span> Publicar Jornada en CiberTeque</>}
           </button>
         </div>
        )}

        {adminVista === 'equipos' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className={`p-6 rounded-2xl border shadow-inner transition-colors ${equipoEditandoId ? 'bg-purple-950/40 border-purple-800/50' : 'bg-slate-950/50 border-slate-800'}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-sm font-black uppercase tracking-wider ${equipoEditandoId ? 'text-purple-400' : 'text-slate-300'}`}>{equipoEditandoId ? '✏️ Editando Equipo' : '🛡️ Registrar Nuevo Equipo'}</h3>
                {equipoEditandoId && <button onClick={cancelarEdicionEquipo} className="text-[10px] font-bold text-slate-400 hover:text-white uppercase underline">Cancelar Edición</button>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Nombre del Equipo</label>
                  <input type="text" placeholder="Ej. Toluca" value={formEquipoNombre} onChange={(e) => setFormEquipoNombre(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-purple-500 font-bold" />
                </div>
                <datalist id="lista-ligas-db">{ligasDinamicas.map(l => <option key={l} value={l} />)}</datalist>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Liga del Equipo</label>
                  <input list="lista-ligas-db" placeholder="Ej. Liga MX" value={formEquipoLiga} onChange={(e) => setFormEquipoLiga(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-purple-500 font-bold" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">URL del Logo (Link ESPN)</label>
                  <input type="text" placeholder="https://..." value={formEquipoLogo} onChange={(e) => setFormEquipoLogo(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white text-xs outline-none focus:border-purple-500 font-mono" />
                </div>
              </div>
              <button onClick={guardarEquipo} disabled={guardandoEquipo} className={`w-full mt-4 text-white py-3 rounded-xl font-black uppercase tracking-wider text-xs transition-all ${equipoEditandoId ? 'bg-purple-600 hover:bg-purple-500' : 'bg-slate-700 hover:bg-slate-600'}`}>{guardandoEquipo ? 'Guardando...' : equipoEditandoId ? '💾 Actualizar Cambios' : '➕ Agregar a la Base de Datos'}</button>
            </div>
            <div>
              <h4 className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-4 block">Buscador y Galería de Equipos</h4>
              <div className="flex flex-col md:flex-row gap-4 mb-6 bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                <input type="text" placeholder="Buscar por nombre..." value={busquedaEquipo} onChange={(e) => setBusquedaEquipo(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500 text-sm" />
                <select value={filtroLigaEquipo} onChange={(e) => setFiltroLigaEquipo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500 text-sm font-bold">
                  <option value="Todas">Todas las Ligas</option>
                  {ligasDinamicas.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              {Object.keys(equiposAgrupados || {}).length === 0 ? (
                <p className="text-center text-slate-500 text-sm italic py-8">No se encontraron equipos.</p>
              ) : (
                Object.keys(equiposAgrupados).sort().map(liga => (
                  <div key={liga} className="mb-8">
                    <h5 className="text-xs text-purple-500 font-black uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">{liga} ({equiposAgrupados[liga]?.length || 0})</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {(equiposAgrupados[liga] || []).map(e => (
                        <div key={e.id} onClick={() => iniciarEdicionEquipo(e)} className={`border p-3 rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all hover:scale-105 group ${equipoEditandoId === e.id ? 'bg-purple-900/30 border-purple-600' : 'bg-slate-800/40 border-slate-800 hover:border-slate-600'}`} title="Clic para editar">
                          <img src={e.logo_url} alt={e.nombre} className="w-10 h-10 object-contain bg-slate-900/80 rounded-full p-1.5 shadow-inner" onError={(evt:any)=>{evt.target.src='https://a.espncdn.com/i/teamlogos/default-soccer-35.png'}} />
                          <span className="text-[10px] font-bold text-slate-200 truncate uppercase w-full text-center group-hover:text-purple-400 transition-colors">{e.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* --- VISTA: RESULTADOS E IMPRESIÓN --- */}
        {adminVista === 'resultados' && (
          <div className="animate-in fade-in duration-300 space-y-6">
             {quinielasAbiertas.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-bold uppercase w-full mb-1">Selecciona la jornada a administrar:</span>
                {quinielasAbiertas.map(qa => (
                  <button key={qa.id} onClick={() => cargarDetallesQuiniela(qa)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${quiniela?.id === qa.id ? 'bg-red-600 text-white shadow-md' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                    {qa.nombre_jornada}
                  </button>
                ))}
              </div>
            )}

             {!quiniela ? (
              <p className="text-center text-slate-500 py-10 font-bold uppercase tracking-widest">No hay jornada abierta actualmente.</p>
            ) : (
              <>
                <div className="flex justify-end">
                  <button onClick={iniciarEdicionJornada} className="bg-slate-800 border border-slate-700 hover:border-slate-500 text-white text-[11px] font-black uppercase px-4 py-2 rounded-xl transition-all shadow-md">
                    ✏️ Editar Jornada / Partidos / Premios
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950/80 p-5 rounded-2xl border border-red-900/30 shadow-inner">
                  <div className="text-center p-3 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Boletos Totales</span>
                    <span className="text-2xl font-black text-white">{totalBoletosAdmin}</span>
                  </div>
                  <div className="text-center p-3 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Caja Recaudada</span>
                    <span className="text-2xl font-black text-white">${cajaTotalPesos} <span className="text-[10px] text-slate-500">MXN</span></span>
                  </div>
                  <div className="text-center p-3 bg-slate-900 border border-amber-500/20 rounded-xl bg-amber-500/5">
                    <span className="block text-[10px] text-amber-500 font-black uppercase">Premio Ganador (80%)</span>
                    <span className="text-2xl font-black text-amber-400">${cajaPremioPesos.toFixed(0)} <span className="text-[10px] text-amber-600">MXN</span></span>
                  </div>
                  <div className="text-center p-3 bg-slate-900 border border-green-500/20 rounded-xl bg-green-500/5">
                    <span className="block text-[10px] text-green-500 font-black uppercase">Tu Ganancia Ciber (20%)</span>
                    <span className="text-2xl font-black text-green-400">${cajaCiberPesos.toFixed(0)} <span className="text-[10px] text-green-600">MXN</span></span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/50 rounded-xl text-center text-xs border border-slate-800 text-slate-400 font-bold uppercase">
                  🏆 Formato de Premiación: <span className="text-blue-400 font-black">{quiniela.tipo_premiacion === 'unico' ? 'GANADOR ÚNICO (100%)' : quiniela.tipo_premiacion === 'top2' ? 'TOP 2 (70% - 30%)' : 'TOP 3 (60% - 25% - 15%)'}</span>
                </div>

                <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-md">
                  <div className="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">🎫 Boletos Registrados ({totalBoletosAdmin})</h3>
                    {ganadorActualAdmin && <span className="text-[10px] text-amber-500 font-bold uppercase bg-amber-900/30 px-2 py-1 rounded">Líder: {ganadorActualAdmin.nombre}</span>}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {totalBoletosAdmin > 0 ? (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/50 text-slate-500 uppercase sticky top-0 z-10 shadow-sm">
                          <tr>
                            <th className="p-3">Posición / Jugador</th>
                            <th className="p-3 text-center">Goles</th>
                            <th className="p-3 text-center text-green-400">Aciertos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {(rankingAdmin || []).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 font-bold text-slate-300 uppercase flex items-center justify-between">
                                <div className="flex items-center">
                                  <span className={`inline-block w-5 h-5 text-center leading-5 rounded-full text-[10px] mr-2 font-black ${i===0?'bg-amber-500 text-slate-950':i===1?'bg-slate-400 text-slate-950':i===2?'bg-amber-700 text-white':'bg-slate-800 text-slate-400'}`}>{i+1}</span>
                                  {r.nombre}
                                </div>
                                <div className="flex">
                                  {/* 🔥 BOTÓN PARA COMPARTIR POR WHATSAPP */}
                                  <button onClick={() => enviarWhatsAppBoleto(r)} className="text-[14px] text-green-400 hover:text-green-300 p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-all shadow-sm mr-1" title="Enviar confirmación por WhatsApp">📲</button>
                                  {/* 🔥 BOTÓN DE EDITAR JUGADA */}
                                  <button onClick={() => abrirEdicionTicket(r)} className="text-[14px] text-blue-400 hover:text-blue-300 p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-all shadow-sm mr-1" title="Editar Pronósticos / Goles de este jugador">✏️</button>
                                  <button onClick={() => { 
                                    setTicketAImprimir({ 
                                      nombre: r.nombre, 
                                      telefono: r.telefono || 'Registrado en sistema', 
                                      selecciones: r.pronosticosDiccionario, 
                                      goles: r.prediccionGoles 
                                    }); 
                                    activarImpresion('recibo'); 
                                  }} className="text-[14px] text-slate-500 hover:text-white p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-all shadow-sm" title="Imprimir Recibo de este jugador">🖨️</button>
                                </div>
                              </td>
                              <td className="p-3 text-center text-slate-500 font-mono">{r.prediccionGoles}</td>
                              <td className="p-3 text-center font-black text-green-400">{r.puntos}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-center text-slate-600 text-xs py-6 font-bold uppercase tracking-widest italic">Aún no hay boletos vendidos en esta jornada.</p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 text-center flex flex-col md:flex-row justify-center items-center gap-4">
                  <div className="text-left md:mr-6">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Opciones de Impresión / Difusión</p>
                    <p className="text-sm text-white font-black uppercase">{quiniela.nombre_jornada}</p>
                  </div>
                  
                  <button onClick={() => activarImpresion('tickets')} className="bg-white hover:bg-slate-200 text-slate-900 font-black px-4 py-3 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center gap-2">
                    🖨️ Boletos en Blanco
                  </button>

                  <button onClick={() => activarImpresion('sabana')} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-3 rounded-xl text-xs uppercase tracking-widest shadow-md shadow-blue-900/20 transition-all flex items-center gap-2">
                    📊 Sábana de Jugadas (PDF)
                  </button>

                  <button onClick={compartirAvanceGrupo} className="bg-green-600 hover:bg-green-500 text-white font-black px-4 py-3 rounded-xl text-xs uppercase tracking-widest shadow-md shadow-green-900/20 transition-all flex items-center gap-2">
                    📢 Copiar Avance para WhatsApp
                  </button>
                </div>

                {/* 🔥 SECCIÓN DE CAPTURA DE MARCADORES EXACTOS */}
                <div className="space-y-3">
                  {(partidos || []).map((partido) => {
                    const seleccionado = resultadosReales[partido.id];
                    return (
                      <div key={partido.id} className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex w-full md:w-1/2 justify-between items-center text-sm font-bold uppercase">
                          <span className="w-2/5 text-right text-slate-200 truncate">{partido.equipo_local}</span>
                          <span className="w-1/5 text-center text-slate-600 text-xs italic">VS</span>
                          <span className="w-2/5 text-left text-slate-200 truncate">{partido.equipo_visitante}</span>
                        </div>
                        
                        <div className="flex w-full md:w-auto items-center justify-center gap-3">
                          {/* Inputs de marcador exacto (ahora con placeholder vacío para no confundir) */}
                          <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-lg border border-slate-700">
                            <input 
                              type="number" 
                              placeholder="-" 
                              value={marcadoresReales[partido.id]?.l || ''} 
                              onChange={(e) => handleMarcadorExacto(partido.id, 'l', e.target.value)} 
                              className="w-10 h-10 bg-slate-950 rounded text-center font-black text-lg text-white outline-none focus:border-red-500 border border-transparent transition-all"
                            />
                            <span className="text-slate-500 font-black">-</span>
                            <input 
                              type="number" 
                              placeholder="-" 
                              value={marcadoresReales[partido.id]?.v || ''} 
                              onChange={(e) => handleMarcadorExacto(partido.id, 'v', e.target.value)} 
                              className="w-10 h-10 bg-slate-950 rounded text-center font-black text-lg text-white outline-none focus:border-red-500 border border-transparent transition-all"
                            />
                          </div>

                          {/* Botones visuales automáticos */}
                          <div className="flex gap-1 ml-2">
                            {['L', 'E', 'V'].map((opc) => (
                              <div key={opc} className={`w-8 h-8 flex items-center justify-center rounded font-black text-xs transition-all ${seleccionado === opc ? 'bg-red-600 shadow-md shadow-red-900/40 text-white' : 'bg-slate-900/50 border border-slate-800 text-slate-600'}`}>
                                {opc}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* CAMPO DE GOLES ACTUALIZADO: AHORA ES TOTALMENTE MANUAL */}
                <div className="mt-6 p-5 bg-red-950/10 border border-red-900/40 rounded-xl max-w-xs mx-auto text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-amber-500"></div>
                  <label className="block text-red-500 font-black uppercase text-[10px] tracking-wider mb-1">Resultado Oficial (Suma)</label>
                  <p className="text-slate-500 text-[9px] uppercase mb-3 font-bold">Ingresa el total acumulado manualmente</p>
                  <input type="number" placeholder="Ej. 14" value={golesReales} onChange={(e) => setGolesReales(e.target.value)} className="w-full bg-slate-950 border border-red-900/30 rounded-lg px-3 py-2 text-center text-2xl font-black text-white focus:border-red-500 outline-none transition-all" />
                </div>

                <div className="flex flex-col sm:flex-row justify-center items-center gap-4 border-t border-slate-800 pt-6">
                  <button onClick={guardarYCalificar} disabled={calificando || Object.keys(resultadosReales || {}).length === 0} className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${calificando ? 'bg-slate-800 text-slate-600' : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white shadow-md'}`}>
                    💾 Guardar Avance en Vivo
                  </button>
                  <button onClick={cerrarJornadaDefinitivo} disabled={calificando || totalBoletosAdmin === 0} className={`w-full sm:w-auto px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${calificando || totalBoletosAdmin === 0 ? 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed' : 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-950/50 hover:scale-105 active:scale-95'}`}>
                    🏆 Cerrar Jornada y Liquidar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 📜 VENTANA MODAL FLOTANTE: EDICIÓN EN CALIENTE DE JORNADA */}
      {editandoQuinielaId && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 max-w-2xl w-full p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 my-8">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-tight">✏️ Editar Configuración de Jornada</h3>
              <button onClick={() => setEditandoQuinielaId(null)} className="text-slate-500 hover:text-slate-300 font-mono text-xl">✕</button>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Nombre Jornada</label>
                  <input type="text" value={editNombreJornada} onChange={(e) => setEditNombreJornada(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-xs font-bold outline-none uppercase focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Fecha de Cierre</label>
                  <input type="datetime-local" value={editFechaCierre} onChange={(e) => setEditFechaCierre(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-xs outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Formato Premiación</label>
                  <select value={editTipoPremiacion} onChange={(e: any) => setEditTipoPremiacion(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-xs font-bold outline-none focus:border-blue-500 h-[38px]">
                    <option value="unico">Ganador Único (100%)</option>
                    <option value="top2">Top 2 (70% - 30%)</option>
                    <option value="top3">Top 3 (60% - 25% - 15%)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 mt-2">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block mb-3">Modificar Partidos de esta Jornada</span>
                <div className="space-y-3">
                  {editPartidos.map((p, idx) => (
                    <div key={p.id} className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl space-y-2">
                      <div className="text-[9px] font-black text-slate-500 uppercase">Partido {idx + 1}</div>
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <input type="text" value={p.equipo_local} onChange={(e) => actualizarPartidoEditado(idx, 'equipo_local', e.target.value)} className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-bold uppercase outline-none focus:border-blue-500" placeholder="Local" />
                        <span className="text-[10px] text-slate-600 font-black italic">VS</span>
                        <input type="text" value={p.equipo_visitante} onChange={(e) => actualizarPartidoEditado(idx, 'equipo_visitante', e.target.value)} className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-bold uppercase outline-none focus:border-blue-500" placeholder="Visitante" />
                      </div>
                      <div>
                        <label className="text-[8px] text-slate-500 font-bold uppercase block mb-0.5">Horario Particular</label>
                        <input type="datetime-local" value={p.fecha_hora} onChange={(e) => actualizarPartidoEditado(idx, 'fecha_hora', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-white text-[11px] outline-none focus:border-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 border-t border-slate-800 pt-4">
              <button onClick={() => setEditandoQuinielaId(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl uppercase text-xs tracking-wider transition-all">
                Cancelar
              </button>
              <button onClick={guardarCambiosJornada} disabled={guardandoEdicion} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-xs tracking-wider transition-all shadow-lg shadow-blue-900/40">
                {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 VENTANA MODAL FLOTANTE: EDITAR JUGADA ESPECÍFICA (TICKET) */}
      {editandoTicketId && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-blue-900/50 max-w-lg w-full p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">✏️ Editar Jugada</h3>
                <p className="text-xs text-slate-400 font-bold uppercase">{editTicketNombre}</p>
              </div>
              <button onClick={() => setEditandoTicketId(null)} className="text-slate-500 hover:text-slate-300 font-mono text-xl">✕</button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 mb-4">
              {partidos.map((p, idx) => (
                <div key={p.id} className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center">
                  <div className="flex-1 text-right text-[10px] font-bold text-slate-300 uppercase pr-2 truncate">{p.equipo_local}</div>
                  <div className="flex gap-1 w-[110px]">
                    {['L', 'E', 'V'].map(opc => (
                      <button 
                        key={opc} 
                        onClick={() => seleccionarOpcionEditTicket(p.id, opc)} 
                        className={`flex-1 py-1 rounded text-xs font-black border transition-all ${editTicketSelecciones[p.id] === opc ? 'bg-blue-500 border-blue-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                      >
                        {opc}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 text-left text-[10px] font-bold text-slate-300 uppercase pl-2 truncate">{p.equipo_visitante}</div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
              <label className="text-[10px] text-slate-400 font-bold uppercase mb-2 block text-center">Goles de Desempate de este jugador</label>
              <input 
                type="number" 
                value={editTicketGoles} 
                onChange={(e) => setEditTicketGoles(e.target.value)} 
                className="w-full max-w-[120px] mx-auto block bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-center text-xl font-black text-white focus:border-blue-500 outline-none transition-all" 
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditandoTicketId(null)} className="w-1/3 bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl uppercase text-xs tracking-wider transition-all">
                Cancelar
              </button>
              <button onClick={guardarEdicionTicket} disabled={guardandoEdicionTicket} className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-xs tracking-wider transition-all shadow-lg shadow-blue-900/40">
                {guardandoEdicionTicket ? 'Guardando...' : '💾 Guardar Corrección'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SECCIÓN DE IMPRESIÓN --- */}
      {/* 1. Imprime 2 boletos en blanco por hoja */}
      {quiniela && adminVista === 'resultados' && tipoImpresion === 'tickets' && (
        <div className="hidden print:flex print:flex-row print:justify-between print:w-full print:bg-white print:text-black print:fixed print:inset-0 print:p-8 print:m-0 z-50">
          {[1, 2].map((num) => (
            <div className="w-[48%] border-2 border-black rounded-2xl p-4 bg-white flex flex-col justify-between" key={num}>
              <div>
                <div className="text-center mb-4">
                  <h1 className="font-black text-3xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                  <p className="text-xs font-bold uppercase tracking-widest border-b-2 border-blue-900 inline-block pb-1 mt-1 text-blue-900">Quiniela Deportiva</p>
                  <div className="mt-2 text-[10px] font-black uppercase bg-blue-900 text-white py-1 px-2 rounded">Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}</div>
                </div>
                <h2 className="text-center font-black text-lg uppercase mb-4 bg-amber-400 py-1 border-y-2 border-black text-black">{quiniela.nombre_jornada}</h2>
                <div className="mb-4 space-y-3">
                  <div className="flex justify-between items-end border-b border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">Nombre:</span><span className="w-4/5"></span></div>
                  <div className="flex justify-between items-end border-b border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">WhatsApp:</span><span className="w-4/5"></span></div>
                </div>
                <table className="w-full text-sm mb-4 border-collapse table-fixed">
                  <thead><tr className="bg-blue-900 text-white text-[8px] uppercase"><th className="border-2 border-black p-1 text-right w-[40%]">Local</th><th className="border-2 border-black p-1 text-center w-[6%]">L</th><th className="border-2 border-black p-1 text-center w-[6%]">E</th><th className="border-2 border-black p-1 text-center w-[6%]">V</th><th className="border-2 border-black p-1 text-left w-[40%]">Visita</th></tr></thead>
                  <tbody>
                    {(partidos || []).map((p) => {
                      const logoL = obtenerLogo(p.equipo_local)
                      const logoV = obtenerLogo(p.equipo_visitante)
                      return (
                        <tr key={p.id}>
                          <td className="border border-black p-1 text-right overflow-hidden"><div className="flex items-center justify-end gap-1"><span className="font-bold uppercase text-[7px] truncate max-w-[80%]">{p.equipo_local}</span>{logoL ? <img src={logoL} alt="" className="w-4 h-4 object-contain" /> : <div className="w-3 h-3 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}</div></td>
                          <td className="border border-black p-0.5 text-center font-bold text-[10px]"></td><td className="border border-black p-0.5 text-center font-bold text-[10px]"></td><td className="border border-black p-0.5 text-center font-bold text-[10px]"></td>
                          <td className="border border-black p-1 text-left overflow-hidden"><div className="flex items-center justify-start gap-1">{logoV ? <img src={logoV} alt="" className="w-4 h-4 object-contain" /> : <div className="w-3 h-3 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}<span className="font-bold uppercase text-[7px] truncate max-w-[80%]">{p.equipo_visitante}</span></div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="border-2 border-black p-3 text-center rounded-xl bg-gray-100 mt-6"><span className="font-bold uppercase text-[9px] block mb-2">Desempate (Total de Goles):</span><div className="w-16 border-b-2 border-black mx-auto h-4"></div></div>
                <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">Costo del Boleto: {quiniela.precio_ticket} {quiniela.precio_ticket === 1 ? 'Crédito' : 'Créditos'}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-black border-dashed">
                <p className="text-[6px] text-justify leading-tight font-semibold uppercase"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Imprime SOLO 1 recibo relleno en la hoja para un cliente */}
      {quiniela && (tipoImpresion === 'recibo') && ticketAImprimir && (
        <div className="hidden print:flex print:flex-col print:items-start print:w-full print:bg-white print:text-black print:fixed print:inset-0 print:p-8 print:m-0 z-50">
          <div className="w-full max-w-sm border-2 border-black rounded-2xl p-4 bg-white flex flex-col justify-between">
            <div>
              <div className="text-center mb-4">
                <h1 className="font-black text-3xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                <p className="text-xs font-bold uppercase tracking-widest border-b-2 border-blue-900 inline-block pb-1 mt-1 text-blue-900">RECIBO DE JUGADA</p>
                <div className="mt-2 text-[10px] font-black uppercase bg-blue-900 text-white py-1 px-2 rounded">Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}</div>
              </div>
              <h2 className="text-center font-black text-lg uppercase mb-4 bg-amber-400 py-1 border-y-2 border-black text-black">{quiniela.nombre_jornada}</h2>
              <div className="mb-4 space-y-3">
                <div className="flex justify-between items-end border-b border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">Nombre:</span><span className="font-black text-sm uppercase">{ticketAImprimir.nombre}</span></div>
                <div className="flex justify-between items-end border-b border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">WhatsApp:</span><span className="font-black text-sm uppercase">{ticketAImprimir.telefono}</span></div>
              </div>
              <table className="w-full text-sm mb-4 border-collapse table-fixed">
                <thead><tr className="bg-blue-900 text-white text-[8px] uppercase"><th className="border-2 border-black p-1 text-right w-[40%]">Local</th><th className="border-2 border-black p-1 text-center w-[6%]">L</th><th className="border-2 border-black p-1 text-center w-[6%]">E</th><th className="border-2 border-black p-1 text-center w-[6%]">V</th><th className="border-2 border-black p-1 text-left w-[40%]">Visita</th></tr></thead>
                <tbody>
                  {(partidos || []).map((p) => {
                    const logoL = obtenerLogo(p.equipo_local)
                    const logoV = obtenerLogo(p.equipo_visitante)
                    return (
                      <tr key={p.id}>
                        <td className="border border-black p-1 text-right overflow-hidden bg-gray-50"><div className="flex items-center justify-end gap-1"><span className="font-bold uppercase text-[7px] truncate max-w-[80%]">{p.equipo_local}</span>{logoL ? <img src={logoL} alt="" className="w-4 h-4 object-contain" /> : <div className="w-3 h-3 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}</div></td>
                        <td className="border border-black p-0.5 text-center font-black text-xs text-blue-800">{ticketAImprimir.selecciones[p.id] === 'L' ? 'X' : ''}</td><td className="border border-black p-0.5 text-center font-black text-xs text-blue-800">{ticketAImprimir.selecciones[p.id] === 'E' ? 'X' : ''}</td><td className="border border-black p-0.5 text-center font-black text-xs text-blue-800">{ticketAImprimir.selecciones[p.id] === 'V' ? 'X' : ''}</td>
                        <td className="border border-black p-1 text-left overflow-hidden bg-gray-50"><div className="flex items-center justify-start gap-1">{logoV ? <img src={logoV} alt="" className="w-4 h-4 object-contain" /> : <div className="w-3 h-3 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}<span className="font-bold uppercase text-[7px] truncate max-w-[80%]">{p.equipo_visitante}</span></div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="border-2 border-black p-2 text-center rounded-xl bg-gray-100 mt-6 flex justify-between items-center px-4"><span className="font-bold uppercase text-[9px]">Desempate (Goles):</span><span className="font-black text-xl">{ticketAImprimir.goles}</span></div>
              <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">Costo del Boleto: {quiniela.precio_ticket} {quiniela.precio_ticket === 1 ? 'Crédito' : 'Créditos'}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-black border-dashed">
              <p className="text-[6px] text-justify leading-tight font-semibold uppercase"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
            </div>
          </div>
        </div>
      )}

      {quiniela && adminVista === 'resultados' && tipoImpresion === 'sabana' && (
        <div className="hidden print:block print:w-full print:bg-white print:text-black print:fixed print:inset-0 print:p-6 print:m-0 z-50">
          <div className="text-center mb-6">
            <h1 className="font-black text-2xl uppercase tracking-widest text-blue-900 border-b-2 border-blue-900 inline-block pb-1">SÁBANA OFICIAL - CIBERTEQUE</h1>
            <h2 className="text-xl font-bold uppercase mt-2">{quiniela.nombre_jornada}</h2>
            <p className="text-[10px] font-bold mt-1 text-gray-500 uppercase">Boletos Registrados: {totalBoletosAdmin} | Premio en Bolsa: ${cajaPremioPesos.toFixed(0)} MXN</p>
          </div>
          <table className="w-full border-collapse border border-black text-[9px] uppercase font-mono">
            <thead>
              <tr className="bg-gray-200"><th className="border border-black p-2 text-left">Jugador</th>{partidos.map((p, i) => (<th key={p.id} className="border border-black p-1 text-center w-12" title={`${p.equipo_local} vs ${p.equipo_visitante}`}>P{i+1}</th>))}<th className="border border-black p-2 text-center">Goles</th></tr>
            </thead>
            <tbody>
              {rankingAdmin.map((r, index) => (
                <tr key={index} className="border-b border-gray-300">
                  <td className="border border-black p-2 font-bold">{r.nombre}</td>
                  {partidos.map(p => {
                    const pick = r.pronosticosDiccionario?.[p.id] || '-'
                    return (<td key={p.id} className={`border border-black p-1 text-center font-black ${pick === 'L' ? 'text-blue-800' : pick === 'E' ? 'text-green-800' : pick === 'V' ? 'text-red-800' : ''}`}>{pick}</td>)
                  })}
                  <td className="border border-black p-2 text-center font-bold bg-gray-50">{r.prediccionGoles}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-8 text-center text-[10px] font-bold text-gray-500 uppercase">Documento generado automáticamente por el sistema CiberTeque. Todos los derechos reservados.</div>
        </div>
      )}
    </>
  )
}