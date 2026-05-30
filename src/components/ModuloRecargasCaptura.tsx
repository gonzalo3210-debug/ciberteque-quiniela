'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ModuloRecargasCapturaProps {
  vista: 'recargas' | 'captura';
  actualizarSaldoGlobal?: (id: string, nuevo: number) => void;
}

export default function ModuloRecargasCaptura({ vista, actualizarSaldoGlobal }: ModuloRecargasCapturaProps) {
  // --- ESTADOS VENTAS (Antes Recargas) ---
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [historialActivo, setHistorialActivo] = useState<string | null>(null)
  const [datosHistorial, setDatosHistorial] = useState<any[]>([])

  // --- ESTADOS CAPTURA FÍSICA ---
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([])
  const [quiniela, setQuiniela] = useState<any>(null)
  const [partidos, setPartidos] = useState<any[]>([])
  const [equipos, setEquipos] = useState<any[]>([])
  
  const [capTelefono, setCapTelefono] = useState('')
  const [capNombre, setCapNombre] = useState('')
  const [capUsuarioId, setCapUsuarioId] = useState<string | null>(null)
  const [capSelecciones, setCapSelecciones] = useState<Record<string, string>>({})
  const [capGoles, setCapGoles] = useState('')
  const [guardandoCaptura, setGuardandoCaptura] = useState(false)
  const [linkWaReciente, setLinkWaReciente] = useState<string | null>(null)
  const [ticketAImprimir, setTicketAImprimir] = useState<any>(null)

  // --- EFECTOS ---
  useEffect(() => {
    cargarEquiposDB()
    cargarPartidosJornada()
  }, [])

  // --- FUNCIONES COMUNES ---
  const cargarEquiposDB = async () => {
    const { data: eq } = await supabase.from('equipos').select('nombre, logo_url')
    if (eq) setEquipos(eq)
  }

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    const equipo = equipos.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || null
  }

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const d = new Date(fechaDB.substring(0, 16));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  // --- FUNCIONES VENTAS ---
  const buscarUsuarios = async () => {
    if (!busqueda) return
    setCargando(true)
    const { data } = await supabase.from('usuarios').select('*').or(`nombre.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`).limit(5)
    if (data) setUsuarios(data)
    setCargando(false)
  }

  const verHistorial = async (usuarioId: string, forceRefresh = false) => {
    if (historialActivo === usuarioId && !forceRefresh) { setHistorialActivo(null); return }
    setHistorialActivo(usuarioId)
    const { data } = await supabase.from('transacciones_creditos').select('*').eq('usuario_id', usuarioId).order('created_at', { ascending: false }).limit(15)
    if (data) setDatosHistorial(data)
  }

  const recargarCreditos = async (usuarioId: string, saldoActual: number, cantidad: number) => {
    const nuevoSaldo = saldoActual + cantidad
    const { error } = await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioId)
    if (!error) {
      await supabase.from('transacciones_creditos').insert([{ 
        usuario_id: usuarioId, 
        cantidad: cantidad, 
        tipo_movimiento: 'recarga_manual',
        descripcion: 'Venta en mostrador' 
      }])
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuarioId, nuevoSaldo)
      await buscarUsuarios() 
      if (historialActivo === usuarioId) await verHistorial(usuarioId, true)
      alert('¡Venta registrada con éxito!')
    }
  }

  // --- FUNCIONES CAPTURA ---
  const cargarPartidosJornada = async () => {
    const { data: abiertas } = await supabase
      .from('quinielas')
      .select('id, nombre_jornada, precio_ticket, fecha_cierre, estado, partidos (id, equipo_local, equipo_visitante, resultado_real)')
      .eq('estado', 'abierta')
      .order('fecha_cierre', { ascending: true })
      
    if (abiertas && abiertas.length > 0) {
      setQuinielasAbiertas(abiertas)
      setQuiniela(abiertas[0])
      setPartidos(abiertas[0].partidos || [])
    }
  }

  const seleccionarQuiniela = (qa: any) => {
    setQuiniela(qa)
    setPartidos(qa.partidos || [])
  }

  const buscarClienteParaCaptura = async (tel: string) => {
    setLinkWaReciente(null) 
    setTicketAImprimir(null)
    setCapTelefono(tel)
    if (tel && tel.length >= 10) {
      const { data } = await supabase.from('usuarios').select('id, nombre').eq('telefono', tel).single()
      if (data) { setCapUsuarioId(data.id); setCapNombre(data.nombre) } 
      else { setCapUsuarioId(null); setCapNombre('') }
    } else {
      setCapUsuarioId(null); setCapNombre('')
    }
  }

  const seleccionarOpcionCaptura = (partidoId: string, opcion: string) => {
    setCapSelecciones({ ...capSelecciones, [partidoId]: opcion })
  }

  const guardarCapturaFisica = async () => {
    if (!capTelefono || !capNombre || !capGoles || !quiniela) return alert('Faltan datos.')
    setGuardandoCaptura(true)
    
    try {
      let uid = capUsuarioId
      let creditosActuales = 0

      if (!uid) {
        const { data: nu } = await supabase.from('usuarios').insert([{ nombre: capNombre, telefono: capTelefono, creditos_disponibles: 0 }]).select().single()
        uid = nu.id
      } else {
        const { data: eu } = await supabase.from('usuarios').select('creditos_disponibles').eq('id', uid).single()
        if (eu) creditosActuales = eu.creditos_disponibles || 0
      }

      const esGratis = quiniela.precio_ticket === 0
      if (esGratis) {
        const { data: tp } = await supabase.from('tickets').select('id').eq('usuario_id', uid).eq('quiniela_id', quiniela.id)
        if (tp && tp.length > 0) {
          alert(`⚠️ ALERTA: ${capNombre} ya tiene un boleto registrado para esta jornada gratuita. Solo se permite 1 jugada por persona.`)
          setGuardandoCaptura(false)
          return 
        }
      }

      const seleccionesFinales = { ...capSelecciones }
      partidos.forEach(p => { if (!seleccionesFinales[p.id]) seleccionesFinales[p.id] = 'E' })
      
      const precio = quiniela.precio_ticket ?? 1 
      let nuevoSaldo = creditosActuales

      if (precio > 0) {
        if (creditosActuales >= precio) {
          nuevoSaldo = creditosActuales - precio
          await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', uid)
        } else {
          const faltante = precio - creditosActuales
          await supabase.from('transacciones_creditos').insert([{ 
            usuario_id: uid, cantidad: faltante, tipo_movimiento: 'recarga_manual', descripcion: 'Pago en mostrador (Físico)' 
          }])
          nuevoSaldo = 0
          await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', uid)
        }

        await supabase.from('transacciones_creditos').insert([{ 
          usuario_id: uid, cantidad: -precio, tipo_movimiento: 'juego_ticket_fisico', descripcion: `Ticket físico ${quiniela.nombre_jornada}` 
        }])
      }

      const { data: tk } = await supabase.from('tickets').insert([{ usuario_id: uid, quiniela_id: quiniela.id, metodo_ingreso: 'fisico', prediccion_goles_total: parseInt(capGoles) }]).select().single()
      
      const prons = Object.keys(seleccionesFinales).map(pId => ({ ticket_id: tk.id, partido_id: pId, eleccion_usuario: seleccionesFinales[pId] }))
      await supabase.from('pronosticos').insert(prons)
      
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(uid, nuevoSaldo)

      let seleccionesTexto = '';
      partidos.forEach(p => {
        const sel = seleccionesFinales[p.id];
        const pick = sel === 'L' ? p.equipo_local : sel === 'V' ? p.equipo_visitante : 'Empate';
        seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
      });

      const msgWa = `🎫 *QUINIELA CIBERTEQUE*\nHola ${capNombre}, tu jugada para *${quiniela.nombre_jornada}* se guardó correctamente.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate (Goles): *${capGoles}*\n\n🔍 Entra a la plataforma en la sección "Mis Jugadas" para verificar tu boleto. Si notas algún error en la captura, avísanos antes de la hora de cierre para corregirlo.\n\n🍀 ¡Mucha suerte!`;
      
      setLinkWaReciente(`https://wa.me/52${capTelefono}?text=${encodeURIComponent(msgWa)}`)
      
      setTicketAImprimir({ nombre: capNombre, telefono: capTelefono, selecciones: seleccionesFinales, goles: capGoles })
      
      alert('🎟️ ¡Boleto guardado con éxito!')
      setCapTelefono(''); setCapNombre(''); setCapSelecciones({}); setCapGoles(''); 
    } catch (e: any) { alert(e.message) } finally { setGuardandoCaptura(false) }
  }

  const capturaCerradaPorFecha = quiniela && quiniela.fecha_cierre ? new Date() > new Date(quiniela.fecha_cierre.substring(0, 16)) : false;
  const capturaCerradaPorResultados = (partidos || []).some(p => p.resultado_real !== null);
  const bloqueoCapturaAdmin = capturaCerradaPorFecha || capturaCerradaPorResultados;

  return (
    <>
      {/* VISTA: VENTAS */}
      {vista === 'recargas' && (
        <div className="animate-in fade-in duration-300 w-full max-w-2xl mx-auto space-y-4">
          <div className="flex gap-2">
           <input 
             type="text" 
             placeholder="Buscar cliente (Nombre o WhatsApp)..." 
             className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-[10px] md:text-xs text-white outline-none focus:border-green-500 transition-all uppercase font-bold tracking-widest placeholder:text-slate-600" 
             value={busqueda} 
             onChange={(e) => setBusqueda(e.target.value)} 
             onKeyDown={(e) => e.key === 'Enter' && buscarUsuarios()} 
           />
           <button onClick={buscarUsuarios} className="bg-green-600 hover:bg-green-500 px-5 md:px-8 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs tracking-widest transition-all shadow-[0_0_15px_rgba(22,163,74,0.3)]">
             Buscar
           </button>
         </div>
         
          <div className="space-y-3">
            {(usuarios || []).map(u => (
              <div key={u.id} className="bg-slate-900/80 p-3 md:p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <p className="font-black text-white text-xs md:text-sm uppercase tracking-tight">{u.nombre}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] text-slate-400 font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{u.telefono}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] uppercase text-slate-500 font-bold">Saldo:</span>
                        <span className="text-green-400 font-black text-sm drop-shadow-[0_0_5px_rgba(74,222,128,0.2)]">{u.creditos_disponibles}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                    <button onClick={() => verHistorial(u.id)} className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase transition-all text-slate-300 border border-slate-700 flex-1 md:flex-none">
                      📜 Historial
                    </button>
                    <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 1)} className="bg-green-950 hover:bg-green-900 border border-green-700/50 text-green-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex-1 md:flex-none">+1</button>
                    <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 5)} className="bg-green-800 hover:bg-green-700 border border-green-600/50 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex-1 md:flex-none">+5</button>
                    <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 10)} className="bg-green-600 hover:bg-green-500 border border-green-500/50 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-[0_0_10px_rgba(22,163,74,0.3)] flex-1 md:flex-none">+10</button>
                  </div>
                </div>

                {historialActivo === u.id && (
                  <div className="mt-3 pt-3 border-t border-slate-800 animate-in slide-in-from-top-2">
                    <div className="max-h-[250px] overflow-y-auto pr-1">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="uppercase bg-slate-950/80 text-[8px] md:text-[9px] text-slate-500 tracking-widest sticky top-0">
                            <th className="p-2 border-b border-slate-800 w-1/4">Fecha</th>
                            <th className="p-2 border-b border-slate-800 w-2/4">Concepto</th>
                            <th className="p-2 border-b border-slate-800 text-center w-[12%]">Cant</th>
                            <th className="p-2 border-b border-slate-800 text-right w-[13%]">Saldo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {(() => {
                            let saldoAcumulado = u.creditos_disponibles;
                            return datosHistorial.map((mov: any) => {
                              const saldoEnEseMomento = saldoAcumulado;
                              saldoAcumulado -= mov.cantidad; 
                              
                              const conceptoLimpio = mov.descripcion || (mov.tipo_movimiento === 'recarga_manual' ? 'Venta' : mov.tipo_movimiento.replace(/_/g, ' '));
                              
                              return (
                                <tr key={mov.id} className="hover:bg-slate-800/30 transition-colors">
                                  <td className="p-2 text-[9px] md:text-[10px] text-slate-400 font-mono">{new Date(mov.created_at).toLocaleDateString()}</td>
                                  <td className="p-2 text-[9px] md:text-[10px] text-slate-300 font-bold uppercase truncate max-w-[120px] md:max-w-[200px]">{conceptoLimpio}</td>
                                  <td className={`p-2 text-center font-black text-[10px] md:text-xs ${mov.cantidad > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {mov.cantidad > 0 ? '+' : ''}{mov.cantidad}
                                  </td>
                                  <td className="p-2 text-right font-black text-[10px] md:text-xs text-blue-400">{saldoEnEseMomento}</td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                      {datosHistorial.length === 0 && <p className="text-center text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-4 py-4 bg-slate-950/50 rounded-lg">No hay movimientos recientes.</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISTA: CAPTURA FÍSICA */}
      {vista === 'captura' && (
        <div className="animate-in fade-in duration-300 w-full max-w-3xl mx-auto">
          {quinielasAbiertas.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
              {quinielasAbiertas.map(qa => (
                <button key={qa.id} onClick={() => seleccionarQuiniela(qa)} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${quiniela?.id === qa.id ? 'bg-amber-500 text-slate-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                  {qa.nombre_jornada}
                </button>
              ))}
            </div>
          )}

          {!quiniela ? (
            <p className="text-center text-slate-500 py-10 text-[10px] font-bold uppercase tracking-widest bg-slate-900/50 rounded-xl border border-slate-800">No hay jornada activa para capturar.</p>
          ) : (
            <div className="bg-gradient-to-br from-amber-950/20 to-slate-900 border border-amber-900/40 rounded-2xl p-4 md:p-6 shadow-[0_0_20px_rgba(245,158,11,0.05)] relative overflow-hidden">
              {bloqueoCapturaAdmin && (
                <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center border border-red-900/50 rounded-2xl">
                  <span className="text-5xl mb-3">🛑</span>
                  <h2 className="text-xl font-black text-red-500 uppercase tracking-widest mb-1">Captura Bloqueada</h2>
                  <p className="text-slate-400 font-bold text-[10px] uppercase">
                    {capturaCerradaPorResultados ? 'Ya se ingresaron resultados reales.' : 'La fecha de cierre ha expirado.'}
                  </p>
                </div>
              )}
              
              <div className="mb-5 border-b border-amber-900/30 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="text-amber-500 font-black uppercase tracking-widest text-sm md:text-base flex items-center gap-2"><span>⚡</span> Captura Física</h3>
                  <p className="text-[9px] md:text-[10px] text-amber-500/50 uppercase font-bold mt-0.5">{quiniela.nombre_jornada}</p>
                </div>
              </div>

              {linkWaReciente && (
                <div className="mb-5 bg-green-950/40 border border-green-600/50 p-3 rounded-xl text-center shadow-[0_0_15px_rgba(22,163,74,0.1)] animate-in zoom-in-95">
                  <p className="text-green-400 font-black text-[10px] uppercase tracking-widest mb-2">✅ Captura Guardada</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                    <a href={linkWaReciente} target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-500 text-white font-black px-4 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all shadow-md w-full sm:w-auto">
                      📲 Enviar WhatsApp
                    </a>
                    <button onClick={() => window.print()} className="bg-white hover:bg-slate-200 text-green-950 font-black px-4 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all shadow-md w-full sm:w-auto">
                      🖨️ Imprimir Recibo
                    </button>
                  </div>
                  <button onClick={() => { setLinkWaReciente(null); setTicketAImprimir(null); }} className="block mx-auto mt-3 text-[9px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest underline">Nueva Captura</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                <div>
                  <label className="text-[9px] md:text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mb-1.5 block">WhatsApp</label>
                  <input type="text" placeholder="10 dígitos..." value={capTelefono} onChange={(e) => buscarClienteParaCaptura(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-amber-500 font-mono text-sm transition-all placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-[9px] md:text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mb-1.5 block">Nombre del Cliente</label>
                  <input type="text" placeholder="Ej. Juan Pérez" value={capNombre} onChange={(e) => setCapNombre(e.target.value)} className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-white outline-none font-bold uppercase text-xs transition-all placeholder:text-slate-600 ${capUsuarioId ? 'border-green-900/50 text-green-400' : 'border-slate-700 focus:border-amber-500'}`} disabled={capUsuarioId !== null} />
                </div>
              </div>
              
              <div className="space-y-1.5 mb-5">
                {(partidos || []).map((p) => {
                  const logoL = obtenerLogo(p.equipo_local)
                  const logoV = obtenerLogo(p.equipo_visitante)
                  
                  return (
                    <div key={p.id} className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2 hover:border-slate-600 transition-colors">
                      <div className="flex-1 w-full flex justify-between sm:justify-center items-center text-[10px] md:text-xs font-bold uppercase tracking-wide gap-2">
                        <div className="flex items-center justify-end gap-1.5 flex-1">
                          <span className="text-right text-slate-300 truncate">{p.equipo_local}</span>
                          {logoL ? <img src={logoL} alt="" className="w-5 h-5 object-contain opacity-80" /> : <div className="w-5 h-5 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[7px] text-slate-500">?</div>}
                        </div>
                        <span className="text-center text-slate-600 text-[8px] font-black w-3">VS</span>
                        <div className="flex items-center justify-start gap-1.5 flex-1">
                          {logoV ? <img src={logoV} alt="" className="w-5 h-5 object-contain opacity-80" /> : <div className="w-5 h-5 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[7px] text-slate-500">?</div>}
                          <span className="text-left text-slate-300 truncate">{p.equipo_visitante}</span>
                        </div>
                      </div>
                      
                      <div className="w-full sm:w-[110px] flex gap-1 shrink-0">
                        {['L', 'E', 'V'].map(opc => (
                          <button key={opc} onClick={() => seleccionarOpcionCaptura(p.id, opc)} className={`flex-1 py-1.5 rounded text-[10px] md:text-xs font-black border transition-all ${capSelecciones[p.id] === opc ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-inner' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>{opc}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between border-t border-amber-900/30 pt-4">
                <div className="w-full md:w-[150px] bg-slate-950/40 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
                  <label className="text-[8px] md:text-[9px] text-amber-500 font-bold uppercase tracking-widest leading-tight">Total Goles:</label>
                  <input type="number" placeholder="00" value={capGoles} onChange={(e) => setCapGoles(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-lg font-black text-white focus:border-amber-500 outline-none transition-all" />
                </div>
                <button onClick={guardarCapturaFisica} disabled={guardandoCaptura} className={`w-full md:w-auto flex-1 py-3 px-4 rounded-xl font-black uppercase text-[10px] md:text-xs tracking-widest transition-all shadow-lg ${guardandoCaptura ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-amber-900/20 active:scale-95'}`}>
                  {guardandoCaptura ? 'Procesando...' : '💾 Guardar Ticket'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- ESTILOS DE IMPRESIÓN FULL-PAGE --- */}
      <style>{`
        @media print {
          @page { margin: 0mm; size: letter; }
          body { background: white; margin: 0; padding: 0; }
          body * { visibility: hidden !important; }
          .zona-impresion, .zona-impresion * { visibility: visible !important; }
          .zona-impresion { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            height: 100% !important;
            margin: 0 !important; 
            padding: 15px !important; 
            box-sizing: border-box !important;
            background-color: white !important;
          }
        }
      `}</style>

      {/* TICKET GIGANTE PARA IMPRESIÓN/CAPTURA */}
      {quiniela && ticketAImprimir && (
        <div className="hidden print:flex print:flex-col print:items-center print:w-full print:h-full print:bg-white print:text-black zona-impresion z-[99999]">
          <div className="w-full h-full border-4 border-black rounded-3xl p-6 bg-white flex flex-col justify-between">
            <div>
              <div className="text-center mb-6">
                <h1 className="font-black text-4xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                <p className="text-lg font-bold uppercase tracking-widest border-b-4 border-blue-900 inline-block pb-1 mt-2 text-blue-900">RECIBO DE JUGADA</p>
                <div className="mt-4 text-sm font-black uppercase bg-blue-900 text-white py-2 px-4 rounded-lg inline-block">Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}</div>
              </div>
              <h2 className="text-center font-black text-2xl uppercase mb-6 bg-amber-400 py-2 border-y-4 border-black text-black">{quiniela.nombre_jornada}</h2>
              
              <div className="mb-6 space-y-3">
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-2">
                  <span className="font-bold text-lg uppercase">Nombre:</span>
                  <span className="font-black text-xl uppercase">{ticketAImprimir.nombre}</span>
                </div>
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-2">
                  <span className="font-bold text-lg uppercase">WhatsApp:</span>
                  <span className="font-black text-xl uppercase">{ticketAImprimir.telefono}</span>
                </div>
              </div>
              
              <table className="w-full text-base mb-6 border-collapse table-fixed">
                <thead>
                  <tr className="bg-blue-900 text-white text-xs uppercase">
                    <th className="border-4 border-black p-2 text-right w-[40%]">Local</th>
                    <th className="border-4 border-black p-2 text-center w-[6%]">L</th>
                    <th className="border-4 border-black p-2 text-center w-[6%]">E</th>
                    <th className="border-4 border-black p-2 text-center w-[6%]">V</th>
                    <th className="border-4 border-black p-2 text-left w-[40%]">Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {(partidos || []).map((p) => {
                    const logoL = obtenerLogo(p.equipo_local)
                    const logoV = obtenerLogo(p.equipo_visitante)
                    return (
                      <tr key={p.id}>
                        <td className="border-4 border-black p-2 text-right overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold uppercase text-xs truncate max-w-[80%]">{p.equipo_local}</span>
                            {logoL ? <img src={logoL} alt="" className="w-6 h-6 object-contain" /> : <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-[8px]">?</div>}
                          </div>
                        </td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{ticketAImprimir.selecciones[p.id] === 'L' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{ticketAImprimir.selecciones[p.id] === 'E' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{ticketAImprimir.selecciones[p.id] === 'V' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-2 text-left overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-start gap-2">
                            {logoV ? <img src={logoV} alt="" className="w-6 h-6 object-contain" /> : <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-[8px]">?</div>}
                            <span className="font-bold uppercase text-xs truncate max-w-[80%]">{p.equipo_visitante}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              
              <div className="border-4 border-black p-4 text-center rounded-2xl bg-gray-100 mt-6 flex justify-between items-center px-6">
                <span className="font-bold uppercase text-sm">Desempate (Goles):</span>
                <span className="font-black text-3xl">{ticketAImprimir.goles}</span>
              </div>
              <p className="text-center text-sm font-bold uppercase mt-6 text-blue-900">Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
            </div>
            
            <div className="mt-6 pt-6 border-t-2 border-black border-dashed">
              <p className="text-[9px] text-justify leading-tight font-bold uppercase text-black"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}