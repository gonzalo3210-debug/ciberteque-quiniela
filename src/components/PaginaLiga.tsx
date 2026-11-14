'use client'
// src/components/PaginaLiga.tsx
//
// PÁGINA DE UNA LIGA (corrección de Gonzalo, 2026-11-14, estilo
// 365Scores): tocar una liga — en el buscador, en el encabezado de un
// grupo de partidos o en Siguiendo — abre ESTA página, ya no manda
// directo a la tabla de posiciones.
//
// Submenús: Resumen · Partidos · Posiciones.
//   · Resumen    — campeón actual y más títulos (dato curado en
//                  lib/sports/ligasDatos.ts; se oculta si no hay),
//                  partido destacado/próximo y un avance de la tabla.
//   · Partidos   — el calendario de la liga: próximos y últimos
//                  resultados (vía /api/partidos?liga=).
//   · Posiciones — la TablaLiga completa de la liga.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SportsFixture, SportsTeam } from '@/lib/sports'
import type { SupportedLeague } from '@/lib/sports/leagues'
import TablaLiga from '@/components/TablaLiga'
import {
  LogoLiga,
  Escudo,
  FilaPartido,
  type EquipoTocable,
} from '@/components/partidosUI'
import { nombreEquipoES, normalizarNombreEquipo } from '@/lib/sports/nombresES'
import { datosDeLiga } from '@/lib/sports/ligasDatos'
import type { Favoritos } from '@/lib/favoritos'

type SubVista = 'resumen' | 'partidos' | 'posiciones'

const REFRESCO_MS = 120_000 // 2 minutos

/** Escudo de un equipo nombrado en los datos curados, buscándolo en el
 *  catálogo de la liga por nombre normalizado (con y sin "Club"). */
function escudoPorNombre(
  equipos: SportsTeam[],
  nombreDato: string
): string | null {
  const objetivo = normalizarNombreEquipo(nombreDato)
  const sinClub = objetivo.replace(/^club /, '')
  for (const t of equipos) {
    const n = normalizarNombreEquipo(t.name)
    const nEs = normalizarNombreEquipo(nombreEquipoES(t.name, t.providerId))
    if (
      n === objetivo ||
      n === sinClub ||
      nEs === objetivo ||
      nEs === sinClub ||
      n.endsWith(` ${sinClub}`) ||
      nEs.endsWith(` ${sinClub}`)
    ) {
      return t.badgeUrl
    }
  }
  return null
}

