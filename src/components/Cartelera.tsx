'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Cartelera({ usuarioActivo, actualizarSaldo }: { usuarioActivo: any, actualizarSaldo: (nuevoSaldo: number) => void }) {
  const [quinielasActivas, setQuinielasActivas] = useState<any[]>([])
  const [quinielaActual, setQuinielaActual] = useState<any>(null)
  const [partidos, setPartidos] = useState<any[]>([])
  const [equiposInfo, setEquiposInfo] = useState<any[]>([])
  const [selecciones, setSelecciones] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [golesTotales, setGolesTotales] = useState<string>('')
  
  const [estaCerrada, setEstaCerrada] = useState(false)
  const [motivoCierre, setMotivoCierre] = useState('')

  // 🔥 NUEVOS ESTADOS PARA EL REGLAMENTO
  const [mostrarReglas, setMostrarReglas] = useState(false) 
  const [aceptoReglas, setAceptoReglas] = useState(false) 

  useEffect(() => {
    async function cargarJornadas() {
      // Agregamos tipo_premiacion a la consulta
      const { data: qData } = await supabase
        .from('quinielas')
        .select(`
          id, nombre_jornada, precio_ticket, fecha_cierre, tipo_premiacion,
          partidos (id, equipo_local, equipo_visitante, fecha_hora, resultado_real)
        `)
        .eq('estado', 'abierta')
        .order('fecha_cierre', { ascending: true }) 

      const { data: eData } = await supabase.from('equipos').select('*')

      if (qData && qData.length > 0) {
        setQuinielasActivas(qData)
        cambiarQuinielaVisible(qData[0]) 
      }
      if (eData) {
        setEquiposInfo(eData)
      }
      setCargando(false)
    }
    cargarJornadas()
  }, [])

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const fechaCorta = fechaDB.substring(0, 16);
    const d = new Date(fechaCorta);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  const cambiarQuinielaVisible = (quiniela: any) => {
    setQuinielaActual(quiniela)
    setPartidos(quiniela.partidos)
    setSelecciones({}) 
    setGolesTotales('')
    setAceptoReglas(false) // Forzamos a que vuelva a aceptar las reglas si cambia de jornada

    const fechaCierreCorta = quiniela.fecha_cierre ? quiniela.fecha_cierre.substring(0, 16) : null
    const fechaCierre = new Date(fechaCierreCorta || quiniela.fecha_cierre)
    const ahora = new Date()
    const yaPasoLaHora = ahora > fechaCierre
    const yaHayResultados = quiniela.partidos.some((p: any) => p.resultado_real !== null)

    if (yaHayResultados) {
      setEstaCerrada(true)
      setMotivoCierre('Esta jornada ya cerró porque los resultados oficiales están siendo procesados.')
    } else if (yaPasoLaHora) {
      setEstaCerrada(true)
      setMotivoCierre('El tiempo límite para participar en esta jornada ha terminado.')
    } else {
      setEstaCerrada(false)
      setMotivoCierre('')
    }
  }

  const seleccionarOpcion = (partidoId: string, opcion: string) => {
    if (estaCerrada) return 
    setSelecciones({ ...selecciones, [partidoId]: opcion })
  }

  const guardarQuiniela = async () => {
    if (estaCerrada) return alert('La jornada está cerrada.')
    if (!aceptoReglas) return alert('Debes leer y aceptar el reglamento oficial para enviar tu boleto.')
    if (golesTotales === '') {
      alert('¡Falta información! Por favor, anota el total de goles para el desempate.')
      return
    }

    const costoTicket = quinielaActual?.precio_ticket || 1

    if (usuarioActivo.creditos_disponibles < costoTicket) {
      alert('No tienes créditos suficientes. Pasa a mostrador para recargar.')
      return
    }

    setGuardando(true)

    const seleccionesFinales = { ...selecciones }
    partidos.forEach(p => {
      if (!seleccionesFinales[p.id]) {
        seleccionesFinales[p.id] = 'E' 
      }
    })

    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .insert([{ 
          usuario_id: usuarioActivo.id, 
          quiniela_id: quinielaActual.id, 
          metodo_ingreso: 'digital',
          prediccion_goles_total: parseInt(golesTotales) || 0
        }])
        .select().single()

      if (ticketError) throw ticketError

      const pronosticosAGuardar = Object.keys(seleccionesFinales).map(partidoId => ({
        ticket_id: ticketData.id,
        partido_id: partidoId,
        eleccion_usuario: seleccionesFinales[partidoId]
      }))

      await supabase.from('pronosticos').insert(pronosticosAGuardar)

      const nuevoSaldo = usuarioActivo.creditos_disponibles - costoTicket
      await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioActivo.id)

      await supabase.from('transacciones_creditos').insert([{
        usuario_id: usuarioActivo.id,
        cantidad: -costoTicket,
        tipo_movimiento: 'juego_ticket',
        descripcion: `Ticket ${quinielaActual.nombre_jornada}`
      }])

      actualizarSaldo(nuevoSaldo)
      setSelecciones({}) 
      setGolesTotales('')
      setAceptoReglas(false)
      alert('¡Jugada guardada con éxito! Los partidos sin marcar se guardaron como Empate.')

    } catch (error) {
      console.error(error)
      alert('Error al guardar la jugada.')
    } finally {
      setGuardando(false)
    }
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    const equipo = equiposInfo.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || null
  }

  const formatearFechaObj = (fechaStr: string) => {
    if (!fechaStr) return null;
    try {
      const d = new Date(fechaStr.substring(0, 16));
      const fecha = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '');
      const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
      return { fecha, hora };
    } catch { return null; }
  }

  if (cargando) return <div className="text-blue-400 animate-pulse text-center mt-10 font-bold uppercase">Cargando...</div>
  if (!quinielaActual) return <div className="text-slate-500 italic text-center mt-10">No hay quinielas abiertas actualmente.</div>

  const prem = quinielaActual.tipo_premiacion || 'unico';

  return (
    <div className="w-full max-w-4xl mt-6 mb-20 animate-in fade-in duration-500 relative">
      
      {/* 3. SELECTOR DE QUINIELAS */}
      {quinielasActivas.length > 1 && (
        <div className="flex flex-wrap gap-3 justify-center mb-6 bg-slate-900/80 p-2 rounded-2xl border border-slate-800 shadow-xl">
          {quinielasActivas.map(q => (
            <button
              key={q.id}
              onClick={() => cambiarQuinielaVisible(q)}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all ${
                quinielaActual.id === q.id 
                ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-105' 
                : 'bg-slate-950 text-slate-500 border border-slate-800 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {q.nombre_jornada}
            </button>
          ))}
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL DEL TICKET */}
      <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        {estaCerrada && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center border border-red-900/50 rounded-2xl">
            <span className="text-6xl mb-4">🔒</span>
            <h2 className="text-3xl font-black text-red-500 uppercase tracking-widest mb-2 shadow-black drop-shadow-md">Jornada Cerrada</h2>
            <p className="text-slate-300 font-bold text-sm uppercase max-w-md">{motivoCierre}</p>
          </div>
        )}

        <div className="text-center mb-8 border-b border-slate-800 pb-6 relative">
          
          {/* BOTÓN REGLAMENTO ESQUINA SUPERIOR DERECHA */}
          <button onClick={() => setMostrarReglas(true)} className="absolute top-0 right-0 bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg transition-all shadow-inner">
            📜 Reglas del Juego
          </button>

          <h2 className="text-3xl font-black text-white uppercase italic pr-24 text-left md:text-center">{quinielaActual.nombre_jornada}</h2>
          
          <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
            <span className="bg-blue-950/40 border border-blue-900/50 text-blue-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
              Costo: {quinielaActual.precio_ticket} {quinielaActual.precio_ticket === 1 ? 'Crédito' : 'Créditos'}
            </span>
            {/* INFORMATIVO SOBRE PREMIACIÓN DE LA JORNADA */}
            <span className="bg-purple-950/40 border border-purple-900/50 text-purple-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
              🏆 Premiación: {prem === 'unico' ? 'Ganador Único' : prem === 'top2' ? 'Top 2 (70% - 30%)' : 'Top 3 (60% - 25% - 15%)'}
            </span>
          </div>

          {/* 🔥 HORA DE CIERRE VISIBLE PARA EL CLIENTE */}
          <div className="mt-4 mb-1 inline-block bg-red-950/40 border border-red-900/60 text-red-400 px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-inner">
            ⏳ Cierre de Jugadas: {formatearFechaLocal(quinielaActual.fecha_cierre)}
          </div>

        </div>

        <div className="space-y-5">
          {partidos.map((partido) => {
            const seleccion = selecciones[partido.id]
            const logoL = obtenerLogo(partido.equipo_local)
            const logoV = obtenerLogo(partido.equipo_visitante)
            const fechaObj = formatearFechaObj(partido.fecha_hora)

            return (
              <div key={partido.id} className="bg-slate-800/80 p-5 rounded-xl border border-slate-700 flex flex-col md:flex-row justify-between items-center md:items-start gap-4 transition-all shadow-md relative group hover:border-slate-500">
                
                <div className="flex flex-col w-full md:flex-1">
                  
                  <div className="flex w-full justify-between items-center text-sm md:text-base font-bold uppercase tracking-wide">
                    <div className="flex items-center justify-end gap-3 w-[45%]">
                      <span className="text-right text-slate-200 truncate">{partido.equipo_local}</span>
                      {logoL ? <img src={logoL} alt={partido.equipo_local} className="w-10 h-10 object-contain drop-shadow-md" /> : <div className="w-10 h-10 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-500">?</div>}
                    </div>
                    
                    <span className="w-[10%] text-center text-slate-600 text-xs font-black">VS</span>
                    
                    <div className="flex items-center justify-start gap-3 w-[45%]">
                      {logoV ? <img src={logoV} alt={partido.equipo_visitante} className="w-10 h-10 object-contain drop-shadow-md" /> : <div className="w-10 h-10 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-500">?</div>}
                      <span className="text-left text-slate-200 truncate">{partido.equipo_visitante}</span>
                    </div>
                  </div>

                  <div className="flex justify-center mt-5 mb-2 w-full">
                    <div className="flex gap-4 w-[220px]">
                      {['L', 'E', 'V'].map((opc) => (
                        <button 
                          key={opc}
                          onClick={() => seleccionarOpcion(partido.id, opc)}
                          disabled={estaCerrada}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-black transition-all border shadow-sm ${
                            seleccion === opc 
                            ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] scale-105' 
                            : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {opc}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="w-full md:w-auto md:min-w-[140px] flex justify-center md:justify-end items-center md:items-start border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-2 md:pl-6 mt-2 md:mt-0">
                  {fechaObj ? (
                    <div className="text-center md:text-right">
                      <span className="block text-slate-500 text-[9px] uppercase tracking-widest mb-1">Horario</span>
                      <span className="block text-blue-400 font-black text-sm md:text-base tracking-widest">{fechaObj.fecha}</span>
                      <span className="block text-slate-300 font-bold text-xs md:text-sm mt-0.5">{fechaObj.hora}</span>
                    </div>
                  ) : (
                    <div className="text-center md:text-right">
                      <span className="block text-slate-500 text-[9px] uppercase tracking-widest mb-1">Horario</span>
                      <span className="block text-slate-600 text-xs font-bold uppercase tracking-widest">Por definir</span>
                    </div>
                  )}
                </div>

              </div>
            )
          })}
        </div>

        <div className="mt-12 mb-6 p-6 bg-blue-950/40 border border-blue-900/50 rounded-2xl max-w-sm mx-auto text-center shadow-2xl z-10 relative">
          <label className="block text-blue-400 font-black uppercase text-[10px] tracking-[0.2em] mb-2">Criterio Desempate</label>
          <p className="text-slate-400 text-[9px] uppercase mb-4 font-bold tracking-tight">Total de goles en la jornada</p>
          <input 
            type="number"
            placeholder="00"
            value={golesTotales}
            onChange={(e) => setGolesTotales(e.target.value)}
            disabled={estaCerrada}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 text-center text-4xl font-black text-white focus:border-blue-500 outline-none transition-all"
          />
        </div>

        {/* ☑️ CASILLA DE REGLAS REQUERIDA */}
        <div className="w-full max-w-xs mx-auto flex items-start gap-2.5 mb-6 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
          <input 
            type="checkbox" 
            id="check-reglas" 
            checked={aceptoReglas} 
            onChange={(e) => setAceptoReglas(e.target.checked)} 
            disabled={estaCerrada} 
            className="mt-0.5 w-4 h-4 accent-green-600 rounded border-slate-700 bg-slate-900 cursor-pointer" 
          />
          <label htmlFor="check-reglas" className="text-[10px] font-bold uppercase tracking-wide text-slate-400 cursor-pointer select-none">
            He leído las <span onClick={(e) => { e.preventDefault(); setMostrarReglas(true); }} className="text-blue-400 underline hover:text-blue-300">reglas oficiales</span> y acepto los criterios de desempate y premios.
          </label>
        </div>

        <div className="flex flex-col items-center pt-2 border-t border-slate-800 z-10 relative">
          <button 
            onClick={guardarQuiniela}
            disabled={guardando || estaCerrada || !aceptoReglas}
            className={`w-full max-w-xs py-4 rounded-xl font-black uppercase tracking-widest transition-all ${
              (guardando || estaCerrada || !aceptoReglas)
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
              : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105 active:scale-95'
            }`}
          >
            {guardando ? 'Guardando...' : 'Confirmar Jugada'}
          </button>
        </div>
      </div>

      {/* 📜 VENTANA EMERGENTE (MODAL): REGLAMENTO OFICIAL ACTUALIZADO */}
      {mostrarReglas && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-tight"><span>📜</span> Reglamento CiberTeque</h3>
              <button onClick={() => setMostrarReglas(false)} className="text-slate-500 hover:text-slate-300 font-bold font-mono text-xl">✕</button>
            </div>
            <div className="space-y-4 text-xs text-slate-300 font-medium leading-relaxed uppercase tracking-wide max-h-[350px] overflow-y-auto pr-1">
              <p><strong className="text-blue-400">1. Pago Anticipado:</strong> Su boleto debe estar pagado antes de iniciar el primer partido de la jornada; de lo contrario, la jugada será borrada del listado.</p>
              <p><strong className="text-blue-400">2. Correcciones:</strong> Revise bien su jugada. Los cambios aplican SOLO ANTES de la hora de cierre. Iniciada la jornada, su quiniela participa tal cual fue registrada.</p>
              <p><strong className="text-blue-400">3. Suspendidos / Aplazados:</strong> Si el partido ya había iniciado al momento de suspenderse, será válido el marcador de ese momento. Si el partido no inició, automáticamente se declara Empate a 0.</p>
              <p><strong className="text-blue-400">4. Resultados Finales:</strong> Todos los resultados son válidos al terminar los 90 minutos del tiempo reglamentario (no se cuentan tiempos extra ni penales).</p>
              <p><strong className="text-blue-400">5. Bolsa de Premios:</strong> El 80% de lo recaudado se destina a la bolsa de premios a repartir y el 20% a gastos administrativos de CiberTeque.</p>
              <p className="italic text-slate-500">Al participar en CiberTeque se entiende que conoce y acepta todos los puntos mencionados anteriormente.</p>
            </div>
            <button onClick={() => { setAceptoReglas(true); setMostrarReglas(false); }} className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase tracking-wider text-xs transition-all shadow-lg">Entendido y Aceptado</button>
          </div>
        </div>
      )}

    </div>
  )
}