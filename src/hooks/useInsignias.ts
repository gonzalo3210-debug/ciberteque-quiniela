// src/hooks/useInsignias.ts
//
// Armado del historial para insignias y rachas (src/lib/insignias.ts).
//
// Todo se calcula al vuelo, en el cliente, SIN migración de base:
// las posiciones finales salen de la tabla oficial compartida
// (calcularTabla de src/lib/proyeccion.ts, la misma del ranking),
// así los lugares compartidos y el desempate por goles son idénticos
// a los de la app, y el módulo puro deduce el cobro de premio de la
// posición + el tipo de premiación de cada quiniela.
//
// Dos alcances, ambos con consultas acotadas (nunca por jugador):
//  - useInsigniasUsuario: solo las quinielas que jugó el usuario
//    (sus boletos + los de sus rivales en esas jornadas, para poder
//    calificar la tabla completa). Para la vitrina de Mi Perfil.
//  - useInsigniasRanking: TODAS las quinielas cerradas por puntos
//    del Club en 3 consultas totales (quinielas, boletos con sus
//    pronósticos y partidos), sin importar cuántos jugadores haya.
//    Para los iconos junto al nombre en Posiciones. Crece con el
//    historial del Club; es una carga única al montar la vista, no
//    entra al ciclo de refresco en vivo.
//
// Solo cuentan quinielas CERRADAS (liquidadas) de modos por puntos:
// el sorteo queda fuera (supervivencia, no puntos) y una quiniela
// aún abierta no reparte posiciones finales.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularTabla } from '@/lib/proyeccion'
import {
  calcularInsignias,
  type BoletoHistorial,
  type ResultadoInsignias,
} from '@/lib/insignias'

const CAMPOS_QUINIELA =
  'id, nombre_jornada, modalidad, tipo_premiacion, goles_totales_real, fecha_cierre, estado'

function esPorPuntos(quiniela: any): boolean {
  return (quiniela?.modalidad || '').toLowerCase() !== 'sorteo'
}

/**
 * Arma el mapa usuario_id → su historial de boletos calificados
 * desde las filas crudas de quinielas cerradas, sus boletos (con
 * pronósticos) y sus partidos. Función pura de armado: la
 * calificación es la tabla oficial. Es LA fuente del historial:
 * la usan las insignias (armarMapaInsignias) y las estadísticas
 * personales (src/lib/estadisticas.ts vía useHistorialUsuario).
 */
export function armarHistorialPorUsuario(
  quinielas: any[],
  tickets: any[],
  partidos: any[]
): Map<string, BoletoHistorial[]> {
  const boletosPorUsuario = new Map<string, BoletoHistorial[]>()

  for (const q of quinielas) {
    if (!esPorPuntos(q)) continue
    const partidosQ = partidos.filter((p: any) => p.quiniela_id === q.id)
    const ticketsQ = tickets.filter((t: any) => t.quiniela_id === q.id)
    if (ticketsQ.length === 0) continue

    const tabla = calcularTabla(q, ticketsQ, partidosQ)
    const tamanoGrupo1 = tabla.filter((f) => f.posicion === 1).length
    const esExacto = (q.modalidad || '').toLowerCase() === 'marcador_exacto'

    // Nivel = ordinal del grupo de empate (las filas ya vienen
    // ordenadas y con la posición compartida asignada).
    let nivel = 0
    let posicionAnterior: number | null = null
    for (const fila of tabla) {
      if (fila.posicion !== posicionAnterior) {
        nivel++
        posicionAnterior = fila.posicion
      }
      if (!fila.usuarioId) continue
      const boleto: BoletoHistorial = {
        quinielaId: q.id,
        nombreJornada: q.nombre_jornada || 'Jornada',
        modalidad: q.modalidad || null,
        tipoPremiacion: q.tipo_premiacion || null,
        fechaCierre: q.fecha_cierre || null,
        posicion: fila.posicion,
        nivel,
        tamanoGrupo1,
        puntos: fila.puntos,
        exactos: fila.detalle.filter((d) => d.estado === 'acierto_exacto')
          .length,
        // Solo tendencia: en marcador exacto, los 'acierto_lev'; en
        // clásica, todos los aciertos son tendencia L/E/V.
        tendencias: esExacto
          ? fila.detalle.filter((d) => d.estado === 'acierto_lev').length
          : fila.detalle.filter((d) => d.puntos > 0).length,
        aciertos: fila.detalle.filter((d) => d.puntos > 0).length,
        totalPronosticos: fila.detalle.length,
      }
      const lista = boletosPorUsuario.get(fila.usuarioId) || []
      lista.push(boleto)
      boletosPorUsuario.set(fila.usuarioId, lista)
    }
  }

  return boletosPorUsuario
}

/**
 * Arma el mapa usuario_id → insignias desde las filas crudas de
 * quinielas cerradas, sus boletos (con pronósticos) y sus partidos.
 * Función pura de armado: la calificación es la tabla oficial.
 */
export function armarMapaInsignias(
  quinielas: any[],
  tickets: any[],
  partidos: any[]
): Map<string, ResultadoInsignias> {
  const mapa = new Map<string, ResultadoInsignias>()
  armarHistorialPorUsuario(quinielas, tickets, partidos).forEach(
    (boletos, usuarioId) => {
      mapa.set(usuarioId, calcularInsignias(boletos))
    }
  )
  return mapa
}

