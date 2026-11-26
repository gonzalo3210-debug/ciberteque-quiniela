'use client'
// src/components/CaminoEnMisJugadas.tsx
//
// 🏁 El tablero «Camino a la final» del sorteo en su casa permanente:
// Mis Jugadas. En Jugar el tablero solo vive mientras la quiniela
// está abierta y sin vencer (useCartelera filtra por fecha_cierre),
// pero el modo supervivencia dura semanas — cuartos, semis y final —
// así que el seguimiento vive aquí, debajo de los pases del jugador,
// hasta que la quiniela se cierra (pedido de Gonzalo, 2026-11-22).
//
// Reutiliza EXACTAMENTE los mismos datos que la Cartelera
// (useCeremoniaSorteo: asignaciones, bombo, siembra resuelta contra
// la tabla y partidos del cuadro) y el mismo tablero
// (TableroCaminoFinal), sin consultas ni tablas nuevas. Antes del
// sorteo no pinta nada: los pases ya muestran su «Pendiente».

import { useEffect } from 'react'
import { useCeremoniaSorteo } from '@/hooks/useCeremoniaSorteo'
import TableroCaminoFinal from '@/components/TableroCaminoFinal'

export default function CaminoEnMisJugadas({
  quinielaId,
  usuarioId,
}: {
  quinielaId: string
  usuarioId: string
}) {
  const ceremonia = useCeremoniaSorteo({ id: quinielaId, modalidad: 'sorteo' })
  const { recargar } = ceremonia

  // Al volver la app al frente se vuelve a leer el cuadro: sin
  // esto, el tablero de Mis Jugadas se quedaba con la foto de
  // cuando se montó (el mismo arreglo que se hizo en Jugar).
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') recargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('pageshow', alVolver)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('pageshow', alVolver)
    }
  }, [recargar])

  if (!ceremonia.realizado) return null

  return (
    <div className="border-t border-blue-800/40 bg-blue-950/10 px-2 py-3 md:px-4">
      <TableroCaminoFinal
        usuarioActivoId={usuarioId}
        asignaciones={ceremonia.asignaciones}
        partidos={ceremonia.partidos}
        cantidadEquipos={ceremonia.equiposBombo.length}
        ordenBombo={ceremonia.equiposBombo.map((e) => e.nombre)}
        siembra={ceremonia.siembra}
      />
    </div>
  )
}
