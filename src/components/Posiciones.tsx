'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Posiciones() {
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]) // NUEVO: Para guardar todas las activas
  const [quinielaActiva, setQuinielaActiva] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  // ⚙️ CONFIGURACIÓN MONETARIA DE LA BOLSA
  const VALOR_CREDITO = 30 // Cada crédito vale $30 MXN
  const PORCENTAJE_PREMIO = 0.80 // 80% a repartir entre los ganadores

  useEffect(() => {
    async function cargarDatos() {
      // 1. Traemos las últimas 5 quinielas
      const { data: qData } = await supabase
        .from('quinielas')
        .select('*')
        .order('id', { ascending: false })
        .limit(5)

      if (!qData || qData.length === 0) {
        setCargando(false)
        return
      }

      const quinielaIds = qData.map(q => q.id)

      // 2. Traemos partidos, tickets y usuarios
      const { data: pData } = await supabase.from('partidos').select('*').in('quiniela_id', quinielaIds).order('id', { ascending: true })
      const { data: tData } = await supabase.from('tickets').select('id, usuario_id, quiniela_id, prediccion_goles_total, pronosticos(partido_id, eleccion_usuario)').in('quiniela_id', quinielaIds)
      const { data: uData } = await supabase.from('usuarios').select('id, nombre')
      
      const mapaUsuarios: Record<string, string> = {}
      if (uData) uData.forEach(u => mapaUsuarios[u.id] = u.nombre)

      // 3. Procesamos los rankings separando por jornada (Blindado contra errores)
      const quinielasProcesadas = qData.map(q => {
        const partidosQ = pData?.filter(p => p.quiniela_id === q.id) || []
        const ticketsQ = tData?.filter(t => t.quiniela_id === q.id) || []

        const ranking = ticketsQ.map(ticket => {
          let puntos = 0
          const aciertos: Record<string, string> = {}
          const pronosticosTicket = ticket.pronosticos || [] // <-- SEGURO ANTI-ERRORES

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

          return {
            id: ticket.id,
            nombre: mapaUsuarios[ticket.usuario_id] || 'Jugador de Mostrador',
            prediccionGoles: ticket.prediccion_goles_total || 0,
            puntos,
            aciertos,
            golesDiff,
            pronosticos: pronosticosTicket
          }
        })

        // Ordenamos el ranking
        ranking.sort((a, b) => {
          if (b.puntos !== a.puntos) return b.puntos - a.puntos
          return a.golesDiff - b.golesDiff
        })

        // CALCULADORA FINANCIERA EN PESOS MXN
        const precioTicketCrds = q.precio_ticket || 1
        const totalBoletos = ranking.length
        const recaudadoPesos = totalBoletos * precioTicketCrds * VALOR_CREDITO
        const premioPesos = recaudadoPesos * PORCENTAJE_PREMIO

        return { ...q, ranking, partidos: partidosQ, recaudadoPesos, premioPesos }
      })

      // 4. Separamos la Activa y el Historial
      const abiertas = quinielasProcesadas.filter(q => q.estado === 'abierta')
      const pasadas = quinielasProcesadas.filter(q => q.estado === 'cerrada')

      // Guardamos la lista de todas las abiertas para el menú de botones
      setQuinielasAbiertas(abiertas)
      
      // Por defecto mostramos la primera abierta (o la última procesada si no hay abiertas)
      setQuinielaActiva(abiertas.length > 0 ? abiertas[0] : quinielasProcesadas[0])
      setHistorial(pasadas)
      setCargando(false)
    }

    cargarDatos()
  }, [])

  if (cargando) return <div className="text-amber-500 animate-pulse text-center mt-10 font-bold uppercase tracking-widest">Calculando Bolsa y Posiciones...</div>
  if (!quinielaActiva) return <div className="text-slate-500 italic text-center mt-10">No hay datos de quinielas disponibles.</div>

  // Matemáticas de la Quiniela Activa
  const totalJugadores = quinielaActiva.ranking.length
  const partidosTerminados = quinielaActiva.partidos.filter((p: any) => p.resultado_real).length

  return (
    <div className="w-full max-w-4xl mt-6 animate-in fade-in duration-500 mb-20 space-y-12">
      
      {/* =========================================
          SECCIÓN 1: JORNADA ACTIVA (EN VIVO)
          ========================================= */}
      <section>

        {/* NUEVO: SELECTOR DE JORNADAS ACTIVAS PARA EL CLIENTE */}
        {quinielasAbiertas.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6 bg-slate-900/50 p-3 rounded-xl border border-slate-800 shadow-inner">
            <span className="text-[10px] text-slate-500 font-bold uppercase w-full mb-1">Elige la jornada en vivo:</span>
            {quinielasAbiertas.map(qa => (
              <button 
                key={qa.id} 
                onClick={() => setQuinielaActiva(qa)} 
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                  quinielaActiva?.id === qa.id 
                    ? 'bg-amber-500 text-slate-900 shadow-md scale-105' 
                    : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {qa.nombre_jornada}
              </button>
            ))}
          </div>
        )}

        {/* TARJETA DE ESTADÍSTICAS Y DINERO PREMIUM */}
        <div className="bg-gradient-to-br from-amber-950/40 to-slate-900 border border-amber-500/30 p-6 rounded-3xl shadow-[0_0_30px_rgba(245,158,11,0.1)] relative overflow-hidden mb-6">
          <div className="absolute -right-6 -top-6 p-4 opacity-5 text-9xl select-none">💰</div>
          
          <h2 className="text-center text-2xl md:text-3xl font-black text-white uppercase italic tracking-tight mb-2 relative z-10">
            {quinielaActiva.estado === 'abierta' ? 'RANKING EN VIVO' : 'RESULTADO FINAL'}
          </h2>
          <p className="text-center text-amber-500 text-xs font-black uppercase tracking-widest mb-6">{quinielaActiva.nombre_jornada}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 relative z-10">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Participantes</span>
              <span className="text-2xl font-black text-white">{totalJugadores}</span>
            </div>
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Recaudado Total</span>
              <span className="text-2xl font-black text-white">${quinielaActiva.recaudadoPesos} <span className="text-xs text-slate-500">MXN</span></span>
            </div>
            <div className="bg-slate-950/60 p-4 rounded-xl border border-blue-900/40 text-center md:col-span-1 col-span-2 shadow-[0_0_15px_rgba(37,99,235,0.1)]">
              <span className="block text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Avance Jornada</span>
              <span className="text-2xl font-black text-blue-400">{partidosTerminados} <span className="text-xs text-blue-500/50">de</span> {quinielaActiva.partidos.length}</span>
            </div>
          </div>

          <div className="mt-5 bg-amber-500/10 p-5 rounded-2xl border border-amber-500/20 text-center shadow-[0_0_20px_rgba(245,158,11,0.15)] relative z-10">
            <span className="block text-[10px] md:text-xs text-amber-500 font-black uppercase tracking-widest mb-1">
              {quinielaActiva.estado === 'abierta' ? '👑 Bolsa Garantizada Para El Ganador 👑' : '🏆 PREMIO REPARTIDO 🏆'}
            </span>
            <span className="text-4xl md:text-5xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)] block">
              ${quinielaActiva.premioPesos.toFixed(0)} <span className="text-sm md:text-lg text-amber-600 uppercase font-bold">MXN</span>
            </span>
            <div className="mt-2 text-[9px] text-slate-500 font-bold uppercase tracking-wider">Valor del crédito: $30 MXN | Retención casa: 20%</div>
          </div>
        </div>

        {/* TABLA DE POSICIONES ACTIVA */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-[10px] uppercase text-slate-500 tracking-widest border-b border-slate-800">
                  <th className="p-4 w-14 text-center">Pos</th>
                  <th className="p-4">Jugador</th>
                  <th className="p-4 text-center">Aciertos</th>
                  <th className="p-4 text-center hidden md:table-cell">Goles (Desempate)</th>
                  <th className="p-4 text-right pr-6">Radiografía</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {quinielaActiva.ranking.map((jugador: any, idx: number) => {
                  const esLider = idx === 0 && totalJugadores > 1 && jugador.puntos > 0
                  return (
                    <tr key={jugador.id} className={`transition-colors hover:bg-slate-800/30 ${esLider ? 'bg-gradient-to-r from-amber-900/15 to-transparent' : ''}`}>
                      <td className="p-4 text-center">
                        {idx === 0 && partidosTerminados > 0 ? <span className="text-2xl drop-shadow-md block">🥇</span> : 
                         idx === 1 && partidosTerminados > 0 ? <span className="text-xl block">🥈</span> : 
                         idx === 2 && partidosTerminados > 0 ? <span className="text-xl block">🥉</span> : 
                         <span className="text-xs font-black text-slate-500 bg-slate-950 border border-slate-800 px-2 py-1 rounded">{idx + 1}</span>}
                      </td>
                      <td className="p-4">
                        <span className={`font-black uppercase text-sm block tracking-tight ${esLider ? 'text-amber-400' : 'text-slate-200'}`}>
                          {jugador.nombre} {esLider && <span className="ml-1 text-xs">👑</span>}
                        </span>
                        <div className="block md:hidden text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">
                          Goles: <span className="text-slate-300 font-mono">{jugador.prediccionGoles}</span>
                          {quinielaActiva.goles_totales_real !== null && <span className="text-amber-500/80 ml-2">(Dif: {jugador.golesDiff})</span>}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-xl font-black ${esLider ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.15)]'}`}>
                          {jugador.puntos}
                        </span>
                      </td>
                      <td className="p-4 text-center hidden md:table-cell">
                        <span className="text-sm font-mono font-bold text-slate-300 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">{jugador.prediccionGoles}</span>
                        {quinielaActiva.goles_totales_real !== null && <span className="text-[10px] font-bold text-amber-500 ml-2 inline-block">Dif: {jugador.golesDiff}</span>}
                      </td>
                      <td className="p-4 text-right pr-6">
                        <div className="flex gap-1 justify-end flex-wrap w-full max-w-[240px] ml-auto">
                          {quinielaActiva.partidos.map((p: any, i: number) => {
                            const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                            const estado = jugador.aciertos[p.id]
                            let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                            if (estado === 'acierto') bgClass = "bg-green-600 border-green-500 text-white"
                            if (estado === 'fallo') bgClass = "bg-red-950/40 border-red-900 text-red-500"
                            if (estado === 'pendiente' && pronostico) bgClass = "bg-slate-800 border-slate-600 text-slate-300" // Se ve en gris claro si ya pronosticó pero no hay resultado
                            
                            return (
                              <div key={p.id} className={`w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded text-[9px] md:text-[10px] font-black border ${bgClass}`} title={`Partido ${i+1}`}>
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
              <div className="p-10 text-center text-slate-500 text-sm font-bold uppercase tracking-widest italic">Aún no hay boletos registrados para esta jornada.</div>
            )}
          </div>
        </div>
      </section>

      {/* =========================================
          SECCIÓN 2: SALÓN DE LA FAMA (HISTORIAL)
          ========================================= */}
      {historial.length > 0 && (
        <section className="pt-8 border-t border-slate-800">
          <h3 className="text-xl font-black text-slate-400 mb-6 uppercase tracking-widest flex items-center gap-2">
            <span>📜</span> Salón de la Fama <span className="text-[10px] font-normal tracking-normal ml-2 opacity-60">(Jornadas Anteriores)</span>
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {historial.map(quiniela => (
              <div key={quiniela.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex justify-between items-start mb-4 border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="font-black text-white uppercase italic">{quiniela.nombre_jornada}</h4>
                    <span className="text-[10px] text-slate-500 font-bold uppercase mt-1 block">Goles Reales: {quiniela.goles_totales_real}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-amber-500 font-bold uppercase tracking-widest">Premio Entregado</span>
                    <span className="text-xl font-black text-amber-400 drop-shadow-md">${quiniela.premioPesos.toFixed(0)} <span className="text-xs">MXN</span></span>
                  </div>
                </div>

                <div className="space-y-2">
                  {quiniela.ranking.slice(0, 3).map((jugador: any, idx: number) => (
                    <div key={jugador.id} className="flex justify-between items-center bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-6 text-center">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                        </span>
                        <span className={`font-black uppercase text-xs truncate max-w-[120px] sm:max-w-[180px] ${idx === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                          {jugador.nombre}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                        <span title="Goles de Desempate">G: {jugador.prediccionGoles} (Dif: {jugador.golesDiff})</span>
                        <span className="bg-slate-800 text-green-400 px-2 py-1 rounded border border-slate-700 w-12 text-center shadow-inner">
                          {jugador.puntos} pts
                        </span>
                      </div>
                    </div>
                  ))}
                  {quiniela.ranking.length === 0 && (
                    <div className="text-center text-[10px] text-slate-500 italic py-2">Sin participantes.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}