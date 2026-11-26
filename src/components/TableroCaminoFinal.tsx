'use client'
// src/components/TableroCaminoFinal.tsx
//
// 🏁 CAMINO A LA FINAL — el tablero del modo sorteo.
//
// Cuando el sorteo ya se ejecutó, cada pase vive o muere con su
// equipo en el cuadro eliminatorio. Este tablero lo cuenta en
// columnas por etapa (Cuartos → Semifinal → Final → 👑 Campeón)
// FORMANDO LAS LLAVES, como los brackets de liguilla que pidió
// Gonzalo: cada llave junta a los dos equipos que se enfrentan
// (escudo + equipo + su jugador, con su NÚMERO de posición), el
// que cae se apaga dentro de su llave y el que avanza se sigue
// viendo en la siguiente columna. El emparejamiento lo deriva la
// lógica pura (calcularLlavesCamino en src/lib/caminoFinal.ts):
// primero los partidos reales del cuadro y, para cuartos sin
// partidos, la siembra (1° vs 8°, 2° vs 7°, 3° vs 6°, 4° vs 5°).
// LA SIEMBRA SALE DE LA TABLA de la liga (la resuelve
// useCeremoniaSorteo con resolverSiembra y llega por la prop
// `siembra`), NUNCA del orden guardado en la quiniela: ese orden
// puede ser el de selección manual del admin y no es la siembra.
// Solo si la tabla no resolvió, se usa el orden guardado y el
// tablero lo AVISA. Las semifinales se emparejan cuando los
// partidos cargados las definen; mientras tanto sus pases se
// muestran sueltos con «emparejamiento por definir», como antes.
//
// Todo el estado se DERIVA de los resultados con la lógica pura
// (src/lib/caminoFinal.ts): nada se escribe en la base y el tablero
// se actualiza con el refresco en tiempo real de partidos que la
// Cartelera ya usa. Cuando un refresco mueve a alguien (avanza,
// cae o se corona), su ficha se anima una vez; la detección es la
// función pura detectarCambiosCamino, comparando contra la foto
// anterior. Los sonidos respetan la preferencia 🔊 de siempre
// (apagada por defecto) y solo suenan por los pases del propio
// jugador: avance = golpe, corona = fanfarria, caída = silbatazo.
// Un marcador EN VIVO no anima ni elimina: solo se avisa "en
// riesgo" como dato parcial, porque nada es oficial hasta el final.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calcularCaminoFinal,
  calcularLlavesCamino,
  colapsarIdaVuelta,
  detectarCambiosCamino,
  fotoCamino,
  infoLlaveCamino,
  normalizarNombreEquipo,
  type CambioCamino,
  type EstadoPaseCamino,
  type FotoPaseCamino,
  type LadoLlaveCamino,
  type LlaveCamino,
  type PartidoCamino,
  type PartidoLlaveInfo,
} from '@/lib/caminoFinal'
import {
  nombreCortoJugador,
  type AsignacionSorteo,
} from '@/lib/sorteoCeremonia'
import type { SiembraResuelta } from '@/lib/bomboSorteo'
import {
  leerPreferenciaSonidos,
  sonarFanfarria,
  sonarGolpe,
  sonarSilbatazo,
  vibrarGol,
} from '@/lib/sonidos'

const CLASE_CAMBIO: Record<CambioCamino, string> = {
  avanzo: 'camino-avanza',
  eliminado: 'camino-cae',
  campeon: 'camino-campeon',
}

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    const fecha = d
      .toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
      .toUpperCase()
      .replace('.', '')
    const hora = d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    return `${fecha} · ${hora}`
  } catch {
    return null
  }
}

