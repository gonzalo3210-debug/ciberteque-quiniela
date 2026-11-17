'use client'
// src/components/VistaPartido.tsx
//
// VISTA DEL PARTIDO (rediseño 2026-11-14, referencia 365Scores): se
// abre al tocar cualquier encuentro — en Live, Calendario, la pestaña
// Quiniela, Favoritos y las listas de liga/equipo — con submenús
// Resumen · Posiciones (Enfrentamientos quedó comentada, ver abajo).
//
// - Resumen: encuesta "¿Quién va a ganar?" con porcentajes 1-X-2 de
//   The Odds API (vía /api/encuesta; si ninguna casa cotiza el
//   partido, la encuesta simplemente no aparece), información del
//   juego (fecha/hora America/Mazatlan, torneo con logo, estadio y
//   dónde ver: primero el canal de la quiniela; si no hay, los
//   listados de TV de la API vía /api/tv-partido — endpoint dedicado
//   lookuptv, cobertura parcial, casi nunca de México — con logo y
//   país; y como último respaldo el strTVStation del evento)
//   y los últimos 5 partidos de cada equipo con chip G/E/P.
// - Posiciones: la tabla de la liga del partido marcando a AMBOS
//   equipos (resaltado en conjunto de TablaLiga).
//
// PESTAÑA ENFRENTAMIENTOS — RETIRADA DE MOMENTO (Gonzalo, 2026-11-14):
// buscaba los últimos cruces entre ambos en los calendarios de
// temporada, pero las fuentes actuales solo traen la temporada en
// curso y casi ninguna pareja se ha cruzado antes: la pestaña salía
// vacía casi siempre. Su código (la entrada del submenú, el cálculo
// `cruces` y su bloque de pintado) queda COMENTADO más abajo, listo
// para reactivarse cuando se conecte una API con historial/H2H.
//
// Partidos de la quiniela SIN gemelo en la API (amistosos): la vista
// se abre con los datos de la app (fecha, canal) y trata de resolver
// cada equipo por nombre en el catálogo (/api/buscar) para traer sus
// últimos partidos; lo que no exista se omite. Nunca truena.

import { useEffect, useMemo, useState } from 'react'
import type { FixtureTVListing, SportsFixture } from '@/lib/sports/types'
import { getSupportedLeague } from '@/lib/sports/leagues'
import { nombreEquipoES } from '@/lib/sports/nombresES'
import { nombrePaisES } from '@/lib/sports/tvListados'
import { esMismoEquipo } from '@/lib/emparejar'
import {
  fechaEnMazatlan,
  horaEnMazatlan,
  etiquetaFechaLarga,
} from '@/lib/fechaMazatlan'
import TablaLiga, { type EquipoResaltado } from './TablaLiga'
import { Escudo, LogoLiga, type EquipoTocable } from './partidosUI'
// FilaPartido solo la usaba la pestaña Enfrentamientos (comentada):
// import { FilaPartido } from './partidosUI'

/** Datos con los que se abre la vista, vengan de un fixture de la API
 *  o de un partido de la quiniela (con o sin gemelo). */
export interface PartidoVistaDatos {
  homeTeam: string
  awayTeam: string
  homeTeamProviderId: string | null
  awayTeamProviderId: string | null
  homeBadgeUrl: string | null
  awayBadgeUrl: string | null
  leagueProviderId: string | null
  leagueName: string | null
  kickoffIso: string | null
  status: SportsFixture['status']
  statusRaw: string | null
  progress: string | null
  homeScore: number | null
  awayScore: number | null
  venue: string | null
  tvStation: string | null
  canal: string | null
  fixtureId: string | null
}

export function datosDesdeFixture(f: SportsFixture): PartidoVistaDatos {
  const liga = getSupportedLeague(f.leagueProviderId)
  return {
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    homeTeamProviderId: f.homeTeamProviderId,
    awayTeamProviderId: f.awayTeamProviderId,
    homeBadgeUrl: f.homeBadgeUrl,
    awayBadgeUrl: f.awayBadgeUrl,
    leagueProviderId: f.leagueProviderId || null,
    leagueName: liga?.name ?? null,
    kickoffIso: f.kickoffUtc,
    status: f.status,
    statusRaw: f.statusRaw,
    progress: f.progress,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    venue: f.venue,
    tvStation: f.tvStation,
    canal: null,
    fixtureId: f.providerId,
  }
}

