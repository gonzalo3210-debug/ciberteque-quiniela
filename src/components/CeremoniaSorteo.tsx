'use client'
// src/components/CeremoniaSorteo.tsx
//
// LA CEREMONIA PÚBLICA DEL SORTEO 🎲
//
// Cuando el admin ejecuta el sorteo (ejecutarSorteoMundial, que no se
// toca), las asignaciones pase→equipo quedan guardadas. Esta vista es
// el REPLAY para los jugadores, presentado como el TABLERO del
// Árbitro: los 8 renglones visibles todo el tiempo (número + la
// pareja jugador↔equipo a la derecha). Al entrar, el tablero se
// BARAJA: cada renglón enseña combinaciones cambiantes de un jugador
// con un equipo (nombre y equipo se mueven, efecto rifa), con el
// redoble sonando. Después los renglones se van FIJANDO de uno en
// uno en su asignación REAL, en el orden del plan (los pases del
// propio jugador AL FINAL, como cumbre, con su golpe de sonido), y
// cierra con fanfarria, confeti y el tablero ya fijo. Se puede saltar
// ("Ver resultado"), y quien ya la vio entra directo al tablero fijo
// con opción de verla de nuevo.
//
// El orden, los tiempos y el barajeo salen de la lógica pura
// (src/lib/sorteoCeremonia.ts); aquí solo hay presentación, timers y
// sonidos (los de siempre: solo si el jugador activó 🔊 Sonidos).

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  planRevelado,
  estadoRenglonCeremonia,
  comboEnBarajeo,
  DURACION_GIRO_MS,
  DURACION_REVELADO_MS,
  INTERVALO_BARAJEO_MS,
  type AsignacionSorteo,
  type FaseCeremonia,
} from '@/lib/sorteoCeremonia'
import {
  leerPreferenciaSonidos,
  iniciarRedoble,
  sonarGolpe,
  sonarFanfarria,
  vibrarGol,
} from '@/lib/sonidos'
import type { EquipoBombo } from '@/hooks/useCeremoniaSorteo'

const claveVista = (quinielaId: string) =>
  `club_ceremonia_sorteo_vista_${quinielaId}`

function leerYaVista(quinielaId: string): boolean {
  try {
    return window.localStorage.getItem(claveVista(quinielaId)) === '1'
  } catch {
    return false
  }
}

/** Confeti ligero: piezas DOM animadas con Web Animations, sin librerías. */
function Confeti() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const contenedor = ref.current
    if (!contenedor) return
    const colores = ['#f59e0b', '#3b82f6', '#22c55e', '#eab308', '#f8fafc', '#a855f7']
    const piezas: HTMLElement[] = []
    for (let i = 0; i < 70; i++) {
      const el = document.createElement('div')
      const tam = 6 + Math.random() * 7
      el.style.cssText = `position:absolute;top:-4%;left:${Math.random() * 100}%;width:${tam}px;height:${tam * 0.6}px;background:${colores[i % colores.length]};border-radius:2px;`
      contenedor.appendChild(el)
      piezas.push(el)
      el.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
          {
            transform: `translateY(${360 + Math.random() * 180}px) rotate(${540 + Math.random() * 540}deg)`,
            opacity: 0.85,
          },
        ],
        {
          duration: 2400 + Math.random() * 1600,
          delay: Math.random() * 350,
          easing: 'cubic-bezier(.2,.7,.4,1)',
          fill: 'forwards',
        }
      )
    }
    const limpieza = setTimeout(() => piezas.forEach((p) => p.remove()), 4800)
    return () => {
      clearTimeout(limpieza)
      piezas.forEach((p) => p.remove())
    }
  }, [])

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 overflow-hidden z-20"
    />
  )
}

interface CeremoniaSorteoProps {
  quinielaId: string
  nombreJornada: string
  usuarioActivoId?: string | null
  asignaciones: AsignacionSorteo[]
  equiposBombo: EquipoBombo[]
}

