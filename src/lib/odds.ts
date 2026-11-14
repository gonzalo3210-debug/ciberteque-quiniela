// =====================================================================
// Encuesta "¿Quién va a ganar?" — The Odds API (solo servidor)
// ---------------------------------------------------------------------
// Convierte las cuotas 1-X-2 (mercado h2h) de las casas de apuestas en
// PORCENTAJES: probabilidad implícita (1/cuota) promediada entre las
// casas que cotizan el partido y normalizada a 100.
//
// La llave vive en THE_ODDS_API_KEY (.env.local / Vercel) y NUNCA sale
// del servidor. El plan gratuito son 500 créditos/mes y cada consulta
// cuesta (mercados × regiones) = 2 créditos, así que la respuesta por
// deporte se cachea en memoria 45 minutos: abrir la vista del partido
// 100 veces no quema la cuota.
//
// Emparejamiento: por nombres normalizados (con tolerancia a prefijos
// de club: The Odds API dice "Guadalajara"/"FC Juárez"/"Atlante FC"
// donde TheSportsDB dice "CD Guadalajara"/"Juárez"/"Atlante") y, si se
// pasa la fecha, ventana de ±2 días sobre el inicio del partido.
// =====================================================================

import { normalizarNombreEquipo } from './sports/nombresES';

/** Liga soportada (id de TheSportsDB) → deporte en The Odds API. */
const DEPORTE_POR_LIGA: Record<string, string> = {
  '4350': 'soccer_mexico_ligamx',
  '4490': 'soccer_uefa_nations_league',
  '4480': 'soccer_uefa_champs_league',
  '4328': 'soccer_epl',
  '4335': 'soccer_spain_la_liga',
  '4332': 'soccer_italy_serie_a',
  '4331': 'soccer_germany_bundesliga',
  '4334': 'soccer_france_ligue_one',
  '4336': 'soccer_greece_super_league',
  '4501': 'soccer_conmebol_copa_libertadores',
};

/** Si no se conoce la liga del partido, se busca en estas primero. */
const DEPORTES_SIN_LIGA = [
  'soccer_mexico_ligamx',
  'soccer_uefa_nations_league',
  'soccer_uefa_champs_league',
];

const CACHE_MS = 45 * 60 * 1000;
const CACHE_ERROR_MS = 5 * 60 * 1000;
const VENTANA_FECHA_MS = 2 * 24 * 60 * 60 * 1000;

interface OddsOutcome {
  name: string;
  price: number;
}
interface OddsEvento {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: {
    markets?: { key: string; outcomes?: OddsOutcome[] }[];
  }[];
}

const cache = new Map<string, { at: number; eventos: OddsEvento[] }>();

async function eventosDeporte(sportKey: string): Promise<OddsEvento[]> {
  const hit = cache.get(sportKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.eventos;
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return [];
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/` +
      `?apiKey=${apiKey}&regions=us,eu&markets=h2h&oddsFormat=decimal`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`The Odds API respondió ${res.status}`);
    const data = (await res.json()) as OddsEvento[];
    const eventos = Array.isArray(data) ? data : [];
    cache.set(sportKey, { at: Date.now(), eventos });
    return eventos;
  } catch {
    // No quemar créditos reintentando en cada apertura de la vista.
    cache.set(sportKey, { at: Date.now() - (CACHE_MS - CACHE_ERROR_MS), eventos: [] });
    return [];
  }
}

// ---------- Emparejamiento por nombre ---------------------------------

const PALABRAS_CLUB = new Set([
  'cd',
  'cf',
  'fc',
  'club',
  'sc',
  'ac',
  'de',
  'el',
  'la',
  'los',
  'las',
  'deportivo',
  'atletico',
]);

/** Nombre comparable: normalizado y sin prefijos/sufijos de club. */
function comparable(nombre: string): string {
  return normalizarNombreEquipo(nombre)
    .split(' ')
    .filter((p) => p && !PALABRAS_CLUB.has(p))
    .join(' ');
}

function mismoEquipoOdds(a: string, b: string): boolean {
  const ca = comparable(a);
  const cb = comparable(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const [corta, larga] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  return corta.length >= 4 && larga.includes(corta);
}

// ---------- Cálculo de porcentajes ------------------------------------

export interface EncuestaPartido {
  porcentajes: { local: number; empate: number; visitante: number };
  casas: number;
  inicioUtc: string;
}

/**
 * Busca el partido (local/visitante, cualquier orientación) en las
 * cuotas de su liga y devuelve los porcentajes 1-X-2, o null si
 * ninguna casa lo cotiza (la vista simplemente no muestra encuesta).
 */
export async function encuestaPartido(
  local: string,
  visitante: string,
  ligaProviderId: string | null,
  fechaIso: string | null
): Promise<EncuestaPartido | null> {
  const deportes = ligaProviderId
    ? DEPORTE_POR_LIGA[ligaProviderId]
      ? [DEPORTE_POR_LIGA[ligaProviderId]]
      : []
    : DEPORTES_SIN_LIGA;
  const fechaMs = fechaIso ? new Date(fechaIso).getTime() : NaN;

  for (const sportKey of deportes) {
    const eventos = await eventosDeporte(sportKey);
    for (const ev of eventos) {
      const directo =
        mismoEquipoOdds(local, ev.home_team) &&
        mismoEquipoOdds(visitante, ev.away_team);
      const invertido =
        !directo &&
        mismoEquipoOdds(local, ev.away_team) &&
        mismoEquipoOdds(visitante, ev.home_team);
      if (!directo && !invertido) continue;
      if (!isNaN(fechaMs)) {
        const inicio = new Date(ev.commence_time).getTime();
        if (!isNaN(inicio) && Math.abs(inicio - fechaMs) > VENTANA_FECHA_MS)
          continue;
      }
      const p = porcentajesDeEvento(ev, invertido);
      if (p) return { ...p, inicioUtc: ev.commence_time };
    }
  }
  return null;
}

function porcentajesDeEvento(
  ev: OddsEvento,
  invertido: boolean
): { porcentajes: EncuestaPartido['porcentajes']; casas: number } | null {
  let sLocal = 0;
  let sEmpate = 0;
  let sVisita = 0;
  let casas = 0;
  for (const b of ev.bookmakers || []) {
    const mercado = (b.markets || []).find((m) => m.key === 'h2h');
    if (!mercado?.outcomes) continue;
    let pl: number | null = null;
    let pe: number | null = null;
    let pv: number | null = null;
    for (const o of mercado.outcomes) {
      if (!(o.price > 1)) continue;
      if (o.name === 'Draw') pe = 1 / o.price;
      else if (mismoEquipoOdds(o.name, ev.home_team)) pl = 1 / o.price;
      else if (mismoEquipoOdds(o.name, ev.away_team)) pv = 1 / o.price;
    }
    if (pl === null || pe === null || pv === null) continue;
    casas++;
    if (invertido) {
      sLocal += pv;
      sVisita += pl;
    } else {
      sLocal += pl;
      sVisita += pv;
    }
    sEmpate += pe;
  }
  if (casas === 0) return null;
  const total = sLocal + sEmpate + sVisita;
  if (total <= 0) return null;
  const redondea = (n: number) => Math.round((n / total) * 1000) / 10;
  return {
    casas,
    porcentajes: {
      local: redondea(sLocal),
      empate: redondea(sEmpate),
      visitante: redondea(sVisita),
    },
  };
}
