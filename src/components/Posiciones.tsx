'use client'
import React, { useState, useEffect, Fragment } from 'react'
import { usePosiciones } from '@/hooks/usePosiciones'
import { useReacciones } from '@/hooks/useReacciones'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function Posiciones() {
  const { usuario } = useAuth();

  const {
    quinielasAbiertas,
    quinielaActiva,
    historial,
    cargando,
    errorCarga,
    setQuinielaActiva,
    recargarDatos
  } = usePosiciones()

  const { enviarReaccion, enviando } = useReacciones();
  
  const [menuReaccionAbierto, setMenuReaccionAbierto] = useState<string | null>(null);
  const [tooltipListaUsuariosId, setTooltipListaUsuariosId] = useState<string | null>(null);
  
  const [animacionesFlotantes, setAnimacionesFlotantes] = useState<{id: number, emoji: string}[]>([]);
  const [quinielaExpandidaId, setQuinielaExpandidaId] = useState<string | null>(null)
  const [jugadorExpandidoId, setJugadorExpandidoId] = useState<string | null>(null)

  const toggleExpandirHistorial = (id: string) => setQuinielaExpandidaId(prevId => prevId === id ? null : id)
  const toggleExpandirJugador = (id: string) => setJugadorExpandidoId(prevId => prevId === id ? null : id)

  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.reaccion-interact')) {
        return;
      }
      setMenuReaccionAbierto(null);
      setTooltipListaUsuariosId(null);
    };
    document.addEventListener('click', handleClickFuera);
    return () => document.removeEventListener('click', handleClickFuera);
  }, []);

  const obtenerIdReceptorReal = (jugador: any): string | null => {
    if (!jugador) return null;
    let idRealUsuario = null;
    if (jugador.usuario_id) idRealUsuario = jugador.usuario_id;
    else if (jugador.usuarios?.id) idRealUsuario = jugador.usuarios.id;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (idRealUsuario && uuidRegex.test(String(idRealUsuario).trim())) return String(idRealUsuario).trim();
    return null;
  };

  const handleEnviarReaccion = async (receptorId: string, emoji: string, ticketId: string) => {
    const nuevaAnimacion = { id: Date.now(), emoji };
    setAnimacionesFlotantes(prev => {
      const next = [...prev, nuevaAnimacion];
      if (next.length > 15) return next.slice(next.length - 15);
      return next;
    });
    
    setTimeout(() => {
      setAnimacionesFlotantes(prev => prev.filter(a => a.id !== nuevaAnimacion.id));
    }, 2000);

    setMenuReaccionAbierto(null);
    setTooltipListaUsuariosId(null);

    let tipoAccion = 'nueva'; // Detectaremos si es 'nueva', 'cambiar' o 'quitar'

    // Actualización optimista local
    if (quinielaActiva) {
      const nuevaQuiniela = { ...quinielaActiva };
      nuevaQuiniela.ranking = nuevaQuiniela.ranking.map((jugador: any) => {
        if (jugador.id === ticketId) {
          const nuevoConteo = { ...(jugador.conteoReacciones || {}) };
          
          if (nuevoConteo[emoji]?.me) {
            tipoAccion = 'quitar'; // 🛑 Quitó la misma que ya tenía
            nuevoConteo[emoji].count -= 1;
            nuevoConteo[emoji].me = false;
            nuevoConteo[emoji].usuarios = (nuevoConteo[emoji].usuarios || []).filter((u:any) => u.nombre !== 'Tú');
            if (nuevoConteo[emoji].count <= 0) delete nuevoConteo[emoji];
          } else {
            // Verificamos si tenía otra reacción diferente antes
            const teniaOtra = Object.keys(nuevoConteo).some(key => nuevoConteo[key].me);
            if (teniaOtra) tipoAccion = 'cambiar'; // 🔄 Cambió su reacción

            Object.keys(nuevoConteo).forEach(key => {
              if (nuevoConteo[key].me) {
                nuevoConteo[key].count -= 1;
                nuevoConteo[key].me = false;
                nuevoConteo[key].usuarios = (nuevoConteo[key].usuarios || []).filter((u:any) => u.nombre !== 'Tú');
                if (nuevoConteo[key].count <= 0) delete nuevoConteo[key];
              }
            });
            
            nuevoConteo[emoji] = {
              count: (nuevoConteo[emoji]?.count || 0) + 1,
              me: true,
              usuarios: [
                ...(Array.isArray(nuevoConteo[emoji]?.usuarios) ? nuevoConteo[emoji].usuarios : []),
                { nombre: 'Tú', avatar_url: null }
              ]
            };
          }
          return { ...jugador, conteoReacciones: nuevoConteo };
        }
        return jugador;
      });
      setQuinielaActiva(nuevaQuiniela);
    }

    await enviarReaccion(receptorId, emoji, 'jugada', ticketId);

    // 🧠 Notificación Condicional: Solo notifica si no fue "quitar"
    if (usuario && usuario.id !== receptorId && tipoAccion !== 'quitar') {
      const textoNotificacion = tipoAccion === 'cambiar' 
        ? `cambió su reacción por un ${emoji}` 
        : `reaccionó a tu jugada con un ${emoji}`;

      await supabase.from('notificaciones').insert({
        usuario_emisor_id: usuario.id,
        usuario_receptor_id: receptorId,
        tipo: 'reaccion',
        contenido: textoNotificacion
      });
    }
  };

  if (cargando) {
    return (
      <div className="w-full max-w-4xl mt-6 animate-pulse space-y-4 px-2">
        <div className="flex justify-center gap-2 mb-4">
          <div className="h-8 bg-slate-800 rounded-lg w-24"></div>
          <div className="h-8 bg-slate-800 rounded-lg w-24"></div>
        </div>
        <div className="h-44 bg-slate-800 rounded-2xl w-full"></div>
        <div className="h-64 bg-slate-800/80 rounded-xl w-full border border-slate-800"></div>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="w-full max-w-md mx-auto mt-10 p-6 bg-red-950/30 border border-red-900/50 rounded-2xl text-center shadow-xl animate-in fade-in">
        <span className="text-4xl mb-3 block">📡</span>
        <h3 className="text-red-400 font-black uppercase tracking-widest text-lg mb-2">Error de Conexión</h3>
        <p className="text-slate-400 text-sm mb-4">{errorCarga}</p>
        <button onClick={() => recargarDatos()} className="bg-red-900/50 hover:bg-red-800 text-red-200 px-6 py-2 rounded-xl font-bold transition-colors">
          Reintentar
        </button>
      </div>
    )
  }

  if (!quinielaActiva) return <div className="text-slate-500 italic text-center mt-10 text-sm">No hay datos de quinielas disponibles.</div>

  const totalJugadores = quinielaActiva.ranking.length
  const partidosTerminados = quinielaActiva.partidos?.filter((p: any) => p.es_final).length || 0
  
  const fechaCierre = new Date(quinielaActiva.fecha_cierre)
  const yaPasoCierre = new Date().getTime() >= fechaCierre.getTime()
  const mostrarPicks = quinielaActiva.estado?.trim().toLowerCase() === 'cerrada' || yaPasoCierre
  const esSorteo = quinielaActiva.modalidad === 'sorteo'
  const esPromo = quinielaActiva.tipo_premiacion?.toLowerCase().includes('promo')

  const opcionesFecha: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' };
  const fechaTextoVisible = fechaCierre.toLocaleDateString('es-MX', opcionesFecha).replace(',', ' a las');

  const getAvatarUrl = (nombre: string, url: string | null) => {
    if (url) return url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=1e293b&color=3b82f6&size=100&bold=true`;
  }

  const renderTooltipUsuarios = (data: any, jugador: any, emoji: string) => {
    let listaUsuarios: any[] = [];
    if (Array.isArray(data.usuarios) && data.usuarios.length > 0) {
      listaUsuarios = data.usuarios;
    } else if (Array.isArray(jugador.reacciones)) {
      listaUsuarios = jugador.reacciones
        .filter((r: any) => r.emoji === emoji)
        .map((r: any) => r.usuarios || r.usuario || r.perfil || { nombre: 'Anónimo' });
    }

    return (
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[999] bg-slate-900 border border-slate-700 rounded-xl p-2.5 shadow-2xl min-w-[160px] animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] uppercase font-black text-slate-400 mb-2 block tracking-widest border-b border-slate-800 pb-1.5 text-center">Reacciones</span>
        <div className="max-h-36 overflow-y-auto flex flex-col gap-2 custom-scrollbar">
          {listaUsuarios.length > 0 ? (
            listaUsuarios.map((u: any, idx: number) => {
              const nombre = typeof u === 'string' ? u : (u.nombre || 'Anónimo');
              const avatar = typeof u === 'string' ? null : u.avatar_url;
              return (
                <div key={idx} className="flex items-center gap-2">
                  <img src={getAvatarUrl(nombre, avatar)} className="w-5 h-5 rounded-full border border-slate-600 shrink-0 object-cover bg-slate-900" />
                  <span className="text-[10px] text-slate-200 truncate font-medium">{nombre}</span>
                </div>
              );
            })
          ) : (
            <span className="text-[9px] text-slate-500 text-center italic w-full block">Detalles no disponibles</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl mt-2 animate-in fade-in duration-500 mb-20 space-y-6 relative">
      <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden flex items-end justify-center pb-20">
        {animacionesFlotantes.map((anim) => (
          <div
            key={anim.id}
            className="absolute animate-bounce text-6xl drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-all duration-1000 ease-out"
            style={{
              transform: `translateY(-${Math.random() * 200 + 100}px) translateX(${Math.random() * 100 - 50}px)`,
              opacity: 0
            }}
            ref={(el) => {
              if (el) setTimeout(() => { el.style.opacity = '1'; }, 50);
              if (el) setTimeout(() => { el.style.opacity = '0'; }, 2000);
            }}
          >
            {anim.emoji}
          </div>
        ))}
      </div>

      <section>
        {quinielasAbiertas.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800 shadow-inner justify-center">
            {quinielasAbiertas.map(qa => (
              <button
                key={qa.id}
                onClick={() => { setQuinielaActiva(qa); setJugadorExpandidoId(null); }}
                className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${
                  quinielaActiva?.id === qa.id
                    ? 'bg-amber-500 text-slate-900 shadow-md scale-105'
                    : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {qa.modalidad === 'sorteo' ? '🎲' : '⚽'} {qa.nombre_jornada} {qa.estado?.trim().toLowerCase() === 'cerrada' ? '(En Juego)' : ''}
              </button>
            ))}
          </div>
        )}

        <div className={`bg-gradient-to-br border p-4 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.1)] relative overflow-hidden mb-4 ${esSorteo ? 'from-blue-950/40 to-slate-900 border-blue-500/30' : 'from-amber-950/40 to-slate-900 border-amber-500/30'}`}>
          <div className="absolute -right-4 -top-4 p-2 opacity-5 text-7xl select-none">{esSorteo ? '🎟️' : '💰'}</div>
          
          <h2 className={`text-center text-lg md:text-xl font-black uppercase italic tracking-tight mb-0.5 relative z-10 ${esSorteo ? 'text-blue-400' : 'text-white'}`}>
            {esSorteo ? 'ZONA DE SUPERVIVENCIA' : (quinielaActiva.estado?.trim().toLowerCase() === 'abierta' ? 'RANKING EN VIVO' : 'RESULTADOS EN JUEGO')}
          </h2>
          <p className="text-center text-slate-400 text-[10px] font-black uppercase tracking-widest mb-3">{quinielaActiva.nombre_jornada}</p>
          
          <div className="grid grid-cols-2 gap-2 relative z-10 max-w-md mx-auto">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Participantes</span>
              <span className="text-lg md:text-xl font-black text-white">{totalJugadores}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-center shadow-inner">
              <span className="block text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Recaudado</span>
              <span className="text-lg md:text-xl font-black text-white">${quinielaActiva.recaudadoPesos} <span className="text-[10px] text-slate-500">MXN</span></span>
            </div>
          </div>

          <div className={`mt-3 p-3 rounded-xl border text-center relative z-10 ${esSorteo ? 'bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'}`}>
            {esPromo ? (
              <>
                <span className={`block text-[9px] font-black uppercase tracking-widest mb-0.5 ${esSorteo ? 'text-blue-500' : 'text-amber-500'}`}>🎁 EVENTO PROMOCIONAL 🎁</span>
                <span className={`text-base md:text-lg font-black block ${esSorteo ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]'}`}>
                  {quinielaActiva.tipo_premiacion === 'promo_top2' ? '1 BOLETO AL 1º Y 2º LUGAR' : '1 BOLETO AL GANADOR'}
                </span>
              </>
            ) : (
              <>
                <span className={`block text-[9px] font-black uppercase tracking-widest mb-0.5 ${esSorteo ? 'text-blue-500' : 'text-amber-500'}`}>
                  🏆 PREMIO A REPARTIR 🏆
                </span>
                <span className={`text-2xl md:text-3xl font-black block ${esSorteo ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]'}`}>
                  ${quinielaActiva.premioPesos.toFixed(0)} <span className="text-[10px] md:text-xs uppercase font-bold opacity-80">MXN</span>
                </span>
              </>
            )}
          </div>
        </div>

        {!mostrarPicks && !esSorteo && (
          <div className="mb-3 text-center border border-amber-900/50 bg-amber-950/20 text-amber-500/80 text-[10px] py-1.5 rounded-lg font-bold uppercase tracking-widest">
            🔒 Radiografía oculta hasta el {fechaTextoVisible}
          </div>
        )}

        {esSorteo ? (
           <div className="bg-slate-900/80 rounded-xl border border-blue-900/30 shadow-2xl p-3 md:p-5">
              <h3 className="text-center font-black text-slate-300 uppercase tracking-widest text-xs mb-4">Bombo de Asignaciones</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                 {quinielaActiva.ranking.map((jugador: any) => {
                    const idReceptorSeguro = obtenerIdReceptorReal(jugador);
                    const eq = jugador.equipoAsignado;
                    const eliminado = jugador.estaEliminado;
                    
                    return (
                       <div key={jugador.id} className={`flex items-center justify-between p-3 md:p-4 rounded-xl border transition-all duration-500 ${eliminado ? 'bg-slate-950 border-red-900/40 opacity-50 grayscale' : 'bg-slate-800/80 border-blue-500/40 shadow-[0_0_15px_rgba(37,99,235,0.1)] hover:scale-[1.02]'}`}>
                          
                          <div className="flex items-center gap-3">
                             <div className="relative">
                               <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-slate-700 bg-slate-900" />
                               {eliminado && <div className="absolute inset-0 bg-red-950/60 rounded-full flex items-center justify-center text-xl">❌</div>}
                             </div>
                             <div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-black uppercase text-[10px] md:text-xs block max-w-[100px] md:max-w-[120px] truncate ${eliminado ? 'text-slate-500 line-through' : 'text-white'}`}>
                                    {jugador.nombre}
                                  </span>
                                  
                                  <div className="relative flex items-center z-50 reaccion-interact">
                                    {idReceptorSeguro && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuReaccionAbierto(menuReaccionAbierto === jugador.id ? null : jugador.id);
                                          setTooltipListaUsuariosId(null);
                                        }}
                                        className="text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-400 p-1 rounded-full transition-colors border border-slate-700"
                                        title="Tirarle carrilla"
                                      >
                                        💬
                                      </button>
                                    )}
                                    
                                    {menuReaccionAbierto === jugador.id && idReceptorSeguro && (
                                      <div className="absolute left-full ml-2 flex gap-1.5 bg-slate-900 border border-slate-700 p-1.5 rounded-xl shadow-2xl z-[999] animate-in zoom-in-95">
                                        {['🔥', '🥶', '🤡', '🍀'].map(emoji => (
                                          <button
                                            key={emoji}
                                            disabled={enviando}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleEnviarReaccion(idReceptorSeguro, emoji, jugador.id);
                                            }}
                                            className="text-base md:text-lg hover:scale-125 transition-transform disabled:opacity-50 disabled:grayscale"
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {Object.keys(jugador.conteoReacciones || {}).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(jugador.conteoReacciones).map(([emoji, data]: [string, any]) => {
                                      const tooltipKey = `${jugador.id}-${emoji}`;
                                      const isTooltipOpen = tooltipListaUsuariosId === tooltipKey;

                                      return (
                                        <div key={emoji} className="relative reaccion-interact">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setTooltipListaUsuariosId(isTooltipOpen ? null : tooltipKey);
                                              setMenuReaccionAbierto(null);
                                            }}
                                            className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border transition-all hover:scale-105 ${
                                              data.me ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                                            }`}
                                          >
                                            <span>{emoji}</span><span className="font-bold">{data.count}</span>
                                          </button>
                                          {isTooltipOpen && renderTooltipUsuarios(data, jugador, emoji)}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                
                                {eliminado ? (
                                  <span className="text-[8px] md:text-[9px] text-red-500 font-bold uppercase tracking-widest block mt-0.5">Eliminado</span>
                                ) : (
                                  <span className="text-[8px] md:text-[9px] text-green-400 font-bold uppercase tracking-widest block mt-0.5 animate-pulse">En Juego</span>
                                )}
                             </div>
                          </div>

                          <div className="flex flex-col items-end justify-center pl-3 border-l border-slate-700/50">
                             {eq ? (
                                <>
                                  <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center mb-1">
                                     <img src={eq.logo_url} className={`max-w-full max-h-full object-contain ${eliminado ? 'opacity-40' : ''}`} alt={eq.nombre} />
                                  </div>
                                  <span className={`text-[8px] md:text-[9px] font-black uppercase text-right leading-tight max-w-[90px] ${eliminado ? 'text-slate-600 line-through' : 'text-amber-400'}`}>
                                    {eq.nombre}
                                  </span>
                                </>
                             ) : (
                                <span className="text-[10px] text-slate-500 italic flex items-center gap-1 font-bold">
                                  <span className="animate-spin text-sm">🎲</span> Girando...
                                </span>
                             )}
                          </div>
                       </div>
                    )
                 })}
                 
                 {quinielaActiva.ranking.length === 0 && (
                   <div className="col-span-full p-8 text-center text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest italic border border-dashed border-slate-700 rounded-xl">
                     La sala del sorteo está vacía.
                   </div>
                 )}
              </div>
           </div>
        ) : (
           <div className="bg-slate-900/80 rounded-xl border border-slate-800 shadow-2xl">
             <div className="overflow-x-visible">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-950/80 text-[9px] uppercase text-slate-500 tracking-widest border-b border-slate-800">
                     <th className="p-2 w-8 text-center">#</th>
                     <th className="p-2">Jugador</th>
                     <th className="p-2 text-center w-12">Pts</th>
                     <th className="p-2 text-center w-12">Goles</th>
                     <th className="p-2 text-right pr-3">Radiografía</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-800/40">
                   {quinielaActiva.ranking.map((jugador: any) => {
                     const idReceptorSeguro = obtenerIdReceptorReal(jugador);
                     const esLider = jugador.posicion === 1 && totalJugadores > 1 && jugador.puntos > 0
                     const estaExpandido = jugadorExpandidoId === jugador.id

                     return (
                       <Fragment key={jugador.id}>
                         <tr
                           onClick={() => mostrarPicks && toggleExpandirJugador(jugador.id)}
                           className={`transition-colors hover:bg-slate-800/50 ${mostrarPicks ? 'cursor-pointer' : ''} ${esLider ? 'bg-gradient-to-r from-amber-900/15 to-transparent' : ''} ${estaExpandido ? 'bg-slate-800/30' : ''}`}
                         >
                           <td className="p-2 text-center">
                             {jugador.posicion === 1 && partidosTerminados > 0 ? <span className="text-lg drop-shadow-md block">🥇</span> :
                              jugador.posicion === 2 && partidosTerminados > 0 ? <span className="text-base block">🥈</span> :
                              jugador.posicion === 3 && partidosTerminados > 0 ? <span className="text-base block">🥉</span> :
                              <span className="text-[10px] font-black text-slate-500 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded">{jugador.posicion}</span>}
                           </td>
                           
                           <td className="p-2">
                             <div className="flex items-center gap-2">
                               <div className={`relative shrink-0 rounded-full border-2 ${esLider ? 'border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'border-slate-700'}`}>
                                 <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} alt={jugador.nombre} className="w-6 h-6 md:w-7 md:h-7 rounded-full object-cover bg-slate-900" />
                               </div>
                               <div>
                                 <div className="flex items-center gap-1.5 relative">
                                   <span className={`font-black uppercase text-[10px] md:text-xs block tracking-tight truncate max-w-[100px] md:max-w-[150px] ${esLider ? 'text-amber-400' : 'text-slate-200'}`}>
                                     {jugador.nombre} {esLider && <span className="ml-0.5 text-[9px]">👑</span>}
                                   </span>
                                   
                                   <div className="relative flex items-center z-50 reaccion-interact">
                                     {idReceptorSeguro && (
                                       <button
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           setMenuReaccionAbierto(menuReaccionAbierto === jugador.id ? null : jugador.id);
                                           setTooltipListaUsuariosId(null);
                                         }}
                                         className="text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-400 p-1 rounded-full transition-colors border border-slate-700"
                                         title="Tirarle carrilla"
                                       >
                                         💬
                                       </button>
                                     )}
                                     
                                     {menuReaccionAbierto === jugador.id && idReceptorSeguro && (
                                       <div className="absolute left-full ml-2 flex gap-1.5 bg-slate-900 border border-slate-700 p-1.5 rounded-xl shadow-2xl z-[999] animate-in zoom-in-95">
                                         {['🔥', '🥶', '🤡', '🍀'].map(emoji => (
                                           <button
                                             key={emoji}
                                             disabled={enviando}
                                             onClick={(e) => {
                                               e.stopPropagation();
                                               handleEnviarReaccion(idReceptorSeguro, emoji, jugador.id);
                                             }}
                                             className="text-base md:text-lg hover:scale-125 transition-transform disabled:opacity-50 disabled:grayscale"
                                           >
                                             {emoji}
                                           </button>
                                         ))}
                                       </div>
                                     )}
                                   </div>
                                 </div>

                                 {Object.keys(jugador.conteoReacciones || {}).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(jugador.conteoReacciones).map(([emoji, data]: [string, any]) => {
                                      const tooltipKey = `${jugador.id}-${emoji}`;
                                      const isTooltipOpen = tooltipListaUsuariosId === tooltipKey;

                                      return (
                                        <div key={emoji} className="relative reaccion-interact">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setTooltipListaUsuariosId(isTooltipOpen ? null : tooltipKey);
                                              setMenuReaccionAbierto(null);
                                            }}
                                            className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border transition-all hover:scale-105 ${
                                              data.me ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                                            }`}
                                          >
                                            <span>{emoji}</span><span className="font-bold">{data.count}</span>
                                          </button>
                                          {isTooltipOpen && renderTooltipUsuarios(data, jugador, emoji)}
                                        </div>
                                      );
                                    })}
                                  </div>
                                 )}

                                 {mostrarPicks && (
                                   <div className="block md:hidden text-[8px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">
                                     Dif: {quinielaActiva.goles_totales_real !== null ? jugador.golesDiff : '?'}
                                   </div>
                                 )}
                               </div>
                             </div>
                           </td>
                           
                           <td className="p-2 text-center">
                             <span className={`text-sm md:text-base font-black ${esLider ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]' : 'text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.15)]'}`}>
                               {jugador.puntos}
                             </span>
                           </td>
                           
                           <td className="p-2 text-center">
                             <span className="text-[10px] md:text-xs font-mono font-bold text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                               {mostrarPicks ? jugador.prediccionGoles : '🔒'}
                             </span>
                             {mostrarPicks && quinielaActiva.goles_totales_real !== null && (
                               <span className="hidden md:inline-block text-[8px] font-bold text-amber-500 ml-1">Dif:{jugador.golesDiff}</span>
                             )}
                           </td>
                           
                           <td className="p-2 text-right pr-3">
                             <div className="flex gap-0.5 md:gap-1 justify-end flex-wrap w-full max-w-[180px] ml-auto items-center">
                               {quinielaActiva.partidos.map((p: any, i: number) => {
                                 const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                 const estado = jugador.aciertos[p.id]
                                 
                                 const tieneGoles = p.goles_local !== null && p.goles_visitante !== null
                                 const enVivo = tieneGoles && !p.es_final
                                 
                                 if (!mostrarPicks) {
                                   return (
                                     <div key={p.id} className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[8px] bg-slate-950 border border-slate-800 text-slate-600" title={`Partido ${i+1} Oculto`}>
                                       🔒
                                     </div>
                                   )
                                 }

                                 let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                                 if (estado === 'acierto_exacto') bgClass = "bg-green-600 border-green-500 text-white shadow-[0_0_5px_rgba(22,163,74,0.3)]"
                                 if (estado === 'acierto_lev') bgClass = "bg-amber-500 border-amber-400 text-slate-900 shadow-[0_0_5px_rgba(245,158,11,0.3)]"
                                 if (estado === 'fallo') bgClass = "bg-red-950/40 border-red-900 text-red-500"
                                 if (estado === 'pendiente' && pronostico) bgClass = "bg-slate-800 border-slate-600 text-slate-300"
                                 
                                 const enVivoClass = enVivo ? "ring-1 ring-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.5)]" : ""
                                 
                                 return (
                                   <div key={p.id} className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[9px] font-black border ${bgClass} ${enVivoClass}`} title={`Partido ${i+1}${enVivo ? ' (EN VIVO)' : ''}`}>
                                     {pronostico ? pronostico.eleccion_usuario : '-'}
                                   </div>
                                 )
                               })}
                               {mostrarPicks && (
                                 <span className="text-[10px] ml-1 text-slate-500">{estaExpandido ? '🔼' : '🔽'}</span>
                               )}
                             </div>
                           </td>
                         </tr>

                         {estaExpandido && mostrarPicks && (
                           <tr className="bg-slate-900 border-b border-slate-800 shadow-inner">
                             <td colSpan={5} className="p-3 md:p-4">
                               <h4 className="text-[9px] md:text-[10px] font-black uppercase text-amber-500 tracking-widest mb-3 flex items-center gap-2">
                                 <span>📡</span> Desglose en Vivo - {jugador.nombre}
                               </h4>
                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                 {quinielaActiva.partidos.map((p: any, i: number) => {
                                   const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                   const estado = jugador.aciertos[p.id]
                                   const tieneGoles = p.goles_local !== null && p.goles_visitante !== null
                                   const enVivo = tieneGoles && !p.es_final

                                   let badgeColor = "bg-slate-800 text-slate-400 border-slate-700"
                                   if (estado === 'acierto_exacto') badgeColor = "bg-green-950/40 text-green-400 border-green-900/50"
                                   if (estado === 'acierto_lev') badgeColor = "bg-amber-950/20 text-amber-400 border-amber-900/50"
                                   if (estado === 'fallo') badgeColor = "bg-red-950/30 text-red-400 border-red-900/40"

                                   return (
                                     <div key={p.id} className={`flex flex-col p-2.5 rounded-lg border ${badgeColor} relative overflow-hidden`}>
                                       
                                       <div className="flex justify-between items-start mb-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase bg-slate-950 px-1 rounded">P{i+1}</span>
                                         {enVivo && <span className="text-[8px] font-black uppercase text-red-500 animate-pulse flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>En Vivo</span>}
                                         {p.es_final && <span className="text-[8px] font-black uppercase text-green-500">✅ Final</span>}
                                         {!tieneGoles && <span className="text-[8px] font-bold uppercase text-slate-500">⏱️ Pendiente</span>}
                                       </div>

                                       <div className="flex justify-between items-center mb-2">
                                         <span className="text-[9px] font-bold uppercase text-slate-300 w-[35%] truncate">{p.equipo_local}</span>
                                         
                                         <div className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-center min-w-[40px]">
                                           {tieneGoles ? (
                                             <span className="text-xs font-black text-white">{p.goles_local} - {p.goles_visitante}</span>
                                           ) : (
                                             <span className="text-[9px] font-bold text-slate-600">VS</span>
                                           )}
                                         </div>

                                         <span className="text-[9px] font-bold uppercase text-slate-300 w-[35%] truncate text-right">{p.equipo_visitante}</span>
                                       </div>

                                       <div className="flex justify-between items-center mt-auto pt-1.5 border-t border-slate-800/30">
                                         <span className="text-[8px] font-bold uppercase text-slate-500">Elección: <span className="text-white font-black">{pronostico ? pronostico.eleccion_usuario : 'N/A'}</span></span>
                                         
                                         {estado === 'acierto_exacto' && <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">{quinielaActiva.modalidad === 'marcador_exacto' ? '+3 Pts' : '+1 Pts'}</span>}
                                         {estado === 'acierto_lev' && <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">+1 Pts</span>}
                                         {estado === 'fallo' && <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Fallo</span>}
                                       </div>
                                       
                                     </div>
                                   )
                                 })}
                               </div>
                             </td>
                           </tr>
                         )}
                       </Fragment>
                     )
                   })}
                 </tbody>
               </table>
               {quinielaActiva.ranking.length === 0 && (
                 <div className="p-6 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">Aún no hay boletos para esta jornada.</div>
               )}
             </div>
           </div>
        )}
      </section>

      {historial.length > 0 && (
        <section className="pt-6 border-t border-slate-800">
          <h3 className="text-lg font-black text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
            <span>📜</span> Salón de la Fama <span className="text-[9px] font-normal tracking-normal ml-1 opacity-60">(Terminadas)</span>
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {historial.map(quiniela => {
              const esHistorialPromo = quiniela.tipo_premiacion?.toLowerCase().includes('promo');
              const estaExpandida = quinielaExpandidaId === quiniela.id;
              const jugadoresAMostrar = estaExpandida ? quiniela.ranking : quiniela.ranking.slice(0, 5);
              const esSorteo = quiniela.modalidad === 'sorteo';

              return (
                <div
                  key={quiniela.id}
                  className={`bg-slate-900 border rounded-xl p-3 md:p-4 shadow-lg relative overflow-hidden flex flex-col transition-all duration-300 ${estaExpandida ? 'border-amber-500/50 sm:col-span-2 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'border-slate-800'}`}
                >
                  <div className="flex justify-between items-start mb-3 border-b border-slate-800 pb-2">
                    <div>
                      <h4 className={`font-black text-[10px] md:text-xs uppercase italic flex items-center gap-1 ${estaExpandida ? 'text-amber-400' : 'text-white'}`}>
                        {esSorteo ? '🎲' : '⚽'} {quiniela.nombre_jornada}
                      </h4>
                      {!esSorteo && <span className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mt-0.5 block">Goles Reales: <span className="text-slate-300">{quiniela.goles_totales_real}</span></span>}
                    </div>
                    <div className="text-right">
                      <span className="block text-[8px] md:text-[9px] text-amber-500 font-bold uppercase tracking-widest">Premio</span>
                      {esHistorialPromo ? (
                        <span className="text-[10px] md:text-xs font-black text-amber-400 drop-shadow-md uppercase block mt-0.5">
                          {quiniela.tipo_premiacion === 'promo_top2' ? '1 BOLETO (1º Y 2º)' : '1 BOLETO (1º)'}
                        </span>
                      ) : (
                        <span className="text-sm md:text-base font-black text-amber-400 drop-shadow-md">
                          ${quiniela.premioPesos.toFixed(0)} <span className="text-[9px]">MXN</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 flex-grow">
                    {jugadoresAMostrar.map((jugador: any) => (
                      <div key={jugador.id} className={`flex flex-col p-1.5 md:p-2 rounded-lg border transition-colors ${jugador.estaEliminado ? 'bg-slate-950 border-red-900/30 opacity-60' : 'bg-slate-950/50 border-slate-800/50'}`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="flex justify-center items-center text-sm w-4 md:w-5 text-center">
                              {jugador.posicion === 1 && !jugador.estaEliminado ? '🥇' :
                               jugador.posicion === 2 && !jugador.estaEliminado ? '🥈' :
                               jugador.posicion === 3 && !jugador.estaEliminado ? '🥉' :
                               <span className="text-[9px] font-black text-slate-500 bg-slate-900 border border-slate-700 px-1.5 rounded">{jugador.posicion}</span>}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <img src={getAvatarUrl(jugador.nombre, jugador.avatar_url)} alt={jugador.nombre} className="w-4 h-4 md:w-5 md:h-5 rounded-full object-cover border border-slate-700 bg-slate-900" />
                              <span className={`font-black uppercase text-[9px] md:text-[10px] truncate ${estaExpandida ? 'w-[120px] sm:w-auto' : 'w-[80px] sm:w-[100px]'} ${jugador.posicion === 1 && !jugador.estaEliminado ? 'text-amber-400' : jugador.estaEliminado ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                {jugador.nombre}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[8px] md:text-[9px] font-bold text-slate-500">
                            {esSorteo ? (
                               jugador.equipoAsignado ? (
                                  <span className={`uppercase truncate max-w-[70px] ${jugador.estaEliminado ? 'text-red-500 line-through' : 'text-amber-400'}`}>{jugador.equipoAsignado.nombre}</span>
                               ) : null
                            ) : (
                               <>
                                 {!estaExpandida && <span title="Goles Predichos" className="hidden xs:inline-block">G:{jugador.prediccionGoles}</span>}
                                 <span className="bg-slate-800 text-green-400 px-1.5 py-0.5 rounded border border-slate-700 w-9 md:w-10 text-center shadow-inner">
                                   {jugador.puntos}
                                 </span>
                               </>
                            )}
                          </div>
                        </div>

                        {!esSorteo && estaExpandida && (
                          <div className="flex justify-between items-center border-t border-slate-800/50 pt-2 mt-2">
                            <div className="flex gap-0.5 md:gap-1 flex-wrap">
                              {quiniela.partidos.map((p: any, i: number) => {
                                const pronostico = jugador.pronosticos.find((pr: any) => pr.partido_id === p.id)
                                const estado = jugador.aciertos[p.id]
                                
                                let bgClass = "bg-slate-950 border-slate-800 text-slate-600"
                                if (estado === 'acierto_exacto') bgClass = "bg-green-600 border-green-500 text-white"
                                if (estado === 'acierto_lev') bgClass = "bg-amber-500 border-amber-400 text-slate-900"
                                if (estado === 'fallo') bgClass = "bg-red-950/40 border-red-900 text-red-500"
                                
                                return (
                                  <div key={p.id} className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded text-[7px] md:text-[9px] font-black border ${bgClass}`} title={`Partido ${i+1}`}>
                                    {pronostico ? pronostico.eleccion_usuario : '-'}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase text-right leading-tight ml-2 shrink-0">
                              Dif. Goles: <span className="text-amber-500 font-black ml-0.5">{jugador.golesDiff === 999 ? '-' : jugador.golesDiff}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => toggleExpandirHistorial(quiniela.id)}
                    className="mt-3 pt-2 text-[9px] md:text-[10px] text-slate-400 hover:text-amber-400 font-bold uppercase tracking-widest transition-colors border-t border-slate-800/50 w-full text-center flex items-center justify-center gap-1"
                  >
                    {estaExpandida ? (
                      <>Ocultar Detalles <span className="text-xs">🔼</span></>
                    ) : (
                      <>Ver Listado completo ({quiniela.ranking.length}) <span className="text-xs">🔽</span></>
                    )}
                  </button>

                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}