export default function CeremoniaSorteo({
  quinielaId,
  nombreJornada,
  usuarioActivoId,
  asignaciones,
}: CeremoniaSorteoProps) {
  const plan = useMemo(
    () => planRevelado(asignaciones, usuarioActivoId),
    [asignaciones, usuarioActivoId]
  )
  const [fase, setFase] = useState<FaseCeremonia>(() =>
    leerYaVista(quinielaId) ? 'final' : 'giro'
  )
  const [pasoActual, setPasoActual] = useState(0)
  const [tick, setTick] = useState(0)
  const [confeti, setConfeti] = useState(false)
  // ¿Esta sesión sí está viendo la ceremonia (no entró directo al
  // tablero fijo)? Decide la fanfarria y el confeti al llegar al final.
  const jugandoRef = useRef(fase !== 'final')

  // 🎲 Barajeo: mientras la ceremonia corre, el reloj del barajeo
  // avanza y cada renglón no fijado enseña otra pareja jugador↔equipo.
  useEffect(() => {
    if (fase === 'final') return
    const barajeo = setInterval(
      () => setTick((t) => t + 1),
      INTERVALO_BARAJEO_MS
    )
    return () => clearInterval(barajeo)
  }, [fase])

  // 🥁 Giro inicial: redoble mientras todo el tablero se baraja, y a
  // fijar renglones.
  useEffect(() => {
    if (fase !== 'giro') return
    const detenerRedoble = leerPreferenciaSonidos()
      ? iniciarRedoble(DURACION_GIRO_MS)
      : () => {}
    const temporizador = setTimeout(() => {
      setPasoActual(0)
      setFase('revelando')
    }, DURACION_GIRO_MS)
    return () => {
      detenerRedoble()
      clearTimeout(temporizador)
    }
  }, [fase])

  // 🎯 Fijado de uno en uno: golpe al caer cada asignación real.
  useEffect(() => {
    if (fase !== 'revelando') return
    const paso = plan[pasoActual]
    if (!paso) {
      setFase('final')
      return
    }
    if (leerPreferenciaSonidos()) sonarGolpe()
    if (paso.esPropio) vibrarGol()
    const temporizador = setTimeout(() => {
      if (pasoActual + 1 < plan.length) setPasoActual(pasoActual + 1)
      else setFase('final')
    }, DURACION_REVELADO_MS)
    return () => clearTimeout(temporizador)
  }, [fase, pasoActual, plan])

  // 🎉 Al llegar al final: queda marcada como vista; si la ceremonia
  // se jugó en esta sesión, fanfarria y confeti.
  useEffect(() => {
    if (fase !== 'final') return
    try {
      window.localStorage.setItem(claveVista(quinielaId), '1')
    } catch {
      // Sin almacenamiento: la próxima visita la vuelve a ofrecer.
    }
    if (!jugandoRef.current) return
    if (leerPreferenciaSonidos()) sonarFanfarria()
    setConfeti(true)
    const temporizador = setTimeout(() => setConfeti(false), 4800)
    return () => clearTimeout(temporizador)
  }, [fase, quinielaId])

  if (plan.length === 0) return null

  const verResultado = () => setFase('final')
  const verDeNuevo = () => {
    jugandoRef.current = true
    setConfeti(false)
    setPasoActual(0)
    setFase('giro')
  }

  return (
    <div className="relative overflow-hidden flex flex-col items-center py-6 px-4 bg-blue-950/20 rounded-xl border border-blue-900/40 mb-6">
      {confeti && <Confeti />}

      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">
        🎲 El sorteo se hizo
      </span>
      <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-widest text-center mt-1">
        {nombreJornada}
      </h3>

      {fase === 'giro' && (
        <p className="mt-3 text-blue-300 font-black uppercase tracking-widest text-xs animate-pulse">
          El bombo está girando…
        </p>
      )}
      {fase === 'revelando' && (
        <p className="mt-3 text-slate-400 font-black uppercase tracking-widest text-[10px]">
          Revelando {Math.min(pasoActual + 1, plan.length)} de {plan.length}
        </p>
      )}

      {/* EL TABLERO: los renglones se barajan y se van fijando. */}
      <div className="w-full mt-5">
        <div className="space-y-2 max-w-md mx-auto">
          {plan.map((p, i) => {
            const estado = estadoRenglonCeremonia(i, fase, pasoActual)
            const recienFijado = fase === 'revelando' && i === pasoActual
            if (estado === 'fijado') {
              return (
                <div
                  key={p.asignacion.ticketId}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    recienFijado ? 'animate-in zoom-in-95 duration-300 ' : ''
                  }${
                    p.esPropio
                      ? 'bg-amber-950/40 border-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                      : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <span className="text-slate-500 font-black text-xs w-5 text-center">
                    {i + 1}
                  </span>
                  <span
                    className={`flex-1 font-black uppercase text-xs truncate ${
                      p.esPropio ? 'text-amber-300' : 'text-slate-200'
                    }`}
                  >
                    {p.esPropio ? '⭐ ' : ''}
                    {p.asignacion.nombreJugador}
                  </span>
                  <span className="font-black text-amber-400 uppercase text-xs truncate max-w-[110px]">
                    {p.asignacion.nombreEquipo}
                  </span>
                  <div className="w-9 h-9 bg-slate-950 border border-slate-800 rounded-full p-1.5 flex items-center justify-center shrink-0">
                    {p.asignacion.logoUrl ? (
                      <img
                        src={p.asignacion.logoUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs">⚽</span>
                    )}
                  </div>
                </div>
              )
            }
            const combo = comboEnBarajeo(plan, tick, i)
            return (
              <div
                key={p.asignacion.ticketId}
                className="flex items-center gap-3 rounded-xl border border-blue-800/60 bg-slate-900 px-3 py-2 shadow-[0_0_12px_rgba(59,130,246,0.25)]"
              >
                <span className="text-slate-500 font-black text-xs w-5 text-center">
                  {i + 1}
                </span>
                <span className="flex-1 font-black uppercase text-xs truncate text-blue-200">
                  {combo?.nombreJugador ?? '…'}
                </span>
                <span className="font-black text-blue-400 uppercase text-xs truncate max-w-[110px]">
                  {combo?.nombreEquipo ?? '…'}
                </span>
                <div className="w-9 h-9 bg-slate-950 border border-blue-700 rounded-full p-1.5 flex items-center justify-center shrink-0 animate-pulse">
                  {combo?.logoUrl ? (
                    <img
                      src={combo.logoUrl}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs">🎰</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {fase === 'final' && (
        <div className="w-full animate-in fade-in duration-500">
          <p className="text-center text-slate-400 text-[11px] mt-4 leading-relaxed">
            🍀 Tu equipo te mantiene vivo mientras siga ganando.
            <br />
            ¡Mucha suerte a todos!
          </p>
          <div className="flex justify-center mt-4">
            <button
              onClick={verDeNuevo}
              className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95"
            >
              ▶ Ver la ceremonia de nuevo
            </button>
          </div>
        </div>
      )}

      {fase !== 'final' && (
        <button
          onClick={verResultado}
          className="mt-6 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-slate-600 transition-all active:scale-95"
        >
          Ver resultado ⏩
        </button>
      )}
    </div>
  )
}