interface EquipoResuelto {
  leagueProviderId: string
  teamProviderId: string
  badgeUrl: string | null
}

/** Tope de transmisiones de la API que se pintan en "Dónde ver"
 *  (un partido europeo puede traer decenas; el resto se resume). */
const MAX_TV_VISIBLES = 8

type SubVista = 'resumen' | 'enfrentamientos' | 'posiciones'

interface EncuestaResp {
  porcentajes: { local: number; empate: number; visitante: number } | null
  casas: number
}

/** ¿El equipo juega este fixture y de qué lado? Por ID o por nombre. */
function ladoDelEquipo(
  f: SportsFixture,
  nombre: string,
  teamProviderId: string | null
): 'local' | 'visita' | null {
  if (teamProviderId && f.homeTeamProviderId === teamProviderId) return 'local'
  if (teamProviderId && f.awayTeamProviderId === teamProviderId) return 'visita'
  if (esMismoEquipo(nombre, f.homeTeam, f.homeTeamProviderId)) return 'local'
  if (esMismoEquipo(nombre, f.awayTeam, f.awayTeamProviderId)) return 'visita'
  return null
}

function chipResultado(
  f: SportsFixture,
  lado: 'local' | 'visita'
): { letra: string; clase: string } {
  const propios = lado === 'local' ? f.homeScore : f.awayScore
  const rivales = lado === 'local' ? f.awayScore : f.homeScore
  if (propios === null || rivales === null)
    return { letra: '–', clase: 'bg-slate-700/40 border-slate-600 text-slate-400' }
  if (propios > rivales)
    return { letra: 'G', clase: 'bg-green-600/20 border-green-500/50 text-green-400' }
  if (propios < rivales)
    return { letra: 'P', clase: 'bg-red-600/20 border-red-500/50 text-red-400' }
  return { letra: 'E', clase: 'bg-amber-500/15 border-amber-500/50 text-amber-400' }
}

/** Renglón compacto de un partido ya jugado, con chip desde la óptica
 *  del equipo indicado. */
