'use client'
// src/components/partidosUI.tsx
//
// Piezas de presentación COMPARTIDAS de la familia Partidos (sección
// Partidos, página de liga, página de equipo y sección Siguiendo):
// logo de liga, escudo de equipo y la fila de un partido. Vivían dentro
// de SeccionPartidos.tsx; se extrajeron el 2026-11-14 para que la
// página de liga (PaginaLiga) pinte igual sin importar en círculo.
//
// Regla que se mantiene: el nombre VISIBLE va en español si hay
// traducción (nombreEquipoES); el nombre que se pasa a la vista por
// equipo y se guarda en favoritos sigue siendo el original del
// proveedor, para no tocar el matching interno.
import React from 'react'
import type { SportsFixture } from '@/lib/sports'
import { nombreEquipoES } from '@/lib/sports/nombresES'
import type { EquipoSeguido } from '@/lib/favoritos'
import {
  fechaEnMazatlan,
  hoyEnMazatlan,
  sumarDias,
  horaEnMazatlan,
  fechaCortaEnMazatlan,
} from '@/lib/fechaMazatlan'

/** Lo que necesita la vista por equipo al tocar un nombre/escudo. */
export type EquipoTocable = (equipo: EquipoSeguido) => void

/** Logo chico de una liga, junto a su nombre. Sin logo: no ocupa lugar. */
export function LogoLiga({
  url,
  nombre,
  className = 'w-5 h-5',
}: {
  url: string | null | undefined
  nombre: string
  className?: string
}) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={nombre}
      className={`${className} object-contain shrink-0`}
      loading="lazy"
    />
  )
}

export function Escudo({
  url,
  nombre,
}: {
  url: string | null
  nombre: string
}) {
  return url ? (
    <img
      src={url}
      alt={nombre}
      className="w-6 h-6 object-contain shrink-0"
      loading="lazy"
    />
  ) : (
    <span className="w-6 h-6 shrink-0 rounded bg-slate-800 inline-block" />
  )
}

export function fechaDelPartido(f: SportsFixture): string | null {
  if (f.kickoffUtc) {
    try {
      return fechaEnMazatlan(f.kickoffUtc)
    } catch {
      return f.date
    }
  }
  return f.date
}

/** "Ayer" / "Mañana" / "vie 14 nov" / null si es hoy. */
export function etiquetaDia(f: SportsFixture): string | null {
  const fecha = fechaDelPartido(f)
  if (!fecha) return null
  const hoy = hoyEnMazatlan()
  if (fecha === hoy) return null
  if (fecha === sumarDias(hoy, -1)) return 'Ayer'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  return f.kickoffUtc ? fechaCortaEnMazatlan(f.kickoffUtc) : fecha
}

export function FilaPartido({
  f,
  onVerEquipo,
}: {
  f: SportsFixture
  onVerEquipo?: EquipoTocable
}) {
  const dia = etiquetaDia(f)

  const ladoEquipo = (
    nombre: string,
    escudo: string | null,
    teamProviderId: string | null,
    esLocal: boolean
  ) => {
    const nombreVisible = nombreEquipoES(nombre, teamProviderId)
    const contenido = (
      <>
        {esLocal && (
          <span className="font-bold text-white text-sm truncate">{nombreVisible}</span>
        )}
        <Escudo url={escudo} nombre={nombreVisible} />
        {!esLocal && (
          <span className="font-bold text-white text-sm truncate">{nombreVisible}</span>
        )}
      </>
    )
    if (onVerEquipo && teamProviderId) {
      return (
        <button
          onClick={() =>
            onVerEquipo({
              leagueProviderId: f.leagueProviderId,
              teamProviderId,
              teamName: nombre,
              badgeUrl: escudo,
            })
          }
          title={`Ver ${nombreVisible}`}
          className="flex items-center gap-2 min-w-0 hover:opacity-75 transition-opacity"
        >
          {contenido}
        </button>
      )
    }
    return <div className="flex items-center gap-2 min-w-0">{contenido}</div>
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60 last:border-b-0">
      <div className="flex-1 flex items-center justify-end min-w-0">
        {ladoEquipo(f.homeTeam, f.homeBadgeUrl, f.homeTeamProviderId, true)}
      </div>

      <div className="w-[104px] shrink-0 text-center">
        {f.status === 'live' ? (
          <div>
            <div className="font-black text-white text-base leading-none">
              {f.homeScore ?? 0} - {f.awayScore ?? 0}
            </div>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/50 text-red-400 text-[10px] font-black">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {f.statusRaw === 'HT'
                ? 'MT'
                : f.progress
                  ? `${f.progress}'`
                  : 'EN VIVO'}
            </span>
          </div>
        ) : f.status === 'finished' ? (
          <div>
            <div className="font-black text-slate-200 text-base leading-none">
              {f.homeScore ?? 0} - {f.awayScore ?? 0}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
              Final{dia ? ` · ${dia}` : ''}
            </div>
          </div>
        ) : f.status === 'postponed' ? (
          <div className="text-[11px] font-black uppercase tracking-widest text-amber-400">
            Pospuesto
          </div>
        ) : (
          <div>
            <div className="font-black text-cyan-300 text-base leading-none">
              {f.kickoffUtc ? horaEnMazatlan(f.kickoffUtc) : '—'}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
              {dia || 'Hoy'}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center min-w-0">
        {ladoEquipo(f.awayTeam, f.awayBadgeUrl, f.awayTeamProviderId, false)}
      </div>
    </div>
  )
}
