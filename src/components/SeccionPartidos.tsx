'use client'
// src/components/SeccionPartidos.tsx
//
// Sección "⚽ Partidos" (decisión de Gonzalo 2026-11-13): UNA sola sección
// tipo 365Scores en vez de un botón por liga. Vistas:
//   ⭐ Favoritos  — partidos de las ligas/equipos que sigue el usuario
//                   (estrellas, guardadas en localStorage), en vivo primero.
//   📋 Resultados — partidos de ayer/hoy/mañana de TODAS las ligas
//                   soportadas, agrupados por liga.
//   📊 Posiciones — tabla por liga con selector (componente TablaLiga) y
//                   tabla EN VIVO al caer gol.
//   ⭐ Siguiendo  — administrar ligas y equipos seguidos.
// Interruptor "En vivo" para ver solo los partidos en curso.
// Los datos vienen de NUESTRAS rutas de servidor (/api/partidos,
// /api/equipos-liga); la vista se refresca sola cada 2 minutos y la llave
// del proveedor nunca llega al navegador.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SportsFixture, SportsTeam } from '@/lib/sports'
import { SUPPORTED_LEAGUES, type SupportedLeague } from '@/lib/sports/leagues'
import TablaLiga from '@/components/TablaLiga'
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
} from '@/lib/fechaMazatlan'

type Vista = 'favoritos' | 'resultados' | 'posiciones' | 'siguiendo'

interface LigaGrupo {
  providerId: string
  name: string
  season: string
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

function FilaPartido({ f }: { f: SportsFixture }) {
  const dia = etiquetaDia(f)
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60 last:border-b-0">
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className="font-bold text-white text-sm truncate">{f.homeTeam}</span>
        <Escudo url={f.homeBadgeUrl} nombre={f.homeTeam} />
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

      <div className="flex-1 flex items-center gap-2 min-w-0">
        <Escudo url={f.awayBadgeUrl} nombre={f.awayTeam} />
        <span className="font-bold text-white text-sm truncate">{f.awayTeam}</span>
      </div>
    </div>
  )
}

// ---------- Lista de partidos (Favoritos / Resultados) ----------------------

interface ListaProps {
  dias: number
  soloFavoritos: boolean
  soloEnVivo: boolean
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
}

function ListaPartidos({
  dias,
  soloFavoritos,
  soloEnVivo,
  favoritos,
  onToggleLiga,
}: ListaProps) {
  const [grupos, setGrupos] = useState<GrupoPartidos[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/partidos?dias=${dias}`)
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
  }, [dias])

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

  if (visibles.length === 0) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-4xl mb-3">{soloEnVivo ? '🔴' : '⚽'}</p>
        <p className="text-slate-300 font-bold">
          {soloEnVivo
            ? 'No hay partidos en vivo ahorita.'
            : soloFavoritos
              ? 'No hay partidos próximos de tus ligas y equipos seguidos. Revisa la vista Siguiendo para agregar más.'
              : 'No hay partidos ayer, hoy ni mañana en las ligas de la sección.'}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-5 animate-in fade-in duration-500">
      {visibles.map((g) => (
        <div
          key={g.clave}
          className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-slate-800">
            <span className="font-black text-xs uppercase tracking-widest text-white">
              {g.nombre}
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
              <FilaPartido key={f.providerId} f={f} />
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
}: {
  favoritos: Favoritos
  onToggleLiga: (leagueProviderId: string) => void
  onToggleEquipo: (equipo: EquipoSeguido) => void
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
                <div>
                  <p className="font-bold text-white text-sm">{liga.name}</p>
                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                    Temporada {liga.season}
                  </p>
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
                <Escudo url={e.badgeUrl} nombre={e.teamName} />
                {e.teamName}
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
              className={`px-3 py-1.5 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
                ligaEquipos === liga.providerId
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
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
                  <Escudo url={t.badgeUrl} nombre={t.name} />
                  <span className="flex-1 font-bold text-white text-sm truncate">
                    {t.name}
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

// ---------- Sección completa --------------------------------------------------

export default function SeccionPartidos() {
  const [vista, setVista] = useState<Vista>('favoritos')
  const [soloEnVivo, setSoloEnVivo] = useState(false)
  const [favoritos, setFavoritos] = useState<Favoritos>(favoritosPorDefecto())
  const [favListos, setFavListos] = useState(false)
  const [ligaPosiciones, setLigaPosiciones] = useState<SupportedLeague>(
    SUPPORTED_LEAGUES[0]
  )

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
        <ListaPartidos
          dias={1}
          soloFavoritos={false}
          soloEnVivo={soloEnVivo}
          favoritos={favoritos}
          onToggleLiga={toggleLiga}
        />
      )}

      {vista === 'favoritos' &&
        (favListos ? (
          <ListaPartidos
            dias={7}
            soloFavoritos
            soloEnVivo={soloEnVivo}
            favoritos={favoritos}
            onToggleLiga={toggleLiga}
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
                className={`px-3.5 py-2 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
                  ligaPosiciones.providerId === liga.providerId
                    ? 'bg-cyan-600 text-white shadow-[0_0_16px_rgba(8,145,178,0.4)]'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
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
        />
      )}
    </div>
  )
}
