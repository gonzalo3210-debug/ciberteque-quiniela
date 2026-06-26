'use client'
import { useState, useMemo, useEffect } from 'react'
import { usePerfilUsuario } from '@/hooks/usePerfilUsuario'
import { supabase } from '@/lib/supabase' // 👈 Importamos el cliente nativo de Supabase

const SelectorConLogo = ({ label, opciones, valorActual, onChange, placeholder }: any) => {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<any>(null)

  useEffect(() => {
    setSeleccionado(opciones.find((o: any) => o.nombre === valorActual))
  }, [valorActual, opciones])

  const opcionesFiltradas = opciones.filter((op: any) =>
    op.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="relative mb-4">
      <label className="text-[9px] text-slate-400 font-bold uppercase mb-1 block tracking-widest">{label}</label>
      
      <div
        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs outline-none focus-within:border-blue-500 font-bold uppercase cursor-text flex justify-between items-center transition-colors hover:bg-slate-900"
        onClick={() => setAbierto(true)}
      >
        <div className="flex items-center gap-2 flex-1 overflow-hidden">
          {seleccionado?.logo_url && !abierto ? (
            <img src={seleccionado.logo_url} className="w-5 h-5 object-contain shrink-0" alt="" />
          ) : !abierto ? (
            <div className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-[8px] text-slate-400 shrink-0">?</div>
          ) : (
            <span className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0">🔍</span>
          )}
          
          <input 
            type="text"
            className="bg-transparent border-none outline-none w-full text-white placeholder:text-slate-500 truncate"
            placeholder={seleccionado ? seleccionado.nombre : placeholder}
            value={abierto ? busqueda : (seleccionado ? seleccionado.nombre : '')}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setAbierto(true)
            }}
            onFocus={() => {
              setAbierto(true)
              setBusqueda('')
            }}
          />
        </div>
        <span 
          className="text-slate-500 text-[10px] cursor-pointer p-1" 
          onClick={(e) => { e.stopPropagation(); setAbierto(!abierto); }}
        >
          {abierto ? '▲' : '▼'}
        </span>
      </div>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setAbierto(false); setBusqueda(''); }}></div>
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-track]:rounded-r-lg [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500 transition-all">
            {opcionesFiltradas.map((op: any) => (
              <div
                key={op.id}
                className="flex items-center gap-3 p-2.5 hover:bg-blue-600/50 cursor-pointer transition-colors border-b border-slate-700/50 last:border-0"
                onClick={() => { 
                  onChange(op.nombre); 
                  setSeleccionado(op);
                  setBusqueda('');
                  setAbierto(false); 
                }}
              >
                <img src={op.logo_url} className="w-6 h-6 object-contain drop-shadow-md" alt={op.nombre} />
                <span className="text-xs font-bold uppercase text-white truncate">{op.nombre}</span>
              </div>
            ))}
            {opcionesFiltradas.length === 0 && (
              <div className="p-3 text-xs text-slate-400 text-center uppercase tracking-widest font-bold">No se encontraron resultados</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Perfil({ usuarioActivo, onUpdate }: { usuarioActivo: any, onUpdate?: (datos: any) => void }) {
  const { 
    perfil, 
    estadisticas,
    equiposInfo, 
    cargando, 
    subiendoAvatar, 
    subiendoPortada, 
    guardandoPreferencias,
    error, 
    subirAvatar, 
    subirPortada,    
    actualizarPreferencias,
    calcularEdad 
  } = usePerfilUsuario(usuarioActivo, onUpdate)

  const [editando, setEditando] = useState(false)
  const [avatarAmpliado, setAvatarAmpliado] = useState(false)
  const [formPrefs, setFormPrefs] = useState({ fecha_nacimiento: '', equipo_favorito: '', pais_favorito: '' })

  // 📡 NUEVO: CONEXIÓN NATIVA A SUPABASE PARA TIEMPO REAL
  useEffect(() => {
    if (!usuarioActivo?.id) return;

    const canalPerfil = supabase.channel(`perfil_activo_${usuarioActivo.id}`)
      // Escucha cambios en el saldo o perfil del usuario
      .on('postgres', { event: 'UPDATE', schema: 'public', table: 'usuarios', filter: `id=eq.${usuarioActivo.id}` }, () => {
        if (onUpdate) onUpdate(usuarioActivo);
      })
      // Escucha cambios en los partidos para recalcular efectividad y medallas en vivo
      .on('postgres', { event: 'UPDATE', schema: 'public', table: 'partidos' }, () => {
        if (onUpdate) onUpdate(usuarioActivo);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canalPerfil);
    }
  }, [usuarioActivo?.id, onUpdate])

  const opcionesPaises = useMemo(() => {
    return equiposInfo.filter(e => {
      const liga = e.liga?.toUpperCase() || '';
      return liga.includes('PAISES') || liga.includes('MUNDIAL');
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [equiposInfo])

  const opcionesClubes = useMemo(() => {
    return equiposInfo.filter(e => {
      const liga = e.liga?.toUpperCase() || '';
      return !liga.includes('PAISES') && !liga.includes('MUNDIAL');
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [equiposInfo])

  const abrirModalEdicion = () => {
    setFormPrefs({
      fecha_nacimiento: perfil.fecha_nacimiento || '',
      equipo_favorito: perfil.equipo_favorito || '',
      pais_favorito: perfil.pais_favorito || ''
    })
    setEditando(true)
  }

  const handleGuardarPrefs = async () => {
    const exito = await actualizarPreferencias(formPrefs)
    if (exito) setEditando(false)
  }

  if (error) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-10 p-6 bg-red-950/30 border border-red-900/50 rounded-2xl text-center shadow-lg">
        <span className="text-4xl mb-3 block">⚠️</span>
        <h2 className="text-red-400 font-black uppercase tracking-widest text-sm mb-2">Error de conexión</h2>
        <p className="text-slate-400 text-xs font-mono">{error}</p>
      </div>
    )
  }

  if (cargando || !perfil) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-2 animate-pulse space-y-4">
        <div className="bg-slate-900/50 rounded-3xl border border-slate-800 h-56 flex flex-col items-center pt-20">
          <div className="w-24 h-24 bg-slate-800 rounded-full mb-4 border-4 border-slate-900"></div>
          <div className="h-6 bg-slate-800 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-slate-800 rounded w-1/4"></div>
        </div>
        <div className="flex gap-2">
          <div className="h-24 bg-slate-900/50 rounded-2xl border border-slate-800 flex-1"></div>
          <div className="h-24 bg-slate-900/50 rounded-2xl border border-slate-800 flex-1"></div>
          <div className="h-24 bg-slate-900/50 rounded-2xl border border-slate-800 flex-1"></div>
        </div>
        <div className="h-40 bg-slate-900/50 rounded-3xl border border-slate-800"></div>
      </div>
    )
  }

  const porcentajeEfectividad = estadisticas.seleccionesTotales > 0 
    ? Math.round((estadisticas.aciertos / estadisticas.seleccionesTotales) * 100) 
    : 0;
  
  const equipoFavSafe = perfil?.equipo_favorito || '';
  const paisFavSafe = perfil?.pais_favorito || '';

  const logoEquipoFav = equiposInfo.find(e => e.nombre?.toLowerCase().trim() === equipoFavSafe.toLowerCase().trim())?.logo_url
  const logoPaisFav = equiposInfo.find(e => e.nombre?.toLowerCase().trim() === paisFavSafe.toLowerCase().trim())?.logo_url
  
  const edad = calcularEdad(perfil.fecha_nacimiento)

  const avatarFallbackBasico = `https://ui-avatars.com/api/?name=${encodeURIComponent(perfil.nombre || 'U')}&background=1e293b&color=3b82f6&size=200&bold=true`
  
  const avatarMostrado = perfil.avatar_url || logoEquipoFav || avatarFallbackBasico;
  const imagenEstadioGenerico = 'https://images.unsplash.com/photo-1518605368461-1e1e1141505c?auto=format&fit=crop&q=80&w=1000';
  
  const usuarioTienePortada = Boolean(perfil?.portada_url && perfil.portada_url.length > 10);
  const portadaMostrada = usuarioTienePortada ? perfil.portada_url : (logoPaisFav || imagenEstadioGenerico);

  // 💰 LÓGICA DE SUMA UNIFICADA EN PESOS
  const totalBilleteraPesos = Number(perfil.creditos_disponibles || 0) + Number(perfil.saldo_pesos || 0);

  return (
    <div className="w-full max-w-3xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4 relative">
      
      <div className="bg-slate-900/80 rounded-3xl border border-slate-800 shadow-2xl text-center relative overflow-hidden group/header">
        
        <div 
          className={`absolute top-0 left-0 w-full h-32 md:h-40 bg-center border-b border-slate-800 transition-all duration-500 ${subiendoPortada ? 'opacity-50 blur-md' : ''}`}
          style={{ 
            backgroundImage: `url('${portadaMostrada}')`,
            backgroundSize: (!usuarioTienePortada && logoPaisFav) ? 'contain' : 'cover', 
            backgroundRepeat: (!usuarioTienePortada && logoPaisFav) ? 'space' : 'no-repeat',
            opacity: usuarioTienePortada ? 1 : 0.4
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>
        </div>

        <div className="absolute top-3 right-3 z-50 md:opacity-0 md:group-hover/header:opacity-100 transition-opacity">
          <div className="relative bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-white py-2 px-3 rounded-lg overflow-hidden flex items-center justify-center gap-2 backdrop-blur-sm shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-widest z-10 select-none pointer-events-none">
              {subiendoPortada ? '⏳ Subiendo...' : '📸 Cambiar Portada'}
            </span>
            <input 
              type="file" 
              accept="image/*" 
              title=""
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 text-transparent file:hidden" 
              onChange={subirPortada} 
              disabled={subiendoPortada} 
            />
          </div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center pt-16 md:pt-24 pb-6 px-4">
          <div className="relative group mb-3">
            <img 
              src={avatarMostrado} 
              alt="Avatar" 
              onClick={() => setAvatarAmpliado(true)}
              className={`w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-slate-900 object-contain bg-slate-800 shadow-xl transition-all cursor-zoom-in ${subiendoAvatar ? 'opacity-50 blur-sm' : 'hover:scale-105 hover:border-blue-500'}`} 
            />
            {subiendoAvatar && <div className="absolute inset-0 flex items-center justify-center font-black text-xs text-white drop-shadow-md">...</div>}
            
            <div className="absolute bottom-0 right-0 z-50 bg-blue-600 w-8 h-8 md:w-9 md:h-9 rounded-full hover:bg-blue-500 hover:scale-110 transition-all shadow-lg border-2 border-slate-900 flex items-center justify-center overflow-hidden">
              <span className="text-xs md:text-sm z-10 select-none pointer-events-none">📷</span>
              <input 
                type="file" 
                accept="image/*" 
                title=""
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 text-transparent file:hidden" 
                onChange={subirAvatar} 
                disabled={subiendoAvatar} 
              />
            </div>
          </div>
          
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight leading-none drop-shadow-lg">{perfil.nombre}</h2>
          <p className="text-slate-400 font-mono text-xs mt-1 bg-slate-950/50 px-3 py-1 rounded-full">{perfil.telefono}</p>
        </div>
      </div>

      <div className="flex flex-row w-full gap-2 md:gap-4 justify-between items-stretch">
        
        {/* 🌟 ACTUALIZACIÓN BILLETERA ÚNICA EN PESOS */}
        <div className="flex-1 bg-slate-900/80 py-3 px-1 md:p-5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden group">
          <div className="absolute inset-0 bg-amber-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          <span className="relative z-10 block text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate w-full">Billetera</span>
          
          <div className="relative z-10 flex flex-col items-center justify-center w-full">
            <span className="text-lg sm:text-xl md:text-3xl font-black text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              ${totalBilleteraPesos} <span className="text-[10px] md:text-xs text-amber-600 font-bold uppercase">MXN</span>
            </span>
          </div>
        </div>

        <div className="flex-1 bg-slate-900/80 py-3 px-1 md:p-5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-md">
          <span className="block text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate w-full">Jugadas</span>
          <span className="text-lg sm:text-xl md:text-3xl font-black text-white">{estadisticas.jugadas}</span>
        </div>

        <div className="flex-1 bg-slate-900/80 py-3 px-1 md:p-5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-md">
          <span className="block text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate w-full">Efectividad</span>
          <div className="flex flex-col items-center">
            <span className="text-lg sm:text-xl md:text-3xl font-black text-blue-400">{porcentajeEfectividad}%</span>
            <span className="text-[7px] sm:text-[8px] md:text-[9px] font-bold text-slate-500 tracking-wide mt-0.5">
              {estadisticas.aciertos}/{estadisticas.seleccionesTotales}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div className="bg-gradient-to-br from-amber-950/30 to-slate-900 border border-amber-900/40 p-4 md:p-5 rounded-3xl shadow-lg flex flex-col justify-center items-center text-center w-full">
          <span className="text-amber-500 font-black text-[9px] uppercase tracking-widest mb-1">Ganancias Totales</span>
          <span className="text-3xl md:text-4xl font-black text-white drop-shadow-md">
            ${perfil.total_ganado ? Number(perfil.total_ganado).toLocaleString('es-MX') : '0'}
          </span>
          <span className="text-slate-500 text-[8px] uppercase font-bold mt-2 tracking-wider">MXN Acumulados</span>
        </div>

        <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-4 md:p-5 rounded-3xl shadow-xl w-full">
          <div className="text-center mb-4">
            <h3 className="text-sm md:text-base font-black text-slate-300 uppercase tracking-widest">🏆 Historial de Podios</h3>
          </div>
          
          <div className="flex justify-center gap-4 sm:gap-6 items-end">
            <div className="flex flex-col items-center justify-end">
              <span className={`text-2xl md:text-3xl drop-shadow-md mb-1.5 ${estadisticas.platas === 0 ? 'opacity-30 grayscale' : ''}`}>🥈</span>
              <div className="bg-slate-950 border border-slate-800 w-12 md:w-14 text-center py-1 rounded-t-lg">
                <span className="block text-[8px] text-slate-500 font-bold uppercase">2dos</span>
                <span className="text-base md:text-lg font-black text-slate-300">{estadisticas.platas}</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-end">
              <span className={`text-3xl md:text-4xl drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] mb-1.5 ${estadisticas.oros === 0 ? 'opacity-30 grayscale' : ''}`}>🥇</span>
              <div className="bg-slate-950 border border-amber-900/30 w-14 md:w-16 text-center py-2 rounded-t-lg shadow-inner">
                <span className="block text-[8px] text-amber-500/80 font-bold uppercase">1ros</span>
                <span className="text-lg md:text-xl font-black text-amber-400">{estadisticas.oros}</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-end">
              <span className={`text-xl md:text-2xl drop-shadow-md mb-1.5 ${estadisticas.bronces === 0 ? 'opacity-30 grayscale' : ''}`}>🥉</span>
              <div className="bg-slate-950 border border-slate-800 w-12 md:w-14 text-center py-1 rounded-t-lg">
                <span className="block text-[8px] text-slate-500 font-bold uppercase">3ros</span>
                <span className="text-sm md:text-base font-black text-amber-700">{estadisticas.bronces}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative">
        <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><span>⚙️</span> Ficha Técnica</h3>
          <button onClick={abrirModalEdicion} className="bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm">
            Editar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="block text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-1">Edad</span>
            <span className="text-white font-black text-sm uppercase">{edad ? `${edad} Años` : 'Sin definir'}</span>
          </div>
          
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="block text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-1.5">Equipo Favorito</span>
            <div className="flex items-center gap-2">
              {logoEquipoFav && <img src={logoEquipoFav} className="w-5 h-5 object-contain" alt="" />}
              <span className="text-white font-black text-sm uppercase truncate block">{perfil.equipo_favorito || 'Sin definir'}</span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="block text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-1.5">País Favorito</span>
            <div className="flex items-center gap-2">
              {logoPaisFav && <img src={logoPaisFav} className="w-5 h-5 object-contain" alt="" />}
              <span className="text-white font-black text-sm uppercase truncate block">{perfil.pais_favorito || 'Sin definir'}</span>
            </div>
          </div>
        </div>
      </div>

      {avatarAmpliado && (
        <div 
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setAvatarAmpliado(false)}
        >
          <div className="relative animate-in zoom-in-95 duration-200 max-w-sm md:max-w-md w-full">
            <button className="absolute -top-10 right-0 text-white font-mono text-2xl hover:text-slate-300">✕</button>
            <img 
              src={avatarMostrado} 
              alt="Avatar Ampliado" 
              className="w-full h-auto max-h-[80vh] object-contain rounded-2xl shadow-2xl bg-slate-900 border-2 border-slate-700"
            />
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-sm w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-black text-white uppercase tracking-tight">⚙️ Editar Ficha Técnica</h3>
              <button onClick={() => setEditando(false)} className="text-slate-500 hover:text-slate-300 font-mono text-xl">✕</button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[9px] text-slate-400 font-bold uppercase mb-1 block tracking-widest">Fecha de Nacimiento</label>
                <input 
                  type="date" 
                  value={formPrefs.fecha_nacimiento} 
                  onChange={(e) => setFormPrefs({...formPrefs, fecha_nacimiento: e.target.value})} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-xs outline-none focus:border-blue-500 font-bold" 
                />
              </div>

              <SelectorConLogo 
                label="Equipo Favorito" 
                placeholder="Escribe o selecciona..."
                opciones={opcionesClubes} 
                valorActual={formPrefs.equipo_favorito} 
                onChange={(val: string) => setFormPrefs({...formPrefs, equipo_favorito: val})} 
              />

              <SelectorConLogo 
                label="País Favorito" 
                placeholder="Escribe o selecciona..."
                opciones={opcionesPaises} 
                valorActual={formPrefs.pais_favorito} 
                onChange={(val: string) => setFormPrefs({...formPrefs, pais_favorito: val})} 
              />
            </div>

            <button 
              onClick={handleGuardarPrefs} 
              disabled={guardandoPreferencias} 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-xs tracking-widest transition-all shadow-lg"
            >
              {guardandoPreferencias ? 'Guardando...' : '💾 Guardar Cambios'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}