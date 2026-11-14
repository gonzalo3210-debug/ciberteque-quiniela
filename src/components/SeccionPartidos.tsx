'use client'
// src/components/SeccionPartidos.tsx
//
// Sección "⚽ Partidos" (decisión de Gonzalo 2026-11-13; reorganizada
// 2026-11-14 a su diseño tipo 365Scores): UNA sola sección en vez de un
// botón por liga. Arriba, tres FILTROS (debajo de la barra de la app):
//   🔴 Live       — partidos en vivo AHORA, por prioridad: primero los
//                   de la quiniela del Club, luego los de favoritos y al
//                   final el resto de ligas soportadas (vista EnVivo).
//   📅 Calendario — partidos por DÍA (selector ‹ › y botón Hoy) de
//                   TODAS las ligas soportadas, agrupados por liga;
//                   tocar el encabezado de una liga filtra a solo esa.
//   🔎 Buscar     — por nombre de equipo o de liga (con nombres en
//                   español); un equipo abre su vista, una liga sus
//                   posiciones.
// Y las PESTAÑAS de la sección:
//   🎯 Quiniela   — los partidos de la jornada activa o abierta del
//                   Club (Supabase) emparejados con los de la API para
//                   marcador/minuto en vivo; sin pareja, van con los
//                   datos de la app.
//   ⭐ Favoritos  — partidos de las ligas/equipos que sigue el usuario
//                   (estrellas, guardadas en localStorage).
// Correcciones de Gonzalo (2026-11-14, tras probar la Fase 2):
//   · 📊 Posiciones SALIÓ de este menú: la tabla vive dentro de la
//     página de cada liga y de la página de cada equipo.
//   · ⭐ Siguiendo SALIÓ de aquí: es la tercera sección de la barra
//     inferior (components/SeccionSiguiendo.tsx).
//   · Tocar una liga abre su PÁGINA (components/PaginaLiga.tsx) con
//     submenús Resumen · Partidos · Posiciones.
//   👕 Vista por equipo — tocar un equipo en cualquier partido abre SU
//                   página con submenús Resumen · Partidos ·
//                   Posiciones (su liga, con su renglón resaltado).
// Los datos vienen de NUESTRAS rutas de servidor (/api/partidos,
// /api/equipos-liga, /api/en-vivo, /api/buscar); la vista se refresca
// sola cada 2 minutos y la llave del proveedor nunca llega al navegador.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SportsFixture } from '@/lib/sports'
import {
  getSupportedLeague,
  type SupportedLeague,
} from '@/lib/sports/leagues'
import TablaLiga from '@/components/TablaLiga'
import PaginaLiga from '@/components/PaginaLiga'
import {
  LogoLiga,
  Escudo,
  FilaPartido,
  type EquipoTocable,
} from '@/components/partidosUI'
import { nombreEquipoES } from '@/lib/sports/nombresES'
import { useJornadaActual } from '@/hooks/useJornadaActual'
import {
  coincideParEquipos,
  emparejarPartidosJornada,
  ventanaDeJornada,
} from '@/lib/emparejar'
import {
  leerFavoritos,
  guardarFavoritos,
  favoritosPorDefecto,
  type Favoritos,
  type EquipoSeguido,
} from '@/lib/favoritos'
import {
  hoyEnMazatlan,
  sumarDias,
  horaEnMazatlan,
  fechaCortaEnMazatlan,
  etiquetaFechaLarga,
} from '@/lib/fechaMazatlan'

type Vista =
  | 'quiniela'
  | 'favoritos'
  | 'resultados'
  | 'envivo'

interface LigaGrupo {
  providerId: string
  name: string
  season: string
  badgeUrl?: string | null
}

interface GrupoPartidos {
  league: LigaGrupo
  fixtures: SportsFixture[]
}

const REFRESCO_MS = 120_000 // 2 minutos

// Las piezas de presentación (LogoLiga, Escudo, FilaPartido y sus
// utilidades de fecha) viven en components/partidosUI.tsx, compartidas
// con la página de liga, la de equipo y la sección Siguiendo.

// ---------- Lista de partidos (Favoritos / Resultados) ----------------------

interface ListaProps {
  dias: number
  /** Día concreto (YYYY-MM-DD) en vez de ventana; null = ventana por `dias`. */
  fecha?: string | null
  soloFavoritos: boolean
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
  onVerEquipo: EquipoTocable
  /** Tocar el encabezado de una liga abre la PÁGINA de la liga. */
  onVerLiga: (leagueProviderId: string) => void
}

