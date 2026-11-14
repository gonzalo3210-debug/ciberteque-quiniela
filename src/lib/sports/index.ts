// src/lib/sports — Adaptador de datos deportivos externos.
// Punto de entrada del módulo; ver provider.ts y README.md.
//
// ⚠️ ESTE BARREL ES SOLO PARA EL SERVIDOR: re-exporta provider.ts, que
// importa thesportsdb.ts (guardado: truena si se evalúa en el navegador).
// Los componentes cliente NUNCA deben importar desde '@/lib/sports';
// que importen las piezas puras por su ruta directa:
//   tipos            -> '@/lib/sports/types'
//   ligas soportadas -> '@/lib/sports/leagues' (getSupportedLeague, SUPPORTED_LEAGUES)
//   nombres en ES    -> '@/lib/sports/nombresES'
//   tablas puras     -> '@/lib/sports/computedStandings' / 'liveStandings'

export * from './types';
export * from './leagues';
export * from './liveStandings';
export * from './computedStandings';
export type { SportsProvider } from './provider';
export { getSportsProvider } from './provider';
