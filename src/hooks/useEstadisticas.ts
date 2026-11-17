// src/hooks/useEstadisticas.ts
//
// Estadísticas personales de Mi Perfil: toma el historial
// calificado que ya arma useHistorialUsuario (las mismas consultas
// acotadas de las insignias) y lo pasa por el módulo puro
// src/lib/estadisticas.ts.
//
// El total ganado en premios NO se consulta aquí: lo recibe de
// Perfil, que ya lo calcula de transacciones_creditos y lo muestra
// como "Ganancias Totales" (perfil.total_ganado). Sin ese dato, la
// tarjeta simplemente no muestra la cifra de dinero.

import { useMemo } from 'react'
import { useHistorialUsuario } from '@/hooks/useInsignias'
import {
  calcularEstadisticas,
  type ResultadoEstadisticas,
} from '@/lib/estadisticas'

export function useEstadisticasUsuario(
  usuarioId?: string | null,
  totalGanadoPremios?: number | null
): { estadisticas: ResultadoEstadisticas | null; cargando: boolean } {
  const { historial, cargando } = useHistorialUsuario(usuarioId)

  const estadisticas = useMemo(
    () =>
      cargando
        ? null
        : calcularEstadisticas(historial, { totalGanadoPremios }),
    [historial, cargando, totalGanadoPremios]
  )

  return { estadisticas, cargando }
}
