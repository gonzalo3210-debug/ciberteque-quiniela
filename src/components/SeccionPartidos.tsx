'use client'
// src/components/SeccionPartidos.tsx
//
// Sección "⚽ Partidos" (decisión de Gonzalo 2026-11-13): UNA sola sección
// tipo 365Scores en vez de un botón por liga. Vistas:
//   ⭐ Favoritos  — partidos de las ligas/equipos que sigue el usuario
//                   (estrellas, guardadas en localStorage), en vivo primero.
//   📋 Resultados — partidos por DÍA (selector ‹ › y botón Hoy, como
//                   365Scores) de TODAS las ligas soportadas, agrupados
//                   por liga; tocar el encabezado de una liga filtra a
//                   solo esa liga.
//   📊 Posiciones — tabla por liga con selector (componente TablaLiga) y
//                   tabla EN VIVO al caer gol.
//   ⭐ Siguiendo  — administrar ligas y equipos seguidos.
//   👕 Vista por equipo — tocar un equipo en cualquier partido abre SU
//                   vista con pestañas Partidos (pasados y siguientes) y
//                   Posiciones (su liga, con su renglón resaltado).
// Interruptor "En vivo" para ver solo los partidos en curso.
// Los datos vienen de NUESTRAS rutas de servidor (/api/partidos,
// /api/equipos-liga); la vista se refresca sola cada 2 minutos y la llave
// del proveedor nunca llega al navegador.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SportsFixture, SportsTeam } from '@/lib/sports'
import {
  SUPPORTED_LEAGUES,
  getSupportedLeague,
  type SupportedLeague,
} from '@/lib/sports/leagues'
import TablaLiga from '@/components/TablaLiga'
import { nombreEquipoES } from '@/lib/sports/nombresES'
import {
  leerFavoritos,
  guardarFavoritos,
  favoritosPorDefecto,
  type Favoritos,
  type EquipoSeguido,
} from '@/lib/favoritos'
import {
  fechaEnMazatlan,
  hoyEnMazatlan,
  sumarDias,
  horaEnMazatlan,
  fechaCortaEnMazatlan,
  etiquetaFechaLarga,
} from '@/lib/fechaMazatlan'

type Vista = 'favoritos' | 'resultados' | 'posiciones' | 'siguiendo'

interface LigaGrupo {
  providerId: string
  name: string
  season: string
  badgeUrl?: string | null
}

