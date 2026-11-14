// src/hooks/useJornadaActual.ts
//
// La jornada "de ahorita" del Club para la sección Partidos (pestaña
// 🎯 Quiniela y filtro 🔴 Live): la quiniela ABIERTA más próxima a
// cerrar; si no hay abiertas, la que quedó CERRADA pero sigue en curso
// (sin goles totales capturados, p. ej. entre el cierre y la
// liquidación). Respeta la privacidad de siempre: las jornadas
// solo_admins no se le muestran a quien no es admin.
//
// Devuelve TODAS las candidatas (puede haber más de una abierta) con
// la seleccionada, para que la vista ofrezca cambiar entre ellas.
// Se refresca solo cada 2 minutos (el Árbitro va capturando finales
// en Supabase durante los partidos).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { obtenerCatalogoEquipos } from '@/lib/queries'

export interface JornadaConPartidos {
  quiniela: any
  /** Partidos de la jornada, en el orden en que se juegan. */
  partidos: any[]
}

const REFRESCO_MS = 120_000 // 2 minutos

function rolDesdeSesion(): string | undefined {
  try {
    const raw = localStorage.getItem('club_pronosticos_usuario')
    if (!raw) return undefined
    return JSON.parse(raw)?.rol
  } catch {
    return undefined
  }
}

const CAMPOS_PARTIDOS =
  'id, equipo_local, equipo_visitante, fecha_hora_partido, resultado_real, goles_local, goles_visitante, es_final, canal'

function acomodar(quiniela: any): JornadaConPartidos {
  const partidos = [...(quiniela.partidos || [])].sort((a: any, b: any) => {
    const ta = new Date(a.fecha_hora_partido || 0).getTime()
    const tb = new Date(b.fecha_hora_partido || 0).getTime()
    return ta - tb
  })
  return { quiniela, partidos }
}

export function useJornadaActual() {
  const [candidatas, setCandidatas] = useState<JornadaConPartidos[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [mapaLogos, setMapaLogos] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const primeraCarga = useRef(true)

  const cargar = useCallback(async () => {
    try {
      const rol = rolDesdeSesion()

      let consultaAbiertas = supabase
        .from('quinielas')
        .select(`id, nombre_jornada, estado, modalidad, precio_ticket, fecha_cierre, goles_totales_real, solo_admins, partidos (${CAMPOS_PARTIDOS})`)
        .eq('estado', 'abierta')
        .order('fecha_cierre', { ascending: true })
        .limit(5)
      if (rol !== 'admin') consultaAbiertas = consultaAbiertas.neq('solo_admins', true)
      const { data: abiertas, error: errAbiertas } = await consultaAbiertas
      if (errAbiertas) throw errAbiertas

      let lista: JornadaConPartidos[] = (abiertas || []).map(acomodar)

      if (lista.length === 0) {
        // Sin abiertas: la última cerrada que siga en curso (sin
        // goles totales = aún no liquidada).
        let consultaCerradas = supabase
          .from('quinielas')
          .select(`id, nombre_jornada, estado, modalidad, precio_ticket, fecha_cierre, goles_totales_real, solo_admins, partidos (${CAMPOS_PARTIDOS})`)
          .eq('estado', 'cerrada')
          .is('goles_totales_real', null)
          .order('fecha_cierre', { ascending: false })
          .limit(3)
        if (rol !== 'admin') consultaCerradas = consultaCerradas.neq('solo_admins', true)
        const { data: cerradas, error: errCerradas } = await consultaCerradas
        if (errCerradas) throw errCerradas
        lista = (cerradas || []).map(acomodar)
      }

      setCandidatas(lista)
      setSeleccionId((prev) => {
        if (prev && lista.some((c) => c.quiniela.id === prev)) return prev
        return lista.length > 0 ? lista[0].quiniela.id : null
      })
      setError(null)
    } catch (e) {
      console.error('useJornadaActual:', e)
      if (primeraCarga.current) {
        setError('No se pudo cargar la jornada del Club.')
      }
    } finally {
      primeraCarga.current = false
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  // Logos del catálogo de equipos de la app (para los partidos que no
  // se emparejen con la API y se muestren con datos de la app).
  useEffect(() => {
    obtenerCatalogoEquipos().then(({ data }) => {
      if (!data) return
      const mapa: Record<string, string> = {}
      data.forEach((eq: any) => {
        if (eq.nombre && eq.logo_url) {
          mapa[eq.nombre.toLowerCase().trim()] = eq.logo_url
        }
      })
      setMapaLogos(mapa)
    })
  }, [])

  const seleccionada =
    candidatas.find((c) => c.quiniela.id === seleccionId) ||
    candidatas[0] ||
    null

  return {
    candidatas,
    seleccionada,
    setSeleccionId,
    mapaLogos,
    cargando,
    error,
    recargar: cargar,
  }
}
