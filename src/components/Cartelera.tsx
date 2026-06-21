'use client'
import { useState, useEffect, useRef } from 'react'
import { useCartelera } from '@/hooks/useCartelera'
import ModalReglas from '@/components/ModalReglas' // 👈 Importamos tu nuevo componente modular

export default function Cartelera({ usuarioActivo, actualizarSaldo }: { usuarioActivo: any, actualizarSaldo: (nuevoSaldo: number) => void }) {
  const {
    cargando, errorCarga, quinielasActivas, quinielaActual, partidos, selecciones, golesTotales,
    guardando, mostrarReglas, aceptoReglas, esGratis, bloqueadoPorParticipacion, setGolesTotales, setMostrarReglas,
    setAceptoReglas, cambiarQuinielaVisible, seleccionarOpcion, guardarQuiniela, obtenerLogo
  } = useCartelera(usuarioActivo, actualizarSaldo)

  const [mensajeUI, setMensajeUI] = useState({ tipo: '', texto: '' })
  
  // 🔥 Candado estricto en memoria para evitar doble clic y cobros múltiples
  const procesandoRef = useRef(false)

  // Limpiar el mensaje de éxito automáticamente después de 5 segundos
  useEffect(() => {
    if (mensajeUI.tipo === 'exito') {
      const timer = setTimeout(() => {
        setMensajeUI({ tipo: '', texto: '' })
      }, 5000)
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
    // 🛑 BLOQUEO INMEDIATO: Si ya está procesando, ignora clics adicionales (metralleta de dedos)
    if (procesandoRef.current) return;
    
    procesandoRef.current = true;
    setMensajeUI({ tipo: '', texto: '' });
    
    try {
      const resultado = await guardarQuiniela();
      
      if (resultado?.error) {
        setMensajeUI({ tipo: 'error', texto: resultado.error });
      } else if (resultado?.success) {
        setMensajeUI({ tipo: 'exito', texto: resultado.success || '¡Jugada guardada con éxito! Los partidos sin marcar se guardaron como Empate.' });
      }
      
      // Hacemos scroll hacia el mensaje para asegurarnos de que lo vea (con un ligero delay para el render)
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);

    } finally {
      // 🔓 ABRIMOS EL CANDADO
      procesandoRef.current = false;
    }
  }

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
  
  // 🚨 UI LIMPIA: Si no hay quinielas disponibles, mostramos el aviso y listo.
  if (!quinielaActual || quinielasActivas.length === 0) return (
    <div className="flex flex-col items-center justify-center mt-16 p-6 max-w-lg mx-auto bg-slate-900/40 border border-slate-800 rounded-2xl text-center shadow-xl animate-in fade-in zoom-in-95">
      <span className="text-4xl mb-4 opacity-80">⚽</span>
      <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">No hay quinielas abiertas</h3>
      <p className="text-slate-400 text-sm leading-relaxed">En este momento no tenemos jornadas disponibles para pronosticar. Mantente atento a nuestras próximas aperturas o revisa la pestaña de <strong className="text-white">Posiciones</strong> para ver los resultados en curso.</p>
    </div>
  )

  const prem = quinielaActual.tipo_premiacion || 'unico';

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
              {q.nombre_jornada}
            </button>
          ))}
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <div className="bg-slate-900/50 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden w-full mx-auto">
        
        {/* CABECERA */}
        <div className="text-center mb-6 border-b border-slate-800 pb-4 relative">
          <button onClick={() => setMostrarReglas(true)} className="absolute top-0 right-0 bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[9px] md:text-[10px] font-black uppercase px-2 py-1.5 rounded-lg transition-all shadow-inner">
            📜 Reglas
          </button>

          <h2 className="text-2xl md:text-3xl font-black uppercase italic text-white">{quinielaActual.nombre_jornada}</h2>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <span className="bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              Costo: {esGratis ? 'GRATIS (1 MÁX)' : `$${quinielaActual.precio_ticket || 0}.00 Pesos`}
            </span>
            <span className="bg-purple-950/40 border border-purple-900/50 text-purple-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              🏆 Premiación: {prem === 'unico' ? 'Ganador Único' : prem === 'top2' ? 'Top 2' : prem === 'top3' ? 'Top 3' : 'Promocional'}
            </span>
          </div>
        </div>

        {/* 🎟️ VISTA JUGAR TICKET */}
        <div className="space-y-2 md:space-y-3">
          {partidos.map((partido) => {
            const seleccion = selecciones[partido.id]
            const logoL = obtenerLogo(partido.equipo_local)
            const logoV = obtenerLogo(partido.equipo_visitante)
            const fechaObj = formatearFechaObj(partido.fecha_hora)

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

                <div className="w-full md:w-[130px] shrink-0 mt-1 md:mt-0">
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
                </div>
              </div>
            )
          })}
        </div>

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

        <div className="w-full max-w-[280px] mx-auto flex items-start gap-2 mb-5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
          <input 
            type="checkbox" id="check-reglas" checked={aceptoReglas} 
            onChange={(e) => { setMensajeUI({ tipo: '', texto: '' }); setAceptoReglas(e.target.checked); }} 
            disabled={bloqueadoPorParticipacion} 
            className="mt-0.5 w-3.5 h-3.5 accent-green-600 rounded border-slate-700 bg-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" 
          />
          <label htmlFor="check-reglas" className="text-[9px] font-bold uppercase tracking-wide text-slate-400 select-none">
            He leído las <span onClick={(e) => { e.preventDefault(); setMostrarReglas(true); }} className="text-blue-400 underline hover:text-blue-300 cursor-pointer">reglas oficiales</span> y acepto los criterios.
          </label>
        </div>

        {/* CONTENEDOR DE NOTIFICACIONES MEJORADO */}
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
            disabled={guardando || !aceptoReglas || bloqueadoPorParticipacion || mensajeUI.tipo === 'exito'}
            className={`w-full max-w-[280px] py-3 md:py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
              mensajeUI.tipo === 'exito' ? 'bg-green-900 text-green-400 border border-green-700 cursor-default'
              : bloqueadoPorParticipacion ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700 shadow-inner' 
              : (guardando || !aceptoReglas) ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
              : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105 active:scale-95'
            }`}
          >
            {mensajeUI.tipo === 'exito' ? '¡BOLETO ENVIADO!' 
            : bloqueadoPorParticipacion ? 'YA PARTICIPASTE (MÁX 1)' 
            : guardando ? 'Guardando...' 
            : 'Confirmar Jugada'}
          </button>
        </div>
      </div>

      {/* MODAL DEL REGLAMENTO REUTILIZABLE */}
      {mostrarReglas && (
        <ModalReglas 
          onClose={() => setMostrarReglas(false)} 
          onAccept={() => { setAceptoReglas(true); setMostrarReglas(false); }} 
        />
      )}
    </div>
  )
}