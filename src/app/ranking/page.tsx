'use client'
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function RankingPublico() {
  const [cargando, setCargando] = useState(true);
  const [quinielasDisponibles, setQuinielasDisponibles] = useState<any[]>([]);
  const [tabActivaId, setTabActivaId] = useState<string | null>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [progresoTorneo, setProgresoTorneo] = useState<{jugados: number, totales: number} | null>(null);

  // WhatsApp precargado para el CTA
  const NUMERO_WHATSAPP = "523118776263";
  const MENSAJE_WA = encodeURIComponent("¡Hola Gonzalo! Vi el ranking de Ciberteque y me gustaría saber más información para participar.");

  useEffect(() => {
    cargarTorneos();
  }, []);

  const cargarTorneos = async () => {
    setCargando(true);
    try {
      const { data: quinielas, error } = await supabase
        .from('quinielas')
        .select('id, nombre_jornada, modalidad, estado, goles_totales_real, fecha_cierre')
        .order('fecha_cierre', { ascending: false })
        .limit(10);

      if (error) {
        console.error("Error de Supabase:", error.message);
        throw error;
      }

      let torneosAMostrar: any[] = [];
      const now = new Date();

      if (quinielas && quinielas.length > 0) {
        const abiertas = quinielas.filter(q => q.estado?.toLowerCase() === 'abierta');

        if (abiertas.length > 0) {
          const enJuego: any[] = [];
          const proximas: any[] = [];

          abiertas.forEach(q => {
            const fcStr = q.fecha_cierre || '';
            const d = new Date(fcStr.includes('Z') || fcStr.includes('+') ? fcStr : `${fcStr}Z`);
            if (!isNaN(d.getTime()) && d <= now) {
              enJuego.push(q);
            } else {
              proximas.push(q);
            }
          });

          proximas.sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime());
          torneosAMostrar = [...enJuego, ...proximas];
        } else {
          const cerradas = quinielas.filter(q => q.estado?.toLowerCase() === 'cerrada');
          if (cerradas.length > 0) torneosAMostrar = [cerradas[0]];
        }
      }

      setQuinielasDisponibles(torneosAMostrar);
      if (torneosAMostrar.length > 0) {
        setTabActivaId(torneosAMostrar[0].id);
      }
    } catch (error) {
      console.error("Error cargando torneos", error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (tabActivaId) cargarRankingDeQuiniela(tabActivaId);
  }, [tabActivaId, quinielasDisponibles]);

  const cargarRankingDeQuiniela = async (idQuiniela: string) => {
    setProgresoTorneo(null);
    const quiniela = quinielasDisponibles.find(q => q.id === idQuiniela);
    if (!quiniela) return;

    const now = new Date();
    const fcStr = quiniela.fecha_cierre || '';
    const fechaCierre = new Date(fcStr.includes('Z') || fcStr.includes('+') ? fcStr : `${fcStr}Z`);
    
    const esFaseRegistro = quiniela.estado?.toLowerCase() === 'abierta' && fechaCierre > now;

    try {
      // 1. Cargar Tickets
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
          id, puntos_totales, prediccion_goles_total, fecha_creacion,
          usuarios ( nombre, avatar_url )
        `)
        .eq('quiniela_id', idQuiniela);

      if (error) throw error;

      // 2. Cargar Partidos para medir progreso
      const { data: partidos } = await supabase
        .from('partidos')
        .select('id, resultado_real')
        .eq('quiniela_id', idQuiniela);

      if (partidos && partidos.length > 0) {
        const jugados = partidos.filter(p => p.resultado_real !== null && p.resultado_real !== '').length;
        setProgresoTorneo({ jugados, totales: partidos.length });
      }

      // 3. Procesar Ranking
      if (tickets) {
        const rankingCalculado = tickets.map((t: any) => ({
          id: t.id,
          nombre: t.usuarios?.nombre || 'Jugador',
          avatar: t.usuarios?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${t.usuarios?.nombre || 'J'}&backgroundColor=1e3a8a&textColor=ffffff`,
          puntos: t.puntos_totales || 0,
          golesTotales: t.prediccion_goles_total || 0,
          estaEliminado: t.puntos_totales < 0,
          fechaCreacion: new Date(t.fecha_creacion || 0).getTime()
        })).sort((a, b) => {
          if (quiniela.modalidad === 'sorteo') {
            if (a.estaEliminado === b.estaEliminado) return 0;
            return a.estaEliminado ? 1 : -1;
          }
          
          if (esFaseRegistro) return a.fechaCreacion - b.fechaCreacion;
          
          if (b.puntos !== a.puntos) return b.puntos - a.puntos;
          
          return a.fechaCreacion - b.fechaCreacion;
        });

        rankingCalculado.forEach((jugador, index) => {
          jugador.posicion = index + 1;
        });

        setRanking(rankingCalculado);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return 'Fecha por definir';
    const fechaUTC = fechaDB.includes('Z') || fechaDB.includes('+') ? fechaDB : `${fechaDB}Z`;
    const d = new Date(fechaUTC);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  const quinielaActiva = quinielasDisponibles.find(q => q.id === tabActivaId);
  let esFaseRegistro = false;
  let estaEnJuego = false;

  if (quinielaActiva) {
    const fcStr = quinielaActiva.fecha_cierre || '';
    const d = new Date(fcStr.includes('Z') || fcStr.includes('+') ? fcStr : `${fcStr}Z`);
    esFaseRegistro = quinielaActiva.estado?.toLowerCase() === 'abierta' && d > new Date();
    estaEnJuego = quinielaActiva.estado?.toLowerCase() === 'abierta' && d <= new Date();
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-amber-500 font-black tracking-widest mt-3 text-xs uppercase">Cargando Torneos...</p>
      </div>
    );
  }

  if (!quinielaActiva) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
        <h1 className="text-slate-500 font-bold text-sm uppercase tracking-widest">No hay jornadas disponibles.</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24 font-sans selection:bg-amber-500 selection:text-slate-900">
      
      {/* 🏆 HEADER PUBLICO COMPACTO */}
      <div className="bg-gradient-to-b from-blue-950 to-slate-950 pt-5 pb-4 px-4 rounded-b-3xl shadow-lg border-b border-blue-900/50">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-white drop-shadow-md">
            Ciberteque
          </h1>
          <p className="text-blue-400 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-0.5 mb-2">
            Ranking Oficial en Vivo
          </p>
          
          <div className="inline-block bg-amber-500 text-slate-950 font-black uppercase tracking-widest px-4 py-1.5 rounded-lg text-xs md:text-sm shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            {quinielaActiva.nombre_jornada}
          </div>

          {quinielaActiva.estado?.toLowerCase() === 'cerrada' ? (
            <div className="mt-3 w-full max-w-xs mx-auto text-center">
               <p className="text-red-400 text-[9px] font-black uppercase tracking-widest animate-pulse">🏁 Jornada Finalizada</p>
            </div>
          ) : esFaseRegistro ? (
            <div className="mt-3 bg-slate-900/80 border border-slate-700 p-2 rounded-lg inline-block shadow-inner">
              <p className="text-slate-400 text-[8px] font-bold uppercase tracking-widest mb-0.5">⏳ Cierre de Registros:</p>
              <p className="text-amber-400 font-black text-[10px] md:text-xs">{formatearFechaLocal(quinielaActiva.fecha_cierre)}</p>
            </div>
          ) : estaEnJuego && progresoTorneo ? (
            <div className="mt-3 w-full max-w-[200px] mx-auto">
              <div className="flex justify-between items-center mb-1 px-1">
                 <span className="text-amber-400 font-black uppercase text-[8px] tracking-widest">Progreso</span>
                 <span className="text-slate-300 font-black text-[9px]">{progresoTorneo.jugados} / {progresoTorneo.totales}</span>
              </div>
              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                 <div 
                   className="h-full bg-green-500 rounded-full transition-all duration-500" 
                   style={{ width: `${(progresoTorneo.jugados / Math.max(progresoTorneo.totales, 1)) * 100}%` }}
                 ></div>
              </div>
            </div>
          ) : null}

          {quinielasDisponibles.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-4 overflow-x-auto px-2 pb-1">
              {quinielasDisponibles.map(q => (
                <button
                  key={q.id}
                  onClick={() => setTabActivaId(q.id)}
                  className={`px-3 py-1.5 rounded-lg font-black uppercase text-[9px] md:text-[10px] tracking-widest whitespace-nowrap transition-all border ${
                    tabActivaId === q.id
                      ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {q.nombre_jornada}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 mt-4 space-y-2">
        {ranking.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-center">
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Aún no hay participantes registrados.</p>
          </div>
        ) : (
          ranking.map((jugador) => (
            <div 
              key={jugador.id} 
              className={`flex items-center gap-2 p-2.5 md:p-3 rounded-xl transition-all ${
                esFaseRegistro ? 'bg-slate-900/40 border border-slate-800' :
                jugador.posicion === 1 ? 'bg-gradient-to-r from-amber-500/20 to-slate-900 border border-amber-500/50 shadow-md' :
                jugador.posicion === 2 ? 'bg-gradient-to-r from-slate-300/10 to-slate-900 border border-slate-400/30' :
                jugador.posicion === 3 ? 'bg-gradient-to-r from-amber-700/20 to-slate-900 border border-amber-700/30' :
                'bg-slate-900/40 border border-slate-800'
              } ${jugador.estaEliminado ? 'opacity-50 grayscale' : ''}`}
            >
              
              <div className="w-6 h-6 md:w-8 md:h-8 shrink-0 flex items-center justify-center font-black text-base md:text-lg">
                {esFaseRegistro ? '🎟️' : (
                  jugador.posicion === 1 ? '🥇' : jugador.posicion === 2 ? '🥈' : jugador.posicion === 3 ? '🥉' : (
                    <span className="text-slate-500">{jugador.posicion}</span>
                  )
                )}
              </div>

              <img 
                src={jugador.avatar} 
                alt={jugador.nombre} 
                className={`w-8 h-8 md:w-10 md:h-10 rounded-full object-cover border-2 shadow-sm shrink-0 ${
                  !esFaseRegistro && jugador.posicion === 1 ? 'border-amber-500' : 'border-slate-700'
                }`}
              />

              <div className="flex-1 min-w-0 pl-1">
                <p className={`font-black uppercase truncate text-xs md:text-sm ${
                  !esFaseRegistro && jugador.posicion === 1 ? 'text-amber-400' : 'text-slate-200'
                }`}>
                  {jugador.nombre}
                </p>
                
                {esFaseRegistro ? (
                   <p className="text-[8px] md:text-[9px] font-bold text-green-500 uppercase tracking-widest mt-0.5">
                     ✅ Registro Confirmado
                   </p>
                ) : quinielaActiva.modalidad !== 'sorteo' ? (
                  <p className="text-[8px] md:text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    Goles predichos: {jugador.golesTotales}
                  </p>
                ) : null}

                {jugador.estaEliminado && (
                  <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mt-0.5">💀 Eliminado</p>
                )}
              </div>

              {!esFaseRegistro && quinielaActiva.modalidad !== 'sorteo' && (
                <div className="text-right shrink-0 pl-2 pr-1">
                  <p className="text-xl md:text-2xl font-black text-white leading-none">
                    {jugador.puntos}
                  </p>
                  <p className="text-[7px] md:text-[8px] font-bold text-slate-500 uppercase tracking-widest">Puntos</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 🚀 BOTONES FLOTANTES (CTA DOBLE) */}
      <div className="fixed bottom-0 left-0 w-full p-3 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent flex justify-center z-50">
        <div className="w-full max-w-sm flex gap-2">
          {/* Botón hacia la App */}
          <a 
            href="/"
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest py-3 px-2 rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.3)] flex justify-center items-center gap-1.5 transition-transform active:scale-95"
          >
            <span className="text-sm">🎟️</span> 
            <span className="text-[9px] md:text-[10px]">Participar</span>
          </a>
          
          {/* Botón hacia WhatsApp */}
          <a 
            href={`https://wa.me/${NUMERO_WHATSAPP}?text=${MENSAJE_WA}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black uppercase tracking-widest py-3 px-2 rounded-xl shadow-[0_0_15px_rgba(22,163,74,0.3)] flex justify-center items-center gap-1.5 transition-transform active:scale-95"
          >
            <span className="text-sm">💬</span> 
            <span className="text-[9px] md:text-[10px]">Más Info</span>
          </a>
        </div>
      </div>
    </div>
  );
}