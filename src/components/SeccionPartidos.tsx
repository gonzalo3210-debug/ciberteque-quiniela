'use client'
// src/components/SeccionPartidos.tsx
//
// Sección "⚽ Partidos" (decisión de Gonzalo 2026-11-13; reorganizada
// 2026-11-14 a su diseño tipo 365Scores): UNA sola sección en vez de un
// botón por liga. Arriba, dos FILTROS (debajo de la barra de la app):
//   🔴 Live       — partidos en vivo AHORA, por prioridad: primero los
//                   de la quiniela del Club, luego los de favoritos y al
//                   final el resto de ligas soportadas (vista EnVivo).
//   📅 Calendario — partidos por DÍA (selector ‹ › y botón Hoy) de
//                   TODAS las ligas soportadas, agrupados por liga;
//                   tocar el encabezado de una liga filtra a solo esa.
// El tercer filtro, 🔎 Buscar, SALIÓ en el paquete v20 (2026-11-17,
// decisión de Gonzalo): solo filtraba contenido de las ligas
// soportadas y el explorador 🌎 Ligas ya trae su propio buscador,
// que además encuentra equipos.
// Y las PESTAÑAS de la sección:
//   🎯 Quiniela   — los partidos de la jornada activa o abierta del
//                   Club (Supabase) emparejados con los de la API para
//                   marcador/minuto en vivo; sin pareja, van con los
//                   datos de la app.
//   ⭐ Favoritos  — partidos de las ligas/equipos que sigue el usuario
//                   (estrellas, guardadas en localStorage).
//   🌎 Ligas      — explorador con TODAS las ligas del proveedor por
//                   deporte (components/ExploradorLigas.tsx); elegir
//                   una abre su página igual que las curadas.
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
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  detectarEventosSonoros,
  leerPreferenciaSonidos,
  sonarGol,
  sonarSilbatazo,
  vibrarGol,
  type MarcadorSimple,
} from '@/lib/sonidos'
import type {
  SportsFixture,
  SportsTeamDetail,
  StandingRow,
} from '@/lib/sports/types'
import {
  SUPPORTED_LEAGUES,
  getSupportedLeague,
  type SupportedLeague,
} from '@/lib/sports/leagues'
import TablaLiga, {
  TablaCard,
  esEquipoResaltado,
  marcadoresDesdeFixtures,
} from '@/components/TablaLiga'
import PaginaLiga from '@/components/PaginaLiga'
import ExploradorLigas from '@/components/ExploradorLigas'
import {
  ligaDinamicaASoportada,
  type LigaDinamica,
} from '@/lib/sports/catalogo'
import VistaPartido, {
  datosDesdeFixture,
  type PartidoVistaDatos,
} from '@/components/VistaPartido'
import {
  computeStandingsAmbito,
  type AmbitoTabla,
} from '@/lib/sports/computedStandings'
import {
  LogoLiga,
  Escudo,
  FilaPartido,
  fechaDelPartido,
  etiquetaDia,
  type EquipoTocable,
} from '@/components/partidosUI'
import {
  nombreEquipoES,
  normalizarNombreEquipo,
} from '@/lib/sports/nombresES'
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
  | 'ligas'

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
  /** Tocar un partido abre su vista (Resumen · Enfrentamientos · Posiciones). */
  onVerPartido: (f: SportsFixture) => void
}

