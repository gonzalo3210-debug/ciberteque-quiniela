// src/app/api/ligas-catalogo/route.ts
//
// Catálogo COMPLETO de ligas del proveedor (todas las de
// all_leagues, agrupadas por deporte) para el explorador "🌎 Ligas"
// de la sección Partidos y para el selector extendido del panel de
// importar jornadas. Hasta aquí la app solo conocía las ~10 ligas
// curadas del Club; con esto se puede abrir CUALQUIER liga.
//
// Ruta de servidor: la llave del proveedor nunca sale al navegador.
// El catálogo completo se arma una vez y se cachea EN MEMORIA 24 h
// (además del caché de 24 h del adaptador): son más de 1,500 ligas
// y no tiene sentido rearmar el JSON en cada visita. Ninguna visita
// de usuario dispara consultas nuevas al proveedor.
//
// Modos:
//   (sin parámetros)   -> { sports: [{ sport, nombreES, ligas }] }
//                         con cada liga marcada `curada` si es de
//                         las del Club.
//   ?liga={providerId} -> { league: LigaDinamica }: el detalle para
//                         abrir su página (temporada vigente y si
//                         tiene tabla, ya verificados en el servidor).

import { NextResponse } from 'next/server';
import { getSportsProvider, SUPPORTED_LEAGUES } from '@/lib/sports';
import {
  nombreDeporteES,
  filtrarLigasVisibles,
  type DeporteConLigas,
  type LigaDinamica,
} from '@/lib/sports/catalogo';
import { resolverLigaConTabla } from '@/lib/sports/ligaDinamica';

export const dynamic = 'force-dynamic';

const TTL_MS = 24 * 3_600_000; // 24 h
let cacheCatalogo: { at: number; sports: DeporteConLigas[] } | null = null;

async function catalogoAgrupado(): Promise<DeporteConLigas[]> {
  if (cacheCatalogo && Date.now() - cacheCatalogo.at < TTL_MS) {
    return cacheCatalogo.sports;
  }
  const provider = getSportsProvider();
  // Fuera las pseudo-ligas internas del proveedor ("_Defunct Soccer
  // Teams", "_No League"...): no son ligas y ensucian la lista del
  // explorador y sus conteos por deporte (v20).
  const entradas = filtrarLigasVisibles(await provider.getLeagueCatalog());
  const curadas = new Set(SUPPORTED_LEAGUES.map((l) => l.providerId));

  const porDeporte = new Map<string, DeporteConLigas['ligas']>();
  for (const e of entradas) {
    const arr = porDeporte.get(e.sport) || [];
    arr.push({ ...e, curada: curadas.has(e.providerId) });
    porDeporte.set(e.sport, arr);
  }

  const sports: DeporteConLigas[] = [...porDeporte.entries()].map(
    ([sport, ligas]) => ({
      sport,
      nombreES: nombreDeporteES(sport),
      // Las del Club primero (son las que se siguen); el resto, A-Z.
      ligas: ligas.sort((a, b) =>
        a.curada !== b.curada
          ? a.curada
            ? -1
            : 1
          : a.name.localeCompare(b.name)
      ),
    })
  );
  // Fútbol primero (es el deporte del Club); el resto, por número de
  // ligas de mayor a menor.
  sports.sort((a, b) => {
    if (a.sport === 'Soccer') return -1;
    if (b.sport === 'Soccer') return 1;
    return b.ligas.length - a.ligas.length;
  });

  cacheCatalogo = { at: Date.now(), sports };
  return sports;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // ----- Modo detalle (?liga=): abrir la página de UNA liga -----
  const ligaId = searchParams.get('liga');
  if (ligaId) {
    try {
      const resuelta = await resolverLigaConTabla(ligaId);
      if (!resuelta) {
        return NextResponse.json(
          { error: 'Esa liga no existe en el proveedor.' },
          { status: 404 }
        );
      }
      const league: LigaDinamica = {
        providerId: resuelta.providerId,
        name: resuelta.name,
        sport: resuelta.sport,
        season: resuelta.season,
        badgeUrl: resuelta.badgeUrl,
        hasStandings: resuelta.hasStandings,
        computedStandings:
          !resuelta.hasStandings && !!resuelta.computedTable,
        curada: resuelta.curada,
      };
      return NextResponse.json({
        league,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error al resolver la liga ${ligaId}:`, error);
      return NextResponse.json(
        { error: 'No se pudo cargar esa liga. Intenta de nuevo en unos minutos.' },
        { status: 502 }
      );
    }
  }

  // ----- Catálogo completo agrupado por deporte -----
  try {
    const sports = await catalogoAgrupado();
    return NextResponse.json({
      sports,
      totalLigas: sports.reduce((a, s) => a + s.ligas.length, 0),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al obtener el catálogo de ligas:', error);
    return NextResponse.json(
      {
        error:
          'No se pudo cargar el catálogo de ligas. Intenta de nuevo en unos minutos.',
      },
      { status: 502 }
    );
  }
}
