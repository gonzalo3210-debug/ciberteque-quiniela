'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MisJugadas({ usuarioId }: { usuarioId: string }) {
  const [gruposActivos, setGruposActivos] = useState<any[]>([])
  const [gruposCompletados, setGruposCompletados] = useState<any[]>([])
  const [equipos, setEquipos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargarHistorial() {
      // 1. Traemos los equipos para sacar los logos
      const { data: eqData } = await supabase.from('equipos').select('nombre, logo_url')
      if (eqData) setEquipos(eqData)

      // 2. Traemos todos los tickets del usuario
      // Agregamos 'id' en partidos y 'id' en quinielas para agrupar con seguridad
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
            partidos (id, equipo_local, equipo_visitante, resultado_real)
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

  // LÓGICA DE AGRUPACIÓN: Junta todos los tickets de la misma quiniela en una sola matriz
  const agruparTicketsPorQuiniela = (ticketsArray: any[]) => {
    const grupos: Record<string, any> = {};
    
    ticketsArray.forEach(ticket => {
      // Usamos el ID de la quiniela o su nombre como llave identificadora
      const qId = ticket.quinielas?.id || ticket.quinielas?.nombre_jornada; 
      
      if (!grupos[qId]) {
        grupos[qId] = {
          nombre_jornada: ticket.quinielas?.nombre_jornada,
          estado: ticket.quinielas?.estado,
          goles_reales: ticket.quinielas?.goles_totales_real,
          // Guardamos la radiografía de los partidos extrayéndolos del primer ticket encontrado
          partidos: ticket.pronosticos.map((pr: any) => ({
            id: pr.partidos?.id || `${pr.partidos?.equipo_local}-${pr.partidos?.equipo_visitante}`,
            local: pr.partidos?.equipo_local,
            visitante: pr.partidos?.equipo_visitante,
            real: pr.partidos?.resultado_real
          })),
          tickets: []
        };
      }
      
      // Creamos un diccionario de selecciones para este ticket { ID_Partido: 'L' }
      const selecciones: Record<string, string> = {};
      ticket.pronosticos.forEach((pr: any) => {
        const pId = pr.partidos?.id || `${pr.partidos?.equipo_local}-${pr.partidos?.equipo_visitante}`;
        selecciones[pId] = pr.eleccion_usuario;
      });
      
      // Añadimos la jugada al grupo
      grupos[qId].tickets.push({
        id: ticket.id,
        fecha: ticket.fecha_creacion,
        puntos: ticket.puntos_totales,
        goles: ticket.prediccion_goles_total,
        selecciones
      });
    });
    
    return Object.values(grupos);
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
    const equipo = equipos.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
  }

  if (cargando) return <div className="text-blue-400 animate-pulse text-center mt-10 font-bold uppercase tracking-widest">Cargando tus jugadas...</div>

  // COMPONENTE PARA LA TABLA MATRICIAL AGRUPADA
  const TarjetaGrupoAgrupado = ({ grupo, esActivo }: { grupo: any, esActivo: boolean }) => {
    return (
      <div className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-2xl transition-all mb-8 ${esActivo ? 'border-blue-600/50 shadow-[0_0_20px_rgba(37,99,235,0.15)]' : 'border-slate-700 opacity-90'}`}>
        
        {/* ENCABEZADO DE LA JORNADA */}
        <div className="bg-slate-800/80 px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-700 gap-3">
          <div>
            <h4 className="text-blue-400 font-black tracking-widest uppercase sm:text-lg">{grupo.nombre_jornada}</h4>
            <span className="text-[10px] text-slate-400 font-bold uppercase mt-1 block">
              Boletos comprados: <span className="text-white">{grupo.tickets.length}</span>
            </span>
          </div>
          {grupo.goles_reales !== null && (
            <div className="text-center bg-slate-950/50 px-4 py-1.5 rounded-lg border border-slate-700 w-full sm:w-auto flex sm:flex-col justify-between sm:justify-center items-center">
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider sm:mb-0.5">Marcador Oficial</span>
              <span className="text-sm sm:text-lg font-black text-white">{grupo.goles_reales} Goles</span>
            </div>
          )}
        </div>
        
        {/* TABLA COMPARATIVA CON SCROLL HORIZONTAL */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold uppercase text-[10px] tracking-wider text-center w-64 min-w-[200px]">Partido</th>
                <th className="px-4 py-3 font-bold uppercase text-[10px] tracking-wider text-center border-r border-slate-800 bg-slate-950 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">Res. Real</th>
                {grupo.tickets.map((t: any, idx: number) => (
                  <th key={t.id} className="px-4 py-3 font-black uppercase text-[11px] text-center text-blue-400 border-r border-slate-800/50">
                    Jugada {idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {grupo.partidos.map((p: any, pIdx: number) => (
                <tr key={pIdx} className="hover:bg-slate-800/30 transition-colors">
                  
                  {/* CELDA DEL PARTIDO (LOCAL VS VISITA) */}
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold uppercase text-slate-300">
                      <div className="flex items-center gap-1.5 w-[45%] justify-end">
                        <span className="truncate text-right">{p.local}</span>
                        <img src={obtenerLogo(p.local)} alt="" className="w-5 h-5 object-contain" />
                      </div>
                      <span className="text-[10px] text-slate-600 italic px-1">VS</span>
                      <div className="flex items-center gap-1.5 w-[45%] justify-start">
                        <img src={obtenerLogo(p.visitante)} alt="" className="w-5 h-5 object-contain" />
                        <span className="truncate text-left">{p.visitante}</span>
                      </div>
                    </div>
                  </td>
                  
                  {/* CELDA DEL RESULTADO OFICIAL */}
                  <td className="px-4 py-2 text-center border-r border-slate-800 font-black bg-slate-950/40 sticky left-0 z-10">
                    {p.real ? (
                      <span className={`inline-block w-7 h-7 leading-7 rounded-full shadow-inner ${p.real==='L'?'bg-blue-900 text-blue-300':p.real==='E'?'bg-slate-700 text-slate-300':'bg-red-900 text-red-300'}`}>{p.real}</span>
                    ) : (
                      <span className="text-slate-600 font-mono">-</span>
                    )}
                  </td>

                  {/* CELDAS DE LOS TICKETS DEL JUGADOR */}
                  {grupo.tickets.map((t: any) => {
                    const pick = t.selecciones[p.id];
                    let color = 'bg-slate-800 text-slate-300'; // Estado pendiente por defecto
                    
                    if (p.real) {
                      // Ya hay resultado, calificamos
                      if (pick === p.real) {
                        color = 'bg-green-600 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)] border border-green-500'; // Acierto
                      } else {
                        color = 'bg-red-950/60 text-red-500/50 border border-red-900/30'; // Fallo
                      }
                    } else {
                      // Sin resultado, pintamos estética base
                      if (pick === 'E') color = 'bg-slate-700 text-slate-300 border border-slate-600';
                      else color = 'bg-blue-900/60 text-blue-300 border border-blue-800';
                    }

                    return (
                      <td key={`${t.id}-${p.id}`} className="px-4 py-2 text-center border-r border-slate-800/50">
                        <span className={`inline-block w-8 h-8 leading-8 rounded-md font-black transition-all ${color}`}>
                          {pick}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            
            {/* PIE DE TABLA: ACIERTOS Y GOLES */}
            <tfoot className="bg-slate-950 border-t-2 border-slate-700">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-right font-bold uppercase text-[10px] text-slate-500 border-r border-slate-800">
                  Desempate (Total Goles)
                </td>
                {grupo.tickets.map((t: any) => (
                  <td key={`goles-${t.id}`} className="px-4 py-3 text-center font-mono font-bold text-slate-300 border-r border-slate-800/50">
                    {t.goles || 0}
                  </td>
                ))}
              </tr>
              <tr className="bg-slate-900/50">
                <td colSpan={2} className="px-4 py-4 text-right font-black uppercase text-xs text-slate-300 border-r border-slate-800">
                  Puntos (Aciertos)
                </td>
                {grupo.tickets.map((t: any) => (
                  <td key={`puntos-${t.id}`} className="px-4 py-4 text-center border-r border-slate-800/50">
                    <span className="text-xl font-black text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)] block">
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

  if (gruposActivos.length === 0 && gruposCompletados.length === 0) {
    return <div className="text-slate-500 italic text-center mt-10">Aún no has realizado ninguna jugada.</div>
  }

  return (
    <div className="w-full max-w-5xl space-y-12 mt-8 animate-in fade-in duration-500 mb-20">
      
      {/* SECCIÓN 1: EN JUEGO */}
      <section>
        <h3 className="text-xl font-black text-amber-500 border-b border-slate-800 pb-3 mb-6 tracking-tight flex items-center gap-2">
          <span>🔥</span> Tickets en Juego
        </h3>
        {gruposActivos.length === 0 ? (
          <p className="text-slate-500 italic text-center py-4 bg-slate-900/50 rounded-xl border border-slate-800">No tienes jugadas activas en este momento.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {gruposActivos.map((grupo, idx) => <TarjetaGrupoAgrupado key={`act-${idx}`} grupo={grupo} esActivo={true} />)}
          </div>
        )}
      </section>

      {/* SECCIÓN 2: HISTORIAL (COMPLETADOS) */}
      <section>
        <h3 className="text-xl font-black text-slate-400 border-b border-slate-800 pb-3 mb-6 tracking-tight flex items-center gap-2 opacity-80">
          <span>📜</span> Historial de Completados
        </h3>
        {gruposCompletados.length === 0 ? (
          <p className="text-slate-500 italic text-center py-4 bg-slate-900/50 rounded-xl border border-slate-800">Aún no tienes tickets terminados.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {gruposCompletados.map((grupo, idx) => <TarjetaGrupoAgrupado key={`comp-${idx}`} grupo={grupo} esActivo={false} />)}
          </div>
        )}
      </section>

    </div>
  )
}