// src/app/api/importar-jornada/route.ts
//
// Partidos de una liga SOPORTADA para IMPORTAR al crear una jornada
// (panel admin -> Crear Jornada -> "Importar desde la API").
//
// Ruta de servidor: la llave del proveedor nunca sale al navegador; aquí
// solo se traduce la respuesta del adaptador (getSportsProvider) a la
// forma que el panel necesita, con los nombres YA en español.
//
// Modos (uno de los dos):
//   ?liga={providerId}&ronda={n}              -> la jornada n de la liga
//   ?liga={providerId}&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//        -> los partidos de la temporada cuya fecha (en hora de
//           Mazatlán, la zona del Club) cae dentro del rango.
//
// Cada partido trae `providerId`: es el id del evento en el proveedor y
// el panel lo guarda como partidos.api_fixture_id, para que el programa
// de marcadores sepa qué partido de la base corresponde a cuál del API.

import { NextResponse } from 'next/server';
import {
  getSportsProvider,
  getSupportedLeague,
  type SportsFixture,
} from '@/lib/sports';
import { nombreEquipoES } from '@/lib/sports/nombresES';

export const dynamic = 'force-dynamic';

/** Fixture tal como lo consume el panel: el neutro + nombres en español. */
interface FixtureParaImportar extends SportsFixture {
  homeTeamES: string;
  awayTeamES: string;
}

const DIA_MAZATLAN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mazatlan',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día calendario (YYYY-MM-DD) de un instante, en hora de Mazatlán. */
function diaEnMazatlan(isoUtc: string): string {
  return DIA_MAZATLAN.format(new Date(isoUtc));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const ligaId = searchParams.get('liga') || '';
  const liga = getSupportedLeague(ligaId);
  if (!liga) {
    return NextResponse.json({ error: 'Liga no soportada.' }, { status: 400 });
  }

  const rondaParam = searchParams.get('ronda');
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  let ronda: number | null = null;
  if (rondaParam !== null && rondaParam !== '') {
    ronda = Number(rondaParam);
    if (!Number.isInteger(ronda) || ronda < 1) {
      return NextResponse.json(
        { error: 'La ronda debe ser un número entero mayor a cero.' },
        { status: 400 }
      );
    }
  } else if (desde || hasta) {
    if (!desde || !hasta || desde > hasta) {
      return NextResponse.json(
        { error: 'Indica el rango completo: desde y hasta (desde <= hasta).' },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { error: 'Indica la ronda o un rango de fechas (desde/hasta).' },
      { status: 400 }
    );
  }

  try {
    const provider = getSportsProvider();

    let fixtures: SportsFixture[];
    if (ronda !== null) {
      fixtures = await provider.getFixtures(liga.providerId, {
        season: liga.season,
        round: ronda,
      });
    } else {
      // Rango de fechas: se trae el calendario de la temporada (el
      // adaptador lo cachea 1 h) y se filtra por día en Mazatlán.
      const temporada = await provider.getFixtures(liga.providerId, {
        season: liga.season,
      });
      fixtures = temporada.filter((f) => {
        if (!f.kickoffUtc) return false;
        const dia = diaEnMazatlan(f.kickoffUtc);
        return dia >= (desde as string) && dia <= (hasta as string);
      });
    }

    // Sin duplicados por id de evento y ordenados por hora de inicio.
    const porId = new Map<string, SportsFixture>();
    for (const f of fixtures) {
      if (!porId.has(f.providerId)) porId.set(f.providerId, f);
    }
    const ordenados = [...porId.values()].sort((a, b) => {
      if (a.kickoffUtc && b.kickoffUtc) return a.kickoffUtc < b.kickoffUtc ? -1 : 1;
      if (a.kickoffUtc) return -1;
      if (b.kickoffUtc) return 1;
      return 0;
    });

    const paraImportar: FixtureParaImportar[] = ordenados.map((f) => ({
      ...f,
      homeTeamES: nombreEquipoES(f.homeTeam, f.homeTeamProviderId),
      awayTeamES: nombreEquipoES(f.awayTeam, f.awayTeamProviderId),
    }));

    return NextResponse.json({
      league: {
        providerId: liga.providerId,
        name: liga.name,
        season: liga.season,
      },
      mode: ronda !== null ? 'ronda' : 'fechas',
      fixtures: paraImportar,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `Error al importar partidos de ${liga.name} (ronda=${rondaParam}, desde=${desde}, hasta=${hasta}):`,
      error
    );
    return NextResponse.json(
      {
        error: `No se pudieron cargar los partidos de ${liga.name}. Intenta de nuevo en unos minutos.`,
      },
      { status: 502 }
    );
  }
}