/** Logo chico de una liga, junto a su nombre. Sin logo: no ocupa lugar. */
function LogoLiga({
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

interface GrupoPartidos {
  league: LigaGrupo
  fixtures: SportsFixture[]
}

const REFRESCO_MS = 120_000 // 2 minutos

// ---------- Utilidades de presentación --------------------------------------

function fechaDelPartido(f: SportsFixture): string | null {
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
function etiquetaDia(f: SportsFixture): string | null {
  const fecha = fechaDelPartido(f)
  if (!fecha) return null
  const hoy = hoyEnMazatlan()
  if (fecha === hoy) return null
  if (fecha === sumarDias(hoy, -1)) return 'Ayer'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  return f.kickoffUtc ? fechaCortaEnMazatlan(f.kickoffUtc) : fecha
}

function Escudo({ url, nombre }: { url: string | null; nombre: string }) {
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

/** Lo que necesita la vista por equipo al tocar un nombre/escudo. */
type EquipoTocable = (
  equipo: EquipoSeguido
) => void

function FilaPartido({
  f,
  onVerEquipo,
}: {
  f: SportsFixture
  onVerEquipo?: EquipoTocable
}) {
  const dia = etiquetaDia(f)

  // El nombre VISIBLE va en español si hay traducción; el nombre que se
  // pasa a la vista por equipo (y se guarda en favoritos) sigue siendo
  // el original del proveedor, para no tocar el matching interno.
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
          title={`Ver partidos de ${nombreVisible}`}
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

/** Aviso de filtro por liga activo, con botón para ver todas. */
function FiltroLigaChip({
  nombre,
  onQuitar,
}: {
  nombre: string
  onQuitar: () => void
}) {
  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-cyan-600/15 border border-cyan-500/40">
      <span className="text-cyan-300 font-black text-xs uppercase tracking-widest truncate">
        Solo: {nombre}
      </span>
      <button
        onClick={onQuitar}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[11px] uppercase tracking-widest transition-all"
      >
        Ver todas
      </button>
    </div>
  )
}

// ---------- Lista de partidos (Favoritos / Resultados) ----------------------

interface ListaProps {
  dias: number
  /** Día concreto (YYYY-MM-DD) en vez de ventana; null = ventana por `dias`. */
  fecha?: string | null
  soloFavoritos: boolean
  soloEnVivo: boolean
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
  onVerEquipo: EquipoTocable
}

function ListaPartidos({
  dias,
  fecha = null,
  soloFavoritos,
  soloEnVivo,
  favoritos,
  onToggleLiga,
  onVerEquipo,
}: ListaProps) {
  const [grupos, setGrupos] = useState<GrupoPartidos[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ligaFiltro, setLigaFiltro] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      // En vivo manda: ventana corta de hoy sin importar el día elegido.
      const url = soloEnVivo
        ? '/api/partidos?dias=1'
        : fecha
          ? `/api/partidos?fecha=${fecha}`
          : `/api/partidos?dias=${dias}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar los partidos')
      setGrupos(data.groups || [])
      setError(null)
    } catch (e) {
      setGrupos((prev) => {
        if (!prev) {
          setError(
            e instanceof Error ? e.message : 'No se pudieron cargar los partidos.'
          )
        }
        return prev
      })
    }
  }, [dias, fecha, soloEnVivo])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const visibles = useMemo(() => {
    if (!grupos) return []
    const pasaVivo = (f: SportsFixture) => !soloEnVivo || f.status === 'live'

    if (!soloFavoritos) {
      return grupos
        .map((g) => ({ ...g, fixtures: g.fixtures.filter(pasaVivo) }))
        .filter((g) => g.fixtures.length > 0)
        .map((g) => ({
          clave: g.league.providerId,
          nombre: g.league.name,
          ligaId: g.league.providerId as string | null,
          fixtures: g.fixtures,
        }))
    }

    // Favoritos: primero "Mis equipos", luego las ligas seguidas.
    const seguidas = new Set(favoritos.ligas)
    const equiposSeguidos = new Set(favoritos.equipos.map((e) => e.teamProviderId))
    const resultado: {
      clave: string
      nombre: string
      ligaId: string | null
      fixtures: SportsFixture[]
    }[] = []

    if (equiposSeguidos.size > 0) {
      const deMisEquipos: SportsFixture[] = []
      const idsVistos = new Set<string>()
      for (const g of grupos) {
        for (const f of g.fixtures) {
          const esDeMiEquipo =
            (f.homeTeamProviderId && equiposSeguidos.has(f.homeTeamProviderId)) ||
            (f.awayTeamProviderId && equiposSeguidos.has(f.awayTeamProviderId))
          if (esDeMiEquipo && pasaVivo(f) && !idsVistos.has(f.providerId)) {
            idsVistos.add(f.providerId)
            deMisEquipos.push(f)
          }
        }
      }
      if (deMisEquipos.length > 0) {
        resultado.push({
          clave: 'mis-equipos',
          nombre: '⭐ Mis equipos',
          ligaId: null,
          fixtures: deMisEquipos,
        })
        // Los de mis equipos no se repiten en el grupo de su liga.
        return [
          ...resultado,
          ...grupos
            .filter((g) => seguidas.has(g.league.providerId))
            .map((g) => ({
              ...g,
              fixtures: g.fixtures.filter(
                (f) => pasaVivo(f) && !idsVistos.has(f.providerId)
              ),
            }))
            .filter((g) => g.fixtures.length > 0)
            .map((g) => ({
              clave: g.league.providerId,
              nombre: g.league.name,
              ligaId: g.league.providerId as string | null,
              fixtures: g.fixtures,
            })),
        ]
      }
    }

    return grupos
      .filter((g) => seguidas.has(g.league.providerId))
      .map((g) => ({ ...g, fixtures: g.fixtures.filter(pasaVivo) }))
      .filter((g) => g.fixtures.length > 0)
      .map((g) => ({
        clave: g.league.providerId,
        nombre: g.league.name,
        ligaId: g.league.providerId as string | null,
        fixtures: g.fixtures,
      }))
  }, [grupos, soloFavoritos, soloEnVivo, favoritos])

  // Filtro por liga (tocar el encabezado de una liga): se queda solo esa.
  const visiblesFiltrados = ligaFiltro
    ? visibles.filter((g) => g.ligaId === ligaFiltro)
    : visibles
  const badgePorLiga = new Map(
    (grupos || []).map((g) => [g.league.providerId, g.league.badgeUrl ?? null])
  )
  const nombreLigaFiltro = ligaFiltro
    ? getSupportedLeague(ligaFiltro)?.name || 'la liga'
    : null

  if (!grupos && !error) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Cargando partidos...
      </div>
    )
  }

  if (error && !grupos) {
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

  if (visiblesFiltrados.length === 0) {
    return (
      <div className="w-full max-w-3xl flex flex-col items-center gap-4 animate-in fade-in duration-500">
        {ligaFiltro && (
          <FiltroLigaChip
            nombre={nombreLigaFiltro as string}
            onQuitar={() => setLigaFiltro(null)}
          />
        )}
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">{soloEnVivo ? '🔴' : '⚽'}</p>
          <p className="text-slate-300 font-bold">
            {soloEnVivo
              ? 'No hay partidos en vivo ahorita.'
              : ligaFiltro
                ? `No hay partidos de ${nombreLigaFiltro} en este periodo.`
                : soloFavoritos
                  ? 'No hay partidos próximos de tus ligas y equipos seguidos. Revisa la vista Siguiendo para agregar más.'
                  : fecha
                    ? 'Este día no hay partidos en las ligas de la sección.'
                    : 'No hay partidos ayer, hoy ni mañana en las ligas de la sección.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-5 animate-in fade-in duration-500">
      {ligaFiltro && (
        <FiltroLigaChip
          nombre={nombreLigaFiltro as string}
          onQuitar={() => setLigaFiltro(null)}
        />
      )}
      {visiblesFiltrados.map((g) => (
        <div
          key={g.clave}
          className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-slate-800">
            <span className="flex items-center gap-2 min-w-0">
              <LogoLiga
                url={g.ligaId ? badgePorLiga.get(g.ligaId) : null}
                nombre={g.nombre}
              />
              {g.ligaId ? (
                <button
                  onClick={() =>
                    setLigaFiltro((prev) =>
                      prev === g.ligaId ? null : (g.ligaId as string)
                    )
                  }
                  title={
                    ligaFiltro === g.ligaId
                      ? 'Quitar el filtro de liga'
                      : `Ver solo ${g.nombre}`
                  }
                  className={`font-black text-xs uppercase tracking-widest transition-colors ${
                    ligaFiltro === g.ligaId
                      ? 'text-cyan-300'
                      : 'text-white hover:text-cyan-300'
                  }`}
                >
                  {g.nombre}
                  {ligaFiltro === g.ligaId && (
                    <span className="normal-case tracking-normal"> · ✕</span>
                  )}
                </button>
              ) : (
                <span className="font-black text-xs uppercase tracking-widest text-white">
                  {g.nombre}
                </span>
              )}
            </span>
            {g.ligaId && (
              <button
                onClick={() => onToggleLiga(g.ligaId as string)}
                title={
                  favoritos.ligas.includes(g.ligaId)
                    ? 'Dejar de seguir esta liga'
                    : 'Seguir esta liga'
                }
                className={`text-lg leading-none transition-all ${
                  favoritos.ligas.includes(g.ligaId)
                    ? 'text-amber-400'
                    : 'text-slate-600 hover:text-amber-400'
                }`}
              >
                {favoritos.ligas.includes(g.ligaId) ? '★' : '☆'}
              </button>
            )}
          </div>
          <div>
            {g.fixtures.map((f) => (
              <FilaPartido key={f.providerId} f={f} onVerEquipo={onVerEquipo} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Administrar lo que se sigue --------------------------------------

function GestorSiguiendo({
  favoritos,
  onToggleLiga,
  onToggleEquipo,
  logosLiga,
}: {
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
  onToggleEquipo: (equipo: EquipoSeguido) => void
  logosLiga: Record<string, string | null>
}) {
  const [ligaEquipos, setLigaEquipos] = useState<string>(
    SUPPORTED_LEAGUES[0].providerId
  )
  const [equiposPorLiga, setEquiposPorLiga] = useState<
    Record<string, SportsTeam[]>
  >({})
  const [cargandoEquipos, setCargandoEquipos] = useState(false)
  const [errorEquipos, setErrorEquipos] = useState<string | null>(null)

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

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6 animate-in fade-in duration-500">
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
                <div className="flex items-center gap-3 min-w-0">
                  <LogoLiga
                    url={logosLiga[liga.providerId]}
                    nombre={liga.name}
                    className="w-7 h-7"
                  />
                  <div>
                    <p className="font-bold text-white text-sm">{liga.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                      Temporada {liga.season}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onToggleLiga(liga.providerId)}
                  className={`px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
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
                  onClick={() => onToggleEquipo(e)}
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
                    onToggleEquipo({
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
  )
}

// ---------- Vista por equipo (pestañas Partidos / Posiciones) -----------------

function VistaEquipo({
  equipo,
  favoritos,
  onToggleEquipo,
  onVolver,
  onVerEquipo,
}: {
  equipo: EquipoSeguido
  favoritos: Favoritos
  onToggleEquipo: (equipo: EquipoSeguido) => void
  onVolver: () => void
  onVerEquipo: EquipoTocable
}) {
  const [pestana, setPestana] = useState<'partidos' | 'posiciones'>('partidos')
  const [partidos, setPartidos] = useState<SportsFixture[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logoLiga, setLogoLiga] = useState<string | null>(null)

  const liga = getSupportedLeague(equipo.leagueProviderId)
  const seguido = favoritos.equipos.some(
    (e) => e.teamProviderId === equipo.teamProviderId
  )

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/partidos?liga=${equipo.leagueProviderId}&equipo=${equipo.teamProviderId}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar el equipo')
      setPartidos(data.fixtures || [])
      setLogoLiga(data.league?.badgeUrl ?? null)
      setError(null)
    } catch (e) {
      setPartidos((prev) => {
        if (!prev) {
          setError(
            e instanceof Error ? e.message : 'No se pudieron cargar sus partidos.'
          )
        }
        return prev
      })
    }
  }, [equipo.leagueProviderId, equipo.teamProviderId])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const jugados = useMemo(
    () =>
      (partidos || [])
        .filter((f) => f.status === 'finished')
        .sort((a, b) => (b.kickoffUtc || '').localeCompare(a.kickoffUtc || ''))
        .slice(0, 10),
    [partidos]
  )
  const siguientes = useMemo(
    () =>
      (partidos || [])
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
        })
        .slice(0, 10),
    [partidos]
  )

  const seccionPartidos = (titulo: string, filas: SportsFixture[], vacio: string) => (
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
          {filas.map((f) => (
            <FilaPartido key={f.providerId} f={f} onVerEquipo={onVerEquipo} />
          ))}
        </div>
      )}
    </div>
  )

  const clasePestana = (p: 'partidos' | 'posiciones') =>
    `flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
      pestana === p
        ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
        : 'text-slate-400 hover:text-white'
    }`

  return (
    <div className="w-full max-w-3xl flex flex-col items-center gap-4 animate-in fade-in duration-500">
      <div className="w-full flex items-center gap-3">
        <button
          onClick={onVolver}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-black text-xs uppercase tracking-widest transition-all"
        >
          ← Volver
        </button>
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <Escudo url={equipo.badgeUrl} nombre={nombreEquipoES(equipo.teamName, equipo.teamProviderId)} />
          <div className="min-w-0">
            <p className="font-black text-white text-base leading-tight truncate">
              {nombreEquipoES(equipo.teamName, equipo.teamProviderId)}
            </p>
            <p className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold uppercase tracking-widest truncate">
              <LogoLiga url={logoLiga} nombre={liga?.name || ''} className="w-4 h-4" />
              {liga?.name || 'Liga'} · Temporada {liga?.season || ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => onToggleEquipo(equipo)}
          title={seguido ? 'Dejar de seguir' : 'Seguir equipo'}
          className={`shrink-0 px-3.5 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
            seguido
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {seguido ? '★ Siguiendo' : '☆ Seguir'}
        </button>
      </div>

      <div className="flex gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full">
        <button onClick={() => setPestana('partidos')} className={clasePestana('partidos')}>
          ⚽ Partidos
        </button>
        <button onClick={() => setPestana('posiciones')} className={clasePestana('posiciones')}>
          📊 Posiciones
        </button>
      </div>

      {pestana === 'posiciones' ? (
        liga ? (
          <TablaLiga
            key={liga.providerId}
            liga={liga}
            equipoResaltado={{
              teamProviderId: equipo.teamProviderId,
              teamName: equipo.teamName,
            }}
          />
        ) : (
          <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-slate-300 font-bold">
              La liga de este equipo no está en la sección.
            </p>
          </div>
        )
      ) : !partidos && !error ? (
        <div className="text-cyan-400 font-bold animate-pulse py-20">
          Cargando partidos de {nombreEquipoES(equipo.teamName, equipo.teamProviderId)}...
        </div>
      ) : error && !partidos ? (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-red-400 font-bold mb-4">⚠️ {error}</p>
          <button
            onClick={cargar}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-5">
          {seccionPartidos(
            'Próximos partidos',
            siguientes,
            'No tiene próximos partidos programados esta temporada.'
          )}
          {seccionPartidos(
            'Últimos resultados',
            jugados,
            'Todavía no juega partidos esta temporada.'
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Sección completa --------------------------------------------------

export default function SeccionPartidos() {
  const [vista, setVista] = useState<Vista>('favoritos')
  const [soloEnVivo, setSoloEnVivo] = useState(false)
  const [favoritos, setFavoritos] = useState<Favoritos>(favoritosPorDefecto())
  const [favListos, setFavListos] = useState(false)
  const [ligaPosiciones, setLigaPosiciones] = useState<SupportedLeague>(
    SUPPORTED_LEAGUES[0]
  )
  const [equipoVista, setEquipoVista] = useState<EquipoSeguido | null>(null)
  const [fechaResultados, setFechaResultados] = useState<string>(() =>
    hoyEnMazatlan()
  )
  const [logosLiga, setLogosLiga] = useState<Record<string, string | null>>({})

  // Logos de liga para las listas del catálogo (Siguiendo, selector de
  // Posiciones): una sola pedida; si falla, las listas van sin logo.
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

  const verEquipo = useCallback((equipo: EquipoSeguido) => {
    setEquipoVista(equipo)
  }, [])

  useEffect(() => {
    setFavoritos(leerFavoritos())
    setFavListos(true)
  }, [])

  const toggleLiga = useCallback(
    (leagueProviderId: string) => {
      setFavoritos((prev) => {
        const ligas = prev.ligas.includes(leagueProviderId)
          ? prev.ligas.filter((id) => id !== leagueProviderId)
          : [...prev.ligas, leagueProviderId]
        const next = { ...prev, ligas }
        guardarFavoritos(next)
        return next
      })
    },
    []
  )

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

  const claseSubVista = (v: Vista) =>
    `flex-1 min-w-[110px] py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
      vista === v
        ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
        : 'text-slate-400 hover:text-white'
    }`

  const enVistaPartidos = vista === 'favoritos' || vista === 'resultados'

  return (
    <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in duration-500">
      <div className="text-center mb-5">
        <h2 className="text-3xl font-black tracking-tight text-white">
          ⚽ PARTIDOS
        </h2>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
          Ligas del mundo · En vivo y posiciones
        </p>
      </div>

      {equipoVista ? (
        <VistaEquipo
          key={`${equipoVista.leagueProviderId}-${equipoVista.teamProviderId}`}
          equipo={equipoVista}
          favoritos={favoritos}
          onToggleEquipo={toggleEquipo}
          onVolver={() => setEquipoVista(null)}
          onVerEquipo={verEquipo}
        />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-1.5 w-full mb-4">
        <div className="flex flex-wrap gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 flex-1">
          <button onClick={() => setVista('favoritos')} className={claseSubVista('favoritos')}>
            ⭐ Favoritos
          </button>
          <button onClick={() => setVista('resultados')} className={claseSubVista('resultados')}>
            📋 Resultados
          </button>
          <button onClick={() => setVista('posiciones')} className={claseSubVista('posiciones')}>
            📊 Posiciones
          </button>
          <button onClick={() => setVista('siguiendo')} className={claseSubVista('siguiendo')}>
            ⭐ Siguiendo
          </button>
        </div>

        {enVistaPartidos && (
          <button
            onClick={() => setSoloEnVivo((v) => !v)}
            className={`px-4 py-3 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${
              soloEnVivo
                ? 'bg-red-600 border-red-500 text-white shadow-[0_0_18px_rgba(220,38,38,0.45)]'
                : 'bg-slate-900/80 border-slate-800/50 text-slate-400 hover:text-white'
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                soloEnVivo ? 'bg-white animate-pulse' : 'bg-red-500'
              }`}
            />
            En vivo
          </button>
        )}
      </div>

      {vista === 'resultados' && (
        <div className="w-full flex flex-col items-center gap-4 animate-in fade-in duration-500">
          {!soloEnVivo && (
            <div className="w-full max-w-3xl flex items-center gap-2">
              <button
                onClick={() =>
                  setFechaResultados((f) => sumarDias(f, -1))
                }
                aria-label="Día anterior"
                className="w-11 h-11 shrink-0 rounded-xl bg-slate-900 border border-slate-800 text-white text-xl font-black hover:bg-slate-800 transition-all"
              >
                ‹
              </button>
              <div className="flex-1 text-center px-2 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800/50">
                <span className="font-black text-white text-sm capitalize">
                  {etiquetaFechaLarga(fechaResultados)}
                </span>
              </div>
              {fechaResultados !== hoyEnMazatlan() && (
                <button
                  onClick={() => setFechaResultados(hoyEnMazatlan())}
                  className="shrink-0 px-3.5 h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all"
                >
                  Hoy
                </button>
              )}
              <button
                onClick={() =>
                  setFechaResultados((f) => sumarDias(f, 1))
                }
                aria-label="Día siguiente"
                className="w-11 h-11 shrink-0 rounded-xl bg-slate-900 border border-slate-800 text-white text-xl font-black hover:bg-slate-800 transition-all"
              >
                ›
              </button>
            </div>
          )}
          <ListaPartidos
            key={fechaResultados}
            dias={1}
            fecha={fechaResultados}
            soloFavoritos={false}
            soloEnVivo={soloEnVivo}
            favoritos={favoritos}
            onToggleLiga={toggleLiga}
            onVerEquipo={verEquipo}
          />
        </div>
      )}

      {vista === 'favoritos' &&
        (favListos ? (
          <ListaPartidos
            dias={7}
            soloFavoritos
            soloEnVivo={soloEnVivo}
            favoritos={favoritos}
            onToggleLiga={toggleLiga}
            onVerEquipo={verEquipo}
          />
        ) : (
          <div className="text-cyan-400 font-bold animate-pulse py-20">
            Cargando tus favoritos...
          </div>
        ))}

      {vista === 'posiciones' && (
        <div className="w-full flex flex-col items-center animate-in fade-in duration-500">
          <div className="flex flex-wrap justify-center gap-1.5 mb-6">
            {SUPPORTED_LEAGUES.map((liga) => (
              <button
                key={liga.providerId}
                onClick={() => setLigaPosiciones(liga)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
                  ligaPosiciones.providerId === liga.providerId
                    ? 'bg-cyan-600 text-white shadow-[0_0_16px_rgba(8,145,178,0.4)]'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
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
          <TablaLiga key={ligaPosiciones.providerId} liga={ligaPosiciones} />
        </div>
      )}

      {vista === 'siguiendo' && favListos && (
        <GestorSiguiendo
          favoritos={favoritos}
          onToggleLiga={toggleLiga}
          onToggleEquipo={toggleEquipo}
          logosLiga={logosLiga}
        />
      )}
      </>
      )}
    </div>
  )
}
