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
//       (RSS público vía /api/noticias-externas) de los equipos de la
//       jornada y de los favoritos del jugador; cada tarjeta abre la
//       nota original en el medio.
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
    if (!equiposClave) {
      setExternas([])
      return
    }
    try {
      const res = await fetch(
        `/api/noticias-externas?equipos=${encodeURIComponent(equiposClave)}`
      )
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

  const feed = useMemo<ItemFeed[]>(() => {
    const items: ItemFeed[] = []
    for (const club of delClub || []) {
      items.push({ tipo: 'club', fechaISO: club.fechaISO, club })
    }
    for (const externa of externas || []) {
      items.push({
        tipo: 'externa',
        fechaISO: externa.fechaISO || '',
        externa,
      })
    }
    items.sort((a, b) => b.fechaISO.localeCompare(a.fechaISO))
    return items.slice(0, 40)
  }, [delClub, externas])

  return (
    <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in duration-500">
      <div className="text-center mb-5">
        <h2 className="text-3xl font-black tracking-tight text-white">
          📰 NOTICIAS
        </h2>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
          Del club y de tus equipos
        </p>
      </div>

      {!delClub && !errorClub ? (
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
          <p className="text-slate-300 font-bold">
            Todavía no hay noticias. Cuando haya jornada y jueguen tus
            equipos, aquí se juntan las novedades.
          </p>
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
                className="w-full bg-slate-900/80 border border-slate-800/60 border-l-4 border-l-slate-500 rounded-2xl px-4 py-3.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-slate-700/40 border border-slate-600/60 text-slate-300 text-[9px] font-black uppercase tracking-widest">
                    ⚽ De los equipos
                  </span>
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
              Las noticias de los equipos no están disponibles ahorita;
              las del club siguen al día.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
