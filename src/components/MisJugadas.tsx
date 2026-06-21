'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useSincronizacionRealtime } from '@/hooks/useSincronizacionRealtime' // 👈 Importamos nuestro motor de tiempo real

export default function MisJugadas({ usuarioId }: { usuarioId: string }) {
  const [gruposActivos, setGruposActivos] = useState<any[]>([])
  const [gruposCompletados, setGruposCompletados] = useState<any[]>([])
  const [equipos, setEquipos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  
  const [vistaActual, setVistaActual] = useState<'activas' | 'historial'>('activas')

  // 🔥 ESTADOS PARA EL MODAL DE EDICIÓN
  const [ticketEditando, setTicketEditando] = useState<any>(null)
  const [nuevasSelecciones, setNuevasSelecciones] = useState<Record<string, string>>({})
  const [nuevosGoles, setNuevosGoles] = useState<number | ''>('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  
  // Candado anti-doble clic
  const procesandoEdicionRef = useRef(false)

  // 🛠️ MODIFICACIÓN: Agregamos el parámetro para que las actualizaciones en tiempo real no parpadeen la pantalla
  const cargarHistorial = async (esCargaSilenciosa = false) => {
    if (!esCargaSilenciosa) setCargando(true)
    
    try {
      const { data: eqData } = await supabase.from('equipos').select('nombre, logo_url')
      if (eqData) setEquipos(eqData)

      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          fecha_creacion,
          puntos_totales,
          prediccion_goles_total,
          quinielas (id, nombre_jornada, goles_totales_real, estado, fecha_cierre),
          pronosticos (
            id,
            eleccion_usuario,
            partidos (id, equipo_local, equipo_visitante, resultado_real, fecha_hora, goles_local, goles_visitante, es_final)
          )
        `)
        .eq('usuario_id', usuarioId)
        .order('fecha_creacion', { ascending: false })

      if (data) {
        const activos = data.filter(t => t.quinielas?.estado === 'abierta' || (t.quinielas?.estado === 'cerrada' && t.quinielas?.goles_totales_real === null))
        const completados = data.filter(t => t.quinielas?.estado === 'cerrada' && t.quinielas?.goles_totales_real !== null)
        
        const gruposA = agruparTicketsPorQuiniela(activos)
        const gruposC = agruparTicketsPorQuiniela(completados)

        gruposA.sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime())
        gruposC.sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime())

        setGruposActivos(gruposA)
        setGruposCompletados(gruposC)
      }
    } catch (error) {
      console.error("Error cargando jugadas:", error)
    } finally {
      setCargando(false)
    }
  }

  // Carga inicial
  useEffect(() => {
    cargarHistorial()
  }, [usuarioId])

  // 📡 CONEXIÓN WEB-SOCKETS: Escuchamos todo silenciosamente
  const recargaSilenciosa = () => cargarHistorial(true)
  useSincronizacionRealtime('quinielas', recargaSilenciosa, false)
  useSincronizacionRealtime('partidos', recargaSilenciosa, false)
  useSincronizacionRealtime('tickets', recargaSilenciosa, false)
  useSincronizacionRealtime('pronosticos', recargaSilenciosa, false)

  const agruparTicketsPorQuiniela = (ticketsArray: any[]) => {
    const grupos: Record<string, any> = {};
    
    ticketsArray.forEach(ticket => {
      const qId = ticket.quinielas?.id || ticket.quinielas?.nombre_jornada; 
      
      if (!grupos[qId]) {
        let golesEnVivo = 0;
        let hayGoles = false;
        ticket.pronosticos.forEach((pr: any) => {
          if (pr.partidos?.goles_local !== null && pr.partidos?.goles_visitante !== null) {
             golesEnVivo += (pr.partidos.goles_local + pr.partidos.goles_visitante);
             hayGoles = true;
          }
        });

        grupos[qId] = {
          nombre_jornada: ticket.quinielas?.nombre_jornada,
          estado: ticket.quinielas?.estado,
          goles_reales: ticket.quinielas?.goles_totales_real !== null ? ticket.quinielas?.goles_totales_real : (hayGoles ? golesEnVivo : null),
          fecha_cierre: ticket.quinielas?.fecha_cierre,
          partidos: ticket.pronosticos.map((pr: any) => ({
            id: pr.partidos?.id || `${pr.partidos?.equipo_local}-${pr.partidos?.equipo_visitante}`,
            local: pr.partidos?.equipo_local,
            visitante: pr.partidos?.equipo_visitante,
            real: pr.partidos?.resultado_real,
            goles_local: pr.partidos?.goles_local,
            goles_visitante: pr.partidos?.goles_visitante,
            es_final: pr.partidos?.es_final,
            fecha_hora: pr.partidos?.fecha_hora
          })).sort((a: any, b: any) => {
            if (!a.fecha_hora) return 1;
            if (!b.fecha_hora) return -1;
            return new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime();
          }),
          tickets: []
        };
      }
      
      const selecciones: Record<string, string> = {};
      const pronosticosIds: Record<string, string> = {}; 
      
      ticket.pronosticos.forEach((pr: any) => {
        const pId = pr.partidos?.id || `${pr.partidos?.equipo_local}-${pr.partidos?.equipo_visitante}`;
        selecciones[pId] = pr.eleccion_usuario;
        pronosticosIds[pId] = pr.id;
      });
      
      grupos[qId].tickets.push({
        id: ticket.id,
        fecha: ticket.fecha_creacion,
        puntos: ticket.puntos_totales,
        goles: ticket.prediccion_goles_total,
        selecciones,
        pronosticosIds 
      });
    });
    
    const listaGrupos = Object.values(grupos);
    listaGrupos.forEach((grupo: any) => {
      grupo.tickets.sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    });
    return listaGrupos;
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
    const equipo = equipos.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
  }

  const abrirModalEdicion = (grupo: any, ticket: any) => {
    setTicketEditando({
      ticketId: ticket.id,
      quinielaNombre: grupo.nombre_jornada,
      partidos: grupo.partidos,
      pronosticosIds: ticket.pronosticosIds
    })
    setNuevasSelecciones({ ...ticket.selecciones })
    setNuevosGoles(ticket.goles || 0) 
  }

  const guardarEdicion = async () => {
    // Candado anti-doble clic
    if (procesandoEdicionRef.current) return;
    
    procesandoEdicionRef.current = true;
    setGuardandoEdicion(true)
    
    try {
      const pronosticosActualizados = ticketEditando.partidos.map((p: any) => ({
        id: ticketEditando.pronosticosIds[p.id],
        ticket_id: ticketEditando.ticketId,
        partido_id: p.id,
        eleccion_usuario: nuevasSelecciones[p.id]
      }))

      const { error: errorPronosticos } = await supabase.from('pronosticos').upsert(pronosticosActualizados)
      if (errorPronosticos) throw errorPronosticos

      const golesParseados = nuevosGoles === '' ? 0 : Number(nuevosGoles)
      const { error: errorTicket } = await supabase
        .from('tickets')
        .update({ prediccion_goles_total: golesParseados })
        .eq('id', ticketEditando.ticketId)
      
      if (errorTicket) throw errorTicket

      alert('¡Boleto actualizado con éxito!')
      setTicketEditando(null)
      // Recarga silenciosa para no mostrar el skeleton loading
      await cargarHistorial(true) 

    } catch (error) {
      console.error(error)
      alert('Hubo un error al actualizar el boleto. Intenta de nuevo.')
    } finally {
      procesandoEdicionRef.current = false;
      setGuardandoEdicion(false)
    }
  }

  if (cargando) return <div className="text-blue-400 animate-pulse text-center mt-10 font-bold uppercase tracking-widest text-xs">Cargando tus jugadas...</div>

  if (gruposActivos.length === 0 && gruposCompletados.length === 0) {
    return <div className="text-slate-500 italic text-center mt-10 text-sm">Aún no has realizado ninguna jugada.</div>
  }

  const TarjetaGrupoAgrupado = ({ grupo, esActivo }: { grupo: any, esActivo: boolean }) => {
    
    const fechaCierreCorta = grupo.fecha_cierre ? grupo.fecha_cierre.substring(0, 16) : null;
    const fechaCierreObj = new Date(fechaCierreCorta || grupo.fecha_cierre || 0);
    const ahora = new Date();
    const yaPasoLaHora = grupo.fecha_cierre ? (ahora > fechaCierreObj) : false;
    const yaHayResultados = grupo.partidos.some((p: any) => p.real !== null);
    
    // Sólo se puede editar si no ha pasado la hora Y no hay resultados.
    const sePuedeEditar = esActivo && !yaPasoLaHora && !yaHayResultados;

    const estaEnJuego = esActivo && (yaPasoLaHora || yaHayResultados);

    return (
      <div className={`bg-slate-900 border rounded-xl overflow-hidden shadow-xl transition-all mb-6 ${esActivo ? 'border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.1)]' : 'border-slate-700 opacity-95'}`}>
        
        <div className={`px-4 py-3 border-b flex flex-col sm:flex-row justify-between items-center gap-2 ${esActivo ? 'bg-gradient-to-r from-amber-900/20 to-slate-900 border-amber-800/40' : 'bg-slate-950 border-slate-700'}`}>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-2xl drop-shadow-md">{esActivo ? (estaEnJuego ? '⚔️' : '🔥') : '✅'}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-black uppercase tracking-widest text-sm md:text-base ${esActivo ? 'text-amber-500' : 'text-slate-300'}`}>{grupo.nombre_jornada}</h3>
                {estaEnJuego && <span className="bg-red-600/20 text-red-400 border border-red-900/50 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest animate-pulse">En Juego</span>}
              </div>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{grupo.tickets.length} {grupo.tickets.length === 1 ? 'Boleto' : 'Boletos'} participando</p>
            </div>
          </div>

          <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 w-full sm:w-auto justify-center ${esActivo ? 'bg-slate-950 border-amber-900/50' : 'bg-slate-900 border-slate-700'}`}>
             <span className="text-[9px] uppercase tracking-widest font-bold text-slate-400">Total Goles Real:</span>
             <span className={`text-sm font-black drop-shadow-md ${esActivo ? 'text-amber-400' : 'text-blue-400'}`}>
               {grupo.goles_reales !== null ? grupo.goles_reales : '?'}
             </span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-2 py-2 font-bold uppercase text-[9px] tracking-wider text-center w-48 min-w-[160px]">Partido</th>
                <th className="px-2 py-2 font-bold uppercase text-[9px] tracking-wider text-center border-r border-slate-800 bg-slate-950 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">Real</th>
                {grupo.tickets.map((t: any, idx: number) => (
                  <th key={t.id} className={`px-2 py-2 font-black uppercase text-[9px] text-center border-r border-slate-800/50 ${esActivo ? 'text-amber-500' : 'text-blue-400'}`}>
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span>J{idx + 1}</span>
                      {sePuedeEditar && (
                        <button 
                          onClick={() => abrirModalEdicion(grupo, t)} 
                          className="bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[8px] transition-all"
                          title="Editar selecciones"
                        >
                          ✏️ Editar
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {grupo.partidos.map((p: any, pIdx: number) => {
                const tieneGoles = p.goles_local !== null && p.goles_visitante !== null;
                const enVivo = tieneGoles && !p.es_final;
                
                return (
                  <tr key={pIdx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-bold uppercase text-slate-300">
                        <div className="flex items-center gap-1 w-[45%] justify-end">
                          <span className="truncate text-right">{p.local}</span>
                          <img src={obtenerLogo(p.local)} alt="" className="w-3.5 h-3.5 md:w-4 md:h-4 object-contain" />
                        </div>
                        <span className="text-[8px] text-slate-600 italic px-0.5">VS</span>
                        <div className="flex items-center gap-1 w-[45%] justify-start">
                          <img src={obtenerLogo(p.visitante)} alt="" className="w-3.5 h-3.5 md:w-4 md:h-4 object-contain" />
                          <span className="truncate text-left">{p.visitante}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-1 py-1.5 text-center border-r border-slate-800 bg-slate-950/40 sticky left-0 z-10">
                      {p.real ? (
                        <div className="flex flex-col items-center gap-0.5 justify-center">
                          {tieneGoles && (
                            <span className="text-[10px] font-black text-white leading-none">
                              {p.goles_local}-{p.goles_visitante}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <span className={`inline-block w-4 h-4 text-[8px] leading-4 rounded-full font-black shadow-inner ${p.real==='L'?'bg-blue-900 text-blue-300':p.real==='E'?'bg-slate-700 text-slate-300':'bg-red-900 text-red-300'}`}>
                              {p.real}
                            </span>
                            {enVivo && (
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" title="Partido en Vivo"></span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono text-[10px]">-</span>
                      )}
                    </td>

                    {grupo.tickets.map((t: any) => {
                      const pick = t.selecciones[p.id];
                      let color = 'bg-slate-800 text-slate-300';
                      
                      if (p.real) {
                        if (pick === p.real) color = 'bg-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.3)] border border-green-500'; 
                        else color = 'bg-red-950/60 text-red-500/50 border border-red-900/30'; 
                      } else {
                        if (pick === 'E') color = 'bg-slate-700 text-slate-300 border border-slate-600';
                        else color = 'bg-blue-900/60 text-blue-300 border border-blue-800';
                      }

                      return (
                        <td key={`${t.id}-${p.id}`} className="px-1 py-1.5 text-center border-r border-slate-800/50">
                          <span className={`inline-block w-5 h-5 text-[9px] leading-5 rounded-md font-black transition-all ${color}`}>
                            {pick}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            
            <tfoot className="bg-slate-950 border-t-2 border-slate-700">
              <tr>
                <td colSpan={2} className="px-2 py-2 text-right font-bold uppercase text-[8px] md:text-[9px] text-slate-500 border-r border-slate-800">
                  Desempate (Total Goles)
                </td>
                {grupo.tickets.map((t: any) => (
                  <td key={`goles-${t.id}`} className="px-2 py-2 text-center font-mono font-bold text-slate-300 border-r border-slate-800/50 text-[10px]">
                    {t.goles || 0}
                  </td>
                ))}
              </tr>
              <tr className="bg-slate-900/50">
                <td colSpan={2} className="px-2 py-2.5 text-right font-black uppercase text-[9px] md:text-[10px] text-slate-300 border-r border-slate-800">
                  Puntos Totales
                </td>
                {grupo.tickets.map((t: any) => (
                  <td key={`puntos-${t.id}`} className="px-2 py-2.5 text-center border-r border-slate-800/50">
                    <span className={`text-sm font-black drop-shadow-md block ${esActivo ? 'text-amber-500' : 'text-green-500'}`}>
                      {t.puntos || 0}
                    </span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mt-4 animate-in fade-in duration-500 mb-20 flex flex-col items-center">
      
      <div className="flex bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shadow-inner mb-6 w-full max-w-sm">
        <button 
          onClick={() => setVistaActual('activas')} 
          className={`flex-1 py-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex justify-center items-center gap-1.5 ${
            vistaActual === 'activas' 
            ? 'bg-amber-600 text-white shadow-[0_0_15px_rgba(217,119,6,0.3)]' 
            : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span>🔥</span> Activas ({gruposActivos.length})
        </button>
        <button 
          onClick={() => setVistaActual('historial')} 
          className={`flex-1 py-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex justify-center items-center gap-1.5 ${
            vistaActual === 'historial' 
            ? 'bg-slate-700 text-white shadow-md' 
            : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span>📜</span> Historial ({gruposCompletados.length})
        </button>
      </div>

      <div className="w-full">
        {vistaActual === 'activas' ? (
          <div>
            {gruposActivos.length === 0 ? (
              <p className="text-slate-500 italic text-center py-6 bg-slate-900/30 rounded-xl border border-slate-800 text-xs">No tienes jugadas activas en este momento.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {gruposActivos.map((grupo, idx) => <TarjetaGrupoAgrupado key={`act-${idx}`} grupo={grupo} esActivo={true} />)}
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in slide-in-from-right-4 duration-300">
            {gruposCompletados.length === 0 ? (
              <p className="text-slate-500 italic text-center py-6 bg-slate-900/30 rounded-xl border border-slate-800 text-xs">Aún no tienes tickets terminados.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {gruposCompletados.map((grupo, idx) => <TarjetaGrupoAgrupado key={`comp-${idx}`} grupo={grupo} esActivo={false} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🚀 MODAL DE EDICIÓN FLOTANTE CON CAMPO DE GOLES */}
      {ticketEditando && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-600/50 max-w-md w-full p-4 md:p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4 shrink-0">
              <div>
                <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span>✏️</span> Editando Boleto
                </h3>
                <p className="text-[9px] text-amber-500 font-bold uppercase mt-1">{ticketEditando.quinielaNombre}</p>
              </div>
              <button onClick={() => setTicketEditando(null)} className="text-slate-500 hover:text-slate-300 font-bold font-mono text-xl">✕</button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-2.5 mb-4 flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
              {ticketEditando.partidos.map((p: any) => {
                const seleccionActual = nuevasSelecciones[p.id]
                return (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 p-2 md:p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[10px] md:text-xs font-bold uppercase text-slate-300 w-full">
                      <div className="flex items-center gap-1.5 w-[45%] justify-end">
                        <span className="truncate text-right">{p.local}</span>
                        <img src={obtenerLogo(p.local)} alt="" className="w-4 h-4 object-contain" />
                      </div>
                      <span className="text-[9px] text-slate-600 px-1">VS</span>
                      <div className="flex items-center gap-1.5 w-[45%] justify-start">
                        <img src={obtenerLogo(p.visitante)} alt="" className="w-4 h-4 object-contain" />
                        <span className="truncate text-left">{p.visitante}</span>
                      </div>
                    </div>

                    <div className="flex gap-1.5 w-full mt-1">
                      {['L', 'E', 'V'].map(opc => (
                        <button
                          key={opc}
                          onClick={() => setNuevasSelecciones({ ...nuevasSelecciones, [p.id]: opc })}
                          className={`flex-1 py-1.5 rounded text-[10px] md:text-xs font-black transition-all border ${
                            seleccionActual === opc 
                            ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_10px_rgba(217,119,6,0.3)] scale-105' 
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {opc}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* SECCIÓN: Total de Goles (Desempate) */}
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg mb-4 shrink-0 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Total de Goles</h4>
                <p className="text-[9px] text-slate-500 uppercase mt-0.5">Para desempate en la jornada</p>
              </div>
              <input 
                type="number" 
                min="0"
                value={nuevosGoles}
                onChange={(e) => setNuevosGoles(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-16 bg-slate-900 border border-amber-600/50 text-white font-black text-center py-2 rounded-lg text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <button 
              onClick={guardarEdicion}
              disabled={guardandoEdicion}
              className={`w-full font-black py-3 rounded-xl uppercase tracking-widest text-xs transition-all shrink-0 ${
                guardandoEdicion 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_15px_rgba(217,119,6,0.2)]'
              }`}
            >
              {guardandoEdicion ? 'Guardando...' : '💾 Guardar Cambios'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}