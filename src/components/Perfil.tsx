'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function Perfil({ usuarioActivo, onUpdate }: { usuarioActivo: any, onUpdate?: (datos: any) => void }) {
  const [avatarUrl, setAvatarUrl] = useState(usuarioActivo?.avatar_url || '')
  // 🔥 1. Añadimos seleccionesTotales al estado
  const [estadisticas, setEstadisticas] = useState({ jugadas: 0, aciertos: 0, seleccionesTotales: 0, oros: 0, platas: 0, bronces: 0 })
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)

  // 🔥 2. EL BLINDAJE: Usamos isMounted y dependemos solo del ID para evitar el bucle infinito
  useEffect(() => {
    let isMounted = true;
    if (usuarioActivo?.avatar_url) setAvatarUrl(usuarioActivo.avatar_url)

    const cargarEstadisticas = async () => {
      if (!usuarioActivo?.id) return;
      setCargando(true);

      try {
        // 1. Obtenemos tickets junto con sus pronósticos y el resultado real del partido
        const { data: misTickets } = await supabase
          .from('tickets')
          .select(`
            quiniela_id, 
            puntos_totales,
            pronosticos(
              partidos(resultado_real)
            )
          `)
          .eq('usuario_id', usuarioActivo.id);

        if (!misTickets || misTickets.length === 0) {
          if (isMounted) setCargando(false);
          return;
        }

        const totalJugadas = misTickets.length;
        let totalAciertos = 0;
        let seleccionesCalificadas = 0;

        // Recorremos los tickets para sumar aciertos y ver cuántos partidos ya terminaron
        misTickets.forEach((t: any) => {
          totalAciertos += (t.puntos_totales || 0);
          
          if (t.pronosticos) {
            t.pronosticos.forEach((pr: any) => {
              // Si el partido ya tiene resultado oficial, lo contamos como jugado
              if (pr.partidos && pr.partidos.resultado_real !== null) {
                seleccionesCalificadas++;
              }
            });
          }
        });

        // 2. Calculamos las medallas
        let oros = 0, platas = 0, bronces = 0;
        const idsQuinielasJugadas = [...new Set(misTickets.map((t: any) => t.quiniela_id))];

        const { data: quinielasCerradas } = await supabase
          .from('quinielas')
          .select('id, goles_totales_real')
          .in('id', idsQuinielasJugadas)
          .eq('estado', 'cerrada')
          .not('goles_totales_real', 'is', null);

        if (quinielasCerradas && quinielasCerradas.length > 0) {
          const idsCerradas = quinielasCerradas.map(q => q.id);
          
          const { data: todosLosTickets } = await supabase
            .from('tickets')
            .select('id, usuario_id, quiniela_id, puntos_totales, prediccion_goles_total')
            .in('quiniela_id', idsCerradas);

          if (todosLosTickets) {
            quinielasCerradas.forEach(quiniela => {
              const competidores = todosLosTickets.filter(t => t.quiniela_id === quiniela.id);
              
              competidores.sort((a, b) => {
                if (b.puntos_totales !== a.puntos_totales) return (b.puntos_totales || 0) - (a.puntos_totales || 0);
                const diffA = Math.abs((a.prediccion_goles_total || 0) - quiniela.goles_totales_real);
                const diffB = Math.abs((b.prediccion_goles_total || 0) - quiniela.goles_totales_real);
                return diffA - diffB;
              });

              const miPosicion = competidores.findIndex(t => t.usuario_id === usuarioActivo.id);
              
              if (miPosicion === 0) oros++;
              else if (miPosicion === 1) platas++;
              else if (miPosicion === 2) bronces++;
            });
          }
        }

        if (isMounted) {
          setEstadisticas({ 
            jugadas: totalJugadas, 
            aciertos: totalAciertos, 
            seleccionesTotales: seleccionesCalificadas, 
            oros, 
            platas, 
            bronces 
          });
        }
      } catch (error) {
        console.error("Error cargando estadísticas:", error);
      } finally {
        if (isMounted) setCargando(false);
      }
    }

    cargarEstadisticas();

    return () => { isMounted = false; }
  }, [usuarioActivo?.id])

  const subirAvatar = async (e: any) => {
    try {
      setSubiendo(true)
      const file = e.target.files[0]
      if (!file) return;

      const fileExt = file.name.split('.').pop()
      const fileName = `${usuarioActivo.id}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const linkPublico = `${data.publicUrl}?t=${new Date().getTime()}`

      await supabase.from('usuarios').update({ avatar_url: linkPublico }).eq('id', usuarioActivo.id)
      
      setAvatarUrl(linkPublico)
      if (onUpdate) onUpdate({ avatar_url: linkPublico }) // Avisa al padre (Home) para actualizar toda la App
      
      alert('¡Foto de perfil actualizada con éxito!')
    } catch (error: any) {
      alert('Error al subir la imagen. Asegúrate de que pesa menos de 2MB.')
      console.error(error)
    } finally {
      setSubiendo(false)
    }
  }

  const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(usuarioActivo?.nombre || 'U')}&background=1e293b&color=3b82f6&size=200&bold=true`

  // 🔥 3. Calculamos la efectividad asegurando que no divida entre cero
  const porcentajeEfectividad = estadisticas.seleccionesTotales > 0 
    ? Math.round((estadisticas.aciertos / estadisticas.seleccionesTotales) * 100) 
    : 0;

  return (
    <div className="w-full max-w-2xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4">
      
      {/* TARJETA PRINCIPAL: FOTO Y SALDO COMPACTOS */}
      <div className="bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-800 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-20 md:h-24 bg-gradient-to-b from-blue-900/40 to-transparent"></div>
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative group mb-3">
            <img 
              src={avatarUrl || avatarFallback} 
              alt="Avatar" 
              className={`w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-slate-800 object-cover shadow-xl transition-all ${subiendo ? 'opacity-50 blur-sm' : 'group-hover:border-blue-500'}`} 
            />
            {subiendo && <div className="absolute inset-0 flex items-center justify-center font-black text-[10px] md:text-xs text-white drop-shadow-md">...</div>}
            
            <label className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full cursor-pointer hover:bg-blue-500 hover:scale-110 transition-all shadow-lg border-2 border-slate-900" title="Cambiar foto">
              <span className="text-[10px] md:text-xs">📷</span>
              <input type="file" accept="image/*" className="hidden" onChange={subirAvatar} disabled={subiendo} />
            </label>
          </div>
          
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight leading-none">{usuarioActivo?.nombre}</h2>
          <p className="text-slate-400 font-mono text-[11px] md:text-xs mt-1">{usuarioActivo?.telefono}</p>
          
          <div className="mt-4 bg-slate-950/50 inline-block px-5 py-2.5 rounded-2xl border border-slate-800 shadow-inner">
            <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Tu Billetera Digital</span>
            <span className="text-2xl md:text-3xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.2)]">
              ${usuarioActivo?.creditos_disponibles} <span className="text-xs text-green-600 uppercase">Créditos</span>
            </span>
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="text-center py-6 text-blue-400 font-bold uppercase tracking-widest text-xs animate-pulse">Analizando trayectoria...</div>
      ) : (
        <>
          {/* TARJETA DE NÚMEROS GLOBALES COMPACTA */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-slate-900/60 p-4 md:p-5 rounded-2xl border border-slate-800 flex items-center justify-between shadow-md">
              <div>
                <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Boletos Jugados</span>
                <span className="text-xl md:text-2xl font-black text-white">{estadisticas.jugadas}</span>
              </div>
              <div className="text-2xl opacity-20">🎫</div>
            </div>

            <div className="bg-slate-900/60 p-4 md:p-5 rounded-2xl border border-slate-800 flex items-center justify-between shadow-md">
              <div>
                <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Efectividad</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl md:text-2xl font-black text-blue-400">{porcentajeEfectividad}%</span>
                  <span className="text-[10px] font-bold text-slate-400 tracking-wide">
                    ({estadisticas.aciertos}/{estadisticas.seleccionesTotales})
                  </span>
                </div>
              </div>
              <div className="text-2xl opacity-20">🎯</div>
            </div>
          </div>

          {/* LA VITRINA DE TROFEOS COMPACTA */}
          <div className="bg-gradient-to-b from-amber-950/20 to-slate-900 border border-amber-900/30 p-4 md:p-5 rounded-3xl shadow-xl">
            <div className="text-center mb-4">
              <h3 className="text-lg md:text-xl font-black text-amber-500 uppercase tracking-widest">🏆 Vitrina de Trofeos</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Tu historial de podios</p>
            </div>
            
            <div className="flex justify-center gap-3 sm:gap-6 items-end">
              {/* PLATA */}
              <div className="flex flex-col items-center justify-end">
                <span className={`text-3xl md:text-4xl drop-shadow-md mb-1.5 ${estadisticas.platas === 0 ? 'opacity-30 grayscale' : ''}`}>🥈</span>
                <div className="bg-slate-950 border border-slate-800 w-14 md:w-16 text-center py-1.5 rounded-t-lg">
                  <span className="block text-[9px] text-slate-500 font-bold uppercase">2dos</span>
                  <span className="text-lg md:text-xl font-black text-slate-300">{estadisticas.platas}</span>
                </div>
              </div>

              {/* ORO */}
              <div className="flex flex-col items-center justify-end">
                <span className={`text-4xl md:text-5xl drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] mb-1.5 ${estadisticas.oros === 0 ? 'opacity-30 grayscale' : ''}`}>🥇</span>
                <div className="bg-slate-950 border border-amber-900/30 w-16 md:w-20 text-center py-3 rounded-t-lg shadow-inner">
                  <span className="block text-[9px] text-amber-500/80 font-bold uppercase">1ros</span>
                  <span className="text-xl md:text-2xl font-black text-amber-400">{estadisticas.oros}</span>
                </div>
              </div>

              {/* BRONCE */}
              <div className="flex flex-col items-center justify-end">
                <span className={`text-2xl md:text-3xl drop-shadow-md mb-1.5 ${estadisticas.bronces === 0 ? 'opacity-30 grayscale' : ''}`}>🥉</span>
                <div className="bg-slate-950 border border-slate-800 w-14 md:w-16 text-center py-1.5 rounded-t-lg">
                  <span className="block text-[9px] text-slate-500 font-bold uppercase">3ros</span>
                  <span className="text-base md:text-lg font-black text-amber-700">{estadisticas.bronces}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}