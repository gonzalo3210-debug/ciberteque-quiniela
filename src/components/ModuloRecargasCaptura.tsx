'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useCajero } from '@/hooks/useCajero'
import { useCapturaFisica } from '@/hooks/useCapturaFisica'

interface ModuloRecargasCapturaProps {
  vista: 'recargas' | 'captura';
  actualizarSaldoGlobal?: (id: string, nuevo: number) => void;
}

export default function ModuloRecargasCaptura({ vista, actualizarSaldoGlobal }: ModuloRecargasCapturaProps) {
  const cajero = useCajero(actualizarSaldoGlobal);
  const captura = useCapturaFisica(actualizarSaldoGlobal);

  // 🆕 ESTADO UNIFICADO: Maneja si está abierta la recarga o el retiro
  const [modalOperacion, setModalOperacion] = useState<{id: string, tipo: 'recarga' | 'retiro'} | null>(null);
  const [montoOperacion, setMontoOperacion] = useState('');

  // 🖨️ Estado para controlar el tipo de impresión dinámica
  const [formatoImpresion, setFormatoImpresion] = useState<'A4' | 'termica' | null>(null);

  // 🚀 ESTADOS AUTOCOMPLETADO (Captura Física)
  const [sugerenciasClientes, setSugerenciasClientes] = useState<any[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const autocompleteTimer = useRef<NodeJS.Timeout | null>(null);

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

  const handleProcesarOperacion = async (u: any) => {
    let exito = false;
    if (modalOperacion?.tipo === 'recarga') {
      exito = await cajero.procesarRecargaLibre(u, montoOperacion);
    } else if (modalOperacion?.tipo === 'retiro') {
      exito = await cajero.procesarRetiro(u, montoOperacion);
    }
    
    if (exito) {
      setModalOperacion(null);
      setMontoOperacion('');
    }
  }

  // 🔥 Filtro y Auto-selección Segura de Jornadas Abiertas
  const quinielasCapturables = captura.quinielasAbiertas.filter(qa => {
    const yaPasoFecha = qa.fecha_cierre ? new Date() > new Date(qa.fecha_cierre.substring(0, 16)) : false;
    const yaHayResultados = (qa.partidos || []).some((p: any) => p.resultado_real !== null);
    return !yaPasoFecha && !yaHayResultados;
  });

  useEffect(() => {
    if (vista === 'captura' && quinielasCapturables.length > 0) {
      const actualValida = captura.quiniela && quinielasCapturables.some(q => q.id === captura.quiniela.id);
      if (!actualValida) captura.seleccionarQuiniela(quinielasCapturables[0]);
    }
  }, [vista, captura.quiniela?.id, quinielasCapturables.length]);

  // 🧠 Lógica Robusta de Autocompletado Dual
  const manejarAutocompletado = (valor: string, campo: 'telefono' | 'nombre') => {
    if (campo === 'telefono') {
      captura.setCapTelefono(valor);
      captura.setCapUsuarioId(null);
    } else {
      captura.setCapNombre(valor);
      captura.setCapUsuarioId(null);
    }

    if (valor.trim().length < 2) {
      setSugerenciasClientes([]);
      setMostrarSugerencias(false);
      setBuscandoCliente(false);
      if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
      return;
    }

    setBuscandoCliente(true);
    setMostrarSugerencias(true);

    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);

    autocompleteTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('id, nombre, telefono')
        .or(`nombre.ilike.%${valor}%,telefono.ilike.%${valor}%`)
        .limit(6);

      if (data && data.length > 0) {
        setSugerenciasClientes(data);
      } else {
        setSugerenciasClientes([]);
        setMostrarSugerencias(false);
      }
      setBuscandoCliente(false);
    }, 400); // Debounce de 400ms
  };

  const aplicarSugerencia = (cliente: any) => {
    captura.setCapUsuarioId(cliente.id);
    captura.setCapNombre(cliente.nombre);
    captura.setCapTelefono(cliente.telefono || '');
    setMostrarSugerencias(false);
    setSugerenciasClientes([]);
  };

  const limpiarCliente = () => {
    captura.setCapUsuarioId(null);
    captura.setCapNombre('');
    captura.setCapTelefono('');
    setMostrarSugerencias(false);
    setSugerenciasClientes([]);
  };

  return (
    <>
      {/* VISTA: VENTAS Y RETIROS (Restaurada al diseño unificado original) */}
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

            {(cajero.usuarios || []).map(u => {
              const saldoTotal = Number(u.creditos_disponibles || 0) + Number(u.saldo_pesos || 0);

              return (
                <div key={u.id} className="bg-slate-900/80 p-3 md:p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all shadow-lg">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <p className="font-black text-white text-xs md:text-sm uppercase tracking-tight">{u.nombre}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <p className="text-[10px] text-slate-400 font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{u.telefono}</p>
                        
                        {/* 💰 VISTA DE BILLETERA UNIFICADA */}
                        <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
                          <span className="text-[9px] uppercase text-slate-500 font-bold">Billetera:</span>
                          <span className="text-amber-400 font-black text-sm drop-shadow-[0_0_5px_rgba(251,191,36,0.2)]">
                            ${saldoTotal.toLocaleString('es-MX', {minimumFractionDigits: 2})} <span className="text-[9px] text-amber-600">MXN</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                      <button onClick={() => cajero.verHistorial(u.id)} className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all text-slate-300 border border-slate-700 flex-1 md:flex-none shadow-md">📜 Historial</button>
                      <button onClick={() => {setModalOperacion({id: u.id, tipo: 'recarga'}); setMontoOperacion('');}} className="bg-green-900 hover:bg-green-800 border border-green-600/50 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all shadow-[0_0_10px_rgba(22,163,74,0.2)] flex-1 md:flex-none">💰 Ingresar $</button>
                      <button onClick={() => {setModalOperacion({id: u.id, tipo: 'retiro'}); setMontoOperacion('');}} className="bg-red-950 hover:bg-red-900 border border-red-800/50 text-red-300 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all shadow-md flex-1 md:flex-none">💸 Retirar $</button>
                    </div>
                  </div>

                  {/* MODAL FLOTANTE DUAL: Ingreso / Retiro */}
                  {modalOperacion?.id === u.id && (
                    <div className={`mt-4 p-4 border rounded-xl animate-in fade-in zoom-in-95 ${modalOperacion.tipo === 'recarga' ? 'bg-green-950/20 border-green-900/50' : 'bg-red-950/20 border-red-900/50'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <label className={`text-[10px] font-black uppercase tracking-widest block ${modalOperacion.tipo === 'recarga' ? 'text-green-500' : 'text-red-500'}`}>
                          {modalOperacion.tipo === 'recarga' ? '¿Cuánto dinero te entregó el cliente?' : '¿Cuánto dinero vas a retirar?'}
                        </label>
                        <button onClick={() => setModalOperacion(null)} className="text-slate-500 hover:text-white font-mono text-sm">✕</button>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                          <input 
                            type="number" 
                            value={montoOperacion} 
                            onChange={(e) => setMontoOperacion(e.target.value)} 
                            placeholder="Ej. 100" 
                            className={`w-full bg-slate-950 border rounded-lg pl-8 pr-3 py-2.5 text-white outline-none transition-all font-black text-xl shadow-inner ${modalOperacion.tipo === 'recarga' ? 'border-green-900/50 focus:border-green-500' : 'border-red-900/50 focus:border-red-500'}`} 
                          />
                        </div>
                        <button onClick={() => handleProcesarOperacion(u)} className={`text-white font-black px-6 py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-lg ${modalOperacion.tipo === 'recarga' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>
                          {modalOperacion.tipo === 'recarga' ? 'Ingresar y Cobrar' : 'Confirmar Retiro'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* HISTORIAL UNIFICADO EN PESOS */}
                  {cajero.historialActivo === u.id && (
                    <div className="mt-4 pt-3 border-t border-slate-800 animate-in slide-in-from-top-2">
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
                                let saldoAcumulado = saldoTotal; 
                                return cajero.datosHistorial.map((mov: any) => {
                                  const saldoEnEseMomento = saldoAcumulado;
                                  saldoAcumulado -= mov.cantidad; 
                                  const conceptoLimpio = mov.descripcion || (mov.tipo_movimiento === 'recarga_manual' ? 'Ingreso' : mov.tipo_movimiento.replace(/_/g, ' '));
                                  return (
                                    <tr key={mov.id} className="hover:bg-slate-800/30 transition-colors">
                                      <td className="p-2 text-[9px] md:text-[10px] text-slate-400 font-mono">{new Date(mov.created_at).toLocaleDateString()}</td>
                                      <td className="p-2 text-[9px] md:text-[10px] text-slate-300 font-bold uppercase truncate max-w-[120px] md:max-w-[200px]" title={conceptoLimpio}>{conceptoLimpio}</td>
                                      <td className={`p-2 text-center font-black text-[10px] md:text-xs ${mov.cantidad > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {mov.cantidad > 0 ? '+' : '-'}${Math.abs(mov.cantidad).toLocaleString('es-MX', {minimumFractionDigits:0})}
                                      </td>
                                      <td className="p-2 text-right font-black text-[10px] md:text-xs text-amber-400">${saldoEnEseMomento.toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
                                    </tr>
                                  )
                                })
                              })()}
                            </tbody>
                          </table>
                          
                          {cajero.datosHistorial.length === 0 && <p className="text-center text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-4 py-4 bg-slate-950/50 rounded-lg">No hay movimientos recientes.</p>}
                          
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
              )
            })}

            {cajero.hayMasUsuarios && (
              <button onClick={cajero.cargarMasUsuarios} className="w-full mt-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-[10px] md:text-xs text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-all font-black uppercase tracking-widest shadow-lg">
                ⬇️ Cargar más clientes...
              </button>
            )}
          </div>
        </div>
      )}

      {/* VISTA: CAPTURA FÍSICA */}
      {vista === 'captura' && (
        <div className="animate-in fade-in duration-300 w-full max-w-3xl mx-auto">
          
          {(quinielasCapturables.length > 1 || (quinielasCapturables.length === 1 && captura.quiniela?.id !== quinielasCapturables[0].id)) && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
              {quinielasCapturables.map(qa => (
                <button key={qa.id} onClick={() => captura.seleccionarQuiniela(qa)} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${captura.quiniela?.id === qa.id ? 'bg-amber-500 text-slate-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                  {qa.nombre_jornada}
                </button>
              ))}
            </div>
          )}

          {quinielasCapturables.length === 0 ? (
            <p className="text-center text-slate-500 py-10 text-[10px] font-bold uppercase tracking-widest bg-slate-900/50 rounded-xl border border-slate-800">No hay jornadas disponibles para captura.</p>
          ) : !captura.quiniela || (captura.quiniela && !quinielasCapturables.some(q => q.id === captura.quiniela.id)) ? (
            <p className="text-center text-amber-500 py-10 text-[10px] font-bold uppercase tracking-widest bg-slate-900/50 rounded-xl border border-amber-900/50 shadow-inner">Cargando jornada próxima...</p>
          ) : (
            <div className="bg-gradient-to-br from-amber-950/20 to-slate-900 border border-amber-900/40 rounded-2xl p-4 md:p-6 shadow-[0_0_20px_rgba(245,158,11,0.05)] relative overflow-hidden">
              
              <div className="mb-5 border-b border-amber-900/30 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="text-amber-500 font-black uppercase tracking-widest text-sm md:text-base flex items-center gap-2"><span>⚡</span> Captura Física</h3>
                  <p className="text-[9px] md:text-[10px] text-amber-500/50 uppercase font-bold mt-0.5">{captura.quiniela.nombre_jornada}</p>
                </div>
              </div>

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

              {/* 🚀 BÚSQUEDA AUTOCOMPLETADO (NOMBRE O WHATSAPP) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 relative">
                <div className="relative">
                  <label className="text-[9px] md:text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mb-1.5 block">WhatsApp</label>
                  <input 
                    type="text" 
                    placeholder="10 dígitos..." 
                    value={captura.capTelefono} 
                    onChange={(e) => manejarAutocompletado(e.target.value, 'telefono')} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-amber-500 font-mono text-sm transition-all placeholder:text-slate-600" 
                  />
                </div>
                <div className="relative">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[9px] md:text-[10px] text-amber-500/80 font-bold uppercase tracking-widest">Nombre del Cliente</label>
                    {captura.capUsuarioId && (
                      <button onClick={limpiarCliente} className="text-[9px] text-red-400 hover:text-red-300 uppercase font-black transition-colors">
                        ✕ Limpiar
                      </button>
                    )}
                  </div>
                  <input 
                    type="text" 
                    placeholder="Ej. Juan Pérez" 
                    value={captura.capNombre} 
                    onChange={(e) => manejarAutocompletado(e.target.value, 'nombre')} 
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-white outline-none font-bold uppercase text-xs transition-all placeholder:text-slate-600 ${captura.capUsuarioId ? 'border-green-500/50 text-green-400 bg-green-950/20' : 'border-slate-700 focus:border-amber-500'}`} 
                  />
                </div>

                {/* MODAL DE SUGERENCIAS FLOTANTE */}
                {mostrarSugerencias && sugerenciasClientes.length > 0 && (
                  <div className="absolute top-[100%] left-0 w-full bg-slate-800 border border-slate-600 rounded-lg mt-1 z-50 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                    {sugerenciasClientes.map(cliente => (
                      <div 
                        key={cliente.id} 
                        onClick={() => aplicarSugerencia(cliente)}
                        className="px-4 py-2.5 hover:bg-amber-600 cursor-pointer flex justify-between items-center border-b border-slate-700/50 last:border-0 group transition-colors"
                      >
                        <span className="font-bold text-xs uppercase text-slate-300 group-hover:text-white">{cliente.nombre}</span>
                        <span className="font-mono text-[10px] text-amber-500/80 group-hover:text-amber-100">{cliente.telefono}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* INDICADOR DE CARGA AUTOCOMPLETADO */}
                {buscandoCliente && (
                  <div className="absolute top-[100%] left-0 w-full bg-slate-800 border border-slate-600 rounded-lg mt-1 z-50 p-3 text-center shadow-2xl">
                    <span className="text-amber-500 text-[10px] uppercase font-bold tracking-widest animate-pulse">Buscando...</span>
                  </div>
                )}
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
      {captura.quiniela && captura.ticketAImprimir && (
        <div className="hidden print:flex print:flex-col print:items-center print:w-full print:h-full print:bg-white print:text-black zona-impresion z-[99999]">
          <div className="w-full h-full border-4 border-black rounded-3xl p-6 bg-white flex flex-col justify-between">
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
    </>
  )
}