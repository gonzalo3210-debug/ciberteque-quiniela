import { topInsignias, type ResultadoInsignias } from '@/lib/insignias'

// Iconos compactos de insignias para junto al nombre en el ranking:
// hasta 3, primero las más raras y luego las más recientes, cada una
// con su nombre en el title (tooltip nativo). Si el jugador no tiene
// insignias ganadas, no se muestra nada.
export default function IconosInsignias({
  resultado,
  max = 3,
}: {
  resultado?: ResultadoInsignias | null
  max?: number
}) {
  const top = topInsignias(resultado, max)
  if (top.length === 0) return null

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" aria-label="Insignias del jugador">
      {top.map((insignia) => (
        <span
          key={insignia.id}
          title={`${insignia.nombre} — ${insignia.descripcion}${insignia.quinielaNombre ? ` (en ${insignia.quinielaNombre})` : ''}`}
          className="text-[10px] md:text-[11px] leading-none drop-shadow-sm cursor-default"
        >
          {insignia.icono}
        </span>
      ))}
    </span>
  )
}