function FilaUltimo({
  f,
  nombreEquipo,
  teamProviderId,
}: {
  f: SportsFixture
  nombreEquipo: string
  teamProviderId: string | null
}) {
  const lado = ladoDelEquipo(f, nombreEquipo, teamProviderId)
  if (!lado) return null
  const chip = chipResultado(f, lado)
  const fecha = f.kickoffUtc
    ? etiquetaFechaLarga(fechaEnMazatlan(f.kickoffUtc))
    : null
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 last:border-b-0">
      <span
        className={`w-6 h-6 shrink-0 rounded-md border text-[11px] font-black flex items-center justify-center ${chip.clase}`}
      >
        {chip.letra}
      </span>
      <div className="flex-1 flex items-center justify-end min-w-0 gap-2">
        <span className="font-bold text-white text-sm truncate">
          {nombreEquipoES(f.homeTeam, f.homeTeamProviderId)}
        </span>
        <Escudo url={f.homeBadgeUrl} nombre={f.homeTeam} />
      </div>
      <div className="w-[64px] shrink-0 text-center">
        <div className="font-black text-slate-200 text-sm leading-none">
          {f.homeScore ?? 0} - {f.awayScore ?? 0}
        </div>
        {fecha && (
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate">
            {fecha}
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center min-w-0 gap-2">
        <Escudo url={f.awayBadgeUrl} nombre={f.awayTeam} />
        <span className="font-bold text-white text-sm truncate">
          {nombreEquipoES(f.awayTeam, f.awayTeamProviderId)}
        </span>
      </div>
    </div>
  )
}

export default function VistaPartido({
  datos,
  logoLiga,
  onVolver,
  onVerEquipo,
  onVerLiga,
}: {
  datos: PartidoVistaDatos
  logoLiga: string | null
  onVolver: () => void
  onVerEquipo: EquipoTocable
  onVerLiga: (leagueProviderId: string) => void
}) {
  const [sub, setSub] = useState<SubVista>('resumen')
  const [encuesta, setEncuesta] = useState<EncuestaResp | null>(null)
  const [tvApi, setTvApi] = useState<FixtureTVListing[]>([])
  const [pool, setPool] = useState<SportsFixture[]>([])
  const [resLocal, setResLocal] = useState<EquipoResuelto | null>(null)
  const [resVisita, setResVisita] = useState<EquipoResuelto | null>(null)
  const [cargandoPool, setCargandoPool] = useState(true)

  const liga = datos.leagueProviderId
    ? getSupportedLeague(datos.leagueProviderId)
    : undefined
  const nombreLocalES = nombreEquipoES(datos.homeTeam, datos.homeTeamProviderId)
  const nombreVisitaES = nombreEquipoES(datos.awayTeam, datos.awayTeamProviderId)

  // ----- Encuesta (The Odds API vía servidor; null = no aparece) -----
  useEffect(() => {
    let vivo = true
    setEncuesta(null)
    if (datos.status === 'finished' || datos.status === 'postponed') return
    const params = new URLSearchParams({
      local: datos.homeTeam,
      visitante: datos.awayTeam,
    })
    if (datos.leagueProviderId) params.set('liga', datos.leagueProviderId)
    if (datos.kickoffIso) params.set('fecha', datos.kickoffIso)
    fetch(`/api/encuesta?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (vivo) setEncuesta(j as EncuestaResp)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [datos])

  // ----- Dónde ver según la API (respaldo del canal propio) --------
  // El canal de la quiniela manda siempre: si existe, ni se pide.
  // Sin enlace con la API (fixtureId null) tampoco hay qué pedir.
  // Cobertura parcial: lo normal es que llegue la lista vacía.
  useEffect(() => {
    let vivo = true
    setTvApi([])
    if (datos.canal || !datos.fixtureId) return
    fetch(`/api/tv-partido?fixture=${encodeURIComponent(datos.fixtureId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (vivo) setTvApi((j.listings || []) as FixtureTVListing[])
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [datos.fixtureId, datos.canal])

  // ----- Resolución de equipos y pool de fixtures --------------------
  // Con liga + IDs (fixture de la API) basta el calendario de esa liga.
  // Sin gemelo (amistoso de la quiniela), cada equipo se busca por
  // nombre en el catálogo y se trae el calendario de SU liga.
  useEffect(() => {
    let vivo = true
    setCargandoPool(true)
    setPool([])
    const resolver = async (
      nombre: string,
      teamProviderId: string | null
    ): Promise<EquipoResuelto | null> => {
      if (teamProviderId && datos.leagueProviderId) {
        return {
          leagueProviderId: datos.leagueProviderId,
          teamProviderId,
          badgeUrl: null,
        }
      }
      try {
        const r = await fetch(
          `/api/buscar?q=${encodeURIComponent(nombre)}`
        ).then((x) => x.json())
        const eq = (r.equipos || []).find(
          (e: { teamName: string; teamProviderId: string }) =>
            esMismoEquipo(nombre, e.teamName, e.teamProviderId)
        )
        return eq
          ? {
              leagueProviderId: eq.leagueProviderId,
              teamProviderId: eq.teamProviderId,
              badgeUrl: eq.badgeUrl,
            }
          : null
      } catch {
        return null
      }
    }
    ;(async () => {
      const [rl, rv] = await Promise.all([
        resolver(datos.homeTeam, datos.homeTeamProviderId),
        resolver(datos.awayTeam, datos.awayTeamProviderId),
      ])
      if (!vivo) return
      setResLocal(rl)
      setResVisita(rv)
      const ligas = new Set<string>()
      if (datos.leagueProviderId) ligas.add(datos.leagueProviderId)
      if (rl) ligas.add(rl.leagueProviderId)
      if (rv) ligas.add(rv.leagueProviderId)
      const listas = await Promise.all(
        Array.from(ligas).map(async (id) => {
          try {
            const j = await fetch(`/api/partidos?liga=${id}`).then((x) =>
              x.json()
            )
            return (j.fixtures || []) as SportsFixture[]
          } catch {
            return [] as SportsFixture[]
          }
        })
      )
      if (!vivo) return
      const vistos = new Set<string>()
      const unidos: SportsFixture[] = []
      for (const f of listas.flat()) {
        if (vistos.has(f.providerId)) continue
        vistos.add(f.providerId)
        unidos.push(f)
      }
      setPool(unidos)
      setCargandoPool(false)
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.fixtureId, datos.homeTeam, datos.awayTeam])

  const idLocal = datos.homeTeamProviderId || resLocal?.teamProviderId || null
  const idVisita = datos.awayTeamProviderId || resVisita?.teamProviderId || null
  const ligaLocal = datos.leagueProviderId || resLocal?.leagueProviderId || ''
  const ligaVisita = datos.leagueProviderId || resVisita?.leagueProviderId || ''

  const ultimos = useMemo(() => {
    const deEquipo = (nombre: string, tid: string | null) =>
      pool
        .filter(
          (f) =>
            f.status === 'finished' &&
            f.providerId !== datos.fixtureId &&
            ladoDelEquipo(f, nombre, tid) !== null
        )
        .sort((a, b) => (b.kickoffUtc || '').localeCompare(a.kickoffUtc || ''))
        .slice(0, 5)
    return {
      local: deEquipo(datos.homeTeam, idLocal),
      visita: deEquipo(datos.awayTeam, idVisita),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, datos.fixtureId])

  // --- Enfrentamientos (COMENTADO 2026-11-14, ver nota del encabezado):
  // últimos cruces entre ambos dentro del pool de la temporada.
  // const cruces = useMemo(
  //   () =>
  //     pool
  //       .filter(
  //         (f) =>
  //           f.status === 'finished' &&
  //           f.providerId !== datos.fixtureId &&
  //           ladoDelEquipo(f, datos.homeTeam, idLocal) !== null &&
  //           ladoDelEquipo(f, datos.awayTeam, idVisita) !== null
  //       )
  //       .sort((a, b) => (b.kickoffUtc || '').localeCompare(a.kickoffUtc || ''))
  //       .slice(0, 5),
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //   [pool, datos.fixtureId]
  // )

  const fechaLarga = datos.kickoffIso
    ? etiquetaFechaLarga(fechaEnMazatlan(datos.kickoffIso))
    : null
  const hora = datos.kickoffIso ? horaEnMazatlan(datos.kickoffIso) : null
  // "Dónde ver": canal de la quiniela > listados TV de la API >
  // strTVStation del evento (casi nunca viene).
  const hayDondeVer =
    Boolean(datos.canal) || tvApi.length > 0 || Boolean(datos.tvStation)
  const resaltados: EquipoResaltado[] = [
    { teamProviderId: idLocal || '', teamName: datos.homeTeam },
    { teamProviderId: idVisita || '', teamName: datos.awayTeam },
  ]

  const bloqueEquipo = (
    nombre: string,
    nombreES: string,
    escudo: string | null,
    teamProviderId: string | null,
    leagueProviderId: string,
    esLocal: boolean
  ) => {
    const contenido = (
      <>
        <div className="w-14 h-14 flex items-center justify-center">
          {escudo ? (
            <img src={escudo} alt={nombreES} className="w-14 h-14 object-contain" />
          ) : (
            <span className="w-14 h-14 rounded-xl bg-slate-800 inline-block" />
          )}
        </div>
        <span className="font-black text-white text-sm text-center leading-tight mt-2">
          {nombreES}
        </span>
      </>
    )
    if (teamProviderId && leagueProviderId) {
      return (
        <button
          onClick={() =>
            onVerEquipo({
              leagueProviderId,
              teamProviderId,
              teamName: nombre,
              badgeUrl: escudo,
            })
          }
          title={`Ver ${nombreES}`}
          className="flex-1 flex flex-col items-center min-w-0 hover:opacity-75 transition-opacity"
        >
          {contenido}
        </button>
      )
    }
    return (
      <div className="flex-1 flex flex-col items-center min-w-0">{contenido}</div>
    )
  }

  const barraEncuesta = (
    etiqueta: string,
    pct: number,
    activa: boolean
  ) => (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-right text-xs font-bold text-slate-300 truncate">
        {etiqueta}
      </span>
      <div className="flex-1 h-3.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${activa ? 'bg-cyan-500' : 'bg-slate-600'}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-sm font-black text-white">
        {pct.toFixed(0)}%
      </span>
    </div>
  )

  return (
    <div className="w-full max-w-3xl animate-in fade-in duration-500">
      <button
        onClick={onVolver}
        className="text-cyan-400 hover:text-cyan-300 text-xs font-black uppercase tracking-widest mb-4"
      >
        ← Volver
      </button>

      {/* Encabezado: torneo (abre la liga), equipos (abren su página) y marcador */}
      <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl px-4 py-5">
        {liga ? (
          <button
            onClick={() => onVerLiga(liga.providerId)}
            className="flex items-center justify-center gap-2 mx-auto hover:opacity-75 transition-opacity"
            title={`Ver ${liga.name}`}
          >
            <LogoLiga url={logoLiga} nombre={liga.name} className="w-6 h-6" />
            <span className="text-slate-300 text-xs font-black uppercase tracking-widest">
              {liga.name}
            </span>
          </button>
        ) : datos.leagueName ? (
          <p className="text-center text-slate-300 text-xs font-black uppercase tracking-widest">
            {datos.leagueName}
          </p>
        ) : null}

        <div className="flex items-start gap-2 mt-4">
          {bloqueEquipo(datos.homeTeam, nombreLocalES, datos.homeBadgeUrl || resLocal?.badgeUrl || null, idLocal, ligaLocal, true)}
          <div className="w-[110px] shrink-0 text-center pt-3">
            {datos.status === 'live' ? (
              <>
                <div className="font-black text-white text-3xl leading-none">
                  {datos.homeScore ?? 0} - {datos.awayScore ?? 0}
                </div>
                <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/50 text-red-400 text-[10px] font-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {datos.statusRaw === 'HT'
                    ? 'MT'
                    : datos.progress
                      ? `${datos.progress}'`
                      : 'EN VIVO'}
                </span>
              </>
            ) : datos.status === 'finished' ? (
              <>
                <div className="font-black text-slate-100 text-3xl leading-none">
                  {datos.homeScore ?? 0} - {datos.awayScore ?? 0}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-2">
                  Final
                </div>
              </>
            ) : datos.status === 'postponed' ? (
              <div className="text-xs font-black uppercase tracking-widest text-amber-400 pt-2">
                Pospuesto
              </div>
            ) : (
              <>
                <div className="font-black text-cyan-300 text-2xl leading-none">
                  {hora || '—'}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-2">
                  {fechaLarga || ''}
                </div>
              </>
            )}
          </div>
          {bloqueEquipo(datos.awayTeam, nombreVisitaES, datos.awayBadgeUrl || resVisita?.badgeUrl || null, idVisita, ligaVisita, false)}
        </div>
      </div>

      {/* Submenús */}
      <div className="flex gap-1.5 mt-4 bg-slate-900 border border-slate-800 rounded-xl p-1.5 overflow-x-auto">
        {(
          [
            ['resumen', 'Resumen'],
            // ['enfrentamientos', 'Enfrentamientos'], // retirada de
            // momento (2026-11-14): sin historial entre parejas en las
            // fuentes actuales; vuelve con una API con H2H.
            ['posiciones', 'Posiciones'],
          ] as [SubVista, string][]
        ).map(([id, etiqueta]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              sub === id
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {sub === 'resumen' && (
        <div className="flex flex-col gap-4 mt-4">
          {encuesta?.porcentajes && (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl p-4">
              <h4 className="font-black text-sm uppercase tracking-widest text-white mb-1">
                🗳️ ¿Quién va a ganar?
              </h4>
              <p className="text-slate-500 text-[11px] font-medium mb-3">
                Según las cuotas de {encuesta.casas} casas de apuestas
                (The Odds API).
              </p>
              <div className="flex flex-col gap-2.5">
                {barraEncuesta(nombreLocalES, encuesta.porcentajes.local, encuesta.porcentajes.local >= encuesta.porcentajes.visitante && encuesta.porcentajes.local >= encuesta.porcentajes.empate)}
                {barraEncuesta('Empate', encuesta.porcentajes.empate, encuesta.porcentajes.empate > encuesta.porcentajes.local && encuesta.porcentajes.empate > encuesta.porcentajes.visitante)}
                {barraEncuesta(nombreVisitaES, encuesta.porcentajes.visitante, encuesta.porcentajes.visitante > encuesta.porcentajes.local && encuesta.porcentajes.visitante >= encuesta.porcentajes.empate)}
              </div>
            </div>
          )}

          <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl p-4">
            <h4 className="font-black text-sm uppercase tracking-widest text-white mb-3">
              ℹ️ Información del juego
            </h4>
            <dl className="flex flex-col gap-2 text-sm">
              {fechaLarga && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 font-bold">Fecha</dt>
                  <dd className="text-white font-bold text-right">
                    {fechaLarga}
                    {hora ? ` · ${hora}` : ''}
                  </dd>
                </div>
              )}
              {(liga || datos.leagueName) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 font-bold">Torneo</dt>
                  <dd className="text-white font-bold text-right">
                    {liga?.name || datos.leagueName}
                  </dd>
                </div>
              )}
              {datos.venue && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 font-bold">Estadio</dt>
                  <dd className="text-white font-bold text-right">{datos.venue}</dd>
                </div>
              )}
              {datos.canal ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 font-bold">Dónde ver</dt>
                  <dd className="text-white font-bold text-right">{datos.canal}</dd>
                </div>
              ) : tvApi.length > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 font-bold shrink-0">Dónde ver</dt>
                  <dd>
                    <ul className="flex flex-col gap-1.5">
                      {tvApi.slice(0, MAX_TV_VISIBLES).map((t, i) => (
                        <li
                          key={`${t.channel}|${t.country || ''}|${i}`}
                          className="flex items-center gap-2 justify-end"
                        >
                          {t.logoUrl && (
                            <img
                              src={t.logoUrl}
                              alt=""
                              className="w-5 h-5 object-contain shrink-0"
                            />
                          )}
                          <span className="text-white font-bold text-right">
                            {t.channel}
                            {nombrePaisES(t.country) && (
                              <span className="text-slate-400">
                                {' '}
                                · {nombrePaisES(t.country)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {tvApi.length > MAX_TV_VISIBLES && (
                      <p className="text-slate-500 text-xs font-bold text-right mt-1">
                        +{tvApi.length - MAX_TV_VISIBLES} transmisiones más
                        según la API
                      </p>
                    )}
                  </dd>
                </div>
              ) : datos.tvStation ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 font-bold">Dónde ver</dt>
                  <dd className="text-white font-bold text-right">{datos.tvStation}</dd>
                </div>
              ) : null}
              {!fechaLarga && !datos.venue && !hayDondeVer && (
                <p className="text-slate-500 text-sm font-medium">
                  Sin datos adicionales de este partido por ahora.
                </p>
              )}
            </dl>
          </div>

          {cargandoPool ? (
            <p className="text-slate-500 text-sm font-bold text-center py-4">
              Cargando últimos partidos…
            </p>
          ) : (
            <>
              {[
                { nombre: datos.homeTeam, nombreES: nombreLocalES, tid: idLocal, lista: ultimos.local },
                { nombre: datos.awayTeam, nombreES: nombreVisitaES, tid: idVisita, lista: ultimos.visita },
              ].map((b) =>
                b.lista.length > 0 ? (
                  <div
                    key={b.nombre}
                    className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden"
                  >
                    <h4 className="px-4 pt-3.5 pb-1 font-black text-sm uppercase tracking-widest text-white">
                      Últimos partidos · {b.nombreES}
                    </h4>
                    {b.lista.map((f) => (
                      <FilaUltimo
                        key={f.providerId}
                        f={f}
                        nombreEquipo={b.nombre}
                        teamProviderId={b.tid}
                      />
                    ))}
                  </div>
                ) : null
              )}
              {ultimos.local.length === 0 && ultimos.visita.length === 0 && (
                <p className="text-slate-500 text-sm font-medium text-center py-2">
                  Aún no hay partidos recientes de estos equipos en los
                  datos de la sección.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Pestaña Enfrentamientos COMENTADA (2026-11-14): ver la nota
          del encabezado. Se reactiva junto con `cruces` y la entrada
          del submenú cuando haya una API con historial/H2H.
      {sub === 'enfrentamientos' && (
        <div className="mt-4 bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          {cargandoPool ? (
            <p className="text-slate-500 text-sm font-bold text-center py-6">
              Buscando cruces entre ambos…
            </p>
          ) : cruces.length > 0 ? (
            <>
              <h4 className="px-4 pt-3.5 pb-1 font-black text-sm uppercase tracking-widest text-white">
                Últimos cruces entre ambos
              </h4>
              {cruces.map((f) => (
                <FilaPartido key={f.providerId} f={f} />
              ))}
            </>
          ) : (
            <p className="text-slate-400 text-sm font-medium text-center py-6 px-4">
              No se encontraron partidos anteriores entre {nombreLocalES} y{' '}
              {nombreVisitaES} en los datos disponibles de la sección.
            </p>
          )}
        </div>
      )}
      */}

      {sub === 'posiciones' && (
        <div className="mt-4">
          {liga ? (
            <TablaLiga liga={liga} equiposResaltados={resaltados} onVerEquipo={onVerEquipo} />
          ) : (
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl p-6 text-center">
              <p className="text-slate-400 text-sm font-medium">
                Este partido no pertenece a una liga con tabla en la
                sección, así que no hay posiciones que mostrar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
