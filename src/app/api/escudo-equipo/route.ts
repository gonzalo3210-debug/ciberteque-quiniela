// src/app/api/escudo-equipo/route.ts
//
// Escudo de UN equipo del catálogo EQUIPOS a partir de su ID de
// TheSportsDB (columna `id_api` de la tabla equipos; ver
// src/lib/escudos.ts y la migración 2026-11-23-equipos-id-api.sql).
//
// Uso principal: como URL de <img> — GET /api/escudo-equipo?id={idApi}
// responde 307 al badge oficial del proveedor (r2.thesportsdb.com).
// Así el escudo se jala de la API por ID y deja de depender de que el
// nombre del catálogo coincida letra por letra con el de la quiniela
// (bug del 2026-11-23: PSV, PSG, Roma y Bayern Múnich salían con "?").
//
// Caché en dos pisos, para no llamar a la API en cada render:
//   - El servidor resuelve con getTeamDetail del adaptador, cuyo
//     fetch a lookupteam.php ya va cacheado 24 h (revalidate 86400).
//   - La redirección lleva Cache-Control de 24 h en el navegador y
//     7 días de stale-while-revalidate, así que tras la primera vez
//     el <img> ni siquiera vuelve a preguntar aquí.
//
// Si el ID no existe en el proveedor o la API falla, se redirige al
// logo genérico de ESPN (el mismo respaldo que los onError de la app
// ya usan): el <img> nunca queda roto. El "?" de Jugar sigue siendo
// para equipos SIN id_api y SIN logo manual, como hoy.
//
// Modo depuración: ?formato=json devuelve { badgeUrl } en JSON (o
// 502 si no se pudo resolver), sin redirigir.

import { NextResponse } from 'next/server';
import { getSportsProvider } from '@/lib/sports';

export const dynamic = 'force-dynamic';

/** Respaldo visual si la API no tiene badge para ese ID. */
const LOGO_GENERICO =
  'https://a.espncdn.com/i/teamlogos/default-soccer-35.png';

const CACHE_ESCUDO =
  'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  const formatoJson = searchParams.get('formato') === 'json';

  // Los idTeam de TheSportsDB son numéricos; se acepta solo eso para
  // no convertir la ruta en un proxy abierto a cualquier URL.
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: 'Falta el id numérico del equipo (id de TheSportsDB).' },
      { status: 400 }
    );
  }

  let badgeUrl: string | null = null;
  try {
    const provider = getSportsProvider();
    const team = await provider.getTeamDetail(id);
    badgeUrl = team?.badgeUrl || null;
  } catch (error) {
    console.error(`Error al resolver el escudo del equipo ${id}:`, error);
  }

  if (formatoJson) {
    if (!badgeUrl) {
      return NextResponse.json(
        { error: 'La API no devolvió escudo para ese equipo.' },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { badgeUrl },
      { headers: { 'Cache-Control': CACHE_ESCUDO } }
    );
  }

  return NextResponse.redirect(badgeUrl || LOGO_GENERICO, {
    status: 307,
    headers: { 'Cache-Control': CACHE_ESCUDO },
  });
}
