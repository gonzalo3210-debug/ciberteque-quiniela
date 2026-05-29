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

    const totalBoletos = rankingAdmin.length || 0;
    const precioBoletoCrds = quiniela.precio_ticket ?? 1;
    const totalRecaudadoPesos = totalBoletos * precioBoletoCrds * VALOR_CREDITO;
    const premioBolsa80 = totalRecaudadoPesos * PORCENTAJE_PREMIO;
    const tPremio = quiniela.tipo_premiacion || 'unico';

    let desgloseTexto = '';
    const ganadoresAPagar: { id: string, nombre: string, cantidad: number }[] = [];

    // 🔥 LÓGICA DE EMPATES ABSOLUTOS
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
    // 🔥 LÓGICA DE EMPATES PARA PROMOCIONES (Créditos Enteros)
    else if (tPremio === 'promo_unico' || tPremio === 'promo_top2') {
      desgloseTexto = `🎁 EVENTO PROMOCIONAL 🎁\n`;
      const grupo1 = grupos[0]; 

      desgloseTexto += `\n🥇 1er Nivel (${grupo1.length} empatados):\n`;
      grupo1.forEach(jugador => {
        desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
        ganadoresAPagar.push({ id: jugador.usuario_id, nombre: jugador.nombre, cantidad: 1 });
      });

      if (tPremio === 'promo_top2' && grupo1.length === 1 && grupos.length > 1) {
        const grupo2 = grupos[1];
        desgloseTexto += `\n🥈 2do Nivel (${grupo2.length} empatados):\n`;
        grupo2.forEach(jugador => {
          desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
          ganadoresAPagar.push({ id: jugador.usuario_id, nombre: jugador.nombre, cantidad: 1 });
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
      
      // 🔥 PAGOS AUTOMÁTICOS CON REGISTRO DE PREMIO
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
            descripcion: `Premio Promocional: ${quiniela.nombre_jornada}`
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

  return (
    <>
      {/* VISTA PRINCIPAL DEL ÁRBITRO */}
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

            <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 p-5 rounded-2xl border shadow-inner ${esCualquierPromo ? 'bg-purple-950/20 border-purple-900/50' : 'bg-slate-950/80 border-red-900/30'}`}>
              <div className="text-center p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Boletos Totales</span>
                <span className="text-2xl font-black text-white">{totalBoletosAdmin}</span>
              </div>
              <div className="text-center p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Caja Recaudada</span>
                <span className="text-2xl font-black text-white">${cajaTotalPesos} <span className="text-[10px] text-slate-500">MXN</span></span>
              </div>
              
              {esCualquierPromo ? (
                <div className="md:col-span-2 text-center p-3 bg-purple-900/20 border border-purple-500/30 rounded-xl">
                  <span className="block text-[10px] text-purple-400 font-black uppercase tracking-widest mb-1">🎁 Evento Promocional Activo 🎁</span>
                  <span className="text-lg font-black text-purple-300">
                    {esPromoUnico ? '1 Crédito al Ganador' : '1 Crédito al 1ro y 2do Lugar'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="text-center p-3 bg-slate-900 border border-amber-500/20 rounded-xl bg-amber-500/5">
                    <span className="block text-[10px] text-amber-500 font-black uppercase">Premio Ganador (80%)</span>
                    <span className="text-2xl font-black text-amber-400">${cajaPremioPesos.toFixed(0)} <span className="text-[10px] text-amber-600">MXN</span></span>
                  </div>
                  <div className="text-center p-3 bg-slate-900 border border-green-500/20 rounded-xl bg-green-500/5">
                    <span className="block text-[10px] text-green-500 font-black uppercase">Tu Ganancia Ciber (20%)</span>
                    <span className="text-2xl font-black text-green-400">${cajaCiberPesos.toFixed(0)} <span className="text-[10px] text-green-600">MXN</span></span>
                  </div>
                </>
              )}
            </div>

            <div className={`p-3 rounded-xl text-center text-xs border font-bold uppercase ${esCualquierPromo ? 'bg-purple-950/30 border-purple-800 text-purple-300' : 'bg-slate-950/50 border-slate-800 text-slate-400'}`}>
              🏆 Formato de Premiación: <span className={`${esCualquierPromo ? 'text-white' : 'text-blue-400'} font-black`}>
                {quiniela.tipo_premiacion === 'unico' ? 'GANADOR ÚNICO (100%)' : 
                 quiniela.tipo_premiacion === 'top2' ? 'TOP 2 (70% - 30%)' : 
                 quiniela.tipo_premiacion === 'top3' ? 'TOP 3 (60% - 25% - 15%)' :
                 quiniela.tipo_premiacion === 'promo_unico' ? 'PROMO: GANADOR ÚNICO (1 CRÉDITO)' :
                 'PROMO: TOP 2 (1 CRÉDITO C/U)'}
              </span>
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
                              <button onClick={() => enviarWhatsAppBoleto(r)} className="text-[14px] text-green-400 hover:text-green-300 p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-all shadow-sm mr-1" title="Enviar confirmación por WhatsApp">📲</button>
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
              <button onClick={cerrarJornadaDefinitivo} disabled={calificando || totalBoletosAdmin === 0} className={`w-full sm:w-auto px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${calificando || totalBoletosAdmin === 0 ? 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed' : esCualquierPromo ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-900/50 hover:scale-105 active:scale-95' : 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-950/50 hover:scale-105 active:scale-95'}`}>
                {esCualquierPromo ? '🎁 Cerrar y Pagar Créditos' : '🏆 Cerrar Jornada y Liquidar'}
              </button>
            </div>
          </>
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
                    <optgroup label="Cobro Normal (80%)">
                      <option value="unico">Ganador Único (100%)</option>
                      <option value="top2">Top 2 (70% - 30%)</option>
                      <option value="top3">Top 3 (60% - 25% - 15%)</option>
                    </optgroup>
                    <optgroup label="Eventos Gratis (Premios Fijos)">
                      <option value="promo_unico">Promo Ganador Único</option>
                      <option value="promo_top2">Promo Top 2</option>
                    </optgroup>
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
      
      {/* 🔥 EL TRUCO MÁGICO PARA EVITAR HOJAS DUPLICADAS 🔥 */}
      {tipoImpresion && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .zona-impresion, .zona-impresion * { visibility: visible !important; }
            .zona-impresion { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
          }
        `}</style>
      )}

      {quiniela && tipoImpresion === 'tickets' && (
        <div className="hidden print:flex print:flex-row print:justify-between print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-8">
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
                <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-black border-dashed">
                <p className="text-[6px] text-justify leading-tight font-semibold uppercase"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {quiniela && tipoImpresion === 'recibo' && ticketAImprimir && (
        <div className="hidden print:flex print:flex-col print:items-start print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-8">
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
              <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-black border-dashed">
              <p className="text-[6px] text-justify leading-tight font-semibold uppercase"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
            </div>
          </div>
        </div>
      )}

      {quiniela && tipoImpresion === 'sabana' && (
        <div className="hidden print:block print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-6">
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