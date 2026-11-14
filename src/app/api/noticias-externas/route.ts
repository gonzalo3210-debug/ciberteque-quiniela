// src/app/api/noticias-externas/route.ts
//
// Noticias EXTERNAS para la sección 📰 Noticias (2026-11-14): titulares
// de medios deportivos en español desde feeds RSS PÚBLICOS, sin llaves
// ni registros. El cliente manda ?equipos=Nombre1,Nombre2,... con los
// equipos de la jornada del Club y los favoritos del jugador, y la ruta
// devuelve TODOS los titulares de las fuentes CLASIFICADOS:
//
//   categoria 'equipos'  — el titular menciona a alguno de esos
//                          equipos (emparejamiento de lib/rss.ts).
//   categoria 'deportes' — el resto: fútbol general y otros deportes.
//                          Es el respaldo del chip "📰 Deportes".
//
// La vista filtra por chip (Quiniela / Equipos / Deportes) SIN volver a
// pedir: la clasificación viaja hecha desde aquí.
//
// Fuentes verificadas el 2026-11-14 respondiendo RSS válido:
//   1. ESPN (espn.com.mx) — titulares deportivos generales en español.
//   2. Google Noticias (búsqueda "futbol", edición México) — notas de
//      la jornada y de los equipos, con su medio original.
//   3. Google Noticias (búsqueda "deportes", edición México) — el
//      barrido amplio para el chip Deportes (otros deportes incluidos).
// Los feeds se piden con caché de 30 min (next.revalidate): 40
// jugadores abriendo Noticias no son 40 consultas a los medios.
// Si TODAS las fuentes fallan, la ruta responde 200 con listas vacías
// y la vista muestra solo las noticias del club.

import { NextResponse } from 'next/server';
import { parseRss, textoMencionaEquipo, type NoticiaRss } from '@/lib/rss';
import { normalizarNombreEquipo } from '@/lib/sports/nombresES';

export const dynamic = 'force-dynamic';

const FUENTES = [
  { url: 'https://www.espn.com.mx/espn/rss/news', medio: 'ESPN Deportes' },
  {
    url: 'https://news.google.com/rss/search?q=futbol&hl=es-419&gl=MX&ceid=MX:es-419',
    medio: 'Google Noticias',
  },
  {
    url: 'https://news.google.com/rss/search?q=deportes&hl=es-419&gl=MX&ceid=MX:es-419',
    medio: 'Google Noticias',
  },
];

const CACHE_SEGUNDOS = 1800; // 30 minutos
const MAX_EQUIPOS = 40;
const MAX_DE_EQUIPOS = 20;
const MAX_DE_DEPORTES = 20;

export type CategoriaExterna = 'equipos' | 'deportes';

interface NoticiaExterna extends NoticiaRss {
  /** Equipos (de los pedidos) que la nota menciona. */
  equipos: string[];
  /** Chip al que pertenece: 'equipos' si empareja, 'deportes' si no. */
  categoria: CategoriaExterna;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const equipos = (searchParams.get('equipos') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .slice(0, MAX_EQUIPOS);

  const resultados = await Promise.allSettled(
    FUENTES.map(async (fuente) => {
      const res = await fetch(fuente.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ClubPronosticos/1.0; lector RSS de noticias deportivas)',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
        next: { revalidate: CACHE_SEGUNDOS },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      return { medio: fuente.medio, items: parseRss(xml, fuente.medio) };
    })
  );

  const fuentesOk: string[] = [];
  const todas: NoticiaRss[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled' && r.value.items.length > 0) {
      fuentesOk.push(r.value.medio);
      todas.push(...r.value.items);
    } else if (r.status === 'rejected') {
      console.error('Noticias externas: una fuente falló:', r.reason);
    }
  }

  const vistas = new Set<string>();
  const deEquipos: NoticiaExterna[] = [];
  const deDeportes: NoticiaExterna[] = [];
  for (const item of todas) {
    if (vistas.has(item.enlace)) continue;
    vistas.add(item.enlace);
    const texto = normalizarNombreEquipo(`${item.titulo} ${item.descripcion}`);
    const mencionados =
      equipos.length > 0
        ? equipos.filter((eq) => textoMencionaEquipo(texto, eq))
        : [];
    if (mencionados.length > 0) {
      deEquipos.push({ ...item, equipos: mencionados, categoria: 'equipos' });
    } else {
      deDeportes.push({ ...item, equipos: [], categoria: 'deportes' });
    }
  }

  const porFecha = (a: NoticiaExterna, b: NoticiaExterna) =>
    (b.fechaISO || '').localeCompare(a.fechaISO || '');
  deEquipos.sort(porFecha);
  deDeportes.sort(porFecha);

  return NextResponse.json({
    noticias: [
      ...deEquipos.slice(0, MAX_DE_EQUIPOS),
      ...deDeportes.slice(0, MAX_DE_DEPORTES),
    ],
    fuentes: fuentesOk,
    fetchedAt: new Date().toISOString(),
  });
}
