'use client'
// src/components/ExploradorLigas.tsx
//
// Explorador "🌎 Ligas" de la sección Partidos (2026-11-17): TODAS
// las ligas del proveedor, no solo las curadas del Club. Arriba, los
// chips de DEPORTE (con nombre en español); debajo, un buscador y la
// lista de ligas de ese deporte. Al tocar una liga, el padre abre su
// página (Resumen · Partidos · Posiciones) por su ID de proveedor.
//
// El catálogo completo viene de /api/ligas-catalogo (el servidor lo
// cachea 24 h y ya filtra las pseudo-ligas internas del proveedor,
// las que empiezan con "_"): esta vista lo pide una sola vez al
// montarse. Las ligas del Club van primero en su deporte, marcadas
// con la etiqueta "DEL CLUB".
//
// Paquete v20 (2026-11-17, pedidos de Gonzalo):
//   · Cada liga trae su ESTRELLA tocable (☆/★): las favoritas del
//     jugador son las mismas ligas seguidas de siempre
//     (favoritos.ligas, localStorage vía src/lib/favoritos.ts) y se
//     muestran primero, en su propia sección "⭐ Tus ligas".
//   · El buscador encuentra también EQUIPOS (vía /api/buscar, la
//     fuente que ya usaba la app): tocar un equipo abre su página.
import React, { useState, useEffect, useMemo } from 'react'
import type { DeporteConLigas } from '@/lib/sports/catalogo'
import { ordenarConFavoritas } from '@/lib/sports/catalogo'
import { getSupportedLeague } from '@/lib/sports/leagues'
import type { Favoritos } from '@/lib/favoritos'
import { Escudo, type EquipoTocable } from '@/components/partidosUI'
import { nombreEquipoES } from '@/lib/sports/nombresES'

/** Tope de renglones pintados: hay deportes con cientos de ligas y
 *  el buscador está para acotar; pintar todo tumba el teléfono. */
const MAX_FILAS = 100

/** Tope de equipos mostrados en la búsqueda. */
const MAX_EQUIPOS = 10

/** Minúsculas sin acentos, para buscar sin pelear con el teclado. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

type LigaCatalogo = DeporteConLigas['ligas'][number]

/** Equipo encontrado por el buscador (forma de /api/buscar). */
interface EquipoBuscado {
  leagueProviderId: string
  leagueName: string
  teamProviderId: string
  teamName: string
  badgeUrl: string | null
}

/** Un renglón de liga: nombre y etiqueta a la izquierda (abre su
 *  página) y la estrella del jugador a la derecha (seguir/dejar de
 *  seguir, sin abrir la página). */
function FilaLiga({
  liga,
  seguida,
  onVerLiga,
  onToggleLiga,
  abriendoId,
}: {
  liga: LigaCatalogo
  seguida: boolean
  onVerLiga: (leagueProviderId: string) => void
  onToggleLiga: (leagueProviderId: string) => void
  abriendoId: string | null
}) {
  return (
    <div className="w-full flex items-center gap-1 px-4 py-3 border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40 transition-colors">
      <button
        onClick={() => onVerLiga(liga.providerId)}
        disabled={abriendoId === liga.providerId}
        className="flex-1 min-w-0 text-left disabled:opacity-60"
      >
        <span className="block font-bold text-white text-sm truncate">
          {getSupportedLeague(liga.providerId)?.name ?? liga.name}
        </span>
        <span className="block text-slate-500 text-[11px] font-bold uppercase tracking-widest">
          {liga.curada ? 'Del club' : 'Ver liga'}
        </span>
      </button>
      <button
        onClick={() => onToggleLiga(liga.providerId)}
        title={seguida ? 'Quitar de tus ligas' : 'Agregar a tus ligas'}
        aria-label={seguida ? 'Quitar de tus ligas' : 'Agregar a tus ligas'}
        className={`shrink-0 px-2 py-1.5 rounded-lg text-lg leading-none transition-all ${
          seguida ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'
        }`}
      >
        {seguida ? '★' : '☆'}
      </button>
      {abriendoId === liga.providerId ? (
        <span className="text-cyan-400 text-xs font-bold animate-pulse shrink-0">
          Abriendo…
        </span>
      ) : (
        <span className="text-slate-500 shrink-0">→</span>
      )}
    </div>
  )
}

