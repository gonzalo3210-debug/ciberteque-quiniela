'use client'
// src/components/ExploradorLigas.tsx
//
// Explorador "🌎 Ligas" de la sección Partidos (2026-11-17): TODAS
// las ligas del proveedor, no solo las curadas del Club. Arriba, los
// chips de DEPORTE (con nombre en español); debajo, un buscador y la
// lista de ligas de ese deporte. Al tocar una liga, el padre abre su
// página (Resumen · Partidos · Posiciones) por su ID de proveedor.
//
// El catálogo completo viene de /api/ligas-catalogo (el servidor lo
// cachea 24 h): esta vista lo pide una sola vez al montarse. Las
// ligas del Club van primero en su deporte, marcadas con ⭐.
import React, { useState, useEffect, useMemo } from 'react'
import type { DeporteConLigas } from '@/lib/sports/catalogo'
import { getSupportedLeague } from '@/lib/sports/leagues'

/** Tope de renglones pintados: hay deportes con cientos de ligas y
 *  el buscador está para acotar; pintar todo tumba el teléfono. */
const MAX_FILAS = 100

/** Minúsculas sin acentos, para buscar sin pelear con el teclado. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export default function ExploradorLigas({
  onVerLiga,
  abriendoId,
}: {
  /** Abrir la página de la liga (curada o del catálogo). */
  onVerLiga: (leagueProviderId: string) => void
  /** Liga cuyo detalle se está cargando (feedback en su renglón). */
  abriendoId: string | null
}) {
  const [deportes, setDeportes] = useState<DeporteConLigas[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deporte, setDeporte] = useState('Soccer')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let activo = true
    fetch('/api/ligas-catalogo')
      .then((r) => r.json())
      .then((d) => {
        if (!activo) return
        if (d?.error) throw new Error(d.error)
        setDeportes(d.sports || [])
      })
      .catch((e) => {
        if (activo) {
          setError(
            e instanceof Error
              ? e.message
              : 'No se pudo cargar el catálogo de ligas.'
          )
        }
      })
    return () => {
      activo = false
    }
  }, [])

  const visibles = useMemo(() => {
    if (!deportes) return []
    const delDeporte = deportes.find((d) => d.sport === deporte)
    const ligas = delDeporte?.ligas || []
    const q = normalizar(texto)
    if (!q) return ligas
    return ligas.filter((l) => {
      // Busca por el nombre del proveedor y por el nombre curado en
      // español si la liga es del Club ("Premier League").
      const visible = getSupportedLeague(l.providerId)?.name ?? l.name
      return normalizar(l.name).includes(q) || normalizar(visible).includes(q)
    })
  }, [deportes, deporte, texto])

  if (!deportes && !error) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Cargando todas las ligas...
      </div>
    )
  }

  if (error && !deportes) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-bold">⚠️ {error}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 animate-in fade-in duration-500">
      {/* ── Chips de deporte ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {(deportes || []).map((d) => (
          <button
            key={d.sport}
            onClick={() => setDeporte(d.sport)}
            className={`shrink-0 px-3.5 py-2 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
              deporte === d.sport
                ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {d.nombreES}{' '}
            <span className="opacity-60 normal-case tracking-normal">
              {d.ligas.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Buscador dentro del deporte ── */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800/50">
        <span className="text-lg">🔎</span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Busca una liga de este deporte…"
          className="flex-1 bg-transparent outline-none text-white font-bold text-sm placeholder:text-slate-500 min-w-0"
        />
        {texto && (
          <button
            onClick={() => setTexto('')}
            className="shrink-0 text-slate-400 hover:text-white font-black"
            title="Limpiar"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Lista de ligas ── */}
      {visibles.length === 0 ? (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-slate-300 font-bold text-sm">
            Sin ligas para “{texto.trim()}” en este deporte. Prueba con
            otro nombre.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          {visibles.slice(0, MAX_FILAS).map((l) => (
            <button
              key={l.providerId}
              onClick={() => onVerLiga(l.providerId)}
              disabled={abriendoId === l.providerId}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 last:border-b-0 text-left hover:bg-slate-800/40 transition-colors disabled:opacity-60"
            >
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-white text-sm truncate">
                  {getSupportedLeague(l.providerId)?.name ?? l.name}
                </span>
                <span className="block text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                  {l.curada ? '⭐ Liga del club' : 'Ver liga'}
                </span>
              </span>
              {abriendoId === l.providerId ? (
                <span className="text-cyan-400 text-xs font-bold animate-pulse shrink-0">
                  Abriendo…
                </span>
              ) : (
                <span className="text-slate-500 shrink-0">→</span>
              )}
            </button>
          ))}
        </div>
      )}

      {visibles.length > MAX_FILAS && (
        <p className="text-center text-slate-500 text-xs font-medium">
          Se muestran las primeras {MAX_FILAS} de {visibles.length}{' '}
          ligas. Escribe en el buscador para encontrar la tuya.
        </p>
      )}
    </div>
  )
}
