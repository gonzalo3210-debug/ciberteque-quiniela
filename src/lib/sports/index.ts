// src/lib/sports — Adaptador de datos deportivos externos.
// Punto de entrada del módulo; ver provider.ts y README.md.

export * from './types';
export * from './leagues';
export * from './liveStandings';
export * from './computedStandings';
export type { SportsProvider } from './provider';
export { getSportsProvider } from './provider';
