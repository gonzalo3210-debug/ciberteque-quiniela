'use client'
// src/components/SeccionSiguiendo.tsx
//
// Sección "⭐ Siguiendo" (corrección de Gonzalo, 2026-11-14): salió de
// las pestañas de Partidos y es la TERCERA sección de la barra
// inferior (Quiniela · Partidos · Siguiendo), como en 365Scores.
// Aquí el jugador administra qué sigue: ligas y equipos, en la
// cuadrícula de siempre.
//
// Organización: encabezado por DEPORTE (hoy solo ⚽ Fútbol) con sus
// ligas y equipos soportados. La estructura queda preparada para
// sumar deportes en una fase posterior (la llave del proveedor premium
// ya trae otros deportes); hoy no se construye nada de eso.
//
// Tocar una liga abre su PÁGINA dentro de la sección Partidos (vía
// onAbrirLiga); el botón ★/Seguir solo cambia el seguimiento.
//
// Los favoritos viven en localStorage (lib/favoritos.ts): este
// componente trae su propio estado y lo lee al montarse.
import React, { useState, useEffect, useCallback } from 'react'
import type { SportsTeam } from '@/lib/sports'
import { SUPPORTED_LEAGUES } from '@/lib/sports/leagues'
import { LogoLiga, Escudo } from '@/components/partidosUI'
import { nombreEquipoES } from '@/lib/sports/nombresES'
import {
  leerFavoritos,
  guardarFavoritos,
  favoritosPorDefecto,
  type Favoritos,
  type EquipoSeguido,
} from '@/lib/favoritos'

