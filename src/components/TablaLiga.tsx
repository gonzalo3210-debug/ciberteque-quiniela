'use client'
// src/components/TablaLiga.tsx
//
// Tabla de posiciones DE LA LIGA MX con datos reales del proveedor
// (vía /api/tabla-liga). Es la tabla de la liga, NO el ranking del Club
// entre jugadores (ese es la pestaña Ranking y no se toca).
//
// Cuando exista el refresco en vivo, esta vista podrá marcar la tabla
// como "EN VIVO" y recalcularla al caer gol con computeLiveStandings
// (src/lib/sports) sobre los marcadores en curso.
import React, { useState, useEffect, useCallback } from 'react'
import type { StandingRow } from '@/lib/sports'

const colorForma = (letra: string) => {
  if (letra === 'W') return 'bg-green-500 text-white'
  if (letra === 'D') return 'bg-slate-500 text-white'
  if (letra === 'L') return 'bg-red-500 text-white'
  return 'bg-slate-700 text-slate-300'
}

const claseZona = (rank: number) => {
  if (rank <= 6) return 'border-l-4 border-l-green-500' // Liguilla directa
  if (rank <= 10) return 'border-l-4 border-l-amber-500' // Play-in
  return 'border-l-4 border-l-transparent'
}

export default function TablaLiga() {
  const [filas, setFilas] = useState<StandingRow[]>([])
  const [temporada, setTemporada] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/tabla-liga')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar la tabla')
      setFilas(data.rows || [])
      setTemporada(data.season || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la tabla de la Liga MX.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (cargando) {
    return <div className="text-cyan-400 font-bold animate-pulse py-20">Cargando tabla de la Liga MX...</div>
  }

  if (error) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-bold mb-4">⚠️ {error}</p>
        <button onClick={cargar} className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl animate-in fade-in duration-500">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-black tracking-tight text-white">⚽ TABLA LIGA MX</h2>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
          Temporada {temporada} · Posiciones oficiales
        </p>
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
                <tr key={f.teamProviderId || f.teamName} className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${claseZona(f.rank)}`}>
                  <td className="py-2.5 px-3 font-black text-slate-300">{f.rank}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2.5">
                      {f.badgeUrl
                        ? <img src={f.badgeUrl} alt={f.teamName} className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                        : <span className="w-6 h-6 shrink-0 rounded bg-slate-800 inline-block" />}
                      <span className="font-bold text-white whitespace-nowrap">{f.teamName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.played}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.won}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.drawn}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.lost}</td>
                  <td className="py-2.5 px-2 text-center text-slate-400 hidden sm:table-cell">{f.goalsFor}</td>
                  <td className="py-2.5 px-2 text-center text-slate-400 hidden sm:table-cell">{f.goalsAgainst}</td>
                  <td className="py-2.5 px-2 text-center text-slate-300">{f.goalDifference > 0 ? `+${f.goalDifference}` : f.goalDifference}</td>
                  <td className="py-2.5 px-3 text-center font-black text-white">{f.points}</td>
                  <td className="py-2.5 px-2 hidden md:table-cell">
                    <div className="flex justify-center gap-1">
                      {(f.form || '').split('').slice(-5).map((letra, i) => (
                        <span key={i} className={`w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center ${colorForma(letra)}`}>
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

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
        <span><span className="text-green-500">▌</span> Liguilla directa (1–6)</span>
        <span><span className="text-amber-500">▌</span> Play-in (7–10)</span>
      </div>
    </div>
  )
}