function LineaEstado({ estado }: { estado: EstadoPaseCamino }) {
  if (estado.estado === 'campeon') {
    return (
      <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
        👑 ¡Campeón!
      </span>
    )
  }
  if (estado.estado === 'eliminado' && estado.caida) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 leading-snug">
        💀 Cayó en {estado.caida.etapaNombre} · {estado.caida.marcadorTexto}{' '}
        vs {estado.caida.rivalNombre}
      </span>
    )
  }
  const prox = estado.proximoPartido
  if (!prox) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        ⏳ Esperando rival
      </span>
    )
  }
  if (prox.enVivo) {
    return (
      <span
        className={`text-[10px] font-black uppercase tracking-wide leading-snug ${
          estado.enRiesgo ? 'text-amber-400' : 'text-emerald-400'
        }`}
      >
        🔴 En vivo {prox.golesFavor}-{prox.golesContra} vs {prox.rivalNombre}
        {prox.globalFavor != null && prox.globalContra != null
          ? ` · Global ${prox.globalFavor}-${prox.globalContra}`
          : ''}
        {estado.enRiesgo ? ' · ⚠️ en riesgo' : ''}
      </span>
    )
  }
  const fecha = fechaCorta(prox.fecha)
  if (prox.globalFavor != null && prox.globalContra != null) {
    // La vuelta de una llave cuya ida ya cayó: manda el global.
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-snug">
        Vuelta: vs {prox.rivalNombre} · Global {prox.globalFavor}-
        {prox.globalContra}
        {fecha ? ` · ${fecha}` : ''}
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-snug">
      Sigue: vs {prox.rivalNombre}
      {fecha ? ` · ${fecha}` : ''}
    </span>
  )
}

/** El numerito de siembra sobre el escudo (posición en la tabla). */
function InsigniaPosicion({ posicion }: { posicion: number }) {
  return (
    <span className="absolute -top-1.5 -left-1.5 min-w-[17px] h-[17px] px-0.5 rounded-full bg-blue-600 border border-blue-300/60 text-white text-[9px] font-black flex items-center justify-center shadow">
      {posicion}
    </span>
  )
}

/** La ficha de siempre: un pase suelto en su columna. */
function FichaPase({
  estado,
  usuarioActivoId,
  cambios,
  posicion,
}: {
  estado: EstadoPaseCamino
  usuarioActivoId?: string | null
  cambios: Map<string, CambioCamino>
  posicion?: number | null
}) {
  const esPropio =
    !!usuarioActivoId && estado.pase.usuarioId === usuarioActivoId
  const cambio = cambios.get(estado.pase.ticketId)
  return (
    <div
      className={`rounded-xl border p-2.5 flex flex-col gap-1.5 transition-colors ${
        estado.estado === 'campeon'
          ? 'bg-amber-950/40 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
          : estado.estado === 'eliminado'
            ? 'bg-slate-950/70 border-slate-800 opacity-70'
            : 'bg-slate-900 border-slate-700'
      } ${esPropio && estado.estado !== 'eliminado' ? 'ring-1 ring-amber-400/70' : ''} ${
        cambio ? CLASE_CAMBIO[cambio] : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 bg-slate-950 border border-slate-800 rounded-full p-1.5 flex items-center justify-center ${
              estado.estado === 'eliminado' ? 'grayscale' : ''
            }`}
          >
            {estado.pase.logoUrl ? (
              <img
                src={estado.pase.logoUrl}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-xs">⚽</span>
            )}
          </div>
          {posicion != null && <InsigniaPosicion posicion={posicion} />}
        </div>
        <div className="min-w-0">
          <p
            className={`font-black uppercase text-[11px] leading-tight ${
              estado.estado === 'campeon'
                ? 'text-amber-300'
                : 'text-slate-100'
            }`}
          >
            {estado.pase.nombreEquipo}
          </p>
          <p className="text-[10px] font-bold text-slate-400 leading-tight flex items-center gap-1">
            <img
              src={getAvatarUrl(estado.pase.nombreJugador, estado.pase.avatarUrl)}
              alt=""
              className="w-3.5 h-3.5 rounded-full object-cover bg-slate-800 shrink-0"
            />
            <span>
              {esPropio ? '⭐ ' : ''}
              {nombreCortoJugador(estado.pase.nombreJugador)}
            </span>
          </p>
        </div>
      </div>
      <LineaEstado estado={estado} />
    </div>
  )
}

