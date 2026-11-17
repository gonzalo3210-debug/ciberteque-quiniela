'use client'
// src/components/SeccionNoticias.tsx
//
// Sección "📰 Noticias" (definición de Gonzalo, 2026-11-14): vive en
// el submenú de la sección Quiniela y es UN solo feed que mezcla:
//
//   🏟️ DEL CLUB — novedades generadas de los datos de la app
//       (lib/noticiasClub.ts): jornada nueva, cierre próximo, finales
//       con marcador, quién va ganando y el ganador al liquidar.
//   ⚽ DE LOS EQUIPOS — titulares de medios deportivos en español
//       (RSS público vía /api/noticias-externas) que mencionan a los
//       equipos de la jornada o a los favoritos del jugador.
//   📰 DEPORTES — los demás titulares de las fuentes: fútbol general
//       y otros deportes.
//
// Arriba van los CHIPS de filtro (corrección de Gonzalo, 2026-11-14):
// Todos · 🎯 Quiniela · ⚽ Equipos · 📰 Deportes. La clasificación la
// hace el servidor (la ruta marca cada titular con su categoría), así
// que cambiar de chip filtra al momento, sin volver a pedir nada.
// El chip ⚡ Minuto a minuto (2026-11-17) es aparte: no mezcla
// titulares, lista los eventos importantes (goles, penales y
// expulsiones) de los partidos de la quiniela activa, del más
// reciente al más viejo, desde la línea de tiempo del proveedor.
//
// Si la fuente externa falla, el feed muestra solo las del club.
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  obtenerDatosAnidadosPosiciones,
  obtenerCatalogoUsuarios,
} from '@/lib/queries'
import {
  generarNoticiasClub,
  type NoticiaClub,
} from '@/lib/noticiasClub'
import { useJornadaActual } from '@/hooks/useJornadaActual'
import { leerFavoritos } from '@/lib/favoritos'
import {
  emparejarPartidosJornada,
  ventanaDeJornada,
} from '@/lib/emparejar'
import type { SportsFixture } from '@/lib/sports/types'
import { nombreEquipoES } from '@/lib/sports/nombresES'
import {
  fechaCortaEnMazatlan,
  horaEnMazatlan,
} from '@/lib/fechaMazatlan'

interface NoticiaExterna {
  titulo: string
  enlace: string
  fechaISO: string | null
  medio: string
  equipos: string[]
  /** Chip al que pertenece, clasificado por el servidor. */
  categoria: 'equipos' | 'deportes'
}

type ChipNoticias = 'todos' | 'quiniela' | 'equipos' | 'deportes' | 'minuto'

const CHIPS: { id: ChipNoticias; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'quiniela', etiqueta: '🎯 Quiniela' },
  { id: 'equipos', etiqueta: '⚽ Equipos' },
  { id: 'deportes', etiqueta: '📰 Deportes' },
  { id: 'minuto', etiqueta: '⚡ Minuto a minuto' },
]

// ── ⚡ Minuto a minuto ──────────────────────────────────────────────
// Eventos importantes de los partidos de la quiniela activa, desde la
// línea de tiempo del proveedor (/api/eventos-partido). Solo entran
// goles, penales y expulsiones: las amarillas y los cambios se quedan
// fuera a propósito (demasiado ruido para un feed de noticias). La
// línea se lee fresca en cada carga, así que un gol anulado por el
// VAR desaparece solo, igual que el marcador se corrige solo.

/** Evento ya clasificado, tal como lo devuelve /api/eventos-partido. */
interface EventoPartido {
  minute: number | null
  minuteLabel: string
  type: string
  player: string | null
  assist: string | null
  teamName: string | null
  side: 'home' | 'away' | null
  comment: string | null
  marcadorTrasGol: { local: number; visita: number } | null
}

const TIPOS_MINUTO = new Set([
  'gol',
  'gol_penal',
  'autogol',
  'penal_fallado',
  'roja',
  'gol_anulado',
])

