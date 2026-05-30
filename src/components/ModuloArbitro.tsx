'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ModuloArbitroProps {
  actualizarSaldoGlobal?: (id: string, nuevo: number) => void;
}

export default function ModuloArbitro({ actualizarSaldoGlobal }: ModuloArbitroProps) {
  // 🌐 CONSTANTES GLOBALES
  const ENLACE_PUBLICO_RANKING = "https://ciberteque-quiniela.vercel.app/"
  const VALOR_CREDITO = 30 
  const PORCENTAJE_PREMIO = 0.80 
  const PORCENTAJE_ADMIN = 0.20 

  // --- ESTADOS ---
  const [equipos, setEquipos] = useState<any[]>([])
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
  const [busquedaJugador, setBusquedaJugador] = useState('')

  // Estados para Edición de Jornada
  const [editandoQuinielaId, setEditandoQuinielaId] = useState<string | null>(null)
  const [editNombreJornada, setEditNombreJornada] = useState('')
  const [editFechaCierre, setEditFechaCierre] = useState('')
  const [editTipoPremiacion, setEditTipoPremiacion] = useState<'unico' | 'top2' | 'top3' | 'promo_unico' | 'promo_top2'>('unico')
  const [editPartidos, setEditPartidos] = useState<any[]>([])
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  // Estados para Edición de Ticket (Jugada)
  const [editandoTicketId, setEditandoTicketId] = useState<string | null>(null)
  const [editTicketNombre, setEditTicketNombre] = useState('')
  const [editTicketGoles, setEditTicketGoles] = useState('')
  const [editTicketSelecciones, setEditTicketSelecciones] = useState<Record<string, string>>({})
  const [guardandoEdicionTicket, setGuardandoEdicionTicket] = useState(false)

  // --- EFECTOS ---
  useEffect(() => {
    cargarEquiposDB()
    cargarPartidosJornada()
  }, [])

  useEffect(() => {
    const handleAfterPrint = () => setTipoImpresion(null)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

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
    setBusquedaJugador('')
    
    const res: Record<string, string> = {}
    const marcs: Record<string, { l: string, v: string }> = {}
    
    let sumaGolesCalculada = 0;
    let hayGoles = false;
    
    qData.partidos.forEach((p: any) => { 
      if (p.resultado_real) res[p.id] = p.resultado_real;
      
      if (p.goles_local !== null && p.goles_local !== undefined && p.goles_visitante !== null && p.goles_visitante !== undefined) {
        marcs[p.id] = { l: p.goles_local.toString(), v: p.goles_visitante.toString() };
        sumaGolesCalculada += p.goles_local + p.goles_visitante;
        hayGoles = true;
      }
    })
    
    setResultadosReales(res)
    setMarcadoresReales(marcs) 
    
    if (hayGoles) {
      setGolesReales(sumaGolesCalculada.toString());
    } else {
      setGolesReales(qData.goles_totales_real !== null ? qData.goles_totales_real.toString() : '');
    }

    const { data: tData } = await supabase.from('tickets').select('id, usuario_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)').eq('quiniela_id', qData.id)
    const { data: uData } = await supabase.from('usuarios').select('id, nombre, telefono, creditos_disponibles')
    const mapaU: Record<string, any> = {}
    if (uData) uData.forEach(u => mapaU[u.id] = { nombre: u.nombre, telefono: u.telefono, creditos: u.creditos_disponibles })
    
    if (tData) {
      const rCalc = tData.map(ticket => {
        let pts = 0
        const prons: Record<string, string> = {}
        ticket.pronosticos.forEach((pr: any) => {
          prons[pr.partido_id] = pr.eleccion_usuario
          const p = qData.partidos.find((par: any) => par.id === pr.partido_id)
          if (p && p.resultado_real === pr.eleccion_usuario) pts++
        })
        
        const golesRealesAct = hayGoles ? sumaGolesCalculada : (qData.goles_totales_real !== null ? qData.goles_totales_real : -1);
        const golesDiff = golesRealesAct !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesRealesAct) : 999;

        return { 
          id: ticket.id, 
          usuario_id: ticket.usuario_id,
          nombre: mapaU[ticket.usuario_id]?.nombre || 'Mostrador', 
          telefono: mapaU[ticket.usuario_id]?.telefono || '', 
          creditos_disponibles: mapaU[ticket.usuario_id]?.creditos || 0,
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

  const handleMarcadorExacto = (partidoId: string, tipo: 'l' | 'v', valor: string) => {
    const numValor = valor.replace(/[^0-9]/g, ''); 
    
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

    partidos.forEach(p => {
      const marcadorP = nuevosMarcadores[p.id] || { l: '', v: '' };
      const ml = parseInt(marcadorP.l);
      const mv = parseInt(marcadorP.v);
      
      if (marcadorP.l !== '' && marcadorP.v !== '' && !isNaN(ml) && !isNaN(mv)) {
        if (ml > mv) nuevosResultados[p.id] = 'L';
        else if (ml === mv) nuevosResultados[p.id] = 'E';
        else nuevosResultados[p.id] = 'V';
      }

      if (!isNaN(ml)) { sumaTotal += ml; hayGoles = true; }
      if (!isNaN(mv)) { sumaTotal += mv; hayGoles = true; }
    });
    
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
    const precioBoletoCrds = quiniela.precio_ticket ?? 1;
    let bolsaPesos = totalBoletosAdmin * precioBoletoCrds * VALOR_CREDITO * PORCENTAJE_PREMIO;
    
    const tPremio = quiniela.tipo_premiacion || 'unico';
    if (tPremio === 'promo_unico') bolsaPesos = VALOR_CREDITO;
    else if (tPremio === 'promo_top2') bolsaPesos = VALOR_CREDITO * 2;

    let texto = `🏆 *AVANCE DE QUINIELA: ${quiniela.nombre_jornada}* 🏆\n\n`;
    texto += `⚽ Partidos finalizados: *${partidosJugados} de ${partidos.length}*\n`;
    
    if (tPremio.startsWith('promo')) {
      texto += `🎁 Bolsa Promocional Garantizada: *$${bolsaPesos.toFixed(0)} MXN*\n\n`;
    } else {
      texto += `💰 Bolsa Actual: *$${bolsaPesos.toFixed(0)} MXN*\n\n`;
    }
    
    texto += `🔥 *TOP LÍDERES ACTUALES* 🔥\n`;
    const topJugadores = rankingAdmin.slice(0, 10);
    if (topJugadores.length === 0) {
      texto += `Aún no hay participantes.\n`;
    } else {
      topJugadores.forEach((r, i) => {
        // 🔥 MEDALLAS SÓLO PARA LOS PRIMEROS 3 LUGARES 🔥
        let medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔹';
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

    let seleccionesTexto = '';
    partidos.forEach(p => {
      const sel = jugador.pronosticosDiccionario[p.id];
      const pick = sel === 'L' ? p.equipo_local : sel === 'V' ? p.equipo_visitante : 'Empate';
      seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
    });

    const msg = `🎫 *QUINIELA CIBERTEQUE*\nHola ${jugador.nombre}, tu jugada para *${quiniela.nombre_jornada}* está registrada correctamente.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate (Goles): *${jugador.prediccionGoles}*\n\nPuedes seguir el ranking en vivo y revisar tus aciertos aquí:\n👉 ${ENLACE_PUBLICO_RANKING}\n\n🍀 ¡Mucha suerte!`;
    
    window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  const cerrarJornadaDefinitivo = async () => {
    if (!quiniela) return
    if (golesReales === '') return alert('🚨 Ingresa primero el "Resultado Oficial" de goles totales.')
    if (!rankingAdmin || rankingAdmin.length === 0) return alert('No hay tickets registrados.')

    const totalBoletos = rankingAdmin.length || 0;
    const precioBoletoCrds = quiniela.precio_ticket ?? 1;
    const totalRecaudadoPesos = totalBoletos * precioBoletoCrds * VALOR_CREDITO;
    const premioBolsa80 = totalRecaudadoPesos * PORCENTAJE_PREMIO;
    const tPremio = quiniela.tipo_premiacion || 'unico';

    let desgloseTexto = '';
    
    // 🔥 ESTABLECEMOS EL TIPO CON "lugar" PARA EL CONCEPTO EXACTO 🔥
    const ganadoresAPagar: { id: string, nombre: string, cantidad: number, lugar: string }[] = [];

    const grupos: any[][] = [];
    if (rankingAdmin && rankingAdmin.length > 0) {
      let currentGroup = [rankingAdmin[0]];
      for (let i = 1; i < rankingAdmin.length; i++) {
        const prev = rankingAdmin[i - 1];
        const curr = rankingAdmin[i];
        if (curr.puntos === prev.puntos && curr.golesDiff === prev.golesDiff) {
          currentGroup.push(curr);
        } else {
          grupos.push(currentGroup);
          currentGroup = [curr];
        }
      }
      grupos.push(currentGroup);
    }

    if (tPremio === 'unico' || tPremio === 'top2' || tPremio === 'top3') {
      let porcentajes: number[] = [];
      if (tPremio === 'unico') porcentajes = [1.0];
      else if (tPremio === 'top2') porcentajes = [0.70, 0.30];
      else if (tPremio === 'top3') porcentajes = [0.60, 0.25, 0.15];

      let lugarActual = 0; 
      
      for (let i = 0; i < grupos.length; i++) {
        const grupo = grupos[i];
        const lugaresTomados = grupo.length;
        let porcentajeTotalGrupo = 0;
        
        for (let j = 0; j < lugaresTomados; j++) {
          if (lugarActual + j < porcentajes.length) {
            porcentajeTotalGrupo += porcentajes[lugarActual + j];
          }
        }
        
        if (porcentajeTotalGrupo > 0) {
          const premioPorPersona = (premioBolsa80 * porcentajeTotalGrupo) / grupo.length;
          const porcentajePorPersonaTexto = ((porcentajeTotalGrupo * 100) / grupo.length).toFixed(1);
          
          desgloseTexto += `\n🏅 Nivel de Premiación ${i + 1} (${grupo.length} jugador/es):\n`;
          grupo.forEach(jugador => {
            desgloseTexto += `- ${jugador.nombre} -> $${premioPorPersona.toFixed(0)} MXN (${porcentajePorPersonaTexto}%)\n`;
          });
        }
        
        lugarActual += lugaresTomados;
        if (lugarActual >= porcentajes.length) break; 
      }
    } 
    else if (tPremio === 'promo_unico' || tPremio === 'promo_top2') {
      desgloseTexto = `🎁 EVENTO PROMOCIONAL 🎁\n`;
      const grupo1 = grupos[0]; 

      desgloseTexto += `\n🥇 1er Nivel (${grupo1.length} empatados):\n`;
      grupo1.forEach(jugador => {
        desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
        // 🔥 ASIGNAMOS EL TEXTO EXACTO DEL PREMIO
        ganadoresAPagar.push({ id: jugador.usuario_id, nombre: jugador.nombre, cantidad: 1, lugar: '1er Lugar' });
      });

      if (tPremio === 'promo_top2' && grupo1.length === 1 && grupos.length > 1) {
        const grupo2 = grupos[1];
        desgloseTexto += `\n🥈 2do Nivel (${grupo2.length} empatados):\n`;
        grupo2.forEach(jugador => {
          desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
          // 🔥 ASIGNAMOS EL TEXTO EXACTO DEL PREMIO
          ganadoresAPagar.push({ id: jugador.usuario_id, nombre: jugador.nombre, cantidad: 1, lugar: '2do Lugar' });
        });
      }
      desgloseTexto += `\n(Se abonarán automáticamente a sus billeteras digitales)`;
    }

    const confirmar = window.confirm(`⚠️ ¿DENTRO DE CAJA REAL? ⚠️\n\nVas a cerrar la jornada de forma DEFINITIVA.\n\nFormato: ${tPremio.replace('_', ' ').toUpperCase()}\nDesglose de Premiación (Empates Calculados):${desgloseTexto}\n\n¿Confirmas la liquidación de premios?`)
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
      
      // 🔥 PAGOS AUTOMÁTICOS CON REGISTRO DE PREMIO EXPLICITO 🔥
      if (ganadoresAPagar.length > 0) {
        for (const ganador of ganadoresAPagar) {
          const { data: userData } = await supabase.from('usuarios').select('creditos_disponibles').eq('id', ganador.id).single()
          const saldoActual = userData?.creditos_disponibles || 0;
          const nuevoSaldo = saldoActual + ganador.cantidad;
          
          await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', ganador.id);
          
          await supabase.from('transacciones_creditos').insert([{ 
            usuario_id: ganador.id, 
            cantidad: ganador.cantidad, 
            tipo_movimiento: 'premio_quiniela',
            descripcion: `Premio ${ganador.lugar}: ${quiniela.nombre_jornada}` // Ej: Premio 1er Lugar: Finales Champions
          }]);

          if (actualizarSaldoGlobal) actualizarSaldoGlobal(ganador.id, nuevoSaldo);
        }
        alert(`🎉 ¡Jornada Promocional Cerrada!\n\nLos premios de créditos han sido depositados automáticamente a los ganadores.`);
      } else {
        alert(`🎉 ¡Jornada Cerrada Exitosamente!\n\nRealiza los pagos de dinero en efectivo en el mostrador.`);
      }

      await cargarPartidosJornada()
    } catch (e) {
      alert('Error al liquidar la jornada.')
    } finally {
      setCalificando(false)
    }
  }

  // --- FUNCIONES EDICIÓN DE JORNADA ---
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

  // --- FUNCIONES EDICIÓN DE TICKET ---
  const abrirEdicionTicket = (jugador: any) => {
    const cerrada = quiniela && quiniela.fecha_cierre ? new Date() > new Date(quiniela.fecha_cierre.substring(0, 16)) : false;
    if (cerrada) {
      alert('🚫 Por seguridad, no se pueden modificar las jugadas después de la fecha de cierre.');
      return;
    }

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

  // --- FUNCIONES DE IMPRESIÓN ---
  const activarImpresion = (tipo: 'tickets' | 'sabana' | 'recibo') => {
    setTipoImpresion(tipo)
    setTimeout(() => window.print(), 200)
  }

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const d = new Date(fechaDB.substring(0, 16));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  // --- VARIABLES DERIVADAS ---
  const totalBoletosAdmin = rankingAdmin?.length || 0
  const precioBoletoCrds = quiniela ? (quiniela.precio_ticket ?? 1) : 1
  const cajaTotalPesos = totalBoletosAdmin * precioBoletoCrds * VALOR_CREDITO
  const cajaPremioPesos = cajaTotalPesos * PORCENTAJE_PREMIO
  const cajaCiberPesos = cajaTotalPesos * PORCENTAJE_ADMIN
  const ganadorActualAdmin = totalBoletosAdmin > 0 ? rankingAdmin[0] : null
  
  const esPromoUnico = quiniela?.tipo_premiacion === 'promo_unico';
  const esPromoTop2 = quiniela?.tipo_premiacion === 'promo_top2';
  const esCualquierPromo = esPromoUnico || esPromoTop2;

  const jornadaCerrada = quiniela && quiniela.fecha_cierre ? new Date() > new Date(quiniela.fecha_cierre.substring(0, 16)) : false;

  const boletosFiltrados = rankingAdmin.filter(r => 
    r.nombre.toLowerCase().includes(busquedaJugador.toLowerCase()) || 
    (r.telefono && r.telefono.includes(busquedaJugador))
  );

  return (
    <>
      {/* VISTA PRINCIPAL DEL ÁRBITRO */}
      <div className="animate-in fade-in duration-300 space-y-4 w-full max-w-4xl mx-auto">
        {quinielasAbiertas.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
            {quinielasAbiertas.map(qa => (
              <button key={qa.id} onClick={() => cargarDetallesQuiniela(qa)} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${quiniela?.id === qa.id ? 'bg-red-600 text-white shadow-md' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                {qa.nombre_jornada}
              </button>
            ))}
          </div>
        )}

        {!quiniela ? (
          <p className="text-center text-slate-500 py-10 text-[10px] font-bold uppercase tracking-widest bg-slate-900/50 rounded-xl border border-slate-800">No hay jornada abierta actualmente.</p>
        ) : (
          <>
            <div className="flex justify-end">
              <button onClick={iniciarEdicionJornada} className="bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-[9px] md:text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5">
                ✏️ Ajustar Jornada
              </button>
            </div>

            <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 p-3 md:p-4 rounded-xl border shadow-inner ${esCualquierPromo ? 'bg-purple-950/20 border-purple-900/50' : 'bg-slate-900/40 border-slate-800'}`}>
              <div className="text-center p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest">Boletos</span>
                <span className="text-lg md:text-xl font-black text-white">{totalBoletosAdmin}</span>
              </div>
              <div className="text-center p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest">Caja Total</span>
                <span className="text-lg md:text-xl font-black text-white">${cajaTotalPesos} <span className="text-[8px] text-slate-500 font-bold">MXN</span></span>
              </div>
              
              {esCualquierPromo ? (
                <div className="col-span-2 text-center p-2 bg-purple-900/20 border border-purple-500/30 rounded-lg flex flex-col justify-center">
                  <span className="block text-[9px] md:text-[10px] text-purple-400 font-black uppercase tracking-widest mb-0.5">🎁 Promoción Activa</span>
                  <span className="text-sm md:text-base font-black text-purple-300 leading-tight">
                    {esPromoUnico ? '1 Crédito al 1ro' : '1 Crédito al Top 2'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="text-center p-2 bg-amber-950/20 border border-amber-900/30 rounded-lg">
                    <span className="block text-[8px] md:text-[9px] text-amber-500 font-black uppercase tracking-widest">Premio (80%)</span>
                    <span className="text-lg md:text-xl font-black text-amber-400">${cajaPremioPesos.toFixed(0)} <span className="text-[8px] text-amber-600 font-bold">MXN</span></span>
                  </div>
                  <div className="text-center p-2 bg-green-950/20 border border-green-900/30 rounded-lg">
                    <span className="block text-[8px] md:text-[9px] text-green-500 font-black uppercase tracking-widest">Ciber (20%)</span>
                    <span className="text-lg md:text-xl font-black text-green-400">${cajaCiberPesos.toFixed(0)} <span className="text-[8px] text-green-600 font-bold">MXN</span></span>
                  </div>
                </>
              )}
            </div>

            <div className={`p-2 rounded-lg text-center text-[9px] md:text-[10px] border font-bold uppercase tracking-widest ${esCualquierPromo ? 'bg-purple-950/30 border-purple-800 text-purple-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
              🏆 Formato: <span className={`${esCualquierPromo ? 'text-white' : 'text-blue-400'} font-black`}>
                {quiniela.tipo_premiacion === 'unico' ? 'GANADOR ÚNICO' : 
                 quiniela.tipo_premiacion === 'top2' ? 'TOP 2 (70-30)' : 
                 quiniela.tipo_premiacion === 'top3' ? 'TOP 3 (60-25-15)' :
                 quiniela.tipo_premiacion === 'promo_unico' ? 'PROMO: 1ER LUGAR (1 CRÉDITO)' :
                 'PROMO: TOP 2 (1 CRÉDITO C/U)'}
              </span>
            </div>

            {/* TABLA DE BOLETOS CON BUSCADOR Y SEGURIDAD */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
              <div className="bg-slate-950 p-2.5 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <h3 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 shrink-0">🎫 Boletos ({totalBoletosAdmin})</h3>
                  {ganadorActualAdmin && <span className="text-[8px] md:text-[9px] text-amber-500 font-bold uppercase tracking-widest bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50 truncate max-w-[120px]">Líder: {ganadorActualAdmin.nombre}</span>}
                </div>
                <input 
                  type="text" 
                  placeholder="Buscar jugador o teléfono..." 
                  value={busquedaJugador}
                  onChange={(e) => setBusquedaJugador(e.target.value)}
                  className="w-full sm:w-48 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-[10px] text-white outline-none focus:border-blue-500 transition-all font-bold placeholder:text-slate-600"
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {totalBoletosAdmin > 0 ? (
                  boletosFiltrados.length > 0 ? (
                    <table className="w-full text-left text-[10px] md:text-xs">
                      <thead className="bg-slate-900/80 text-slate-500 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                          <th className="p-2 font-bold border-b border-slate-800">Pos / Jugador</th>
                          <th className="p-2 text-center font-bold border-b border-slate-800">Goles</th>
                          <th className="p-2 text-center text-green-500 font-bold border-b border-slate-800">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {boletosFiltrados.map((r, i) => (
                          <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-2 font-bold text-slate-300 uppercase flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className={`shrink-0 flex items-center justify-center w-4 h-4 rounded text-[8px] font-black ${i===0?'bg-amber-500 text-amber-950':i===1?'bg-slate-400 text-slate-900':i===2?'bg-amber-700 text-white':'bg-slate-800 text-slate-500'}`}>{i+1}</span>
                                <span className="truncate max-w-[120px] md:max-w-[200px]">{r.nombre}</span>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => enviarWhatsAppBoleto(r)} className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-green-400 hover:text-green-300 transition-all" title="WhatsApp">📲</button>
                                
                                {jornadaCerrada ? (
                                  <button onClick={() => alert('🚫 Por seguridad, no se pueden modificar las jugadas después de la fecha de cierre.')} className="w-6 h-6 flex items-center justify-center bg-slate-900 border border-slate-800 rounded text-slate-600 transition-all cursor-not-allowed" title="Edición bloqueada por seguridad">🔒</button>
                                ) : (
                                  <button onClick={() => abrirEdicionTicket(r)} className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-blue-400 hover:text-blue-300 transition-all" title="Editar">✏️</button>
                                )}

                                <button onClick={() => { 
                                  setTicketAImprimir({ nombre: r.nombre, telefono: r.telefono || '-', selecciones: r.pronosticosDiccionario, goles: r.prediccionGoles }); 
                                  activarImpresion('recibo'); 
                                }} className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-white transition-all" title="Imprimir">🖨️</button>
                              </div>
                            </td>
                            <td className="p-2 text-center text-slate-500 font-mono font-bold bg-slate-900/30">{r.prediccionGoles}</td>
                            <td className="p-2 text-center font-black text-green-400">{r.puntos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-center text-slate-500 text-[10px] py-6 font-bold uppercase tracking-widest">No se encontró ningún jugador con esa búsqueda.</p>
                  )
                ) : (
                  <p className="text-center text-slate-600 text-[10px] py-6 font-bold uppercase tracking-widest italic">Aún no hay boletos vendidos en esta jornada.</p>
                )}
              </div>
            </div>

            {/* BOTONES DE DIFUSIÓN */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex flex-wrap justify-center gap-2">
              <button onClick={() => activarImpresion('tickets')} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold px-3 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 flex-1 md:flex-none justify-center">
                🖨️ Formatos Blanco
              </button>
              <button onClick={() => activarImpresion('sabana')} className="bg-blue-900 hover:bg-blue-800 border border-blue-700 text-white font-bold px-3 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 flex-1 md:flex-none justify-center">
                📊 Sábana (PDF)
              </button>
              <button onClick={compartirAvanceGrupo} className="bg-green-700 hover:bg-green-600 border border-green-600 text-white font-bold px-3 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 w-full md:w-auto justify-center">
                📢 Copiar Avance para WA
              </button>
            </div>

            {/* LISTA DE PARTIDOS Y MARCADORES */}
            <div className="space-y-2">
              {(partidos || []).map((partido, idx) => {
                const seleccionado = resultadosReales[partido.id];
                return (
                  <div key={partido.id} className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3">
                    
                    <div className="flex w-full md:w-auto flex-1 justify-between items-center text-[10px] md:text-xs font-bold uppercase tracking-wide gap-2">
                      <span className="text-[8px] text-slate-600 font-black w-4 text-center shrink-0">{idx + 1}</span>
                      <span className="flex-1 text-right text-slate-300 truncate">{partido.equipo_local}</span>
                      <span className="w-4 text-center text-slate-600 text-[8px] font-black shrink-0">VS</span>
                      <span className="flex-1 text-left text-slate-300 truncate">{partido.equipo_visitante}</span>
                    </div>
                    
                    <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-3 shrink-0">
                      <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <input type="number" placeholder="-" value={marcadoresReales[partido.id]?.l || ''} onChange={(e) => handleMarcadorExacto(partido.id, 'l', e.target.value)} className="w-8 h-8 md:w-9 md:h-9 bg-slate-900 rounded text-center font-black text-sm text-white outline-none focus:border-red-500 transition-all" />
                        <span className="text-slate-600 font-black text-[10px]">-</span>
                        <input type="number" placeholder="-" value={marcadoresReales[partido.id]?.v || ''} onChange={(e) => handleMarcadorExacto(partido.id, 'v', e.target.value)} className="w-8 h-8 md:w-9 md:h-9 bg-slate-900 rounded text-center font-black text-sm text-white outline-none focus:border-red-500 transition-all" />
                      </div>

                      <div className="flex gap-1">
                        {['L', 'E', 'V'].map((opc) => (
                          <div key={opc} className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded font-black text-[10px] md:text-xs transition-all ${seleccionado === opc ? 'bg-red-600 text-white shadow-inner' : 'bg-slate-900 border border-slate-800 text-slate-600'}`}>
                            {opc}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* SECCIÓN FINAL: RESULTADO TOTAL Y BOTONES */}
            <div className="flex flex-col md:flex-row items-center gap-3 border-t border-slate-800 pt-4 mt-2">
              <div className="w-full md:w-1/3 p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-center flex flex-col justify-center items-center gap-1.5">
                <label className="text-red-500 font-black uppercase text-[9px] md:text-[10px] tracking-widest leading-tight">Total Goles (Desempate)</label>
                <input type="number" placeholder="Ej. 14" value={golesReales} onChange={(e) => setGolesReales(e.target.value)} className="w-20 bg-slate-950 border border-red-900/50 rounded-lg px-2 py-1 text-center text-xl font-black text-white focus:border-red-500 outline-none transition-all" />
              </div>
              
              <div className="w-full md:w-2/3 flex flex-col sm:flex-row gap-2">
                <button onClick={guardarYCalificar} disabled={calificando || Object.keys(resultadosReales || {}).length === 0} className={`flex-1 py-3 md:py-4 rounded-xl font-bold text-[10px] md:text-xs uppercase tracking-widest transition-all ${calificando ? 'bg-slate-800 text-slate-600' : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white'}`}>
                  💾 Guardar Avance
                </button>
                <button onClick={cerrarJornadaDefinitivo} disabled={calificando || totalBoletosAdmin === 0} className={`flex-1 py-3 md:py-4 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all ${calificando || totalBoletosAdmin === 0 ? 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed' : esCualquierPromo ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]' : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]'}`}>
                  {esCualquierPromo ? '🎁 Cerrar y Pagar' : '🏆 Cerrar y Liquidar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 📜 VENTANA MODAL FLOTANTE: EDICIÓN EN CALIENTE DE JORNADA */}
      {editandoQuinielaId && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 max-w-2xl w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight">✏️ Ajustar Jornada</h3>
              <button onClick={() => setEditandoQuinielaId(null)} className="text-slate-500 hover:text-slate-300 font-mono text-xl">✕</button>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-[9px] text-slate-400 font-bold uppercase mb-1 block tracking-widest">Nombre</label>
                  <input type="text" value={editNombreJornada} onChange={(e) => setEditNombreJornada(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-bold outline-none uppercase focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase mb-1 block tracking-widest">Cierre</label>
                  <input type="datetime-local" value={editFechaCierre} onChange={(e) => setEditFechaCierre(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs outline-none focus:border-blue-500 font-bold" />
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase mb-1 block tracking-widest">Formato</label>
                  <select value={editTipoPremiacion} onChange={(e: any) => setEditTipoPremiacion(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-bold outline-none focus:border-blue-500 h-[34px]">
                    <optgroup label="Cobro Normal">
                      <option value="unico">1ro (100%)</option>
                      <option value="top2">Top 2 (70-30)</option>
                      <option value="top3">Top 3 (60-25-15)</option>
                    </optgroup>
                    <optgroup label="Gratis (Fijos)">
                      <option value="promo_unico">Promo: 1ro (1Cr)</option>
                      <option value="promo_top2">Promo: Top 2 (1Cr c/u)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 mt-2">
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-2">Modificar Partidos</span>
                <div className="space-y-2">
                  {editPartidos.map((p, idx) => (
                    <div key={p.id} className="bg-slate-950/40 border border-slate-800/80 p-2 rounded-xl flex flex-col md:flex-row items-center gap-2">
                      <span className="text-[8px] font-black text-slate-500 uppercase w-full md:w-auto text-left md:text-center shrink-0">P{idx + 1}</span>
                      <div className="flex flex-1 w-full items-center gap-1.5">
                        <input type="text" value={p.equipo_local} onChange={(e) => actualizarPartidoEditado(idx, 'equipo_local', e.target.value)} className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white text-[10px] font-bold uppercase outline-none focus:border-blue-500 text-right" placeholder="Local" />
                        <span className="text-[8px] text-slate-600 font-black italic">VS</span>
                        <input type="text" value={p.equipo_visitante} onChange={(e) => actualizarPartidoEditado(idx, 'equipo_visitante', e.target.value)} className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white text-[10px] font-bold uppercase outline-none focus:border-blue-500" placeholder="Visita" />
                      </div>
                      <input type="datetime-local" value={p.fecha_hora} onChange={(e) => actualizarPartidoEditado(idx, 'fecha_hora', e.target.value)} className="w-full md:w-[130px] shrink-0 bg-slate-900 border border-slate-800 rounded-lg p-1 text-slate-300 text-[9px] font-bold outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-800">
              <button onClick={() => setEditandoQuinielaId(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-2.5 rounded-xl uppercase text-[10px] tracking-widest transition-all">
                Cancelar
              </button>
              <button onClick={guardarCambiosJornada} disabled={guardandoEdicion} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl uppercase text-[10px] tracking-widest transition-all shadow-md shadow-blue-900/30">
                {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 VENTANA MODAL FLOTANTE: EDITAR JUGADA ESPECÍFICA (TICKET) */}
      {editandoTicketId && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-blue-900/50 max-w-lg w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5 mb-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tight">✏️ Editar Jugada</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{editTicketNombre}</p>
              </div>
              <button onClick={() => setEditandoTicketId(null)} className="text-slate-500 hover:text-slate-300 font-mono text-xl">✕</button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 mb-4">
              {partidos.map((p) => (
                <div key={p.id} className="bg-slate-950/40 border border-slate-800 p-2 rounded-xl flex justify-between items-center">
                  <div className="flex-1 text-right text-[9px] md:text-[10px] font-bold text-slate-300 uppercase pr-2 truncate">{p.equipo_local}</div>
                  <div className="flex gap-1 w-[90px] md:w-[110px] shrink-0">
                    {['L', 'E', 'V'].map(opc => (
                      <button 
                        key={opc} 
                        onClick={() => seleccionarOpcionEditTicket(p.id, opc)} 
                        className={`flex-1 py-1 rounded text-[10px] md:text-xs font-black border transition-all ${editTicketSelecciones[p.id] === opc ? 'bg-blue-600 border-blue-500 text-white shadow-inner' : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                      >
                        {opc}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 text-left text-[9px] md:text-[10px] font-bold text-slate-300 uppercase pl-2 truncate">{p.equipo_visitante}</div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 mb-4 flex items-center justify-between gap-3">
              <label className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase block tracking-widest">Goles de Desempate</label>
              <input 
                type="number" 
                value={editTicketGoles} 
                onChange={(e) => setEditTicketGoles(e.target.value)} 
                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-sm font-black text-white focus:border-blue-500 outline-none transition-all" 
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditandoTicketId(null)} className="w-1/3 bg-slate-800 hover:bg-slate-700 text-white font-black py-2.5 rounded-xl uppercase text-[9px] md:text-[10px] tracking-widest transition-all">
                Cancelar
              </button>
              <button onClick={guardarEdicionTicket} disabled={guardandoEdicionTicket} className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl uppercase text-[9px] md:text-[10px] tracking-widest transition-all shadow-md shadow-blue-900/30">
                {guardandoEdicionTicket ? 'Guardando...' : '💾 Guardar Corrección'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SECCIÓN DE IMPRESIÓN --- */}
      {tipoImpresion && (
        <style>{`
          @media print {
            @page { margin: 0mm; size: letter; }
            body { background: white; margin: 0; padding: 0; }
            body * { visibility: hidden !important; }
            .zona-impresion, .zona-impresion * { visibility: visible !important; }
            .zona-impresion { 
              position: absolute !important; 
              left: 0 !important; 
              top: 0 !important; 
              width: 100% !important; 
              height: 100% !important;
              margin: 0 !important; 
              padding: 15px !important; 
              box-sizing: border-box !important;
              background-color: white !important;
            }
          }
        `}</style>
      )}

      {/* IMPRESIÓN 1: TICKETS EN BLANCO (2 por hoja) */}
      {quiniela && tipoImpresion === 'tickets' && (
        <div className="hidden print:flex print:flex-row print:justify-between print:w-full print:h-full print:bg-white print:text-black zona-impresion z-[99999]">
          {[1, 2].map((num) => (
            <div className="w-[48%] h-full border-2 border-black rounded-3xl p-4 bg-white flex flex-col justify-between" key={num}>
              <div>
                <div className="text-center mb-4">
                  <h1 className="font-black text-3xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                  <p className="text-xs font-bold uppercase tracking-widest border-b-2 border-blue-900 inline-block pb-1 mt-1 text-blue-900">Quiniela Deportiva</p>
                  <div className="mt-2 text-[10px] font-black uppercase bg-blue-900 text-white py-1 px-2 rounded">Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}</div>
                </div>
                <h2 className="text-center font-black text-lg uppercase mb-4 bg-amber-400 py-1 border-y-2 border-black text-black">{quiniela.nombre_jornada}</h2>
                <div className="mb-4 space-y-3">
                  <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">Nombre:</span><span className="w-4/5"></span></div>
                  <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">WhatsApp:</span><span className="w-4/5"></span></div>
                </div>
                <table className="w-full text-sm mb-4 border-collapse table-fixed">
                  <thead><tr className="bg-blue-900 text-white text-[8px] uppercase"><th className="border-2 border-black p-1 text-right w-[40%]">Local</th><th className="border-2 border-black p-1 text-center w-[6%]">L</th><th className="border-2 border-black p-1 text-center w-[6%]">E</th><th className="border-2 border-black p-1 text-center w-[6%]">V</th><th className="border-2 border-black p-1 text-left w-[40%]">Visita</th></tr></thead>
                  <tbody>
                    {(partidos || []).map((p) => {
                      const logoL = obtenerLogo(p.equipo_local)
                      const logoV = obtenerLogo(p.equipo_visitante)
                      return (
                        <tr key={p.id}>
                          <td className="border-2 border-black p-1 text-right overflow-hidden bg-gray-50"><div className="flex items-center justify-end gap-1"><span className="font-bold uppercase text-[8px] truncate max-w-[80%]">{p.equipo_local}</span>{logoL ? <img src={logoL} alt="" className="w-5 h-5 object-contain" /> : <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}</div></td>
                          <td className="border-2 border-black p-0.5 text-center font-bold"></td><td className="border-2 border-black p-0.5 text-center font-bold"></td><td className="border-2 border-black p-0.5 text-center font-bold"></td>
                          <td className="border-2 border-black p-1 text-left overflow-hidden bg-gray-50"><div className="flex items-center justify-start gap-1">{logoV ? <img src={logoV} alt="" className="w-5 h-5 object-contain" /> : <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}<span className="font-bold uppercase text-[8px] truncate max-w-[80%]">{p.equipo_visitante}</span></div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="border-2 border-black p-3 text-center rounded-xl bg-gray-100 mt-6"><span className="font-bold uppercase text-[9px] block mb-2">Desempate (Total de Goles):</span><div className="w-16 border-b-2 border-black mx-auto h-4"></div></div>
                <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
              </div>
              <div className="mt-4 pt-4 border-t-2 border-black border-dashed">
                <p className="text-[7px] text-justify leading-tight font-bold uppercase text-black"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* IMPRESIÓN 2: RECIBO INDIVIDUAL (Pantalla completa) */}
      {quiniela && tipoImpresion === 'recibo' && ticketAImprimir && (
        <div className="hidden print:flex print:flex-col print:items-center print:w-full print:h-full print:bg-white print:text-black zona-impresion z-[99999]">
          <div className="w-full h-full border-4 border-black rounded-3xl p-6 bg-white flex flex-col justify-between">
            <div>
              <div className="text-center mb-6">
                <h1 className="font-black text-4xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                <p className="text-lg font-bold uppercase tracking-widest border-b-4 border-blue-900 inline-block pb-1 mt-2 text-blue-900">RECIBO DE JUGADA</p>
                <div className="mt-4 text-sm font-black uppercase bg-blue-900 text-white py-2 px-4 rounded-lg inline-block">Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}</div>
              </div>
              <h2 className="text-center font-black text-2xl uppercase mb-6 bg-amber-400 py-2 border-y-4 border-black text-black">{quiniela.nombre_jornada}</h2>
              
              <div className="mb-6 space-y-3">
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-2">
                  <span className="font-bold text-lg uppercase">Nombre:</span>
                  <span className="font-black text-xl uppercase">{ticketAImprimir.nombre}</span>
                </div>
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-2">
                  <span className="font-bold text-lg uppercase">WhatsApp:</span>
                  <span className="font-black text-xl uppercase">{ticketAImprimir.telefono}</span>
                </div>
              </div>
              
              <table className="w-full text-base mb-6 border-collapse table-fixed">
                <thead>
                  <tr className="bg-blue-900 text-white text-xs uppercase">
                    <th className="border-4 border-black p-2 text-right w-[40%]">Local</th>
                    <th className="border-4 border-black p-2 text-center w-[6%]">L</th>
                    <th className="border-4 border-black p-2 text-center w-[6%]">E</th>
                    <th className="border-4 border-black p-2 text-center w-[6%]">V</th>
                    <th className="border-4 border-black p-2 text-left w-[40%]">Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {(partidos || []).map((p) => {
                    const logoL = obtenerLogo(p.equipo_local)
                    const logoV = obtenerLogo(p.equipo_visitante)
                    return (
                      <tr key={p.id}>
                        <td className="border-4 border-black p-2 text-right overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold uppercase text-xs truncate max-w-[80%]">{p.equipo_local}</span>
                            {logoL ? <img src={logoL} alt="" className="w-6 h-6 object-contain" /> : <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-[8px]">?</div>}
                          </div>
                        </td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{ticketAImprimir.selecciones[p.id] === 'L' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{ticketAImprimir.selecciones[p.id] === 'E' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{ticketAImprimir.selecciones[p.id] === 'V' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-2 text-left overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-start gap-2">
                            {logoV ? <img src={logoV} alt="" className="w-6 h-6 object-contain" /> : <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-[8px]">?</div>}
                            <span className="font-bold uppercase text-xs truncate max-w-[80%]">{p.equipo_visitante}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              
              <div className="border-4 border-black p-4 text-center rounded-2xl bg-gray-100 mt-6 flex justify-between items-center px-6">
                <span className="font-bold uppercase text-sm">Desempate (Goles):</span>
                <span className="font-black text-3xl">{ticketAImprimir.goles}</span>
              </div>
              <p className="text-center text-sm font-bold uppercase mt-6 text-blue-900">Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
            </div>
            
            <div className="mt-6 pt-6 border-t-2 border-black border-dashed">
              <p className="text-[9px] text-justify leading-tight font-bold uppercase text-black"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
            </div>
          </div>
        </div>
      )}

      {/* IMPRESIÓN 3: SÁBANA OFICIAL PDF (AHORA CON ABREVIATURAS) */}
      {quiniela && tipoImpresion === 'sabana' && (
        <div className="hidden print:block print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-6">
          <div className="text-center mb-6">
            <h1 className="font-black text-2xl uppercase tracking-widest text-blue-900 border-b-2 border-blue-900 inline-block pb-1">SÁBANA OFICIAL - CIBERTEQUE</h1>
            <h2 className="text-xl font-bold uppercase mt-2">{quiniela.nombre_jornada}</h2>
            <p className="text-[10px] font-bold mt-1 text-gray-500 uppercase">Boletos Registrados: {totalBoletosAdmin} | Caja Total: ${cajaTotalPesos} MXN | Premio en Bolsa (80%): ${cajaPremioPesos.toFixed(0)} MXN</p>
          </div>
          <table className="w-full border-collapse border-2 border-black text-[9px] uppercase font-mono">
            <thead>
              <tr className="bg-gray-200">
                <th className="border-2 border-black p-2 text-left">Jugador</th>
                {partidos.map((p) => {
                  const abrevL = (p.equipo_local || '').substring(0, 3).toUpperCase();
                  const abrevV = (p.equipo_visitante || '').substring(0, 3).toUpperCase();
                  return (
                    <th key={p.id} className="border-2 border-black p-1 text-center w-10 text-[7px] leading-tight" title={`${p.equipo_local} vs ${p.equipo_visitante}`}>
                      <div className="flex flex-col items-center">
                        <span>{abrevL}</span>
                        <span className="text-[5px] text-gray-500 my-0.5">VS</span>
                        <span>{abrevV}</span>
                      </div>
                    </th>
                  )
                })}
                <th className="border-2 border-black p-2 text-center w-12">Goles</th>
              </tr>
            </thead>
            <tbody>
              {rankingAdmin.map((r, index) => (
                <tr key={index} className="border-b-2 border-gray-300 hover:bg-gray-50">
                  <td className="border-2 border-black p-2 font-bold">{r.nombre}</td>
                  {partidos.map(p => {
                    const pick = r.pronosticosDiccionario?.[p.id] || '-'
                    return (
                      <td key={p.id} className={`border-2 border-black p-1 text-center font-black text-xs ${pick === 'L' ? 'text-blue-800' : pick === 'E' ? 'text-green-800' : pick === 'V' ? 'text-red-800' : ''}`}>
                        {pick}
                      </td>
                    )
                  })}
                  <td className="border-2 border-black p-2 text-center font-bold bg-gray-100">{r.prediccionGoles}</td>
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