export default function PaginaLiga({
  liga,
  badgeUrl,
  favoritos,
  onToggleLiga,
  onVerEquipo,
  onVolver,
}: {
  liga: SupportedLeague
  badgeUrl?: string | null
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
  onVerEquipo: EquipoTocable
  onVolver: () => void
}) {
  const [sub, setSub] = useState<SubVista>('resumen')
  const [fixtures, setFixtures] = useState<SportsFixture[] | null>(null)
  const [equipos, setEquipos] = useState<SportsTeam[]>([])
  const [error, setError] = useState<string | null>(null)

  const seguida = favoritos.ligas.includes(liga.providerId)
  const datos = datosDeLiga(liga.providerId)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/partidos?liga=${liga.providerId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar la liga')
      setFixtures(data.fixtures || [])
      setError(null)
    } catch (e) {
      setFixtures((prev) => {
        if (!prev) {
          setError(
            e instanceof Error ? e.message : 'No se pudo cargar la liga.'
          )
        }
        return prev
      })
    }
  }, [liga.providerId])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  // Catálogo de equipos de la liga (para los escudos del campeón y del
  // más ganador en el Resumen). Si falla, el Resumen va sin escudos.
  useEffect(() => {
    fetch(`/api/equipos-liga?liga=${liga.providerId}`)
      .then((r) => r.json())
      .then((d) => setEquipos(d.teams || []))
      .catch(() => {})
  }, [liga.providerId])

  const proximos = useMemo(
    () =>
      (fixtures || [])
        .filter(
          (f) =>
            f.status === 'live' ||
            f.status === 'scheduled' ||
            f.status === 'postponed'
        )
        .sort((a, b) => {
          if (a.status === 'live' && b.status !== 'live') return -1
          if (b.status === 'live' && a.status !== 'live') return 1
          return (a.kickoffUtc || '').localeCompare(b.kickoffUtc || '')
        }),
    [fixtures]
  )
  const jugados = useMemo(
    () =>
      (fixtures || [])
        .filter((f) => f.status === 'finished')
        .sort((a, b) => (b.kickoffUtc || '').localeCompare(a.kickoffUtc || '')),
    [fixtures]
  )
  const destacado = proximos[0] || null

  const claseSub = (s: SubVista) =>
    `flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
      sub === s
        ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
        : 'text-slate-400 hover:text-white'
    }`

  const seccionPartidos = (
    titulo: string,
    filas: SportsFixture[],
    vacio: string,
    limite?: number
  ) => (
    <div className="w-full bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
        {titulo}
      </div>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-center text-slate-400 font-bold text-sm">
          {vacio}
        </p>
      ) : (
        <div>
          {(limite ? filas.slice(0, limite) : filas).map((f) => (
            <FilaPartido key={f.providerId} f={f} onVerEquipo={onVerEquipo} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="w-full max-w-3xl flex flex-col items-center gap-4 animate-in fade-in duration-500">
      {/* ── Encabezado: volver · logo y nombre · seguir ── */}
      <div className="w-full flex items-center gap-3">
        <button
          onClick={onVolver}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-black text-xs uppercase tracking-widest transition-all"
        >
          ← Volver
        </button>
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <LogoLiga url={badgeUrl} nombre={liga.name} className="w-9 h-9" />
          <div className="min-w-0">
            <p className="font-black text-white text-base leading-tight truncate">
              {liga.name}
            </p>
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest truncate">
              Temporada {liga.season}
            </p>
          </div>
        </div>
        <button
          onClick={() => onToggleLiga(liga.providerId)}
          title={seguida ? 'Dejar de seguir esta liga' : 'Seguir esta liga'}
          className={`shrink-0 px-3.5 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
            seguida
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {seguida ? '★ Siguiendo' : '☆ Seguir'}
        </button>
      </div>

      {/* ── Submenús ── */}
      <div className="flex gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full">
        <button onClick={() => setSub('resumen')} className={claseSub('resumen')}>
          Resumen
        </button>
        <button onClick={() => setSub('partidos')} className={claseSub('partidos')}>
          Partidos
        </button>
        <button onClick={() => setSub('posiciones')} className={claseSub('posiciones')}>
          Posiciones
        </button>
      </div>

      {sub === 'posiciones' ? (
        <TablaLiga key={liga.providerId} liga={liga} />
      ) : !fixtures && !error ? (
        <div className="text-cyan-400 font-bold animate-pulse py-20">
          Cargando {liga.name}...
        </div>
      ) : error && !fixtures ? (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-red-400 font-bold mb-4">⚠️ {error}</p>
          <button
            onClick={cargar}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all"
          >
            Reintentar
          </button>
        </div>
      ) : sub === 'partidos' ? (
        <div className="w-full flex flex-col gap-5">
          {seccionPartidos(
            'Próximos partidos',
            proximos,
            'No hay próximos partidos programados esta temporada.'
          )}
          {seccionPartidos(
            'Últimos resultados',
            jugados,
            'Todavía no se juegan partidos esta temporada.',
            15
          )}
        </div>
      ) : (
        /* ── RESUMEN ── */
        <div className="w-full flex flex-col gap-5">
          {(datos.campeonActual || datos.masTitulos) && (
            <div className="w-full bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
                Detalles de la competición
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-800/60">
                {datos.campeonActual && (
                  <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
                    <Escudo
                      url={escudoPorNombre(equipos, datos.campeonActual)}
                      nombre={datos.campeonActual}
                    />
                    <p className="font-bold text-white text-sm">
                      {datos.campeonActual}
                    </p>
                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                      Campeón actual
                    </p>
                  </div>
                )}
                {datos.masTitulos && (
                  <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center">
                    <Escudo
                      url={escudoPorNombre(equipos, datos.masTitulos.equipo)}
                      nombre={datos.masTitulos.equipo}
                    />
                    <p className="font-bold text-white text-sm">
                      {datos.masTitulos.equipo} ({datos.masTitulos.titulos})
                    </p>
                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                      Más títulos
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {destacado ? (
            <div className="w-full bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
                {destacado.status === 'live'
                  ? '🔴 Partido en vivo'
                  : 'Partido destacado'}
              </div>
              <FilaPartido f={destacado} onVerEquipo={onVerEquipo} />
            </div>
          ) : (
            <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center">
              <p className="text-slate-300 font-bold text-sm">
                No hay un próximo partido programado en esta liga por ahora.
              </p>
            </div>
          )}

          <div className="w-full flex flex-col items-center gap-3">
            <TablaLiga
              key={`resumen-${liga.providerId}`}
              liga={liga}
              filasMax={6}
              alVerCompleta={() => setSub('posiciones')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
