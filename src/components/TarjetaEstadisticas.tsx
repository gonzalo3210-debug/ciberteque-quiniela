'use client'
import { useEstadisticasUsuario } from '@/hooks/useEstadisticas'

// 📊 TARJETA DE ESTADÍSTICAS PERSONALES (Mi Perfil)
// Cifras del historial cerrado del jugador (src/lib/estadisticas.ts
// sobre el mismo historial de las insignias): participación, puntería
// con desglose exactos/tendencias, puntos, mejor quiniela, racha y la
// mini-gráfica de sus últimas 10 quinielas. El sorteo no cuenta.
// La cifra de premios en dinero solo aparece si Perfil ya la calculó
// (es su "Ganancias Totales"); sin dato, no se muestra ni se inventa.
export default function TarjetaEstadisticas({
  usuarioId,
  totalGanadoPremios,
}: {
  usuarioId?: string | null
  totalGanadoPremios?: number | null
}) {
  const { estadisticas, cargando } = useEstadisticasUsuario(
    usuarioId,
    totalGanadoPremios
  )

  if (cargando && !estadisticas) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg animate-pulse">
        <div className="h-4 w-44 bg-slate-800 rounded mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-950/60 rounded-2xl border border-slate-800/80"></div>
          ))}
        </div>
        <div className="h-28 bg-slate-950/60 rounded-2xl border border-slate-800/80 mt-3"></div>
      </div>
    )
  }

  if (!estadisticas) return null

  const s = estadisticas

  // Sin historial: invitación a estrenarse, nada de ceros.
  if (s.quinielasJugadas === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-6 -top-6 text-8xl md:text-9xl opacity-5 pointer-events-none select-none">📊</div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3 border-b border-slate-800 pb-3 relative z-10">
          <span>📊</span> Mis Estadísticas
        </h3>
        <p className="text-center text-slate-400 text-xs font-bold leading-relaxed relative z-10 py-2">
          Aún no tienes estadísticas: juega tu primera quiniela y aquí
          verás tu precisión, tus puntos y tu racha. 🎯
        </p>
      </div>
    )
  }

  const maxPuntosSerie = Math.max(...s.serieUltimas.map((p) => p.puntos), 0)

  const celdas: {
    icono: string
    etiqueta: string
    valor: string
    sub?: string
    titulo?: string
  }[] = [
    {
      icono: '🎟️',
      etiqueta: 'Jugadas',
      valor: String(s.quinielasJugadas),
      sub: 'quinielas cerradas',
    },
    {
      icono: '🏆',
      etiqueta: 'Ganadas',
      valor: String(s.quinielasGanadas),
      sub: s.quinielasGanadas === 1 ? 'campeonato' : 'campeonatos',
    },
    {
      icono: '💰',
      etiqueta: 'Con premio',
      valor: String(s.premiosCobrados),
      sub: `${s.pctPremios}% de tus quinielas`,
    },
    {
      icono: '🔥',
      etiqueta: 'Racha actual',
      valor: String(s.rachaActual),
      sub:
        s.rachaActual > 0
          ? s.rachaActual === 1
            ? 'quiniela cobrando'
            : 'quinielas cobrando'
          : 'sin racha',
    },
    {
      icono: '🎯',
      etiqueta: 'Precisión',
      valor: `${s.precisionPct}%`,
      sub: `${s.aciertosTotales} de ${s.pronosticosJugados} pronósticos`,
      titulo: `${s.exactosTotales} marcadores exactos · ${s.tendenciasTotales} tendencias`,
    },
    {
      icono: '🧤',
      etiqueta: 'Exactos / Tend.',
      valor: `${s.exactosTotales} / ${s.tendenciasTotales}`,
      sub: 'aciertos por tipo',
      titulo: 'Marcadores exactos (3 pts) / solo tendencia (1 pt)',
    },
    {
      icono: '⭐',
      etiqueta: 'Puntos',
      valor: String(s.puntosTotales),
      sub: `promedio ${s.promedioPuntos} por quiniela`,
    },
    ...(s.mejorQuiniela
      ? [
          {
            icono: '👑',
            etiqueta: 'Mejor quiniela',
            valor: `${s.mejorQuiniela.puntos} pts`,
            sub: s.mejorQuiniela.nombreJornada,
            titulo: s.mejorQuiniela.nombreJornada,
          },
        ]
      : []),
    ...(s.totalGanadoPremios !== null
      ? [
          {
            icono: '💵',
            etiqueta: 'Premios ganados',
            valor: `$${s.totalGanadoPremios.toLocaleString('es-MX')}`,
            sub: 'MXN acumulados',
          },
        ]
      : []),
  ]

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
      <div className="absolute -right-6 -top-6 text-8xl md:text-9xl opacity-5 pointer-events-none select-none">📊</div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-slate-800 pb-3 relative z-10">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span>📊</span> Mis Estadísticas
        </h3>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Historial cerrado · sin sorteo
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
        {celdas.map((c) => (
          <div
            key={c.etiqueta}
            className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center"
            title={c.titulo}
          >
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
              {c.icono} {c.etiqueta}
            </span>
            <span className="block text-xl md:text-2xl font-black text-white leading-none truncate">
              {c.valor}
            </span>
            {c.sub && (
              <span className="block text-[9px] text-slate-400 leading-snug mt-1.5 truncate">
                {c.sub}
              </span>
            )}
          </div>
        ))}
      </div>

      {s.serieUltimas.length > 0 && (
        <div className="relative z-10 mt-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-3">
          <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
            📈 Tus últimas {s.serieUltimas.length}{' '}
            {s.serieUltimas.length === 1 ? 'quiniela' : 'quinielas'} · puntos
          </span>
          <div className="flex items-end gap-1.5 h-28">
            {s.serieUltimas.map((p, i) => {
              const esMejor =
                s.mejorQuiniela !== null &&
                p.nombreJornada === s.mejorQuiniela.nombreJornada &&
                p.puntos === s.mejorQuiniela.puntos
              const altura =
                maxPuntosSerie > 0
                  ? Math.max(5, Math.round((p.puntos / maxPuntosSerie) * 100))
                  : 5
              return (
                <div
                  key={`${p.nombreJornada}-${i}`}
                  className="flex-1 min-w-0 h-full flex flex-col items-center justify-end"
                  title={`${p.nombreJornada}: ${p.puntos} pts`}
                >
                  <span
                    className={`text-[9px] font-black mb-1 ${
                      esMejor ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    {p.puntos}
                  </span>
                  <div
                    className={`w-full max-w-10 rounded-t-md transition-all ${
                      esMejor
                        ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.35)]'
                        : 'bg-blue-500/70'
                    }`}
                    style={{ height: `${altura}%` }}
                  ></div>
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 mt-1 truncate w-full text-center">
                    {p.nombreCorto}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