function ListaPartidos({
  dias,
  fecha = null,
  soloFavoritos,
  favoritos,
  onToggleLiga,
  onVerEquipo,
  onVerLiga,
  onVerPartido,
}: ListaProps) {
  const [grupos, setGrupos] = useState<GrupoPartidos[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 🔍 Buscador de equipo (solo en la vista ⭐ Favoritos, pedido de
  // Gonzalo 2026-11-22): con texto, la lista deja de ser "lo seguido"
  // y busca ese equipo en TODOS los partidos cargados (la semana de
  // la vista), para encontrarlo y abrir su página a seguirlo.
  const [busqueda, setBusqueda] = useState('')

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

  // 🔍 Con búsqueda activa (solo Favoritos): partidos de cualquier
  // liga cargada donde juegue el equipo buscado, comparando el nombre
  // original del proveedor y su nombre en español, sin acentos.
  const consulta = soloFavoritos ? normalizarNombreEquipo(busqueda) : ''
  const visiblesFiltrados = useMemo(() => {
    if (!consulta) return visibles
    const coincide = (f: SportsFixture) =>
      normalizarNombreEquipo(f.homeTeam).includes(consulta) ||
      normalizarNombreEquipo(
        nombreEquipoES(f.homeTeam, f.homeTeamProviderId)
      ).includes(consulta) ||
      normalizarNombreEquipo(f.awayTeam).includes(consulta) ||
      normalizarNombreEquipo(
        nombreEquipoES(f.awayTeam, f.awayTeamProviderId)
      ).includes(consulta)
    return (grupos || [])
      .map((g) => ({
        clave: g.league.providerId,
        nombre: g.league.name,
        ligaId: g.league.providerId as string | null,
        fixtures: g.fixtures.filter(coincide),
      }))
      .filter((g) => g.fixtures.length > 0)
  }, [consulta, visibles, grupos])

  const buscadorFavoritos = soloFavoritos ? (
    <div className="w-full max-w-3xl">
      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="🔍 Buscar un equipo… (ej. Chivas, Bayern, Dinamarca)"
        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-all text-center"
      />
      {consulta && (
        <p className="text-center text-slate-500 text-[11px] font-bold mt-2">
          Buscando «{busqueda.trim()}» en los partidos de la semana de
          todas las ligas de la sección. Toca un equipo en su partido
          para abrir su página y seguirlo ⭐.
        </p>
      )}
    </div>
  ) : null

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
        {buscadorFavoritos}
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">⚽</p>
          <p className="text-slate-300 font-bold">
            {consulta
              ? `Ningún equipo coincide con «${busqueda.trim()}» en los partidos de la semana. Prueba con otro nombre.`
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
      {buscadorFavoritos}
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
              <FilaPartido key={f.providerId} f={f} onVerEquipo={onVerEquipo} onVerPartido={onVerPartido} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Página de equipo (Resumen · Partidos · Posiciones) ---------------
//
// Corrección de Gonzalo (2026-11-14, estilo 365Scores):
//   · Resumen    — competición principal, DT (si el proveedor lo trae;
//                  TheSportsDB hoy NO publica strManager, así que casi
//                  siempre se omite), estadio, próximo partido y los
//                  últimos 5 con chip G/E/P del equipo.
//   · Partidos   — próximos y últimos resultados, como antes.
//   · Posiciones — la tabla de su competición con el equipo resaltado
//                  y selector Completa / Local / Visitante (Local y
//                  Visitante se CALCULAN desde los resultados de la
//                  temporada). Si el equipo aparece en más de una liga
//                  soportada, se puede cambiar de competición.
//   LÍMITE conocido: filtros por AÑO y tabla anual/por torneo quedan
//   fuera por ahora (la tabla es la de la temporada configurada).

/** Chip G/E/P de un resultado desde la óptica del equipo. */
function chipResultado(f: SportsFixture, teamProviderId: string) {
  const esLocal = f.homeTeamProviderId === teamProviderId
  const gf = esLocal ? f.homeScore : f.awayScore
  const gc = esLocal ? f.awayScore : f.homeScore
  if (gf === null || gc === null) return null
  const letra = gf > gc ? 'G' : gf < gc ? 'P' : 'E'
  const clase =
    letra === 'G'
      ? 'bg-emerald-500 text-white'
      : letra === 'P'
        ? 'bg-red-500 text-white'
        : 'bg-slate-500 text-white'
  return (
    <span
      className={`w-6 h-6 shrink-0 rounded-full text-[11px] font-black flex items-center justify-center ${clase}`}
      title={letra === 'G' ? 'Ganado' : letra === 'P' ? 'Perdido' : 'Empatado'}
    >
      {letra}
    </span>
  )
}

/** Renglón compacto de un partido jugado, con chip G/E/P del equipo. */
function FilaUltimoPartido({
  f,
  teamProviderId,
  onVerEquipo,
}: {
  f: SportsFixture
  teamProviderId: string
  onVerEquipo: EquipoTocable
}) {
  const nombreLocal = nombreEquipoES(f.homeTeam, f.homeTeamProviderId)
  const nombreVisita = nombreEquipoES(f.awayTeam, f.awayTeamProviderId)
  const botonEquipo = (
    nombre: string,
    badge: string | null,
    teamId: string | null,
    alinearDerecha: boolean
  ) =>
    teamId ? (
      <button
        onClick={() =>
          onVerEquipo({
            teamProviderId: teamId,
            teamName: teamId === f.homeTeamProviderId ? f.homeTeam : f.awayTeam,
            leagueProviderId: f.leagueProviderId,
            badgeUrl: badge,
          })
        }
        title={`Ver ${nombre}`}
        className={`flex items-center gap-1.5 min-w-0 rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-800/70 transition-colors ${
          alinearDerecha ? 'flex-row-reverse text-right' : 'text-left'
        }`}
      >
        <Escudo url={badge} nombre={nombre} />
        <span className="font-bold text-xs sm:text-sm text-white truncate">
          {nombre}
        </span>
      </button>
    ) : (
      <span className="flex items-center gap-1.5 min-w-0 px-1 py-0.5">
        <Escudo url={badge} nombre={nombre} />
        <span className="font-bold text-xs sm:text-sm text-white truncate">
          {nombre}
        </span>
      </span>
    )

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60 last:border-b-0">
      {chipResultado(f, teamProviderId)}
      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 min-w-0">
        <div className="flex justify-end min-w-0">
          {botonEquipo(nombreLocal, f.homeBadgeUrl, f.homeTeamProviderId, true)}
        </div>
        <span className="px-2 py-1 rounded-lg bg-slate-950/70 border border-slate-800 font-black text-xs sm:text-sm text-white whitespace-nowrap">
          {f.homeScore ?? '-'} - {f.awayScore ?? '-'}
        </span>
        <div className="flex justify-start min-w-0">
          {botonEquipo(nombreVisita, f.awayBadgeUrl, f.awayTeamProviderId, false)}
        </div>
      </div>
      <span className="hidden sm:block w-16 shrink-0 text-right text-slate-500 text-[11px] font-bold">
        {etiquetaDia(f) || fechaDelPartido(f) || ''}
      </span>
    </div>
  )
}

function VistaEquipo({
  equipo,
  favoritos,
  onToggleEquipo,
  onVolver,
  onVerEquipo,
  onVerLiga,
  onVerPartido,
}: {
  equipo: EquipoSeguido
  favoritos: Favoritos
  onToggleEquipo: (equipo: EquipoSeguido) => void
  onVolver: () => void
  onVerEquipo: EquipoTocable
  /** La competición principal del Resumen abre la página de la liga. */
  onVerLiga: (leagueProviderId: string) => void
  onVerPartido: (f: SportsFixture) => void
}) {
  const [pestana, setPestana] = useState<'resumen' | 'partidos' | 'posiciones'>('resumen')
  const [partidos, setPartidos] = useState<SportsFixture[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logoLiga, setLogoLiga] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<SportsTeamDetail | null>(null)
  // Competiciones soportadas donde aparece el equipo esta temporada
  // (para el selector de Posiciones); null = detectando.
  const [competiciones, setCompeticiones] = useState<SupportedLeague[] | null>(null)
  const [compSel, setCompSel] = useState<string>(equipo.leagueProviderId)
  const [ambito, setAmbito] = useState<AmbitoTabla>('completa')
  const [fixturesAmbito, setFixturesAmbito] = useState<SportsFixture[] | null>(null)

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

  // Ficha del equipo (DT/estadio si el proveedor los trae).
  useEffect(() => {
    let activo = true
    fetch(`/api/equipos-liga?equipo=${equipo.teamProviderId}`)
      .then((r) => r.json())
      .then((d) => {
        if (activo) setDetalle(d.team ?? null)
      })
      .catch(() => {})
    return () => {
      activo = false
    }
  }, [equipo.teamProviderId])

  // ¿En qué ligas soportadas aparece el equipo esta temporada? Se
  // revisa el catálogo de cada liga; la de origen siempre cuenta.
  useEffect(() => {
    let activo = true
    Promise.all(
      SUPPORTED_LEAGUES.map(async (l) => {
        try {
          const r = await fetch(`/api/equipos-liga?liga=${l.providerId}`)
          const d = await r.json()
          const esta = (d.teams || []).some(
            (t: { providerId: string }) =>
              t.providerId === equipo.teamProviderId
          )
          return esta ? l : null
        } catch {
          return null
        }
      })
    ).then((res) => {
      if (!activo) return
      const comps = res.filter((x): x is SupportedLeague => x !== null)
      const conOrigen =
        comps.length > 0
          ? comps
          : liga
            ? [liga]
            : []
      setCompeticiones(conOrigen)
      if (!conOrigen.some((l) => l.providerId === compSel)) {
        setCompSel(conOrigen[0]?.providerId ?? equipo.leagueProviderId)
      }
    })
    return () => {
      activo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipo.teamProviderId])

  // Partidos de la competición elegida, para calcular Local/Visitante.
  // Se refrescan con la MISMA cadencia de la vista (2 min) para que la
  // tabla de ámbito también se mueva con los marcadores en vivo.
  useEffect(() => {
    if (pestana !== 'posiciones' || ambito === 'completa') return
    let activo = true
    setFixturesAmbito(null)
    const cargarAmbito = () => {
      fetch(`/api/partidos?liga=${compSel}`)
        .then((r) => r.json())
        .then((d) => {
          if (activo) setFixturesAmbito(d.fixtures || [])
        })
        .catch(() => {
          if (activo) setFixturesAmbito((prev) => prev ?? [])
        })
    }
    cargarAmbito()
    const id = setInterval(cargarAmbito, REFRESCO_MS)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [pestana, ambito, compSel])

  const jugadosTodos = useMemo(
    () =>
      (partidos || [])
        .filter((f) => f.status === 'finished')
        .sort((a, b) => (b.kickoffUtc || '').localeCompare(a.kickoffUtc || '')),
    [partidos]
  )
  const jugados = useMemo(() => jugadosTodos.slice(0, 10), [jugadosTodos])
  const ultimosCinco = useMemo(() => jugadosTodos.slice(0, 5), [jugadosTodos])
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

  const ligaComp = getSupportedLeague(compSel) ?? liga
  const filasAmbito: StandingRow[] | null = useMemo(() => {
    if (ambito === 'completa' || !fixturesAmbito) return null
    // Tabla que se mueve en vivo (Bloque 4): los partidos en curso de
    // la liga cuentan con su marcador actual, como si fueran finales
    // provisionales; al terminar, la ruta ya los trae 'finished'.
    const conEnVivo = fixturesAmbito.map((f) =>
      f.status === 'live' && f.homeScore !== null && f.awayScore !== null
        ? { ...f, status: 'finished' as const }
        : f
    )
    return computeStandingsAmbito(conEnVivo, ambito)
  }, [ambito, fixturesAmbito])
  const marcadoresAmbito = useMemo(
    () =>
      ambito !== 'completa' && fixturesAmbito
        ? marcadoresDesdeFixtures(fixturesAmbito)
        : [],
    [ambito, fixturesAmbito]
  )
  const resaltado = {
    teamProviderId: equipo.teamProviderId,
    teamName: equipo.teamName,
  }
  const filaAmbitoResaltada =
    filasAmbito && ligaComp
      ? filasAmbito.find((f) => esEquipoResaltado(f, resaltado))
      : undefined

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
            <FilaPartido key={f.providerId} f={f} onVerEquipo={onVerEquipo} onVerPartido={onVerPartido} />
          ))}
        </div>
      )}
    </div>
  )

  const clasePestana = (p: 'resumen' | 'partidos' | 'posiciones') =>
    `flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
      pestana === p
        ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
        : 'text-slate-400 hover:text-white'
    }`

  const claseChip = (activo: boolean) =>
    `px-3 py-1.5 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
      activo
        ? 'bg-cyan-600 text-white'
        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
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
        <button onClick={() => setPestana('resumen')} className={clasePestana('resumen')}>
          Resumen
        </button>
        <button onClick={() => setPestana('partidos')} className={clasePestana('partidos')}>
          Partidos
        </button>
        <button onClick={() => setPestana('posiciones')} className={clasePestana('posiciones')}>
          Posiciones
        </button>
      </div>

      {pestana === 'posiciones' ? (
        <div className="w-full flex flex-col items-center gap-4 animate-in fade-in duration-500">
          {competiciones && competiciones.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {competiciones.map((l) => (
                <button
                  key={l.providerId}
                  onClick={() => setCompSel(l.providerId)}
                  className={claseChip(compSel === l.providerId)}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-slate-900/80 p-1 rounded-2xl border border-slate-800/50">
            {(
              [
                ['completa', 'Completa'],
                ['local', 'Local'],
                ['visitante', 'Visitante'],
              ] as [AmbitoTabla, string][]
            ).map(([a, etiqueta]) => (
              <button
                key={a}
                onClick={() => setAmbito(a)}
                className={`px-3.5 py-1.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
                  ambito === a
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {ambito === 'completa' ? (
            ligaComp ? (
              <TablaLiga
                key={ligaComp.providerId}
                liga={ligaComp}
                equipoResaltado={resaltado}
                onVerEquipo={onVerEquipo}
              />
            ) : (
              <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
                <p className="text-slate-300 font-bold">
                  La liga de este equipo no está en la sección.
                </p>
              </div>
            )
          ) : !filasAmbito ? (
            <div className="text-cyan-400 font-bold animate-pulse py-10">
              Calculando la tabla...
            </div>
          ) : ligaComp ? (
            <div className="w-full">
              {filaAmbitoResaltada && (
                <div className="mb-3 px-4 py-2.5 rounded-2xl bg-cyan-600/15 border border-cyan-500/40 text-cyan-200 font-bold text-sm text-center">
                  🏅 {nombreEquipoES(equipo.teamName, equipo.teamProviderId)} va
                  en el lugar {filaAmbitoResaltada.rank} de {filasAmbito.length}{' '}
                  {ambito === 'local'
                    ? 'jugando de local'
                    : 'jugando de visitante'}
                </div>
              )}
              <TablaCard
                liga={ligaComp}
                filas={filasAmbito}
                equipoResaltado={resaltado}
                onVerEquipo={onVerEquipo}
                marcadoresEnVivo={marcadoresAmbito}
              />
              <p className="mt-3 text-center text-slate-500 text-xs font-bold">
                🧮 Tabla calculada por la app desde los resultados de la
                temporada.
                {marcadoresAmbito.length > 0 &&
                  ' Incluye los marcadores en vivo (provisional).'}
              </p>
            </div>
          ) : null}
          <p className="text-center text-slate-600 text-[11px] font-bold">
            Filtros por año y tabla anual: pendientes por ahora.
          </p>
        </div>
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
      ) : pestana === 'partidos' ? (
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
      ) : (
        /* ── RESUMEN ── */
        <div className="w-full flex flex-col gap-5">
          <div className="w-full bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
              Competición principal
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              {liga ? (
                <button
                  onClick={() => onVerLiga(liga.providerId)}
                  title={`Ver la página de ${liga.name}`}
                  className="flex items-center gap-2.5 text-left hover:opacity-75 transition-opacity"
                >
                  <LogoLiga
                    url={logoLiga}
                    nombre={liga.name}
                    className="w-8 h-8"
                  />
                  <div>
                    <p className="font-black text-white text-sm">
                      {liga.name} <span className="text-cyan-400">›</span>
                    </p>
                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                      Temporada {liga.season}
                    </p>
                  </div>
                </button>
              ) : (
                <div className="flex items-center gap-2.5">
                  <LogoLiga url={logoLiga} nombre="Liga" className="w-8 h-8" />
                  <div>
                    <p className="font-black text-white text-sm">Liga</p>
                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                      Temporada
                    </p>
                  </div>
                </div>
              )}
              {detalle?.manager && (
                <p className="text-sm">
                  <span className="font-black text-slate-500 text-[11px] uppercase tracking-widest mr-2">
                    🧑‍💼 DT
                  </span>
                  <span className="font-bold text-white">
                    {detalle.manager}
                  </span>
                </p>
              )}
              {detalle?.stadium && (
                <p className="text-sm">
                  <span className="font-black text-slate-500 text-[11px] uppercase tracking-widest mr-2">
                    🏟️ Estadio
                  </span>
                  <span className="font-bold text-white">
                    {detalle.stadium}
                  </span>
                </p>
              )}
            </div>
          </div>

          {siguientes.length > 0 ? (
            <div className="w-full bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
                {siguientes[0].status === 'live'
                  ? '🔴 Jugando ahora'
                  : 'Próximo partido'}
              </div>
              <FilaPartido f={siguientes[0]} onVerEquipo={onVerEquipo} onVerPartido={onVerPartido} />
            </div>
          ) : (
            <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center">
              <p className="text-slate-300 font-bold text-sm">
                No tiene próximos partidos programados esta temporada.
              </p>
            </div>
          )}

          <div className="w-full bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
              Últimos partidos
            </div>
            {ultimosCinco.length === 0 ? (
              <p className="px-4 py-6 text-center text-slate-400 font-bold text-sm">
                Todavía no juega partidos esta temporada.
              </p>
            ) : (
              <div>
                {ultimosCinco.map((f) => (
                  <FilaUltimoPartido
                    key={f.providerId}
                    f={f}
                    teamProviderId={equipo.teamProviderId}
                    onVerEquipo={onVerEquipo}
                  />
                ))}
              </div>
            )}
          </div>
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
  onVerPartido,
}: {
  partido: any
  mapaLogos: Record<string, string>
  /** Tocar la fila abre la vista del partido con los datos de la app. */
  onVerPartido?: () => void
}) {
  const logoDe = (nombre: string) =>
    mapaLogos[(nombre || '').toLowerCase().trim()] || null
  const esFinal = partido.es_final === true
  const tieneMarcador =
    partido.goles_local !== null &&
    partido.goles_local !== undefined &&
    partido.goles_visitante !== null &&
    partido.goles_visitante !== undefined
  const iso = partido.fecha_hora_partido as string | null
  // 🔴 En vivo: el partido ya inició (o ya tiene un avance capturado) y
  // el Árbitro aún no lo marca final. Antes, tener marcador capturado
  // bastaba para pintarlo «Final» aunque siguiera jugándose.
  const yaInicio = iso ? new Date(iso).getTime() <= Date.now() : false
  const enVivo = !esFinal && (tieneMarcador || yaInicio)

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
    <div
      onClick={onVerPartido}
      role={onVerPartido ? 'button' : undefined}
      title={onVerPartido ? 'Ver partido' : undefined}
      className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60 last:border-b-0 ${
        onVerPartido ? 'cursor-pointer hover:bg-slate-800/40 transition-colors' : ''
      }`}
    >
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
        ) : enVivo ? (
          <div>
            <div className="font-black text-white text-base leading-none">
              {partido.goles_local ?? 0} - {partido.goles_visitante ?? 0}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-red-400 mt-1">
              🔴 En vivo
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

function VistaQuiniela({
  onVerEquipo,
  onVerPartidoApp,
  onVerLiga,
  logosLiga,
}: {
  onVerEquipo: EquipoTocable
  onVerPartidoApp: (partido: any, fixture?: SportsFixture) => void
  onVerLiga: (leagueProviderId: string) => void
  logosLiga: Record<string, string | null>
}) {
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

  // Liga dominante de la jornada (la de más partidos emparejados): el
  // encabezado la ofrece como acceso directo a su página (Bloque E).
  const ligaDominante = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const f of parejas.values()) {
      if (f.leagueProviderId) {
        conteo.set(f.leagueProviderId, (conteo.get(f.leagueProviderId) || 0) + 1)
      }
    }
    let mejor: string | null = null
    let max = 0
    for (const [id, n] of conteo) {
      if (n > max) {
        max = n
        mejor = id
      }
    }
    return mejor ? getSupportedLeague(mejor) : undefined
  }, [parejas])

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
  // Solo cuentan como jugados los que el Árbitro ya marcó finales: un
  // avance parcial (marcador capturado en vivo) NO es un partido jugado.
  const finales = partidos.filter((p) => p.es_final === true).length

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
          {ligaDominante && (
            <button
              onClick={() => onVerLiga(ligaDominante.providerId)}
              title={`Ver la página de ${ligaDominante.name}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-200 hover:text-cyan-300 hover:border-cyan-500 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <LogoLiga
                url={logosLiga[ligaDominante.providerId]}
                nombre={ligaDominante.name}
                className="w-4 h-4"
              />
              {ligaDominante.name} <span className="text-cyan-400">›</span>
            </button>
          )}
        </div>
        <div>
          {partidos.map((p) => {
            const fixture = parejas.get(p.id)
            return fixture ? (
              <FilaPartido key={p.id} f={fixture} onVerEquipo={onVerEquipo} onVerPartido={(f) => onVerPartidoApp(p, f)} />
            ) : (
              <FilaPartidoApp key={p.id} partido={p} mapaLogos={mapaLogos} onVerPartido={() => onVerPartidoApp(p)} />
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
  onVerLiga,
  onVerPartido,
  logosLiga,
}: {
  favoritos: Favoritos
  onVerEquipo: EquipoTocable
  onVerLiga: (leagueProviderId: string) => void
  onVerPartido: (f: SportsFixture) => void
  logosLiga: Record<string, string | null>
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

  // 🔊 Sonidos en vivo: entre un refresco y otro, si sube el marcador
  // de un partido de la quiniela o de favoritos suena el gol (y vibra),
  // y al terminar suena el silbatazo. Solo si el jugador prendió el
  // toggle en Mi Perfil; la primera foto es la línea base (no suena).
  const fotoSonoraPrevia = useRef<Map<string, MarcadorSimple> | null>(null)
  useEffect(() => {
    if (!bloques) return
    const actuales: MarcadorSimple[] = []
    for (const bloque of bloques) {
      if (bloque.clave === 'resto') continue
      for (const f of bloque.fixtures) {
        actuales.push({
          id: f.providerId,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          status: f.status,
        })
      }
    }
    const eventos = detectarEventosSonoros(fotoSonoraPrevia.current, actuales)
    fotoSonoraPrevia.current = new Map(actuales.map((m) => [m.id, m]))
    if (eventos.length === 0 || !leerPreferenciaSonidos()) return
    for (const evento of eventos) {
      if (evento.tipo === 'gol') {
        sonarGol()
        vibrarGol()
      } else {
        sonarSilbatazo()
      }
    }
  }, [bloques])

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
                <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800">
                  {getSupportedLeague(ligaId) ? (
                    <button
                      onClick={() => onVerLiga(ligaId)}
                      title={`Ver la página de ${getSupportedLeague(ligaId)?.name}`}
                      className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-white hover:text-cyan-300 transition-colors"
                    >
                      <LogoLiga
                        url={logosLiga[ligaId]}
                        nombre={getSupportedLeague(ligaId)?.name || ''}
                      />
                      {getSupportedLeague(ligaId)?.name}{' '}
                      <span className="text-cyan-400">›</span>
                    </button>
                  ) : (
                    <span className="font-black text-xs uppercase tracking-widest text-white">
                      Partido de tu quiniela
                    </span>
                  )}
                </div>
                <div>
                  {filas.map((f) => (
                    <FilaPartido
                      key={f.providerId}
                      f={f}
                      onVerEquipo={onVerEquipo}
                      onVerPartido={onVerPartido}
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

// ---------- Sección completa --------------------------------------------------

export default function SeccionPartidos() {
  const [vista, setVista] = useState<Vista>('quiniela')
  const [favoritos, setFavoritos] = useState<Favoritos>(favoritosPorDefecto())
  const [favListos, setFavListos] = useState(false)
  const [ligaVista, setLigaVista] = useState<SupportedLeague | null>(null)
  // Deporte de la liga abierta (para la página de liga: Posiciones y
  // enlaces a equipos dependen del deporte). Las curadas son fútbol.
  const [ligaVistaSport, setLigaVistaSport] = useState<string | null>(null)
  // Liga del catálogo cuyo detalle se está cargando para abrirla.
  const [abriendoLigaId, setAbriendoLigaId] = useState<string | null>(null)
  const [equipoVista, setEquipoVista] = useState<EquipoSeguido | null>(null)
  const [partidoVista, setPartidoVista] = useState<PartidoVistaDatos | null>(null)
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
    setPartidoVista(null)
  }, [])

  /** Abrir la vista de un partido que viene de la API. */
  const verPartido = useCallback((f: SportsFixture) => {
    setPartidoVista(datosDesdeFixture(f))
  }, [])

  /**
   * Abrir la vista de un partido DE LA QUINIELA: con su gemelo de la
   * API si lo hay (se conserva el canal de la quiniela para "dónde
   * ver") o solo con los datos de la app si no se emparejó.
   */
  const verPartidoApp = useCallback((p: any, fixture?: SportsFixture) => {
    if (fixture) {
      const d = datosDesdeFixture(fixture)
      d.canal = p?.canal ?? null
      setPartidoVista(d)
      return
    }
    const esFinal = p?.es_final === true
    const tieneMarcador =
      p?.goles_local !== null &&
      p?.goles_local !== undefined &&
      p?.goles_visitante !== null &&
      p?.goles_visitante !== undefined
    const yaInicio = p?.fecha_hora_partido
      ? new Date(p.fecha_hora_partido).getTime() <= Date.now()
      : false
    const enVivo = !esFinal && (tieneMarcador || yaInicio)
    setPartidoVista({
      homeTeam: p?.equipo_local || '',
      awayTeam: p?.equipo_visitante || '',
      homeTeamProviderId: null,
      awayTeamProviderId: null,
      homeBadgeUrl: null,
      awayBadgeUrl: null,
      leagueProviderId: null,
      leagueName: null,
      kickoffIso: p?.fecha_hora_partido ?? null,
      status: esFinal ? 'finished' : enVivo ? 'live' : 'scheduled',
      statusRaw: null,
      progress: null,
      homeScore: p?.goles_local ?? null,
      awayScore: p?.goles_visitante ?? null,
      venue: null,
      tvStation: null,
      canal: p?.canal ?? null,
      fixtureId: null,
    })
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

  // Estilo de los FILTROS superiores (Live / Calendario).
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
      setLigaVistaSport('Soccer')
      setEquipoVista(null)
      setPartidoVista(null)
    },
    []
  )

  /**
   * Abrir la página de una liga CUALQUIERA del catálogo del
   * proveedor (explorador 🌎 Ligas): las curadas van por verLiga; las
   * demás piden su detalle a /api/ligas-catalogo (temporada y tabla
   * ya verificados en el servidor) y arman el descriptor al momento.
   */
  const verLigaUniversal = useCallback(
    async (leagueProviderId: string) => {
      if (getSupportedLeague(leagueProviderId)) {
        verLiga(leagueProviderId)
        return
      }
      setAbriendoLigaId(leagueProviderId)
      try {
        const res = await fetch(`/api/ligas-catalogo?liga=${leagueProviderId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Error al abrir la liga')
        const dinamica = data.league as LigaDinamica
        setLigaVista(ligaDinamicaASoportada(dinamica))
        setLigaVistaSport(dinamica.sport)
        if (dinamica.badgeUrl) {
          setLogosLiga((prev) => ({
            ...prev,
            [dinamica.providerId]: dinamica.badgeUrl,
          }))
        }
        setEquipoVista(null)
        setPartidoVista(null)
      } catch (e) {
        console.error('No se pudo abrir la liga del catálogo:', e)
      } finally {
        setAbriendoLigaId(null)
      }
    },
    [verLiga]
  )

  return (
    <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in duration-500">
      {partidoVista ? (
        <VistaPartido
          key={`${partidoVista.fixtureId || partidoVista.homeTeam}-${partidoVista.awayTeam}`}
          datos={partidoVista}
          logoLiga={
            partidoVista.leagueProviderId
              ? (logosLiga[partidoVista.leagueProviderId] ?? null)
              : null
          }
          onVolver={() => setPartidoVista(null)}
          onVerEquipo={verEquipo}
          onVerLiga={verLiga}
        />
      ) : equipoVista ? (
        <VistaEquipo
          key={`${equipoVista.leagueProviderId}-${equipoVista.teamProviderId}`}
          equipo={equipoVista}
          favoritos={favoritos}
          onToggleEquipo={toggleEquipo}
          onVolver={() => setEquipoVista(null)}
          onVerEquipo={verEquipo}
          onVerLiga={verLiga}
          onVerPartido={verPartido}
        />
      ) : ligaVista ? (
        // Página de la liga: Resumen · Partidos · Posiciones.
        <PaginaLiga
          key={ligaVista.providerId}
          liga={ligaVista}
          sport={ligaVistaSport}
          badgeUrl={logosLiga[ligaVista.providerId] ?? null}
          favoritos={favoritos}
          onToggleLiga={toggleLiga}
          onVerEquipo={verEquipo}
          onVerPartido={verPartido}
          onVolver={() => setLigaVista(null)}
        />
      ) : (
      <>
      {/* ── FILTROS superiores: Live · Calendario. El 🔎 Buscar
          viejo salió (v20): el explorador 🌎 Ligas ya trae su propio
          buscador, que además encuentra equipos. ── */}
      <div className="flex items-center gap-1.5 w-full mb-3">
        <button
          onClick={() => setVista('envivo')}
          className={claseFiltro(
            vista === 'envivo',
            'bg-red-600 border-red-500 text-white shadow-[0_0_18px_rgba(220,38,38,0.45)]'
          )}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              vista === 'envivo' ? 'bg-white animate-pulse' : 'bg-red-500'
            }`}
          />
          Live
        </button>
        <button
          onClick={() => setVista('resultados')}
          className={claseFiltro(
            vista === 'resultados',
            'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
          )}
        >
          📅 Calendario
        </button>
      </div>

      {/* ── PESTAÑAS de la sección: Quiniela y Favoritos. Posiciones
          salió del menú (vive en la página de cada liga y de cada
          equipo) y Siguiendo es sección propia de la barra inferior
          (correcciones de Gonzalo, 2026-11-14). ── */}
      <div className="flex flex-wrap gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full mb-4">
        <button onClick={() => setVista('quiniela')} className={claseSubVista('quiniela')}>
          🎯 Quiniela
        </button>
        <button onClick={() => setVista('favoritos')} className={claseSubVista('favoritos')}>
          ⭐ Favoritos
        </button>
        <button onClick={() => setVista('ligas')} className={claseSubVista('ligas')}>
          🌎 Ligas
        </button>
      </div>

      <>
      {vista === 'envivo' && (
        <VistaEnVivo
          favoritos={favoritos}
          onVerEquipo={verEquipo}
          onVerLiga={verLiga}
          onVerPartido={verPartido}
          logosLiga={logosLiga}
        />
      )}

      {vista === 'quiniela' && (
        <VistaQuiniela
          onVerEquipo={verEquipo}
          onVerPartidoApp={verPartidoApp}
          onVerLiga={verLiga}
          logosLiga={logosLiga}
        />
      )}

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
            onVerPartido={verPartido}
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
            onVerPartido={verPartido}
          />
        ) : (
          <div className="text-cyan-400 font-bold animate-pulse py-20">
            Cargando tus favoritos...
          </div>
        ))}

      {vista === 'ligas' && (
        <ExploradorLigas
          onVerLiga={verLigaUniversal}
          abriendoId={abriendoLigaId}
          favoritos={favoritos}
          onToggleLiga={toggleLiga}
          onVerEquipo={verEquipo}
        />
      )}

      </>
      </>
      )}
    </div>
  )
}
