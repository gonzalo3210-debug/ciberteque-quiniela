'use client'
// src/components/AsistenteJornada.tsx
//
// ✨ ASISTENTE GRÁFICO DE JORNADAS (admin)
//
// Creador por pasos con tarjetas grandes y táctiles, pensado para el
// celular: 1) Tu jornada (nombre, cierre y modalidad), 2) Partidos
// desde la API o a mano —o el bombo de 8 escudos en sorteo—,
// 3) Precio y premio, 4) Resumen visual y Publicar.
//
// NO es otro formulario: escribe en el MISMO estado de
// useCreadorJornadas que el formulario clásico (los setters y acciones
// llegan por props desde ModuloJornadasEquipos) y publica con la
// MISMA crearJornadaCompleta (el onCrear de props es el handleCrear
// de siempre). Cambiar entre asistente y clásico a mitad de camino no
// pierde nada: el estado —y el borrador automático— es uno solo.

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { SUPPORTED_LEAGUES } from '@/lib/sports/leagues'
import {
  utcADatetimeLocalMazatlan,
  textoFechaMazatlan,
} from '@/lib/fechaMazatlan'
import { construirPayloadJornada } from '@/lib/crearJornadaPayload'
import {
  ETIQUETAS_MODALIDAD,
  ETIQUETAS_PREMIACION,
  PASOS_ASISTENTE,
  faltantesAsistente,
  pasoCompleto,
  resumenAsistente,
  siguientePrecio,
} from '@/lib/asistenteJornada'
import type { PartidoInput } from '@/hooks/useCreadorJornadas'

/** Partido tal como lo devuelve /api/importar-jornada (igual que en el módulo clásico). */
interface FixtureImportable {
  providerId: string
  homeTeam: string
  awayTeam: string
  homeTeamES: string
  awayTeamES: string
  kickoffUtc: string | null
  round: number | null
  venue: string | null
  terminado: boolean
  homeScore: number | null
  awayScore: number | null
}

interface AsistenteJornadaProps {
  f: any
  s: any
  a: any
  e: any
  equipos: any[]
  onCrear: () => void
  onClasico: () => void
}

