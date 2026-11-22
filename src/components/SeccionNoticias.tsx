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
// Todos · 🎯 Quiniela · ⭐ Favoritos · ⚡ Minuto a minuto · 📰
// Deportes. La clasificación la hace el servidor (la ruta marca cada
// titular con su categoría), así que cambiar de chip filtra al
// momento, sin volver a pedir nada. El chip de equipos se llama
// «Favoritos» y el ⚡ Minuto a minuto va junto a él, no al final
// (corrección de Gonzalo, 2026-11-20). El Minuto a minuto es aparte:
// no mezcla titulares, lista los eventos importantes (goles, penales
// y expulsiones) de los partidos de la quiniela activa, del más
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
  rankingDeQuiniela,
  type NoticiaClub,
} from '@/lib/noticiasClub'
import { calcularTabla, type FilaTabla } from '@/lib/proyeccion'
import { useJornadaActual } from '@/hooks/useJornadaActual'
import { leerFavoritos } from '@/lib/favoritos'
import {
  emparejarPartidosJornada,
  ventanaDeJornada,
} from '@/lib/emparejar'
import type { SportsFixture } from '@/lib/sports/types'
import {
  nombreEquipoES,
  normalizarNombreEquipo,
} from '@/lib/sports/nombresES'
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
  /** Deporte probable, clasificado por el servidor (filtro Deportes). */
  deporte?: string
}

/** Orden de presentación de los deportes en el filtro de Deportes. */
const ORDEN_DEPORTES = [
  'Fútbol',
  'Básquetbol',
  'Béisbol',
  'Fútbol americano',
  'Boxeo',
  'MMA',
  'Tenis',
  'Fórmula 1',
  'Golf',
  'Otros',
]

type ChipNoticias = 'todos' | 'quiniela' | 'equipos' | 'deportes' | 'minuto'

const CHIPS: { id: ChipNoticias; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'quiniela', etiqueta: '🎯 Quiniela' },
  { id: 'equipos', etiqueta: '⭐ Favoritos' },
  { id: 'minuto', etiqueta: '⚡ Minuto a minuto' },
  { id: 'deportes', etiqueta: '📰 Deportes' },
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
  /** Partido al que pertenece (para el filtro por partido): el ID del
   *  fixture del proveedor, o `club:{partidoId}` si solo hay eventos
   *  del Club para ese partido. */
  partidoClave: string
  /** "Local vs Visita" para la etiqueta del filtro. */
  partidoEtiqueta: string
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
        partidoClave: f.providerId,
        partidoEtiqueta: `${localES} vs ${visitaES}`,
      })
    })
  }
  items.sort((a, b) => b.orden - a.orden)
  return items
}

/** Evento del Club tal como lo devuelve /api/eventos-club. */
interface EventoClub {
  partidoId: string
  quinielaId: string | null
  tipo: string
  equipoAnoto: string | null
  golesLocal: number | null
  golesVisitante: number | null
  minuto: number | null
  fechaISO: string
}

/**
 * Eventos del Club (los goles que detecta el programa de marcadores)
 * convertidos a tarjetas del Minuto a minuto. Solo entran los de los
 * partidos cuya línea del proveedor vino VACÍA — el caso de la Liga
 * MX —: si el proveedor sí trajo eventos de un partido, los suyos
 * mandan y los del Club se saltan para no duplicar el mismo gol.
 * Sin goleador: la detección por marcador no lo conoce.
 */