export default function SeccionSiguiendo({
  onAbrirLiga,
}: {
  /** Abre la página de la liga en la sección Partidos. */
  onAbrirLiga: (leagueProviderId: string) => void
}) {
  const [favoritos, setFavoritos] = useState<Favoritos>(favoritosPorDefecto())
  const [listos, setListos] = useState(false)
  const [logosLiga, setLogosLiga] = useState<Record<string, string | null>>({})
  const [ligaEquipos, setLigaEquipos] = useState<string>(
    SUPPORTED_LEAGUES[0].providerId
  )
  const [equiposPorLiga, setEquiposPorLiga] = useState<
    Record<string, SportsTeam[]>
  >({})
  const [cargandoEquipos, setCargandoEquipos] = useState(false)
  const [errorEquipos, setErrorEquipos] = useState<string | null>(null)

  useEffect(() => {
    setFavoritos(leerFavoritos())
    setListos(true)
  }, [])

  // Logos de liga (una sola pedida; si falla, las listas van sin logo).
  useEffect(() => {
    fetch('/api/ligas')
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string | null> = {}
        for (const l of d.leagues || []) map[l.providerId] = l.badgeUrl ?? null
        setLogosLiga(map)
      })
      .catch(() => {})
  }, [])

  const toggleLiga = useCallback((leagueProviderId: string) => {
    setFavoritos((prev) => {
      const ligas = prev.ligas.includes(leagueProviderId)
        ? prev.ligas.filter((id) => id !== leagueProviderId)
        : [...prev.ligas, leagueProviderId]
      const next = { ...prev, ligas }
      guardarFavoritos(next)
      return next
    })
  }, [])

  const toggleEquipo = useCallback((equipo: EquipoSeguido) => {
    setFavoritos((prev) => {
      const existe = prev.equipos.some(
        (e) => e.teamProviderId === equipo.teamProviderId
      )
      const equipos = existe
        ? prev.equipos.filter((e) => e.teamProviderId !== equipo.teamProviderId)
        : [...prev.equipos, equipo]
      const next = { ...prev, equipos }
      guardarFavoritos(next)
      return next
    })
  }, [])

  const cargarEquipos = useCallback(async (ligaId: string) => {
    setCargandoEquipos(true)
    setErrorEquipos(null)
    try {
      const res = await fetch(`/api/equipos-liga?liga=${ligaId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar los equipos')
      setEquiposPorLiga((prev) => ({ ...prev, [ligaId]: data.teams || [] }))
    } catch (e) {
      setErrorEquipos(
        e instanceof Error ? e.message : 'No se pudieron cargar los equipos.'
      )
    } finally {
      setCargandoEquipos(false)
    }
  }, [])

  useEffect(() => {
    if (!equiposPorLiga[ligaEquipos]) cargarEquipos(ligaEquipos)
  }, [ligaEquipos, equiposPorLiga, cargarEquipos])

  const sigueEquipo = (teamProviderId: string) =>
    favoritos.equipos.some((e) => e.teamProviderId === teamProviderId)

  const equipos = equiposPorLiga[ligaEquipos]

  if (!listos) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Cargando lo que sigues...
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in duration-500">
      <div className="text-center mb-5">
        <h2 className="text-3xl font-black tracking-tight text-white">
          ⭐ SIGUIENDO
        </h2>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
          Tus ligas y equipos favoritos
        </p>
      </div>

      {/* ── Deporte: ⚽ Fútbol (por ahora el único; la estructura admite más) ── */}
      <div className="w-full flex flex-col gap-6">
        <h3 className="font-black text-white text-base uppercase tracking-widest">
          ⚽ Fútbol
        </h3>

        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
            Mis Ligas
          </div>
          <div>
            {SUPPORTED_LEAGUES.map((liga) => {
              const seguida = favoritos.ligas.includes(liga.providerId)
              return (
                <div
                  key={liga.providerId}
                  className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 last:border-b-0"
                >
                  <button
                    onClick={() => onAbrirLiga(liga.providerId)}
                    title={`Ver ${liga.name}`}
                    className="flex items-center gap-3 min-w-0 text-left hover:opacity-75 transition-opacity"
                  >
                    <LogoLiga
                      url={logosLiga[liga.providerId]}
                      nombre={liga.name}
                      className="w-7 h-7"
                    />
                    <span>
                      <span className="block font-bold text-white text-sm">
                        {liga.name}
                      </span>
                      <span className="block text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                        Temporada {liga.season}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => toggleLiga(liga.providerId)}
                    className={`shrink-0 px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
                      seguida
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {seguida ? '★ Siguiendo' : '☆ Seguir'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
            Mis Equipos
          </div>

          {favoritos.equipos.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-slate-800/60">
              {favoritos.equipos.map((e) => (
                <span
                  key={`${e.leagueProviderId}-${e.teamProviderId}`}
                  className="inline-flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-white"
                >
                  <Escudo url={e.badgeUrl} nombre={nombreEquipoES(e.teamName, e.teamProviderId)} />
                  {nombreEquipoES(e.teamName, e.teamProviderId)}
                  <button
                    onClick={() => toggleEquipo(e)}
                    className="w-5 h-5 rounded-full bg-slate-700 hover:bg-red-600 text-white text-[11px] font-black leading-none"
                    title="Dejar de seguir"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-slate-800/60">
            {SUPPORTED_LEAGUES.map((liga) => (
              <button
                key={liga.providerId}
                onClick={() => setLigaEquipos(liga.providerId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
                  ligaEquipos === liga.providerId
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <LogoLiga
                  url={logosLiga[liga.providerId]}
                  nombre={liga.name}
                  className="w-4 h-4"
                />
                {liga.name}
              </button>
            ))}
          </div>

          {cargandoEquipos && !equipos ? (
            <p className="px-4 py-8 text-center text-cyan-400 font-bold animate-pulse">
              Cargando equipos...
            </p>
          ) : errorEquipos && !equipos ? (
            <p className="px-4 py-8 text-center text-red-400 font-bold">
              ⚠️ {errorEquipos}
            </p>
          ) : !equipos || equipos.length === 0 ? (
            <p className="px-4 py-8 text-center text-slate-400 font-bold text-sm">
              Esta liga no trae equipos seleccionables por ahora.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2">
              {equipos.map((t) => {
                const seguido = sigueEquipo(t.providerId)
                return (
                  <button
                    key={t.providerId}
                    onClick={() =>
                      toggleEquipo({
                        leagueProviderId: ligaEquipos,
                        teamProviderId: t.providerId,
                        teamName: t.name,
                        badgeUrl: t.badgeUrl,
                      })
                    }
                    className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-800/60 text-left hover:bg-slate-800/40 transition-colors"
                  >
                    <Escudo url={t.badgeUrl} nombre={nombreEquipoES(t.name, t.providerId)} />
                    <span className="flex-1 font-bold text-white text-sm truncate">
                      {nombreEquipoES(t.name, t.providerId)}
                    </span>
                    <span
                      className={`text-lg leading-none ${
                        seguido ? 'text-amber-400' : 'text-slate-600'
                      }`}
                    >
                      {seguido ? '★' : '☆'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs font-medium">
          Tus favoritos se guardan en este dispositivo.
        </p>
      </div>
    </div>
  )
}