export default function AsistenteJornada({
  f,
  s,
  a,
  equipos,
  e,
  onCrear,
  onClasico,
}: AsistenteJornadaProps) {
  const [paso, setPaso] = useState(0)
  const [busquedaBombo, setBusquedaBombo] = useState('')

  // --- Importar desde la API (misma ruta y misma acción que el clásico) ---
  const [impLiga, setImpLiga] = useState('4350')
  const [impModo, setImpModo] = useState<'ronda' | 'fechas'>('ronda')
  const [impRonda, setImpRonda] = useState('')
  const [impDesde, setImpDesde] = useState('')
  const [impHasta, setImpHasta] = useState('')
  const [impResultados, setImpResultados] = useState<FixtureImportable[] | null>(null)
  const [impSeleccionados, setImpSeleccionados] = useState<Set<string>>(new Set())
  const [impBuscando, setImpBuscando] = useState(false)
  const [impOrigen, setImpOrigen] = useState<'proximos' | 'manual' | null>(null)
  const [impTitulo, setImpTitulo] = useState('')
  const [impLigasFutbol, setImpLigasFutbol] = useState<{ providerId: string; name: string }[]>([])

  // --- Agregar a mano desde el catálogo ---
  const [manualLocal, setManualLocal] = useState('')
  const [manualVisita, setManualVisita] = useState('')
  const [manualFecha, setManualFecha] = useState('')

  const mapaLogos = useMemo(() => {
    const mapa: Record<string, string> = {}
    ;(equipos || []).forEach((eq: any) => {
      if (eq.nombre) mapa[eq.nombre.toLowerCase().trim()] = eq.logo_url
    })
    return mapa
  }, [equipos])
  const logoDe = (nombre: string) =>
    mapaLogos[(nombre || '').toLowerCase().trim()]

  const equiposOrdenados = useMemo(
    () =>
      [...(equipos || [])].sort((x: any, y: any) =>
        (x.nombre || '').localeCompare(y.nombre || '', 'es')
      ),
    [equipos]
  )

  const cargarCatalogoFutbol = async () => {
    if (impLigasFutbol.length > 0) return
    try {
      const res = await fetch('/api/ligas-catalogo')
      const data = await res.json()
      if (!res.ok) return
      const soccer = (data.sports || []).find((d: any) => d.sport === 'Soccer')
      if (soccer) {
        setImpLigasFutbol(
          (soccer.ligas || []).map((l: any) => ({
            providerId: l.providerId,
            name: l.name,
          }))
        )
      }
    } catch {
      // Sin catálogo dinámico: el selector conserva las del Club.
    }
  }

  const aplicarResultadosImportables = (fixtures: FixtureImportable[]) => {
    setImpResultados(fixtures)
    setImpSeleccionados(
      new Set(fixtures.filter((fx) => !fx.terminado).map((fx) => fx.providerId))
    )
  }

  const cargarProximos = async (ligaId: string) => {
    setImpBuscando(true)
    setImpResultados(null)
    try {
      const res = await fetch(`/api/importar-jornada?liga=${ligaId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los partidos.')
      aplicarResultadosImportables(data.fixtures || [])
      setImpOrigen('proximos')
      const nombreLiga = data.league?.name || 'la liga'
      const rondaTxt =
        data.round !== null && data.round !== undefined
          ? ` · Jornada ${data.round}`
          : ''
      setImpTitulo(
        data.esMasReciente
          ? `${nombreLiga}${rondaTxt} — la más reciente (ya no quedan partidos pendientes)`
          : `Lo que sigue — ${nombreLiga}${rondaTxt}`
      )
    } catch (error: any) {
      setImpOrigen(null)
      setImpTitulo('')
      toast.error(error.message || 'Error al consultar la API.')
    } finally {
      setImpBuscando(false)
    }
  }

  // Al entrar al paso de partidos (modos por puntos) se carga "lo que
  // sigue", igual que al abrir el panel en el formulario clásico.
  useEffect(() => {
    if (paso === 1 && f.modalidad !== 'sorteo' && impResultados === null && !impBuscando) {
      cargarCatalogoFutbol()
      cargarProximos(impLiga)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, f.modalidad])

  const handleBuscarImportables = async () => {
    const params = new URLSearchParams({ liga: impLiga })
    if (impModo === 'ronda') {
      if (!impRonda || parseInt(impRonda) < 1)
        return toast.error('Escribe el número de jornada (ronda) a importar.')
      params.set('ronda', impRonda)
    } else {
      if (!impDesde || !impHasta)
        return toast.error('Elige la fecha inicial y la final.')
      params.set('desde', impDesde)
      params.set('hasta', impHasta)
    }
    setImpBuscando(true)
    setImpResultados(null)
    try {
      const res = await fetch(`/api/importar-jornada?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los partidos.')
      const fixtures: FixtureImportable[] = data.fixtures || []
      aplicarResultadosImportables(fixtures)
      setImpOrigen('manual')
      setImpTitulo(
        impModo === 'ronda'
          ? `Búsqueda manual — Jornada ${impRonda}`
          : 'Búsqueda manual — por fechas'
      )
      if (fixtures.length === 0)
        toast('Esa liga no trae partidos para ese criterio.', { icon: 'ℹ️' })
    } catch (error: any) {
      toast.error(error.message || 'Error al consultar la API.')
    } finally {
      setImpBuscando(false)
    }
  }

  const toggleImportable = (providerId: string) => {
    setImpSeleccionados((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(providerId)) nuevo.delete(providerId)
      else nuevo.add(providerId)
      return nuevo
    })
  }

  const handleAgregarImportados = () => {
    if (!impResultados) return
    const elegidos = impResultados.filter((fx) => impSeleccionados.has(fx.providerId))
    if (elegidos.length === 0) return toast.error('No hay ningún partido marcado.')
    const nuevos: PartidoInput[] = elegidos.map((fx) => ({
      local: fx.homeTeamES,
      visitante: fx.awayTeamES,
      fecha_hora: utcADatetimeLocalMazatlan(fx.kickoffUtc),
      api_fixture_id: fx.providerId,
    }))
    const { agregados, omitidos } = a.agregarPartidosImportados(nuevos)
    if (agregados > 0) {
      toast.success(
        `Se agregaron ${agregados} partido(s) a la jornada.${omitidos > 0 ? ` (${omitidos} ya estaban, se omitieron.)` : ''}`
      )
      setImpResultados(null)
      setImpSeleccionados(new Set())
      setImpOrigen(null)
      setImpTitulo('')
    } else {
      toast('Todos esos partidos ya están en la jornada.', { icon: 'ℹ️' })
    }
  }

  const handleAgregarManual = () => {
    if (!manualLocal || !manualVisita)
      return toast.error('Elige el equipo local y el visitante.')
    if (manualLocal === manualVisita)
      return toast.error('El local y el visitante no pueden ser el mismo equipo.')
    const { agregados } = a.agregarPartidosImportados([
      { local: manualLocal, visitante: manualVisita, fecha_hora: manualFecha },
    ])
    if (agregados > 0) {
      toast.success('Partido agregado a la jornada.')
      setManualLocal('')
      setManualVisita('')
    }
  }

  // Renglones con contenido (el renglón en blanco inicial no se muestra:
  // el asistente publica solo partidos completos).
  const renglonesVisibles = (f.partidosNuevos || [])
    .map((p: PartidoInput, idx: number) => ({ p, idx }))
    .filter(
      ({ p }: any) =>
        p.local.trim() !== '' ||
        p.visitante.trim() !== '' ||
        p.fecha_hora !== '' ||
        p.api_fixture_id
    )

  const faltantes = faltantesAsistente(f)
  const payload = useMemo(() => {
    try {
      return construirPayloadJornada(f)
    } catch {
      return null
    }
  }, [f])
  const resumen = payload ? resumenAsistente(f, payload, equipos || []) : null

  const puedeAvanzar = pasoCompleto(f, paso)

  return (
    <div className="space-y-4">
      {/* Encabezado y cambio al formulario clásico */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3">
        <div>
          <h3 className="text-white font-black uppercase tracking-widest text-sm">
            ✨ Asistente de jornada
          </h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-0.5">
            Paso a paso · el borrador se guarda solo
          </p>
        </div>
        <button
          type="button"
          onClick={onClasico}
          className="shrink-0 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider px-3 py-2.5 rounded-lg transition-all"
        >
          📝 Formulario clásico
        </button>
      </div>

      {/* Indicador de pasos */}
      <div className="grid grid-cols-4 gap-1.5">
        {PASOS_ASISTENTE.map((nombre, i) => (
          <button
            key={nombre}
            type="button"
            onClick={() => {
              if (i < paso) setPaso(i)
            }}
            className={`py-2.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider border transition-all ${
              i === paso
                ? 'bg-green-600 border-green-400 text-white shadow-md'
                : i < paso
                  ? 'bg-slate-900 border-green-900 text-green-400'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}
          >
            {i + 1}. {i === 1 && f.modalidad === 'sorteo' ? 'El bombo' : nombre}
          </button>
        ))}
      </div>

      {/* ---------- PASO 1 · TU JORNADA ---------- */}
      {paso === 0 && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 block tracking-wider">
                Nombre de la jornada
              </label>
              <input
                type="text"
                placeholder="Ej. LMX J18"
                value={f.nombreJornada}
                onChange={(ev) => s.setNombreJornada(ev.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-white outline-none focus:border-green-500 transition-all text-sm font-bold placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 block tracking-wider">
                Cierre de la quiniela
              </label>
              <input
                type="datetime-local"
                value={f.fechaCierre}
                onChange={(ev) => s.setFechaCierre(ev.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-white outline-none focus:border-green-500 transition-all text-sm font-bold"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-black uppercase mb-2 block tracking-wider">
              ¿Cómo se juega?
            </label>
            <div className="space-y-2.5">
              {(Object.keys(ETIQUETAS_MODALIDAD) as (keyof typeof ETIQUETAS_MODALIDAD)[]).map(
                (clave) => {
                  const et = ETIQUETAS_MODALIDAD[clave]
                  const activa = f.modalidad === clave
                  return (
                    <button
                      key={clave}
                      type="button"
                      onClick={() => s.setModalidad(clave)}
                      className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                        activa
                          ? 'bg-green-950/40 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.25)]'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-4xl shrink-0">{et.icono}</span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={`block font-black uppercase tracking-wide text-sm ${activa ? 'text-green-400' : 'text-white'}`}
                        >
                          {et.titulo}
                        </span>
                        <span className="block text-slate-400 text-xs leading-relaxed mt-0.5">
                          {et.descripcion}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${activa ? 'bg-green-500 border-green-400 text-white' : 'border-slate-600 text-transparent'}`}
                      >
                        ✓
                      </span>
                    </button>
                  )
                }
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- PASO 2 · EL BOMBO (SORTEO) ---------- */}
      {paso === 1 && f.modalidad === 'sorteo' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="bg-blue-950/20 border border-blue-900/50 p-4 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div>
                <h4 className="text-blue-400 font-black uppercase text-sm tracking-widest">
                  🎲 Elige los 8 equipos del bombo
                </h4>
                <p className="text-slate-400 text-xs mt-1">
                  Llevas:{' '}
                  <strong
                    className={
                      (f.equiposSorteo?.length || 0) === 8
                        ? 'text-green-400'
                        : 'text-amber-400'
                    }
                  >
                    {f.equiposSorteo?.length || 0}/8
                  </strong>
                </p>
              </div>
              <button
                onClick={a.clonarUltimoSorteo}
                type="button"
                className="bg-blue-900 hover:bg-blue-800 text-blue-100 text-[10px] font-black uppercase px-4 py-3 rounded-lg border border-blue-700 transition-all shadow-md shrink-0"
              >
                ♻️ Clonar sorteo anterior
              </button>
            </div>

            <input
              type="text"
              placeholder="Buscar equipo o país..."
              value={busquedaBombo}
              onChange={(ev) => setBusquedaBombo(ev.target.value)}
              className="w-full bg-slate-950 border border-blue-900/50 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 font-bold placeholder:text-slate-600"
            />

            <div className="grid grid-cols-4 gap-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {equiposOrdenados
                .filter((eq: any) =>
                  eq.nombre.toLowerCase().includes(busquedaBombo.toLowerCase())
                )
                .map((eq: any) => {
                  const seleccionado = f.equiposSorteo?.includes(eq.id)
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => a.toggleEquipoSorteo(eq.id)}
                      className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all border-2 shadow-sm active:scale-95 ${
                        seleccionado
                          ? 'bg-blue-600 border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)]'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className="w-12 h-12 flex items-center justify-center bg-slate-950 rounded-full border border-slate-800/80 p-1.5">
                        <img
                          src={eq.logo_url}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={(evt: any) => {
                            evt.target.src =
                              'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
                          }}
                        />
                      </span>
                      <span
                        className={`text-[9px] font-bold truncate uppercase w-full text-center ${seleccionado ? 'text-white' : 'text-slate-400'}`}
                      >
                        {eq.nombre}
                      </span>
                    </button>
                  )
                })}
            </div>

            {(f.equiposSorteo?.length || 0) === 8 && (
              <p className="text-center text-green-400 font-black uppercase tracking-widest text-xs bg-green-950/30 border border-green-900/50 rounded-xl py-3">
                ✅ ¡Bombo completo!
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------- PASO 2 · PARTIDOS (POR PUNTOS) ---------- */}
      {paso === 1 && f.modalidad !== 'sorteo' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-2xl p-4 space-y-3">
            <h4 className="text-emerald-400 font-black uppercase text-sm tracking-widest">
              🌐 Partidos desde la API
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Liga</label>
                <select
                  value={impLiga}
                  onChange={(ev) => {
                    setImpLiga(ev.target.value)
                    cargarProximos(ev.target.value)
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold"
                >
                  <optgroup label="⭐ Ligas del club">
                    {SUPPORTED_LEAGUES.map((l) => (
                      <option key={l.providerId} value={l.providerId}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                  {impLigasFutbol.length > 0 && (
                    <optgroup label="🌎 Todas las ligas de fútbol">
                      {impLigasFutbol
                        .filter(
                          (l) =>
                            !SUPPORTED_LEAGUES.some(
                              (c) => c.providerId === l.providerId
                            )
                        )
                        .map((l) => (
                          <option key={l.providerId} value={l.providerId}>
                            {l.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Buscar por</label>
                <select
                  value={impModo}
                  onChange={(ev: any) => {
                    setImpModo(ev.target.value)
                    setImpResultados(null)
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold"
                >
                  <option value="ronda">Número de jornada</option>
                  <option value="fechas">Rango de fechas</option>
                </select>
              </div>
              {impModo === 'ronda' ? (
                <div>
                  <label className="text-[9px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Jornada (ronda)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ej. 17"
                    value={impRonda}
                    onChange={(ev) => setImpRonda(ev.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold text-center"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Desde</label>
                    <input
                      type="date"
                      value={impDesde}
                      onChange={(ev) => setImpDesde(ev.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-3 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Hasta</label>
                    <input
                      type="date"
                      value={impHasta}
                      onChange={(ev) => setImpHasta(ev.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-3 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleBuscarImportables}
              disabled={impBuscando}
              className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${impBuscando ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-[0.99]'}`}
            >
              {impBuscando ? 'Consultando la API...' : '🔎 Buscar partidos'}
            </button>

            {impResultados !== null && (
              <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 truncate">
                  📍 {impTitulo}
                </span>
                {impOrigen === 'manual' && (
                  <button
                    type="button"
                    onClick={() => cargarProximos(impLiga)}
                    disabled={impBuscando}
                    className="shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1.5 rounded transition-all disabled:opacity-40"
                  >
                    ↩ Volver a lo que sigue
                  </button>
                )}
              </div>
            )}

            {impBuscando && impResultados === null && (
              <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Cargando partidos…
              </p>
            )}
            {impResultados !== null && impResultados.length === 0 && (
              <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Sin partidos para mostrar.
              </p>
            )}

            {impResultados !== null && impResultados.length > 0 && (
              <div className="space-y-2">
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                  {impResultados.map((fx) => {
                    const marcado = impSeleccionados.has(fx.providerId)
                    const logoL = logoDe(fx.homeTeamES)
                    const logoV = logoDe(fx.awayTeamES)
                    return (
                      <button
                        key={fx.providerId}
                        type="button"
                        onClick={() => toggleImportable(fx.providerId)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all active:scale-[0.99] ${marcado ? 'bg-emerald-900/30 border-emerald-600' : 'bg-slate-950/60 border-slate-800 opacity-70'}`}
                      >
                        <span
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${marcado ? 'bg-emerald-500' : 'bg-slate-700'}`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${marcado ? 'left-[22px]' : 'left-0.5'}`}
                          />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 text-xs font-bold text-white uppercase">
                            {logoL && <img src={logoL} alt="" className="w-5 h-5 object-contain shrink-0" />}
                            <span className="truncate">{fx.homeTeamES}</span>
                            <span className="text-slate-500 italic normal-case shrink-0">vs</span>
                            <span className="truncate">{fx.awayTeamES}</span>
                            {logoV && <img src={logoV} alt="" className="w-5 h-5 object-contain shrink-0" />}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                            {textoFechaMazatlan(fx.kickoffUtc)}
                            {fx.round !== null ? ` · Jornada ${fx.round}` : ''}
                            {fx.venue ? ` · ${fx.venue}` : ''}
                          </span>
                          {fx.terminado && (
                            <span className="inline-block text-[8px] font-black uppercase tracking-wider text-slate-300 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded mt-1">
                              ✅ Finalizado{fx.homeScore !== null && fx.awayScore !== null ? ` · ${fx.homeScore} - ${fx.awayScore}` : ''}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleAgregarImportados}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs transition-all shadow-md active:scale-[0.99]"
                >
                  ➕ Agregar marcados ({impSeleccionados.size})
                </button>
              </div>
            )}
          </div>

          {/* Agregar a mano desde el catálogo */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-slate-300 font-black uppercase text-xs tracking-widest">
              ✍️ Agregar un partido a mano
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={manualLocal}
                onChange={(ev) => setManualLocal(ev.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-green-500 text-xs font-bold"
              >
                <option value="">Local…</option>
                {equiposOrdenados.map((eq: any) => (
                  <option key={eq.id} value={eq.nombre}>
                    {eq.nombre}
                  </option>
                ))}
              </select>
              <select
                value={manualVisita}
                onChange={(ev) => setManualVisita(ev.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-green-500 text-xs font-bold"
              >
                <option value="">Visita…</option>
                {equiposOrdenados.map((eq: any) => (
                  <option key={eq.id} value={eq.nombre}>
                    {eq.nombre}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={manualFecha}
                onChange={(ev) => setManualFecha(ev.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-green-500 text-xs font-bold"
              />
            </div>
            <button
              type="button"
              onClick={handleAgregarManual}
              className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-black uppercase tracking-widest text-xs transition-all active:scale-[0.99]"
            >
              ➕ Agregar a la jornada
            </button>
          </div>

          {/* La jornada hasta ahora */}
          <div>
            <h4 className="text-slate-300 font-black uppercase text-xs tracking-widest mb-2">
              🎟️ Tu jornada lleva {renglonesVisibles.length} partido(s)
            </h4>
            {renglonesVisibles.length === 0 ? (
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider text-center bg-slate-950/40 border border-slate-800 rounded-xl py-5">
                Todavía no agregas partidos
              </p>
            ) : (
              <div className="space-y-2">
                {renglonesVisibles.map(({ p, idx }: any) => {
                  const logoL = logoDe(p.local)
                  const logoV = logoDe(p.visitante)
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2 text-xs font-bold uppercase text-slate-100">
                        {logoL ? <img src={logoL} alt="" className="w-6 h-6 object-contain shrink-0" /> : null}
                        <span className="truncate">{p.local || '—'}</span>
                        <span className="text-slate-600 italic shrink-0">vs</span>
                        <span className="truncate">{p.visitante || '—'}</span>
                        {logoV ? <img src={logoV} alt="" className="w-6 h-6 object-contain shrink-0" /> : null}
                      </div>
                      {p.api_fixture_id && (
                        <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-1.5 py-0.5 rounded shrink-0">
                          🔗 API
                        </span>
                      )}
                      <span className="text-[9px] text-slate-500 font-bold shrink-0 hidden sm:block">
                        {p.fecha_hora
                          ? textoFechaMazatlan(new Date(p.fecha_hora).toISOString())
                          : 'Sin horario'}
                      </span>
                      <button
                        type="button"
                        onClick={() => a.eliminarPartido(idx)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center bg-red-950/30 border border-red-900/50 rounded-lg text-red-400 hover:bg-red-900/50 transition-all"
                        title="Quitar de la jornada"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- PASO 3 · PRECIO Y PREMIO ---------- */}
      {paso === 2 && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <label className="text-[10px] text-slate-400 font-black uppercase mb-3 block tracking-wider text-center">
              Precio del {f.modalidad === 'sorteo' ? 'pase' : 'boleto'} (créditos)
            </label>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => s.setPrecioTicket(siguientePrecio(f.precioTicket, -5))}
                className="w-12 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-black text-sm transition-all active:scale-95"
              >
                −5
              </button>
              <button
                type="button"
                onClick={() => s.setPrecioTicket(siguientePrecio(f.precioTicket, -1))}
                className="w-12 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-black text-lg transition-all active:scale-95"
              >
                −
              </button>
              <input
                type="number"
                value={f.precioTicket}
                onChange={(ev) => s.setPrecioTicket(ev.target.value)}
                className="w-24 bg-slate-950 border-2 border-slate-700 rounded-xl py-3 text-center text-3xl font-black text-white focus:border-green-500 outline-none"
              />
              <button
                type="button"
                onClick={() => s.setPrecioTicket(siguientePrecio(f.precioTicket, 1))}
                className="w-12 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-black text-lg transition-all active:scale-95"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => s.setPrecioTicket(siguientePrecio(f.precioTicket, 5))}
                className="w-12 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-black text-sm transition-all active:scale-95"
              >
                +5
              </button>
            </div>
            <p className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-3">
              0 = jornada gratis (promocional)
            </p>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-black uppercase mb-2 block tracking-wider">
              ¿Cómo se reparte el premio?
            </label>
            <div className="space-y-2.5">
              {(Object.keys(ETIQUETAS_PREMIACION) as (keyof typeof ETIQUETAS_PREMIACION)[]).map(
                (clave) => {
                  const et = ETIQUETAS_PREMIACION[clave]
                  const activa = f.tipoPremiacion === clave
                  return (
                    <button
                      key={clave}
                      type="button"
                      onClick={() => s.setTipoPremiacion(clave)}
                      className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                        activa
                          ? 'bg-purple-950/40 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-3xl shrink-0">{et.icono}</span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={`block font-black uppercase tracking-wide text-sm ${activa ? 'text-purple-300' : 'text-white'}`}
                        >
                          {et.titulo}
                        </span>
                        <span className="block text-slate-400 text-xs leading-relaxed mt-0.5">
                          {et.descripcion}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${activa ? 'bg-purple-500 border-purple-400 text-white' : 'border-slate-600 text-transparent'}`}
                      >
                        ✓
                      </span>
                    </button>
                  )
                }
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => s.setSoloAdmins(!f.soloAdmins)}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.99] ${f.soloAdmins ? 'bg-red-950/30 border-red-800' : 'bg-slate-900/60 border-slate-800'}`}
          >
            <span
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${f.soloAdmins ? 'bg-red-500' : 'bg-slate-700'}`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${f.soloAdmins ? 'left-[22px]' : 'left-0.5'}`}
              />
            </span>
            <span className="text-left">
              <span className="block text-red-400 font-black uppercase tracking-widest text-xs">
                Ocultar a clientes
              </span>
              <span className="block text-slate-500 text-[10px] uppercase tracking-wider font-bold mt-0.5">
                Solo visible en mostrador / modo prueba
              </span>
            </span>
          </button>
        </div>
      )}

      {/* ---------- PASO 4 · RESUMEN ---------- */}
      {paso === 3 && resumen && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="bg-slate-900/60 border-2 border-slate-700 rounded-2xl overflow-hidden">
            <div className="bg-slate-950/60 px-5 py-4 border-b border-slate-800 text-center">
              <span className="text-4xl block mb-1">{resumen.modalidad.icono}</span>
              <h4 className="text-white font-black uppercase tracking-widest text-lg leading-tight">
                {resumen.nombre || 'Sin nombre'}
              </h4>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                {resumen.modalidad.titulo}
                {resumen.soloAdmins ? ' · 🙈 Oculta a clientes' : ''}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl py-3">
                  <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest">Precio</span>
                  <span className="block text-white font-black text-xl mt-0.5">
                    {resumen.precio === 0 ? 'GRATIS' : `$${resumen.precio}`}
                  </span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl py-3">
                  <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest">Premiación</span>
                  <span className="block text-white font-black text-sm mt-1 leading-tight px-1">
                    {resumen.premiacion.titulo}
                  </span>
                </div>
              </div>
              <p className="text-center text-slate-400 text-xs">
                Cierre:{' '}
                <strong className="text-slate-200">
                  {f.fechaCierre
                    ? textoFechaMazatlan(new Date(f.fechaCierre).toISOString())
                    : 'sin definir'}
                </strong>
              </p>

              {f.modalidad === 'sorteo' ? (
                <div>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest text-center mb-2">
                    El bombo ({resumen.equiposBombo.length}/8)
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {resumen.equiposBombo.map((nombre, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 bg-blue-950/40 border border-blue-900/60 text-blue-200 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg"
                      >
                        {logoDe(nombre) && (
                          <img src={logoDe(nombre)} alt="" className="w-4 h-4 object-contain" />
                        )}
                        {nombre}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest text-center mb-2">
                    Partidos ({resumen.partidos.length})
                  </p>
                  <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                    {resumen.partidos.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-bold uppercase text-slate-200"
                      >
                        <span className="truncate">
                          {p.equipo_local} <span className="text-slate-600 italic">vs</span> {p.equipo_visitante}
                        </span>
                        <span className="text-slate-500 text-[9px] shrink-0">
                          {p.fecha_hora_partido
                            ? textoFechaMazatlan(p.fecha_hora_partido)
                            : 'Sin horario'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {faltantes.length > 0 ? (
            <div className="bg-red-950/30 border border-red-900/60 rounded-xl p-4 space-y-1.5">
              <p className="text-red-400 font-black uppercase tracking-widest text-[10px]">
                ⚠️ Antes de publicar falta:
              </p>
              {faltantes.map((falta, i) => (
                <p key={i} className="text-red-300 text-xs font-bold">
                  • {falta.mensaje}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-center text-green-400 font-black uppercase tracking-widest text-xs bg-green-950/30 border border-green-900/50 rounded-xl py-3">
              ✅ Todo listo para publicar
            </p>
          )}

          <button
            onClick={onCrear}
            disabled={e.creando || faltantes.length > 0}
            className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.15em] transition-all flex justify-center items-center gap-2 text-sm ${e.creando || faltantes.length > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:scale-[1.01] active:scale-95'}`}
          >
            {e.creando ? 'Procesando...' : <><span>🚀</span> Publicar jornada en CiberTeque</>}
          </button>
        </div>
      )}

      {/* Navegación entre pasos */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => setPaso(Math.max(0, paso - 1))}
          disabled={paso === 0}
          className="flex-1 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-black uppercase tracking-widest text-xs transition-all disabled:opacity-30 active:scale-[0.99]"
        >
          ← Atrás
        </button>
        {paso < 3 && (
          <button
            type="button"
            onClick={() => setPaso(paso + 1)}
            disabled={!puedeAvanzar}
            className={`flex-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${puedeAvanzar ? 'bg-green-600 hover:bg-green-500 text-white shadow-md active:scale-[0.99]' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}`}
          >
            Siguiente →
          </button>
        )}
      </div>
    </div>
  )
}