export default function ExploradorLigas({
  onVerLiga,
  abriendoId,
  favoritos,
  onToggleLiga,
  onVerEquipo,
}: {
  /** Abrir la página de la liga (curada o del catálogo). */
  onVerLiga: (leagueProviderId: string) => void
  /** Liga cuyo detalle se está cargando (feedback en su renglón). */
  abriendoId: string | null
  /** Favoritos del jugador (las ligas seguidas mandan en la estrella). */
  favoritos: Favoritos
  /** Seguir / dejar de seguir una liga (estrella). */
  onToggleLiga: (leagueProviderId: string) => void
  /** Abrir la página de un equipo encontrado en el buscador. */
  onVerEquipo: EquipoTocable
}) {
  const [deportes, setDeportes] = useState<DeporteConLigas[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deporte, setDeporte] = useState('Soccer')
  const [texto, setTexto] = useState('')
  const [equipos, setEquipos] = useState<EquipoBuscado[]>([])
  const [buscandoEquipos, setBuscandoEquipos] = useState(false)

  useEffect(() => {
    let activo = true
    fetch('/api/ligas-catalogo')
      .then((r) => r.json())
      .then((d) => {
        if (!activo) return
        if (d?.error) throw new Error(d.error)
        setDeportes(d.sports || [])
      })
      .catch((e) => {
        if (activo) {
          setError(
            e instanceof Error
              ? e.message
              : 'No se pudo cargar el catálogo de ligas.'
          )
        }
      })
    return () => {
      activo = false
    }
  }, [])

  // Equipos que coinciden con la búsqueda (misma fuente de la app:
  // /api/buscar busca en las ligas soportadas, con nombres en
  // español). Con debounce para no pedir por cada tecla.
  useEffect(() => {
    const q = texto.trim()
    if (q.length < 2) {
      setEquipos([])
      setBuscandoEquipos(false)
      return
    }
    setBuscandoEquipos(true)
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setEquipos(
          ((data.equipos || []) as EquipoBuscado[]).slice(0, MAX_EQUIPOS)
        )
      } catch {
        setEquipos([])
      } finally {
        setBuscandoEquipos(false)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [texto])

  const seguidasSet = useMemo(
    () => new Set(favoritos.ligas),
    [favoritos.ligas]
  )

  const ligasDelDeporte = useMemo(() => {
    if (!deportes) return []
    return deportes.find((d) => d.sport === deporte)?.ligas || []
  }, [deportes, deporte])

  const buscando = normalizar(texto).length > 0

  /** Ligas del deporte que coinciden con el texto (todas si no hay). */
  const ligasFiltradas = useMemo(() => {
    const q = normalizar(texto)
    if (!q) return ligasDelDeporte
    return ligasDelDeporte.filter((l) => {
      // Busca por el nombre del proveedor y por el nombre curado en
      // español si la liga es del Club ("Premier League").
      const visible = getSupportedLeague(l.providerId)?.name ?? l.name
      return normalizar(l.name).includes(q) || normalizar(visible).includes(q)
    })
  }, [ligasDelDeporte, texto])

  /** Sección "⭐ Tus ligas": las seguidas de este deporte (solo sin
   *  búsqueda; buscando van al frente de la lista única). */
  const tusLigas = useMemo(
    () =>
      buscando
        ? []
        : ligasDelDeporte.filter((l) => seguidasSet.has(l.providerId)),
    [buscando, ligasDelDeporte, seguidasSet]
  )

  /** La lista principal: buscando, favoritas primero; sin buscar,
   *  las seguidas ya viven en su sección y aquí no se repiten. */
  const visibles = useMemo(() => {
    if (buscando) return ordenarConFavoritas(ligasFiltradas, favoritos.ligas)
    return ligasFiltradas.filter((l) => !seguidasSet.has(l.providerId))
  }, [buscando, ligasFiltradas, favoritos.ligas, seguidasSet])

  if (!deportes && !error) {
    return (
      <div className="text-cyan-400 font-bold animate-pulse py-20">
        Cargando todas las ligas...
      </div>
    )
  }

  if (error && !deportes) {
    return (
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-bold">⚠️ {error}</p>
      </div>
    )
  }

  const fila = (l: LigaCatalogo) => (
    <FilaLiga
      key={l.providerId}
      liga={l}
      seguida={seguidasSet.has(l.providerId)}
      onVerLiga={onVerLiga}
      onToggleLiga={onToggleLiga}
      abriendoId={abriendoId}
    />
  )

  const sinResultados =
    buscando && visibles.length === 0 && equipos.length === 0 && !buscandoEquipos

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 animate-in fade-in duration-500">
      {/* ── Chips de deporte ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {(deportes || []).map((d) => (
          <button
            key={d.sport}
            onClick={() => setDeporte(d.sport)}
            className={`shrink-0 px-3.5 py-2 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${
              deporte === d.sport
                ? 'bg-cyan-600 text-white shadow-[0_0_18px_rgba(8,145,178,0.4)]'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {d.nombreES}{' '}
            <span className="opacity-60 normal-case tracking-normal">
              {d.ligas.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Buscador: ligas de este deporte y equipos de la app ── */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800/50">
        <span className="text-lg">🔎</span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Busca una liga o un equipo…"
          className="flex-1 bg-transparent outline-none text-white font-bold text-sm placeholder:text-slate-500 min-w-0"
        />
        {buscandoEquipos && (
          <span className="text-cyan-400 text-xs font-bold animate-pulse shrink-0">
            Buscando…
          </span>
        )}
        {texto && (
          <button
            onClick={() => setTexto('')}
            className="shrink-0 text-slate-400 hover:text-white font-black"
            title="Limpiar"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── ⭐ Tus ligas (las seguidas de este deporte) ── */}
      {!buscando && tusLigas.length > 0 && (
        <div>
          <h3 className="font-black text-white text-xs uppercase tracking-widest px-1 mb-2">
            ⭐ Tus ligas
          </h3>
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden">
            {tusLigas.map(fila)}
          </div>
        </div>
      )}

      {/* ── Equipos encontrados ── */}
      {buscando && equipos.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 font-black text-xs uppercase tracking-widest text-white">
            Equipos
          </div>
          <div>
            {equipos.map((e) => (
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

      {/* ── Lista de ligas ── */}
      {sinResultados ? (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-slate-300 font-bold text-sm">
            Sin ligas ni equipos para “{texto.trim()}”. Prueba con otro
            nombre.
          </p>
        </div>
      ) : visibles.length > 0 ? (
        <div className="bg-slate-900/80 border border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden">
          {visibles.slice(0, MAX_FILAS).map(fila)}
        </div>
      ) : buscando || tusLigas.length > 0 ? null : (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-slate-300 font-bold text-sm">
            Este deporte no trae ligas en el catálogo.
          </p>
        </div>
      )}

      {visibles.length > MAX_FILAS && (
        <p className="text-center text-slate-500 text-xs font-medium">
          Se muestran las primeras {MAX_FILAS} de {visibles.length}{' '}
          ligas. Escribe en el buscador para encontrar la tuya.
        </p>
      )}
    </div>
  )
}
