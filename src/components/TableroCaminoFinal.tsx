'use client'
// src/components/TableroCaminoFinal.tsx
//
// 🏁 CAMINO A LA FINAL — el tablero del modo sorteo.
//
// Cuando el sorteo ya se ejecutó, cada pase vive o muere con su
// equipo en el cuadro eliminatorio. Este tablero lo cuenta en
// columnas por etapa (Cuartos → Semifinal → Final → 👑 Campeón):
// cada ficha es un pase con el escudo de su equipo y su jugador;
// vivo = color pleno, eliminado = atenuado con su caída ("Cayó en
// Cuartos · 0-2 vs América"), campeón = dorado.
//
// Todo el estado se DERIVA de los resultados con la lógica pura
// (src/lib/caminoFinal.ts): nada se escribe en la base y el tablero
// se actualiza con el refresco en tiempo real de partidos que la
// Cartelera ya usa. Cuando un refresco mueve a alguien (avanza,
// cae o se corona), su ficha se anima una vez; la detección es la
// función pura detectarCambiosCamino, comparando contra la foto
// anterior. Los sonidos respetan la preferencia 🔊 de siempre
// (apagada por defecto) y solo suenan por los pases del propio
// jugador: avance = golpe, corona = fanfarria, caída = silbatazo.
// Un marcador EN VIVO no anima ni elimina: solo se avisa "en
// riesgo" como dato parcial, porque nada es oficial hasta el final.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calcularCaminoFinal,
  detectarCambiosCamino,
  fotoCamino,
  type CambioCamino,
  type EstadoPaseCamino,
  type FotoPaseCamino,
  type PartidoCamino,
} from '@/lib/caminoFinal'
import type { AsignacionSorteo } from '@/lib/sorteoCeremonia'
import {
  leerPreferenciaSonidos,
  sonarFanfarria,
  sonarGolpe,
  sonarSilbatazo,
  vibrarGol,
} from '@/lib/sonidos'

const CLASE_CAMBIO: Record<CambioCamino, string> = {
  avanzo: 'camino-avanza',
  eliminado: 'camino-cae',
  campeon: 'camino-campeon',
}

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    const fecha = d
      .toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
      .toUpperCase()
      .replace('.', '')
    const hora = d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    return `${fecha} · ${hora}`
  } catch {
    return null
  }
}

function LineaEstado({ estado }: { estado: EstadoPaseCamino }) {
  if (estado.estado === 'campeon') {
    return (
      <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
        👑 ¡Campeón!
      </span>
    )
  }
  if (estado.estado === 'eliminado' && estado.caida) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 leading-snug">
        💀 Cayó en {estado.caida.etapaNombre} · {estado.caida.marcadorTexto}{' '}
        vs {estado.caida.rivalNombre}
      </span>
    )
  }
  const prox = estado.proximoPartido
  if (!prox) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        ⏳ Esperando rival
      </span>
    )
  }
  if (prox.enVivo) {
    return (
      <span
        className={`text-[10px] font-black uppercase tracking-wide leading-snug ${
          estado.enRiesgo ? 'text-amber-400' : 'text-emerald-400'
        }`}
      >
        🔴 En vivo {prox.golesFavor}-{prox.golesContra} vs {prox.rivalNombre}
        {estado.enRiesgo ? ' · ⚠️ en riesgo' : ''}
      </span>
    )
  }
  const fecha = fechaCorta(prox.fecha)
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-snug">
      Sigue: vs {prox.rivalNombre}
      {fecha ? ` · ${fecha}` : ''}
    </span>
  )
}

interface TableroCaminoFinalProps {
  usuarioActivoId?: string | null
  asignaciones: AsignacionSorteo[]
  partidos: PartidoCamino[]
  /** Equipos del bombo (8); si falta, el cálculo lo infiere. */
  cantidadEquipos?: number
}