async function cargarBoletosYPartidos(quinielaIds: string[]) {
  const [{ data: tickets }, { data: partidos }] = await Promise.all([
    supabase
      .from('tickets')
      .select(
        'id, usuario_id, quiniela_id, prediccion_goles_total, pronosticos(eleccion_usuario, partido_id)'
      )
      .in('quiniela_id', quinielaIds),
    supabase
      .from('partidos')
      .select(
        'id, quiniela_id, goles_local, goles_visitante, resultado_real, es_final'
      )
      .in('quiniela_id', quinielaIds),
  ])
  return { tickets: tickets || [], partidos: partidos || [] }
}

/** Insignias del usuario actual (vitrina de Mi Perfil). */
export function useInsigniasUsuario(usuarioId?: string | null) {
  const [resultado, setResultado] = useState<ResultadoInsignias | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    async function cargar() {
      if (!usuarioId) {
        if (activo) {
          setResultado(null)
          setCargando(false)
        }
        return
      }
      setCargando(true)
      try {
        // 1) Las quinielas que jugó el usuario.
        const { data: misTickets } = await supabase
          .from('tickets')
          .select('quiniela_id')
          .eq('usuario_id', usuarioId)
        const idsJugadas = [
          ...new Set((misTickets || []).map((t: any) => t.quiniela_id)),
        ]
        if (idsJugadas.length === 0) {
          if (activo) setResultado(calcularInsignias([]))
          return
        }
        // 2) De esas, las cerradas y por puntos.
        const { data: quinielas } = await supabase
          .from('quinielas')
          .select(CAMPOS_QUINIELA)
          .in('id', idsJugadas)
          .eq('estado', 'cerrada')
        const cerradas = (quinielas || []).filter(esPorPuntos)
        if (cerradas.length === 0) {
          if (activo) setResultado(calcularInsignias([]))
          return
        }
        // 3) Todos los boletos y partidos de esas jornadas (para
        // calificar la tabla oficial completa, no solo la del usuario).
        const { tickets, partidos } = await cargarBoletosYPartidos(
          cerradas.map((q: any) => q.id)
        )
        const mapa = armarMapaInsignias(cerradas, tickets, partidos)
        if (activo) {
          setResultado(mapa.get(usuarioId) || calcularInsignias([]))
        }
      } catch (error) {
        console.error('Error cargando insignias del usuario:', error)
        if (activo) setResultado(calcularInsignias([]))
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => {
      activo = false
    }
  }, [usuarioId])

  return { resultado, cargando }
}

/**
 * Historial calificado del usuario actual (boletos de quinielas
 * cerradas por puntos, con la tabla oficial). Mismo flujo acotado
 * que useInsigniasUsuario; lo consumen las estadísticas personales
 * (src/hooks/useEstadisticas.ts).
 */
export function useHistorialUsuario(usuarioId?: string | null) {
  const [historial, setHistorial] = useState<BoletoHistorial[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    async function cargar() {
      if (!usuarioId) {
        if (activo) {
          setHistorial([])
          setCargando(false)
        }
        return
      }
      setCargando(true)
      try {
        const { data: misTickets } = await supabase
          .from('tickets')
          .select('quiniela_id')
          .eq('usuario_id', usuarioId)
        const idsJugadas = [
          ...new Set((misTickets || []).map((t: any) => t.quiniela_id)),
        ]
        if (idsJugadas.length === 0) {
          if (activo) setHistorial([])
          return
        }
        const { data: quinielas } = await supabase
          .from('quinielas')
          .select(CAMPOS_QUINIELA)
          .in('id', idsJugadas)
          .eq('estado', 'cerrada')
        const cerradas = (quinielas || []).filter(esPorPuntos)
        if (cerradas.length === 0) {
          if (activo) setHistorial([])
          return
        }
        const { tickets, partidos } = await cargarBoletosYPartidos(
          cerradas.map((q: any) => q.id)
        )
        const porUsuario = armarHistorialPorUsuario(cerradas, tickets, partidos)
        if (activo) setHistorial(porUsuario.get(usuarioId) || [])
      } catch (error) {
        console.error('Error cargando historial del usuario:', error)
        if (activo) setHistorial([])
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => {
      activo = false
    }
  }, [usuarioId])

  return { historial, cargando }
}

/** Insignias de TODOS los jugadores (iconos en Posiciones). */
export function useInsigniasRanking() {
  const [insigniasPorUsuario, setInsigniasPorUsuario] = useState<
    Map<string, ResultadoInsignias>
  >(new Map())
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    async function cargar() {
      setCargando(true)
      try {
        const { data: quinielas } = await supabase
          .from('quinielas')
          .select(CAMPOS_QUINIELA)
          .eq('estado', 'cerrada')
        const cerradas = (quinielas || []).filter(esPorPuntos)
        if (cerradas.length === 0) {
          if (activo) setInsigniasPorUsuario(new Map())
          return
        }
        const { tickets, partidos } = await cargarBoletosYPartidos(
          cerradas.map((q: any) => q.id)
        )
        if (activo) {
          setInsigniasPorUsuario(armarMapaInsignias(cerradas, tickets, partidos))
        }
      } catch (error) {
        console.error('Error cargando insignias del ranking:', error)
        if (activo) setInsigniasPorUsuario(new Map())
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => {
      activo = false
    }
  }, [])

  return { insigniasPorUsuario, cargando }
}
