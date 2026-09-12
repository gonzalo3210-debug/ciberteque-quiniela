'use client'
import { useState, useMemo, useEffect } from 'react'
import { usePerfilUsuario } from '@/hooks/usePerfilUsuario'
import { supabase } from '@/lib/supabase'

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
            onChange={(e) => { setBusqueda(e.target.value); setAbierto(true) }}
            onFocus={() => { setAbierto(true); setBusqueda('') }}
          />
        </div>
        <span className="text-slate-500 text-[10px] cursor-pointer p-1" onClick={(e) => { e.stopPropagation(); setAbierto(!abierto); }}>
          {abierto ? '▲' : '▼'}
        </span>
      </div>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setAbierto(false); setBusqueda(''); }}></div>
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-600">
            {opcionesFiltradas.map((op: any) => (
              <div key={op.id} className="flex items-center gap-3 p-2.5 hover:bg-blue-600/50 cursor-pointer border-b border-slate-700/50" onClick={() => { onChange(op.nombre); setSeleccionado(op); setBusqueda(''); setAbierto(false); }}>
                <img src={op.logo_url} className="w-6 h-6 object-contain" alt={op.nombre} />
                <span className="text-xs font-bold uppercase text-white truncate">{op.nombre}</span>
              </div>
            ))}
            {opcionesFiltradas.length === 0 && <div className="p-3 text-xs text-slate-400 text-center uppercase font-bold">Sin resultados</div>}
          </div>
        </>
      )}
    </div>
  )
}

