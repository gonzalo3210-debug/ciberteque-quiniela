// src/hooks/useArbitro.ts
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { calcularPremios } from '@/utils/calculadoraPremios';
import toast from 'react-hot-toast';

export function useArbitro(actualizarSaldoGlobal?: (id: string, nuevo: number) => void) {
  const ENLACE_PUBLICO_RANKING = "https://ciberteque-quiniela.vercel.app/";
  const PORCENTAJE_PREMIO = 0.80;
  const PORCENTAJE_ADMIN = 0.20;
  const operacionEnCurso = useRef(false);

  const [cargando, setCargando] = useState(true);
  const [vistaActual, setVistaActual] = useState<'activas' | 'historico'>('activas');
  const [equipos, setEquipos] = useState<any[]>([]);
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]);
  const [quinielasCerradas, setQuinielasCerradas] = useState<any[]>([]); 
  const [quiniela, setQuiniela] = useState<any>(null);
  const [partidos, setPartidos] = useState<any[]>([]);
  
  const [resultadosReales, setResultadosReales] = useState<Record<string, string>>({});
  const [marcadoresReales, setMarcadoresReales] = useState<Record<string, { l: string, v: string }>>({}); 
  const [esFinalReal, setEsFinalReal] = useState<Record<string, boolean>>({});
  const [golesReales, setGolesReales] = useState<string>('');
  const [calificando, setCalificando] = useState(false);
  const [rankingAdmin, setRankingAdmin] = useState<any[]>([]); 
  const [busquedaJugador, setBusquedaJugador] = useState('');

  const [tipoImpresion, setTipoImpresion] = useState<'tickets' | 'sabana' | 'recibo' | 'tabla' | null>(null);
  const [ticketAImprimir, setTicketAImprimir] = useState<any>(null);

  // --- ESTADOS EDICIÓN JORNADA ---
  const [editandoQuinielaId, setEditandoQuinielaId] = useState<string | null>(null);
  const [editNombreJornada, setEditNombreJornada] = useState('');
  const [editFechaCierre, setEditFechaCierre] = useState('');
  const [editPrecioTicket, setEditPrecioTicket] = useState('30'); 
  const [editTipoPremiacion, setEditTipoPremiacion] = useState<'unico' | 'top2' | 'top3' | 'promo_unico' | 'promo_top2'>('unico');
  const [editModalidad, setEditModalidad] = useState<'clasica' | 'marcador_exacto' | 'sorteo'>('clasica');
  const [editPartidos, setEditPartidos] = useState<any[]>([]);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // --- ESTADOS EDICIÓN TICKET ---
  const [editandoTicketId, setEditandoTicketId] = useState<string | null>(null);
  const [editTicketNombre, setEditTicketNombre] = useState('');
  const [editTicketGoles, setEditTicketGoles] = useState('');
  const [editTicketSelecciones, setEditTicketSelecciones] = useState<Record<string, string>>({});
  const [guardandoEdicionTicket, setGuardandoEdicionTicket] = useState(false);

  useEffect(() => { cargarEquiposDB(); }, []);
  useEffect(() => { cargarJornadas(); }, [vistaActual]);
  useEffect(() => {
    const handleAfterPrint = () => setTipoImpresion(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

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
      const query = supabase
        .from('quinielas')
        .select('id, nombre_jornada, precio_ticket, goles_totales_real, fecha_cierre, estado, tipo_premiacion, modalidad, equipos_sorteo, partidos (id, equipo_local, equipo_visitante, resultado_real, fecha_hora_partido, goles_local, goles_visitante, es_final)');

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
    
    const partidosOrdenados = (qData.partidos || []).sort((a: any, b: any) => {
       if (a.fecha_hora_partido && b.fecha_hora_partido) return new Date(a.fecha_hora_partido).getTime() - new Date(b.fecha_hora_partido).getTime();
       return 0;
    });
    setPartidos(partidosOrdenados);
    setBusquedaJugador('');
    
    const res: Record<string, string> = {};
    const marcs: Record<string, { l: string, v: string }> = {};
    const finales: Record<string, boolean> = {}; 
    let sumaGolesCalculada = 0;
    let hayGoles = false;
    
    qData.partidos.forEach((p: any) => { 
      if (p.resultado_real) res[p.id] = p.resultado_real;
      finales[p.id] = p.es_final || false; 

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

    const { data: tData } = await supabase.from('tickets').select('id, usuario_id, prediccion_goles_total, equipo_asignado_id, puntos_totales, pronosticos(partido_id, eleccion_usuario)').eq('quiniela_id', qData.id);
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
          
          if (p && p.resultado_real) {
            if (qData.modalidad === 'marcador_exacto') {
              if (pr.eleccion_usuario.includes('-') && p.goles_local !== null && p.goles_visitante !== null) {
                const [pl, pv] = pr.eleccion_usuario.split('-').map(Number);
                if (pl === p.goles_local && pv === p.goles_visitante) {
                  pts += 3;
                } else {
                  const tendenciaPred = pl > pv ? 'L' : pl < pv ? 'V' : 'E';
                  if (tendenciaPred === p.resultado_real) pts += 1;
                }
              }
            } else {
              if (p.resultado_real === pr.eleccion_usuario) pts++;
            }
          }
        });
        
        const golesRealesAct = hayGoles ? sumaGolesCalculada : (qData.goles_totales_real !== null ? qData.goles_totales_real : -1);
        const golesDiff = golesRealesAct !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesRealesAct) : 999;

        return { 
          id: ticket.id, usuario_id: ticket.usuario_id, nombre: mapaU[ticket.usuario_id]?.nombre || 'Mostrador', 
          telefono: mapaU[ticket.usuario_id]?.telefono || '', creditos_disponibles: mapaU[ticket.usuario_id]?.creditos || 0,
          puntos: pts, prediccionGoles: ticket.prediccion_goles_total, golesDiff, pronosticosDiccionario: prons,
          equipo_asignado_id: ticket.equipo_asignado_id,
          puntos_totales: ticket.puntos_totales, 
          estaEliminado: ticket.puntos_totales < 0
        };
      }).sort((a, b) => {
        if (qData.modalidad === 'sorteo') {
           if (a.estaEliminado === b.estaEliminado) return 0;
           return a.estaEliminado ? 1 : -1;
        }
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return a.golesDiff - b.golesDiff;
      });

      rCalc.forEach((item: any, idx) => {
        if (qData.modalidad === 'sorteo') {
           item.posicion = idx + 1;
        } else {
           if (idx > 0) {
             const anterior = rCalc[idx - 1];
             if (item.puntos === anterior.puntos && item.golesDiff === anterior.golesDiff) item.posicion = anterior.posicion;
             else item.posicion = idx + 1;
           } else item.posicion = 1;
        }
      });

      setRankingAdmin(rCalc);
    }
  };

  const toggleEstadoSupervivencia = async (ticketId: string, estaEliminado: boolean, nombreJugador: string) => {
    if (operacionEnCurso.current) return;
    const nuevoEstado = estaEliminado ? 0 : -1; 
    const accion = estaEliminado ? 'Revivir' : 'Eliminar';
    const confirmar = window.confirm(`💀 ¿Seguro que deseas ${accion.toUpperCase()} a ${nombreJugador}?`);
    if (!confirmar) return;

    operacionEnCurso.current = true;
    const idToast = toast.loading(`Ejecutando orden: ${accion} a ${nombreJugador}...`);

    try {
      await supabase.from('tickets').update({ puntos_totales: nuevoEstado }).eq('id', ticketId);
      toast.success(`Jugador ${accion.toLowerCase()}do con éxito.`, { id: idToast });
      setRankingAdmin(prev => {
         const nuevos = prev.map(t => t.id === ticketId ? { ...t, puntos_totales: nuevoEstado, estaEliminado: nuevoEstado < 0 } : t);
         return nuevos.sort((a, b) => {
            if (a.estaEliminado === b.estaEliminado) return 0;
            return a.estaEliminado ? 1 : -1;
         });
      });
    } catch (error) { toast.error(`Error al ${accion.toLowerCase()} jugador.`, { id: idToast }); } 
    finally { operacionEnCurso.current = false; }
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
            const resDir = resultadosReales[pronostico.partido_id];
            const marcReal = marcadoresReales[pronostico.partido_id];
            
            if (resDir) {
              if (quiniela.modalidad === 'marcador_exacto') {
                if (pronostico.eleccion_usuario.includes('-') && marcReal?.l !== '' && marcReal?.v !== '') {
                  const [pl, pv] = pronostico.eleccion_usuario.split('-').map(Number);
                  const rl = parseInt(marcReal.l);
                  const rv = parseInt(marcReal.v);
                  if (pl === rl && pv === rv) puntos += 3;
                  else {
                    const tendenciaPred = pl > pv ? 'L' : pl < pv ? 'V' : 'E';
                    if (tendenciaPred === resDir) puntos += 1;
                  }
                }
              } else {
                if (resDir === pronostico.eleccion_usuario) puntos++;
              }
            }
          }
          await supabase.from('tickets').update({ puntos_totales: puntos }).eq('id', ticket.id);
        }
      }
      toast.success('¡Avance guardado y posiciones actualizadas!', { id: idToast });
      await cargarJornadas();
    } catch (error) { toast.error('Error al guardar avance', { id: idToast }); } 
    finally { setCalificando(false); operacionEnCurso.current = false; }
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

    navigator.clipboard.writeText(texto).then(() => toast.success('📋 ¡Resumen copiado! Pégalo en tu grupo de WhatsApp.'))
      .catch(() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank'));
  };

  const enviarWhatsAppBoleto = (jugador: any) => {
    if (!jugador.telefono || jugador.telefono.trim() === '') return toast.error(`Sin WhatsApp registrado para ${jugador.nombre}.`);
    
    let telefonoLimpio = jugador.telefono.replace(/\D/g, '');
    
    if (telefonoLimpio.length === 10) {
      telefonoLimpio = `52${telefonoLimpio}`;
    }

    let msg = '';
    if (quiniela.modalidad === 'sorteo') {
      const eqSorteado = jugador.equipo_asignado_id ? equipos.find((e:any) => e.id === jugador.equipo_asignado_id) : null;
      msg = `🎫 *SORTEO CIBERTEQUE*\nHola ${jugador.nombre}, tu lugar en *${quiniela.nombre_jornada}* está asegurado.\n\n`;
      if (eqSorteado) msg += `🎲 *¡EL SORTEO SE HA REALIZADO!*\nTu equipo asignado es: *${eqSorteado.nombre.toUpperCase()}*\n\n¡Mucha suerte en el torneo!`;
      else msg += `Esperando a que la sala se llene (8 participantes) para conocer qué equipo te será asignado aleatoriamente.\n\n🍀 ¡Mucha suerte!`;
    } else {
      let seleccionesTexto = '';
      partidos.forEach(p => {
        let pick = jugador.pronosticosDiccionario[p.id];
        if (quiniela.modalidad !== 'marcador_exacto') pick = pick === 'L' ? p.equipo_local : pick === 'V' ? p.equipo_visitante : 'Empate';
        seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
      });
      msg = `🎫 *QUINIELA CIBERTEQUE*\nHola ${jugador.nombre}, tu jugada para *${quiniela.nombre_jornada}* está registrada.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate: *${jugador.prediccionGoles}*\n\nRanking en vivo:\n👉 ${ENLACE_PUBLICO_RANKING}\n\n🍀 ¡Suerte!`;
    }
    
    window.open(`https://api.whatsapp.com/send?phone=${telefonoLimpio}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  const cerrarJornadaDefinitivo = async () => {
    if (!quiniela) return;
    if (quiniela.modalidad !== 'sorteo') {
      const faltan = partidos.filter(p => !resultadosReales[p.id]).length;
      if (faltan > 0) return toast.error(`🚨 Faltan ${faltan} partido(s) por capturar. La liquidación está bloqueada para prevenir pagos erróneos.`);
    }

    if (golesReales === '' && quiniela.modalidad !== 'sorteo') return toast.error('🚨 Ingresa primero el "Resultado Oficial" de goles totales.');
    if (!rankingAdmin || rankingAdmin.length === 0) return toast.error('No hay tickets registrados.');
    if (operacionEnCurso.current) return;

    const tPremio = quiniela.tipo_premiacion || 'unico';
    const precioTicketMXN = quiniela.precio_ticket ?? 30; 
    const premioSorteo = (rankingAdmin.length * precioTicketMXN) * PORCENTAJE_PREMIO;
    let ganadores: any[] = [];
    let desgloseTexto = '';

    if (quiniela.modalidad === 'sorteo') {
      const vivos = rankingAdmin.filter(r => !r.estaEliminado);
      if (vivos.length > 1) return toast.error('🚨 Aún hay más de 1 jugador vivo. Debes eliminarlos desde el panel hasta que quede solo 1 para declarar campeón.');
      desgloseTexto = vivos.length === 1 ? `\n- CAMPEÓN ÚNICO: ${vivos[0].nombre.toUpperCase()}\n- Premio a depositar: $${premioSorteo.toFixed(0)} MXN` : `\n- NO HAY GANADORES (Todos eliminados). Caja a favor de la casa.`;
    } else {
      const res = calcularPremios(rankingAdmin, tPremio, precioTicketMXN, 1, PORCENTAJE_PREMIO);
      ganadores = res.ganadores;
      desgloseTexto = res.desgloseTexto;
    }

    const confirmar = window.confirm(`⚠️ ¿DENTRO DE CAJA REAL? ⚠️\n\nVas a cerrar la jornada de forma DEFINITIVA.\n\nFormato: ${tPremio.replace('_', ' ').toUpperCase()}\nDesglose de Premiación:${desgloseTexto}\n\n¿Confirmas el cierre?`);
    if (!confirmar) return;

    operacionEnCurso.current = true;
    setCalificando(true);
    const idToast = toast.loading('Liquidando premios, cobrando deudas y cerrando jornada...');
    
    try {
      let idsGanadores: string[] = [];

      const procesarPagoPremio = async (usuarioId: string, cantidadPremio: number, descripcionPremio: string) => {
        const { data: userData } = await supabase
          .from('usuarios')
          .select('creditos_disponibles, deuda_pesos')
          .eq('id', usuarioId)
          .single();
        
        let saldoActual = Number(userData?.creditos_disponibles || 0);
        let deudaActual = Math.abs(Number(userData?.deuda_pesos || 0)); 
        let premioSobrante = cantidadPremio;
        let cobroDeuda = 0;

        if (deudaActual > 0) {
          cobroDeuda = Math.min(premioSobrante, deudaActual);
          premioSobrante -= cobroDeuda;
          deudaActual -= cobroDeuda; 
        }

        const nuevoSaldo = saldoActual + premioSobrante;

        await supabase.from('usuarios').update({ 
          creditos_disponibles: nuevoSaldo,
          deuda_pesos: deudaActual 
        }).eq('id', usuarioId);

        await supabase.from('transacciones_creditos').insert([{ 
          usuario_id: usuarioId, 
          cantidad: cantidadPremio, 
          tipo_movimiento: 'premio_quiniela', 
          descripcion: descripcionPremio 
        }]);

        if (cobroDeuda > 0) {
          await supabase.from('transacciones_creditos').insert([{ 
            usuario_id: usuarioId, 
            cantidad: -cobroDeuda, 
            tipo_movimiento: 'abono_deuda', 
            descripcion: `Cobro automático de saldo pendiente por premio ganado` 
          }]);
        }

        if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuarioId, nuevoSaldo);
      };

      if (quiniela.modalidad === 'sorteo') {
        const vivos = rankingAdmin.filter(r => !r.estaEliminado);
        if (vivos.length === 1) {
            const ganador = vivos[0];
            idsGanadores.push(ganador.usuario_id); 
            
            await procesarPagoPremio(ganador.usuario_id, premioSorteo, `Premio 1ro Sorteo: ${quiniela.nombre_jornada}`);
            toast.success(`🎉 Sorteo Cerrado.\nPremio procesado para ${ganador.nombre}`, { id: idToast, duration: 6000 });
        } else {
            toast.success('Sorteo cerrado sin ganadores.', { id: idToast });
        }
        await supabase.from('quinielas').update({ estado: 'cerrada' }).eq('id', quiniela.id);
      } else {
        for (const pId of Object.keys(resultadosReales || {})) {
          const l_val = marcadoresReales[pId]?.l;
          const v_val = marcadoresReales[pId]?.v;
          await supabase.from('partidos').update({ resultado_real: resultadosReales[pId], goles_local: (l_val !== undefined && l_val !== '') ? parseInt(l_val) : null, goles_visitante: (v_val !== undefined && v_val !== '') ? parseInt(v_val) : null, es_final: esFinalReal[pId] || false }).eq('id', pId);
        }
        const golesActualizar = golesReales !== '' ? parseInt(golesReales) : null;
        await supabase.from('quinielas').update({ goles_totales_real: golesActualizar, estado: 'cerrada' }).eq('id', quiniela.id);
        
        if (ganadores.length > 0) {
          for (const ganador of ganadores) {
            idsGanadores.push(ganador.usuario_id);
            await procesarPagoPremio(ganador.usuario_id, ganador.cantidad, `Premio ${ganador.lugar}: ${quiniela.nombre_jornada}`);
          }
          toast.success(`🎉 ¡Jornada Cerrada!\nSe pagaron los premios y se cobraron deudas automáticamente.`, { id: idToast, duration: 6000 });
        } else {
          toast.success(`🎉 ¡Jornada Cerrada Exitosamente!\nNo hubo ganadores.`, { id: idToast, duration: 5000 });
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: usuariosRegistrados } = await supabase.from('usuarios').select('id');

      if (usuariosRegistrados && usuariosRegistrados.length > 0) {
        const notificacionesResultados = usuariosRegistrados.filter(u => u.id !== user?.id).map(u => {
            const esGanador = idsGanadores.includes(u.id);
            const mensaje = esGanador 
              ? `te felicita porque GANASTE en la ${quiniela.nombre_jornada} 🏆. ¡Tu premio ha sido procesado (se descontaron deudas pendientes si tenías)!`
              : `cerró oficialmente la ${quiniela.nombre_jornada}. 🏁 Los premios han sido repartidos, ¡revisa el podio!`;
            return { usuario_emisor_id: user?.id || null, usuario_receptor_id: u.id, tipo: 'resultado', contenido: mensaje };
          });
        if (notificacionesResultados.length > 0) await supabase.from('notificaciones').insert(notificacionesResultados);
      }
      await cargarJornadas();
    } catch (e: any) { toast.error('Error al liquidar la jornada: ' + e.message, { id: idToast }); } 
    finally { setCalificando(false); operacionEnCurso.current = false; }
  };

  const activarImpresion = (tipo: 'tickets' | 'sabana' | 'recibo' | 'tabla') => {
    setTipoImpresion(tipo);
    setTimeout(() => window.print(), 1500); 
  };

  const eliminarTicket = async (ticketId: string, nombreJugador: string) => {
    if (operacionEnCurso.current) return;
    const confirmar = window.confirm(`⚠️ ADVERTENCIA ⚠️\n\n¿Estás seguro que deseas ELIMINAR el boleto de ${nombreJugador}?\n\nEsta acción borrará el boleto permanentemente y no se puede deshacer.`);
    if (!confirmar) return;

    operacionEnCurso.current = true;
    const idToast = toast.loading(`Eliminando boleto de ${nombreJugador}...`);
    try {
      await supabase.from('pronosticos').delete().eq('ticket_id', ticketId);
      const { error } = await supabase.from('tickets').delete().eq('id', ticketId);
      if (error) throw error;
      toast.success('Boleto eliminado exitosamente.', { id: idToast });
      await cargarJornadas();
    } catch (error: any) { toast.error('Error al eliminar boleto.', { id: idToast }); } 
    finally { operacionEnCurso.current = false; }
  };

  const ejecutarSorteoMundial = async (equiposIds: string[]) => {
    if (!quiniela || operacionEnCurso.current) return;
    if (rankingAdmin.length !== 8) return toast.error(`La sala debe tener exactamente 8 participantes. Actuales: ${rankingAdmin.length}`);
    if (equiposIds.length !== 8) return toast.error('Se requieren los IDs de los 8 equipos a sortear.');

    const confirmar = window.confirm('🎲 ¿Estás seguro de realizar el sorteo? Esto asignará un equipo aleatorio a cada jugador y NO se puede deshacer.');
    if (!confirmar) return Promise.reject();

    operacionEnCurso.current = true;
    try {
      let equiposMezclados = [...equiposIds];
      for (let i = equiposMezclados.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [equiposMezclados[i], equiposMezclados[j]] = [equiposMezclados[j], equiposMezclados[i]];
      }
      const promesas = rankingAdmin.map((ticket, index) => {
        return supabase.from('tickets').update({ equipo_asignado_id: equiposMezclados[index] }).eq('id', ticket.id);
      });
      await Promise.all(promesas);
      await cargarJornadas();
      return Promise.resolve();
    } catch (error: any) {
      toast.error('Ocurrió un error en el sorteo en DB.');
      return Promise.reject(error);
    } finally {
      operacionEnCurso.current = false;
    }
  };

  const compartirResultadoSorteo = () => {
    if (!quiniela) return;
    let texto = `🎲 *RESULTADOS DEL SORTEO: ${quiniela.nombre_jornada.toUpperCase()}* 🎲\n\n`;
    rankingAdmin.forEach((r, idx) => {
       const eq = equipos.find(e => e.id === r.equipo_asignado_id);
       texto += `${r.estaEliminado ? '💀' : '🟢'} ${r.nombre.toUpperCase()} 👉 *${eq ? eq.nombre : 'Pendiente'}*\n`;
    });
    texto += `\n💻 *Revisa los resultados EN VIVO aquí:*\n👉 ${ENLACE_PUBLICO_RANKING}\n\n🍀 ¡Mucha suerte a todos!`;
    navigator.clipboard.writeText(texto)
      .then(() => toast.success('📋 ¡Resultados copiados!'))
      .catch(() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank'));
  };

  const eliminarJornadaDefinitiva = async () => {
    if (!quiniela || operacionEnCurso.current) return;

    const confirmar = window.confirm(`⚠️ ¡PELIGRO DE BORRADO! ⚠️\n\n¿Estás completamente seguro de que deseas ELIMINAR la jornada "${quiniela.nombre_jornada}"?\n\n- Se borrarán todos los partidos.\n- Se borrarán todos los boletos vendidos.\n- SE REEMBOLSARÁ automáticamente el costo del boleto a las cuentas de los jugadores.\n\n¿Deseas continuar?`);
    if (!confirmar) return;

    operacionEnCurso.current = true;
    const idToast = toast.loading('Procesando reembolsos y eliminando jornada...');
    
    try {
      const { data: ticketsInfo } = await supabase.from('tickets').select('id, usuario_id').eq('quiniela_id', quiniela.id);
      
      if (ticketsInfo && ticketsInfo.length > 0) {
         const precioRefund = quiniela.precio_ticket || 30;
         const reembolsosUsuario: Record<string, number> = {};
         
         ticketsInfo.forEach(t => {
            reembolsosUsuario[t.usuario_id] = (reembolsosUsuario[t.usuario_id] || 0) + precioRefund;
         });

         for (const usuarioId of Object.keys(reembolsosUsuario)) {
            const montoRefund = reembolsosUsuario[usuarioId];
            
            const { data: user } = await supabase.from('usuarios').select('creditos_disponibles').eq('id', usuarioId).single();
            if (user) {
               const nuevoSaldo = Number(user.creditos_disponibles || 0) + montoRefund;
               
               await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioId);
               await supabase.from('transacciones_creditos').insert([{ 
                 usuario_id: usuarioId, 
                 cantidad: montoRefund, 
                 tipo_movimiento: 'reembolso_quiniela', 
                 descripcion: `Reembolso por cancelación: ${quiniela.nombre_jornada}` 
               }]);

               if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuarioId, nuevoSaldo);
            }
         }

         const ids = ticketsInfo.map(t => t.id);
         await supabase.from('pronosticos').delete().in('ticket_id', ids);
         await supabase.from('tickets').delete().eq('quiniela_id', quiniela.id);
      }
      
      await supabase.from('partidos').delete().eq('quiniela_id', quiniela.id);
      await supabase.from('quinielas').delete().eq('id', quiniela.id);

      toast.success('Jornada eliminada y dinero reembolsado.', { id: idToast });
      setQuiniela(null);
      await cargarJornadas();
    } catch (error: any) {
      toast.error('Error al eliminar jornada: ' + error.message, { id: idToast });
    } finally {
      operacionEnCurso.current = false;
    }
  };

  const iniciarEdicionJornada = () => {
    if (!quiniela) return;
    setEditandoQuinielaId(quiniela.id);
    setEditNombreJornada(quiniela.nombre_jornada);
    setEditPrecioTicket(quiniela.precio_ticket?.toString() || '30');
    
    const fecha = new Date(quiniela.fecha_cierre);
    fecha.setMinutes(fecha.getMinutes() - fecha.getTimezoneOffset());
    setEditFechaCierre(fecha.toISOString().slice(0, 16));
    setEditTipoPremiacion(quiniela.tipo_premiacion || 'unico');
    setEditModalidad(quiniela.modalidad || 'clasica');

    const partidosCopia = JSON.parse(JSON.stringify(partidos)).map((p: any) => {
       if (p.fecha_hora_partido) {
         const f = new Date(p.fecha_hora_partido);
         f.setMinutes(f.getMinutes() - f.getTimezoneOffset());
         p.fecha_hora_partido = f.toISOString().slice(0, 16);
       }
       return p;
    });
    setEditPartidos(partidosCopia); 
  };

  const actualizarPartidoEditado = (index: number, campo: 'equipo_local' | 'equipo_visitante' | 'fecha_hora_partido', valor: string) => {
    const nuevos = [...editPartidos];
    nuevos[index][campo] = valor;
    setEditPartidos(nuevos);
  };

  const agregarPartidoEditado = () => {
    const ultimaFecha = editPartidos.length > 0 ? editPartidos[editPartidos.length - 1].fecha_hora_partido : '';
    setEditPartidos([...editPartidos, { id: `nuevo_${Date.now()}`, equipo_local: '', equipo_visitante: '', fecha_hora_partido: ultimaFecha, es_nuevo: true }]);
  };

  const eliminarPartidoEditado = (index: number) => {
    const confirmar = window.confirm('¿Quitar este partido de la lista?\nNota: Si ya había boletos vendidos, esos pronósticos quedarán huérfanos.');
    if (confirmar) {
       setEditPartidos(editPartidos.filter((_, i) => i !== index));
    }
  };

  const guardarCambiosJornada = async () => {
    if (!editandoQuinielaId || operacionEnCurso.current) return;
    operacionEnCurso.current = true;
    setGuardandoEdicion(true);
    const idToast = toast.loading('Guardando ajustes de jornada...');
    
    try {
      await supabase.from('quinielas').update({
        nombre_jornada: editNombreJornada, 
        precio_ticket: parseInt(editPrecioTicket) || 30,
        fecha_cierre: new Date(editFechaCierre).toISOString(), 
        tipo_premiacion: editTipoPremiacion,
        modalidad: editModalidad
      }).eq('id', editandoQuinielaId);

      const idsEditados = editPartidos.filter(p => !p.es_nuevo).map(p => p.id);
      const idsParaEliminar = partidos.map(p => p.id).filter(id => !idsEditados.includes(id));
      
      if (idsParaEliminar.length > 0) {
        await supabase.from('partidos').delete().in('id', idsParaEliminar);
      }

      for (const p of editPartidos) {
        const fechaUTC = p.fecha_hora_partido ? new Date(p.fecha_hora_partido).toISOString() : null;
        
        if (p.es_nuevo) {
          await supabase.from('partidos').insert([{
             quiniela_id: editandoQuinielaId,
             equipo_local: p.equipo_local,
             equipo_visitante: p.equipo_visitante,
             fecha_hora_partido: fechaUTC
          }]);
        } else {
          await supabase.from('partidos').update({ 
             equipo_local: p.equipo_local, 
             equipo_visitante: p.equipo_visitante,
             fecha_hora_partido: fechaUTC
          }).eq('id', p.id);
        }
      }

      toast.success('Jornada actualizada con éxito', { id: idToast });
      setEditandoQuinielaId(null);
      await cargarJornadas();
    } catch (error: any) { 
      toast.error('Error al actualizar: ' + error.message, { id: idToast }); 
    } finally { 
      setGuardandoEdicion(false); 
      operacionEnCurso.current = false; 
    }
  };

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
        const { data: pronExistente } = await supabase.from('pronosticos').select('id').eq('ticket_id', editandoTicketId).eq('partido_id', pId).single();
        if (pronExistente) await supabase.from('pronosticos').update({ eleccion_usuario: eleccion }).eq('id', pronExistente.id);
        else await supabase.from('pronosticos').insert({ ticket_id: editandoTicketId, partido_id: pId, eleccion_usuario: eleccion });
      }
      toast.success('Ticket modificado', { id: idToast });
      setEditandoTicketId(null);
      await cargarJornadas();
    } catch (error) { toast.error('Error al modificar ticket', { id: idToast }); } 
    finally { setGuardandoEdicionTicket(false); operacionEnCurso.current = false; }
  };

  const partidosPendientes = partidos.filter(p => !resultadosReales[p.id]).length;
  const sePuedeLiquidar = partidos.length > 0 && partidosPendientes === 0;

  return {
    state: { cargando, vistaActual, equipos, quinielasAbiertas, quinielasCerradas, quiniela, partidos, resultadosReales, marcadoresReales, esFinalReal, golesReales, calificando, rankingAdmin, busquedaJugador, tipoImpresion, ticketAImprimir, partidosPendientes, sePuedeLiquidar },
    setters: { setVistaActual, setGolesReales, setBusquedaJugador, setTicketAImprimir, setTipoImpresion },
    actions: { 
      cargarDetallesQuiniela, handleMarcadorExacto, handleToggleEsFinal, guardarYCalificar, 
      compartirAvanceGrupo, enviarWhatsAppBoleto, cerrarJornadaDefinitivo, obtenerLogo, 
      activarImpresion, eliminarTicket, ejecutarSorteoMundial, compartirResultadoSorteo, toggleEstadoSupervivencia,
      eliminarJornadaDefinitiva 
    }, 
    edicionJornada: { 
      editandoQuinielaId, editNombreJornada, editFechaCierre, editTipoPremiacion, editModalidad, editPartidos, guardandoEdicion, editPrecioTicket,
      setEditandoQuinielaId, setEditNombreJornada, setEditFechaCierre, setEditTipoPremiacion, setEditModalidad, setEditPrecioTicket,
      iniciarEdicionJornada, actualizarPartidoEditado, agregarPartidoEditado, eliminarPartidoEditado, guardarCambiosJornada 
    },
    edicionTicket: { editandoTicketId, editTicketNombre, editTicketGoles, editTicketSelecciones, guardandoEdicionTicket, setEditandoTicketId, abrirEdicionTicket, seleccionarOpcionEditTicket, guardarEdicionTicket },
    constantes: { PORCENTAJE_PREMIO, PORCENTAJE_ADMIN }
  };
}