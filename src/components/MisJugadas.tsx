'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MisJugadas({ usuarioId }: { usuarioId: string }) {
  const [gruposActivos, setGruposActivos] = useState<any[]>([])
  const [gruposCompletados, setGruposCompletados] = useState<any[]>([])
  const [equipos, setEquipos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  
  // 🔥 NUEVO ESTADO PARA CONTROLAR LAS PESTAÑAS
  const [vistaActual, setVistaActual] = useState<'activas' | 'historial'>('activas')

  useEffect(() => {
    async function cargarHistorial() {
      // 1. Traemos los equipos para sacar los logos
      const { data: eqData } = await supabase.from('equipos').select('nombre, logo_url')
      if (eqData) setEquipos(eqData)

      // 2. Traemos todos los tickets del usuario
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          fecha_creacion,
          puntos_totales,
          prediccion_goles_total,
          quinielas (id, nombre_jornada, goles_totales_real, estado),
          pronosticos (
            eleccion_usuario,
            partidos (id, equipo_local, equipo_visitante, resultado_real, fecha_hora)
          )
        `)
        .eq('usuario_id', usuarioId)
        .order('fecha_creacion', { ascending: false })

      if (data) {
        const activos = data.filter(t => t.quinielas?.estado === 'abierta')
        const completados = data.filter(t => t.quinielas?.estado !== 'abierta')
        
        setGruposActivos(agruparTicketsPorQuiniela(activos))
        setGruposCompletados(agruparTicketsPorQuiniela(completados))
      }
      setCargando(false)
    }
    cargarHistorial()
  }, [usuarioId])

  // LÓGICA DE AGRUPACIÓN (Intacta)
  const agruparTicketsPorQuiniela = (ticketsArray: any[]) => {
    const grupos: Record<string, any> = {};
    
    ticketsArray.forEach(ticket => {
      const qId = ticket.quinielas?.id || ticket.quinielas?.nombre_jornada; 
      
      if (!grupos[qId]) {
        grupos[qId] = {
          nombre_jornada: ticket.quinielas?.nombre_jornada,
          estado: ticket.quinielas?.estado,
          goles_reales: ticket.quinielas?.goles_totales_real,
          partidos: ticket.pronosticos.map((pr: any) => ({
            id: pr.partidos?.id || `${pr.partidos?.equipo_local}-${pr.partidos?.equipo_visitante}`,
            local: pr.partidos?.equipo_local,
            visitante: pr.partidos?.equipo_visitante,
            real: pr.partidos?.resultado_real,
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
      ticket.pronosticos.forEach((pr: any) => {
        const pId = pr.partidos?.id || `${pr.partidos?.equipo_local}-${pr.partidos?.equipo_visitante}`;
        selecciones[pId] = pr.eleccion_usuario;
      });
      
      grupos[qId].tickets.push({
        id: ticket.id,
        fecha: ticket.fecha_creacion,
        puntos: ticket.puntos_totales,
        goles: ticket.prediccion_goles_total,
        selecciones
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

  if (cargando) return <div className="text-blue-400 animate-pulse text-center mt-10 font-bold uppercase tracking-widest text-xs">Cargando tus jugadas...</div>

  if (gruposActivos.length === 0 && gruposCompletados.length === 0) {
    return <div className="text-slate-500 italic text-center mt-10 text-sm">Aún no has realizado ninguna jugada.</div>
  }

  // COMPONENTE REDISEÑADO: MÁS COMPACTO Y ESTILIZADO
  const TarjetaGrupoAgrupado = ({ grupo, esActivo }: { grupo: any, esActivo: boolean }) => {
    return (
      <div className={`bg-slate-900 border rounded-xl overflow-hidden shadow-xl transition-all mb-6 ${esActivo ? 'border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.1)]' : 'border-slate-700 opacity-95'}`}>
        
        {/* ENCABEZADO COMPACTO */}
        <div className="bg-slate-800/80 px-3 sm:px-4 py-2.5 flex flex-wrap justify-between items-center border-b border-slate-700 gap-2">
          <div>
            <h4 className={`font-black tracking-widest uppercase text-xs md:text-sm ${esActivo ? 'text-amber-500' : 'text-blue-400'}`}>{grupo.nombre_jornada}</h4>
            <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 block">
              Boletos comprados: <span className="text-white">{grupo.tickets.length}</span>
            </span>
          </div>
          {grupo.goles_reales !== null && (
            <div className="text-center bg-slate-950/50 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-2">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Marcador Final:</span>
              <span className="text-xs font-black text-white">{grupo.goles_reales} Goles</span>
            </div>
          )}
        </div>
        
        {/* TABLA ULTRA COMPACTA */}
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-2 py-2 font-bold uppercase text-[9px] tracking-wider text-center w-48 min-w-[160px]">Partido</th>
                <th className="px-2 py-2 font-bold uppercase text-[9px] tracking-wider text-center border-r border-slate-800 bg-slate-950 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">Real</th>
                {grupo.tickets.map((t: any, idx: number) => (
                  <th key={t.id} className={`px-2 py-2 font-black uppercase text-[9px] text-center border-r border-slate-800/50 ${esActivo ? 'text-amber-500' : 'text-blue-400'}`}>
                    J{idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {grupo.partidos.map((p: any, pIdx: number) => (
                <tr key={pIdx} className="hover:bg-slate-800/40 transition-colors">
                  
                  {/* CELDA DE EQUIPOS (MÁS PEQUEÑA) */}
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
                  
                  {/* CELDA RESULTADO OFICIAL (CÍRCULOS MÁS CHICOS) */}
                  <td className="px-1 py-1.5 text-center border-r border-slate-800 font-black bg-slate-950/40 sticky left-0 z-10">
                    {p.real ? (
                      <span className={`inline-block w-5 h-5 text-[9px] leading-5 rounded-full shadow-inner ${p.real==='L'?'bg-blue-900 text-blue-300':p.real==='E'?'bg-slate-700 text-slate-300':'bg-red-900 text-red-300'}`}>{p.real}</span>
                    ) : (
                      <span className="text-slate-600 font-mono text-[10px]">-</span>
                    )}
                  </td>

                  {/* CELDAS PRONÓSTICOS DEL JUGADOR */}
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
              ))}
            </tbody>
            
            {/* PIE DE TABLA COMPACTO */}
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
      
      {/* 🚀 NUEVO SISTEMA DE PESTAÑAS */}
      <div className="flex bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shadow-inner mb-6 w-full max-w-sm">
        <button 
          onClick={() => setVistaActual('activas')} 
          className={`flex-1 py-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex justify-center items-center gap-1.5 ${
            vistaActual === 'activas' 
            ? 'bg-amber-600 text-white shadow-[0_0_15px_rgba(217,119,6,0.3)]' 
            : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span>🔥</span> En Juego ({gruposActivos.length})
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

      {/* CONTENEDOR DE JUGADAS SEGÚN LA PESTAÑA */}
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

    </div>
  )
}