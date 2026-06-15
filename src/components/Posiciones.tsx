'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Posiciones() {
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]) 
  const [quinielaActiva, setQuinielaActiva] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  
  // 🆕 ESTADO MEJORADO: Ahora solo guarda UN ID a la vez (Efecto Acordeón)
  const [quinielaExpandidaId, setQuinielaExpandidaId] = useState<string | null>(null)

  // ⚙️ CONFIGURACIÓN MONETARIA (Solo Porcentaje, adiós créditos)
  const PORCENTAJE_PREMIO = 0.80 

  useEffect(() => {
    async function cargarDatos() {
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
      const { data: tData } = await supabase.from('tickets').select('id, usuario_id, quiniela_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)').in('quiniela_id', quinielaIds)
      const { data: uData } = await supabase.from('usuarios').select('id, nombre, avatar_url')
      
      const mapaUsuarios: Record<string, { nombre: string, avatar_url: string | null }> = {}
      if (uData) uData.forEach(u => mapaUsuarios[u.id] = { nombre: u.nombre, avatar_url: u.avatar_url })

      const quinielasProcesadas = qData.map(q => {
        const partidosQ = pData?.filter(p => p.quiniela_id === q.id) || []
        const ticketsQ = tData?.filter(t => t.quiniela_id === q.id) || []

        const ranking = ticketsQ.map(ticket => {
          let puntos = 0
          const aciertos: Record<string, string> = {}
          const pronosticosTicket = ticket.pronosticos || [] 

          pronosticosTicket.forEach((pron: any) => {
            const partido = partidosQ.find(p => p.id === pron.partido_id)
            if (partido) {
              if (partido.resultado_real) {
                if (partido.resultado_real === pron.eleccion_usuario) {
                  puntos++
                  aciertos[pron.partido_id] = 'acierto'
                } else {
                  aciertos[pron.partido_id] = 'fallo'
                }
              } else {
                aciertos[pron.partido_id] = 'pendiente'
              }
            }
          })

          const golesReales = q.goles_totales_real !== null ? q.goles_totales_real : -1
          const golesDiff = golesReales !== -1 ? Math.abs((ticket.prediccion_goles_total || 0) - golesReales) : 999

          const userData = mapaUsuarios[ticket.usuario_id] || { nombre: 'Jugador de Mostrador', avatar_url: null }

          return {
            id: ticket.id,
            nombre: userData.nombre,
            avatar_url: userData.avatar_url,
            prediccionGoles: ticket.prediccion_goles_total || 0,
            puntos,
            aciertos,
            golesDiff,
            pronosticos: pronosticosTicket
          }
        })

        ranking.sort((a, b) => {
          if (b.puntos !== a.puntos) return b.puntos - a.puntos
          return a.golesDiff - b.golesDiff
        })

        ranking.forEach((item: any, idx) => {
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
        });

        // 💰 LÓGICA MONETARIA DIRECTA EN PESOS MXN
        const precioTicketMXN = q.precio_ticket ?? 30 // Directo en pesos
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

      // 🕒 ORDENAMIENTO: De izquierda a derecha, la más próxima a cerrar primero
      const activas = quinielasProcesadas
        .filter(q => q.estado === 'abierta' || (q.estado === 'cerrada' && q.goles_totales_real === null))
        .sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime())

      const pasadas = quinielasProcesadas
        .filter(q => q.estado === 'cerrada' && q.goles_totales_real !== null)
        .sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime())

      setQuinielasAbiertas(activas)
      setQuinielaActiva(activas.length > 0 ? activas[0] : quinielasProcesadas[0])
      setHistorial(pasadas)
      setCargando(false)
    }

    cargarDatos()
  }, [])

  // 🆕 FUNCIÓN MEJORADA: Efecto acordeón (si clickeas la misma, se cierra; si clickeas otra, se abre)
  const toggleExpandir = (id: string) => {
    setQuinielaExpandidaId(prevId => prevId === id ? null : id)
  }

  if (cargando) return <div className="text-amber-500 animate-pulse text-center mt-10 font-bold uppercase tracking-widest text-xs">Calculando Bolsa y Posiciones...</div>
  if (!quinielaActiva) return <div className="text-slate-500 italic text-center mt-10 text-sm">No hay datos de quinielas disponibles.</div>

  const totalJugadores = quinielaActiva.ranking.length
  const partidosTerminados = quinielaActiva.partidos.filter((p: any) => p.resultado_real).length
  
  const fechaCierreCorta = quinielaActiva.fecha_cierre ? quinielaActiva.fecha_cierre.substring(0, 16) : null
  const fechaCierre = new Date(fechaCierreCorta || quinielaActiva.fecha_cierre)
  const yaPasoCierre = new Date() >= fechaCierre
  
  const mostrarPicks = quinielaActiva.estado === 'cerrada' || yaPasoCierre

  const getAvatarUrl = (nombre: string, url: string | null) => {
    if (url) return url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=1e293b&color=3b82f6&size=100&bold=true`;
  }

  const esPromo = quinielaActiva.tipo_premiacion?.toLowerCase().includes('promo');

  return (
    <div className="w-full max-w-4xl mt-2 animate-in fade-in duration-500 mb-20 space-y-6">
      
      <section>
        {/* SELECTOR DE JORNADAS COMPACTO */}
        {quinielasAbiertas.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800 shadow-inner justify-center">
            {quinielasAbiertas.map(qa => (
              <button 
                key={qa.id} 
                onClick={() => setQuinielaActiva(qa)} 
                className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${
                  quinielaActiva?.id === qa.id 
                    ? 'bg-amber-500 text-slate-900 shadow-md scale-105' 
                    : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {qa.nombre_jornada} {qa.estado === 'cerrada' ? '(En Juego)' : ''}
              </button>
            ))}
          </div>
        )}

        {/* TARJETA DE ESTADÍSTICAS COMPACTA */}
        <div className="bg-gradient-to-br from-amber-950/40 to-slate-900 border border-amber-500/30 p-4 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.1)] relative overflow-hidden mb-4">
          <div className="absolute -right-4 -top-4 p-2 opacity-5 text-7xl select-none">💰</div>
          
          <h2 className="text-center text-lg md:text-xl font-black text-white uppercase italic tracking-tight mb-0.5 relative z-10">
            {quinielaActiva.estado === 'abierta' ? 'RANKING EN VIVO' : 'RESULTADOS EN JUEGO'}
          </h2>
          <p className="text-center text-amber-500 text-[10px] font-black uppercase tracking-widest mb-3">{quinielaActiva.nombre_jornada}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 relative z-10">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Participantes</span>
              <span className="text-lg md:text-xl font-black text-white">{totalJugadores}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Recaudado Total</span>
              <span className="text-lg md:text-xl font-black text-white">${quinielaActiva.recaudadoPesos} <span className="text-[10px] text-slate-500">MXN</span></span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-blue-900/40 text-center md:col-span-1 col-span-2 shadow-[0_0_10px_rgba(37,99,235,0.1)]">
              <span className="block text-[8px] md:text-[9px] text-blue-400 font-bold uppercase tracking-widest mb-0.5">Avance Jornada</span>
              <span className="text-lg md:text-xl font-black text-blue-400">{partidosTerminados} <span className="text-[10px] text-blue-500/50">de</span> {quinielaActiva.partidos.length}</span>
            </div>
          </div>

          <div className="mt-3 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-center shadow-[0_0_15px_rgba(245,158,11,0.1)] relative z-10">
            {esPromo ? (
              <>
                <span className="block text-[9px] text-amber-500 font-black uppercase tracking-widest mb-0.5">🎁 EVENTO PROMOCIONAL 🎁</span>
                <span className="text-base md:text-lg font-black text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)] block">
                  {quinielaActiva.tipo_premiacion === 'promo_top2' ? '1 BOLETO AL 1º Y 2º LUGAR' : '1 BOLETO AL GANADOR'}
                </span>
              </>
            ) : (
              <>
                <span className="block text-[9px] text-amber-500 font-black uppercase tracking-widest mb-0.5">
                  {quinielaActiva.estado === 'abierta' ? '👑 Bolsa Para El Ganador 👑' : '🏆 PREMIO A REPARTIR 🏆'}
                </span>
                <span className="text-2xl md:text-3xl font-black text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)] block">
                  ${quinielaActiva.premioPesos.toFixed(0)} <span className="text-[10px] md:text-xs text-amber-600 uppercase font-bold">MXN</span>
                </span>
              </>
            )}
          </div>
        </div>

        {!mostrarPicks && (
          <div className="mb-3 text-center border border-amber-900/50 bg-amber-950/20 text-amber-500/80 text-[10px] py-1.5 rounded-lg font-bold uppercase tracking-widest">
            🔒 Radiografía oculta hasta las {fechaCierre.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
        )}

        {/* TABLA DE POSICIONES ULTRA COMPACTA */}
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
                  return (
                    <tr key={jugador.id} className={`transition-colors hover:bg-slate-800/30 ${esLider ? 'bg-gradient-to-r from-amber-900/15 to-transparent' : ''}`}>
                      
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
                            <div className="block md:hidden text-[8px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">
                              Dif: {quinielaActiva.goles_totales_real !== null ? jugador.golesDiff : '?'}
                            </div>
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
                        {quinielaActiva.goles_totales_real !== null && <span className="hidden md:inline-block text-[8px] font-bold text-amber-500 ml-1">Dif:{jugador.golesDiff}</span>}
                      </td>
                      
                      <td className="p-2 text-right pr-3">
                        <div className="flex gap-0.5 md:gap-1 justify-end flex-wrap w-full max-w-[180px] ml-auto">
                          {quinielaActiva.partidos.map((p: any, i: number) => {
                            const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                            const estado = jugador.aciertos[p.id]
                            
                            if (!mostrarPicks) {
                              return (
                                <div key={p.id} className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[8px] bg-slate-950 border border-slate-800 text-slate-600" title={`Partido ${i+1} Oculto`}>
                                  🔒
                                </div>
                              )
                            }

                            let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                            if (estado === 'acierto') bgClass = "bg-green-600 border-green-500 text-white"
                            if (estado === 'fallo') bgClass = "bg-red-950/40 border-red-900 text-red-500"
                            if (estado === 'pendiente' && pronostico) bgClass = "bg-slate-800 border-slate-600 text-slate-300"
                            
                            return (
                              <div key={p.id} className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[9px] font-black border ${bgClass}`} title={`Partido ${i+1}`}>
                                {pronostico ? pronostico.eleccion_usuario : '-'}
                              </div>
                            )
                          })}
                        </div>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
            {quinielaActiva.ranking.length === 0 && (
              <div className="p-6 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">Aún no hay boletos para esta jornada.</div>
            )}
          </div>
        </div>
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
              
              // 🆕 LÓGICA MEJORADA: Compara si el ID de esta quiniela coincide con el estado único
              const estaExpandida = quinielaExpandidaId === quiniela.id;
              const jugadoresAMostrar = estaExpandida ? quiniela.ranking : quiniela.ranking.slice(0, 5);

              return (
                <div 
                  key={quiniela.id} 
                  // 🎨 UI MEJORADA: Si está expandida, abarca 2 columnas en pantallas medianas (sm:col-span-2)
                  className={`bg-slate-900 border rounded-xl p-3 md:p-4 shadow-lg relative overflow-hidden flex flex-col transition-all duration-300 ${estaExpandida ? 'border-amber-500/50 sm:col-span-2 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'border-slate-800'}`}
                >
                  <div className="flex justify-between items-start mb-3 border-b border-slate-800 pb-2">
                    <div>
                      <h4 className={`font-black text-[10px] md:text-xs uppercase italic ${estaExpandida ? 'text-amber-400' : 'text-white'}`}>{quiniela.nombre_jornada}</h4>
                      <span className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mt-0.5 block">Goles Reales: <span className="text-slate-300">{quiniela.goles_totales_real}</span></span>
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
                      <div key={jugador.id} className="flex flex-col bg-slate-950/50 p-1.5 md:p-2 rounded-lg border border-slate-800/50 transition-colors">
                        {/* Cabecera del Jugador */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="flex justify-center items-center text-sm w-4 md:w-5 text-center">
                              {jugador.posicion === 1 ? '🥇' : 
                               jugador.posicion === 2 ? '🥈' : 
                               jugador.posicion === 3 ? '🥉' : 
                               <span className="text-[9px] font-black text-slate-500 bg-slate-900 border border-slate-700 px-1.5 rounded">{jugador.posicion}</span>}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} alt={jugador.nombre} className="w-4 h-4 md:w-5 md:h-5 rounded-full object-cover border border-slate-700 bg-slate-900" />
                              <span className={`font-black uppercase text-[9px] md:text-[10px] truncate ${estaExpandida ? 'w-[120px] sm:w-auto' : 'w-[80px] sm:w-[100px]'} ${jugador.posicion === 1 ? 'text-amber-400' : 'text-slate-300'}`}>
                                {jugador.nombre}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[8px] md:text-[9px] font-bold text-slate-500">
                            {!estaExpandida && <span title="Goles Predichos" className="hidden xs:inline-block">G:{jugador.prediccionGoles}</span>}
                            <span className="bg-slate-800 text-green-400 px-1.5 py-0.5 rounded border border-slate-700 w-9 md:w-10 text-center shadow-inner">
                              {jugador.puntos}
                            </span>
                          </div>
                        </div>

                        {/* 🆕 RADIOGRAFÍA EXTRA EXPANDIDA: Aciertos, Fallos y Diferencia de Goles */}
                        {estaExpandida && (
                          <div className="flex justify-between items-center border-t border-slate-800/50 pt-2 mt-2">
                            <div className="flex gap-0.5 md:gap-1 flex-wrap">
                              {quiniela.partidos.map((p: any, i: number) => {
                                const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                const estado = jugador.aciertos[p.id]
                                
                                let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                                if (estado === 'acierto') bgClass = "bg-green-600 border-green-500 text-white"
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

                  {/* 🆕 BOTÓN MEJORADO: Siempre muestra la opción de expandir para ver radiografías */}
                  <button
                    onClick={() => toggleExpandir(quiniela.id)}
                    className="mt-3 pt-2 text-[9px] md:text-[10px] text-slate-400 hover:text-amber-400 font-bold uppercase tracking-widest transition-colors border-t border-slate-800/50 w-full text-center flex items-center justify-center gap-1"
                  >
                    {estaExpandida ? (
                      <>Ocultar Detalles <span className="text-xs">🔼</span></>
                    ) : (
                      <>Ver Radiografías completas ({quiniela.ranking.length}) <span className="text-xs">🔽</span></>
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