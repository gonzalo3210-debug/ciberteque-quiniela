import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { calcularPremios } from '@/utils/calculadoraPremios';
import toast from 'react-hot-toast';

export function useArbitro(actualizarSaldoGlobal?: (id: string, nuevo: number) => void) {
  // 🌐 CONSTANTES GLOBALES
  const ENLACE_PUBLICO_RANKING = "https://ciberteque-quiniela.vercel.app/";
  const PORCENTAJE_PREMIO = 0.80;
  const PORCENTAJE_ADMIN = 0.20;

  // 🔥 CANDADO DE SEGURIDAD
  const operacionEnCurso = useRef(false);

  // --- ESTADOS BASE ---
  const [cargando, setCargando] = useState(true);
  const [vistaActual, setVistaActual] = useState<'activas' | 'historico'>('activas');
  const [equipos, setEquipos] = useState<any[]>([]);
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]);
  const [quinielasCerradas, setQuinielasCerradas] = useState<any[]>([]); 
  const [quiniela, setQuiniela] = useState<any>(null);
  const [partidos, setPartidos] = useState<any[]>([]);
  
  // --- ESTADOS CALIFICACIÓN ---
  const [resultadosReales, setResultadosReales] = useState<Record<string, string>>({});
  const [marcadoresReales, setMarcadoresReales] = useState<Record<string, { l: string, v: string }>>({}); 
  const [esFinalReal, setEsFinalReal] = useState<Record<string, boolean>>({}); // 🔥 NUEVO: Estado para el Toggle
  const [golesReales, setGolesReales] = useState<string>('');
  const [calificando, setCalificando] = useState(false);
  const [rankingAdmin, setRankingAdmin] = useState<any[]>([]); 
  const [busquedaJugador, setBusquedaJugador] = useState('');

  // --- ESTADOS IMPRESIÓN ---
  const [tipoImpresion, setTipoImpresion] = useState<'tickets' | 'sabana' | 'recibo' | 'tabla' | null>(null);
  const [ticketAImprimir, setTicketAImprimir] = useState<any>(null);

  // --- ESTADOS EDICIÓN JORNADA ---
  const [editandoQuinielaId, setEditandoQuinielaId] = useState<string | null>(null);
  const [editNombreJornada, setEditNombreJornada] = useState('');
  const [editFechaCierre, setEditFechaCierre] = useState('');
  const [editTipoPremiacion, setEditTipoPremiacion] = useState<'unico' | 'top2' | 'top3' | 'promo_unico' | 'promo_top2'>('unico');
  const [editPartidos, setEditPartidos] = useState<any[]>([]);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // --- ESTADOS EDICIÓN TICKET ---
  const [editandoTicketId, setEditandoTicketId] = useState<string | null>(null);
  const [editTicketNombre, setEditTicketNombre] = useState('');
  const [editTicketGoles, setEditTicketGoles] = useState('');
  const [editTicketSelecciones, setEditTicketSelecciones] = useState<Record<string, string>>({});
  const [guardandoEdicionTicket, setGuardandoEdicionTicket] = useState(false);

  // --- EFECTOS ---
  useEffect(() => { cargarEquiposDB(); }, []);
  useEffect(() => { cargarJornadas(); }, [vistaActual]);
  useEffect(() => {
    const handleAfterPrint = () => setTipoImpresion(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // --- FUNCIONES CORE ---
  const cargarEquiposDB = async () => {
    const { data: eq } = await supabase.from('equipos').select('*').order('nombre');
    if (eq) setEquipos(eq);
  };

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    const equipo = equipos.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim());
    return equipo?.logo_url || null;
  };

  const cargarJornadas = async () => {
    setCargando(true);
    try {
      // 🔥 NUEVO: Traemos el campo 'es_final' en la consulta
      const query = supabase
        .from('quinielas')
        .select('id, nombre_jornada, precio_ticket, goles_totales_real, fecha_cierre, estado, tipo_premiacion, partidos (id, equipo_local, equipo_visitante, resultado_real, fecha_hora, goles_local, goles_visitante, es_final)');

      if (vistaActual === 'activas') {
        const { data } = await query.eq('estado', 'abierta').order('fecha_cierre', { ascending: true });
        if (data && data.length > 0) {
          setQuinielasAbiertas(data);
          await cargarDetallesQuiniela(quiniela ? data.find(q => q.id === quiniela.id) || data[0] : data[0]);
        } else { 
          setQuinielasAbiertas([]); setQuiniela(null); setPartidos([]); setRankingAdmin([]); 
        }
      } else {
        const { data } = await query.eq('estado', 'cerrada').order('fecha_cierre', { ascending: false });
        if (data && data.length > 0) {
          setQuinielasCerradas(data);
          await cargarDetallesQuiniela(quiniela ? data.find(q => q.id === quiniela.id) || data[0] : data[0]);
        } else { 
          setQuinielasCerradas([]); setQuiniela(null); setPartidos([]); setRankingAdmin([]); 
        }
      }
    } catch (error) {
      console.error("Error cargando jornadas:", error);
    } finally {
      setCargando(false);
    }
  };

  const cargarDetallesQuiniela = async (qData: any) => {
    setQuiniela(qData);
    setPartidos(qData.partidos || []);
    setBusquedaJugador('');
    
    const res: Record<string, string> = {};
    const marcs: Record<string, { l: string, v: string }> = {};
    const finales: Record<string, boolean> = {}; // 🔥 Diccionario para el toggle
    let sumaGolesCalculada = 0;
    let hayGoles = false;
    
    qData.partidos.forEach((p: any) => { 
      if (p.resultado_real) res[p.id] = p.resultado_real;
      finales[p.id] = p.es_final || false; // Inicializamos el estado del toggle

      if (p.goles_local !== null && p.goles_local !== undefined && p.goles_visitante !== null && p.goles_visitante !== undefined) {
        marcs[p.id] = { l: p.goles_local.toString(), v: p.goles_visitante.toString() };
        sumaGolesCalculada += p.goles_local + p.goles_visitante;
        hayGoles = true;
      }
    });
    
    setResultadosReales(res);
    setMarcadoresReales(marcs); 
    setEsFinalReal(finales);
    setGolesReales(hayGoles ? sumaGolesCalculada.toString() : (qData.goles_totales_real !== null ? qData.goles_totales_real.toString() : ''));

    const { data: tData } = await supabase.from('tickets').select('id, usuario_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)').eq('quiniela_id', qData.id);
    const { data: uDataReal } = await supabase.from('usuarios').select('id, nombre, telefono, creditos_disponibles');
    const mapaU: Record<string, any> = {};
    if (uDataReal) uDataReal.forEach(u => mapaU[u.id] = { nombre: u.nombre, telefono: u.telefono, creditos: u.creditos_disponibles });
    
    if (tData) {
      const rCalc = tData.map(ticket => {
        let pts = 0;
        const prons: Record<string, string> = {};
        ticket.pronosticos.forEach((pr: any) => {
          prons[pr.partido_id] = pr.eleccion_usuario;
          const p = qData.partidos.find((par: any) => par.id === pr.partido_id);
          if (p && p.resultado_real === pr.eleccion_usuario) pts++;
        });
        
        const golesRealesAct = hayGoles ? sumaGolesCalculada : (qData.goles_totales_real !== null ? qData.goles_totales_real : -1);
        const golesDiff = golesRealesAct !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesRealesAct) : 999;

        return { 
          id: ticket.id, usuario_id: ticket.usuario_id, nombre: mapaU[ticket.usuario_id]?.nombre || 'Mostrador', 
          telefono: mapaU[ticket.usuario_id]?.telefono || '', creditos_disponibles: mapaU[ticket.usuario_id]?.creditos || 0,
          puntos: pts, prediccionGoles: ticket.prediccion_goles_total, golesDiff, pronosticosDiccionario: prons 
        };
      }).sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return a.golesDiff - b.golesDiff;
      });

      rCalc.forEach((item: any, idx) => {
        if (idx > 0) {
          const anterior = rCalc[idx - 1];
          if (item.puntos === anterior.puntos && item.golesDiff === anterior.golesDiff) item.posicion = anterior.posicion;
          else item.posicion = idx + 1;
        } else item.posicion = 1;
      });

      setRankingAdmin(rCalc);
    }
  };

  const handleMarcadorExacto = (partidoId: string, tipo: 'l' | 'v', valor: string) => {
    const numValor = valor.replace(/[^0-9]/g, ''); 
    const nuevosMarcadores = { ...marcadoresReales, [partidoId]: { ...(marcadoresReales[partidoId] || { l: '', v: '' }), [tipo]: numValor } };
    const nuevosResultados = { ...resultadosReales };
    let sumaTotal = 0, hayGoles = false;

    partidos.forEach(p => {
      const marcadorP = nuevosMarcadores[p.id] || { l: '', v: '' };
      const ml = parseInt(marcadorP.l), mv = parseInt(marcadorP.v);
      if (marcadorP.l !== '' && marcadorP.v !== '' && !isNaN(ml) && !isNaN(mv)) {
        if (ml > mv) nuevosResultados[p.id] = 'L';
        else if (ml === mv) nuevosResultados[p.id] = 'E';
        else nuevosResultados[p.id] = 'V';
      }
      if (!isNaN(ml)) { sumaTotal += ml; hayGoles = true; }
      if (!isNaN(mv)) { sumaTotal += mv; hayGoles = true; }
    });
    
    setMarcadoresReales(nuevosMarcadores); setResultadosReales(nuevosResultados); setGolesReales(hayGoles ? sumaTotal.toString() : '');
  };

  // 🔥 NUEVA FUNCIÓN: Para actualizar el botón de Es Final
  const handleToggleEsFinal = (partidoId: string, valor: boolean) => {
    setEsFinalReal(prev => ({ ...prev, [partidoId]: valor }));
  };

  const guardarYCalificar = async () => {
    if (operacionEnCurso.current) return;
    operacionEnCurso.current = true;
    setCalificando(true);
    const idToast = toast.loading('Calculando ranking global...');
    
    try {
      for (const pId of Object.keys(resultadosReales || {})) {
        const l_val = marcadoresReales[pId]?.l;
        const v_val = marcadoresReales[pId]?.v;
        
        // 🔥 ACTUALIZAMOS EL CAMPO es_final EN LA BD
        await supabase.from('partidos').update({ 
          resultado_real: resultadosReales[pId], 
          goles_local: (l_val !== undefined && l_val !== '') ? parseInt(l_val) : null, 
          goles_visitante: (v_val !== undefined && v_val !== '') ? parseInt(v_val) : null,
          es_final: esFinalReal[pId] || false
        }).eq('id', pId);
      }
      
      if (golesReales !== '') await supabase.from('quinielas').update({ goles_totales_real: parseInt(golesReales) }).eq('id', quiniela.id);

      const { data: tickets } = await supabase.from('tickets').select('id, pronosticos (partido_id, eleccion_usuario)').eq('quiniela_id', quiniela.id);
      if (tickets) {
        for (const ticket of tickets) {
          let puntos = 0;
          for (const pronostico of ticket.pronosticos || []) {
            if (resultadosReales[pronostico.partido_id] === pronostico.eleccion_usuario) puntos++;
          }
          await supabase.from('tickets').update({ puntos_totales: puntos }).eq('id', ticket.id);
        }
      }
      toast.success('¡Avance guardado y posiciones actualizadas!', { id: idToast });
      await cargarJornadas();
    } catch (error) { 
      toast.error('Error al guardar avance', { id: idToast }); 
    } finally { 
      setCalificando(false); 
      operacionEnCurso.current = false;
    }
  };

  const compartirAvanceGrupo = () => {
    if (!quiniela) return toast.error('No hay jornada seleccionada.');
    let partidosJugados = 0;
    partidos.forEach(p => { if (resultadosReales[p.id]) partidosJugados++; });

    const precioBoletoMXN = quiniela.precio_ticket ?? 30;
    const bolsaPesos = ['promo_unico', 'promo_top2'].includes(quiniela.tipo_premiacion) 
      ? precioBoletoMXN * (quiniela.tipo_premiacion === 'promo_top2' ? 2 : 1)
      : (rankingAdmin.length || 0) * precioBoletoMXN * PORCENTAJE_PREMIO;

    const estaCerrada = quiniela.estado === 'cerrada';
    let texto = `🏆 *${estaCerrada ? 'RESULTADOS FINALES' : 'AVANCE DE QUINIELA'}: ${quiniela.nombre_jornada}* 🏆\n\n`;
    texto += `⚽ Partidos finalizados: *${partidosJugados} de ${partidos.length}*\n💰 Bolsa ${estaCerrada ? 'Repartida' : 'Actual'}: *$${bolsaPesos.toFixed(0)} MXN*\n\n🔥 *TOP LÍDERES* 🔥\n`;
    
    const topJugadores = rankingAdmin.slice(0, 10);
    if (topJugadores.length === 0) texto += `Aún no hay participantes.\n`;
    else topJugadores.forEach(r => texto += `${r.posicion === 1 ? '🥇' : r.posicion === 2 ? '🥈' : r.posicion === 3 ? '🥉' : '🔹'} ${r.posicion}. ${r.nombre.toUpperCase()} - *${r.puntos} pts*\n`);

    if (!estaCerrada) texto += `\n💻 *Revisa la tabla COMPLETA en vivo aquí:*\n👉 ${ENLACE_PUBLICO_RANKING}\n`;

    navigator.clipboard.writeText(texto)
      .then(() => toast.success('📋 ¡Resumen copiado! Pégalo en tu grupo de WhatsApp.'))
      .catch(() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank'));
  };

  const enviarWhatsAppBoleto = (jugador: any) => {
    if (!jugador.telefono || jugador.telefono.trim() === '') return toast.error(`Sin WhatsApp registrado para ${jugador.nombre}.`);
    let seleccionesTexto = '';
    partidos.forEach(p => {
      const pick = jugador.pronosticosDiccionario[p.id] === 'L' ? p.equipo_local : jugador.pronosticosDiccionario[p.id] === 'V' ? p.equipo_visitante : 'Empate';
      seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
    });

    const msg = `🎫 *QUINIELA CIBERTEQUE*\nHola ${jugador.nombre}, tu jugada para *${quiniela.nombre_jornada}* está registrada.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate: *${jugador.prediccionGoles}*\n\nRanking en vivo:\n👉 ${ENLACE_PUBLICO_RANKING}\n\n🍀 ¡Suerte!`;
    window.open(`https://wa.me/52${jugador.telefono}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const cerrarJornadaDefinitivo = async () => {
    if (!quiniela) return;
    if (golesReales === '') return toast.error('🚨 Ingresa primero el "Resultado Oficial" de goles totales.');
    if (!rankingAdmin || rankingAdmin.length === 0) return toast.error('No hay tickets registrados.');
    if (operacionEnCurso.current) return;

    const tPremio = quiniela.tipo_premiacion || 'unico';
    const precioTicketMXN = quiniela.precio_ticket ?? 30; 
    
    const { ganadores, desgloseTexto } = calcularPremios(rankingAdmin, tPremio, precioTicketMXN, 1, PORCENTAJE_PREMIO);

    const confirmar = window.confirm(`⚠️ ¿DENTRO DE CAJA REAL? ⚠️\n\nVas a cerrar la jornada de forma DEFINITIVA.\n\nFormato: ${tPremio.replace('_', ' ').toUpperCase()}\nDesglose de Premiación (Pesos MXN):${desgloseTexto}\n\nLos premios se depositarán en las billeteras digitales.\n¿Confirmas la liquidación?`);
    if (!confirmar) return;

    operacionEnCurso.current = true;
    setCalificando(true);
    const idToast = toast.loading('Liquidando premios y cerrando jornada...');
    
    try {
      for (const pId of Object.keys(resultadosReales || {})) {
        const l_val = marcadoresReales[pId]?.l;
        const v_val = marcadoresReales[pId]?.v;
        
        await supabase.from('partidos').update({ 
          resultado_real: resultadosReales[pId],
          goles_local: (l_val !== undefined && l_val !== '') ? parseInt(l_val) : null,
          goles_visitante: (v_val !== undefined && v_val !== '') ? parseInt(v_val) : null,
          es_final: esFinalReal[pId] || false
        }).eq('id', pId);
      }
      
      await supabase.from('quinielas').update({ goles_totales_real: parseInt(golesReales), estado: 'cerrada' }).eq('id', quiniela.id);
      
      if (ganadores.length > 0) {
        for (const ganador of ganadores) {
          const { data: userData } = await supabase.from('usuarios').select('creditos_disponibles').eq('id', ganador.usuario_id).single();
          const nuevoSaldo = (userData?.creditos_disponibles || 0) + ganador.cantidad; 
          
          await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', ganador.usuario_id);
          await supabase.from('transacciones_creditos').insert([{ 
            usuario_id: ganador.usuario_id, cantidad: ganador.cantidad, tipo_movimiento: 'premio_quiniela',
            descripcion: `Premio ${ganador.lugar}: ${quiniela.nombre_jornada}` 
          }]);
          if (actualizarSaldoGlobal) actualizarSaldoGlobal(ganador.usuario_id, nuevoSaldo);
        }
        toast.success(`🎉 ¡Jornada Cerrada!\nLos premios en efectivo han sido depositados.`, { id: idToast, duration: 6000 });
      } else {
        toast.success(`🎉 ¡Jornada Cerrada Exitosamente!\nNo hubo ganadores para premiar.`, { id: idToast, duration: 5000 });
      }

      await cargarJornadas();
    } catch (e: any) {
      toast.error('Error al liquidar la jornada: ' + e.message, { id: idToast });
    } finally {
      setCalificando(false);
      operacionEnCurso.current = false;
    }
  };

  const activarImpresion = (tipo: 'tickets' | 'sabana' | 'recibo' | 'tabla') => {
    setTipoImpresion(tipo);
    setTimeout(() => window.print(), 200);
  };

  // --- LÓGICA EDICIÓN JORNADA ---
  const iniciarEdicionJornada = () => {
    if (!quiniela) return;
    setEditandoQuinielaId(quiniela.id);
    setEditNombreJornada(quiniela.nombre_jornada);
    const fecha = new Date(quiniela.fecha_cierre);
    fecha.setMinutes(fecha.getMinutes() - fecha.getTimezoneOffset());
    setEditFechaCierre(fecha.toISOString().slice(0, 16));
    setEditTipoPremiacion(quiniela.tipo_premiacion || 'unico');
    setEditPartidos(JSON.parse(JSON.stringify(partidos))); 
  };

  const actualizarPartidoEditado = (index: number, campo: 'equipo_local' | 'equipo_visitante', valor: string) => {
    const nuevos = [...editPartidos];
    nuevos[index][campo] = valor;
    setEditPartidos(nuevos);
  };

  const guardarCambiosJornada = async () => {
    if (!editandoQuinielaId || operacionEnCurso.current) return;
    operacionEnCurso.current = true;
    setGuardandoEdicion(true);
    const idToast = toast.loading('Guardando ajustes de jornada...');
    
    try {
      await supabase.from('quinielas').update({
        nombre_jornada: editNombreJornada, fecha_cierre: new Date(editFechaCierre).toISOString(), tipo_premiacion: editTipoPremiacion
      }).eq('id', editandoQuinielaId);

      for (const p of editPartidos) {
        await supabase.from('partidos').update({ equipo_local: p.equipo_local, equipo_visitante: p.equipo_visitante }).eq('id', p.id);
      }
      
      toast.success('Jornada actualizada', { id: idToast });
      setEditandoQuinielaId(null);
      await cargarJornadas();
    } catch (error) { toast.error('Error al actualizar', { id: idToast }); } 
    finally { setGuardandoEdicion(false); operacionEnCurso.current = false; }
  };

  // --- LÓGICA EDICIÓN TICKET ---
  const abrirEdicionTicket = (jugador: any) => {
    setEditandoTicketId(jugador.id);
    setEditTicketNombre(jugador.nombre);
    setEditTicketGoles(jugador.prediccionGoles?.toString() || '');
    setEditTicketSelecciones({ ...jugador.pronosticosDiccionario });
  };

  const seleccionarOpcionEditTicket = (partidoId: string, opcion: string) => {
    setEditTicketSelecciones(prev => ({ ...prev, [partidoId]: opcion }));
  };

  const guardarEdicionTicket = async () => {
    if (!editandoTicketId || operacionEnCurso.current) return;
    operacionEnCurso.current = true;
    setGuardandoEdicionTicket(true);
    const idToast = toast.loading('Modificando ticket...');
    
    try {
      await supabase.from('tickets').update({ prediccion_goles_total: parseInt(editTicketGoles) || 0 }).eq('id', editandoTicketId);
      
      for (const pId of Object.keys(editTicketSelecciones)) {
        const eleccion = editTicketSelecciones[pId];
        const { data: pronExistente } = await supabase.from('pronosticos')
          .select('id').eq('ticket_id', editandoTicketId).eq('partido_id', pId).single();
          
        if (pronExistente) await supabase.from('pronosticos').update({ eleccion_usuario: eleccion }).eq('id', pronExistente.id);
        else await supabase.from('pronosticos').insert({ ticket_id: editandoTicketId, partido_id: pId, eleccion_usuario: eleccion });
      }
      
      toast.success('Ticket modificado', { id: idToast });
      setEditandoTicketId(null);
      await cargarJornadas();
    } catch (error) { toast.error('Error al modificar ticket', { id: idToast }); } 
    finally { setGuardandoEdicionTicket(false); operacionEnCurso.current = false; }
  };

  return {
    state: { cargando, vistaActual, equipos, quinielasAbiertas, quinielasCerradas, quiniela, partidos, resultadosReales, marcadoresReales, esFinalReal, golesReales, calificando, rankingAdmin, busquedaJugador, tipoImpresion, ticketAImprimir },
    setters: { setVistaActual, setGolesReales, setBusquedaJugador, setTicketAImprimir, setTipoImpresion },
    actions: { cargarDetallesQuiniela, handleMarcadorExacto, handleToggleEsFinal, guardarYCalificar, compartirAvanceGrupo, enviarWhatsAppBoleto, cerrarJornadaDefinitivo, obtenerLogo, activarImpresion },
    edicionJornada: { editandoQuinielaId, editNombreJornada, editFechaCierre, editTipoPremiacion, editPartidos, guardandoEdicion, setEditandoQuinielaId, setEditNombreJornada, setEditFechaCierre, setEditTipoPremiacion, iniciarEdicionJornada, actualizarPartidoEditado, guardarCambiosJornada },
    edicionTicket: { editandoTicketId, editTicketNombre, editTicketGoles, editTicketSelecciones, guardandoEdicionTicket, setEditandoTicketId, abrirEdicionTicket, seleccionarOpcionEditTicket, guardarEdicionTicket },
    constantes: { PORCENTAJE_PREMIO, PORCENTAJE_ADMIN }
  };
}