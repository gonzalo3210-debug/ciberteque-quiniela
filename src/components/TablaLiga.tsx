'use client'
// src/components/TablaLiga.tsx
//
// Tabla de posiciones DE UNA LIGA (la que se elija en el selector de la
// sección "⚽ Partidos"), con datos del proveedor vía /api/tabla-liga.
// NO es el ranking del Club entre jugadores (ese es la pestaña Ranking).
//
// Regla de Gonzalo (2026-11-13): la tabla se recalcula AL CAER GOL. La
// ruta devuelve `liveRows` ya recalculada con computeLiveStandings cuando
// la liga tiene partidos en curso; esta vista la muestra con la etiqueta
// "EN VIVO" y se refresca sola cada 2 minutos.
// Las ligas de grupos/copa sin tabla única (hasStandings=false) muestran
// un mensaje claro en vez de una tabla vacía.
import React, { useState, useEffect, useCallback } from 'react'
import type { StandingRow } from '@/lib/sports'
import type { SupportedLeague } from '@/lib/sports/leagues'

interface TablaResponse {
  league: SupportedLeague
  hasStandings: boolean
  rows: StandingRow[]
  liveRows: StandingRow[] | null
  hasLive: boolean
}

const REFRESCO_MS = 120_000 // 2 minutos

const colorForma = (letra: string) => {
  if (letra === 'W') return 'bg-green-500 text-white'
  if (letra === 'D') return 'bg-slate-500 text-white'
  if (letra === 'L') return 'bg-red-500 text-white'
  return 'bg-slate-700 text-slate-300'
}

const claseZona = (liga: SupportedLeague, rank: number, total: number) => {
  if (liga.zones === 'liga-mx') {
    if (rank <= 6) return 'border-l-4 border-l-green-500' // Liguilla directa
    if (rank <= 10) return 'border-l-4 border-l-amber-500' // Play-in
  } else if (liga.zones === 'europa') {
    if (rank <= 4) return 'border-l-4 border-l-green-500' // Champions
    if (rank === 5) return 'border-l-4 border-l-amber-500' // Europa League
    if (rank > total - 3) return 'border-l-4 border-l-red-500' // Descenso
  }
  return 'border-l-4 border-l-transparent'
}

export default function TablaLiga({ liga }: { liga: SupportedLeague }) {
  const [datos, setDatos] = useState<TablaResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/tabla-liga?liga=${liga.providerId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar la tabla')
      setDatos(data as TablaResponse)
      setError(null)
    } catch (e) {
      // Con datos ya visibles, un fallo de refresco no tumba la tabla.
      setDatos((prev) => {
        if (!prev) {
          setError(
            e instanceof Error
              ? e.message
              : `No se pudo cargar la tabla de ${liga.name}.`
          )
        }
        return prev
      })
    } finally {
      setCargando(false)
    }
  }, [liga.providerId, liga.name])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  if (cargando) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Cargando tabla de {liga.name}...
      </div>
    )
  }

  if (error && !datos) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-bold mb-4">⚠️ {error}</p>
        <button
          onClick={cargar}
          className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (datos && !datos.hasStandings) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center animate-in fade-in duration-500">
        <p className="text-4xl mb-3">🏆</p>
        <p className="text-white font-black text-lg mb-2">{liga.name}</p>
        <p className="text-slate-400 text-sm font-medium">
          Esta competencia se juega por grupos y llaves, y no maneja una
          tabla única de posiciones. Puedes seguir sus partidos en las
          vistas de Favoritos y Resultados.
        </p>
      </div>
    )
  }

  if (!datos || datos.rows.length === 0) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center animate-in fade-in duration-500">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-white font-black text-lg mb-2">{liga.name}</p>
        <p className="text-slate-400 text-sm font-medium">
          Todavía no hay tabla de posiciones disponible para esta liga.
          Intenta de nuevo más tarde.
        </p>
      </div>
    )
  }

  const enVivo = datos.hasLive && datos.liveRows !== null
  const filas = enVivo ? (datos.liveRows as StandingRow[]) : datos.rows

  return (
    <div className="w-full max-w-3xl animate-in fade-in duration-500">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-black tracking-tight text-white">
          {liga.name}
        </h3>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
          Temporada {datos.league.season} ·{' '}
          {enVivo ? 'Tabla en vivo (provisional)' : 'Posiciones oficiales'}
        </p>
        {enVivo && (
          <span className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/50 text-red-400 text-[11px] font-black uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            En vivo — se actualiza al caer gol
          </span>
        )}
      </div>

      <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-slate-400 text-[11px] uppercase tracking-widest border-b border-slate-800">
                <th className="py-3 px-3 text-left font-black">#</th>
                <th className="py-3 px-2 text-left font-black">Equipo</th>
                <th className="py-3 px-2 text-center font-black">PJ</th>
                <th className="py-3 px-2 text-center font-black">G</th>
                <th className="py-3 px-2 text-center font-black">E</th>
                <th className="py-3 px-2 text-center font-black">P</th>
                <th className="py-3 px-2 text-center font-black hidden sm:table-cell">GF</th>
                <th className="py-3 px-2 text-center font-black hidden sm:table-cell">GC</th>
                <th className="py-3 px-2 text-center font-black">DG</th>
                <th className="py-3 px-3 text-center font-black text-white">Pts</th>
                <th className="py-3 px-2 text-center font-black hidden md:table-cell">Forma</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.teamProviderId || f.teamName}
                  className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${claseZona(liga, f.rank, filas.length)}`}
                >
                  <td className="py-2.5 px-3 font-black text-slate-300">{f.rank}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2.5">
                      {f.badgeUrl ? (
                        <img src={f.badgeUrl} alt={f.teamName} className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                      ) : (
                        <span className="w-6 h-6 shrink-0 rounded bg-slate-800 inline-block" />
                      )}
                      <span className="font-bold text-white whitespace-nowrap">{f.teamName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.played}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.won}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.drawn}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.lost}</td>
                  <td className="py-2.5 px-2 text-center text-slate-400 hidden sm:table-cell">{f.goalsFor}</td>
                  <td className="py-2.5 px-2 text-center text-slate-400 hidden sm:table-cell">{f.goalsAgainst}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">
                    {f.goalDifference > 0 ? `+${f.goalDifference}` : f.goalDifference}
                  </td>
                  <td className="py-2.5 px-3 text-center font-black text-white">{f.points}</td>
                  <td className="py-2.5 px-2 hidden md:table-cell">
                    <div className="flex justify-center gap-1">
                      {(f.form || '')
                        .split('')
                        .slice(-5)
                        .map((letra, i) => (
                          <span
                            key={i}
                            className={`w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center ${colorForma(letra)}`}
                          >
                            {letra}
                          </span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {liga.zones === 'liga-mx' && (
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          <span><span className="text-green-500">▌</span> Liguilla directa (1–6)</span>
          <span><span className="text-amber-500">▌</span> Play-in (7–10)</span>
        </div>
      )}
      {liga.zones === 'europa' && (
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          <span><span className="text-green-500">▌</span> Champions (1–4)</span>
          <span><span className="text-amber-500">▌</span> Europa League (5)</span>
          <span><span className="text-red-500">▌</span> Descenso (últimos 3)</span>
        </div>
      )}
    </div>
  )
}