const ICONO_MINUTO: Record<string, string> = {
  gol: '⚽',
  gol_penal: '🥅',
  autogol: '⚽',
  penal_fallado: '🧤',
  roja: '🟥',
  gol_anulado: '🚫',
}

/** Un evento importante listo para pintarse como tarjeta del feed. */
interface EventoMinuto {
  id: string
  icono: string
  titulo: string
  detalle: string
  minutoLabel: string
  /** Instante aproximado (inicio del partido + minuto) para ordenar. */
  orden: number
}

/** Convierte la respuesta de la ruta en tarjetas, de la más reciente
 *  a la más vieja. */
function eventosMinutoDesdeRespuesta(matches: any[]): EventoMinuto[] {
  const items: EventoMinuto[] = []
  for (const m of matches || []) {
    const f: SportsFixture = m.fixture
    if (!f) continue
    const localES = nombreEquipoES(f.homeTeam, f.homeTeamProviderId)
    const visitaES = nombreEquipoES(f.awayTeam, f.awayTeamProviderId)
    const marcadorActual =
      f.homeScore !== null && f.awayScore !== null
        ? `${f.homeScore} - ${f.awayScore}`
        : 'vs'
    const lineaPartido = `${localES} ${marcadorActual} ${visitaES}`
    const inicio = f.kickoffUtc ? Date.parse(f.kickoffUtc) : 0
    ;(m.eventos || []).forEach((e: EventoPartido, idx: number) => {
      if (!TIPOS_MINUTO.has(e.type)) return
      const jugador = e.player || 'Un jugador'
      const trasGol = e.marcadorTrasGol
        ? `${localES} ${e.marcadorTrasGol.local} - ${e.marcadorTrasGol.visita} ${visitaES} tras el gol`
        : lineaPartido
      let titulo = ''
      let detalle = lineaPartido
      if (e.type === 'gol') {
        titulo = `¡Gol de ${jugador}!`
        detalle = e.assist
          ? `${trasGol} · Asistencia de ${e.assist}`
          : trasGol
      } else if (e.type === 'gol_penal') {
        titulo = `¡Gol de penal de ${jugador}!`
        detalle = trasGol
      } else if (e.type === 'autogol') {
        titulo = `Autogol de ${jugador}`
        detalle = trasGol
      } else if (e.type === 'penal_fallado') {
        titulo = `Penal fallado por ${jugador}`
      } else if (e.type === 'roja') {
        titulo = `Expulsión de ${jugador}`
        if (e.comment) detalle = `${lineaPartido} · Motivo: ${e.comment}`
      } else if (e.type === 'gol_anulado') {
        titulo = `Gol anulado por el VAR a ${jugador}`
      }
      items.push({
        id: `${f.providerId}-${idx}-${e.type}-${e.minuteLabel}-${e.player || ''}`,
        icono: ICONO_MINUTO[e.type] || '⚡',
        titulo,
        detalle,
        minutoLabel: e.minuteLabel || (e.minute !== null ? `${e.minute}` : ''),
        orden: inicio + (e.minute ?? 0) * 60_000,
      })
    })
  }
  items.sort((a, b) => b.orden - a.orden)
  return items
}

type ItemFeed =
  | { tipo: 'club'; fechaISO: string; club: NoticiaClub }
  | { tipo: 'externa'; fechaISO: string; externa: NoticiaExterna }

const REFRESCO_MS = 120_000 // 2 minutos

function fechaLegible(iso: string | null): string {
  if (!iso) return ''
  try {
    return `${fechaCortaEnMazatlan(iso)} · ${horaEnMazatlan(iso)}`
  } catch {
    return ''
  }
}

function rolDesdeSesion(): string | undefined {
  try {
    const raw = localStorage.getItem('club_pronosticos_usuario')
    if (!raw) return undefined
    return JSON.parse(raw)?.rol
  } catch {
    return undefined
  }
}

