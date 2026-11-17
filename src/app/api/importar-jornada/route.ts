// src/app/api/importar-jornada/route.ts
//
// Partidos de una liga SOPORTADA para IMPORTAR al crear una jornada
// (panel admin -> Crear Jornada -> "Importar desde la API").
//
// Ruta de servidor: la llave del proveedor nunca sale al navegador; aquí
// solo se traduce la respuesta del adaptador (getSportsProvider) a la
// forma que el panel necesita, con los nombres YA en español.
//
// Modos:
//   (sin ronda ni fechas)                     -> "lo que sigue" (proximos):
//        la ronda MÁS TEMPRANA de la temporada que aún tenga al menos
//        un partido sin terminar; es lo que el panel muestra solo, al
//        abrirse, para no obligar a filtrar cada vez. Si la temporada
//        ya no trae pendientes, devuelve la última ronda y lo marca
//        con esMasReciente=true.
//   ?liga={providerId}&ronda={n}              -> la jornada n de la liga
//   ?liga={providerId}&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//        -> los partidos de la temporada cuya fecha (en hora de
//           Mazatlán, la zona del Club) cae dentro del rango.
//
// Cada partido trae `providerId`: es el id del evento en el proveedor y
// el panel lo guarda como partidos.api_fixture_id, para que el programa
// de marcadores sepa qué partido de la base corresponde a cuál del API.
// Y trae `terminado`: true si el API ya lo da por finalizado (el panel
// lo muestra desmarcado y con etiqueta, para no importar jugados).

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
  /** true si el proveedor ya lo da por terminado (FT/AET/PEN/AWD). */
  terminado: boolean;
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

/** Sin duplicados por id de evento y ordenados por hora de inicio. */
function ordenarSinDuplicados(fixtures: SportsFixture[]): SportsFixture[] {
  const porId = new Map<string, SportsFixture>();
  for (const f of fixtures) {
    if (!porId.has(f.providerId)) porId.set(f.providerId, f);
  }
  return [...porId.values()].sort((a, b) => {
    if (a.kickoffUtc && b.kickoffUtc) return a.kickoffUtc < b.kickoffUtc ? -1 : 1;
    if (a.kickoffUtc) return -1;
    if (b.kickoffUtc) return 1;
    return 0;
  });
}

/** Traduce los fixtures neutros a la forma que consume el panel. */
function paraElPanel(fixtures: SportsFixture[]): FixtureParaImportar[] {
  return fixtures.map((f) => ({
    ...f,
    homeTeamES: nombreEquipoES(f.homeTeam, f.homeTeamProviderId),
    awayTeamES: nombreEquipoES(f.awayTeam, f.awayTeamProviderId),
    terminado: f.status === 'finished',
  }));
}

/**
 * "Lo que sigue" de una temporada: agrupa por ronda y elige la MÁS
 * TEMPRANA que tenga al menos un partido NO terminado (el estado neutro
 * 'finished' ya resume FT/AET/PEN/AWD del proveedor; un pospuesto o en
 * curso cuenta como pendiente). Si ninguna ronda tiene pendientes, la
 * temporada se acabó: devuelve la última ronda y lo marca.
 */
function rondaQueSigue(temporada: SportsFixture[]): {
  fixtures: SportsFixture[];
  round: number | null;
  esMasReciente: boolean;
} {
  const porRonda = new Map<number | null, SportsFixture[]>();
  for (const f of temporada) {
    const grupo = porRonda.get(f.round) || [];
    grupo.push(f);
    porRonda.set(f.round, grupo);
  }
  // Rondas con número primero, de menor a mayor; la sin número al final.
  const rondas = [...porRonda.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  for (const r of rondas) {
    const grupo = porRonda.get(r) as SportsFixture[];
    if (grupo.some((f) => f.status !== 'finished')) {
      return { fixtures: grupo, round: r, esMasReciente: false };
    }
  }
  const ultima = rondas[rondas.length - 1];
  return {
    fixtures: ultima !== undefined ? (porRonda.get(ultima) as SportsFixture[]) : [],
    round: ultima !== undefined ? ultima : null,
    esMasReciente: true,
  };
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
  let modo: 'proximos' | 'ronda' | 'fechas' = 'proximos';
  if (rondaParam !== null && rondaParam !== '') {
    ronda = Number(rondaParam);
    if (!Number.isInteger(ronda) || ronda < 1) {
      return NextResponse.json(
        { error: 'La ronda debe ser un número entero mayor a cero.' },
        { status: 400 }
      );
    }
    modo = 'ronda';
  } else if (desde || hasta) {
    if (!desde || !hasta || desde > hasta) {
      return NextResponse.json(
        { error: 'Indica el rango completo: desde y hasta (desde <= hasta).' },
        { status: 400 }
      );
    }
    modo = 'fechas';
  }

  try {
    const provider = getSportsProvider();

    let fixtures: SportsFixture[];
    let rondaElegida: number | null = null;
    let esMasReciente = false;

    if (modo === 'ronda') {
      fixtures = await provider.getFixtures(liga.providerId, {
        season: liga.season,
        round: ronda as number,
      });
      rondaElegida = ronda;
    } else {
      // Fechas y "lo que sigue" parten del calendario de la temporada
      // (el adaptador lo cachea 1 h).
      const temporada = await provider.getFixtures(liga.providerId, {
        season: liga.season,
      });
      if (modo === 'fechas') {
        fixtures = temporada.filter((f) => {
          if (!f.kickoffUtc) return false;
          const dia = diaEnMazatlan(f.kickoffUtc);
          return dia >= (desde as string) && dia <= (hasta as string);
        });
      } else {
        const sigue = rondaQueSigue(temporada);
        fixtures = sigue.fixtures;
        rondaElegida = sigue.round;
        esMasReciente = sigue.esMasReciente;
      }
    }

    return NextResponse.json({
      league: {
        providerId: liga.providerId,
        name: liga.name,
        season: liga.season,
      },
      mode: modo,
      round: rondaElegida,
      esMasReciente,
      fixtures: paraElPanel(ordenarSinDuplicados(fixtures)),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `Error al importar partidos de ${liga.name} (modo=${modo}, ronda=${rondaParam}, desde=${desde}, hasta=${hasta}):`,
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