function ListaPartidos({
  dias,
  fecha = null,
  soloFavoritos,
  favoritos,
  onToggleLiga,
  onVerEquipo,
  onVerLiga,
}: ListaProps) {
  const [grupos, setGrupos] = useState<GrupoPartidos[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const url = fecha
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
  }, [dias, fecha])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const visibles = useMemo(() => {
    if (!grupos) return []

    if (!soloFavoritos) {
      return grupos
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
          if (esDeMiEquipo && !idsVistos.has(f.providerId)) {
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
              fixtures: g.fixtures.filter((f) => !idsVistos.has(f.providerId)),
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
      .filter((g) => g.fixtures.length > 0)
      .map((g) => ({
        clave: g.league.providerId,
        nombre: g.league.name,
        ligaId: g.league.providerId as string | null,
        fixtures: g.fixtures,
      }))
  }, [grupos, soloFavoritos, favoritos])

  const visiblesFiltrados = visibles
  const badgePorLiga = new Map(
    (grupos || []).map((g) => [g.league.providerId, g.league.badgeUrl ?? null])
  )

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
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">⚽</p>
          <p className="text-slate-300 font-bold">
            {soloFavoritos
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
                  onClick={() => onVerLiga(g.ligaId as string)}
                  title={`Ver la página de ${g.nombre}`}
                  className="font-black text-xs uppercase tracking-widest text-white hover:text-cyan-300 transition-colors"
                >
                  {g.nombre} <span className="text-cyan-400">›</span>
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

// ---------- Pestaña 🎯 Quiniela ----------------------------------------------

/**
 * Fila de un partido de la jornada que NO se emparejó con la API: se
 * pinta con los datos de la app (nombres y logos del catálogo del Club,
 * hora guardada y, si el Árbitro ya lo cerró, el marcador capturado).
 */
function FilaPartidoApp({
  partido,
  mapaLogos,
}: {
  partido: any
  mapaLogos: Record<string, string>
}) {
  const logoDe = (nombre: string) =>
    mapaLogos[(nombre || '').toLowerCase().trim()] || null
  const esFinal =
    partido.es_final === true ||
    (partido.goles_local !== null &&
      partido.goles_local !== undefined &&
      partido.goles_visitante !== null &&
      partido.goles_visitante !== undefined)
  const iso = partido.fecha_hora_partido as string | null

  const lado = (nombre: string, esLocal: boolean) => (
    <div
      className={`flex items-center gap-2 min-w-0 ${
        esLocal ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <Escudo url={logoDe(nombre)} nombre={nombre} />
      <span className="font-bold text-white text-sm truncate">{nombre}</span>
    </div>
  )

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60 last:border-b-0">
      <div className="flex-1 flex justify-end min-w-0">
        {lado(partido.equipo_local, true)}
      </div>
      <div className="w-[104px] shrink-0 text-center">
        {esFinal ? (
          <div>
            <div className="font-black text-slate-200 text-base leading-none">
              {partido.goles_local ?? 0} - {partido.goles_visitante ?? 0}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
              Final
            </div>
          </div>
        ) : (
          <div>
            <div className="font-black text-cyan-300 text-base leading-none">
              {iso ? horaEnMazatlan(iso) : '—'}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
              {iso ? fechaCortaEnMazatlan(iso) : 'Por jugar'}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">{lado(partido.equipo_visitante, false)}</div>
    </div>
  )
}

function VistaQuiniela({ onVerEquipo }: { onVerEquipo: EquipoTocable }) {
  const {
    candidatas,
    seleccionada,
    setSeleccionId,
    mapaLogos,
    cargando,
    error,
    recargar,
  } = useJornadaActual()
  const [fixtures, setFixtures] = useState<SportsFixture[] | null>(null)

  const quiniela = seleccionada?.quiniela
  const partidos = useMemo(
    () => seleccionada?.partidos || [],
    [seleccionada]
  )
  const ventana = useMemo(() => ventanaDeJornada(partidos), [partidos])

  const cargarFixtures = useCallback(async () => {
    if (!ventana) return
    try {
      const res = await fetch(
        `/api/partidos?desde=${ventana.desde}&hasta=${ventana.hasta}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error')
      const todos: SportsFixture[] = []
      for (const g of data.groups || []) todos.push(...(g.fixtures || []))
      setFixtures(todos)
    } catch {
      // Sin fixtures de la API, la jornada se pinta con datos de la app.
      setFixtures((prev) => prev ?? [])
    }
  }, [ventana])

  useEffect(() => {
    cargarFixtures()
    const id = setInterval(cargarFixtures, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargarFixtures])

  const parejas = useMemo(
    () => emparejarPartidosJornada(partidos, fixtures || []),
    [partidos, fixtures]
  )

  if (cargando && !seleccionada) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Cargando la jornada del Club...
      </div>
    )
  }

  if (error && !seleccionada) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-bold mb-4">⚠️ {error}</p>
        <button
          onClick={recargar}
          className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!seleccionada || !quiniela) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center animate-in fade-in duration-500">
        <p className="text-4xl mb-3">🎯</p>
        <p className="text-slate-300 font-bold">
          No hay jornada activa ni abierta por jugarse ahorita. Cuando se
          abra la siguiente quiniela, aquí verás sus partidos.
        </p>
      </div>
    )
  }

  const cierrePasado = new Date(quiniela.fecha_cierre).getTime() < Date.now()
  const etiquetaEstado =
    quiniela.estado === 'cerrada'
      ? { texto: '🏁 Cerrada', clases: 'bg-slate-700 text-slate-200' }
      : cierrePasado
        ? { texto: '🔴 En curso', clases: 'bg-red-600/20 border border-red-500/50 text-red-400' }
        : { texto: '🟢 Abierta', clases: 'bg-green-600/20 border border-green-500/50 text-green-400' }
  const finales = partidos.filter(
    (p) => p.es_final || (p.goles_local !== null && p.goles_local !== undefined)
  ).length

  return (
    <div className="w-full max-w-3xl flex flex-col gap-5 animate-in fade-in duration-500">
      {candidatas.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {candidatas.map((c) => (
            <button
              key={c.quiniela.id}
              onClick={() => setSeleccionId(c.quiniela.id)}
              className={`px-3.5 py-2 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
                c.quiniela.id === quiniela.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {c.quiniela.nombre_jornada}
            </button>
          ))}
        </div>
      )}

      <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-black text-white text-sm uppercase tracking-widest">
            🎯 {quiniela.nombre_jornada}
          </span>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${etiquetaEstado.clases}`}
          >
            {etiquetaEstado.texto}
          </span>
          <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">
            {finales} de {partidos.length} partidos jugados
          </span>
        </div>
        <div>
          {partidos.map((p) => {
            const fixture = parejas.get(p.id)
            return fixture ? (
              <FilaPartido key={p.id} f={fixture} onVerEquipo={onVerEquipo} />
            ) : (
              <FilaPartidoApp key={p.id} partido={p} mapaLogos={mapaLogos} />
            )
          })}
        </div>
      </div>

      <p className="text-center text-slate-500 text-xs font-medium">
        Los marcadores en vivo vienen de las ligas del mundo; si un
        partido no se enlaza, se muestra con los datos del Club.
      </p>
    </div>
  )
}

// ---------- Filtro 🔴 Live -----------------------------------------------------

const REFRESCO_VIVO_MS = 60_000 // 1 minuto

function VistaEnVivo({
  favoritos,
  onVerEquipo,
}: {
  favoritos: Favoritos
  onVerEquipo: EquipoTocable
}) {
  const { seleccionada } = useJornadaActual()
  const [fixtures, setFixtures] = useState<SportsFixture[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const paresParam = useMemo(() => {
    const partidos = seleccionada?.partidos || []
    if (partidos.length === 0) return ''
    return partidos
      .map((p) => `${p.equipo_local}|${p.equipo_visitante}`)
      .join(';')
  }, [seleccionada])

  const cargar = useCallback(async () => {
    try {
      const qs = paresParam
        ? `?pares=${encodeURIComponent(paresParam)}`
        : ''
      const res = await fetch(`/api/en-vivo${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al cargar el en vivo')
      setFixtures(data.fixtures || [])
      setError(null)
    } catch (e) {
      setFixtures((prev) => {
        if (!prev) {
          setError(
            e instanceof Error ? e.message : 'No se pudo cargar el en vivo.'
          )
        }
        return prev
      })
    }
  }, [paresParam])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_VIVO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const bloques = useMemo(() => {
    if (!fixtures) return null
    const partidosQuiniela = seleccionada?.partidos || []
    const ligasSeguidas = new Set(favoritos.ligas)
    const equiposSeguidos = new Set(
      favoritos.equipos.map((e) => e.teamProviderId)
    )

    const deQuiniela: SportsFixture[] = []
    const deFavoritos: SportsFixture[] = []
    const resto: SportsFixture[] = []
    for (const f of fixtures) {
      const esDeQuiniela = partidosQuiniela.some((p) =>
        coincideParEquipos(p, f)
      )
      if (esDeQuiniela) {
        deQuiniela.push(f)
        continue
      }
      const esFavorito =
        ligasSeguidas.has(f.leagueProviderId) ||
        (f.homeTeamProviderId && equiposSeguidos.has(f.homeTeamProviderId)) ||
        (f.awayTeamProviderId && equiposSeguidos.has(f.awayTeamProviderId))
      if (esFavorito) deFavoritos.push(f)
      else resto.push(f)
    }

    return [
      {
        clave: 'quiniela',
        titulo: `🎯 De tu quiniela${seleccionada ? ` · ${seleccionada.quiniela.nombre_jornada}` : ''}`,
        fixtures: deQuiniela,
      },
      { clave: 'favoritos', titulo: '⭐ Tus favoritos', fixtures: deFavoritos },
      { clave: 'resto', titulo: '🔴 En vivo ahora', fixtures: resto },
    ].filter((b) => b.fixtures.length > 0)
  }, [fixtures, seleccionada, favoritos])

  if (!fixtures && !error) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Buscando partidos en vivo...
      </div>
    )
  }

  if (error && !fixtures) {
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

  if (!bloques || bloques.length === 0) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center animate-in fade-in duration-500">
        <p className="text-4xl mb-3">🔴</p>
        <p className="text-slate-300 font-bold">
          No hay partidos en vivo ahorita en las ligas de la sección
          {seleccionada ? ' ni de tu quiniela' : ''}. Vuelve cuando ruede
          el balón.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6 animate-in fade-in duration-500">
      {bloques.map((bloque) => {
        // Dentro de cada bloque, agrupar por liga como en las demás vistas.
        const porLiga = new Map<string, SportsFixture[]>()
        for (const f of bloque.fixtures) {
          const arr = porLiga.get(f.leagueProviderId) || []
          arr.push(f)
          porLiga.set(f.leagueProviderId, arr)
        }
        return (
          <div key={bloque.clave} className="flex flex-col gap-3">
            <h3 className="font-black text-white text-sm uppercase tracking-widest px-1">
              {bloque.titulo}
            </h3>
            {[...porLiga.entries()].map(([ligaId, filas]) => (
              <div
                key={ligaId}
                className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
                  {getSupportedLeague(ligaId)?.name || 'Partido de tu quiniela'}
                </div>
                <div>
                  {filas.map((f) => (
                    <FilaPartido
                      key={f.providerId}
                      f={f}
                      onVerEquipo={onVerEquipo}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Filtro 🔎 Buscar ---------------------------------------------------

interface ResultadoBusqueda {
  ligas: {
    providerId: string
    name: string
    season: string
    badgeUrl: string | null
  }[]
  equipos: {
    leagueProviderId: string
    leagueName: string
    teamProviderId: string
    teamName: string
    badgeUrl: string | null
  }[]
}

function BuscadorPartidos({
  onVerEquipo,
  onVerLiga,
  favoritos,
  onToggleLiga,
  onCerrar,
}: {
  onVerEquipo: EquipoTocable
  onVerLiga: (leagueProviderId: string) => void
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
  onCerrar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusqueda | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = texto.trim()
    if (q.length < 2) {
      setResultados(null)
      setBuscando(false)
      setError(null)
      return
    }
    setBuscando(true)
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Error al buscar')
        setResultados({ ligas: data.ligas || [], equipos: data.equipos || [] })
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo buscar.')
        setResultados(null)
      } finally {
        setBuscando(false)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [texto])

  const sinResultados =
    resultados !== null &&
    resultados.ligas.length === 0 &&
    resultados.equipos.length === 0

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 animate-in fade-in duration-500">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/80 border border-cyan-500/40">
          <span className="text-lg">🔎</span>
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busca un equipo o una liga… (p. ej. Dinamarca, Cruz Azul)"
            className="flex-1 bg-transparent outline-none text-white font-bold text-sm placeholder:text-slate-500 min-w-0"
          />
          {buscando && (
            <span className="text-cyan-400 text-xs font-bold animate-pulse shrink-0">
              Buscando…
            </span>
          )}
        </div>
        <button
          onClick={onCerrar}
          className="shrink-0 w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-black transition-all"
          title="Cerrar buscador"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center">
          <p className="text-red-400 font-bold">⚠️ {error}</p>
        </div>
      )}

      {sinResultados && !error && (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center">
          <p className="text-slate-300 font-bold text-sm">
            Sin resultados para “{texto.trim()}” en las ligas de la
            sección. Prueba con otro nombre.
          </p>
        </div>
      )}

      {resultados && resultados.ligas.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
            Ligas
          </div>
          <div>
            {resultados.ligas.map((l) => {
              const seguida = favoritos.ligas.includes(l.providerId)
              return (
              <div
                key={l.providerId}
                className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40 transition-colors"
              >
                <button
                  onClick={() => onVerLiga(l.providerId)}
                  className="flex-1 flex items-center gap-3 min-w-0 text-left"
                >
                  <LogoLiga url={l.badgeUrl} nombre={l.name} className="w-7 h-7" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-white text-sm truncate">
                      {l.name}
                    </span>
                    <span className="block text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                      Ver liga · Temporada {l.season}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => onToggleLiga(l.providerId)}
                  title={
                    seguida
                      ? 'Dejar de seguir esta liga'
                      : 'Agregar a favoritos'
                  }
                  aria-label={
                    seguida
                      ? 'Dejar de seguir esta liga'
                      : 'Agregar a favoritos'
                  }
                  className={`shrink-0 px-3 py-2 rounded-xl font-black text-base leading-none transition-all ${
                    seguida
                      ? 'text-amber-400 bg-amber-500/10'
                      : 'text-slate-400 hover:text-amber-400 bg-slate-800/60'
                  }`}
                >
                  {seguida ? '★' : '☆'}
                </button>
                <span className="text-slate-500">→</span>
              </div>
              )
            })}
          </div>
        </div>
      )}

      {resultados && resultados.equipos.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
            Equipos
          </div>
          <div>
            {resultados.equipos.map((e) => (
              <button
                key={`${e.leagueProviderId}-${e.teamProviderId}`}
                onClick={() =>
                  onVerEquipo({
                    leagueProviderId: e.leagueProviderId,
                    teamProviderId: e.teamProviderId,
                    teamName: e.teamName,
                    badgeUrl: e.badgeUrl,
                  })
                }
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 last:border-b-0 text-left hover:bg-slate-800/40 transition-colors"
              >
                <Escudo
                  url={e.badgeUrl}
                  nombre={nombreEquipoES(e.teamName, e.teamProviderId)}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-white text-sm truncate">
                    {nombreEquipoES(e.teamName, e.teamProviderId)}
                  </span>
                  <span className="block text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                    {e.leagueName}
                  </span>
                </span>
                <span className="text-slate-500">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {texto.trim().length < 2 && (
        <p className="text-center text-slate-500 text-xs font-medium">
          Escribe al menos 2 letras. Encuentra equipos aunque los busques
          en español.
        </p>
      )}
    </div>
  )
}

// ---------- Sección completa --------------------------------------------------

export default function SeccionPartidos() {
  const [vista, setVista] = useState<Vista>('quiniela')
  const [buscarAbierto, setBuscarAbierto] = useState(false)
  const [favoritos, setFavoritos] = useState<Favoritos>(favoritosPorDefecto())
  const [favListos, setFavListos] = useState(false)
  const [ligaVista, setLigaVista] = useState<SupportedLeague | null>(null)
  const [equipoVista, setEquipoVista] = useState<EquipoSeguido | null>(null)
  const [fechaResultados, setFechaResultados] = useState<string>(() =>
    hoyEnMazatlan()
  )
  const [logosLiga, setLogosLiga] = useState<Record<string, string | null>>({})

  // Logos de liga para los encabezados y la página de liga: una sola
  // pedida; si falla, todo va sin logo.
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

  // Liga pedida desde la sección Siguiendo ("ver liga"): la sección
  // deja el ID en sessionStorage y aquí se abre su página al montar.
  useEffect(() => {
    try {
      const pendiente = sessionStorage.getItem('club_abrir_liga')
      if (pendiente) {
        sessionStorage.removeItem('club_abrir_liga')
        const liga = getSupportedLeague(pendiente)
        if (liga) setLigaVista(liga)
      }
    } catch {
      // Sin sessionStorage no hay liga pendiente.
    }
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
      vista === v && !buscarAbierto
        ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
        : 'text-slate-400 hover:text-white'
    }`

  // Estilo de los tres FILTROS superiores (Live / Calendario / Buscar).
  const claseFiltro = (activo: boolean, activoClases: string) =>
    `flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${
      activo
        ? activoClases
        : 'bg-slate-900/80 border-slate-800/50 text-slate-400 hover:text-white'
    }`

  // Tocar una liga abre su PÁGINA (Resumen · Partidos · Posiciones),
  // ya no manda directo a la tabla (corrección de Gonzalo, 2026-11-14).
  const verLiga = useCallback(
    (leagueProviderId: string) => {
      const liga = getSupportedLeague(leagueProviderId)
      if (!liga) return
      setLigaVista(liga)
      setBuscarAbierto(false)
      setEquipoVista(null)
    },
    []
  )

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
      ) : ligaVista ? (
        // Página de la liga: Resumen · Partidos · Posiciones.
        <PaginaLiga
          key={ligaVista.providerId}
          liga={ligaVista}
          badgeUrl={logosLiga[ligaVista.providerId] ?? null}
          favoritos={favoritos}
          onToggleLiga={toggleLiga}
          onVerEquipo={verEquipo}
          onVolver={() => setLigaVista(null)}
        />
      ) : (
      <>
      {/* ── FILTROS superiores: Live · Calendario · Buscar ── */}
      <div className="flex items-center gap-1.5 w-full mb-3">
        <button
          onClick={() => {
            setBuscarAbierto(false)
            setVista('envivo')
          }}
          className={claseFiltro(
            vista === 'envivo' && !buscarAbierto,
            'bg-red-600 border-red-500 text-white shadow-[0_0_18px_rgba(220,38,38,0.45)]'
          )}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              vista === 'envivo' && !buscarAbierto
                ? 'bg-white animate-pulse'
                : 'bg-red-500'
            }`}
          />
          Live
        </button>
        <button
          onClick={() => {
            setBuscarAbierto(false)
            setVista('resultados')
          }}
          className={claseFiltro(
            vista === 'resultados' && !buscarAbierto,
            'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
          )}
        >
          📅 Calendario
        </button>
        <button
          onClick={() => setBuscarAbierto((v) => !v)}
          className={claseFiltro(
            buscarAbierto,
            'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
          )}
        >
          🔎 Buscar
        </button>
      </div>

      {/* ── PESTAÑAS de la sección: Quiniela y Favoritos. Posiciones
          salió del menú (vive en la página de cada liga y de cada
          equipo) y Siguiendo es sección propia de la barra inferior
          (correcciones de Gonzalo, 2026-11-14). ── */}
      <div className="flex flex-wrap gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full mb-4">
        <button onClick={() => { setBuscarAbierto(false); setVista('quiniela') }} className={claseSubVista('quiniela')}>
          🎯 Quiniela
        </button>
        <button onClick={() => { setBuscarAbierto(false); setVista('favoritos') }} className={claseSubVista('favoritos')}>
          ⭐ Favoritos
        </button>
      </div>

      {buscarAbierto ? (
        <BuscadorPartidos
          onVerEquipo={(e) => {
            setBuscarAbierto(false)
            verEquipo(e)
          }}
          onVerLiga={verLiga}
          favoritos={favoritos}
          onToggleLiga={toggleLiga}
          onCerrar={() => setBuscarAbierto(false)}
        />
      ) : (
      <>
      {vista === 'envivo' && (
        <VistaEnVivo favoritos={favoritos} onVerEquipo={verEquipo} />
      )}

      {vista === 'quiniela' && <VistaQuiniela onVerEquipo={verEquipo} />}

      {vista === 'resultados' && (
        <div className="w-full flex flex-col items-center gap-4 animate-in fade-in duration-500">
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
          <ListaPartidos
            key={fechaResultados}
            dias={1}
            fecha={fechaResultados}
            soloFavoritos={false}
            favoritos={favoritos}
            onToggleLiga={toggleLiga}
            onVerEquipo={verEquipo}
            onVerLiga={verLiga}
          />
        </div>
      )}

      {vista === 'favoritos' &&
        (favListos ? (
          <ListaPartidos
            dias={7}
            soloFavoritos
            favoritos={favoritos}
            onToggleLiga={toggleLiga}
            onVerEquipo={verEquipo}
            onVerLiga={verLiga}
          />
        ) : (
          <div className="text-cyan-400 font-bold animate-pulse py-20">
            Cargando tus favoritos...
          </div>
        ))}

      </>
      )}
      </>
      )}
    </div>
  )
}