export default function SeccionNoticias() {
  const [delClub, setDelClub] = useState<NoticiaClub[] | null>(null)
  const [errorClub, setErrorClub] = useState<string | null>(null)
  const [externas, setExternas] = useState<NoticiaExterna[] | null>(null)
  const [externasFallaron, setExternasFallaron] = useState(false)
  const [chip, setChip] = useState<ChipNoticias>('todos')
  const [minuto, setMinuto] = useState<EventoMinuto[] | null>(null)

  const { seleccionada } = useJornadaActual()

  // Equipos de los que se buscan titulares: los de la jornada del
  // Club + los favoritos del jugador (guardados en este dispositivo).
  const equiposClave = useMemo(() => {
    const nombres = new Set<string>()
    for (const p of seleccionada?.partidos || []) {
      if (p.equipo_local) nombres.add(p.equipo_local)
      if (p.equipo_visitante) nombres.add(p.equipo_visitante)
    }
    for (const e of leerFavoritos().equipos) nombres.add(e.teamName)
    return [...nombres].join(',')
  }, [seleccionada])

  const cargarClub = useCallback(async () => {
    try {
      const [qRes, uRes] = await Promise.all([
        obtenerDatosAnidadosPosiciones(rolDesdeSesion(), 8),
        obtenerCatalogoUsuarios(),
      ])
      if (qRes.error) throw qRes.error
      const mapa: Record<string, { nombre: string }> = {}
      for (const u of uRes.data || []) mapa[u.id] = { nombre: u.nombre }
      setDelClub(generarNoticiasClub(qRes.data || [], mapa))
      setErrorClub(null)
    } catch (e) {
      console.error('SeccionNoticias (club):', e)
      setDelClub((prev) => {
        if (!prev) setErrorClub('No se pudieron cargar las noticias del club.')
        return prev
      })
    }
  }, [])

  const cargarExternas = useCallback(async () => {
    // Aunque no haya jornada ni favoritos, se pide igual: la ruta
    // devuelve los titulares generales para el chip 📰 Deportes.
    try {
      const qs = equiposClave
        ? `?equipos=${encodeURIComponent(equiposClave)}`
        : ''
      const res = await fetch(`/api/noticias-externas${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error')
      setExternas(data.noticias || [])
      setExternasFallaron(false)
    } catch {
      // Sin fuente externa: el feed sigue solo con las del club.
      setExternas((prev) => prev ?? [])
      setExternasFallaron(true)
    }
  }, [equiposClave])

  useEffect(() => {
    cargarClub()
    const id = setInterval(cargarClub, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargarClub])

  useEffect(() => {
    cargarExternas()
    const id = setInterval(cargarExternas, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargarExternas])

  // ⚡ Minuto a minuto: los partidos de la quiniela activa se enlazan
  // por su api_fixture_id; los que no lo traen (jornadas hechas a
  // mano) se emparejan con los fixtures de la API por equipos y fecha,
  // como hace la pestaña 🎯 Quiniela. Sin enlace no hay eventos: ese
  // partido simplemente no aporta al feed.
  const partidosJornada = useMemo(
    () => seleccionada?.partidos || [],
    [seleccionada]
  )
  const firmaPartidos = useMemo(
    () =>
      partidosJornada
        .map((p: any) => `${p.id}:${p.api_fixture_id || ''}`)
        .join(';'),
    [partidosJornada]
  )

  const cargarMinuto = useCallback(async () => {
    try {
      if (partidosJornada.length === 0) {
        setMinuto([])
        return
      }
      const idsPorPartido = new Map<string, string>()
      for (const p of partidosJornada as any[]) {
        if (p.api_fixture_id) idsPorPartido.set(p.id, String(p.api_fixture_id))
      }
      if (idsPorPartido.size < partidosJornada.length) {
        const ventana = ventanaDeJornada(partidosJornada)
        if (ventana) {
          try {
            const res = await fetch(
              `/api/partidos?desde=${ventana.desde}&hasta=${ventana.hasta}`
            )
            const data = await res.json()
            if (res.ok) {
              const todos: SportsFixture[] = []
              for (const g of data.groups || []) {
                todos.push(...(g.fixtures || []))
              }
              const parejas = emparejarPartidosJornada(partidosJornada, todos)
              for (const [partidoId, fixture] of parejas) {
                if (!idsPorPartido.has(partidoId)) {
                  idsPorPartido.set(partidoId, fixture.providerId)
                }
              }
            }
          } catch {
            // Sin emparejar: van solo los que traen enlace directo.
          }
        }
      }
      const fixtureIds = [...new Set(idsPorPartido.values())].slice(0, 12)
      if (fixtureIds.length === 0) {
        setMinuto([])
        return
      }
      const res = await fetch(
        `/api/eventos-partido?fixtures=${fixtureIds.join(',')}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error')
      setMinuto(eventosMinutoDesdeRespuesta(data.matches || []))
    } catch {
      // Sin eventos por ahora: se conserva lo último que se vio.
      setMinuto((prev) => prev ?? [])
    }
    // firmaPartidos resume los partidos y sus enlaces; partidosJornada
    // cambia de identidad en cada refresco del hook y no debe
    // disparar cargas extra por sí solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaPartidos])

  useEffect(() => {
    cargarMinuto()
    const id = setInterval(cargarMinuto, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargarMinuto])

  const feed = useMemo<ItemFeed[]>(() => {
    const items: ItemFeed[] = []
    // Chip 🎯 Quiniela: SOLO las del club. Chip Todos: todo mezclado.
    if (chip === 'todos' || chip === 'quiniela') {
      for (const club of delClub || []) {
        items.push({ tipo: 'club', fechaISO: club.fechaISO, club })
      }
    }
    if (chip !== 'quiniela') {
      for (const externa of externas || []) {
        // Sin categoría (respaldo ante una respuesta vieja en caché):
        // si trae equipos emparejados es de Equipos; si no, de Deportes.
        const categoria =
          externa.categoria ||
          (externa.equipos.length > 0 ? 'equipos' : 'deportes')
        if (chip !== 'todos' && categoria !== chip) continue
        items.push({
          tipo: 'externa',
          fechaISO: externa.fechaISO || '',
          externa,
        })
      }
    }
    items.sort((a, b) => b.fechaISO.localeCompare(a.fechaISO))
    return items.slice(0, 40)
  }, [delClub, externas, chip])

  const textoVacio =
    chip === 'quiniela'
      ? 'Todavía no hay novedades del club. Cuando se abra una jornada y empiecen los partidos, aquí salen los finales, el líder y el ganador.'
      : chip === 'equipos'
        ? 'Ahorita no hay titulares de los equipos de la jornada ni de tus favoritos. Prueba el chip 📰 Deportes para ver el resto del día.'
        : chip === 'deportes'
          ? 'Ahorita no llegaron titulares generales de deportes. Vuelve en un rato.'
          : 'Todavía no hay noticias. Cuando haya jornada y jueguen tus equipos, aquí se juntan las novedades.'

  return (
    <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in duration-500">
      <div className="text-center mb-5">
        <h2 className="text-3xl font-black tracking-tight text-white">
          📰 NOTICIAS
        </h2>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
          Del club, de tus equipos y del deporte
        </p>
      </div>

      {/* ── Chips de filtro: filtran lo ya cargado, sin re-pedir ── */}
      <div className="flex gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full mb-4 overflow-x-auto">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChip(c.id)}
            className={`flex-1 shrink-0 whitespace-nowrap px-3 py-2.5 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest transition-all ${
              chip === c.id
                ? 'bg-sky-600 text-white shadow-[0_0_18px_rgba(2,132,199,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {c.etiqueta}
          </button>
        ))}
      </div>

      {chip === 'minuto' ? (
        minuto === null ? (
          <div className="text-cyan-400 font-bold animate-pulse py-20">
            Cargando el minuto a minuto...
          </div>
        ) : minuto.length === 0 ? (
          <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-4xl mb-3">⚡</p>
            <p className="text-slate-300 font-bold">
              Todavía no hay eventos importantes de los partidos de la
              quiniela. Cuando caiga un gol, un penal o una expulsión,
              aquí aparecen conforme pasan.
            </p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-3">
            {minuto.map((ev) => (
              <article
                key={ev.id}
                className="w-full bg-slate-900/80 border border-slate-800/60 border-l-4 border-l-amber-500 rounded-2xl px-4 py-3.5 flex gap-3"
              >
                <span className="text-2xl leading-none shrink-0">
                  {ev.icono}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-amber-600/20 border border-amber-500/40 text-amber-300 text-[9px] font-black uppercase tracking-widest">
                      ⚡ Minuto a minuto
                    </span>
                    {ev.minutoLabel && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[10px] font-black">
                        {ev.minutoLabel}&prime;
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-white text-sm mt-1.5 leading-snug">
                    {ev.titulo}
                  </p>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">
                    {ev.detalle}
                  </p>
                </div>
              </article>
            ))}
            <p className="text-center text-slate-500 text-xs font-medium pt-1">
              Solo goles, penales y expulsiones de los partidos de la
              quiniela, conforme los registra el proveedor.
            </p>
          </div>
        )
      ) : !delClub && !errorClub ? (
        <div className="text-cyan-400 font-bold animate-pulse py-20">
          Cargando noticias...
        </div>
      ) : errorClub && !delClub ? (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-red-400 font-bold mb-4">⚠️ {errorClub}</p>
          <button
            onClick={cargarClub}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-widest transition-all"
          >
            Reintentar
          </button>
        </div>
      ) : feed.length === 0 ? (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">📰</p>
          <p className="text-slate-300 font-bold">{textoVacio}</p>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-3">
          {feed.map((item) =>
            item.tipo === 'club' ? (
              <article
                key={`club-${item.club.id}`}
                className="w-full bg-slate-900/80 border border-slate-800/60 border-l-4 border-l-blue-500 rounded-2xl px-4 py-3.5 flex gap-3"
              >
                <span className="text-2xl leading-none shrink-0">
                  {item.club.icono}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 text-[9px] font-black uppercase tracking-widest">
                      🏟️ Del club
                    </span>
                    <span className="text-slate-500 text-[11px] font-bold">
                      {fechaLegible(item.club.fechaISO)}
                    </span>
                  </div>
                  <p className="font-bold text-white text-sm mt-1.5 leading-snug">
                    {item.club.titulo}
                  </p>
                  {item.club.detalle && (
                    <p className="text-slate-400 text-xs font-medium mt-0.5">
                      {item.club.detalle}
                    </p>
                  )}
                </div>
              </article>
            ) : (
              <article
                key={`ext-${item.externa.enlace}`}
                className={`w-full bg-slate-900/80 border border-slate-800/60 border-l-4 rounded-2xl px-4 py-3.5 ${
                  item.externa.categoria === 'equipos'
                    ? 'border-l-emerald-500'
                    : 'border-l-violet-500'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {item.externa.categoria === 'equipos' ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-black uppercase tracking-widest">
                      ⚽ De los equipos
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-violet-600/20 border border-violet-500/40 text-violet-300 text-[9px] font-black uppercase tracking-widest">
                      📰 Deportes
                    </span>
                  )}
                  <span className="text-slate-400 text-[11px] font-bold">
                    {item.externa.medio}
                  </span>
                  {item.externa.fechaISO && (
                    <span className="text-slate-500 text-[11px] font-bold">
                      · {fechaLegible(item.externa.fechaISO)}
                    </span>
                  )}
                </div>
                <a
                  href={item.externa.enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-bold text-white text-sm mt-1.5 leading-snug hover:text-cyan-300 transition-colors"
                >
                  {item.externa.titulo} <span className="text-cyan-500">↗</span>
                </a>
                {item.externa.equipos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.externa.equipos.map((eq) => (
                      <span
                        key={eq}
                        className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold"
                      >
                        {nombreEquipoES(eq)}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            )
          )}

          {externasFallaron && (
            <p className="text-center text-slate-500 text-xs font-medium pt-1">
              Las noticias externas no están disponibles ahorita; las del
              club siguen al día.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
