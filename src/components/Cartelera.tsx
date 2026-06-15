'use client'
import { useState } from 'react'
import { useCartelera } from '@/hooks/useCartelera'

export default function Cartelera({ usuarioActivo, actualizarSaldo }: { usuarioActivo: any, actualizarSaldo: (nuevoSaldo: number) => void }) {
  const {
    cargando, errorCarga, quinielasActivas, quinielaActual, partidos, selecciones, golesTotales,
    guardando, estaCerrada, motivoCierre, mostrarReglas, aceptoReglas, radiografia, cargandoRadiografia,
    golesRealesEnVivo, // 🔥 Recibimos los goles reales desde el hook
    esGratis, bloqueadoPorParticipacion, setGolesTotales, setMostrarReglas,
    setAceptoReglas, cambiarQuinielaVisible, seleccionarOpcion, guardarQuiniela, obtenerLogo
  } = useCartelera(usuarioActivo, actualizarSaldo)

  const [mensajeUI, setMensajeUI] = useState({ tipo: '', texto: '' })

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const fechaCorta = fechaDB.substring(0, 16);
    const d = new Date(fechaCorta);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
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

  const handleGuardar = async () => {
    setMensajeUI({ tipo: '', texto: '' })
    const resultado = await guardarQuiniela();
    if (resultado?.error) {
      setMensajeUI({ tipo: 'error', texto: resultado.error });
    } else if (resultado?.success) {
      setMensajeUI({ tipo: 'exito', texto: resultado.success });
    }
  }

  if (cargando) {
    return (
      <div className="w-full max-w-4xl mt-2 mb-20 animate-pulse space-y-4">
        <div className="flex justify-center gap-2 mb-4">
          <div className="h-8 w-24 bg-slate-800 rounded-xl"></div>
          <div className="h-8 w-24 bg-slate-800 rounded-xl"></div>
        </div>
        <div className="bg-slate-900/50 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="flex flex-col items-center mb-6 border-b border-slate-800 pb-4 space-y-3">
             <div className="h-8 w-3/4 md:w-1/2 bg-slate-800 rounded-lg"></div>
             <div className="h-6 w-40 bg-slate-800 rounded-lg"></div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-slate-800/40 h-16 rounded-lg border border-slate-700/50"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  
  if (errorCarga) return <div className="text-red-400 font-bold text-center mt-10 text-sm bg-red-950/30 p-4 rounded-xl border border-red-900 max-w-md mx-auto">{errorCarga}</div>
  if (!quinielaActual) return <div className="text-slate-500 italic text-center mt-10 text-sm">No hay quinielas disponibles.</div>

  const prem = quinielaActual.tipo_premiacion || 'unico';

  return (
    <div className="w-full max-w-5xl mt-2 mb-20 animate-in fade-in duration-500 relative">
      
      {/* SELECTOR DE QUINIELAS */}
      {quinielasActivas.length > 1 && (
        <div className="flex flex-wrap gap-2 justify-center mb-4 bg-slate-900/80 p-2 rounded-2xl border border-slate-800 shadow-xl w-full max-w-4xl mx-auto">
          {quinielasActivas.map(q => {
            const yaPasoCierre = new Date() > new Date(q.fecha_cierre ? q.fecha_cierre.substring(0, 16) : '');
            return (
              <button
                key={q.id}
                onClick={() => {
                  setMensajeUI({ tipo: '', texto: '' });
                  cambiarQuinielaVisible(q);
                }}
                className={`px-4 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  quinielaActual.id === q.id 
                  ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-105' 
                  : 'bg-slate-950 text-slate-500 border border-slate-800 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                {yaPasoCierre && <span className="text-[10px] opacity-70">🔒</span>}
                {q.nombre_jornada}
              </button>
            )
          })}
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <div className={`p-4 md:p-6 rounded-2xl border shadow-2xl relative overflow-hidden w-full mx-auto ${estaCerrada ? 'bg-slate-950 border-amber-900/40 max-w-5xl' : 'bg-slate-900/50 border-slate-800 max-w-4xl'}`}>
        
        {/* CABECERA (Compartida) */}
        <div className="text-center mb-6 border-b border-slate-800 pb-4 relative">
          {!estaCerrada && (
            <button onClick={() => setMostrarReglas(true)} className="absolute top-0 right-0 bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[9px] md:text-[10px] font-black uppercase px-2 py-1.5 rounded-lg transition-all shadow-inner">
              📜 Reglas
            </button>
          )}

          <h2 className={`text-2xl md:text-3xl font-black uppercase italic ${estaCerrada ? 'text-amber-500' : 'text-white'}`}>{quinielaActual.nombre_jornada}</h2>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {/* 🔥 CORRECCIÓN DEL PRECIO EN PESOS: Eliminamos el * 30 */}
            <span className="bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              Costo: {esGratis ? 'GRATIS (1 MÁX)' : `$${quinielaActual.precio_ticket || 0}.00 Pesos`}
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

          <div className={`mt-3 mb-1 inline-block px-3 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-inner ${estaCerrada ? 'bg-amber-950/40 border border-amber-900/60 text-amber-400' : 'bg-red-950/40 border border-red-900/60 text-red-400'}`}>
            {estaCerrada ? '🔒 ' : '⏳ Cierre: '}{estaCerrada ? motivoCierre : formatearFechaLocal(quinielaActual.fecha_cierre)}
          </div>
        </div>

        {/* 🩻 VISTA RADIOGRAFÍA (SI ESTÁ CERRADA) */}
        {estaCerrada ? (
          <div className="animate-in slide-in-from-bottom-4 duration-500 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            {cargandoRadiografia ? (
               <div className="text-center py-10 text-slate-500 font-bold uppercase text-xs animate-pulse tracking-widest">Cargando resultados en vivo...</div>
            ) : radiografia.length === 0 ? (
               <div className="text-center py-10 text-slate-500 font-bold uppercase text-xs tracking-widest">Nadie participó en esta jornada.</div>
            ) : (
              <div className="w-full overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-slate-950 [&::-webkit-scrollbar-thumb]:bg-amber-600 [&::-webkit-scrollbar-thumb]:rounded-full">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr>
                      {/* Cabecera Jugador */}
                      <th className="sticky left-0 bg-slate-950 p-3 border-b border-slate-800 border-r text-[9px] md:text-xs text-slate-400 uppercase tracking-widest z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                        👥 Jugadores ({radiografia.length})
                      </th>
                      
                      {/* Cabeceras Partidos */}
                      {partidos.map((p, index) => {
                        const logoL = obtenerLogo(p.equipo_local)
                        const logoV = obtenerLogo(p.equipo_visitante)
                        return (
                          <th key={p.id} className="p-2 border-b border-slate-800 border-r border-slate-800/50 text-center min-w-[70px] bg-slate-900">
                            <div className="text-[8px] text-slate-500 mb-1 font-black">P{index + 1}</div>
                            <div className="flex justify-center items-center gap-1 mb-1">
                              {logoL ? <img src={logoL} className="w-4 h-4 object-contain" alt="L"/> : <span className="text-[8px] truncate max-w-[25px]">{p.equipo_local}</span>}
                              <span className="text-[7px] text-slate-600 font-black">v</span>
                              {logoV ? <img src={logoV} className="w-4 h-4 object-contain" alt="V"/> : <span className="text-[8px] truncate max-w-[25px]">{p.equipo_visitante}</span>}
                            </div>
                            <div className={`mt-1 mx-auto w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shadow-inner border ${p.resultado_real ? 'bg-amber-500 text-slate-900 border-amber-400' : 'bg-slate-950 text-slate-500 border-slate-800'}`} title="Resultado Oficial">
                              {p.resultado_real || '?'}
                            </div>
                          </th>
                        )
                      })}

                      {/* 🔥 NUEVO: Cabecera Diferencia de Goles */}
                      <th className="p-2 border-b border-slate-800 border-r border-slate-800/50 bg-slate-950 text-center text-[10px] text-slate-300 font-black uppercase tracking-widest z-10" title="Diferencia de goles (Desempate)">
                        DIF<br/>
                        <span className="text-[8px] text-amber-500 font-bold block mt-0.5">
                          Real: {golesRealesEnVivo !== null ? golesRealesEnVivo : '?'}
                        </span>
                      </th>
                      
                      {/* Cabecera Puntos Totales */}
                      <th className="p-3 border-b border-slate-800 bg-slate-950 text-center text-[10px] text-amber-500 font-black uppercase tracking-widest sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                        PTS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {radiografia.map((user, i) => (
                      <tr key={user.id} className="hover:bg-slate-800/50 transition-colors group">
                        
                        {/* Columna Jugador */}
                        <td className="sticky left-0 bg-slate-950 group-hover:bg-slate-900 p-2 border-b border-slate-800/50 border-r flex items-center gap-2 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] transition-colors">
                          <span className="text-slate-500 font-black text-[9px] w-3 text-right">{i+1}.</span>
                          <img src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.nombre}&background=1e293b&color=cbd5e1`} alt="" className="w-6 h-6 md:w-8 md:h-8 rounded-full border border-slate-700 bg-slate-800" />
                          <div className="flex flex-col">
                            <span className="text-[10px] md:text-xs font-bold text-slate-200 uppercase truncate max-w-[90px] md:max-w-[150px]">{user.nombre}</span>
                            <span className="text-[8px] text-slate-500 font-mono">Goles (Pick): {user.goles}</span>
                          </div>
                        </td>

                        {/* Columnas Predicciones */}
                        {partidos.map((p) => {
                          const pick = user.picks[p.id] || '-'
                          const real = p.resultado_real
                          
                          let bgClass = "bg-slate-800 text-slate-400 border-slate-700" // Pendiente
                          if (real) {
                            if (pick === real) bgClass = "bg-green-600/20 text-green-400 border-green-600/50 shadow-[0_0_10px_rgba(22,163,74,0.1)]" // Acierto
                            else bgClass = "bg-red-950/30 text-red-500/50 border-red-900/30" // Fallo
                          }

                          return (
                            <td key={p.id} className="p-1 border-b border-r border-slate-800/50 text-center">
                              <div className={`mx-auto w-7 h-7 rounded flex items-center justify-center text-[11px] font-black border transition-all ${bgClass}`}>
                                {pick}
                              </div>
                            </td>
                          )
                        })}

                        {/* 🔥 NUEVO: Celda de Diferencia de Goles */}
                        <td className="p-2 border-b border-r border-slate-800/50 text-center bg-slate-950 group-hover:bg-slate-900 transition-colors">
                          <span className="text-xs md:text-sm font-mono font-bold text-slate-400">
                            {user.golesDiff === 999 ? '-' : user.golesDiff}
                          </span>
                        </td>

                        {/* Columna Puntos */}
                        <td className="p-2 border-b border-slate-800/50 text-center sticky right-0 bg-slate-950 group-hover:bg-slate-900 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)] transition-colors">
                          <span className="text-base md:text-lg font-black text-white drop-shadow-md">{user.aciertos}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          
          /* 🎟️ VISTA JUGAR TICKET (SI ESTÁ ABIERTA) */
          <>
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
                            onClick={() => {
                              setMensajeUI({ tipo: '', texto: '' });
                              seleccionarOpcion(partido.id, opc);
                            }}
                            disabled={bloqueadoPorParticipacion}
                            className={`flex-1 py-1.5 md:py-2 rounded text-xs font-black transition-all border shadow-sm ${
                              seleccion === opc 
                              ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)] md:scale-105' 
                              : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
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
                type="number"
                placeholder="00"
                value={golesTotales}
                onChange={(e) => {
                  setMensajeUI({ tipo: '', texto: '' }); 
                  setGolesTotales(e.target.value);
                }}
                disabled={bloqueadoPorParticipacion}
                className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-center text-3xl font-black text-white focus:border-blue-500 outline-none transition-all ${bloqueadoPorParticipacion ? 'cursor-not-allowed text-slate-500' : ''}`}
              />
            </div>

            <div className="w-full max-w-[280px] mx-auto flex items-start gap-2 mb-5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
              <input 
                type="checkbox" 
                id="check-reglas" 
                checked={aceptoReglas} 
                onChange={(e) => {
                  setMensajeUI({ tipo: '', texto: '' });
                  setAceptoReglas(e.target.checked);
                }} 
                disabled={bloqueadoPorParticipacion} 
                className={`mt-0.5 w-3.5 h-3.5 accent-green-600 rounded border-slate-700 bg-slate-900 cursor-pointer ${bloqueadoPorParticipacion ? 'cursor-not-allowed opacity-50' : ''}`} 
              />
              <label htmlFor="check-reglas" className={`text-[9px] font-bold uppercase tracking-wide text-slate-400 select-none ${bloqueadoPorParticipacion ? '' : 'cursor-pointer'}`}>
                He leído las <span onClick={(e) => { e.preventDefault(); setMostrarReglas(true); }} className="text-blue-400 underline hover:text-blue-300 cursor-pointer">reglas oficiales</span> y acepto los criterios.
              </label>
            </div>

            {mensajeUI.texto && (
              <div className={`mb-4 mx-auto max-w-sm text-center text-[10px] font-bold uppercase tracking-wider py-2.5 px-4 rounded-xl border animate-in zoom-in-95 ${
                mensajeUI.tipo === 'error' ? 'bg-red-950/30 border-red-900/50 text-red-400' : 'bg-green-950/30 border-green-900/50 text-green-400'
              }`}>
                {mensajeUI.texto}
              </div>
            )}

            <div className="flex flex-col items-center pt-2 border-t border-slate-800 z-10 relative">
              <button 
                onClick={handleGuardar}
                disabled={guardando || !aceptoReglas || bloqueadoPorParticipacion}
                className={`w-full max-w-[280px] py-3 md:py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
                  bloqueadoPorParticipacion 
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700 shadow-inner' 
                  : (guardando || !aceptoReglas)
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                    : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105 active:scale-95'
                }`}
              >
                {bloqueadoPorParticipacion ? 'YA PARTICIPASTE (MÁX 1)' : guardando ? 'Guardando...' : 'Confirmar Jugada'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* MODAL DEL REGLAMENTO */}
      {mostrarReglas && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5 mb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2 uppercase tracking-tight"><span>📜</span> Reglamento CiberTeque</h3>
              <button onClick={() => setMostrarReglas(false)} className="text-slate-500 hover:text-slate-300 font-bold font-mono text-lg">✕</button>
            </div>
            
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