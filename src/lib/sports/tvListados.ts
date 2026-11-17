// src/lib/sports/tvListados.ts
//
// Piezas PURAS de "dónde ver" desde el proveedor: normalizar los
// listados crudos de TV (en TheSportsDB, la respuesta de
// lookuptv.php) y traducir los nombres de país más comunes a
// español para mostrarlos.
//
// Sin red ni estado, y sin el guardado de "solo servidor" de
// thesportsdb.ts: lo usa el ADAPTADOR para normalizar y también
// VistaPartido (cliente) para pintar el país — el mismo arreglo que
// nombresES.ts. La lógica se prueba en scripts/pruebas-tv-partido.mjs.

import type { FixtureTVListing } from './types';

/** Forma mínima que se le pide a cada entrada cruda del proveedor. */
export interface ListadoTVCrudo {
  strChannel?: string | null;
  strCountry?: string | null;
  strLogo?: string | null;
}

/**
 * Limpia un texto del proveedor: recorta espacios y trata la cadena
 * "NULL" (así llega a veces un campo vacío de TheSportsDB, visto en
 * la línea de tiempo) y la cadena vacía como "sin dato".
 */
function textoLimpio(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (!limpio || limpio.toUpperCase() === 'NULL') return null;
  return limpio;
}

/**
 * Normaliza los listados crudos de TV de un partido:
 * - descarta entradas sin nombre de canal (no hay nada que mostrar);
 * - quita duplicados del mismo canal y país (el proveedor a veces
 *   repite la misma transmisión), conservando la primera aparición
 *   (y su logo si la primera no traía y una repetida sí);
 * - conserva el orden en que los da el proveedor.
 * Entrada null o no-arreglo -> [].
 */
export function normalizarListadosTV(
  crudos: readonly ListadoTVCrudo[] | null | undefined
): FixtureTVListing[] {
  if (!Array.isArray(crudos)) return [];
  const vistos = new Map<string, FixtureTVListing>();
  for (const crudo of crudos) {
    if (!crudo || typeof crudo !== 'object') continue;
    const channel = textoLimpio(crudo.strChannel);
    if (!channel) continue;
    const country = textoLimpio(crudo.strCountry);
    const logoUrl = textoLimpio(crudo.strLogo);
    const clave = `${channel.toLowerCase()}|${(country || '').toLowerCase()}`;
    const previo = vistos.get(clave);
    if (previo) {
      if (!previo.logoUrl && logoUrl) previo.logoUrl = logoUrl;
      continue;
    }
    vistos.set(clave, { channel, country, logoUrl });
  }
  return [...vistos.values()];
}

/**
 * Nombres de país del proveedor -> español, solo los más comunes en
 * los listados de TV. Lo que no esté en el mapa se muestra tal como
 * viene (mejor el nombre del proveedor que inventar una traducción).
 */
