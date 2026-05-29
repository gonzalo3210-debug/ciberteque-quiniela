'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ModuloRecargasCapturaProps {
  vista: 'recargas' | 'captura';
  actualizarSaldoGlobal?: (id: string, nuevo: number) => void;
}

export default function ModuloRecargasCaptura({ vista, actualizarSaldoGlobal }: ModuloRecargasCapturaProps) {
  // --- ESTADOS RECARGAS ---
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

  // --- ESTADOS IMPRESIÓN ---
  const [tipoImpresion, setTipoImpresion] = useState<'recibo' | null>(null)
  const [ticketAImprimir, setTicketAImprimir] = useState<any>(null)

  // --- EFECTOS ---
  useEffect(() => {
    cargarEquiposDB()
    cargarPartidosJornada()
    
    const handleAfterPrint = () => setTipoImpresion(null)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
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

  const activarImpresion = (tipo: 'recibo') => {
    setTipoImpresion(tipo)
    setTimeout(() => window.print(), 200)
  }

  // --- FUNCIONES RECARGAS ---
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
      await supabase.from('transacciones_creditos').insert([{ usuario_id: usuarioId, cantidad: cantidad, tipo_movimiento: 'recarga_manual' }])
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuarioId, nuevoSaldo)
      await buscarUsuarios() 
      if (historialActivo === usuarioId) await verHistorial(usuarioId, true)
      alert('¡Recarga exitosa!')
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
            usuario_id: uid, cantidad: faltante, tipo_movimiento: 'recarga_manual', descripcion: 'Pago parcial/total en mostrador' 
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

      const msg = `🎫 *QUINIELA CIBERTEQUE*\nHola ${capNombre}, tu jugada para *${quiniela.nombre_jornada}* se guardó correctamente. ¡Mucha suerte!`
      setLinkWaReciente(`https://wa.me/52${capTelefono}?text=${encodeURIComponent(msg)}`)
      
      // PREPARAMOS EL BOLETO PARA IMPRIMIR
      setTicketAImprimir({ nombre: capNombre, telefono: capTelefono, selecciones: seleccionesFinales, goles: capGoles })
      
      alert('🎟️ ¡Boleto guardado!')
      setCapTelefono(''); setCapNombre(''); setCapSelecciones({}); setCapGoles(''); 
    } catch (e: any) { alert(e.message) } finally { setGuardandoCaptura(false) }
  }

  const capturaCerradaPorFecha = quiniela && quiniela.fecha_cierre ? new Date() > new Date(quiniela.fecha_cierre.substring(0, 16)) : false;
  const capturaCerradaPorResultados = (partidos || []).some(p => p.resultado_real !== null);
  const bloqueoCapturaAdmin = capturaCerradaPorFecha || capturaCerradaPorResultados;

  return (
    <>
      {/* VISTA: RECARGAS */}
      {vista === 'recargas' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex gap-2 mb-8">
           <input type="text" placeholder="Buscar cliente (Nombre o WhatsApp)..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 transition-all" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarUsuarios()} />
           <button onClick={buscarUsuarios} className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-lg font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-blue-900/40">Buscar</button>
         </div>
         
          <div className="space-y-4">
            {(usuarios || []).map(u => (
              <div key={u.id} className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors">
                <div className="flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <p className="font-black text-white uppercase tracking-tight">{u.nombre}</p>
                    <p className="text-xs text-slate-400 font-mono">{u.telefono}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] uppercase text-slate-500 font-bold">Saldo Actual:</span>
                      <span className="text-green-400 font-black text-lg drop-shadow-[0_0_8px_rgba(74,222,128,0.2)]">{u.creditos_disponibles}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => verHistorial(u.id)} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all text-white">📜 Historial</button>
                    <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 1)} className="bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all">+1</button>
                    <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 5)} className="bg-green-600 hover:bg-green-500 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all">+5</button>
                    <button onClick={() => recargarCreditos(u.id, u.creditos_disponibles, 10)} className="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all">+10</button>
                  </div>
                </div>

                {historialActivo === u.id && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                    <table className="w-full text-xs text-slate-400">
                      <thead>
                        <tr className="uppercase border-b border-slate-700 text-[10px] font-bold">
                          <th className="pb-2 text-left w-1/4">Fecha</th>
                          <th className="pb-2 text-left w-2/4">Concepto del Movimiento</th>
                          <th className="pb-2 text-center w-[12%]">Cantidad</th>
                          <th className="pb-2 text-right w-[13%] text-blue-400">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let saldoAcumulado = u.creditos_disponibles;
                          return datosHistorial.map((mov: any) => {
                            const saldoEnEseMomento = saldoAcumulado;
                            saldoAcumulado -= mov.cantidad; 
                            return (
                              <tr key={mov.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="py-2.5">{new Date(mov.created_at).toLocaleDateString()}</td>
                                <td className="py-2.5 text-slate-300 font-medium">{mov.descripcion || mov.tipo_movimiento.replace(/_/g, ' ')}</td>
                                <td className={`py-2.5 text-center font-black ${mov.cantidad > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {mov.cantidad > 0 ? '+' : ''}{mov.cantidad}
                                </td>
                                <td className="py-2.5 text-right font-black text-blue-400">{saldoEnEseMomento}</td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                    {datosHistorial.length === 0 && <p className="text-center text-slate-500 text-xs mt-4 italic">No hay movimientos recientes.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISTA: CAPTURA FÍSICA */}
      {vista === 'captura' && (
        <div className="animate-in fade-in duration-300">
          {quinielasAbiertas.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase w-full mb-1">Selecciona la jornada a capturar:</span>
              {quinielasAbiertas.map(qa => (
                <button key={qa.id} onClick={() => seleccionarQuiniela(qa)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${quiniela?.id === qa.id ? 'bg-amber-500 text-slate-900 shadow-md' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                  {qa.nombre_jornada}
                </button>
              ))}
            </div>
          )}

          {!quiniela ? (
            <p className="text-center text-slate-500 py-10 font-bold uppercase tracking-widest">No hay jornada activa para capturar.</p>
          ) : (
            <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-6 shadow-inner relative overflow-hidden">
              {bloqueoCapturaAdmin && (
                <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                  <span className="text-5xl mb-4">🛑</span>
                  <h2 className="text-2xl font-black text-red-500 uppercase tracking-widest mb-2">Captura Bloqueada</h2>
                  <p className="text-slate-300 font-bold text-xs uppercase max-w-sm">
                    {capturaCerradaPorResultados ? 'Ya se ingresaron resultados reales.' : 'La fecha de cierre ha expirado.'}
                  </p>
                </div>
              )}
              
              <div className="mb-6 border-b border-amber-900/50 pb-4">
                <h3 className="text-amber-500 font-black uppercase tracking-widest text-lg flex items-center gap-2">⚡ Captura Rápida: {quiniela.nombre_jornada}</h3>
                <p className="text-xs text-amber-200/50 uppercase mt-1">Ingresa el papel del cliente rápidamente.</p>
              </div>

              {linkWaReciente && (
                <div className="mb-6 bg-green-950/40 border border-green-600/50 p-4 rounded-xl text-center shadow-lg shadow-green-900/20 animate-in zoom-in-95">
                  <p className="text-green-400 font-bold text-xs uppercase mb-3">✅ Captura Guardada Exitosamente. Elige una opción:</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                    <a href={linkWaReciente} target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-500 text-white font-black px-5 py-3 rounded-lg text-xs uppercase tracking-widest transition-all shadow-md">
                      📲 Enviar WhatsApp
                    </a>
                    <button onClick={() => activarImpresion('recibo')} className="bg-white hover:bg-slate-200 text-green-900 font-black px-5 py-3 rounded-lg text-xs uppercase tracking-widest transition-all shadow-md">
                      🖨️ Imprimir Recibo Lleno
                    </button>
                  </div>
                  <button onClick={() => setLinkWaReciente(null)} className="block mx-auto mt-4 text-[10px] text-slate-500 hover:text-white uppercase underline">Ocultar esto y capturar otro boleto</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div>
                  <label className="text-[10px] text-amber-500/80 font-bold uppercase mb-2 block">WhatsApp del Papel</label>
                  <input type="text" placeholder="10 dígitos..." value={capTelefono} onChange={(e) => buscarClienteParaCaptura(e.target.value)} className="w-full bg-slate-900 border border-amber-900/50 rounded-lg px-4 py-3 text-white outline-none focus:border-amber-500 font-mono text-lg transition-all" />
                </div>
                <div>
                  <label className="text-[10px] text-amber-500/80 font-bold uppercase mb-2 block">Nombre del Cliente</label>
                  <input type="text" placeholder="Ej. Juan Pérez" value={capNombre} onChange={(e) => setCapNombre(e.target.value)} className={`w-full bg-slate-900 border rounded-lg px-4 py-3 text-white outline-none font-bold uppercase transition-all ${capUsuarioId ? 'border-green-900/50 text-green-400' : 'border-amber-900/50 focus:border-amber-500'}`} disabled={capUsuarioId !== null} />
                </div>
              </div>
              
              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 mb-8">
                {(partidos || []).map((p, idx) => (
                  <div key={p.id} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                    <div className="flex-1 text-right text-xs font-bold text-slate-300 uppercase pr-3">{p.equipo_local}</div>
                    <div className="flex gap-1 w-[120px]">
                      {['L', 'E', 'V'].map(opc => (
                        <button key={opc} onClick={() => seleccionarOpcionCaptura(p.id, opc)} className={`flex-1 py-1 rounded text-xs font-black border transition-all ${capSelecciones[p.id] === opc ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-600'}`}>{opc}</button>
                      ))}
                    </div>
                    <div className="flex-1 text-left text-xs font-bold text-slate-300 uppercase pl-3">{p.equipo_visitante}</div>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="w-full md:w-1/3">
                  <label className="text-[10px] text-amber-500/80 font-bold uppercase mb-2 block">Desempate (Goles)</label>
                  <input type="number" placeholder="00" value={capGoles} onChange={(e) => setCapGoles(e.target.value)} className="w-full bg-slate-900 border border-amber-900/50 rounded-lg px-4 py-3 text-center text-2xl font-black text-white focus:border-amber-500 outline-none transition-all" />
                </div>
                <button onClick={guardarCapturaFisica} disabled={guardandoCaptura} className={`w-full md:w-2/3 py-4 rounded-xl font-black uppercase tracking-widest transition-all ${guardandoCaptura ? 'bg-slate-700 text-slate-500' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(245,158,11,0.4)]'}`}>
                  {guardandoCaptura ? 'Procesando...' : 'Guardar Ticket Físico'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- EL MOTOR DE IMPRESIÓN CON EL TRUCO DE ZONA-IMPRESION --- */}
      {tipoImpresion && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .zona-impresion, .zona-impresion * { visibility: visible !important; }
            .zona-impresion { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
          }
        `}</style>
      )}

      {quiniela && tipoImpresion === 'recibo' && ticketAImprimir && (
        <div className="hidden print:flex print:flex-col print:items-start print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-8">
          <div className="w-full max-w-sm border-2 border-black rounded-2xl p-4 bg-white flex flex-col justify-between">
            <div>
              <div className="text-center mb-4">
                <h1 className="font-black text-3xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                <p className="text-xs font-bold uppercase tracking-widest border-b-2 border-blue-900 inline-block pb-1 mt-1 text-blue-900">RECIBO DE JUGADA</p>
                <div className="mt-2 text-[10px] font-black uppercase bg-blue-900 text-white py-1 px-2 rounded">Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}</div>
              </div>
              <h2 className="text-center font-black text-lg uppercase mb-4 bg-amber-400 py-1 border-y-2 border-black text-black">{quiniela.nombre_jornada}</h2>
              <div className="mb-4 space-y-3">
                <div className="flex justify-between items-end border-b border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">Nombre:</span><span className="font-black text-sm uppercase">{ticketAImprimir.nombre}</span></div>
                <div className="flex justify-between items-end border-b border-black border-dashed pb-1"><span className="font-bold text-sm uppercase">WhatsApp:</span><span className="font-black text-sm uppercase">{ticketAImprimir.telefono}</span></div>
              </div>
              <table className="w-full text-sm mb-4 border-collapse table-fixed">
                <thead><tr className="bg-blue-900 text-white text-[8px] uppercase"><th className="border-2 border-black p-1 text-right w-[40%]">Local</th><th className="border-2 border-black p-1 text-center w-[6%]">L</th><th className="border-2 border-black p-1 text-center w-[6%]">E</th><th className="border-2 border-black p-1 text-center w-[6%]">V</th><th className="border-2 border-black p-1 text-left w-[40%]">Visita</th></tr></thead>
                <tbody>
                  {(partidos || []).map((p) => {
                    const logoL = obtenerLogo(p.equipo_local)
                    const logoV = obtenerLogo(p.equipo_visitante)
                    return (
                      <tr key={p.id}>
                        <td className="border border-black p-1 text-right overflow-hidden bg-gray-50"><div className="flex items-center justify-end gap-1"><span className="font-bold uppercase text-[7px] truncate max-w-[80%]">{p.equipo_local}</span>{logoL ? <img src={logoL} alt="" className="w-4 h-4 object-contain" /> : <div className="w-3 h-3 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}</div></td>
                        <td className="border border-black p-0.5 text-center font-black text-xs text-blue-800">{ticketAImprimir.selecciones[p.id] === 'L' ? 'X' : ''}</td><td className="border border-black p-0.5 text-center font-black text-xs text-blue-800">{ticketAImprimir.selecciones[p.id] === 'E' ? 'X' : ''}</td><td className="border border-black p-0.5 text-center font-black text-xs text-blue-800">{ticketAImprimir.selecciones[p.id] === 'V' ? 'X' : ''}</td>
                        <td className="border border-black p-1 text-left overflow-hidden bg-gray-50"><div className="flex items-center justify-start gap-1">{logoV ? <img src={logoV} alt="" className="w-4 h-4 object-contain" /> : <div className="w-3 h-3 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}<span className="font-bold uppercase text-[7px] truncate max-w-[80%]">{p.equipo_visitante}</span></div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="border-2 border-black p-2 text-center rounded-xl bg-gray-100 mt-6 flex justify-between items-center px-4"><span className="font-bold uppercase text-[9px]">Desempate (Goles):</span><span className="font-black text-xl">{ticketAImprimir.goles}</span></div>
              <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-black border-dashed">
              <p className="text-[6px] text-justify leading-tight font-semibold uppercase"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}