function eventosClubAMinuto(
  eventosClub: EventoClub[],
  partidosJornada: any[],
  idsPorPartido: Map<string, string>,
  fixturesConEventos: Set<string>
): EventoMinuto[] {
  const items: EventoMinuto[] = []
  for (const ev of eventosClub || []) {
    const fixtureId = idsPorPartido.get(ev.partidoId)
    if (fixtureId && fixturesConEventos.has(fixtureId)) continue
    const partido = (partidosJornada as any[]).find(
      (p) => p.id === ev.partidoId
    )
    if (!partido) continue
    const etiqueta = `${partido.equipo_local} vs ${partido.equipo_visitante}`
    const marcador =
      ev.golesLocal !== null && ev.golesVisitante !== null
        ? `${partido.equipo_local} ${ev.golesLocal} - ${ev.golesVisitante} ${partido.equipo_visitante}`
        : etiqueta
    let icono = '⚡'
    let titulo = ''
    let detalle = marcador
    if (ev.tipo === 'gol') {
      icono = '⚽'
      titulo = ev.equipoAnoto ? `¡Gol de ${ev.equipoAnoto}!` : '¡Gol!'
      detalle = `${marcador} tras el gol`
    } else if (ev.tipo === 'gol_anulado') {
      icono = '🚫'
      titulo = 'Gol anulado por el VAR'
    } else if (ev.tipo === 'fin_partido') {
      icono = '🏁'
      titulo = `Final: ${marcador}`
      detalle = 'Partido terminado'
    } else {
      continue
    }
    items.push({
      id: `club-${ev.partidoId}-${ev.tipo}-${ev.fechaISO}`,
      icono,
      titulo,
      detalle,
      minutoLabel: ev.minuto !== null ? `${ev.minuto}` : '',
      orden: Date.parse(ev.fechaISO) || 0,
      partidoClave: fixtureId || `club:${ev.partidoId}`,
      partidoEtiqueta: etiqueta,
    })
  }
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

/** Tabla general lista para la ventana emergente de una noticia. */
interface TablaEmergente {
  titulo: string
  subtitulo: string
  filas: {
    posicion: number
    nombre: string
    puntos: number
    golesDiff: number | null
  }[]
}

export default function SeccionNoticias({
  onIrAJugar,
}: {
  /** Ir a la pestaña Jugar (noticias de jornada nueva/cierre). */
  onIrAJugar?: () => void
} = {}) {
  const [delClub, setDelClub] = useState<NoticiaClub[] | null>(null)
  // Datos crudos de los que salieron las noticias del club: se
  // guardan para poder abrir la TABLA GENERAL de la jornada al
  // tocar una noticia de líder/ganador/final (sin volver a pedir).
  const [datosClub, setDatosClub] = useState<{
    quinielas: any[]
    mapaUsuarios: Record<string, { nombre: string }>
  } | null>(null)
  const [tablaAbierta, setTablaAbierta] = useState<TablaEmergente | null>(
    null
  )
  const [errorClub, setErrorClub] = useState<string | null>(null)
  const [externas, setExternas] = useState<NoticiaExterna[] | null>(null)
  const [externasFallaron, setExternasFallaron] = useState(false)
  const [chip, setChip] = useState<ChipNoticias>('todos')
  const [minuto, setMinuto] = useState<EventoMinuto[] | null>(null)
  // ⚡ Filtro por partido del Minuto a minuto (pedido de Gonzalo,
  // 2026-11-22): 'todos' o la clave de un partido, para que los
  // eventos de un juego no se mezclen con los de otro.
  const [filtroPartido, setFiltroPartido] = useState<string>('todos')
  const [hayEventosClub, setHayEventosClub] = useState(false)
  // 🔍 Buscador por equipo dentro del chip ⭐ Favoritos (pedido de
  // Gonzalo 2026-11-22, igual que en la vista Favoritos de Partidos):
  // filtra los titulares ya cargados por el equipo escrito.
  const [busquedaEquipo, setBusquedaEquipo] = useState('')
  // 📰 Filtro por deporte dentro del chip Deportes ('todos' o el
  // nombre del deporte tal como lo clasifica el servidor).
  const [filtroDeporte, setFiltroDeporte] = useState<string>('todos')

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
      setDatosClub({ quinielas: qRes.data || [], mapaUsuarios: mapa })
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

  // 👆 Noticias del club ACCIONABLES (corrección de Gonzalo,
  // 2026-11-22): cada tarjeta hace lo que corresponde a su evento —
  // jornada nueva o por cerrar → ir a Jugar; líder, ganador o final
  // de partido → ventana emergente con la tabla general de esa
  // jornada, calculada con la MISMA cuenta del Ranking oficial
  // (calcularTabla; en sorteo, el ranking por puntos del generador).
  const alTocarNoticiaClub = useCallback(
    (club: NoticiaClub) => {
      if (club.subtipo === 'nueva' || club.subtipo === 'cierre') {
        onIrAJugar?.()
        return
      }
      if (!datosClub) return
      const q = datosClub.quinielas.find((x: any) => x.id === club.quinielaId)
      if (!q) return
      const nombre = q.nombre_jornada || 'Jornada'
      let filas: TablaEmergente['filas'] = []
      const tabla: FilaTabla[] = calcularTabla(
        q,
        q.tickets || [],
        q.partidos || [],
        { soloFinales: club.subtipo === 'ganador' }
      )
      if (tabla.length > 0) {
        filas = tabla.map((f) => ({
          posicion: f.posicion,
          nombre:
            (f.usuarioId && datosClub.mapaUsuarios[f.usuarioId]?.nombre) ||
            'Un jugador',
          puntos: f.puntos,
          golesDiff: f.golesDiff,
        }))
      } else {
        // Sorteo (calcularTabla no aplica): ranking por puntos.
        filas = rankingDeQuiniela(q, datosClub.mapaUsuarios).map((r, i) => ({
          posicion: i + 1,
          nombre: r.nombre,
          puntos: r.puntos,
          golesDiff: r.golesDiff >= 999 ? null : r.golesDiff,
        }))
      }
      setTablaAbierta({
        titulo: `🏆 Tabla general · ${nombre}`,
        subtitulo:
          club.subtipo === 'ganador'
            ? 'Tabla final de la jornada'
            : 'Posiciones en vivo de la jornada',
        filas,
      })
    },
    [datosClub, onIrAJugar]
  )

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
      let items: EventoMinuto[] = []
      const fixturesConEventos = new Set<string>()
      if (fixtureIds.length > 0) {
        const res = await fetch(
          `/api/eventos-partido?fixtures=${fixtureIds.join(',')}`
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Error')
        for (const m of data.matches || []) {
          if (m.fixture && (m.eventos || []).length > 0) {
            fixturesConEventos.add(m.fixture.providerId)
          }
        }
        items = eventosMinutoDesdeRespuesta(data.matches || [])
      }
      // Eventos del CLUB para los partidos sin línea del proveedor
      // (Liga MX): los goles que detecta el programa de marcadores.
      // Si la fuente aún no existe, la ruta devuelve lista vacía y
      // el feed sigue solo con lo del proveedor.
      try {
        const idsClub = (partidosJornada as any[]).map((p) => p.id).join(',')
        const resClub = await fetch(`/api/eventos-club?partidos=${idsClub}`)
        const dataClub = await resClub.json()
        if (resClub.ok) {
          const delClub = eventosClubAMinuto(
            dataClub.eventos || [],
            partidosJornada,
            idsPorPartido,
            fixturesConEventos
          )
          if (delClub.length > 0) {
            items = [...items, ...delClub].sort((a, b) => b.orden - a.orden)
            setHayEventosClub(true)
          }
        }
      } catch {
        // Sin eventos del club: el feed sigue con los del proveedor.
      }
      setMinuto(items)
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

  // 📰 Deportes presentes entre los titulares ya cargados del chip
  // Deportes (para su filtro). Si el deporte elegido ya no está
  // entre los titulares nuevos, el filtro efectivo cae a 'todos'
  // para no dejar la pestaña vacía tras una recarga.
  const opcionesDeporte = (() => {
    const presentes = new Set<string>()
    for (const externa of externas || []) {
      const categoria =
        externa.categoria ||
        (externa.equipos.length > 0 ? 'equipos' : 'deportes')
      if (categoria === 'deportes') {
        presentes.add(externa.deporte || 'Otros')
      }
    }
    return ORDEN_DEPORTES.filter((d) => presentes.has(d))
  })()
  const filtroDeporteEfectivo =
    filtroDeporte !== 'todos' && opcionesDeporte.includes(filtroDeporte)
      ? filtroDeporte
      : 'todos'

  const feed = useMemo<ItemFeed[]>(() => {
    const items: ItemFeed[] = []
    // Chip 🎯 Quiniela: SOLO las del club. Chip Todos: todo mezclado.
    if (chip === 'todos' || chip === 'quiniela') {
      for (const club of delClub || []) {
        items.push({ tipo: 'club', fechaISO: club.fechaISO, club })
      }
    }
    if (chip !== 'quiniela') {
      // 🔍 Filtro del chip ⭐ Favoritos: solo titulares de ESE equipo
      // (por sus equipos emparejados o por el título), sin acentos.
      const consulta =
        chip === 'equipos' ? normalizarNombreEquipo(busquedaEquipo) : ''
      for (const externa of externas || []) {
        // Sin categoría (respaldo ante una respuesta vieja en caché):
        // si trae equipos emparejados es de Equipos; si no, de Deportes.
        const categoria =
          externa.categoria ||
          (externa.equipos.length > 0 ? 'equipos' : 'deportes')
        if (chip !== 'todos' && categoria !== chip) continue
        // 📰 Filtro por deporte, solo dentro del chip Deportes.
        if (
          chip === 'deportes' &&
          filtroDeporteEfectivo !== 'todos' &&
          (externa.deporte || 'Otros') !== filtroDeporteEfectivo
        )
          continue
        if (consulta) {
          const enEquipos = externa.equipos.some(
            (eq) =>
              normalizarNombreEquipo(eq).includes(consulta) ||
              normalizarNombreEquipo(nombreEquipoES(eq)).includes(consulta)
          )
          const enTitulo = normalizarNombreEquipo(externa.titulo).includes(
            consulta
          )
          if (!enEquipos && !enTitulo) continue
        }
        items.push({
          tipo: 'externa',
          fechaISO: externa.fechaISO || '',
          externa,
        })
      }
    }
    items.sort((a, b) => b.fechaISO.localeCompare(a.fechaISO))
    return items.slice(0, 40)
  }, [delClub, externas, chip, busquedaEquipo, filtroDeporteEfectivo])

  // ⚡ Filtro por partido del Minuto a minuto: opciones = los
  // partidos que SÍ tienen eventos; la lista visible se acota al
  // partido elegido para que no se mezclen los eventos.
  const opcionesPartidoMinuto = (() => {
    const mapa = new Map<string, string>()
    for (const ev of minuto || []) {
      if (!mapa.has(ev.partidoClave)) {
        mapa.set(ev.partidoClave, ev.partidoEtiqueta)
      }
    }
    return [...mapa.entries()].map(([clave, etiqueta]) => ({
      clave,
      etiqueta,
    }))
  })()
  const minutoVisible =
    filtroPartido === 'todos'
      ? minuto || []
      : (minuto || []).filter((ev) => ev.partidoClave === filtroPartido)

  const textoVacio =
    chip === 'quiniela'
      ? 'Todavía no hay novedades del club. Cuando se abra una jornada y empiecen los partidos, aquí salen los finales, el líder y el ganador.'
      : chip === 'equipos' && busquedaEquipo.trim()
        ? `No hay titulares de «${busquedaEquipo.trim()}» entre tus favoritos y los equipos de la jornada. Borra la búsqueda para verlos todos.`
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

      {/* ── 🔍 Buscador por equipo, solo en el chip ⭐ Favoritos ── */}
      {chip === 'equipos' && (
        <div className="w-full mb-4">
          <input
            type="text"
            value={busquedaEquipo}
            onChange={(e) => setBusquedaEquipo(e.target.value)}
            placeholder="🔍 Buscar titulares de un equipo… (ej. Chivas, América)"
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-center"
          />
        </div>
      )}

      {/* ── 📰 Filtro por deporte, solo en el chip Deportes ── */}
      {chip === 'deportes' && opcionesDeporte.length > 1 && (
        <div className="flex gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full mb-4 overflow-x-auto">
          <button
            onClick={() => setFiltroDeporte('todos')}
            className={`flex-1 shrink-0 whitespace-nowrap px-3 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all ${
              filtroDeporteEfectivo === 'todos'
                ? 'bg-emerald-600 text-white shadow-[0_0_18px_rgba(5,150,105,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          {opcionesDeporte.map((d) => (
            <button
              key={d}
              onClick={() => setFiltroDeporte(d)}
              className={`flex-1 shrink-0 whitespace-nowrap px-3 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all ${
                filtroDeporteEfectivo === d
                  ? 'bg-emerald-600 text-white shadow-[0_0_18px_rgba(5,150,105,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* ── ⚡ Filtro por partido, solo en el chip Minuto a minuto ── */}
      {chip === 'minuto' && minuto !== null && opcionesPartidoMinuto.length > 1 && (
        <div className="flex gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 w-full mb-4 overflow-x-auto">
          <button
            onClick={() => setFiltroPartido('todos')}
            className={`flex-1 shrink-0 whitespace-nowrap px-3 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all ${
              filtroPartido === 'todos'
                ? 'bg-amber-600 text-white shadow-[0_0_18px_rgba(217,119,6,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          {opcionesPartidoMinuto.map((op) => (
            <button
              key={op.clave}
              onClick={() => setFiltroPartido(op.clave)}
              className={`flex-1 shrink-0 whitespace-nowrap px-3 py-2 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all ${
                filtroPartido === op.clave
                  ? 'bg-amber-600 text-white shadow-[0_0_18px_rgba(217,119,6,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {op.etiqueta}
            </button>
          ))}
        </div>
      )}

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
            {minutoVisible.map((ev) => (
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
              {hayEventosClub &&
                ' Los de la Liga MX los detecta el Club (el proveedor no trae línea de tiempo de esta liga): gol y marcador, sin goleador.'}
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
                onClick={() => alTocarNoticiaClub(item.club)}
                role="button"
                title={
                  item.club.subtipo === 'nueva' ||
                  item.club.subtipo === 'cierre'
                    ? 'Ir a Jugar'
                    : 'Ver la tabla general'
                }
                className="w-full bg-slate-900/80 border border-slate-800/60 border-l-4 border-l-blue-500 rounded-2xl px-4 py-3.5 flex gap-3 cursor-pointer hover:bg-slate-800/60 hover:border-blue-500/50 transition-colors"
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
                  <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mt-1.5">
                    {item.club.subtipo === 'nueva' ||
                    item.club.subtipo === 'cierre'
                      ? 'Toca para ir a Jugar ›'
                      : 'Toca para ver la tabla general ›'}
                  </p>
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

      {/* ── 🏆 Ventana emergente: tabla general de la jornada ── */}
      {tablaAbierta && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setTablaAbierta(null)}
        >
          <div
            className="bg-slate-900 border border-amber-600/50 max-w-md w-full p-4 md:p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-3 shrink-0">
              <div>
                <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight">
                  {tablaAbierta.titulo}
                </h3>
                <p className="text-[9px] text-amber-500 font-bold uppercase mt-1">
                  {tablaAbierta.subtitulo}
                </p>
              </div>
              <button
                onClick={() => setTablaAbierta(null)}
                className="text-slate-500 hover:text-slate-300 font-bold font-mono text-xl"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto pr-1 flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
              {tablaAbierta.filas.length === 0 ? (
                <p className="text-slate-400 text-sm font-bold text-center py-6">
                  Todavía no hay boletos con puntos en esta jornada.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="py-1.5 pr-2 text-center w-8">#</th>
                      <th className="py-1.5 pr-2">Jugador</th>
                      <th className="py-1.5 pr-2 text-center">Pts</th>
                      <th className="py-1.5 text-center">Dif. goles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tablaAbierta.filas.map((f, i) => (
                      <tr
                        key={`${f.posicion}-${f.nombre}-${i}`}
                        className={i === 0 ? 'bg-amber-600/10' : ''}
                      >
                        <td className="py-2 pr-2 text-center font-black text-amber-400 text-sm">
                          {f.posicion}°
                        </td>
                        <td className="py-2 pr-2 font-bold text-slate-200 text-xs truncate max-w-[160px]">
                          {f.nombre}
                        </td>
                        <td className="py-2 pr-2 text-center font-black text-white text-sm">
                          {f.puntos}
                        </td>
                        <td className="py-2 text-center font-bold text-slate-400 text-xs">
                          {f.golesDiff === null ? '—' : f.golesDiff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="mt-3 text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center shrink-0">
              Misma cuenta que el Ranking oficial · El desempate es por
              diferencia contra el total de goles
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
