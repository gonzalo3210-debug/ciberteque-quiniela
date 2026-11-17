// src/app/api/eventos-partido/route.ts
//
// Eventos importantes de uno o varios partidos (su línea de tiempo
// del proveedor, ya clasificada por el adaptador): la fuente del
// "⚡ Minuto a minuto" de la sección Noticias.
//
// Ruta de servidor: la llave del proveedor nunca sale al navegador.
// Parámetros:
//   ?fixture={id}          un solo partido
//   ?fixtures={id,id,...}  varios (máx. 12; la quiniela trae 10)
//
// Cada partido devuelve su ficha (equipos, marcador y estado al
// momento) y TODOS sus eventos clasificados (gol, gol_penal,
// autogol, penal_fallado, roja, amarilla, cambio, gol_anulado,
// otro) en orden cronológico; el cliente decide cuáles muestra.
// Los goles traen además `marcadorTrasGol`: el marcador justo
// después de ese gol, derivado aquí del orden de los eventos (solo
// suman los tipos que meten gol, acreditados al lado que indica el
// propio evento; el penal fallado y el gol anulado NO suman).
//
// La línea se lee tal cual viene del proveedor en cada consulta
// (el adaptador la cachea 60 s): si el VAR anula un gol, el evento
// desaparece del feed solo, igual que el marcador se corrige solo.

import { NextResponse } from 'next/server';
import { getSportsProvider } from '@/lib/sports';
import type { FixtureEvent, FixtureEventsResult } from '@/lib/sports';

export const dynamic = 'force-dynamic';

const MAX_PARTIDOS = 12;

/** Tipos de evento que SUMAN un gol al marcador derivado. */
const SUMA_GOL = new Set(['gol', 'gol_penal', 'autogol']);

interface EventoRespuesta extends FixtureEvent {
  /** Marcador justo tras el gol (solo en eventos que suman gol). */
  marcadorTrasGol: { local: number; visita: number } | null;
}

interface PartidoRespuesta {
  fixture: FixtureEventsResult['fixture'];
  eventos: EventoRespuesta[];
}

/** Deriva el marcador tras cada gol recorriendo los eventos en orden. */
function conMarcadorTrasGol(resultado: FixtureEventsResult): PartidoRespuesta {
  let local = 0;
  let visita = 0;
  const eventos: EventoRespuesta[] = resultado.events.map((e) => {
    let marcadorTrasGol: EventoRespuesta['marcadorTrasGol'] = null;
    if (SUMA_GOL.has(e.type) && e.side) {
      if (e.side === 'home') local += 1;
      else visita += 1;
      marcadorTrasGol = { local, visita };
    }
    return { ...e, marcadorTrasGol };
  });
  return { fixture: resultado.fixture, eventos };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const crudos = [
    ...(searchParams.get('fixtures') || '').split(','),
    searchParams.get('fixture') || '',
  ]
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const ids = [...new Set(crudos)].slice(0, MAX_PARTIDOS);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Indica al menos un partido (?fixture= o ?fixtures=).' },
      { status: 400 }
    );
  }
  if (ids.some((id) => !/^\d+$/.test(id))) {
    return NextResponse.json(
      { error: 'Los IDs de partido deben ser numéricos.' },
      { status: 400 }
    );
  }

  try {
    const provider = getSportsProvider();
    const resultados = await Promise.all(
      ids.map(async (id) => {
        try {
          return await provider.getFixtureEvents(id);
        } catch (e) {
          // Un partido sin datos no tumba a los demás.
          console.error(`Eventos del partido ${id}:`, e);
          return null;
        }
      })
    );
    const matches = resultados
      .filter((r): r is FixtureEventsResult => r !== null)
      .map(conMarcadorTrasGol);
    return NextResponse.json({
      matches,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al obtener los eventos de los partidos:', error);
    return NextResponse.json(
      {
        error:
          'No se pudieron cargar los eventos. Intenta de nuevo en unos minutos.',
      },
      { status: 502 }
    );
  }
}
