'use client'
import { useState, useEffect } from 'react'
import { useCajero } from '@/hooks/useCajero'
import { useCapturaFisica } from '@/hooks/useCapturaFisica'

interface ModuloRecargasCapturaProps {
  vista: 'recargas' | 'captura';
  actualizarSaldoGlobal?: (id: string, nuevo: number) => void;
}

export default function ModuloRecargasCaptura({ vista, actualizarSaldoGlobal }: ModuloRecargasCapturaProps) {
  const cajero = useCajero(actualizarSaldoGlobal);
  const captura = useCapturaFisica(actualizarSaldoGlobal);

  const [recargaLibreAbierta, setRecargaLibreAbierta] = useState<string | null>(null);
  const [montoRecargaLibre, setMontoRecargaLibre] = useState('');

  // 🖨️ Estado para controlar el tipo de impresión dinámica
  const [formatoImpresion, setFormatoImpresion] = useState<'A4' | 'termica' | null>(null);

  // Limpiar el estado de impresión después de que se cierre el diálogo del sistema
  useEffect(() => {
    const handleAfterPrint = () => setFormatoImpresion(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const obtenerLogo = (nombreEquipo: string) => {
    if (!nombreEquipo) return null;
    const equipo = captura.equipos.find(e => e.nombre.toLowerCase().trim() === nombreEquipo.toLowerCase().trim())
    return equipo?.logo_url || null
  }

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const d = new Date(fechaDB.substring(0, 16));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  const handleProcesarRecarga = async (u: any) => {
    const exito = await cajero.procesarRecargaLibre(u, montoRecargaLibre);
    if (exito) {
      setRecargaLibreAbierta(null);
      setMontoRecargaLibre('');
    }
  }

  const capturaCerradaPorFecha = captura.quiniela && captura.quiniela.fecha_cierre ? new Date() > new Date(captura.quiniela.fecha_cierre.substring(0, 16)) : false;
  const capturaCerradaPorResultados = (captura.partidos || []).some(p => p.resultado_real !== null);
  const bloqueoCapturaAdmin = capturaCerradaPorFecha || capturaCerradaPorResultados;

  return (
    <>
      {/* VISTA: VENTAS */}
      {vista === 'recargas' && (
        <div className="animate-in fade-in duration-300 w-full max-w-2xl mx-auto space-y-4">
          <div className="flex gap-2 relative">
            <input 
              type="text" 
              placeholder="Buscar cliente (Nombre o WhatsApp)..." 
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-[10px] md:text-xs text-white outline-none focus:border-green-500 transition-all uppercase font-bold tracking-widest placeholder:text-slate-600" 
              value={cajero.busqueda} 
              onChange={(e) => cajero.setBusqueda(e.target.value)} 
            />
            {cajero.cargando && <span className="absolute right-4 top-3 text-slate-500 animate-spin">⏳</span>}
          </div>
          
          <div className="space-y-3">
            {cajero.usuarios.length === 0 && cajero.busqueda.length > 2 && !cajero.cargando && (
               <p className="text-center text-slate-500 text-xs py-4 bg-slate-900/50 rounded-lg">No se encontraron clientes.</p>
            )}

            {(cajero.usuarios || []).map(u => (
              <div key={u.id} className="bg-slate-900/80 p-3 md:p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <p className="font-black text-white text-xs md:text-sm uppercase tracking-tight">{u.nombre}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <p className="text-[10px] text-slate-400 font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{u.telefono}</p>
                      
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] uppercase text-slate-500 font-bold">Créditos:</span>
                        <span className="text-green-400 font-black text-sm drop-shadow-[0_0_5px_rgba(74,222,128,0.2)]">{u.creditos_disponibles}</span>
                      </div>

                      <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
                        <span className="text-[9px] uppercase text-slate-500 font-bold">Saldo:</span>
                        <span className="text-amber-500 font-black text-sm">${u.saldo_pesos || 0}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                    <button onClick={() => cajero.verHistorial(u.id)} className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase transition-all text-slate-300 border border-slate-700 flex-1 md:flex-none">📜 Historial</button>
                    <button onClick={() => setRecargaLibreAbierta(u.id)} className="bg-amber-900 hover:bg-amber-800 border border-amber-600/50 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-[0_0_10px_rgba(245,158,11,0.2)] flex-1 md:flex-none">+$ Libre</button>
                    <button onClick={() => cajero.recargarCreditos(u.id, u.creditos_disponibles, 1)} className="bg-green-950 hover:bg-green-900 border border-green-700/50 text-green-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex-1 md:flex-none">+1</button>
                    <button onClick={() => cajero.recargarCreditos(u.id, u.creditos_disponibles, 5)} className="bg-green-800 hover:bg-green-700 border border-green-600/50 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex-1 md:flex-none">+5</button>
                    <button onClick={() => cajero.recargarCreditos(u.id, u.creditos_disponibles, 10)} className="bg-green-600 hover:bg-green-500 border border-green-500/50 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-[0_0_10px_rgba(22,163,74,0.3)] flex-1 md:flex-none">+10</button>
                  </div>
                </div>

                {/* MODAL FLOTANTE: Recarga Libre ($) */}
                {recargaLibreAbierta === u.id && (
                  <div className="mt-3 p-4 bg-amber-950/20 border border-amber-900/50 rounded-xl animate-in fade-in zoom-in-95">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">¿Cuánto dinero te entregó el cliente?</label>
                      <button onClick={() => setRecargaLibreAbierta(null)} className="text-slate-500 hover:text-white font-mono text-sm">✕</button>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                        <input 
                          type="number" 
                          value={montoRecargaLibre} 
                          onChange={(e) => setMontoRecargaLibre(e.target.value)} 
                          placeholder="Ej. 100" 
                          className="w-full bg-slate-950 border border-amber-900/50 rounded-lg pl-7 pr-3 py-2 text-white outline-none focus:border-amber-500 transition-all font-black text-lg" 
                        />
                      </div>
                      <button onClick={() => handleProcesarRecarga(u)} className="bg-amber-600 hover:bg-amber-500 text-white font-black px-6 py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all">
                        Calcular y Cobrar
                      </button>
                    </div>

                    {parseFloat(montoRecargaLibre) > 0 && (
                      <div className="mt-3 flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-800 text-[10px] font-bold uppercase">
                        <span className="text-slate-400">Recibirá: <span className="text-green-400 font-black text-sm">+{Math.floor(((u.saldo_pesos || 0) + parseFloat(montoRecargaLibre)) / cajero.PRECIO_CREDITO)} Crts</span></span>
                        <span className="text-slate-400">Sobrante a guardar: <span className="text-amber-500 font-black text-sm">${((u.saldo_pesos || 0) + parseFloat(montoRecargaLibre)) % cajero.PRECIO_CREDITO}</span></span>
                      </div>
                    )}
                  </div>
                )}

                {/* HISTORIAL */}
                {cajero.historialActivo === u.id && (
                  <div className="mt-3 pt-3 border-t border-slate-800 animate-in slide-in-from-top-2">
                    {cajero.cargandoHistorial ? (
                      <p className="text-center text-slate-500 text-[10px] animate-pulse">Cargando movimientos...</p>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto pr-1">
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
                              return cajero.datosHistorial.map((mov: any) => {
                                const saldoEnEseMomento = saldoAcumulado;
                                saldoAcumulado -= mov.cantidad; 
                                const conceptoLimpio = mov.descripcion || (mov.tipo_movimiento === 'recarga_manual' ? 'Venta' : mov.tipo_movimiento.replace(/_/g, ' '));
                                return (
                                  <tr key={mov.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="p-2 text-[9px] md:text-[10px] text-slate-400 font-mono">{new Date(mov.created_at).toLocaleDateString()}</td>
                                    <td className="p-2 text-[9px] md:text-[10px] text-slate-300 font-bold uppercase truncate max-w-[120px] md:max-w-[200px]" title={conceptoLimpio}>{conceptoLimpio}</td>
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
                        
                        {cajero.datosHistorial.length === 0 && <p className="text-center text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-4 py-4 bg-slate-950/50 rounded-lg">No hay movimientos recientes.</p>}
                        
                        {/* 🌟 BOTÓN CARGAR MÁS HISTORIAL 🌟 */}
                        {cajero.hayMasHistorial && (
                          <button onClick={cajero.cargarMasHistorial} className="w-full mt-3 py-2 border border-slate-700 border-dashed rounded-lg text-[10px] text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-all font-bold uppercase tracking-widest">
                            ⬇️ Cargar más movimientos...
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 🌟 BOTÓN CARGAR MÁS CLIENTES 🌟 */}
            {cajero.hayMasUsuarios && (
              <button onClick={cajero.cargarMasUsuarios} className="w-full mt-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-[10px] md:text-xs text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-all font-black uppercase tracking-widest shadow-lg">
                ⬇️ Cargar más clientes...
              </button>
            )}
          </div>
        </div>
      )}

      {/* VISTA: CAPTURA FÍSICA (INTACTA) */}
      {vista === 'captura' && (
        <div className="animate-in fade-in duration-300 w-full max-w-3xl mx-auto">
          {captura.quinielasAbiertas.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
              {captura.quinielasAbiertas.map(qa => (
                <button key={qa.id} onClick={() => captura.seleccionarQuiniela(qa)} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${captura.quiniela?.id === qa.id ? 'bg-amber-500 text-slate-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                  {qa.nombre_jornada}
                </button>
              ))}
            </div>
          )}

          {!captura.quiniela ? (
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
                  <p className="text-[9px] md:text-[10px] text-amber-500/50 uppercase font-bold mt-0.5">{captura.quiniela.nombre_jornada}</p>
                </div>
              </div>

              {/* 🖨️ SECCIÓN ACTUALIZADA DE BOTONES DUALES DE IMPRESIÓN */}
              {captura.linkWaReciente && (
                <div className="mb-5 bg-green-950/40 border border-green-600/50 p-3 rounded-xl text-center shadow-[0_0_15px_rgba(22,163,74,0.1)] animate-in zoom-in-95">
                  <p className="text-green-400 font-black text-[10px] uppercase tracking-widest mb-2">✅ Captura Guardada</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                    <a href={captura.linkWaReciente} target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-500 text-white font-black px-4 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all shadow-md w-full sm:w-auto">
                      📲 Enviar WhatsApp
                    </a>
                    <button onClick={() => { setFormatoImpresion('A4'); setTimeout(() => window.print(), 100); }} className="bg-white hover:bg-slate-200 text-green-950 font-black px-4 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all shadow-md w-full sm:w-auto">
                      🖨️ Recibo A4
                    </button>
                    <button onClick={() => { setFormatoImpresion('termica'); setTimeout(() => window.print(), 100); }} className="bg-slate-800 hover:bg-slate-700 text-white font-black px-4 py-2 rounded-lg text-[9px] md:text-[10px] uppercase tracking-widest transition-all shadow-md border border-slate-600 w-full sm:w-auto">
                      🧾 Ticket Térmico
                    </button>
                  </div>
                  <button onClick={() => { captura.setLinkWaReciente(null); captura.setTicketAImprimir(null); setFormatoImpresion(null); }} className="block mx-auto mt-3 text-[9px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest underline">Nueva Captura</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                <div>
                  <label className="text-[9px] md:text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mb-1.5 block">WhatsApp</label>
                  <input type="text" placeholder="10 dígitos..." value={captura.capTelefono} onChange={(e) => captura.buscarClienteParaCaptura(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-amber-500 font-mono text-sm transition-all placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-[9px] md:text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mb-1.5 block">Nombre del Cliente</label>
                  <input type="text" placeholder="Ej. Juan Pérez" value={captura.capNombre} onChange={(e) => captura.setCapNombre(e.target.value)} className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-white outline-none font-bold uppercase text-xs transition-all placeholder:text-slate-600 ${captura.capUsuarioId ? 'border-green-900/50 text-green-400' : 'border-slate-700 focus:border-amber-500'}`} disabled={captura.capUsuarioId !== null} />
                </div>
              </div>
              
              <div className="space-y-1.5 mb-5">
                {(captura.partidos || []).map((p) => {
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
                          <button key={opc} onClick={() => captura.setCapSelecciones({ ...captura.capSelecciones, [p.id]: opc })} className={`flex-1 py-1.5 rounded text-[10px] md:text-xs font-black border transition-all ${captura.capSelecciones[p.id] === opc ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-inner' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>{opc}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between border-t border-amber-900/30 pt-4">
                <div className="w-full md:w-[150px] bg-slate-950/40 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
                  <label className="text-[8px] md:text-[9px] text-amber-500 font-bold uppercase tracking-widest leading-tight">Total Goles:</label>
                  <input type="number" placeholder="00" value={captura.capGoles} onChange={(e) => captura.setCapGoles(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-lg font-black text-white focus:border-amber-500 outline-none transition-all" />
                </div>
                <button onClick={captura.guardarCapturaFisica} disabled={captura.guardandoCaptura} className={`w-full md:w-auto flex-1 py-3 px-4 rounded-xl font-black uppercase text-[10px] md:text-xs tracking-widest transition-all shadow-lg ${captura.guardandoCaptura ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-amber-900/20 active:scale-95'}`}>
                  {captura.guardandoCaptura ? 'Procesando...' : '💾 Guardar Ticket'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- ESTILOS DE IMPRESIÓN DINÁMICOS --- */}
      {formatoImpresion && (
        <style>{`
          @media print {
            /* 🔥 CLAVE: size: auto permite que la impresora térmica corte donde termina el contenido */
            @page { margin: 0; size: auto; }
            body { background: white; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body * { visibility: hidden !important; }
            .zona-impresion, .zona-impresion * { visibility: visible !important; }
            .zona-impresion { 
              position: absolute !important; 
              left: 0 !important; 
              top: 0 !important; 
              width: 100% !important; 
              margin: 0 !important; 
              background-color: white !important;
            }
            /* Clases específicas para no desperdiciar papel */
            .impresion-a4 { padding: 15px !important; }
            .impresion-termica { max-width: 80mm !important; margin: 0 auto !important; padding: 2mm !important; font-family: monospace !important; }
          }
        `}</style>
      )}

      {/* 1. DISEÑO TICKET A4 (El que simula el boleto físico) */}
      {captura.quiniela && captura.ticketAImprimir && formatoImpresion === 'A4' && (
        <div className="hidden print:flex print:flex-col print:items-center print:w-full print:bg-white print:text-black zona-impresion impresion-a4 z-[99999]">
          <div className="w-full max-w-3xl border-4 border-black rounded-3xl p-6 bg-white flex flex-col mx-auto my-4">
            <div>
              <div className="text-center mb-6">
                <h1 className="font-black text-4xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
                <p className="text-lg font-bold uppercase tracking-widest border-b-4 border-blue-900 inline-block pb-1 mt-2 text-blue-900">RECIBO DE JUGADA</p>
                <div className="mt-4 text-sm font-black uppercase bg-blue-900 text-white py-2 px-4 rounded-lg inline-block">Cierre: {formatearFechaLocal(captura.quiniela.fecha_cierre)}</div>
              </div>
              <h2 className="text-center font-black text-2xl uppercase mb-6 bg-amber-400 py-2 border-y-4 border-black text-black">{captura.quiniela.nombre_jornada}</h2>
              
              <div className="mb-6 space-y-3">
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-2">
                  <span className="font-bold text-lg uppercase">Nombre:</span>
                  <span className="font-black text-xl uppercase">{captura.ticketAImprimir.nombre}</span>
                </div>
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-2">
                  <span className="font-bold text-lg uppercase">WhatsApp:</span>
                  <span className="font-black text-xl uppercase">{captura.ticketAImprimir.telefono}</span>
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
                  {(captura.partidos || []).map((p) => {
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
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{captura.ticketAImprimir.selecciones[p.id] === 'L' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{captura.ticketAImprimir.selecciones[p.id] === 'E' ? 'X' : ''}</td>
                        <td className="border-4 border-black p-1 text-center font-black text-xl text-blue-800">{captura.ticketAImprimir.selecciones[p.id] === 'V' ? 'X' : ''}</td>
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
                <span className="font-black text-3xl">{captura.ticketAImprimir.goles}</span>
              </div>
              <p className="text-center text-sm font-bold uppercase mt-6 text-blue-900">Costo del Boleto: {captura.quiniela.precio_ticket ?? 1} {(captura.quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}</p>
            </div>
            
            <div className="mt-6 pt-6 border-t-2 border-black border-dashed">
              <p className="text-[9px] text-justify leading-tight font-bold uppercase text-black"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. DISEÑO TICKET TÉRMICO (Ahorra papel, minimalista) */}
      {captura.quiniela && captura.ticketAImprimir && formatoImpresion === 'termica' && (
        <div className="hidden print:block print:bg-white print:text-black text-black zona-impresion impresion-termica z-[99999]">
          <div className="text-center font-black text-xl leading-none">CIBERTEQUE</div>
          <div className="text-center text-[10px] mb-2 uppercase">Pronósticos Deportivos</div>
          
          <div className="text-center font-bold text-sm mb-2 uppercase border-y border-dashed border-black py-1">
            {captura.quiniela.nombre_jornada}
          </div>
          
          <div className="text-xs mb-2 leading-tight">
            <div><span className="font-bold">Jugador:</span> {captura.ticketAImprimir.nombre}</div>
            <div><span className="font-bold">Cel:</span> {captura.ticketAImprimir.telefono}</div>
            <div><span className="font-bold">Fecha:</span> {new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</div>
          </div>
          
          <table className="w-full text-left text-xs mb-2 border-collapse">
            <thead>
              <tr className="border-b border-black">
                <th className="pb-1 font-bold">Partido</th>
                <th className="pb-1 text-right font-bold">Pick</th>
              </tr>
            </thead>
            <tbody>
              {(captura.partidos || []).map((p, i) => (
                <tr key={p.id} className="border-b border-dashed border-gray-400">
                  <td className="py-1 pr-1 truncate max-w-[50mm]">{i+1}. {p.equipo_local.substring(0,8)} v {p.equipo_visitante.substring(0,8)}</td>
                  <td className="py-1 text-right font-black text-sm">{captura.ticketAImprimir.selecciones[p.id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="text-center font-black text-sm py-2 border-b border-dashed border-black mb-2">
            Desempate: {captura.ticketAImprimir.goles} Goles
          </div>
          
          <div className="text-center text-[10px] font-bold">¡Conserva este recibo!</div>
          <div className="text-center text-[9px] mt-1">ciberteque-quiniela.vercel.app</div>
        </div>
      )}
    </>
  )
}