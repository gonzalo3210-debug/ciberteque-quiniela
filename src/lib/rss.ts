// src/lib/rss.ts
//
// Lector mínimo de RSS 2.0 para las NOTICIAS EXTERNAS de la sección
// 📰 Noticias (2026-11-14): titulares de medios deportivos en español
// obtenidos de feeds PÚBLICOS, sin llaves ni registros.
//
// No hay librería XML en el proyecto y los feeds que se consumen son
// RSS 2.0 estándar, así que el parseo es con expresiones regulares
// tolerantes (CDATA, entidades HTML, campos en cualquier orden). Si
// un feed cambia de formato o cae, parseRss devuelve lo que alcance
// y la ruta sigue con las demás fuentes.
//
// También trae el emparejamiento titular↔equipo: un titular es "de"
// un equipo si el nombre del equipo (en su forma de la app, en la del
// proveedor o en español) aparece en el titular o la descripción,
// comparando sin acentos ni mayúsculas.

import {
  nombreEquipoES,
  normalizarNombreEquipo,
} from '@/lib/sports/nombresES';

export interface NoticiaRss {
  titulo: string;
  enlace: string;
  /** Fecha de publicación en ISO 8601, si el feed la trae legible. */
  fechaISO: string | null;
  /** Medio que publica la nota (p. ej. "ESPN Deportes"). */
  medio: string;
  descripcion: string;
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

function limpiarTexto(crudo: string): string {
  let s = crudo.trim();
  const cdata = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) s = cdata[1];
  s = s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
  for (const [entidad, valor] of Object.entries(ENTIDADES)) {
    s = s.split(entidad).join(valor);
  }
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function campo(item: string, tag: string): string | null {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? limpiarTexto(m[1]) : null;
}

/** Parsea un documento RSS 2.0 y devuelve sus noticias. */
export function parseRss(xml: string, medioPorDefecto: string): NoticiaRss[] {
  const noticias: NoticiaRss[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    const titulo = campo(item, 'title');
    const enlace = campo(item, 'link');
    if (!titulo || !enlace) continue;
    const pubDate = campo(item, 'pubDate');
    let fechaISO: string | null = null;
    if (pubDate) {
      const ms = Date.parse(pubDate);
      if (!Number.isNaN(ms)) fechaISO = new Date(ms).toISOString();
    }
    noticias.push({
      titulo,
      enlace,
      fechaISO,
      medio: campo(item, 'source') || medioPorDefecto,
      descripcion: campo(item, 'description') || '',
    });
  }
  return noticias;
}

// ---------- Emparejamiento con equipos --------------------------------------

/** Palabras que NO identifican a un equipo por sí solas. */
const PALABRAS_GENERICAS = new Set([
  'real',
  'club',
  'atletico',
  'deportivo',
  'union',
  'sporting',
  'independiente',
  'nacional',
  'central',
  'ciudad',
]);

/**
 * Formas con las que un equipo puede aparecer en un titular, ya
 * normalizadas: su nombre tal cual, su nombre en español, y su
 * primera palabra si es distintiva ("Tigres UANL" → también "Tigres";
 * "Cruz Azul" no genera "Cruz" por corta y genérica).
 */
export function formasBusquedaEquipo(nombre: string): string[] {
  const formas = new Set<string>();
  const completo = normalizarNombreEquipo(nombre);
  if (completo.length >= 4) formas.add(completo);
  const enEspanol = normalizarNombreEquipo(nombreEquipoES(nombre));
  if (enEspanol.length >= 4) formas.add(enEspanol);
  const primera = completo.split(' ')[0];
  if (
    primera &&
    primera.length >= 6 &&
    !PALABRAS_GENERICAS.has(primera) &&
    completo.includes(' ')
  ) {
    formas.add(primera);
  }
  return [...formas];
}

/** ¿El texto (titular + descripción) habla de este equipo? */
export function textoMencionaEquipo(
  textoNormalizado: string,
  nombreEquipo: string
): boolean {
  return formasBusquedaEquipo(nombreEquipo).some((forma) =>
    textoNormalizado.includes(forma)
  );
}
