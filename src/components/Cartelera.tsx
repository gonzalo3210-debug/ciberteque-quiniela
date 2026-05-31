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

  // 🔥 ESTADOS PARA REGLAMENTO Y RESTRICCIONES
  const [mostrarReglas, setMostrarReglas] = useState(false) 
  const [aceptoReglas, setAceptoReglas] = useState(false) 
  const [yaParticipo, setYaParticipo] = useState(false) 

  useEffect(() => {
    async function cargarJornadas() {
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
        await cambiarQuinielaVisible(qData[0]) 
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

  const cambiarQuinielaVisible = async (quiniela: any) => {
    setQuinielaActual(quiniela)
    
    // 🔥 ACOMODAR PARTIDOS POR FECHA Y HORA (Orden Cronológico)
    const partidosAcomodados = [...(quiniela.partidos || [])].sort((a: any, b: any) => {
      if (!a.fecha_hora) return 1;
      if (!b.fecha_hora) return -1;
      return new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime();
    });
    
    setPartidos(partidosAcomodados)
    setSelecciones({}) 
    setGolesTotales('')
    setAceptoReglas(false) 

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

    const { data: ticketsPrevios } = await supabase
      .from('tickets')
      .select('id')
      .eq('usuario_id', usuarioActivo.id)
      .eq('quiniela_id', quiniela.id)

    setYaParticipo(ticketsPrevios && ticketsPrevios.length > 0 ? true : false)
  }

  const esGratis = quinielaActual?.precio_ticket === 0;
  const bloqueadoPorParticipacion = esGratis && yaParticipo;

  const seleccionarOpcion = (partidoId: string, opcion: string) => {
    if (estaCerrada || bloqueadoPorParticipacion) return 
    setSelecciones({ ...selecciones, [partidoId]: opcion })
  }

  const guardarQuiniela = async () => {
    if (estaCerrada) return alert('La jornada está cerrada.')
    if (bloqueadoPorParticipacion) return alert('Solo se permite 1 participación por usuario en quinielas gratuitas.')
    if (!aceptoReglas) return alert('Debes leer y aceptar el reglamento oficial para enviar tu boleto.')
    if (golesTotales === '') {
      alert('¡Falta información! Por favor, anota el total de goles para el desempate.')
      return
    }

    const costoTicket = quinielaActual?.precio_ticket || 0

    if (costoTicket > 0 && usuarioActivo.creditos_disponibles < costoTicket) {
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

      if (costoTicket > 0) {
        const nuevoSaldo = usuarioActivo.creditos_disponibles - costoTicket
        await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioActivo.id)

        await supabase.from('transacciones_creditos').insert([{
          usuario_id: usuarioActivo.id,
          cantidad: -costoTicket,
          tipo_movimiento: 'juego_ticket',
          descripcion: `Ticket ${quinielaActual.nombre_jornada}`
        }])
        actualizarSaldo(nuevoSaldo)
      }

      setSelecciones({}) 
      setGolesTotales('')
      setAceptoReglas(false)
      
      if (esGratis) setYaParticipo(true)

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

  if (cargando) return <div className="text-blue-400 animate-pulse text-center mt-10 font-bold uppercase text-xs">Cargando...</div>
  if (!quinielaActual) return <div className="text-slate-500 italic text-center mt-10 text-sm">No hay quinielas abiertas actualmente.</div>

  const prem = quinielaActual.tipo_premiacion || 'unico';

  return (
    <div className="w-full max-w-4xl mt-2 mb-20 animate-in fade-in duration-500 relative">
      
      {/* SELECTOR DE QUINIELAS */}
      {quinielasActivas.length > 1 && (
        <div className="flex flex-wrap gap-2 justify-center mb-4 bg-slate-900/80 p-2 rounded-2xl border border-slate-800 shadow-xl">
          {quinielasActivas.map(q => (
            <button
              key={q.id}
              onClick={() => cambiarQuinielaVisible(q)}
              className={`px-4 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all ${
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
      <div className="bg-slate-900/50 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        {estaCerrada && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center border border-red-900/50 rounded-2xl">
            <span className="text-6xl mb-4">🔒</span>
            <h2 className="text-3xl font-black text-red-500 uppercase tracking-widest mb-2 shadow-black drop-shadow-md">Jornada Cerrada</h2>
            <p className="text-slate-300 font-bold text-sm uppercase max-w-md">{motivoCierre}</p>
          </div>
        )}

        <div className="text-center mb-6 border-b border-slate-800 pb-4 relative">
          
          <button onClick={() => setMostrarReglas(true)} className="absolute top-0 right-0 bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[9px] md:text-[10px] font-black uppercase px-2 py-1.5 rounded-lg transition-all shadow-inner">
            📜 Reglas
          </button>

          <h2 className="text-2xl md:text-3xl font-black text-white uppercase italic pr-16 md:pr-24 text-left md:text-center">{quinielaActual.nombre_jornada}</h2>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <span className="bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              Costo: {esGratis ? 'GRATIS (1 MÁX)' : `${quinielaActual.precio_ticket} ${quinielaActual.precio_ticket === 1 ? 'Crédito' : 'Créditos'}`}
            </span>
            <span className="bg-purple-950/40 border border-purple-900/50 text-purple-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              🏆 Premiación: {
                prem === 'unico' ? 'Ganador Único' : 
                prem === 'top2' ? 'Top 2' : 
                prem === 'top3' ? 'Top 3' :
                prem === 'promo_unico' ? 'Promo: 1er (1 Cr)' :
                prem === 'promo_top2' ? 'Promo: Top 2 (1 Cr c/u)' : 
                'Ganador Único'
              }
            </span>
          </div>

          <div className="mt-3 mb-1 inline-block bg-red-950/40 border border-red-900/60 text-red-400 px-3 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-inner">
            ⏳ Cierre: {formatearFechaLocal(quinielaActual.fecha_cierre)}
          </div>
        </div>

        {/* LISTA DE PARTIDOS SUPER COMPACTA */}
        <div className="space-y-2 md:space-y-3">
          {partidos.map((partido) => {
            const seleccion = selecciones[partido.id]
            const logoL = obtenerLogo(partido.equipo_local)
            const logoV = obtenerLogo(partido.equipo_visitante)
            const fechaObj = formatearFechaObj(partido.fecha_hora)

            return (
              <div key={partido.id} className={`bg-slate-800/60 px-3 py-2.5 md:p-3 rounded-lg border flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 transition-all shadow-sm relative group ${bloqueadoPorParticipacion ? 'border-slate-800 opacity-60' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/90'}`}>
                
                {/* HORARIO */}
                <div className="w-full md:w-[80px] text-center md:text-left border-b md:border-b-0 md:border-r border-slate-700/50 pb-2 md:pb-0 md:pr-3 flex md:block justify-center items-center gap-2 shrink-0">
                  {fechaObj ? (
                    <>
                      <span className="block text-blue-400 font-black text-[10px] uppercase tracking-widest">{fechaObj.fecha}</span>
                      <span className="block text-slate-400 font-bold text-[9px] mt-0.5">{fechaObj.hora}</span>
                    </>
                  ) : (
                    <span className="block text-slate-500 text-[9px] uppercase tracking-widest">Definir</span>
                  )}
                </div>

                {/* EQUIPOS */}
                <div className="flex-1 w-full flex justify-between md:justify-center items-center text-[11px] md:text-xs font-bold uppercase tracking-wide gap-2 md:gap-4">
                  <div className="flex items-center justify-end gap-2 flex-1">
                    <span className="text-right text-slate-200 truncate leading-tight">{partido.equipo_local}</span>
                    {logoL ? <img src={logoL} alt={partido.equipo_local} className="w-6 h-6 md:w-8 md:h-8 object-contain drop-shadow-md shrink-0" /> : <div className="w-6 h-6 md:w-8 md:h-8 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-500 shrink-0">?</div>}
                  </div>
                  
                  <span className="text-center text-slate-600 text-[9px] font-black shrink-0 w-4">VS</span>
                  
                  <div className="flex items-center justify-start gap-2 flex-1">
                    {logoV ? <img src={logoV} alt={partido.equipo_visitante} className="w-6 h-6 md:w-8 md:h-8 object-contain drop-shadow-md shrink-0" /> : <div className="w-6 h-6 md:w-8 md:h-8 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-500 shrink-0">?</div>}
                    <span className="text-left text-slate-200 truncate leading-tight">{partido.equipo_visitante}</span>
                  </div>
                </div>

                {/* BOTONES */}
                <div className="w-full md:w-[130px] shrink-0 mt-1 md:mt-0">
                  <div className="flex gap-1 md:gap-1.5 w-full">
                    {['L', 'E', 'V'].map((opc) => (
                      <button 
                        key={opc}
                        onClick={() => seleccionarOpcion(partido.id, opc)}
                        disabled={estaCerrada || bloqueadoPorParticipacion}
                        className={`flex-1 py-1.5 md:py-2 rounded text-xs font-black transition-all border shadow-sm ${
                          seleccion === opc 
                          ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)] md:scale-105' 
                          : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                        } ${(estaCerrada || bloqueadoPorParticipacion) ? 'cursor-not-allowed' : ''}`}
                      >
                        {opc}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )
          })}
        </div>

        <div className={`mt-8 mb-5 p-4 bg-blue-950/40 border border-blue-900/50 rounded-2xl max-w-[280px] mx-auto text-center shadow-xl z-10 relative ${bloqueadoPorParticipacion ? 'opacity-60' : ''}`}>
          <label className="block text-blue-400 font-black uppercase text-[9px] md:text-[10px] tracking-[0.2em] mb-1">Criterio Desempate</label>
          <p className="text-slate-400 text-[8px] md:text-[9px] uppercase mb-3 font-bold tracking-tight">Total de goles en la jornada</p>
          <input 
            type="number"
            placeholder="00"
            value={golesTotales}
            onChange={(e) => setGolesTotales(e.target.value)}
            disabled={estaCerrada || bloqueadoPorParticipacion}
            className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-center text-3xl font-black text-white focus:border-blue-500 outline-none transition-all ${(estaCerrada || bloqueadoPorParticipacion) ? 'cursor-not-allowed text-slate-500' : ''}`}
          />
        </div>

        <div className="w-full max-w-[280px] mx-auto flex items-start gap-2 mb-5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
          <input 
            type="checkbox" 
            id="check-reglas" 
            checked={aceptoReglas} 
            onChange={(e) => setAceptoReglas(e.target.checked)} 
            disabled={estaCerrada || bloqueadoPorParticipacion} 
            className={`mt-0.5 w-3.5 h-3.5 accent-green-600 rounded border-slate-700 bg-slate-900 cursor-pointer ${(estaCerrada || bloqueadoPorParticipacion) ? 'cursor-not-allowed opacity-50' : ''}`} 
          />
          <label htmlFor="check-reglas" className={`text-[9px] font-bold uppercase tracking-wide text-slate-400 select-none ${(estaCerrada || bloqueadoPorParticipacion) ? '' : 'cursor-pointer'}`}>
            He leído las <span onClick={(e) => { e.preventDefault(); setMostrarReglas(true); }} className="text-blue-400 underline hover:text-blue-300 cursor-pointer">reglas oficiales</span> y acepto los criterios.
          </label>
        </div>

        <div className="flex flex-col items-center pt-2 border-t border-slate-800 z-10 relative">
          <button 
            onClick={guardarQuiniela}
            disabled={guardando || estaCerrada || !aceptoReglas || bloqueadoPorParticipacion}
            className={`w-full max-w-[280px] py-3 md:py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
              bloqueadoPorParticipacion 
              ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700 shadow-inner' 
              : (guardando || estaCerrada || !aceptoReglas)
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105 active:scale-95'
            }`}
          >
            {bloqueadoPorParticipacion ? 'YA PARTICIPASTE (MÁX 1)' : guardando ? 'Guardando...' : 'Confirmar Jugada'}
          </button>
        </div>
      </div>

      {/* MODAL DEL REGLAMENTO REESTRUCTURADO Y COMPACTO */}
      {mostrarReglas && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5 mb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2 uppercase tracking-tight"><span>📜</span> Reglamento CiberTeque</h3>
              <button onClick={() => setMostrarReglas(false)} className="text-slate-500 hover:text-slate-300 font-bold font-mono text-lg">✕</button>
            </div>
            
            {/* CONTENEDOR CON SCROLL ULTRA COMPACTO */}
            <div className="space-y-3.5 text-[10px] md:text-xs text-slate-300 font-medium leading-relaxed uppercase tracking-wide max-h-[300px] md:max-h-[380px] overflow-y-auto pr-1">
              <div>
                <strong className="text-blue-400 block mb-0.5">1️⃣ Cierre y Correcciones:</strong>
                <span className="text-slate-400 block pl-2 font-bold mb-1">• Boletos Digitales (App):</span>
                <span className="normal-case text-slate-300 pl-4 block leading-normal">Tu jugada es tu responsabilidad. Una vez confirmada tu jugada en la aplicación, <span className="text-amber-400 font-bold">no hay cambios ni correcciones posibles</span>. Asegúrate de revisarla bien antes de finalizar.</span>
                <span className="text-slate-400 block pl-2 font-bold mt-1.5 mb-1">• Boletos Físicos:</span>
                <span className="normal-case text-slate-300 pl-4 block leading-normal">Se reciben a más tardar un día antes de la fecha de cierre a las 8:00 P.M. Si detectas un error en la captura realizada por el personal de CiberTeque, debe reportarse inmediatamente antes del cierre para su corrección.</span>
              </div>

              <p>
                <strong className="text-blue-400 block mb-0.5">2️⃣ Tiempo Reglamentario (90 Min):</strong>
                <span className="normal-case leading-normal block text-slate-300">Para los pronósticos, solo cuentan los 90 minutos reglamentarios (incluyendo el tiempo agregado por el árbitro). NO cuentan los tiempos extras ni las tandas de penales.</span>
              </p>

              <p>
                <strong className="text-blue-400 block mb-0.5">3️⃣ Partidos Aplazados o Suspendidos:</strong>
                <span className="normal-case leading-normal block text-slate-300">Si un partido se suspende después de haber iniciado, se toma como válido el marcador que tenía en ese momento. Si un partido se cancela o aplaza antes de iniciar, para fines de la quiniela se declarará como Empate (E).</span>
              </p>

              <p>
                <strong className="text-blue-400 block mb-0.5">4️⃣ Criterios de Desempate:</strong>
                <span className="normal-case leading-normal block text-slate-300">El ganador se define por quién tenga más aciertos. Si dos o más jugadores empatan en puntos, el desempate se decide por la predicción de goles totales de la jornada (quien se acerque más al número real).</span>
              </p>

              <div>
                <strong className="text-blue-400 block mb-0.5">5️⃣ Empates Perfectos (Bolsa Compartida):</strong>
                <span className="normal-case text-slate-300 block leading-normal"><span className="text-amber-500 font-bold uppercase text-[9px] tracking-wider block mt-0.5">💸 En quinielas de paga:</span> Se sumarán las bolsas de los lugares ocupados y se dividirá el dinero en partes iguales.</span>
                <span className="normal-case text-slate-300 block leading-normal"><span className="text-amber-500 font-bold uppercase text-[9px] tracking-wider block mt-1">🎁 En quinielas Promocionales (Gratis):</span> Se respetará el premio completo (ej. 1 crédito) para todos los que empaten en el primer lugar.</span>
              </div>

              <p>
                <strong className="text-blue-400 block mb-0.5">6️⃣ Boletos Físicos VS Digitales:</strong>
                <span className="normal-case leading-normal block text-slate-300">Ambos tienen exactamente la misma validez. Si dejas tu boleto físico en CiberTeque, nosotros lo capturamos y aparecerás en el ranking web al igual que todos.</span>
              </p>

              <p>
                <strong className="text-amber-500 block mb-0.5">7️⃣ Actualización de Marcadores:</strong>
                <span className="normal-case leading-normal block text-slate-300">Procuramos reflejar los resultados al instante, pero la administración cuenta con un margen de tolerancia de hasta 24 horas posteriores al partido para su actualización oficial en el sistema.</span>
              </p>

              <p>
                <strong className="text-amber-500 block mb-0.5">8️⃣ Cierre y Premiación:</strong>
                <span className="normal-case leading-normal block text-slate-300">La validación final de la jornada y el pago de premios a los ganadores se realizará a más tardar el siguiente día hábil tras concluir el último encuentro de la quiniela.</span>
              </p>

              <p>
                <strong className="text-amber-500 block mb-0.5">9️⃣ Cancelación y Reembolsos:</strong>
                <span className="normal-case leading-normal block text-slate-300">En caso de fallas mayores en la plataforma o la cancelación oficial de más de la mitad de los partidos de la jornada, la quiniela será anulada y se reembolsarán íntegramente los créditos a todos los participantes.</span>
              </p>

              <p className="italic text-slate-500 mt-4 border-t border-slate-800 pt-2.5 text-[9px] md:text-[10px]">
                Al participar en CiberTeque se entiende que conoces y aceptas todos los puntos mencionados anteriormente.
              </p>
            </div>
            
            <button onClick={() => { setAceptoReglas(true); setMostrarReglas(false); }} className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl uppercase tracking-wider text-xs transition-all shadow-lg transform active:scale-95">Entendido y Aceptado</button>
          </div>
        </div>
      )}
    </div>
  )
}