// src/app/api/tv-partido/route.ts
//
// Transmisiones de TV/streaming de UN partido según el proveedor
// (su endpoint dedicado de TV, ya normalizadas por el adaptador):
// el respaldo de "Dónde ver" en la vista del partido cuando la
// quiniela no trae canal propio (partidos.canal manda siempre y
// ni siquiera se pide esta ruta en ese caso).
//
// Ruta de servidor: la llave del proveedor nunca sale al navegador.
// Parámetros:
//   ?fixture={id}   el partido en el proveedor (api_fixture_id)
//
// La cobertura del proveedor es parcial: partidos sin ningún
// listado devuelven { listings: [] } sin error (p. ej. los de la
// J17 de Liga MX), y lo que hay suele ser canal de EE.UU./Europa,
// casi nunca de México — la vista lo muestra con su país, tal cual.

import { NextResponse } from 'next/server';
import { getSportsProvider } from '@/lib/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixtureId = (searchParams.get('fixture') || '').trim();

  if (!fixtureId) {
    return NextResponse.json(
      { error: 'Indica el partido (?fixture=).' },
      { status: 400 }
    );
  }
  if (!/^\d+$/.test(fixtureId)) {
    return NextResponse.json(
      { error: 'El ID de partido debe ser numérico.' },
      { status: 400 }
    );
  }

  try {
    const provider = getSportsProvider();
    const listings = await provider.getFixtureTV(fixtureId);
    return NextResponse.json({
      listings,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error al obtener la TV del partido ${fixtureId}:`, error);
    return NextResponse.json(
      {
        error:
          'No se pudieron cargar las transmisiones. Intenta de nuevo en unos minutos.',
      },
      { status: 502 }
    );
  }
}
