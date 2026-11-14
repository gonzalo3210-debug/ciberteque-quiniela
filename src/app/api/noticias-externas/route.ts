// src/app/api/noticias-externas/route.ts
//
// Noticias EXTERNAS de los equipos para la sección 📰 Noticias
// (2026-11-14): titulares de medios deportivos en español desde feeds
// RSS PÚBLICOS, emparejados con los equipos que mande el cliente en
// ?equipos=Nombre1,Nombre2,... (los de la jornada del Club y los
// favoritos del jugador).
//
// Fuentes verificadas el 2026-11-14 respondiendo RSS válido:
//   1. ESPN (espn.com.mx) — titulares deportivos en español.
//   2. Google Noticias (búsqueda "futbol", edición México) — respaldo
//      y complemento; cada nota trae su medio original.
// Los feeds se piden con caché de 30 min (next.revalidate): 40
// jugadores abriendo Noticias no son 40 consultas a los medios.
// Sin llaves, sin registros. Si TODAS las fuentes fallan, la ruta
// responde 200 con la lista vacía y la vista muestra solo las
// noticias del club.

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
];

const CACHE_SEGUNDOS = 1800; // 30 minutos
const MAX_EQUIPOS = 40;
const MAX_NOTICIAS = 20;

interface NoticiaExterna extends NoticiaRss {
  /** Equipos (de los pedidos) que la nota menciona. */
  equipos: string[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const equipos = (searchParams.get('equipos') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .slice(0, MAX_EQUIPOS);

  if (equipos.length === 0) {
    return NextResponse.json({ noticias: [], fuentes: [] });
  }

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
  const noticias: NoticiaExterna[] = [];
  for (const item of todas) {
    if (vistas.has(item.enlace)) continue;
    const texto = normalizarNombreEquipo(`${item.titulo} ${item.descripcion}`);
    const mencionados = equipos.filter((eq) =>
      textoMencionaEquipo(texto, eq)
    );
    if (mencionados.length === 0) continue;
    vistas.add(item.enlace);
    noticias.push({ ...item, equipos: mencionados });
  }

  noticias.sort((a, b) =>
    (b.fechaISO || '').localeCompare(a.fechaISO || '')
  );

  return NextResponse.json({
    noticias: noticias.slice(0, MAX_NOTICIAS),
    fuentes: fuentesOk,
    fetchedAt: new Date().toISOString(),
  });
}
