// src/app/api/tabla-liga/route.ts
//
// Tabla de posiciones DE LA LIGA MX (no confundir con el ranking del Club
// entre jugadores, que vive en Supabase y no se toca aquí).
//
// Ruta de servidor: pide la tabla al proveedor activo a través del
// adaptador único (src/lib/sports) y la entrega como JSON a la vista
// TablaLiga. La llave del proveedor nunca sale del servidor y el propio
// adaptador cachea la respuesta (10 min), así que las visitas de los
// jugadores NO queman cuota de la API.

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  LIGA_MX_PROVIDER_ID,
  LIGA_MX_SEASON,
} from '@/lib/sports';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season') || LIGA_MX_SEASON;

    const rows = await getSportsProvider().getStandings(
      LIGA_MX_PROVIDER_ID,
      season
    );

    return NextResponse.json({
      league: 'Liga MX',
      season,
      rows,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al obtener la tabla de Liga MX:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar la tabla de la Liga MX. Intenta de nuevo en unos minutos.' },
      { status: 502 }
    );
  }
}