export default function Perfil({ usuarioActivo, onUpdate }: { usuarioActivo: any, onUpdate?: (datos: any) => void }) {
  const { perfil, estadisticas, equiposInfo, cargando, subiendoAvatar, subiendoPortada, guardandoPreferencias, error, subirAvatar, subirPortada, actualizarPreferencias, calcularEdad } = usePerfilUsuario(usuarioActivo, onUpdate)
  
  const [editando, setEditando] = useState(false)
  const [editandoBio, setEditandoBio] = useState(false)
  const [bioTemp, setBioTemp] = useState('')
  const [avatarAmpliado, setAvatarAmpliado] = useState(false)
  const [ticketModal, setTicketModal] = useState<any>(null)
  const [formPrefs, setFormPrefs] = useState({ fecha_nacimiento: '', equipo_favorito: '', pais_favorito: '', biografia: '' })

  useEffect(() => {
    if (!usuarioActivo?.id) return;
    const canalPerfil = supabase.channel(`perfil_activo_${usuarioActivo.id}`)
      .on('postgres', { event: 'UPDATE', schema: 'public', table: 'usuarios', filter: `id=eq.${usuarioActivo.id}` }, () => { if (onUpdate) onUpdate(usuarioActivo); })
      .on('postgres', { event: 'UPDATE', schema: 'public', table: 'partidos' }, () => { if (onUpdate) onUpdate(usuarioActivo); })
      .subscribe();
    return () => { supabase.removeChannel(canalPerfil); }
  }, [usuarioActivo?.id, onUpdate])

  const opcionesPaises = useMemo(() => equiposInfo.filter(e => (e.liga?.toUpperCase() || '').includes('PAISES') || (e.liga?.toUpperCase() || '').includes('MUNDIAL')).sort((a, b) => a.nombre.localeCompare(b.nombre)), [equiposInfo])
  const opcionesClubes = useMemo(() => equiposInfo.filter(e => !(e.liga?.toUpperCase() || '').includes('PAISES') && !(e.liga?.toUpperCase() || '').includes('MUNDIAL')).sort((a, b) => a.nombre.localeCompare(b.nombre)), [equiposInfo])

  const abrirModalEdicion = () => {
    setFormPrefs({ fecha_nacimiento: perfil.fecha_nacimiento || '', equipo_favorito: perfil.equipo_favorito || '', pais_favorito: perfil.pais_favorito || '', biografia: perfil.biografia || '' })
    setEditando(true)
  }

  const handleGuardarPrefs = async () => { const exito = await actualizarPreferencias(formPrefs); if (exito) setEditando(false); }

  const handleGuardarBioInline = async () => {
    const exito = await actualizarPreferencias({
      fecha_nacimiento: perfil.fecha_nacimiento || '',
      equipo_favorito: perfil.equipo_favorito || '',
      pais_favorito: perfil.pais_favorito || '',
      biografia: bioTemp
    })
    if (exito) setEditandoBio(false)
  }

  const determinarColorJugada = (pr: any, p: any) => {
    if (p.resultado_real === null) return 'bg-slate-950 border-slate-700 text-slate-400';
    let miTendencia = pr.eleccion_usuario;
    let aciertoExacto = false;
    
    if (miTendencia.includes('-')) {
      const [ul, uv] = miTendencia.split('-').map(Number);
      miTendencia = ul > uv ? 'L' : uv > ul ? 'V' : 'E';
      aciertoExacto = pr.eleccion_usuario === `${p.goles_local}-${p.goles_visitante}`;
    } else {
      if (miTendencia === 'LOCAL') miTendencia = 'L';
      if (miTendencia === 'VISITANTE') miTendencia = 'V';
      if (miTendencia === 'EMPATE') miTendencia = 'E';
      aciertoExacto = miTendencia === p.resultado_real; 
    }

    if (aciertoExacto) return 'bg-green-950/60 border-green-700 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.15)]';
    if (miTendencia === p.resultado_real) return 'bg-yellow-950/60 border-yellow-700 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.15)]';
    return 'bg-red-950/60 border-red-900/60 text-red-400';
  }

  if (error) return ( <div className="w-full max-w-3xl mx-auto mt-10 p-6 bg-red-950/30 border border-red-900/50 rounded-2xl text-center"><span className="text-4xl mb-3 block">⚠️</span><h2 className="text-red-400 font-black uppercase text-sm mb-2">Error de conexión</h2><p className="text-slate-400 text-xs font-mono">{error}</p></div> )
  if (cargando || !perfil) return ( <div className="w-full max-w-3xl mx-auto mt-2 animate-pulse space-y-4"><div className="bg-slate-900/50 rounded-3xl h-56 border border-slate-800"></div><div className="flex gap-2"><div className="h-24 bg-slate-900/50 rounded-2xl flex-1 border border-slate-800"></div><div className="h-24 bg-slate-900/50 rounded-2xl flex-1 border border-slate-800"></div></div></div> )

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
  const totalBilleteraPesos = Number(perfil.creditos_disponibles || 0) + Number(perfil.saldo_pesos || 0);

  const fechaRegistroParseada = perfil.fecha_registro ? new Date(perfil.fecha_registro) : new Date();
  const miembroDesde = fechaRegistroParseada.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="w-full max-w-3xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4 relative">
      
      {/* 📸 HEADER ESTILO TARJETA (Alineado izquierda en móvil y PC) */}
      <div className="bg-slate-900/80 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group/header">
        <div className={`absolute top-0 left-0 w-full h-32 md:h-40 bg-center border-b border-slate-800 transition-all duration-500 ${subiendoPortada ? 'opacity-50 blur-md' : ''}`} style={{ backgroundImage: `url('${portadaMostrada}')`, backgroundSize: (!usuarioTienePortada && logoPaisFav) ? 'contain' : 'cover', backgroundRepeat: (!usuarioTienePortada && logoPaisFav) ? 'space' : 'no-repeat', opacity: usuarioTienePortada ? 1 : 0.4 }}>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
        </div>
        <div className="absolute top-3 right-3 z-50 md:opacity-0 md:group-hover/header:opacity-100 transition-opacity">
          <div className="relative bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-white py-1.5 px-3 rounded-lg overflow-hidden flex items-center justify-center gap-2 backdrop-blur-sm shadow-lg">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest z-10 select-none pointer-events-none">{subiendoPortada ? '⏳ Subiendo...' : '📸 Cambiar Portada'}</span>
            <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 text-transparent file:hidden" onChange={subirPortada} disabled={subiendoPortada} />
          </div>
        </div>
        
        {/* ROW FLEX: Mantiene la foto a la izquierda siempre */}
        <div className="relative z-10 pt-20 md:pt-28 pb-6 px-4 md:px-8 flex flex-row items-end gap-4 md:gap-6 text-left">
          <div className="relative group shrink-0">
            <img src={avatarMostrado} alt="Avatar" onClick={() => setAvatarAmpliado(true)} className={`w-24 h-24 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-full border-4 border-slate-900 object-cover bg-slate-800 shadow-2xl transition-all cursor-zoom-in ${subiendoAvatar ? 'opacity-50 blur-sm' : 'hover:scale-105 hover:border-blue-500'}`} />
            {subiendoAvatar && <div className="absolute inset-0 flex items-center justify-center font-black text-xs text-white drop-shadow-md">...</div>}
            <div className="absolute bottom-1 right-1 z-50 bg-blue-600 w-8 h-8 md:w-10 md:h-10 rounded-full hover:bg-blue-500 hover:scale-110 transition-all shadow-lg border-2 border-slate-900 flex items-center justify-center overflow-hidden">
              <span className="text-xs md:text-sm z-10 select-none pointer-events-none">📷</span>
              <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 text-transparent file:hidden" onChange={subirAvatar} disabled={subiendoAvatar} />
            </div>
          </div>
          <div className="flex-1 pb-1 md:pb-2 overflow-hidden">
            <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-white uppercase tracking-tight leading-none drop-shadow-lg truncate">{perfil.nombre}</h2>
            <div className="flex items-center justify-start gap-2 mt-1.5 flex-wrap">
              <span className="text-slate-400 font-mono text-[10px] md:text-xs bg-slate-950/60 px-3 py-1 rounded-full border border-slate-800 hidden sm:inline-block">{perfil.telefono}</span>
              <span className="text-blue-400 font-bold text-[8px] sm:text-[9px] md:text-[10px] uppercase tracking-widest bg-blue-950/40 border border-blue-900/40 px-2 sm:px-3 py-1 rounded-full">
                MIEMBRO DESDE EL {miembroDesde.toUpperCase()}
              </span>
            </div>
            
            {/* LÓGICA DE EDICIÓN INLINE DE BIOGRAFÍA */}
            {editandoBio ? (
              <div className="mt-3 flex items-center gap-2 bg-slate-950/60 p-1 rounded-lg border border-slate-800 max-w-sm">
                <input type="text" maxLength={60} autoFocus value={bioTemp} onChange={(e) => setBioTemp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGuardarBioInline()} className="flex-1 bg-transparent border-none text-amber-400 font-bold italic text-xs md:text-sm outline-none px-2 placeholder:text-slate-600" placeholder="Escribe tu frase..." />
                <button onClick={handleGuardarBioInline} disabled={guardandoPreferencias} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1.5 rounded text-[10px] font-black uppercase transition-colors">OK</button>
                <button onClick={() => setEditandoBio(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-2 py-1.5 rounded text-[10px] font-black uppercase transition-colors">✕</button>
              </div>
            ) : perfil.biografia ? (
              <p onClick={() => { setBioTemp(perfil.biografia); setEditandoBio(true); }} className="text-amber-400 text-xs md:text-sm font-bold italic mt-3 bg-amber-950/20 px-3 md:px-4 py-1.5 md:py-2 rounded-xl inline-block border border-amber-900/30 cursor-pointer hover:bg-amber-950/40 transition-colors group/bio truncate max-w-full" title="Toca para editar">
                "{perfil.biografia}" <span className="opacity-0 group-hover/bio:opacity-100 transition-opacity text-slate-400 ml-1 text-[10px]">✏️</span>
              </p>
            ) : (
              <button onClick={() => { setBioTemp(''); setEditandoBio(true); }} className="text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:text-slate-300 mt-3 inline-block transition-colors cursor-pointer bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-800 border-dashed">+ Añadir estado o frase</button>
            )}

          </div>
        </div>
      </div>

      {/* 📊 3 TARJETAS PRINCIPALES */}
      <div className="flex flex-row w-full gap-2 md:gap-4 justify-between items-stretch">
        <div className="flex-1 bg-slate-900/80 py-3 px-1 md:p-4 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden group">
          <div className="absolute inset-0 bg-amber-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          <span className="relative z-10 block text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate w-full">Billetera</span>
          <div className="relative z-10 flex flex-col items-center justify-center w-full">
            <span className="text-lg sm:text-xl md:text-3xl font-black text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              ${totalBilleteraPesos} <span className="text-[10px] md:text-xs text-amber-600 font-bold uppercase">MXN</span>
            </span>
          </div>
        </div>
        <div className="flex-1 bg-slate-900/80 py-3 px-1 md:p-4 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-md">
          <span className="block text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate w-full">Jugadas Totales</span>
          <span className="text-lg sm:text-xl md:text-3xl font-black text-white">{estadisticas.jugadas}</span>
        </div>
        <div className="flex-1 bg-slate-900/80 py-3 px-1 md:p-4 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-md">
          <span className="block text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate w-full text-center">Frec. Top 3</span>
          <span className="text-lg sm:text-xl md:text-3xl font-black text-blue-400 drop-shadow-md">{estadisticas.pctPodios}%</span>
        </div>
      </div>

      {/* ⚙️ FICHA TÉCNICA (MOVIDA HACIA ARRIBA) */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative">
        <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><span>⚙️</span> Ficha Técnica</h3>
          <button onClick={abrirModalEdicion} className="bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm">
            Editar Detalles
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

      {/* 📡 ACTIVIDAD RECIENTE */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-6 -top-6 text-8xl md:text-9xl opacity-5 pointer-events-none select-none">📡</div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
          <span>📅</span> Actividad Reciente
        </h3>
        
        <div className="flex flex-col gap-3 relative z-10">
          
          {/* Tarjeta Por Jugar */}
          {estadisticas.actividad.porJugar.length > 0 && (
            <div className="bg-slate-950/60 p-3 md:p-4 rounded-xl border border-blue-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse"></span>
                <span className="text-[10px] md:text-xs uppercase font-bold text-slate-400">Boletos Por Jugar</span>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-start sm:justify-end">
                {estadisticas.actividad.porJugar.map(t => (
                  <button key={t.id} onClick={() => setTicketModal(t)} className="text-[10px] md:text-xs font-black text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-sm">
                    {t.quinielas.nombre_jornada}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tarjeta En Juego */}
          {estadisticas.actividad.enJuego.length > 0 && (
            <div className="bg-slate-950/60 p-3 md:p-4 rounded-xl border border-green-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"></span>
                <span className="text-[10px] md:text-xs uppercase font-bold text-slate-400">En Juego Ahora</span>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-start sm:justify-end">
                {estadisticas.actividad.enJuego.map(t => (
                  <button key={t.id} onClick={() => setTicketModal(t)} className="text-[10px] md:text-xs font-black text-green-400 bg-green-950 hover:bg-green-900/60 border border-green-900/50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-sm">
                    {t.quinielas.nombre_jornada}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tarjeta Última Finalizada */}
          {estadisticas.actividad.ultimaCerrada ? (
            <div className="bg-slate-950/60 p-3 md:p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base md:text-lg grayscale opacity-70">🏁</span>
                <span className="text-[10px] md:text-xs uppercase font-bold text-slate-400">Última Finalizada</span>
              </div>
              <button onClick={() => setTicketModal(estadisticas.actividad.ultimaCerrada)} className="text-xs md:text-sm font-black text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-colors cursor-pointer shadow-sm">
                {estadisticas.actividad.ultimaCerrada.quinielas.nombre_jornada}
              </button>
            </div>
          ) : (
            <div className="bg-slate-950/60 p-3 md:p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base md:text-lg grayscale opacity-70">🏁</span>
                <span className="text-[10px] md:text-xs uppercase font-bold text-slate-400">Última Finalizada</span>
              </div>
              <span className="text-xs font-bold text-slate-600">Ninguna</span>
            </div>
          )}

        </div>
      </div>

      {/* PODIOS Y GANANCIAS */}
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

      {/* 🏷️ MODAL: DETALLE DEL TICKET */}
      {ticketModal && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl p-4 sm:p-5 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Header del Modal con Ranking y Puntos */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-3 shrink-0">
              <div className="flex-1 pr-2">
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight flex items-center gap-2 mb-1">
                  ✅ {ticketModal.quinielas.nombre_jornada}
                </h3>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-widest block">
                  {ticketModal.quinielas.modalidad?.replace('_', ' ')}
                </span>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {ticketModal.ranking && ticketModal.ranking.total > 0 && (
                  <div className="flex gap-1.5 sm:gap-2">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg px-2 sm:px-3 py-1 flex flex-col items-center justify-center shadow-inner">
                      <span className="text-[7px] sm:text-[8px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">Ranking</span>
                      <span className="text-xs sm:text-sm font-black text-white">
                        #{ticketModal.ranking.posicion} <span className="text-[8px] sm:text-[9px] text-slate-500 font-normal">/ {ticketModal.ranking.total}</span>
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-blue-900/40 rounded-lg px-2 sm:px-3 py-1 flex flex-col items-center justify-center shadow-inner">
                      <span className="text-[7px] sm:text-[8px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">Puntos</span>
                      <span className="text-xs sm:text-sm font-black text-blue-400">
                        {ticketModal.puntos_totales || 0}
                      </span>
                    </div>
                  </div>
                )}
                <button onClick={() => setTicketModal(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold transition-colors shadow-sm ml-1">✕</button>
              </div>
            </div>

            {/* Cabecera de la Tabla */}
            <div className="flex text-[8px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest border-b border-slate-800 pb-2 mb-2 px-1 sm:px-2 shrink-0">
              <div className="flex-[2] text-center">Partido</div>
              <div className="flex-1 text-center">Real</div>
              <div className="flex-1 text-center">Tu Jugada</div>
            </div>

            {/* Lista de Partidos Estilo Tabla */}
            <div className="overflow-y-auto space-y-0.5 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full pb-2">
              {ticketModal.pronosticos?.map((pr: any, idx: number) => {
                const p = pr.partidos;
                if(!p) return null;
                
                const colorJugada = determinarColorJugada(pr, p);
                
                return (
                  <div key={idx} className="flex items-center py-2 px-1 sm:px-2 hover:bg-slate-800/50 rounded-lg transition-colors border-b border-slate-800/40 last:border-0">
                    
                    {/* COLUMNA: PARTIDO */}
                    <div className="flex-[2] flex items-center justify-center gap-1.5 sm:gap-2 overflow-hidden">
                      <span className="truncate text-right w-[40%] text-[9px] sm:text-[11px] font-bold text-slate-300">{p.nombre_local}</span>
                      {p.logo_local ? <img src={p.logo_local} className="w-4 h-4 sm:w-5 sm:h-5 object-contain" alt="" /> : <div className="w-4 h-4 sm:w-5 sm:h-5 bg-slate-800 rounded-full shrink-0"></div>}
                      <span className="text-[7px] sm:text-[8px] text-slate-600 italic font-black shrink-0">VS</span>
                      {p.logo_visitante ? <img src={p.logo_visitante} className="w-4 h-4 sm:w-5 sm:h-5 object-contain" alt="" /> : <div className="w-4 h-4 sm:w-5 sm:h-5 bg-slate-800 rounded-full shrink-0"></div>}
                      <span className="truncate text-left w-[40%] text-[9px] sm:text-[11px] font-bold text-slate-300">{p.nombre_visitante}</span>
                    </div>
                    
                    {/* COLUMNA: REAL */}
                    <div className="flex-1 flex flex-col items-center justify-center border-l border-slate-800/50">
                      <span className="font-black text-white text-[10px] sm:text-xs">
                        {p.goles_local !== null ? `${p.goles_local} - ${p.goles_visitante}` : '-'}
                      </span>
                      {p.resultado_real && (
                        <span className={`text-[7px] sm:text-[8px] font-black w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center rounded-full mt-0.5 text-white shadow-sm ${p.resultado_real === 'L' ? 'bg-blue-600' : p.resultado_real === 'V' ? 'bg-red-600' : 'bg-slate-500'}`}>
                          {p.resultado_real}
                        </span>
                      )}
                    </div>

                    {/* COLUMNA: TU JUGADA (COLOREADA) */}
                    <div className="flex-1 flex items-center justify-center border-l border-slate-800/50">
                      <span className={`font-black text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded shadow-inner ${colorJugada}`}>
                        {pr.eleccion_usuario}
                      </span>
                    </div>

                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODALES OCULTOS DE EDICIÓN Y ZOOM */}
      {avatarAmpliado && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200" onClick={() => setAvatarAmpliado(false)}>
          <div className="relative animate-in zoom-in-95 duration-200 max-w-sm md:max-w-md w-full">
            <button className="absolute -top-10 right-0 text-white font-mono text-2xl hover:text-slate-300">✕</button>
            <img src={avatarMostrado} alt="Avatar Ampliado" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl shadow-2xl bg-slate-900 border-2 border-slate-700" />
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-sm w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-black text-white uppercase tracking-tight">⚙️ Editar Detalles</h3>
              <button onClick={() => setEditando(false)} className="text-slate-500 hover:text-slate-300 font-mono text-xl">✕</button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[9px] text-slate-400 font-bold uppercase mb-1 block tracking-widest">Fecha de Nacimiento</label>
                <input type="date" value={formPrefs.fecha_nacimiento} onChange={(e) => setFormPrefs({...formPrefs, fecha_nacimiento: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-xs outline-none focus:border-blue-500 font-bold" />
              </div>
              <SelectorConLogo label="Equipo Favorito" placeholder="Escribe o selecciona..." opciones={opcionesClubes} valorActual={formPrefs.equipo_favorito} onChange={(val: string) => setFormPrefs({...formPrefs, equipo_favorito: val})} />
              <SelectorConLogo label="País Favorito" placeholder="Escribe o selecciona..." opciones={opcionesPaises} valorActual={formPrefs.pais_favorito} onChange={(val: string) => setFormPrefs({...formPrefs, pais_favorito: val})} />
            </div>
            <button onClick={handleGuardarPrefs} disabled={guardandoPreferencias} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-xs tracking-widest transition-all shadow-lg">
              {guardandoPreferencias ? 'Guardando...' : '💾 Guardar Cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}