const PAISES_ES: Record<string, string> = {
  'united states': 'Estados Unidos',
  'united states of america': 'Estados Unidos',
  usa: 'Estados Unidos',
  mexico: 'México',
  spain: 'España',
  'united kingdom': 'Reino Unido',
  'great britain': 'Reino Unido',
  england: 'Inglaterra',
  scotland: 'Escocia',
  wales: 'Gales',
  germany: 'Alemania',
  france: 'Francia',
  italy: 'Italia',
  portugal: 'Portugal',
  netherlands: 'Países Bajos',
  belgium: 'Bélgica',
  brazil: 'Brasil',
  argentina: 'Argentina',
  chile: 'Chile',
  colombia: 'Colombia',
  peru: 'Perú',
  uruguay: 'Uruguay',
  canada: 'Canadá',
  australia: 'Australia',
  ireland: 'Irlanda',
  'republic of ireland': 'Irlanda',
  denmark: 'Dinamarca',
  norway: 'Noruega',
  sweden: 'Suecia',
  poland: 'Polonia',
  turkey: 'Turquía',
  greece: 'Grecia',
  russia: 'Rusia',
  ukraine: 'Ucrania',
  japan: 'Japón',
  china: 'China',
  india: 'India',
  'south africa': 'Sudáfrica',
  'saudi arabia': 'Arabia Saudita',
  'united arab emirates': 'Emiratos Árabes Unidos',
  qatar: 'Catar',
  'new zealand': 'Nueva Zelanda',
  'south korea': 'Corea del Sur',
  indonesia: 'Indonesia',
  malaysia: 'Malasia',
  singapore: 'Singapur',
  thailand: 'Tailandia',
  vietnam: 'Vietnam',
  philippines: 'Filipinas',
  egypt: 'Egipto',
  morocco: 'Marruecos',
  nigeria: 'Nigeria',
  ghana: 'Ghana',
  kenya: 'Kenia',
  austria: 'Austria',
  switzerland: 'Suiza',
  'czech republic': 'Chequia',
  czechia: 'Chequia',
  croatia: 'Croacia',
  serbia: 'Serbia',
  romania: 'Rumania',
  bulgaria: 'Bulgaria',
  hungary: 'Hungría',
  finland: 'Finlandia',
  iceland: 'Islandia',
  israel: 'Israel',
  cyprus: 'Chipre',
  albania: 'Albania',
  'bosnia and herzegovina': 'Bosnia y Herzegovina',
  montenegro: 'Montenegro',
  'north macedonia': 'Macedonia del Norte',
  slovenia: 'Eslovenia',
  slovakia: 'Eslovaquia',
  estonia: 'Estonia',
  latvia: 'Letonia',
  lithuania: 'Lituania',
  georgia: 'Georgia',
  armenia: 'Armenia',
  azerbaijan: 'Azerbaiyán',
  kazakhstan: 'Kazajistán',
  uzbekistan: 'Uzbekistán',
  iran: 'Irán',
  iraq: 'Irak',
  kuwait: 'Kuwait',
  bahrain: 'Baréin',
  oman: 'Omán',
  jordan: 'Jordania',
  lebanon: 'Líbano',
  pakistan: 'Pakistán',
  bangladesh: 'Bangladés',
  'sri lanka': 'Sri Lanka',
  nepal: 'Nepal',
  myanmar: 'Myanmar',
  cambodia: 'Camboya',
  laos: 'Laos',
  brunei: 'Brunéi',
  'hong kong': 'Hong Kong',
  taiwan: 'Taiwán',
  mongolia: 'Mongolia',
  ecuador: 'Ecuador',
  venezuela: 'Venezuela',
  bolivia: 'Bolivia',
  paraguay: 'Paraguay',
  'costa rica': 'Costa Rica',
  panama: 'Panamá',
  guatemala: 'Guatemala',
  honduras: 'Honduras',
  'el salvador': 'El Salvador',
  nicaragua: 'Nicaragua',
  'dominican republic': 'República Dominicana',
  cuba: 'Cuba',
  jamaica: 'Jamaica',
  'trinidad and tobago': 'Trinidad y Tobago',
  algeria: 'Argelia',
  tunisia: 'Túnez',
  libya: 'Libia',
  sudan: 'Sudán',
  ethiopia: 'Etiopía',
  angola: 'Angola',
  mozambique: 'Mozambique',
  zambia: 'Zambia',
  zimbabwe: 'Zimbabue',
  cameroon: 'Camerún',
  'ivory coast': 'Costa de Marfil',
  senegal: 'Senegal',
  mali: 'Malí',
  uganda: 'Uganda',
  tanzania: 'Tanzania',
};

/** País para mostrar: traducido si se conoce; si no, tal como viene. */
export function nombrePaisES(country: string | null): string | null {
  const limpio = textoLimpio(country);
  if (!limpio) return null;
  return PAISES_ES[limpio.toLowerCase()] ?? limpio;
}
