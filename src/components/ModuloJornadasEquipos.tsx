'use client'
import { useState } from 'react'
import { useEquipos } from '@/hooks/useEquipos'
import { useCreadorJornadas } from '@/hooks/useCreadorJornadas'
import toast from 'react-hot-toast' // 🌟 Reemplazo de los alert()

interface ModuloJornadasEquiposProps {
  vista: 'crear' | 'equipos';
  cambiarVista: (vista: 'recargas' | 'resultados' | 'crear' | 'equipos' | 'captura') => void;
}

export default function ModuloJornadasEquipos({ vista, cambiarVista }: ModuloJornadasEquiposProps) {
  // --- HOOKS DE LÓGICA DE NEGOCIO ---
  const { equipos, cargandoEquipos, guardarEquipo: guardarEquipoDB } = useEquipos();
  const { 
    formulario: f, 
    setters: s, 
    acciones: a, 
    estado: e 
  } = useCreadorJornadas();

  // --- ESTADOS LOCALES UI ---
  const [ligaFiltroJornada, setLigaFiltroJornada] = useState('Todas');
  
  // Gestión de Equipos UI
  const [formEquipoNombre, setFormEquipoNombre] = useState('');
  const [formEquipoLogo, setFormEquipoLogo] = useState('');
  const [formEquipoLiga, setFormEquipoLiga] = useState('');
  const [equipoEditandoId, setEquipoEditandoId] = useState<string | null>(null);
  const [guardandoEquipo, setGuardandoEquipo] = useState(false);
  const [busquedaEquipo, setBusquedaEquipo] = useState('');
  const [filtroLigaEquipo, setFiltroLigaEquipo] = useState('Todas');

  const ligasDinamicas = Array.from(new Set(equipos.map(eq => eq.liga || 'Sin Liga'))).sort();

  // --- FUNCIONES GESTIÓN EQUIPOS UI ---
  const iniciarEdicionEquipo = (equipo: any) => { 
    setEquipoEditandoId(equipo.id)
    setFormEquipoNombre(equipo.nombre)
    setFormEquipoLogo(equipo.logo_url || '')
    setFormEquipoLiga(equipo.liga || '')
    window.scrollTo({ top: 0, behavior: 'smooth' }) 
  }
  
  const cancelarEdicionEquipo = () => { 
    setEquipoEditandoId(null)
    setFormEquipoNombre('')
    setFormEquipoLogo('')
    setFormEquipoLiga('') 
  }

  const handleGuardarEquipo = async () => {
    if (!formEquipoNombre) return toast.error('El nombre del equipo es obligatorio'); // 🌟 Toast
    setGuardandoEquipo(true)
    
    const urlLogoFinal = formEquipoLogo.trim() || 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
    const ligaFinal = formEquipoLiga.trim() || 'Sin Liga'
    
    const result = await guardarEquipoDB(equipoEditandoId, {
      nombre: formEquipoNombre.trim(),
      liga: ligaFinal,
      logo_url: urlLogoFinal
    });

    if (result.success) {
      toast.success(equipoEditandoId ? 'Equipo actualizado' : '¡Equipo guardado con éxito!'); // 🌟 Toast
      cancelarEdicionEquipo();
    } else {
      toast.error(result.message || 'Error al guardar el equipo'); // 🌟 Toast
    }
    
    setGuardandoEquipo(false);
  }

  // --- FUNCIÓN MANEJADORA DE CREACIÓN JORNADA ---
  const handleCrearJornada = async () => {
    const loadingToast = toast.loading('Procesando jornada...');
    const result = await a.crearJornadaCompleta();
    
    if (result.success) {
      toast.success(result.message, { id: loadingToast });
      cambiarVista('recargas'); // Redirige al cajero como lo tenías
    } else {
      toast.error(result.message, { id: loadingToast });
    }
  }

  // Filtros de Galería
  const equiposVisiblesEnGaleria = (equipos || []).filter(eq => {
    const coincideTexto = (eq.nombre || '').toLowerCase().includes(busquedaEquipo.toLowerCase())
    const coincideLiga = filtroLigaEquipo === 'Todas' || eq.liga === filtroLigaEquipo
    return coincideTexto && coincideLiga
  })

  const equiposAgrupados = ligasDinamicas.reduce((acc, liga) => {
    const eq = equiposVisiblesEnGaleria.filter(e => (e.liga || 'Sin Liga') === liga)
    if (eq.length > 0) acc[liga] = eq
    return acc
  }, {} as Record<string, any[]>)


  return (
    <>
      {/* --- VISTA: CREAR JORNADA --- */}
      {vista === 'crear' && (
        <div className="space-y-4 animate-in fade-in duration-300 w-full max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800 shadow-inner">
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Nombre de la Jornada</label>
              <input type="text" placeholder="Ej. Jornada 1" value={f.nombreJornada} onChange={(e) => s.setNombreJornada(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500 transition-all text-xs font-bold placeholder:text-slate-600" />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Cierre de Quiniela</label>
              <input type="datetime-local" value={f.fechaCierre} onChange={(e) => s.setFechaCierre(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500 transition-all text-xs font-bold" />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Precio (Créditos)</label>
              <input type="number" value={f.precioTicket} onChange={(e) => s.setPrecioTicket(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500 transition-all text-center font-black text-xs" />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Premiación</label>
              <select value={f.tipoPremiacion} onChange={(e: any) => s.setTipoPremiacion(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white outline-none focus:border-green-500 transition-all text-[10px] md:text-xs font-bold h-[34px]">
                <optgroup label="Cobro Normal (80%)">
                  <option value="unico">1ro (100%)</option>
                  <option value="top2">Top 2 (70-30)</option>
                  <option value="top3">Top 3 (60-25-15)</option>
                </optgroup>
                <optgroup label="Gratis (Fijos)">
                  <option value="promo_unico">Promo (1 Cr al 1ro)</option>
                  <option value="promo_top2">Promo (1 Cr al 1ro y 2do)</option>
                </optgroup>
              </select>
            </div>
          </div>
          
          <div className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">🎯 Filtrar Autocompletado:</span>
            <select value={ligaFiltroJornada} onChange={(e) => setLigaFiltroJornada(e.target.value)} className="w-full sm:w-auto bg-slate-900 text-xs py-1.5 px-3 rounded-lg border border-slate-700 text-white font-bold outline-none focus:border-green-500">
              <option value="Todas">Todas las Ligas</option>
              {ligasDinamicas.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="space-y-2.5">
            <label className="text-[10px] text-slate-500 font-bold uppercase block tracking-widest px-1">Partidos de la Jornada</label>
            <datalist id="lista-equipos">
              {equipos.filter(eq => ligaFiltroJornada === 'Todas' ? true : eq.liga === ligaFiltroJornada).map(eq => <option key={eq.id} value={eq.nombre} />)}
            </datalist>
            
            {(f.partidosNuevos || []).map((p, idx) => (
              <div key={idx} className="flex flex-col md:flex-row gap-2 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80 hover:border-slate-600 transition-colors relative group items-center">
                
                <div className="flex justify-between items-center w-full md:w-auto md:flex-col md:gap-1 border-b md:border-b-0 md:border-r border-slate-700/50 pb-2 md:pb-0 md:pr-3 shrink-0">
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Partido {idx + 1}</span>
                   <div className="flex gap-1">
                     <button onClick={() => a.moverPartido(idx, -1)} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center bg-slate-950 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all text-[10px]" title="Subir">▲</button>
                     <button onClick={() => a.moverPartido(idx, 1)} disabled={idx === f.partidosNuevos.length - 1} className="w-6 h-6 flex items-center justify-center bg-slate-950 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all text-[10px]" title="Bajar">▼</button>
                     <button onClick={() => a.eliminarPartido(idx)} disabled={f.partidosNuevos.length === 1} className="w-6 h-6 flex items-center justify-center bg-red-950/30 border border-red-900/50 rounded text-red-500 hover:text-red-400 hover:bg-red-900/50 disabled:opacity-30 transition-all text-[10px] ml-1" title="Eliminar">✕</button>
                   </div>
                </div>
                
                <div className="flex flex-1 w-full items-center gap-2">
                  <input list="lista-equipos" placeholder="Local" value={p.local} onChange={(ev) => a.actualizarPartidoInput(idx, 'local', ev.target.value)} className="flex-1 w-full bg-slate-950 text-xs md:text-sm p-2 rounded-lg border border-slate-700 text-white outline-none focus:border-green-500 font-bold uppercase text-right" />
                  <span className="text-[10px] font-black text-slate-600 italic shrink-0 w-4 text-center">VS</span>
                  <input list="lista-equipos" placeholder="Visita" value={p.visitante} onChange={(ev) => a.actualizarPartidoInput(idx, 'visitante', ev.target.value)} className="flex-1 w-full bg-slate-950 text-xs md:text-sm p-2 rounded-lg border border-slate-700 text-white outline-none focus:border-green-500 font-bold uppercase" />
                </div>
                
                <div className="w-full md:w-[150px] shrink-0">
                   <input type="datetime-local" value={p.fecha_hora} onChange={(ev) => a.actualizarPartidoInput(idx, 'fecha_hora', ev.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 outline-none focus:border-green-500 transition-all text-[10px] font-bold" />
                </div>
              </div>
            ))}
            <button onClick={a.agregarPartidoInput} className="w-full py-3 md:py-2.5 mt-1 border border-dashed border-slate-700 rounded-xl text-slate-500 font-black text-[10px] uppercase hover:bg-slate-800 hover:text-slate-300 hover:border-slate-500 transition-all tracking-widest">+ Agregar Partido</button>
          </div>
          
          <div className="pt-2">
            <button onClick={handleCrearJornada} disabled={e.creando} className={`w-full py-3.5 rounded-xl font-black uppercase tracking-[0.15em] transition-all flex justify-center items-center gap-2 text-xs md:text-sm ${e.creando ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:scale-[1.01] active:scale-95'}`}>
              {e.creando ? 'Procesando...' : <><span>🚀</span> Publicar Jornada en CiberTeque</>}
            </button>
          </div>
        </div>
      )}

      {/* --- VISTA: EQUIPOS (Se mantiene la lógica de ayer pero con Toasts) --- */}
      {vista === 'equipos' && (
        <div className="space-y-6 animate-in fade-in duration-300 w-full max-w-4xl mx-auto">
          <div className={`p-4 md:p-5 rounded-2xl border shadow-lg transition-colors ${equipoEditandoId ? 'bg-purple-950/20 border-purple-800/50' : 'bg-slate-900/50 border-slate-800'}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-xs md:text-sm font-black uppercase tracking-wider ${equipoEditandoId ? 'text-purple-400' : 'text-slate-300'}`}>{equipoEditandoId ? '✏️ Editando Equipo' : '🛡️ Registrar Equipo'}</h3>
              {equipoEditandoId && <button onClick={cancelarEdicionEquipo} className="text-[9px] font-bold text-slate-500 hover:text-slate-300 uppercase underline tracking-wider">Cancelar</button>}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-widest">Nombre del Equipo</label>
                <input type="text" placeholder="Ej. Toluca" value={formEquipoNombre} onChange={(e) => setFormEquipoNombre(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 font-bold text-xs" />
              </div>
              <datalist id="lista-ligas-db">{ligasDinamicas.map(l => <option key={l} value={l} />)}</datalist>
              <div>
                <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-widest">Liga</label>
                <input list="lista-ligas-db" placeholder="Ej. Liga MX" value={formEquipoLiga} onChange={(e) => setFormEquipoLiga(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 font-bold text-xs" />
              </div>
              <div>
                <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-widest">URL Logo (ESPN)</label>
                <input type="text" placeholder="https://..." value={formEquipoLogo} onChange={(e) => setFormEquipoLogo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-[10px] md:text-xs outline-none focus:border-purple-500 font-mono" />
              </div>
            </div>
            
            <button onClick={handleGuardarEquipo} disabled={guardandoEquipo} className={`w-full mt-4 text-white py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all shadow-md ${equipoEditandoId ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30' : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'}`}>
              {guardandoEquipo ? 'Procesando...' : equipoEditandoId ? '💾 Actualizar' : '➕ Agregar a BD'}
            </button>
          </div>
          
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <input type="text" placeholder="Buscar por nombre..." value={busquedaEquipo} onChange={(e) => setBusquedaEquipo(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-bold placeholder:text-slate-600" />
              <select value={filtroLigaEquipo} onChange={(e) => setFiltroLigaEquipo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-bold">
                <option value="Todas">Todas las Ligas</option>
                {ligasDinamicas.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            
            {cargandoEquipos ? (
              <div className="space-y-6 animate-pulse">
                <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                  <div className="h-4 bg-slate-800 rounded w-1/4 mb-4"></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center gap-2">
                        <div className="w-10 h-10 bg-slate-800 rounded-full"></div>
                        <div className="w-full h-3 bg-slate-800 rounded"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : Object.keys(equiposAgrupados || {}).length === 0 ? (
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-8 text-center">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">No se encontraron equipos.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.keys(equiposAgrupados).sort().map(liga => (
                  <div key={liga} className="bg-slate-950/30 p-3 md:p-4 rounded-xl border border-slate-800/50">
                    <h5 className="text-[10px] md:text-xs text-purple-400 font-black uppercase tracking-widest mb-3 border-b border-slate-800/80 pb-2">{liga} <span className="text-slate-600 font-bold ml-1">({equiposAgrupados[liga]?.length || 0})</span></h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
                      {(equiposAgrupados[liga] || []).map(eq => (
                        <div key={eq.id} onClick={() => iniciarEdicionEquipo(eq)} className={`p-2 rounded-lg flex flex-col items-center gap-1.5 cursor-pointer transition-all border shadow-sm group ${equipoEditandoId === eq.id ? 'bg-purple-900/30 border-purple-500/50 scale-[1.02]' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-800'}`} title="Editar equipo">
                          <div className="w-10 h-10 flex items-center justify-center bg-slate-950 rounded-full border border-slate-800/80 p-1.5 group-hover:border-slate-600 transition-colors">
                            <img src={eq.logo_url} alt="" className="w-full h-full object-contain drop-shadow-md" onError={(evt:any)=>{evt.target.src='https://a.espncdn.com/i/teamlogos/default-soccer-35.png'}} />
                          </div>
                          <span className="text-[9px] md:text-[10px] font-bold text-slate-300 truncate uppercase w-full text-center group-hover:text-white transition-colors">{eq.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}