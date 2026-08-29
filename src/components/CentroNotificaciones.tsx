'use client'
import React, { useState, useEffect, useRef } from 'react';
import { useNotificaciones } from '@/hooks/useNotificaciones';

export default function CentroNotificaciones() {
  // 👇 Agregamos limpiarTodasLasNotificaciones al destructuring
  const { notificaciones, noLeidas, cargando, marcarComoLeidas, limpiarTodasLasNotificaciones } = useNotificaciones();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [animacionesFlotantes, setAnimacionesFlotantes] = useState<{id: number, emoji: string}[]>([]);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    const handleClickFuera = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const handleMarcarLeida = async (notificacion: any) => {
    if (notificacion.tipo === 'reaccion') {
      const emojiExtraido = notificacion.contenido.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu)?.[0] || '🔥';
      const nuevaAnimacion = { id: Date.now(), emoji: emojiExtraido };
      
      setAnimacionesFlotantes(prev => [...prev, nuevaAnimacion]);
      setTimeout(() => {
        setAnimacionesFlotantes(prev => prev.filter(a => a.id !== nuevaAnimacion.id));
      }, 2000);
    }

    if (!notificacion.leida) {
      await marcarComoLeidas([notificacion.id]);
    }
  };

  const getAvatarUrl = (nombre: string, url: string | null) => {
    if (url) return url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre || 'User')}&background=1e293b&color=3b82f6&size=100&bold=true`;
  };

  const getIconoTipo = (tipo: string) => {
    switch(tipo) {
      case 'reaccion': return '💬';
      case 'recarga': return '💰';
      case 'jornada': return '⚽';
      case 'resultado': return '🏆';
      default: return '🔔';
    }
  };

  const obtenerNombreEmisor = (tipo: string, nombreDB?: string) => {
    if (nombreDB) return nombreDB;
    if (tipo === 'recarga') return 'El Administrador';
    if (tipo === 'jornada') return 'Club Pronósticos';
    return 'El Sistema';
  };

  if (!montado) {
    return (
      <div className="fixed bottom-24 right-6 md:bottom-24 md:right-10 z-[9999]">
        <button className="w-14 h-14 bg-[#1a2035] border-2 border-slate-800 rounded-full flex items-center justify-center text-2xl shadow-2xl text-slate-400">
          🔔
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 right-6 md:bottom-24 md:right-10 z-[9999]" ref={menuRef}>
      
      <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center">
        {animacionesFlotantes.map((anim) => (
          <div
            key={anim.id}
            className="absolute animate-bounce text-7xl md:text-8xl drop-shadow-[0_0_25px_rgba(255,255,255,0.6)] transition-all duration-1000 ease-out z-[9999]"
            style={{ transform: `translateY(-${Math.random() * 200 + 100}px) translateX(${Math.random() * 100 - 50}px)`, opacity: 0 }}
            ref={(el) => {
              if (el) setTimeout(() => { el.style.opacity = '1'; }, 50);
              if (el) setTimeout(() => { el.style.opacity = '0'; }, 2000);
            }}
          >
            {anim.emoji}
          </div>
        ))}
      </div>

      {menuAbierto && (
        <div className="absolute right-0 bottom-full mb-4 w-72 md:w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden animate-in slide-in-from-bottom-5 origin-bottom-right">
          
          <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-slate-200 font-black uppercase text-[11px] tracking-widest">Notificaciones</h3>
            {/* 👇 Cambiamos la validación y el evento onClick para limpiar todo */}
            {notificaciones.length > 0 && (
              <button onClick={() => limpiarTodasLasNotificaciones()} className="text-[9px] text-red-500 hover:text-red-400 font-bold uppercase transition-colors">
                Limpiar Todo
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-0 custom-scrollbar bg-slate-900/50">
            {cargando && notificaciones.length === 0 && (
              <div className="animate-pulse space-y-2 p-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3"><div className="w-10 h-10 bg-slate-800 rounded-full shrink-0"></div><div className="flex-1 space-y-2"><div className="h-3 bg-slate-800 rounded w-3/4"></div><div className="h-2 bg-slate-800 rounded w-1/2"></div></div></div>
                ))}
              </div>
            )}

            {!cargando && notificaciones.length === 0 && (
              <div className="text-center p-8 opacity-60">
                <span className="text-3xl block mb-2">📭</span>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Bandeja limpia</p>
              </div>
            )}

            {notificaciones.map((notificacion: any) => {
              const nombreFinal = obtenerNombreEmisor(notificacion.tipo, notificacion.emisor?.nombre);
              const avatar = notificacion.emisor?.avatar_url || null;
              
              return (
                <div 
                  key={notificacion.id} 
                  onClick={() => handleMarcarLeida(notificacion)}
                  className={`flex items-start gap-3 p-3 cursor-pointer border-b border-slate-800/50 transition-colors relative group ${notificacion.leida ? 'bg-slate-900/50 opacity-70 hover:bg-slate-800' : 'bg-slate-800/40 hover:bg-slate-800/80'}`}
                >
                  <div className="relative shrink-0">
                    {notificacion.tipo === 'reaccion' ? (
                       <img src={getAvatarUrl(nombreFinal, avatar)} alt={nombreFinal} className="w-10 h-10 rounded-full object-cover border-2 border-slate-700 bg-slate-950" />
                    ) : (
                       <div className="w-10 h-10 rounded-full border-2 border-slate-700 bg-slate-800 flex items-center justify-center text-lg shadow-inner">
                         {getIconoTipo(notificacion.tipo)}
                       </div>
                    )}
                    {!notificacion.leida && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] border-2 border-slate-900 animate-pulse"></span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-xs text-slate-300 leading-snug">
                      <span className={`font-black ${notificacion.tipo === 'recarga' ? 'text-green-400' : 'text-amber-400'}`}>
                        {nombreFinal}{' '}
                      </span>
                      {notificacion.contenido}
                    </p>
                    <span className="text-[9px] text-slate-500 font-bold uppercase mt-1 block">
                      {new Date(notificacion.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button 
        onClick={() => setMenuAbierto(!menuAbierto)}
        className="w-14 h-14 bg-[#1a2035] border-2 border-slate-800 rounded-full flex items-center justify-center text-2xl shadow-2xl hover:scale-110 hover:border-amber-500/50 transition-all relative"
      >
        <span className={`${noLeidas.length > 0 ? 'animate-wiggle text-amber-400' : 'text-slate-400'}`}>🔔</span>
        {noLeidas.length > 0 && (
          <span className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 bg-red-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-slate-900 shadow-md">
            {noLeidas.length > 9 ? '9+' : noLeidas.length}
          </span>
        )}
      </button>

    </div>
  )
}