/** Avatar del jugador: su foto si tiene; si no, iniciales. */
const getAvatarUrl = (nombre: string, url: string | null | undefined) => {
  if (url) return url
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=1e293b&color=3b82f6&size=100&bold=true`
}

/**
 * Un lado de la llave EN HORIZONTAL (pedido de Gonzalo, 2026-11-25:
 * la tarjeta vertical repetía la misma información en los dos
 * lados): escudo con su posición, equipo, jugador(es) con avatar
 * y solo su marca de estado. Los datos del partido (ida, vuelta,
 * global) van UNA vez al centro de la tarjeta, no por lado.
 */
function LadoHorizontal({
  lado,
  usuarioActivoId,
  cambios,
}: {
  lado: LadoLlaveCamino
  usuarioActivoId?: string | null
  cambios: Map<string, CambioCamino>
}) {
  const rep = lado.representante
  const estadoEquipo = rep?.estado ?? 'vivo'
  const hayPropio =
    !!usuarioActivoId &&
    lado.pases.some((e) => e.pase.usuarioId === usuarioActivoId)
  const cambiosLado = lado.pases
    .map((e) => cambios.get(e.pase.ticketId))
    .filter(Boolean) as CambioCamino[]
  const cambio = cambiosLado.includes('campeon')
    ? 'campeon'
    : cambiosLado.includes('eliminado')
      ? 'eliminado'
      : cambiosLado[0]
  const logo = rep?.pase.logoUrl ?? lado.pases[0]?.pase.logoUrl ?? null

  if (!lado.nombreEquipo) {
    return (
      <div className="flex-1 min-w-0 rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-2 flex flex-col items-center justify-center gap-1 text-center">
        <span className="text-sm">⏳</span>
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 leading-tight">
          Esperando rival
        </p>
      </div>
    )
  }

  // Cuadro ancho y centrado (pedido de Gonzalo, 2026-11-25): el
  // escudo arriba, el nombre COMPLETO del equipo debajo y el
  // jugador con su avatar y nombre + un apellido, sin cortar.
  return (
    <div
      className={`flex-1 min-w-0 rounded-lg border p-2.5 flex flex-col items-center gap-1.5 text-center transition-colors ${
        estadoEquipo === 'campeon'
          ? 'bg-amber-950/40 border-amber-500/80'
          : estadoEquipo === 'eliminado'
            ? 'bg-slate-950/70 border-slate-800 opacity-70'
            : 'bg-slate-900 border-slate-700'
      } ${hayPropio && estadoEquipo !== 'eliminado' ? 'ring-1 ring-amber-400/70' : ''} ${
        cambio ? CLASE_CAMBIO[cambio] : ''
      }`}
    >
      <div className="relative shrink-0">
        <div
          className={`w-11 h-11 bg-slate-950 border border-slate-800 rounded-full p-1 flex items-center justify-center ${
            estadoEquipo === 'eliminado' ? 'grayscale' : ''
          }`}
        >
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-sm">⚽</span>
          )}
        </div>
        {lado.posicionSiembra != null && (
          <InsigniaPosicion posicion={lado.posicionSiembra} />
        )}
      </div>
      <p
        className={`font-black uppercase text-[13px] leading-tight ${
          estadoEquipo === 'campeon' ? 'text-amber-300' : 'text-slate-100'
        }`}
      >
        {lado.nombreEquipo}
      </p>
      <div className="space-y-1 w-full">
        {lado.pases.length === 0 ? (
          <p className="text-[10px] font-bold text-slate-500">Sin pase</p>
        ) : (
          lado.pases.map((e) => (
            <p
              key={e.pase.ticketId}
              className="flex items-center justify-center gap-1.5"
            >
              <img
                src={getAvatarUrl(e.pase.nombreJugador, e.pase.avatarUrl)}
                alt=""
                className="w-6 h-6 rounded-full object-cover bg-slate-800 shrink-0"
              />
              <span className="text-[11px] font-bold text-slate-200 leading-tight">
                {!!usuarioActivoId && e.pase.usuarioId === usuarioActivoId
                  ? '⭐ '
                  : ''}
                {nombreCortoJugador(e.pase.nombreJugador)}
              </span>
            </p>
          ))
        )}
      </div>
      {estadoEquipo === 'campeon' && (
        <p className="text-[10px] font-black uppercase tracking-wide text-amber-400 leading-snug">
          🏆 ¡Campeón!
        </p>
      )}
      {estadoEquipo === 'eliminado' && rep?.caida && (
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 leading-snug">
          ✕ Cayó en {rep.caida.etapaNombre}
        </p>
      )}
      {estadoEquipo === 'vivo' && rep?.enRiesgo && (
        <p className="text-[10px] font-black uppercase tracking-wide text-amber-400 leading-snug">
          ⚠️ En riesgo
        </p>
      )}
    </div>
  )
}

/** Una línea del centro de la llave: «Ida 0-0» o «Vuelta · fecha». */
function LineaPartidoLlave({
  etiqueta,
  info,
}: {
  etiqueta: string
  info: PartidoLlaveInfo
}) {
  const conMarcador = info.golesA !== null && info.golesB !== null
  return (
    <p className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-snug">
      {etiqueta}
      {info.enVivo ? ' 🔴' : ''}:{' '}
      {conMarcador
        ? `${info.golesA}-${info.golesB}`
        : (fechaCorta(info.fecha) ?? 'Por definir')}
    </p>
  )
}

/**
 * La tarjeta de una llave EN HORIZONTAL: los dos equipos frente a
 * frente y, al centro/abajo, los datos de sus partidos una sola
 * vez (ida, vuelta y global).
 */
function TarjetaLlave({
  llave,
  usuarioActivoId,
  cambios,
  partidos,
}: {
  llave: LlaveCamino
  usuarioActivoId?: string | null
  cambios: Map<string, CambioCamino>
  partidos: PartidoCamino[]
}) {
  const [ladoA, ladoB] = llave.lados
  const info = infoLlaveCamino(
    ladoA.nombreEquipo,
    ladoB.nombreEquipo,
    partidos
  )
  return (
    <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-1.5">
      {llave.letra && (
        <p className="text-center text-[9px] font-black uppercase tracking-[0.25em] text-blue-400 pt-0.5 pb-1">
          Llave {llave.letra}
        </p>
      )}
      <div className="flex items-stretch gap-1">
        <LadoHorizontal
          lado={ladoA}
          usuarioActivoId={usuarioActivoId}
          cambios={cambios}
        />
        <div className="flex items-center justify-center px-0.5">
          <span className="text-[9px] font-black tracking-[0.2em] text-slate-500">
            VS
          </span>
        </div>
        <LadoHorizontal
          lado={ladoB}
          usuarioActivoId={usuarioActivoId}
          cambios={cambios}
        />
      </div>
      {(info.ida || info.vuelta) && (
        <div className="mt-1.5 space-y-0.5">
          {info.ida && (
            <LineaPartidoLlave
              etiqueta={info.esIdaYVuelta ? 'Ida' : 'Partido'}
              info={info.ida}
            />
          )}
          {info.vuelta && (
            <LineaPartidoLlave etiqueta="Vuelta" info={info.vuelta} />
          )}
          {info.globalA !== null && info.globalB !== null && (
            <p className="text-center text-[10px] font-black uppercase tracking-wide text-slate-100 leading-snug">
              Global {info.globalA}-{info.globalB}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface TableroCaminoFinalProps {
  usuarioActivoId?: string | null
  asignaciones: AsignacionSorteo[]
  partidos: PartidoCamino[]
  /** Equipos del bombo (8); si falta, el cálculo lo infiere. */
  cantidadEquipos?: number
  /**
   * Nombres de los equipos en el orden guardado en
   * quinielas.equipos_sorteo: es solo el RESPALDO de la siembra
   * (ese orden puede ser el de selección manual del admin).
   */
  ordenBombo?: string[]
  /**
   * LA SIEMBRA resuelta contra la tabla de la liga
   * (resolverSiembra): si viene, su orden y sus posiciones mandan
   * sobre el orden guardado; si su fuente es 'guardada', el
   * tablero avisa que la siembra es por orden guardado.
   */
  siembra?: SiembraResuelta | null
}

export default function TableroCaminoFinal({
  usuarioActivoId,
  asignaciones,
  partidos,
  cantidadEquipos,
  ordenBombo,
  siembra,
}: TableroCaminoFinalProps) {
  // Posiciones de siembra para el desempate por global: las de la
  // tabla si se resolvió; si no, las del orden efectivo (guardado).
  const ordenEfectivo = siembra?.orden ?? ordenBombo
  const posicionesEfectivas = useMemo(() => {
    if (siembra?.posiciones) return siembra.posiciones
    if (!ordenEfectivo) return null
    return new Map(
      ordenEfectivo.map((n, i) => [normalizarNombreEquipo(n), i + 1])
    )
  }, [siembra, ordenEfectivo])

  // La liguilla es a ida y vuelta: el cuadro se colapsa a un
  // partido decisivo por llave (global; empate = mejor posición)
  // antes de derivar estados y llaves.
  const partidosEfectivos = useMemo(
    () =>
      colapsarIdaVuelta(partidos, {
        posicionesSiembra: posicionesEfectivas,
        cantidadEquipos:
          cantidadEquipos && cantidadEquipos > 0
            ? cantidadEquipos
            : undefined,
      }),
    [partidos, posicionesEfectivas, cantidadEquipos]
  )

  const camino = useMemo(
    () =>
      calcularCaminoFinal(
        asignaciones,
        partidosEfectivos,
        cantidadEquipos && cantidadEquipos > 0
          ? cantidadEquipos
          : undefined
      ),
    [asignaciones, partidosEfectivos, cantidadEquipos]
  )

  // La siembra efectiva: la de la tabla si se resolvió; si no, el
  // orden guardado (marcado, para avisar en vez de callar).
  const llaves = useMemo(
    () =>
      calcularLlavesCamino(camino, partidosEfectivos, ordenEfectivo, {
        posicionesSiembra: siembra?.posiciones ?? null,
        siembraDesdeTabla: siembra ? siembra.fuente === 'tabla' : true,
      }),
    [camino, partidosEfectivos, ordenEfectivo, siembra]
  )
  const posicionDe = (nombreEquipo: string): number | null =>
    siembra?.posiciones.get(normalizarNombreEquipo(nombreEquipo)) ?? null

  // Detección de cambios entre refrescos para animar una sola vez.
  const fotoRef = useRef<Map<string, FotoPaseCamino> | null>(null)
  const [cambios, setCambios] = useState<Map<string, CambioCamino>>(
    new Map()
  )

  useEffect(() => {
    const nuevos = detectarCambiosCamino(fotoRef.current, camino.pases)
    fotoRef.current = fotoCamino(camino.pases)
    if (nuevos.size === 0) return
    setCambios(nuevos)

    // Sonidos: solo por los pases del propio jugador y solo si
    // activó 🔊 Sonidos (apagado por defecto). Prioridad: corona >
    // avance > caída.
    const propios = camino.pases.filter(
      (e) => e.pase.usuarioId === usuarioActivoId
    )
    const cambiosPropios = propios
      .map((e) => nuevos.get(e.pase.ticketId))
      .filter(Boolean) as CambioCamino[]
    if (cambiosPropios.length > 0 && leerPreferenciaSonidos()) {
      if (cambiosPropios.includes('campeon')) sonarFanfarria()
      else if (cambiosPropios.includes('avanzo')) sonarGolpe()
      else if (cambiosPropios.includes('eliminado')) sonarSilbatazo()
      vibrarGol()
    }

    const limpieza = setTimeout(() => setCambios(new Map()), 3000)
    return () => clearTimeout(limpieza)
  }, [camino, usuarioActivoId])

  if (asignaciones.length === 0) return null

  const nombresCampeones = camino.hayCampeon
    ? camino.pases
        .filter((e) => e.estado === 'campeon')
        .map((e) => e.pase.nombreJugador)
    : []
  const equipoCampeon = camino.hayCampeon
    ? camino.pases.find((e) => e.estado === 'campeon')?.pase.nombreEquipo
    : null

  /**
   * ¿Un lado de la llave ya "está" en esta ronda? En la primera
   * ronda siempre (ahí abren todos); en las demás, cuando alguno de
   * sus pases vive en la columna — cayó en ella o la está jugando —
   * o ya se coronó (para la llave de la final).
   */
  const ladoEnRonda = (lado: LadoLlaveCamino, ronda: number): boolean => {
    if (ronda === 0) return true
    return lado.pases.some(
      (e) =>
        e.etapaIndice === ronda ||
        (ronda === camino.rondasTotales - 1 && e.estado === 'campeon')
    )
  }

  return (
    <div className="py-5 px-3 md:px-4 bg-slate-950/40 rounded-xl border border-slate-800 mb-6">
      <style>{`
        @keyframes caminoAvance {
          0% { transform: translateX(-16px); box-shadow: 0 0 0 rgba(34,197,94,0); }
          35% { box-shadow: 0 0 24px rgba(34,197,94,0.55); }
          100% { transform: translateX(0); box-shadow: 0 0 0 rgba(34,197,94,0); }
        }
        .camino-avanza { animation: caminoAvance 1.8s ease-out; border-color: rgba(34,197,94,0.85) !important; }
        @keyframes caminoCaida {
          0% { transform: translateY(0); opacity: 1; }
          35% { transform: translateY(7px); }
          100% { transform: translateY(0); opacity: 0.72; }
        }
        .camino-cae { animation: caminoCaida 1.8s ease-out; }
        @keyframes caminoCorona {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(245,158,11,0); }
          40% { transform: scale(1.045); box-shadow: 0 0 30px rgba(245,158,11,0.8); }
          100% { transform: scale(1); box-shadow: 0 0 14px rgba(245,158,11,0.35); }
        }
        .camino-campeon { animation: caminoCorona 2.2s ease-out; }
      `}</style>

      <div className="text-center">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">
          🏁 Camino a la final
        </span>
        <p className="text-slate-400 text-[11px] mt-1">
          {camino.partidosTotales === 0
            ? llaves.fuentePrimeraRonda === 'siembra'
              ? 'Las llaves ya están armadas por la siembra del bombo: se mueven cuando se carguen los partidos y caigan los resultados finales.'
              : 'El cuadro se activa cuando se carguen los partidos de la eliminatoria.'
            : `${camino.partidosFinales} de ${camino.partidosTotales} partidos finales · tu equipo te mantiene vivo mientras siga ganando.`}
        </p>
        {siembra && siembra.fuente === 'guardada' && (
          <p className="text-amber-400 text-[11px] mt-1.5 font-bold leading-snug">
            ⚠️ No se pudo cargar la tabla de la liga: la siembra se
            armó con el orden guardado del bombo.
          </p>
        )}
      </div>

      {camino.hayCampeon && (
        <div className="mt-4 mx-auto max-w-md text-center bg-amber-950/40 border border-amber-600/60 rounded-2xl px-4 py-3 animate-in zoom-in-95 duration-500">
          <span className="text-2xl block">👑</span>
          <p className="text-amber-300 font-black uppercase tracking-widest text-sm mt-1">
            ¡{equipoCampeon} campeón!
          </p>
          <p className="text-amber-200/80 text-[11px] font-bold uppercase tracking-wide mt-0.5">
            {nombresCampeones.join(' · ')}
          </p>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 mt-4 -mx-1 px-1">
        {camino.columnas.map((columna, i) => {
          const fichas = camino.porColumna[i] || []
          const vivos = fichas.filter((f) => f.estado !== 'eliminado').length

          // Llaves de esta columna: en la del Campeón no hay; en las
          // demás, las derivadas cuyos lados ya están en la ronda.
          const llavesColumna = columna.esCampeon
            ? []
            : (llaves.porRonda[columna.indice] || []).filter(
                (llave) =>
                  columna.indice === 0 ||
                  llave.lados.some((lado) =>
                    ladoEnRonda(lado, columna.indice)
                  )
              )
          const clavesEnLlaves = new Set<string>(
            llavesColumna.flatMap((l) => l.lados.map((s) => s.clave))
          )
          // Pases de la columna que ninguna llave muestra: van
          // sueltos, como siempre.
          const sueltas = fichas.filter(
            (f) =>
              !clavesEnLlaves.has(normalizarNombreEquipo(f.pase.nombreEquipo))
          )
          const tieneLlaves = llavesColumna.length > 0
          const subtitulo = tieneLlaves
            ? `${llavesColumna.length} llave(s)${
                sueltas.length > 0 && !columna.esCampeon
                  ? ` · ${sueltas.length} por definir`
                  : ''
              }`
            : fichas.length === 0
              ? 'Por definir'
              : columna.esCampeon
                ? `${fichas.length} pase(s)`
                : `${vivos} vivo(s) · ${fichas.length - vivos} fuera`

          return (
            <div
              key={columna.indice}
              className={`shrink-0 ${
                tieneLlaves
                  ? 'min-w-[300px] w-[300px]'
                  : 'min-w-[150px] w-[150px]'
              }`}
            >
              <div
                className={`text-center rounded-lg px-2 py-1.5 border ${
                  columna.esCampeon
                    ? 'bg-amber-950/40 border-amber-700/60 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                  {columna.esCampeon ? '👑 ' : ''}
                  {columna.nombre}
                </span>
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                  {subtitulo}
                </span>
                {columna.indice === 0 && llaves.fuentePrimeraRonda && (
                  <span className="block text-[9px] font-bold text-blue-400/80 uppercase tracking-wider mt-0.5">
                    {llaves.fuentePrimeraRonda === 'siembra'
                      ? llaves.siembraDesdeTabla
                        ? 'Siembra por tabla'
                        : 'Siembra por orden guardado'
                      : 'Según los partidos'}
                  </span>
                )}
              </div>

              <div className="space-y-2 mt-2">
                {llavesColumna.map((llave, li) => (
                  <TarjetaLlave
                    key={`${llave.ronda}-${llave.partidoId ?? llave.letra ?? li}`}
                    llave={llave}
                    usuarioActivoId={usuarioActivoId}
                    cambios={cambios}
                    partidos={partidos}
                  />
                ))}
                {sueltas.length > 0 &&
                  !columna.esCampeon &&
                  columna.indice > 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 p-2 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      Emparejamiento por definir
                    </span>
                  </div>
                )}
                {sueltas.map((estado) => (
                  <FichaPase
                    key={estado.pase.ticketId}
                    estado={estado}
                    usuarioActivoId={usuarioActivoId}
                    cambios={cambios}
                    posicion={posicionDe(estado.pase.nombreEquipo)}
                  />
                ))}
                {llavesColumna.length === 0 && sueltas.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 p-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Aún nadie
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-slate-500 text-[10px] mt-3 leading-relaxed">
        El tablero se mueve solo con resultados <b>finales</b>: un
        marcador en vivo no elimina a nadie, solo avisa si tu equipo va
        en riesgo.
      </p>
    </div>
  )
}
