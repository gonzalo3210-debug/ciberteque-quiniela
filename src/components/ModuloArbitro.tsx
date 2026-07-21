'use client'
import React, { useMemo, useState, useEffect } from 'react';
import { useArbitro } from '@/hooks/useArbitro'
import PlantillaTicketsBlanco from '@/components/impresion/PlantillaTicketsBlanco';
import PlantillaReciboJugada from '@/components/impresion/PlantillaReciboJugada';
import PlantillaSabanaGeneral from '@/components/impresion/PlantillaSabanaGeneral';
import PlantillaTablaResultados from '@/components/impresion/PlantillaTablaResultados';
import toast from 'react-hot-toast';

interface ModuloArbitroProps {
  actualizarSaldoGlobal?: (id: string, nuevo: number) => void;
}

export default function ModuloArbitro({ actualizarSaldoGlobal }: ModuloArbitroProps) {
  const arbitro = useArbitro(actualizarSaldoGlobal);
  const { state: s, setters: set, actions: a, edicionJornada: ej, edicionTicket: et, constantes: c } = arbitro;

  // ESTADO DE UX: Loader para impresión
  const [cargandoImpresion, setCargandoImpresion] = useState(false);

  // ⚡ ESTADOS DE ANIMACIÓN DEL SORTEO
  const [faseSorteo, setFaseSorteo] = useState<'inactivo' | 'preparando' | 'girando' | 'revelando'>('inactivo');
  const [tickAnimacion, setTickAnimacion] = useState(0);

  const esSorteo = s.quiniela?.modalidad === 'sorteo';
  const sorteoRealizado = s.rankingAdmin?.some((r: any) => r.equipo_asignado_id);
  const equiposEnBombo = useMemo(() => s.equipos?.filter(e => s.quiniela?.equipos_sorteo?.includes(e.id)) || [], [s.equipos, s.quiniela?.equipos_sorteo]);

  // 🛡️ UX DE PREVENCIÓN: Candado de base de datos para Marcador Exacto
  const guardadoBloqueado = useMemo(() => {
    if (!s.marcadoresReales) return false;
    // Evita guardar si hay un gol capturado pero falta el del rival
    return Object.values(s.marcadoresReales).some((m: any) => 
      (m.l !== '' && m.v === '') || (m.l === '' && m.v !== '')
    );
  }, [s.marcadoresReales]);

  // Motor de Animación de Alta Velocidad (Efecto Ruleta)
  useEffect(() => {
    let intervalo: NodeJS.Timeout;
    if (faseSorteo === 'girando' || faseSorteo === 'revelando') {
      intervalo = setInterval(() => {
        setTickAnimacion(prev => prev + 1);
      }, 50); // Velocidad de cambio de logos (50ms)
    }
    return () => clearInterval(intervalo);
  }, [faseSorteo]);

  const iniciarSorteoAnimado = () => {
    if (s.rankingAdmin.length !== 8) return toast.error('Se requieren exactamente 8 jugadores.');
    
    // Inicia el Overlay
    setFaseSorteo('preparando');
    
    setTimeout(() => {
      setFaseSorteo('girando'); // Arranca la ruleta visual
      
      // Llamada real a la BD en segundo plano mientras gira visualmente
      a.ejecutarSorteoMundial(s.quiniela.equipos_sorteo || []).then(() => {
        // Le damos 3.5 segundos de suspenso visual obligado antes de detener la ruleta
        setTimeout(() => {
          setFaseSorteo('revelando');
          setTimeout(() => {
            setFaseSorteo('inactivo');
          }, 3000); // Muestra el resultado final 3 segundos antes de cerrar el modal
        }, 3500); 
      }).catch(() => {
        setFaseSorteo('inactivo');
      });
    }, 1000);
  };

  const { totalBoletosAdmin, precioBoletoPesos, cajaTotalPesos, cajaPremioPesos, cajaCiberPesos, ganadorActualAdmin } = useMemo(() => {
    const total = s.rankingAdmin?.length || 0;
    const precio = s.quiniela?.precio_ticket ?? 30; 
    const cajaTotal = total * precio; 
    
    return {
      totalBoletosAdmin: total,
      precioBoletoPesos: precio,
      cajaTotalPesos: cajaTotal,
      cajaPremioPesos: cajaTotal * c.PORCENTAJE_PREMIO,
      cajaCiberPesos: cajaTotal * c.PORCENTAJE_ADMIN,
      ganadorActualAdmin: total > 0 ? s.rankingAdmin[0] : null
    };
  }, [s.rankingAdmin, s.quiniela, c.PORCENTAJE_PREMIO, c.PORCENTAJE_ADMIN]);

  const { esPromoUnico, esPromoTop2, esCualquierPromo } = useMemo(() => {
    const pUnico = s.quiniela?.tipo_premiacion === 'promo_unico';
    const pTop2 = s.quiniela?.tipo_premiacion === 'promo_top2';
    return { esPromoUnico: pUnico, esPromoTop2: pTop2, esCualquierPromo: pUnico || pTop2 };
  }, [s.quiniela?.tipo_premiacion]);

  const jornadaCerrada = useMemo(() => {
    return s.quiniela && s.quiniela.fecha_cierre ? new Date() > new Date(s.quiniela.fecha_cierre.substring(0, 16)) : false;
  }, [s.quiniela?.fecha_cierre]);

  const esHistoricoLiquidado = s.vistaActual === 'historico' && s.quiniela?.estado === 'cerrada';

  const boletosFiltrados = useMemo(() => {
    if (!s.busquedaJugador) return s.rankingAdmin || [];
    const busquedaLower = s.busquedaJugador.toLowerCase();
    return s.rankingAdmin.filter((r: any) => 
      r.nombre.toLowerCase().includes(busquedaLower) || 
      (r.telefono && r.telefono.includes(s.busquedaJugador))
    );
  }, [s.rankingAdmin, s.busquedaJugador]);

  const listaQuinielasMostrar = s.vistaActual === 'activas' ? s.quinielasAbiertas : s.quinielasCerradas;

  const ejecutarImpresionUX = (tipo: string, payload?: any) => {
    setCargandoImpresion(true);
    if (tipo === 'recibo' && payload) set.setTicketAImprimir(payload);
    setTimeout(() => {
      a.activarImpresion(tipo as any);
      setCargandoImpresion(false);
    }, 800);
  };

  if (s.cargando) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-10 bg-slate-800 rounded-xl w-full"></div>
        <div className="h-20 bg-slate-800 rounded-xl w-full"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-800 rounded-xl"></div>)}
        </div>
        <div className="h-64 bg-slate-800 rounded-xl w-full mt-4"></div>
      </div>
    );
  }

  return (
    <>
      {/* 🚀 OVERLAY DEL SORTEO EN VIVO (ANIMACIÓN) */}
      {faseSorteo !== 'inactivo' && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-[0.2em] mb-2 drop-shadow-[0_0_15px_rgba(59,130,246,0.8)]">
            {faseSorteo === 'preparando' ? 'Preparando Bombo...' : faseSorteo === 'girando' ? '🎰 Sorteando Equipos...' : '✨ ¡Asignaciones Listas! ✨'}
          </h2>
          <p className="text-blue-400 font-bold tracking-widest uppercase text-sm mb-8 animate-pulse">Torneo: {s.quiniela?.nombre_jornada}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-5xl">
            {s.rankingAdmin.map((jugador: any, idx: number) => {
              const eqReal = jugador.equipo_asignado_id ? s.equipos.find((e:any) => e.id === jugador.equipo_asignado_id) : null;
              const eqRuleta = equiposEnBombo.length > 0 ? equiposEnBombo[(tickAnimacion + idx * 5) % equiposEnBombo.length] : null;
              
              const equipoMostrar = faseSorteo === 'revelando' ? eqReal : eqRuleta;

              return (
                <div key={jugador.id} className={`bg-slate-900 border-2 p-4 md:p-6 rounded-2xl flex justify-between items-center transform transition-all duration-75 ${faseSorteo === 'revelando' ? 'border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)] scale-100' : 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-[1.02]'}`}>
                  <div className="flex flex-col flex-1 truncate pr-4">
                    <span className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Esfera {idx + 1}</span>
                    <span className="font-black text-white text-lg md:text-xl uppercase truncate">{jugador.nombre}</span>
                  </div>
                  
                  <div className="flex items-center gap-4 shrink-0 border-l-2 border-slate-700/50 pl-4 h-full min-w-[140px] justify-end">
                    {equipoMostrar && (
                      <>
                        <span className={`font-black uppercase text-sm md:text-base text-right leading-tight truncate max-w-[100px] ${faseSorteo === 'revelando' ? 'text-green-400' : 'text-blue-400'}`}>
                          {equipoMostrar.nombre}
                        </span>
                        <div className={`w-14 h-14 md:w-16 md:h-16 bg-slate-950 rounded-full p-2 flex items-center justify-center shrink-0 border-2 ${faseSorteo === 'revelando' ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.8)]'}`}>
                          <img src={equipoMostrar.logo_url} className="w-full h-full object-contain drop-shadow-lg" alt="" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* --- INTERFAZ PRINCIPAL DEL ÁRBITRO --- */}
      <div className="animate-in fade-in duration-300 space-y-4 w-full max-w-4xl mx-auto print:hidden">
        
        <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-1 mb-4 shadow-sm">
          <button onClick={() => set.setVistaActual('activas')} className={`flex-1 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${s.vistaActual === 'activas' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            ⚽ Activas
          </button>
          <button onClick={() => set.setVistaActual('historico')} className={`flex-1 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${s.vistaActual === 'historico' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            📜 Histórico
          </button>
        </div>

        {listaQuinielasMostrar.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
            {listaQuinielasMostrar.map(qa => (
              <button key={qa.id} onClick={() => a.cargarDetallesQuiniela(qa)} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${s.quiniela?.id === qa.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                {qa.nombre_jornada}
              </button>
            ))}
          </div>
        )}

        {!s.quiniela ? (
          <div className="flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 py-16 animate-in zoom-in-95">
            <span className="text-4xl mb-3 opacity-50">📂</span>
            <p className="text-center text-slate-500 text-xs font-bold uppercase tracking-widest">
              {s.vistaActual === 'activas' ? 'No hay jornada abierta.' : 'No hay jornadas cerradas.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-slate-800 mb-2 shadow-sm">
              <div className="flex items-center gap-3">
                <h2 className={`text-lg md:text-xl font-black ${esSorteo ? 'text-blue-400' : 'text-white'} uppercase tracking-tight flex items-center gap-2`}>
                  {esSorteo && <span>🎲</span>}
                  {s.quiniela.nombre_jornada}
                </h2>
                {esHistoricoLiquidado && <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-[8px] font-black uppercase flex items-center border border-slate-700">🔒 Cerrada</span>}
              </div>
              {!esHistoricoLiquidado && !esSorteo && (
                <button onClick={ej.iniciarEdicionJornada} className="bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all shadow-sm">✏️ Ajustar</button>
              )}
            </div>

            <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-xl border shadow-inner ${esSorteo ? 'bg-blue-950/20 border-blue-900/50' : esCualquierPromo ? 'bg-purple-950/20 border-purple-900/50' : 'bg-slate-900/40 border-slate-800'}`}>
              <div className="text-center p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest">Boletos</span>
                <span className={`text-lg font-black ${esSorteo && totalBoletosAdmin === 8 ? 'text-green-400' : 'text-white'}`}>{totalBoletosAdmin} {esSorteo && '/ 8'}</span>
              </div>
              <div className="text-center p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest">Caja Total</span>
                <span className="text-lg font-black text-white">${cajaTotalPesos}</span>
              </div>
              
              {esCualquierPromo ? (
                <div className="col-span-2 text-center p-2 bg-purple-900/20 border border-purple-500/30 rounded-lg flex flex-col justify-center">
                  <span className="block text-[9px] text-purple-400 font-black uppercase tracking-widest">🎁 Promoción</span>
                  <span className="text-sm font-black text-purple-300">{esPromoUnico ? `Premio al 1ro ($${precioBoletoPesos})` : `Premio al Top 2 ($${precioBoletoPesos} c/u)`}</span>
                </div>
              ) : (
                <>
                  <div className="text-center p-2 bg-amber-950/20 border border-amber-900/30 rounded-lg">
                    <span className="block text-[8px] text-amber-500 font-black uppercase tracking-widest">Premio (80%)</span>
                    <span className="text-lg font-black text-amber-400">${cajaPremioPesos.toFixed(0)}</span>
                  </div>
                  <div className="text-center p-2 bg-green-950/20 border border-green-900/30 rounded-lg">
                    <span className="block text-[8px] text-green-500 font-black uppercase tracking-widest">Ciber (20%)</span>
                    <span className="text-lg font-black text-green-400">${cajaCiberPesos.toFixed(0)}</span>
                  </div>
                </>
              )}
            </div>

            <div className={`p-2 rounded-lg text-center text-[9px] border font-bold uppercase tracking-widest ${esSorteo ? 'bg-blue-950/30 border-blue-900 text-blue-300' : esCualquierPromo ? 'bg-purple-950/30 border-purple-800 text-purple-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
              🏆 Formato: <span className={`${esCualquierPromo ? 'text-white' : 'text-blue-400'} font-black`}>{s.quiniela.tipo_premiacion}</span>
            </div>

            {/* VISTA CONDICIONAL: BOMBO VIRTUAL VS TABLA TRADICIONAL */}
            {esSorteo ? (
              <div className="bg-blue-950/20 border border-blue-900/50 rounded-xl p-4 md:p-6 shadow-inner mt-4">
                <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-3">
                  <h3 className="text-blue-400 font-black uppercase text-lg md:text-xl tracking-widest flex items-center gap-2">
                    <span>🎲</span> Bombo Virtual (Sorteo)
                  </h3>
                  
                  {sorteoRealizado && (
                    <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest">
                      <div className="bg-green-950/40 border border-green-900/50 text-green-400 px-3 py-1.5 rounded-lg shadow-inner">
                        Vivos: {s.rankingAdmin.filter((r: any) => !r.estaEliminado).length}
                      </div>
                      <div className="bg-red-950/40 border border-red-900/50 text-red-400 px-3 py-1.5 rounded-lg shadow-inner">
                        Eliminados: {s.rankingAdmin.filter((r: any) => r.estaEliminado).length}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {s.rankingAdmin.map((jugador: any, idx: number) => {
                    const eqSorteado = jugador.equipo_asignado_id ? s.equipos.find((e:any) => e.id === jugador.equipo_asignado_id) : null;
                    
                    return (
                      <div key={jugador.id} className={`bg-slate-900 border p-4 rounded-xl flex justify-between items-center transition-all duration-300 ${jugador.estaEliminado ? 'border-red-900/40 opacity-50 grayscale scale-[0.98]' : 'border-slate-700 hover:border-slate-500 shadow-md'}`}>
                        <div className="flex flex-col flex-1 truncate pr-3">
                          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Esfera {idx + 1}</span>
                          <span className={`font-black text-sm uppercase truncate ${jugador.estaEliminado ? 'text-slate-400 line-through' : 'text-white'}`} title={jugador.nombre}>{jugador.nombre}</span>
                          
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            <button onClick={() => a.enviarWhatsAppBoleto(jugador)} className="text-[9px] text-blue-400 hover:text-blue-300 font-bold uppercase transition-colors flex items-center gap-1">
                              <span>📲</span> Notificar
                            </button>
                            
                            {/* ⚡ BOTONES RÁPIDOS DE ELIMINACIÓN Y REVIVIR */}
                            {sorteoRealizado && !esHistoricoLiquidado && (
                               <button 
                                 onClick={() => a.toggleEstadoSupervivencia(jugador.id, jugador.estaEliminado, jugador.nombre)} 
                                 className={`text-[9px] font-bold uppercase transition-colors flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border ${jugador.estaEliminado ? 'text-green-500 border-green-900/50 hover:bg-green-900/20' : 'text-red-500 border-red-900/50 hover:bg-red-900/20'}`}
                               >
                                 {jugador.estaEliminado ? '🟢 Revivir' : '💀 Eliminar'}
                               </button>
                            )}

                            {!esHistoricoLiquidado && !sorteoRealizado && (
                              <button onClick={() => a.eliminarTicket(jugador.id, jugador.nombre)} className="text-[9px] text-red-500 hover:text-red-400 font-bold uppercase transition-colors flex items-center gap-1"><span>🗑️</span> Borrar</button>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0 border-l border-slate-700/50 pl-4 h-full min-w-[120px] justify-end">
                          {eqSorteado ? (
                            <>
                              <span className={`font-black uppercase text-xs md:text-sm text-right leading-tight max-w-[80px] truncate ${jugador.estaEliminado ? 'text-slate-600' : 'text-blue-400'}`}>{eqSorteado.nombre}</span>
                              <div className={`w-10 h-10 md:w-12 md:h-12 bg-slate-950 border rounded-full p-1.5 flex items-center justify-center shrink-0 shadow-lg transition-colors ${jugador.estaEliminado ? 'border-red-900/30 opacity-60' : 'border-slate-800'}`}>
                                <img src={eqSorteado.logo_url} className="w-full h-full object-contain" alt="" onError={(evt:any)=>{evt.target.src='https://a.espncdn.com/i/teamlogos/default-soccer-35.png'}} />
                              </div>
                            </>
                          ) : (
                            <span className="text-[9px] text-slate-500 uppercase font-black px-2 py-1 bg-slate-950 rounded border border-slate-800 flex items-center gap-1"><span className="animate-pulse">⏳</span> Pendiente</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* LUGARES VACÍOS PLACEHOLDER */}
                  {Array.from({ length: 8 - s.rankingAdmin.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-slate-950/50 border-2 border-slate-800 border-dashed p-4 rounded-xl flex justify-between items-center opacity-40">
                      <div className="flex flex-col">
                         <span className="text-[10px] text-slate-600 font-black uppercase">Esfera {s.rankingAdmin.length + i + 1}</span>
                         <span className="text-xs font-bold text-slate-500 uppercase mt-0.5">Lugar Disponible</span>
                      </div>
                      <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-dashed flex items-center justify-center"></div>
                    </div>
                  ))}
                </div>

                {!esHistoricoLiquidado && (
                  <div className="flex flex-col gap-3 max-w-2xl mx-auto">
                    {!sorteoRealizado ? (
                      <button 
                         onClick={iniciarSorteoAnimado}
                         disabled={s.rankingAdmin.length !== 8 || s.calificando}
                         className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all text-sm ${
                           s.rankingAdmin.length === 8 ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:scale-[1.02] active:scale-95' 
                           : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                         }`}
                      >
                         {s.calificando ? 'Procesando BD...' : s.rankingAdmin.length === 8 ? '🎰 INICIAR SORTEO EN VIVO' : `Faltan Jugadores (${s.rankingAdmin.length}/8)`}
                      </button>
                    ) : (
                      <>
                        <button onClick={a.compartirResultadoSorteo} className="w-full py-3.5 rounded-xl font-black uppercase tracking-widest bg-green-600 hover:bg-green-500 text-white transition-all shadow-md active:scale-95">
                          📢 Enviar Resultados al Grupo
                        </button>
                        <div className="border-t border-blue-900/50 pt-4 mt-2">
                           <p className="text-center text-[10px] text-blue-400 font-bold uppercase mb-3">¿El torneo ya terminó en la vida real?</p>
                           {/* ⚡ CONEXIÓN A LA FUNCIÓN REAL DE CIERRE */}
                           <button onClick={a.cerrarJornadaDefinitivo} className="w-full py-3.5 rounded-xl font-black text-[10px] uppercase text-white transition-all bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.3)] active:scale-95">
                             🏆 Declarar Campeón y Pagar Premio
                           </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-sm mt-4">
                  <div className="bg-slate-950 p-2.5 border-b border-slate-800 flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">🎫 Boletos</h3>
                      {ganadorActualAdmin && <span className="text-[8px] text-amber-500 font-bold uppercase bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50">Líder: {ganadorActualAdmin.nombre}</span>}
                    </div>
                    <input type="text" placeholder="Buscar jugador..." value={s.busquedaJugador} onChange={(e) => set.setBusquedaJugador(e.target.value)} className="w-full sm:w-48 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-[10px] text-white outline-none focus:border-blue-500 font-bold" />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {totalBoletosAdmin > 0 && boletosFiltrados.length > 0 ? (
                        <table className="w-full text-left text-[10px]">
                          <thead className="bg-slate-900/80 text-slate-500 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                              <th className="p-2 font-bold border-b border-slate-800">Pos / Jugador</th>
                              <th className="p-2 text-center font-bold border-b border-slate-800">Dif.</th>
                              <th className="p-2 text-center text-green-500 font-bold border-b border-slate-800">Pts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {boletosFiltrados.map((r: any) => (
                              <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                                <td className="p-2 font-bold text-slate-300 uppercase flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="shrink-0 w-4 h-4 rounded text-[8px] bg-slate-800 text-slate-500 flex items-center justify-center font-black">{r.posicion}</span>
                                    <span className="truncate">{r.nombre}</span>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => a.enviarWhatsAppBoleto(r)} className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-green-400" title="Enviar WhatsApp">📲</button>
                                    {!jornadaCerrada && !esHistoricoLiquidado && (
                                      <>
                                        <button onClick={() => et.abrirEdicionTicket(r)} className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-blue-400" title="Editar Boleto">✏️</button>
                                        <button onClick={() => a.eliminarTicket(r.id, r.nombre)} className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-red-900 border border-slate-700 hover:border-red-700 rounded text-red-500 transition-colors" title="Eliminar Boleto">🗑️</button>
                                      </>
                                    )}
                                    <button onClick={() => ejecutarImpresionUX('recibo', { nombre: r.nombre, telefono: r.telefono || '-', selecciones: r.pronosticosDiccionario, goles: r.prediccionGoles })} className="w-6 h-6 flex items-center justify-center bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-white" title="Imprimir Recibo">🖨️</button>
                                  </div>
                                </td>
                                <td className="p-2 text-center text-slate-500 font-mono font-bold">{r.golesDiff === 999 ? '-' : r.golesDiff}</td>
                                <td className="p-2 text-center font-black text-green-400">{r.puntos}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="py-8 text-center text-slate-500">
                          <span className="block text-2xl mb-2 opacity-50">🔍</span>
                          <p className="text-[10px] font-bold uppercase">Sin resultados.</p>
                        </div>
                      )}
                  </div>
                </div>

                {/* BOTONES DE DIFUSIÓN CON UX DE IMPRESIÓN */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex flex-wrap justify-center gap-2 mt-4">
                  {!esHistoricoLiquidado ? (
                    <button onClick={() => ejecutarImpresionUX('tickets')} className="bg-slate-800 border border-slate-600 text-white font-bold px-3 py-2 rounded-lg text-[9px] uppercase tracking-widest hover:bg-slate-700 transition-colors">🖨️ Formatos Blanco</button>
                  ) : (
                    <button onClick={() => ejecutarImpresionUX('tabla')} className="bg-slate-800 border border-slate-600 text-white font-bold px-3 py-2 rounded-lg text-[9px] uppercase tracking-widest hover:bg-slate-700 transition-colors">🖨️ Tabla Final</button>
                  )}
                  <button onClick={() => ejecutarImpresionUX('sabana')} className="bg-blue-900 border border-blue-700 text-white font-bold px-3 py-2 rounded-lg text-[9px] uppercase tracking-widest hover:bg-blue-800 transition-colors">📊 Sábana (PDF)</button>
                  <button onClick={a.compartirAvanceGrupo} className="bg-green-700 border border-green-600 text-white font-bold px-3 py-2 rounded-lg text-[9px] uppercase tracking-widest hover:bg-green-600 transition-colors">📢 Copiar Avance</button>
                </div>

                {/* LISTA DE PARTIDOS Y MARCADORES */}
                <div className="space-y-2 mt-4">
                  {(s.partidos || []).map((partido: any, idx: number) => {
                    const seleccionado = s.resultadosReales[partido.id];
                    const esFinalActivo = s.esFinalReal[partido.id]; 
                    
                    return (
                      <div key={partido.id} className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="flex w-full md:w-auto flex-1 justify-between items-center text-[10px] font-bold uppercase gap-2">
                          <span className="text-[8px] text-slate-600 font-black w-4 text-center">{idx + 1}</span>
                          <span className="flex-1 text-right text-slate-300 truncate">{partido.equipo_local}</span>
                          <span className="w-4 text-center text-slate-600 text-[8px] font-black">VS</span>
                          <span className="flex-1 text-left text-slate-300 truncate">{partido.equipo_visitante}</span>
                        </div>
                        
                        <div className="flex w-full md:w-auto items-center justify-between gap-3">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                              <input type="number" min="0" placeholder="-" value={s.marcadoresReales[partido.id]?.l || ''} onChange={(e) => a.handleMarcadorExacto(partido.id, 'l', e.target.value)} disabled={esHistoricoLiquidado} className="w-8 h-8 bg-slate-900 rounded text-center font-black text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <span className="text-slate-600 font-black text-[10px]">-</span>
                              <input type="number" min="0" placeholder="-" value={s.marcadoresReales[partido.id]?.v || ''} onChange={(e) => a.handleMarcadorExacto(partido.id, 'v', e.target.value)} disabled={esHistoricoLiquidado} className="w-8 h-8 bg-slate-900 rounded text-center font-black text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                            {!esHistoricoLiquidado && (
                              <button 
                                onClick={() => a.handleToggleEsFinal(partido.id, !esFinalActivo)}
                                className={`w-full py-1 text-[8px] font-black uppercase rounded transition-colors ${esFinalActivo ? 'bg-green-600 text-white shadow-inner' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'}`}
                              >
                                {esFinalActivo ? '✅ FINAL' : '🔴 EN VIVO'}
                              </button>
                            )}
                          </div>

                          <div className="flex gap-1">
                            {['L', 'E', 'V'].map((opc) => (
                              <div key={opc} className={`w-7 h-7 flex items-center justify-center rounded font-black text-[10px] transition-colors ${seleccionado === opc ? 'bg-red-600 text-white shadow-inner' : 'bg-slate-900 border border-slate-800 text-slate-600'}`}>{opc}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* SECCIÓN FINAL (CERRAR JORNADA TRADICIONAL) */}
                {!esHistoricoLiquidado && (
                  <div className="flex flex-col md:flex-row items-center gap-3 border-t border-slate-800 pt-4 mt-2">
                    
                    {/* 🛡️ BLOQUEO DEFENSIVO VISUAL: Advertencia de partidos faltantes */}
                    {s.partidosPendientes > 0 && !esSorteo && (
                        <div className="w-full col-span-full mb-2 p-2 bg-amber-950/40 border border-amber-900/50 rounded-lg text-center text-[10px] md:text-xs font-bold text-amber-500 animate-pulse">
                            ⚠️ Faltan {s.partidosPendientes} partido(s) por capturar resultado. La liquidación está bloqueada.
                        </div>
                    )}

                    <div className="w-full md:w-1/3 p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-center flex flex-col justify-center items-center gap-1.5">
                      <label className="text-red-500 font-black uppercase text-[9px] tracking-widest">Total Goles Oficial</label>
                      <input type="number" min="0" value={s.golesReales} onChange={(e) => set.setGolesReales(e.target.value)} className="w-20 bg-slate-950 border border-red-900/50 rounded-lg px-2 py-1 text-center text-xl font-black text-white focus:outline-none focus:ring-1 focus:ring-red-500" />
                    </div>
                    
                    <div className="w-full md:w-2/3 flex gap-2">
                      <button 
                        onClick={a.guardarYCalificar} 
                        disabled={s.calificando || guardadoBloqueado} 
                        className={`flex-1 py-3 rounded-xl font-bold text-[10px] uppercase transition-colors ${guardadoBloqueado ? 'bg-slate-800 text-slate-500 border border-red-900/50 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                      >
                        {guardadoBloqueado ? '⚠️ Completa el Marcador' : '💾 Guardar Avance'}
                      </button>

                      <button 
                        onClick={a.cerrarJornadaDefinitivo} 
                        disabled={s.calificando || totalBoletosAdmin === 0 || (!s.sePuedeLiquidar && !esSorteo)} 
                        className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase text-white transition-transform active:scale-95 ${
                          (!s.sePuedeLiquidar && !esSorteo) ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-70' :
                          esCualquierPromo ? 'bg-purple-600 hover:bg-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.3)]' : 'bg-red-600 hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)]'
                        } disabled:opacity-50 disabled:active:scale-100`}
                      >
                        {(!s.sePuedeLiquidar && !esSorteo) ? '🔒 Liquidación Bloqueada' : esCualquierPromo ? '🎁 Cerrar y Pagar' : '🏆 Cerrar y Liquidar'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {esHistoricoLiquidado && !esSorteo && (
              <div className="mt-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Goles Totales Oficiales</span>
                <span className="text-3xl font-black text-white">{s.golesReales || '0'}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================= */}
      {/* OVERLAYS Y MODALES DE EDICIÓN (UX Y MANEJO DE ESTADOS) */}
      {/* ========================================================= */}

      {cargandoImpresion && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center animate-in fade-in duration-200">
          <div className="w-16 h-16 border-4 border-slate-500 border-t-white rounded-full animate-spin mb-4"></div>
          <p className="text-white font-black tracking-widest uppercase animate-pulse">Generando Documento...</p>
          <p className="text-slate-400 text-xs mt-2 text-center px-4">Preparando imágenes y aplicando formatos de página.</p>
        </div>
      )}

      {s.calificando && faseSorteo === 'inactivo' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white font-black tracking-widest uppercase animate-pulse">Procesando Datos...</p>
        </div>
      )}

      {/* MODAL: EDICIÓN DE JORNADA */}
      {ej.editandoQuinielaId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4">
              <h3 className="text-white font-black uppercase tracking-widest">✏️ Editar Jornada</h3>
              <button onClick={() => ej.setEditandoQuinielaId(null)} className="text-slate-500 hover:text-white font-mono text-lg">✕</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Nombre Jornada</label>
                <input type="text" value={ej.editNombreJornada} onChange={e => ej.setEditNombreJornada(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Fecha Cierre</label>
                  <input type="datetime-local" value={ej.editFechaCierre} onChange={e => ej.setEditFechaCierre(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Tipo Premiación</label>
                  <select value={ej.editTipoPremiacion} onChange={e => ej.setEditTipoPremiacion(e.target.value as any)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    <option value="unico">1er Lugar (Único)</option>
                    <option value="top2">Top 2 (Dividido)</option>
                    <option value="top3">Top 3 (Dividido)</option>
                    <option value="promo_unico">Promo (1 Crédito a 1ro)</option>
                    <option value="promo_top2">Promo (1 Crédito a Top 2)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 mt-4 space-y-2">
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-2">Editar Partidos</label>
                {ej.editPartidos.map((p: any, index: number) => (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-800 focus-within:border-blue-500 transition-colors">
                    <span className="text-[10px] text-slate-500 font-black w-4">{index + 1}</span>
                    <input type="text" value={p.equipo_local} onChange={e => ej.actualizarPartidoEditado(index, 'equipo_local', e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-center focus:outline-none focus:bg-slate-800" />
                    <span className="text-[10px] text-slate-600 font-black">VS</span>
                    <input type="text" value={p.equipo_visitante} onChange={e => ej.actualizarPartidoEditado(index, 'equipo_visitante', e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-center focus:outline-none focus:bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button onClick={() => ej.setEditandoQuinielaId(null)} className="px-4 py-2 rounded text-slate-400 font-bold text-xs uppercase hover:bg-slate-800 transition-colors">Cancelar</button>
              <button onClick={ej.guardarCambiosJornada} disabled={ej.guardandoEdicion} className="px-4 py-2 rounded bg-blue-600 text-white font-black text-xs uppercase hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-md">
                {ej.guardandoEdicion ? 'Guardando...' : '💾 Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDICIÓN DE TICKET (AQUÍ SE APLICÓ LA MUTACIÓN PARA MARCADOR EXACTO) */}
      {et.editandoTicketId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4">
              <h3 className="text-white font-black uppercase tracking-widest">🎫 Corregir Ticket: <br/><span className="text-blue-400">{et.editTicketNombre}</span></h3>
              <button onClick={() => et.setEditandoTicketId(null)} className="text-slate-500 hover:text-white font-mono text-lg self-start">✕</button>
            </div>
            
            <div className="space-y-2 mb-4">
               {s.partidos.map((p: any) => {
                 const sel = et.editTicketSelecciones[p.id];
                 return (
                   <div key={p.id} className="bg-slate-950 border border-slate-800 p-2 rounded flex flex-col gap-1.5">
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>{p.equipo_local}</span><span>VS</span><span>{p.equipo_visitante}</span>
                      </div>
                      
                      {s.quiniela?.modalidad === 'marcador_exacto' ? (
                        <input 
                          type="text" 
                          placeholder="Ej: 2-1" 
                          value={sel || ''} 
                          onChange={e => et.seleccionarOpcionEditTicket(p.id, e.target.value)} 
                          className="w-full h-7 bg-slate-900 border border-slate-700 rounded text-center text-xs font-black text-white focus:outline-none focus:border-blue-500" 
                        />
                      ) : (
                        <div className="flex gap-1 h-7">
                          {['L', 'E', 'V'].map(opc => (
                            <button key={opc} onClick={() => et.seleccionarOpcionEditTicket(p.id, opc)} className={`flex-1 rounded font-black text-xs transition-all ${sel === opc ? 'bg-blue-600 text-white shadow-inner scale-[1.02]' : 'bg-slate-900 text-slate-500 border border-slate-700 hover:bg-slate-800'}`}>
                              {opc}
                            </button>
                          ))}
                        </div>
                      )}
                   </div>
                 )
               })}
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded mb-4">
               <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1 text-center">Goles Desempate</label>
               <input type="number" min="0" value={et.editTicketGoles} onChange={e => et.setEditTicketGoles(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-center font-black text-lg focus:outline-none focus:border-blue-500" />
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
              <button onClick={() => et.setEditandoTicketId(null)} className="px-4 py-2 rounded text-slate-400 font-bold text-xs uppercase hover:bg-slate-800 transition-colors">Cancelar</button>
              <button onClick={et.guardarEdicionTicket} disabled={et.guardandoEdicionTicket} className="px-4 py-2 rounded bg-green-600 text-white font-black text-xs uppercase hover:bg-green-500 disabled:opacity-50 transition-colors shadow-md">
                {et.guardandoEdicionTicket ? 'Guardando...' : '💾 Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISTAS DE IMPRESIÓN */}
      {s.tipoImpresion === 'tickets' && (
        <PlantillaTicketsBlanco quiniela={s.quiniela} partidos={s.partidos} obtenerLogo={a.obtenerLogo} />
      )}

      {s.tipoImpresion === 'recibo' && (
        <PlantillaReciboJugada quiniela={s.quiniela} partidos={s.partidos} ticketAImprimir={s.ticketAImprimir} obtenerLogo={a.obtenerLogo} />
      )}

      {s.tipoImpresion === 'sabana' && (
        <PlantillaSabanaGeneral quiniela={s.quiniela} partidos={s.partidos} rankingAdmin={s.rankingAdmin} totalBoletosAdmin={totalBoletosAdmin} cajaTotalPesos={cajaTotalPesos} cajaPremioPesos={cajaPremioPesos} />
      )}

      {s.tipoImpresion === 'tabla' && (
        <PlantillaTablaResultados quiniela={s.quiniela} rankingAdmin={s.rankingAdmin} totalBoletosAdmin={totalBoletosAdmin} />
      )}
    </>
  )
}