'use client'
import { useState, useEffect, useRef } from 'react'
import { useCartelera } from '@/hooks/useCartelera'
import ModalReglas from '@/components/ModalReglas' 

export default function Cartelera({ usuarioActivo, actualizarSaldo }: { usuarioActivo: any, actualizarSaldo: (nuevoSaldo: number) => void }) {
  const {
    cargando, errorCarga, quinielasActivas, quinielaActual, partidos, selecciones, golesTotales,
    guardando, mostrarReglas, aceptoReglas, esGratis, esSorteo, esMarcadorExacto, bloqueadoPorParticipacion, 
    lugaresDisponibles, cantidadBoletos, golesAutomaticos, setCantidadBoletos, setGolesTotales, setMostrarReglas,
    setAceptoReglas, cambiarQuinielaVisible, seleccionarOpcion, guardarQuiniela, obtenerLogo
  } = useCartelera(usuarioActivo, actualizarSaldo)

  const [mensajeUI, setMensajeUI] = useState({ tipo: '', texto: '' })
  const procesandoRef = useRef(false)

  useEffect(() => {
    if (mensajeUI.tipo === 'exito') {
      const timer = setTimeout(() => { setMensajeUI({ tipo: '', texto: '' }) }, 5000)
      return () => clearTimeout(timer)
    }
  }, [mensajeUI])

  const formatearFechaObj = (fechaStr: string) => {
    if (!fechaStr) return null;
    try {
      const d = new Date(fechaStr.substring(0, 16));
      const fecha = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '');
      const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
      return { fecha, hora };
    } catch { return null; }
  }

  const handleGuardar = async () => {
    if (procesandoRef.current) return;
    procesandoRef.current = true;
    setMensajeUI({ tipo: '', texto: '' });
    
    try {
      const resultado = await guardarQuiniela();
      if (resultado?.error) setMensajeUI({ tipo: 'error', texto: resultado.error });
      else if (resultado?.success) setMensajeUI({ tipo: 'exito', texto: resultado.success });
      
      setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 100);
    } finally {
      procesandoRef.current = false;
    }
  }

  const sumarBoleto = () => setCantidadBoletos(prev => Math.min(prev + 1, lugaresDisponibles));
  const restarBoleto = () => setCantidadBoletos(prev => Math.max(prev - 1, 1));

  if (cargando) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-2 mb-20 animate-pulse space-y-4 px-2">
        <div className="flex justify-center mb-4"><div className="h-8 w-32 bg-slate-800 rounded-xl"></div></div>
        <div className="bg-slate-900/50 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-2xl space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="bg-slate-800/40 h-16 rounded-lg"></div>)}
        </div>
      </div>
    )
  }
  
  if (errorCarga) return <div className="text-red-400 font-bold text-center mt-10 text-sm bg-red-950/30 p-4 rounded-xl border border-red-900 max-w-md mx-auto">{errorCarga}</div>
  
  if (!quinielaActual || quinielasActivas.length === 0) return (
    <div className="flex flex-col items-center justify-center mt-16 p-6 max-w-lg mx-auto bg-slate-900/40 border border-slate-800 rounded-2xl text-center shadow-xl animate-in fade-in zoom-in-95">
      <span className="text-4xl mb-4 opacity-80">⚽</span>
      <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">No hay quinielas abiertas</h3>
      <p className="text-slate-400 text-sm leading-relaxed">En este momento no tenemos jornadas disponibles. Mantente atento a nuestras próximas aperturas.</p>
    </div>
  )

  const prem = quinielaActual.tipo_premiacion || 'unico';
  const costoUnitario = quinielaActual.precio_ticket || 0;
  const costoTotal = esSorteo ? costoUnitario * cantidadBoletos : costoUnitario;

  // ⚡ LÓGICA DE BARRA DE PROGRESO
  const totalPartidos = partidos.length;
  const partidosLlenos = partidos.filter(p => {
      const sel = selecciones[p.id];
      if (!sel) return false;
      if (esMarcadorExacto) return /^\d+-\d+$/.test(sel.trim());
      return ['L', 'E', 'V'].includes(sel.trim());
  }).length;
  
  const porcentajeProgreso = totalPartidos > 0 ? (partidosLlenos / totalPartidos) * 100 : 0;
  const faltanPartidos = partidosLlenos < totalPartidos;

  return (
    <div className="w-full max-w-4xl mx-auto mt-2 mb-20 animate-in fade-in duration-500 relative">
      
      {/* SELECTOR DE QUINIELAS ABIERTAS */}
      {quinielasActivas.length > 1 && (
        <div className="flex flex-wrap gap-2 justify-center mb-4 bg-slate-900/80 p-2 rounded-2xl border border-slate-800 shadow-xl w-full mx-auto">
          {quinielasActivas.map(q => (
            <button
              key={q.id}
              onClick={() => { setMensajeUI({ tipo: '', texto: '' }); cambiarQuinielaVisible(q); }}
              className={`px-4 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                quinielaActual.id === q.id ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-105' : 'bg-slate-950 text-slate-500 border border-slate-800 hover:text-slate-300'
              }`}
            >
              {q.modalidad === 'sorteo' ? '🎲' : '⚽'} {q.nombre_jornada}
            </button>
          ))}
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <div className={`bg-slate-900/50 p-4 md:p-6 rounded-2xl border shadow-2xl relative overflow-hidden w-full mx-auto ${esSorteo ? 'border-blue-900/50' : 'border-slate-800'}`}>
        
        {/* CABECERA */}
        <div className="text-center mb-6 border-b border-slate-800 pb-4 relative">
          <button onClick={() => setMostrarReglas(true)} className="absolute top-0 right-0 bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[9px] md:text-[10px] font-black uppercase px-2 py-1.5 rounded-lg transition-all shadow-inner">
            📜 Reglas
          </button>

          <h2 className={`text-2xl md:text-3xl font-black uppercase italic ${esSorteo ? 'text-blue-400' : 'text-white'}`}>{quinielaActual.nombre_jornada}</h2>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <span className="bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              Costo Unit: {esGratis ? 'GRATIS' : `$${costoUnitario}.00`}
            </span>
            <span className="bg-purple-950/40 border border-purple-900/50 text-purple-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              🏆 Premiación: {prem === 'unico' ? 'Ganador Único' : prem === 'top2' ? 'Top 2' : prem === 'top3' ? 'Top 3' : 'Promocional'}
            </span>
            {esSorteo && (
              <span className={`px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest border ${lugaresDisponibles > 0 ? 'bg-amber-950/40 border-amber-900/50 text-amber-400' : 'bg-red-950/40 border-red-900/50 text-red-500'}`}>
                🎰 {lugaresDisponibles > 0 ? `Cupo Disponible: ${lugaresDisponibles}/8` : 'SALA LLENA (0/8)'}
              </span>
            )}
            {esMarcadorExacto && (
              <span className="bg-green-950/40 border border-green-900/50 text-green-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
                🎯 Marcador Exacto
              </span>
            )}
          </div>
        </div>

        {/* ⚡ VISTA CONDICIONAL: SORTEO VS PARTIDOS TRADICIONALES */}
        {esSorteo ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 bg-blue-950/20 rounded-xl border border-blue-900/40 mb-6">
            <span className="text-6xl mb-4 opacity-90 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]">🎟️</span>
            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2 text-center">Boleto de Acceso Virtual</h3>
            <p className="text-slate-400 text-xs text-center max-w-sm leading-relaxed mb-6">
              Asegura tus lugares en el bombo. El sistema te asignará aleatoriamente un equipo por cada pase comprado una vez que la sala se llene.
            </p>

            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full max-w-xs flex flex-col items-center gap-3 shadow-inner">
               <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">¿Cuántos pases deseas?</label>
               <div className="flex items-center gap-4">
                 <button onClick={restarBoleto} disabled={cantidadBoletos <= 1 || bloqueadoPorParticipacion} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 shadow-sm">-</button>
                 <span className="text-4xl font-black text-white w-12 text-center">{cantidadBoletos}</span>
                 <button onClick={sumarBoleto} disabled={cantidadBoletos >= lugaresDisponibles || bloqueadoPorParticipacion} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 shadow-sm">+</button>
               </div>
               <div className="mt-2 text-blue-400 font-black uppercase text-sm bg-blue-950/30 px-4 py-1.5 rounded-lg border border-blue-900/50">
                 Total a Pagar: ${costoTotal}.00
               </div>
            </div>
          </div>
        ) : (
          <>
            {/* 🎟️ VISTA JUGAR TICKET NORMAL (CLÁSICA O EXACTO) */}
            <div className="space-y-2 md:space-y-3">
              {partidos.map((partido) => {
                const seleccion = selecciones[partido.id] || '';
                const logoL = obtenerLogo(partido.equipo_local);
                const logoV = obtenerLogo(partido.equipo_visitante);
                const fechaObj = formatearFechaObj(partido.fecha_hora);

                const [golesL, golesV] = seleccion.split('-');
                const valL = golesL !== undefined ? golesL : '';
                const valV = golesV !== undefined ? golesV : '';

                return (
                  <div key={partido.id} className={`bg-slate-800/60 px-3 py-2.5 md:p-3 rounded-lg border flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 transition-all shadow-sm relative group ${bloqueadoPorParticipacion ? 'border-slate-800 opacity-60' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/90'}`}>
                    
                    <div className="w-full md:w-[80px] text-center md:text-left border-b md:border-b-0 md:border-r border-slate-700/50 pb-2 md:pb-0 md:pr-3 flex md:block justify-center items-center gap-2 shrink-0">
                      {fechaObj ? (
                        <><span className="block text-blue-400 font-black text-[10px] uppercase tracking-widest">{fechaObj.fecha}</span><span className="block text-slate-400 font-bold text-[9px] mt-0.5">{fechaObj.hora}</span></>
                      ) : (
                        <span className="block text-slate-500 text-[9px] uppercase tracking-widest">Definir</span>
                      )}
                    </div>

                    <div className="flex-1 w-full flex justify-between md:justify-center items-center text-[11px] md:text-xs font-bold uppercase tracking-wide gap-2 md:gap-4">
                      <div className="flex items-center justify-end gap-2 flex-1">
                        <span className="text-right text-slate-200 truncate leading-tight">{partido.equipo_local}</span>
                        {logoL ? <img src={logoL} alt="" className="w-6 h-6 md:w-8 md:h-8 object-contain shrink-0" /> : <div className="w-6 h-6 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-500">?</div>}
                      </div>
                      <span className="text-slate-600 text-[9px] font-black shrink-0">VS</span>
                      <div className="flex items-center justify-start gap-2 flex-1">
                        {logoV ? <img src={logoV} alt="" className="w-6 h-6 md:w-8 md:h-8 object-contain shrink-0" /> : <div className="w-6 h-6 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-500">?</div>}
                        <span className="text-left text-slate-200 truncate leading-tight">{partido.equipo_visitante}</span>
                      </div>
                    </div>

                    <div className="w-full md:w-[130px] shrink-0 mt-1 md:mt-0 flex justify-center">
                      {esMarcadorExacto ? (
                        <div className="flex items-center justify-center gap-1.5 w-full">
                          <input
                            type="number"
                            min="0"
                            placeholder="L"
                            value={valL}
                            onChange={(e) => { 
                              setMensajeUI({ tipo: '', texto: '' }); 
                              seleccionarOpcion(partido.id, `${e.target.value}-${valV}`); 
                            }}
                            disabled={bloqueadoPorParticipacion}
                            className="w-12 bg-slate-900 border border-slate-700 rounded-md p-1.5 text-center text-sm font-black text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-inner transition-all"
                          />
                          <span className="text-slate-500 font-bold text-xs">-</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="V"
                            value={valV}
                            onChange={(e) => { 
                              setMensajeUI({ tipo: '', texto: '' }); 
                              seleccionarOpcion(partido.id, `${valL}-${e.target.value}`); 
                            }}
                            disabled={bloqueadoPorParticipacion}
                            className="w-12 bg-slate-900 border border-slate-700 rounded-md p-1.5 text-center text-sm font-black text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-inner transition-all"
                          />
                        </div>
                      ) : (
                        <div className="flex gap-1 md:gap-1.5 w-full">
                          {['L', 'E', 'V'].map((opc) => (
                            <button 
                              key={opc}
                              onClick={() => { setMensajeUI({ tipo: '', texto: '' }); seleccionarOpcion(partido.id, opc); }}
                              disabled={bloqueadoPorParticipacion}
                              className={`flex-1 py-1.5 md:py-2 rounded text-xs font-black transition-all border shadow-sm ${
                                seleccion === opc ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)] md:scale-105' : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'
                              } ${bloqueadoPorParticipacion ? 'cursor-not-allowed' : ''}`}
                            >
                              {opc}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )
              })}
            </div>

            {/* ⚡ UI INTELIGENTE: CRITERIO DESEMPATE AUTOMÁTICO VS MANUAL */}
            {esMarcadorExacto ? (
              <div className={`mt-6 mb-5 p-4 bg-green-950/20 border border-green-900/40 rounded-2xl max-w-[280px] mx-auto text-center shadow-inner z-10 relative ${bloqueadoPorParticipacion ? 'opacity-60' : ''}`}>
                <label className="block text-green-400 font-black uppercase text-[9px] md:text-[10px] tracking-[0.2em] mb-1">Criterio Desempate</label>
                <p className="text-slate-400 text-[8px] md:text-[9px] uppercase mb-3 font-bold tracking-tight">Suma Automática de Goles</p>
                <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-center text-3xl font-black text-white shadow-inner">
                  {golesAutomaticos}
                </div>
              </div>
            ) : (
              <div className={`mt-8 mb-5 p-4 bg-blue-950/40 border border-blue-900/50 rounded-2xl max-w-[280px] mx-auto text-center shadow-xl z-10 relative ${bloqueadoPorParticipacion ? 'opacity-60' : ''}`}>
                <label className="block text-blue-400 font-black uppercase text-[9px] md:text-[10px] tracking-[0.2em] mb-1">Criterio Desempate</label>
                <p className="text-slate-400 text-[8px] md:text-[9px] uppercase mb-3 font-bold tracking-tight">Total de goles en la jornada</p>
                <input 
                  type="number" placeholder="00" value={golesTotales}
                  onChange={(e) => { setMensajeUI({ tipo: '', texto: '' }); setGolesTotales(e.target.value); }}
                  disabled={bloqueadoPorParticipacion}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-center text-3xl font-black text-white focus:border-blue-500 outline-none transition-all disabled:cursor-not-allowed disabled:text-slate-500"
                />
              </div>
            )}
            
            {/* ⚡ BARRA DE PROGRESO DE PREDICCIONES */}
            {totalPartidos > 0 && (
                <div className="w-full max-w-[280px] mx-auto mb-6">
                    <div className="flex justify-between items-center mb-1.5 px-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Progreso del Ticket</span>
                        <span className={`text-[10px] font-black ${faltanPartidos ? 'text-amber-500' : 'text-green-500 animate-pulse'}`}>
                            {partidosLlenos} / {totalPartidos}
                        </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                        <div 
                            className={`h-full transition-all duration-500 ${faltanPartidos ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'}`}
                            style={{ width: `${porcentajeProgreso}%` }}
                        ></div>
                    </div>
                </div>
            )}
          </>
        )}

        {/* ZONA DE CHECKOUT COMÚN */}
        <div className="w-full max-w-[280px] mx-auto flex items-start gap-2 mb-5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
          <input 
            type="checkbox" id="check-reglas" checked={aceptoReglas} 
            onChange={(e) => { setMensajeUI({ tipo: '', texto: '' }); setAceptoReglas(e.target.checked); }} 
            disabled={bloqueadoPorParticipacion} 
            className="mt-0.5 w-3.5 h-3.5 accent-green-600 rounded border-slate-700 bg-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" 
          />
          <label htmlFor="check-reglas" className="text-[9px] font-bold uppercase tracking-wide text-slate-400 select-none">
            He leído las <span onClick={(e) => { e.preventDefault(); setMostrarReglas(true); }} className="text-blue-400 underline hover:text-blue-300 cursor-pointer">reglas oficiales</span> y acepto las políticas.
          </label>
        </div>

        {mensajeUI.texto && (
          <div className={`mb-5 mx-auto w-full text-center text-[11px] font-black uppercase tracking-wider py-4 px-4 rounded-xl border-2 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ${
            mensajeUI.tipo === 'error' 
              ? 'bg-red-950/80 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
              : 'bg-green-950/80 border-green-500 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
          }`}>
            <span className="text-lg block mb-1">{mensajeUI.tipo === 'error' ? '⚠️' : '✅'}</span>
            {mensajeUI.texto}
          </div>
        )}

        <div className="flex flex-col items-center pt-2 border-t border-slate-800 z-10 relative">
          <button 
            onClick={handleGuardar}
            // ⚡ BOTÓN BLOQUEADO HASTA QUE SE LLENEN LOS PARTIDOS
            disabled={guardando || !aceptoReglas || bloqueadoPorParticipacion || mensajeUI.tipo === 'exito' || (!esSorteo && faltanPartidos)}
            className={`w-full max-w-[280px] py-3 md:py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
              mensajeUI.tipo === 'exito' ? 'bg-green-900 text-green-400 border border-green-700 cursor-default'
              : bloqueadoPorParticipacion && esSorteo ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700 shadow-inner'
              : bloqueadoPorParticipacion && esGratis ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700 shadow-inner' 
              : (!esSorteo && faltanPartidos) ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700 opacity-80'
              : (guardando || !aceptoReglas) ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
              : esSorteo ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:scale-105 active:scale-95'
              : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105 active:scale-95'
            }`}
          >
            {mensajeUI.tipo === 'exito' ? '¡LISTO!' 
            : bloqueadoPorParticipacion && esSorteo ? 'SALA LLENA (AGOTADO)'
            : bloqueadoPorParticipacion && esGratis ? 'PROMO USADA (MÁX 1)' 
            : (!esSorteo && faltanPartidos) ? 'LLENA TU TICKET'
            : guardando ? 'Procesando Pago...' 
            : esSorteo ? `Comprar Pases ($${costoTotal})`
            : 'Confirmar Jugada'}
          </button>
        </div>
      </div>

      {mostrarReglas && <ModalReglas onClose={() => setMostrarReglas(false)} onAccept={() => { setAceptoReglas(true); setMostrarReglas(false); }} />}
    </div>
  )
}