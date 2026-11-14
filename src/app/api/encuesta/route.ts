// =====================================================================
// GET /api/encuesta — encuesta "¿Quién va a ganar?" de UN partido
// ---------------------------------------------------------------------
// Parámetros: ?local=&visitante=&liga=<id TheSportsDB>&fecha=<ISO>
// Devuelve los porcentajes 1-X-2 calculados desde las cuotas de
// The Odds API (ver src/lib/odds.ts: caché de servidor de 45 min).
// Si ninguna casa cotiza el partido, porcentajes va en null y la
// vista del partido simplemente no muestra la encuesta.
// =====================================================================

import { NextResponse } from 'next/server';
import { encuestaPartido } from '@/lib/odds';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const local = (searchParams.get('local') || '').trim();
  const visitante = (searchParams.get('visitante') || '').trim();
  const liga = searchParams.get('liga');
  const fecha = searchParams.get('fecha');

  if (!local || !visitante) {
    return NextResponse.json(
      { porcentajes: null, error: 'Faltan local/visitante' },
      { status: 400 }
    );
  }

  try {
    const r = await encuestaPartido(local, visitante, liga, fecha);
    return NextResponse.json({
      porcentajes: r?.porcentajes ?? null,
      casas: r?.casas ?? 0,
      inicioUtc: r?.inicioUtc ?? null,
    });
  } catch {
    return NextResponse.json({ porcentajes: null, casas: 0 });
  }
}
