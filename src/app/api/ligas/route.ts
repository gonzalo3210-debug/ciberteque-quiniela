// src/app/api/ligas/route.ts
//
// Catálogo público de las ligas SOPORTADAS con el logo de cada una, para
// las listas del cliente que se arman desde el catálogo estático
// (Siguiendo y el selector de Posiciones de la sección "⚽ Partidos").
// El logo viene del adaptador (lookupleague, cacheado 7 días): tras el
// primer hit esto casi no cuesta consultas. Si una liga no trae logo,
// badgeUrl va null y la vista muestra solo el nombre.

import { NextResponse } from 'next/server';
import { getSportsProvider, SUPPORTED_LEAGUES } from '@/lib/sports';

export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = getSportsProvider();
  const leagues = await Promise.all(
    SUPPORTED_LEAGUES.map(async (liga) => {
      let badgeUrl: string | null = null;
      try {
        badgeUrl = await provider.getLeagueBadge(liga.providerId);
      } catch {
        // Sin logo no pasa nada: la vista muestra solo el nombre.
      }
      return {
        providerId: liga.providerId,
        name: liga.name,
        season: liga.season,
        badgeUrl,
      };
    })
  );
  return NextResponse.json({
    leagues,
    fetchedAt: new Date().toISOString(),
  });
}