export default function TableroCaminoFinal({
  usuarioActivoId,
  asignaciones,
  partidos,
  cantidadEquipos,
}: TableroCaminoFinalProps) {
  const camino = useMemo(
    () =>
      calcularCaminoFinal(
        asignaciones,
        partidos,
        cantidadEquipos && cantidadEquipos > 0
          ? cantidadEquipos
          : undefined
      ),
    [asignaciones, partidos, cantidadEquipos]
  )

  // Detección de cambios entre refrescos para animar una sola vez.
  const fotoRef = useRef<Map<string, FotoPaseCamino> | null>(null)
  const [cambios, setCambios] = useState<Map<string, CambioCamino>>(
    new Map()
  )

  useEffect(() => {
    const nuevos = detectarCambiosCamino(fotoRef.current, camino.pases)
    fotoRef.current = fotoCamino(camino.pases)
    if (nuevos.size === 0) return
    setCambios(nuevos)

    // Sonidos: solo por los pases del propio jugador y solo si
    // activó 🔊 Sonidos (apagado por defecto). Prioridad: corona >
    // avance > caída.
    const propios = camino.pases.filter(
      (e) => e.pase.usuarioId === usuarioActivoId
    )
    const cambiosPropios = propios
      .map((e) => nuevos.get(e.pase.ticketId))
      .filter(Boolean) as CambioCamino[]
    if (cambiosPropios.length > 0 && leerPreferenciaSonidos()) {
      if (cambiosPropios.includes('campeon')) sonarFanfarria()
      else if (cambiosPropios.includes('avanzo')) sonarGolpe()
      else if (cambiosPropios.includes('eliminado')) sonarSilbatazo()
      vibrarGol()
    }

    const limpieza = setTimeout(() => setCambios(new Map()), 3000)
    return () => clearTimeout(limpieza)
  }, [camino, usuarioActivoId])

  if (asignaciones.length === 0) return null

  const nombresCampeones = camino.hayCampeon
    ? camino.pases
        .filter((e) => e.estado === 'campeon')
        .map((e) => e.pase.nombreJugador)
    : []
  const equipoCampeon = camino.hayCampeon
    ? camino.pases.find((e) => e.estado === 'campeon')?.pase.nombreEquipo
    : null

  return (
    <div className="py-5 px-3 md:px-4 bg-slate-950/40 rounded-xl border border-slate-800 mb-6">
      <style>{`
        @keyframes caminoAvance {
          0% { transform: translateX(-16px); box-shadow: 0 0 0 rgba(34,197,94,0); }
          35% { box-shadow: 0 0 24px rgba(34,197,94,0.55); }
          100% { transform: translateX(0); box-shadow: 0 0 0 rgba(34,197,94,0); }
        }
        .camino-avanza { animation: caminoAvance 1.8s ease-out; border-color: rgba(34,197,94,0.85) !important; }
        @keyframes caminoCaida {
          0% { transform: translateY(0); opacity: 1; }
          35% { transform: translateY(7px); }
          100% { transform: translateY(0); opacity: 0.72; }
        }
        .camino-cae { animation: caminoCaida 1.8s ease-out; }
        @keyframes caminoCorona {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(245,158,11,0); }
          40% { transform: scale(1.045); box-shadow: 0 0 30px rgba(245,158,11,0.8); }
          100% { transform: scale(1); box-shadow: 0 0 14px rgba(245,158,11,0.35); }
        }
        .camino-campeon { animation: caminoCorona 2.2s ease-out; }
      `}</style>

      <div className="text-center">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">
          🏁 Camino a la final
        </span>
        <p className="text-slate-400 text-[11px] mt-1">
          {camino.partidosTotales === 0
            ? 'El cuadro se activa cuando se carguen los partidos de la eliminatoria.'
            : `${camino.partidosFinales} de ${camino.partidosTotales} partidos finales · tu equipo te mantiene vivo mientras siga ganando.`}
        </p>
      </div>

      {camino.hayCampeon && (
        <div className="mt-4 mx-auto max-w-md text-center bg-amber-950/40 border border-amber-600/60 rounded-2xl px-4 py-3 animate-in zoom-in-95 duration-500">
          <span className="text-2xl block">👑</span>
          <p className="text-amber-300 font-black uppercase tracking-widest text-sm mt-1">
            ¡{equipoCampeon} campeón!
          </p>
          <p className="text-amber-200/80 text-[11px] font-bold uppercase tracking-wide mt-0.5">
            {nombresCampeones.join(' · ')}
          </p>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 mt-4 -mx-1 px-1">
        {camino.columnas.map((columna, i) => {
          const fichas = camino.porColumna[i] || []
          const vivos = fichas.filter((f) => f.estado !== 'eliminado').length
          return (
            <div key={columna.indice} className="min-w-[150px] w-[150px] shrink-0">
              <div
                className={`text-center rounded-lg px-2 py-1.5 border ${
                  columna.esCampeon
                    ? 'bg-amber-950/40 border-amber-700/60 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                  {columna.esCampeon ? '👑 ' : ''}
                  {columna.nombre}
                </span>
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                  {fichas.length === 0
                    ? 'Por definir'
                    : columna.esCampeon
                      ? `${fichas.length} pase(s)`
                      : `${vivos} vivo(s) · ${fichas.length - vivos} fuera`}
                </span>
              </div>

              <div className="space-y-2 mt-2">
                {fichas.map((estado) => {
                  const esPropio =
                    !!usuarioActivoId &&
                    estado.pase.usuarioId === usuarioActivoId
                  const cambio = cambios.get(estado.pase.ticketId)
                  return (
                    <div
                      key={estado.pase.ticketId}
                      className={`rounded-xl border p-2.5 flex flex-col gap-1.5 transition-colors ${
                        estado.estado === 'campeon'
                          ? 'bg-amber-950/40 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                          : estado.estado === 'eliminado'
                            ? 'bg-slate-950/70 border-slate-800 opacity-70'
                            : 'bg-slate-900 border-slate-700'
                      } ${esPropio && estado.estado !== 'eliminado' ? 'ring-1 ring-amber-400/70' : ''} ${
                        cambio ? CLASE_CAMBIO[cambio] : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-9 h-9 bg-slate-950 border border-slate-800 rounded-full p-1.5 flex items-center justify-center shrink-0 ${
                            estado.estado === 'eliminado' ? 'grayscale' : ''
                          }`}
                        >
                          {estado.pase.logoUrl ? (
                            <img
                              src={estado.pase.logoUrl}
                              alt=""
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-xs">⚽</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`font-black uppercase text-[11px] leading-tight truncate ${
                              estado.estado === 'campeon'
                                ? 'text-amber-300'
                                : 'text-slate-100'
                            }`}
                          >
                            {estado.pase.nombreEquipo}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 truncate leading-tight">
                            {esPropio ? '⭐ ' : ''}
                            {estado.pase.nombreJugador}
                          </p>
                        </div>
                      </div>
                      <LineaEstado estado={estado} />
                    </div>
                  )
                })}
                {fichas.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 p-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Aún nadie
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-slate-500 text-[10px] mt-3 leading-relaxed">
        El tablero se mueve solo con resultados <b>finales</b>: un
        marcador en vivo no elimina a nadie, solo avisa si tu equipo va
        en riesgo.
      </p>
    </div>
  )
}
