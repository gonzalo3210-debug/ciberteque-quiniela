'use client'
import { useInsigniasUsuario } from '@/hooks/useInsignias'

// 🏅 VITRINA DE INSIGNIAS (Mi Perfil)
// Muestra el catálogo completo del Club: las ganadas en color, con la
// jornada donde se ganaron, y las que faltan en gris con su requisito
// y el avance (p. ej. 2/3 campeonatos), para que se vea qué sigue.
// El cálculo es al vuelo desde el historial (src/lib/insignias.ts);
// el sorteo no cuenta para insignias ni rachas.
export default function VitrinaInsignias({ usuarioId }: { usuarioId?: string | null }) {
  const { resultado, cargando } = useInsigniasUsuario(usuarioId)

  if (cargando && !resultado) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg animate-pulse">
        <div className="h-4 w-40 bg-slate-800 rounded mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-950/60 rounded-2xl border border-slate-800/80"></div>
          ))}
        </div>
      </div>
    )
  }

  if (!resultado) return null

  const { insignias, ganadas, rachaActual } = resultado

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
      <div className="absolute -right-6 -top-6 text-8xl md:text-9xl opacity-5 pointer-events-none select-none">🏅</div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-slate-800 pb-3 relative z-10">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span>🏅</span> Mis Insignias
          <span className="text-amber-400 normal-case tracking-normal">
            {ganadas.length} de {insignias.length}
          </span>
        </h3>
        {rachaActual > 0 && (
          <span
            className="text-[10px] font-black uppercase tracking-widest bg-red-950/60 border border-red-900/60 text-red-400 px-2.5 py-1 rounded-full"
            title="Quinielas seguidas cobrando premio"
          >
            🔥 Racha actual: {rachaActual} {rachaActual === 1 ? 'quiniela cobrando' : 'quinielas cobrando'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
        {insignias.map((insignia) => (
          <div
            key={insignia.id}
            className={`rounded-2xl border p-3 flex flex-col items-center text-center transition-all ${
              insignia.ganada
                ? 'bg-slate-950/60 border-amber-900/50 shadow-[0_0_12px_rgba(245,158,11,0.12)]'
                : 'bg-slate-950/40 border-slate-800/80 opacity-60'
            }`}
            title={insignia.ganada ? insignia.descripcion : insignia.requisito}
          >
            <span className={`text-3xl md:text-4xl drop-shadow-md mb-1.5 ${insignia.ganada ? '' : 'grayscale'}`}>
              {insignia.icono}
            </span>
            <span className={`font-black uppercase text-[10px] md:text-[11px] tracking-wide leading-tight ${insignia.ganada ? 'text-white' : 'text-slate-400'}`}>
              {insignia.nombre}
            </span>

            {insignia.ganada ? (
              <>
                <span className="text-[9px] text-slate-400 leading-snug mt-1">{insignia.descripcion}</span>
                {insignia.quinielaNombre && (
                  <span className="text-[8px] font-bold uppercase tracking-widest text-amber-500/90 mt-1.5">
                    🏟️ {insignia.quinielaNombre}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-[9px] text-slate-500 leading-snug mt-1">{insignia.requisito}</span>
                <div className="w-full mt-2">
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (insignia.progreso / insignia.meta) * 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mt-1">
                    Vas en {insignia.progreso} de {insignia.meta}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {ganadas.length === 0 && (
        <p className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-4 relative z-10">
          Aún no estrenas la vitrina: tu primera insignia llega con tu primer título 🏆
        </p>
      )}
    </div>
  )
}
