'use client'
import React, { useEffect, useState, Fragment, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export default function Posiciones() {
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]) 
  const [quinielaActiva, setQuinielaActiva] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  
  const [quinielaExpandidaId, setQuinielaExpandidaId] = useState<string | null>(null)
  const [jugadorExpandidoId, setJugadorExpandidoId] = useState<string | null>(null)

  const PORCENTAJE_PREMIO = 0.80 

  const cargarDatos = useCallback(async (esCargaSilenciosa = false) => {
    if (!esCargaSilenciosa) setCargando(true)

    try {
      const { data: qData } = await supabase
        .from('quinielas')
        .select('*')
        .order('fecha_cierre', { ascending: false }) 
        .limit(10)

      if (!qData || qData.length === 0) {
        setCargando(false)
        return
      }

      const quinielaIds = qData.map(q => q.id)

      const { data: pData } = await supabase.from('partidos').select('*').in('quiniela_id', quinielaIds).order('fecha_hora', { ascending: true })
      
      const { data: tData } = await supabase.from('tickets').select('id, usuario_id, quiniela_id, prediccion_goles_total, puntos_totales, equipo_asignado_id, pronosticos(partido_id, eleccion_usuario)').in('quiniela_id', quinielaIds)
      
      const { data: uData } = await supabase.from('usuarios').select('id, nombre, avatar_url')
      const { data: eData } = await supabase.from('equipos').select('id, nombre, logo_url')
      
      const mapaUsuarios: Record<string, { nombre: string, avatar_url: string | null }> = {}
      if (uData) uData.forEach(u => mapaUsuarios[u.id] = { nombre: u.nombre, avatar_url: u.avatar_url })

      const mapaEquipos: Record<string, any> = {}
      if (eData) eData.forEach(e => mapaEquipos[e.id] = e)

      // ⚡ Función modular interna para extraer tendencia L-E-V de un marcador
      const getLEV = (marcador: string) => {
        if (!marcador) return null;
        const limpio = marcador.replace(/\s+/g, '').toUpperCase();
        if (['L', 'E', 'V'].includes(limpio)) return limpio;
        if (limpio.includes('-')) {
          const [l, v] = limpio.split('-').map(Number);
          if (!isNaN(l) && !isNaN(v)) {
            if (l > v) return 'L';
            if (l < v) return 'V';
            return 'E';
          }
        }
        return null;
      }

      const quinielasProcesadas = qData.map(q => {
        const partidosQ = pData?.filter(p => p.quiniela_id === q.id) || []
        const ticketsQ = tData?.filter(t => t.quiniela_id === q.id) || []

        const ranking = ticketsQ.map(ticket => {
          let puntos = 0
          const aciertos: Record<string, string> = {}
          const pronosticosTicket = ticket.pronosticos || [] 

          // ⚡ LÓGICA DE PUNTUACIÓN HÍBRIDA BLINDADA
          if (q.modalidad !== 'sorteo') {
            pronosticosTicket.forEach((pron: any) => {
              const partido = partidosQ.find(p => p.id === pron.partido_id)
              if (partido) {
                const tieneResultado = partido.resultado_real !== null || (partido.goles_local !== null && partido.goles_visitante !== null);
                
                if (tieneResultado) {
                  // 1. Limpiamos espacios en blanco del pick del usuario
                  const pickStr = pron.eleccion_usuario?.replace(/\s+/g, '') || '';
                  
                  // 2. Construimos el resultado real forzando formato "X-Y" si hay goles, evitando fallos si resultado_real guardó "L"
                  let realStr = '';
                  if (partido.goles_local !== null && partido.goles_visitante !== null) {
                    realStr = `${partido.goles_local}-${partido.goles_visitante}`;
                  } else {
                    realStr = partido.resultado_real?.replace(/\s+/g, '') || '';
                  }

                  // 3. Comparación estricta
                  if (pickStr === realStr) {
                    puntos += (q.modalidad === 'marcador_exacto' ? 3 : 1);
                    aciertos[pron.partido_id] = 'acierto_exacto';
                  } else {
                    // 4. Fallback a Tendencia (L, E, V)
                    const pickLEV = getLEV(pickStr);
                    const realLEV = getLEV(realStr) || getLEV(partido.resultado_real);
                    
                    if (pickLEV && realLEV && pickLEV === realLEV) {
                      puntos += 1;
                      aciertos[pron.partido_id] = 'acierto_lev';
                    } else {
                      aciertos[pron.partido_id] = 'fallo';
                    }
                  }
                } else {
                  aciertos[pron.partido_id] = 'pendiente';
                }
              }
            })
          }

          const golesReales = q.goles_totales_real !== null ? q.goles_totales_real : -1
          const golesDiff = golesReales !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesReales) : 999

          const userData = mapaUsuarios[ticket.usuario_id] || { nombre: 'Jugador de Mostrador', avatar_url: null }
          const equipoAsignado = ticket.equipo_asignado_id ? mapaEquipos[ticket.equipo_asignado_id] : null

          return {
            id: ticket.id,
            nombre: userData.nombre,
            avatar_url: userData.avatar_url,
            prediccionGoles: ticket.prediccion_goles_total || 0,
            puntos: q.modalidad === 'sorteo' ? ticket.puntos_totales : puntos,
            aciertos,
            golesDiff,
            pronosticos: pronosticosTicket,
            equipoAsignado,
            estaEliminado: q.modalidad === 'sorteo' && ticket.puntos_totales < 0
          }
        })

        if (q.modalidad === 'sorteo') {
           ranking.sort((a, b) => {
              if (a.estaEliminado === b.estaEliminado) return 0;
              return a.estaEliminado ? 1 : -1;
           });
        } else {
           ranking.sort((a, b) => {
             if (b.puntos !== a.puntos) return b.puntos - a.puntos
             return a.golesDiff - b.golesDiff
           })
        }

        ranking.forEach((item: any, idx) => {
          if (q.modalidad === 'sorteo') {
             item.posicion = idx + 1; 
          } else {
             if (idx > 0) {
               const anterior = ranking[idx - 1];
               if (item.puntos === anterior.puntos && item.golesDiff === anterior.golesDiff) {
                 item.posicion = anterior.posicion; 
               } else {
                 item.posicion = idx + 1; 
               }
             } else {
               item.posicion = 1;
             }
          }
        });

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

      const activas = quinielasProcesadas
        .filter(q => q.estado === 'abierta' || (q.estado === 'cerrada' && q.goles_totales_real === null && q.modalidad !== 'sorteo') || (q.estado === 'abierta' && q.modalidad === 'sorteo'))
        .sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime())

      const pasadas = quinielasProcesadas
        .filter(q => (q.estado === 'cerrada' && q.goles_totales_real !== null) || (q.estado === 'cerrada' && q.modalidad === 'sorteo'))
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

    } catch (error) {
      console.error("Error al cargar posiciones:", error)
    } finally {
      setCargando(false)
    }
  }, []) 

  useEffect(() => {
    cargarDatos()

    const canalPosiciones = supabase.channel('posiciones_publicas_blindado')
      .on('postgres', { event: '*', schema: 'public', table: 'partidos' }, () => {
        cargarDatos(true);
      })
      .on('postgres', { event: '*', schema: 'public', table: 'quinielas' }, () => {
        cargarDatos(true);
      })
      .on('postgres', { event: '*', schema: 'public', table: 'tickets' }, () => {
        cargarDatos(true);
      })
      .on('postgres', { event: '*', schema: 'public', table: 'pronosticos' }, () => {
        cargarDatos(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canalPosiciones);
    }
  }, [cargarDatos])

  const toggleExpandirHistorial = (id: string) => {
    setQuinielaExpandidaId(prevId => prevId === id ? null : id)
  }

  const toggleExpandirJugador = (id: string) => {
    setJugadorExpandidoId(prevId => prevId === id ? null : id)
  }

  if (cargando) {
    return (
      <div className="w-full max-w-4xl mt-6 animate-pulse space-y-4 px-2">
        <div className="flex justify-center gap-2 mb-4">
          <div className="h-8 bg-slate-800 rounded-lg w-24"></div>
          <div className="h-8 bg-slate-800 rounded-lg w-24"></div>
        </div>
        <div className="h-44 bg-slate-800 rounded-2xl w-full"></div>
        <div className="h-64 bg-slate-800/80 rounded-xl w-full border border-slate-800"></div>
      </div>
    )
  }

  if (!quinielaActiva) return <div className="text-slate-500 italic text-center mt-10 text-sm">No hay datos de quinielas disponibles.</div>

  const totalJugadores = quinielaActiva.ranking.length
  const partidosTerminados = quinielaActiva.partidos?.filter((p: any) => p.es_final).length || 0
  
  const fechaCierreCorta = quinielaActiva.fecha_cierre ? quinielaActiva.fecha_cierre.substring(0, 16) : null
  const fechaCierre = new Date(fechaCierreCorta || quinielaActiva.fecha_cierre)
  const yaPasoCierre = new Date() >= fechaCierre
  
  const mostrarPicks = quinielaActiva.estado === 'cerrada' || yaPasoCierre
  const esSorteo = quinielaActiva.modalidad === 'sorteo'

  const opcionesFecha: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' };
  const fechaTextoVisible = fechaCierre.toLocaleDateString('es-MX', opcionesFecha).replace(',', ' a las');

  const getAvatarUrl = (nombre: string, url: string | null) => {
    if (url) return url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=1e293b&color=3b82f6&size=100&bold=true`;
  }

  const esPromo = quinielaActiva.tipo_premiacion?.toLowerCase().includes('promo');

  return (
    <div className="w-full max-w-4xl mt-2 animate-in fade-in duration-500 mb-20 space-y-6">
      
      <section>
        {quinielasAbiertas.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800 shadow-inner justify-center">
            {quinielasAbiertas.map(qa => (
              <button 
                key={qa.id} 
                onClick={() => {
                  setQuinielaActiva(qa);
                  setJugadorExpandidoId(null);
                }} 
                className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${
                  quinielaActiva?.id === qa.id 
                    ? 'bg-amber-500 text-slate-900 shadow-md scale-105' 
                    : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {qa.modalidad === 'sorteo' ? '🎲' : '⚽'} {qa.nombre_jornada} {qa.estado === 'cerrada' ? '(En Juego)' : ''}
              </button>
            ))}
          </div>
        )}

        <div className={`bg-gradient-to-br border p-4 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.1)] relative overflow-hidden mb-4 ${esSorteo ? 'from-blue-950/40 to-slate-900 border-blue-500/30' : 'from-amber-950/40 to-slate-900 border-amber-500/30'}`}>
          <div className="absolute -right-4 -top-4 p-2 opacity-5 text-7xl select-none">{esSorteo ? '🎟️' : '💰'}</div>
          
          <h2 className={`text-center text-lg md:text-xl font-black uppercase italic tracking-tight mb-0.5 relative z-10 ${esSorteo ? 'text-blue-400' : 'text-white'}`}>
            {esSorteo ? 'ZONA DE SUPERVIVENCIA' : (quinielaActiva.estado === 'abierta' ? 'RANKING EN VIVO' : 'RESULTADOS EN JUEGO')}
          </h2>
          <p className="text-center text-slate-400 text-[10px] font-black uppercase tracking-widest mb-3">{quinielaActiva.nombre_jornada}</p>
          
          <div className="grid grid-cols-2 gap-2 relative z-10 max-w-md mx-auto">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Participantes</span>
              <span className="text-lg md:text-xl font-black text-white">{totalJugadores}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Recaudado</span>
              <span className="text-lg md:text-xl font-black text-white">${quinielaActiva.recaudadoPesos} <span className="text-[10px] text-slate-500">MXN</span></span>
            </div>
          </div>

          <div className={`mt-3 p-3 rounded-xl border text-center relative z-10 ${esSorteo ? 'bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'}`}>
            {esPromo ? (
              <>
                <span className={`block text-[9px] font-black uppercase tracking-widest mb-0.5 ${esSorteo ? 'text-blue-500' : 'text-amber-500'}`}>🎁 EVENTO PROMOCIONAL 🎁</span>
                <span className={`text-base md:text-lg font-black block ${esSorteo ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]'}`}>
                  {quinielaActiva.tipo_premiacion === 'promo_top2' ? '1 BOLETO AL 1º Y 2º LUGAR' : '1 BOLETO AL GANADOR'}
                </span>
              </>
            ) : (
              <>
                <span className={`block text-[9px] font-black uppercase tracking-widest mb-0.5 ${esSorteo ? 'text-blue-500' : 'text-amber-500'}`}>
                  🏆 PREMIO A REPARTIR 🏆
                </span>
                <span className={`text-2xl md:text-3xl font-black block ${esSorteo ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]'}`}>
                  ${quinielaActiva.premioPesos.toFixed(0)} <span className="text-[10px] md:text-xs uppercase font-bold opacity-80">MXN</span>
                </span>
              </>
            )}
          </div>
        </div>

        {!mostrarPicks && !esSorteo && (
          <div className="mb-3 text-center border border-amber-900/50 bg-amber-950/20 text-amber-500/80 text-[10px] py-1.5 rounded-lg font-bold uppercase tracking-widest">
            🔒 Radiografía oculta hasta el {fechaTextoVisible}
          </div>
        )}

        {esSorteo ? (
           <div className="bg-slate-900/80 rounded-xl border border-blue-900/30 shadow-2xl overflow-hidden p-3 md:p-5">
              <h3 className="text-center font-black text-slate-300 uppercase tracking-widest text-xs mb-4">Bombo de Asignaciones</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                 {quinielaActiva.ranking.map((jugador: any, idx: number) => {
                    const eq = jugador.equipoAsignado;
                    const eliminado = jugador.estaEliminado;
                    
                    return (
                       <div key={jugador.id} className={`flex items-center justify-between p-3 md:p-4 rounded-xl border transition-all duration-500 ${eliminado ? 'bg-slate-950 border-red-900/40 opacity-50 grayscale' : 'bg-slate-800/80 border-blue-500/40 shadow-[0_0_15px_rgba(37,99,235,0.1)] hover:scale-[1.02]'}`}>
                          
                          <div className="flex items-center gap-3">
                             <div className="relative">
                               <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-slate-700 bg-slate-900" />
                               {eliminado && <div className="absolute inset-0 bg-red-950/60 rounded-full flex items-center justify-center text-xl">❌</div>}
                             </div>
                             <div>
                                <span className={`font-black uppercase text-[10px] md:text-xs block max-w-[100px] md:max-w-[120px] truncate ${eliminado ? 'text-slate-500 line-through' : 'text-white'}`}>
                                  {jugador.nombre}
                                </span>
                                {eliminado ? (
                                  <span className="text-[8px] md:text-[9px] text-red-500 font-bold uppercase tracking-widest block mt-0.5">Eliminado</span>
                                ) : (
                                  <span className="text-[8px] md:text-[9px] text-green-400 font-bold uppercase tracking-widest block mt-0.5 animate-pulse">En Juego</span>
                                )}
                             </div>
                          </div>

                          <div className="flex flex-col items-end justify-center pl-3 border-l border-slate-700/50">
                             {eq ? (
                                <>
                                  <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center mb-1">
                                     <img src={eq.logo_url} className={`max-w-full max-h-full object-contain ${eliminado ? 'opacity-40' : ''}`} alt={eq.nombre} />
                                  </div>
                                  <span className={`text-[8px] md:text-[9px] font-black uppercase text-right leading-tight max-w-[90px] ${eliminado ? 'text-slate-600 line-through' : 'text-amber-400'}`}>
                                    {eq.nombre}
                                  </span>
                                </>
                             ) : (
                                <span className="text-[10px] text-slate-500 italic flex items-center gap-1 font-bold">
                                  <span className="animate-spin text-sm">🎲</span> Girando...
                                </span>
                             )}
                          </div>
                       </div>
                    )
                 })}
                 
                 {quinielaActiva.ranking.length === 0 && (
                   <div className="col-span-full p-8 text-center text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest italic border border-dashed border-slate-700 rounded-xl">
                     La sala del sorteo está vacía.
                   </div>
                 )}
              </div>
           </div>
        ) : (
           <div className="bg-slate-900/80 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-950/80 text-[9px] uppercase text-slate-500 tracking-widest border-b border-slate-800">
                     <th className="p-2 w-8 text-center">#</th>
                     <th className="p-2">Jugador</th>
                     <th className="p-2 text-center w-12">Pts</th>
                     <th className="p-2 text-center w-12">Goles</th>
                     <th className="p-2 text-right pr-3">Radiografía</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-800/40">
                   {quinielaActiva.ranking.map((jugador: any) => {
                     const esLider = jugador.posicion === 1 && totalJugadores > 1 && jugador.puntos > 0
                     const estaExpandido = jugadorExpandidoId === jugador.id

                     return (
                       <Fragment key={jugador.id}>
                         <tr 
                           onClick={() => mostrarPicks && toggleExpandirJugador(jugador.id)}
                           className={`transition-colors hover:bg-slate-800/50 ${mostrarPicks ? 'cursor-pointer' : ''} ${esLider ? 'bg-gradient-to-r from-amber-900/15 to-transparent' : ''} ${estaExpandido ? 'bg-slate-800/30' : ''}`}
                         >
                           <td className="p-2 text-center">
                             {jugador.posicion === 1 && partidosTerminados > 0 ? <span className="text-lg drop-shadow-md block">🥇</span> : 
                              jugador.posicion === 2 && partidosTerminados > 0 ? <span className="text-base block">🥈</span> : 
                              jugador.posicion === 3 && partidosTerminados > 0 ? <span className="text-base block">🥉</span> : 
                              <span className="text-[10px] font-black text-slate-500 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded">{jugador.posicion}</span>}
                           </td>
                           
                           <td className="p-2">
                             <div className="flex items-center gap-2">
                               <div className={`relative shrink-0 rounded-full border-2 ${esLider ? 'border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'border-slate-700'}`}>
                                 <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} alt={jugador.nombre} className="w-6 h-6 md:w-7 md:h-7 rounded-full object-cover bg-slate-900" />
                               </div>
                               <div>
                                 <span className={`font-black uppercase text-[10px] md:text-xs block tracking-tight truncate max-w-[100px] md:max-w-[150px] ${esLider ? 'text-amber-400' : 'text-slate-200'}`}>
                                   {jugador.nombre} {esLider && <span className="ml-0.5 text-[9px]">👑</span>}
                                 </span>
                                 {mostrarPicks && (
                                   <div className="block md:hidden text-[8px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">
                                     Dif: {quinielaActiva.goles_totales_real !== null ? jugador.golesDiff : '?'}
                                   </div>
                                 )}
                               </div>
                             </div>
                           </td>
                           
                           <td className="p-2 text-center">
                             <span className={`text-sm md:text-base font-black ${esLider ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]' : 'text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.15)]'}`}>
                               {jugador.puntos}
                             </span>
                           </td>
                           
                           <td className="p-2 text-center">
                             <span className="text-[10px] md:text-xs font-mono font-bold text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                               {mostrarPicks ? jugador.prediccionGoles : '🔒'}
                             </span>
                             {mostrarPicks && quinielaActiva.goles_totales_real !== null && (
                               <span className="hidden md:inline-block text-[8px] font-bold text-amber-500 ml-1">Dif:{jugador.golesDiff}</span>
                             )}
                           </td>
                           
                           <td className="p-2 text-right pr-3">
                             <div className="flex gap-0.5 md:gap-1 justify-end flex-wrap w-full max-w-[180px] ml-auto items-center">
                               {quinielaActiva.partidos.map((p: any, i: number) => {
                                 const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                 const estado = jugador.aciertos[p.id]
                                 
                                 const tieneGoles = p.goles_local !== null && p.goles_visitante !== null
                                 const enVivo = tieneGoles && !p.es_final
                                 
                                 if (!mostrarPicks) {
                                   return (
                                     <div key={p.id} className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[8px] bg-slate-950 border border-slate-800 text-slate-600" title={`Partido ${i+1} Oculto`}>
                                       🔒
                                     </div>
                                   )
                                 }

                                 let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                                 if (estado === 'acierto_exacto') bgClass = "bg-green-600 border-green-500 text-white shadow-[0_0_5px_rgba(22,163,74,0.3)]"
                                 if (estado === 'acierto_lev') bgClass = "bg-amber-500 border-amber-400 text-slate-900 shadow-[0_0_5px_rgba(245,158,11,0.3)]"
                                 if (estado === 'fallo') bgClass = "bg-red-950/40 border-red-900 text-red-500"
                                 if (estado === 'pendiente' && pronostico) bgClass = "bg-slate-800 border-slate-600 text-slate-300"
                                 
                                 const enVivoClass = enVivo ? "ring-1 ring-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.5)]" : ""
                                 
                                 return (
                                   <div key={p.id} className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[9px] font-black border ${bgClass} ${enVivoClass}`} title={`Partido ${i+1}${enVivo ? ' (EN VIVO)' : ''}`}>
                                     {pronostico ? pronostico.eleccion_usuario : '-'}
                                   </div>
                                 )
                               })}
                               {mostrarPicks && (
                                 <span className="text-[10px] ml-1 text-slate-500">{estaExpandido ? '🔼' : '🔽'}</span>
                               )}
                             </div>
                           </td>
                         </tr>

                         {estaExpandido && mostrarPicks && (
                           <tr className="bg-slate-900 border-b border-slate-800 shadow-inner">
                             <td colSpan={5} className="p-3 md:p-4">
                               <h4 className="text-[9px] md:text-[10px] font-black uppercase text-amber-500 tracking-widest mb-3 flex items-center gap-2">
                                 <span>📡</span> Desglose en Vivo - {jugador.nombre}
                               </h4>
                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                 {quinielaActiva.partidos.map((p: any, i: number) => {
                                   const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                   const estado = jugador.aciertos[p.id]
                                   const tieneGoles = p.goles_local !== null && p.goles_visitante !== null
                                   const enVivo = tieneGoles && !p.es_final

                                   let badgeColor = "bg-slate-800 text-slate-400 border-slate-700"
                                   if (estado === 'acierto_exacto') badgeColor = "bg-green-950/40 text-green-400 border-green-900/50"
                                   if (estado === 'acierto_lev') badgeColor = "bg-amber-950/20 text-amber-400 border-amber-900/50"
                                   if (estado === 'fallo') badgeColor = "bg-red-950/30 text-red-400 border-red-900/40"

                                   return (
                                     <div key={p.id} className={`flex flex-col p-2.5 rounded-lg border ${badgeColor} relative overflow-hidden`}>
                                       
                                       <div className="flex justify-between items-start mb-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase bg-slate-950 px-1 rounded">P{i+1}</span>
                                         {enVivo && <span className="text-[8px] font-black uppercase text-red-500 animate-pulse flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>En Vivo</span>}
                                         {p.es_final && <span className="text-[8px] font-black uppercase text-green-500">✅ Final</span>}
                                         {!tieneGoles && <span className="text-[8px] font-bold uppercase text-slate-500">⏱️ Pendiente</span>}
                                       </div>

                                       <div className="flex justify-between items-center mb-2">
                                         <span className="text-[9px] font-bold uppercase text-slate-300 w-[35%] truncate">{p.equipo_local}</span>
                                         
                                         <div className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-center min-w-[40px]">
                                           {tieneGoles ? (
                                             <span className="text-xs font-black text-white">{p.goles_local} - {p.goles_visitante}</span>
                                           ) : (
                                             <span className="text-[9px] font-bold text-slate-600">VS</span>
                                           )}
                                         </div>

                                         <span className="text-[9px] font-bold uppercase text-slate-300 w-[35%] truncate text-right">{p.equipo_visitante}</span>
                                       </div>

                                       <div className="flex justify-between items-center mt-auto pt-1.5 border-t border-slate-800/30">
                                         <span className="text-[8px] font-bold uppercase text-slate-500">Elección: <span className="text-white font-black">{pronostico ? pronostico.eleccion_usuario : 'N/A'}</span></span>
                                         
                                         {estado === 'acierto_exacto' && <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">{quinielaActiva.modalidad === 'marcador_exacto' ? '+3 Pts' : '+1 Pts'}</span>}
                                         {estado === 'acierto_lev' && <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">+1 Pts</span>}
                                         {estado === 'fallo' && <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Fallo</span>}
                                       </div>
                                       
                                     </div>
                                   )
                                 })}
                               </div>
                             </td>
                           </tr>
                         )}
                       </Fragment>
                     )
                   })}
                 </tbody>
               </table>
               {quinielaActiva.ranking.length === 0 && (
                 <div className="p-6 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">Aún no hay boletos para esta jornada.</div>
               )}
             </div>
           </div>
        )}
      </section>

      {/* SALÓN DE LA FAMA COMPACTO */}
      {historial.length > 0 && (
        <section className="pt-6 border-t border-slate-800">
          <h3 className="text-lg font-black text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
            <span>📜</span> Salón de la Fama <span className="text-[9px] font-normal tracking-normal ml-1 opacity-60">(Terminadas)</span>
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {historial.map(quiniela => {
              const esHistorialPromo = quiniela.tipo_premiacion?.toLowerCase().includes('promo');
              const estaExpandida = quinielaExpandidaId === quiniela.id;
              const jugadoresAMostrar = estaExpandida ? quiniela.ranking : quiniela.ranking.slice(0, 5);
              const esSorteo = quiniela.modalidad === 'sorteo';

              return (
                <div 
                  key={quiniela.id} 
                  className={`bg-slate-900 border rounded-xl p-3 md:p-4 shadow-lg relative overflow-hidden flex flex-col transition-all duration-300 ${estaExpandida ? 'border-amber-500/50 sm:col-span-2 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'border-slate-800'}`}
                >
                  <div className="flex justify-between items-start mb-3 border-b border-slate-800 pb-2">
                    <div>
                      <h4 className={`font-black text-[10px] md:text-xs uppercase italic flex items-center gap-1 ${estaExpandida ? 'text-amber-400' : 'text-white'}`}>
                        {esSorteo ? '🎲' : '⚽'} {quiniela.nombre_jornada}
                      </h4>
                      {!esSorteo && <span className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mt-0.5 block">Goles Reales: <span className="text-slate-300">{quiniela.goles_totales_real}</span></span>}
                    </div>
                    <div className="text-right">
                      <span className="block text-[8px] md:text-[9px] text-amber-500 font-bold uppercase tracking-widest">Premio</span>
                      {esHistorialPromo ? (
                        <span className="text-[10px] md:text-xs font-black text-amber-400 drop-shadow-md uppercase block mt-0.5">
                          {quiniela.tipo_premiacion === 'promo_top2' ? '1 BOLETO (1º Y 2º)' : '1 BOLETO (1º)'}
                        </span>
                      ) : (
                        <span className="text-sm md:text-base font-black text-amber-400 drop-shadow-md">
                          ${quiniela.premioPesos.toFixed(0)} <span className="text-[9px]">MXN</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 flex-grow">
                    {jugadoresAMostrar.map((jugador: any) => (
                      <div key={jugador.id} className={`flex flex-col p-1.5 md:p-2 rounded-lg border transition-colors ${jugador.estaEliminado ? 'bg-slate-950 border-red-900/30 opacity-60' : 'bg-slate-950/50 border-slate-800/50'}`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="flex justify-center items-center text-sm w-4 md:w-5 text-center">
                              {jugador.posicion === 1 && !jugador.estaEliminado ? '🥇' : 
                               jugador.posicion === 2 && !jugador.estaEliminado ? '🥈' : 
                               jugador.posicion === 3 && !jugador.estaEliminado ? '🥉' : 
                               <span className="text-[9px] font-black text-slate-500 bg-slate-900 border border-slate-700 px-1.5 rounded">{jugador.posicion}</span>}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} alt={jugador.nombre} className="w-4 h-4 md:w-5 md:h-5 rounded-full object-cover border border-slate-700 bg-slate-900" />
                              <span className={`font-black uppercase text-[9px] md:text-[10px] truncate ${estaExpandida ? 'w-[120px] sm:w-auto' : 'w-[80px] sm:w-[100px]'} ${jugador.posicion === 1 && !jugador.estaEliminado ? 'text-amber-400' : jugador.estaEliminado ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                {jugador.nombre}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[8px] md:text-[9px] font-bold text-slate-500">
                            {esSorteo ? (
                               jugador.equipoAsignado ? (
                                  <span className={`uppercase truncate max-w-[70px] ${jugador.estaEliminado ? 'text-red-500 line-through' : 'text-amber-400'}`}>{jugador.equipoAsignado.nombre}</span>
                               ) : null
                            ) : (
                               <>
                                 {!estaExpandida && <span title="Goles Predichos" className="hidden xs:inline-block">G:{jugador.prediccionGoles}</span>}
                                 <span className="bg-slate-800 text-green-400 px-1.5 py-0.5 rounded border border-slate-700 w-9 md:w-10 text-center shadow-inner">
                                   {jugador.puntos}
                                 </span>
                               </>
                            )}
                          </div>
                        </div>

                        {!esSorteo && estaExpandida && (
                          <div className="flex justify-between items-center border-t border-slate-800/50 pt-2 mt-2">
                            <div className="flex gap-0.5 md:gap-1 flex-wrap">
                              {quiniela.partidos.map((p: any, i: number) => {
                                const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                const estado = jugador.aciertos[p.id]
                                
                                let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                                if (estado === 'acierto_exacto') bgClass = "bg-green-600 border-green-500 text-white"
                                if (estado === 'acierto_lev') bgClass = "bg-amber-500 border-amber-400 text-slate-900"
                                if (estado === 'fallo') bgClass = "bg-red-950/40 border-red-900 text-red-500"
                                
                                return (
                                  <div key={p.id} className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[9px] font-black border ${bgClass}`} title={`Partido ${i+1}`}>
                                    {pronostico ? pronostico.eleccion_usuario : '-'}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase text-right leading-tight ml-2 shrink-0">
                              Dif. Goles: <span className="text-amber-500 font-black ml-0.5">{jugador.golesDiff === 999 ? '-' : jugador.golesDiff}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => toggleExpandirHistorial(quiniela.id)}
                    className="mt-3 pt-2 text-[9px] md:text-[10px] text-slate-400 hover:text-amber-400 font-bold uppercase tracking-widest transition-colors border-t border-slate-800/50 w-full text-center flex items-center justify-center gap-1"
                  >
                    {estaExpandida ? (
                      <>Ocultar Detalles <span className="text-xs">🔼</span></>
                    ) : (
                      <>Ver Listado completo ({quiniela.ranking.length}) <span className="text-xs">🔽</span></>
                    )}
                  </button>

                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}