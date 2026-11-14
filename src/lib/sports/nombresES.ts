// src/lib/sports/nombresES.ts
//
// Nombres de equipos EN ESPAÑOL para MOSTRAR en la sección "⚽ Partidos".
//
// El proveedor (TheSportsDB) da los nombres en inglés ("Denmark",
// "Bayern Munich", "N.Ireland"...). Esta capa traduce SOLO al pintar en
// pantalla: no toca los datos guardados, ni los favoritos de
// localStorage, ni el matching interno (que sigue usando los nombres e
// IDs originales del proveedor).
//
// Clave preferida: el ID del equipo en el proveedor (los partidos y las
// filas de tabla lo traen). Respaldo: el nombre original normalizado
// (minúsculas, sin acentos) por si alguna vista no trae el ID.
//
// Criterio de inclusión (uso común en México): selecciones nacionales
// con su nombre en español y clubes cuyo nombre en español difiere del
// inglés (Bayern Múnich, Club Brujas, Inter de Milán...). Los nombres
// que en español se usan igual que en inglés NO se incluyen: caen al
// nombre original. Los IDs y nombres originales salieron de la API real
// (catálogo, calendario y tabla de las 10 ligas soportadas, 2026-11-14).
//
// Para agregar un nombre: añade una línea [id, nombre original, nombre
// en español] en ENTRADAS con el ID que da el proveedor para ese equipo.
//
// OJO: archivo PURO (sin imports) para poder importarse desde
// componentes cliente, igual que leagues.ts.

type EntradaNombreES = [
  /** ID del equipo en el proveedor. */
  teamProviderId: string,
  /** Nombre tal como lo da el proveedor (para el respaldo por nombre). */
  nombreOriginal: string,
  /** Nombre a mostrar en español. */
  nombreES: string,
];

const ENTRADAS: EntradaNombreES[] = [
  // ---- Selecciones de la Nations League (las que difieren del inglés) --
  ['136455', 'Azerbaijan', 'Azerbaiyán'],
  ['136454', 'Belarus', 'Bielorrusia'],
  ['134515', 'Belgium', 'Bélgica'],
  ['134510', 'Bosnia-Herzegovina', 'Bosnia y Herzegovina'],
  ['133912', 'Croatia', 'Croacia'],
  ['136451', 'Cyprus', 'Chipre'],
  ['133904', 'Czech Republic', 'República Checa'],
  ['133906', 'Denmark', 'Dinamarca'],
  ['133914', 'England', 'Inglaterra'],
  ['136466', 'Faroe Islands', 'Islas Feroe'],
  ['136468', 'Finland', 'Finlandia'],
  ['133913', 'France', 'Francia'],
  ['133907', 'Germany', 'Alemania'],
  ['133902', 'Greece', 'Grecia'],
  ['135987', 'Hungary', 'Hungría'],
  ['135988', 'Iceland', 'Islandia'],
  ['133911', 'Ireland', 'Irlanda'],
  ['133910', 'Italy', 'Italia'],
  ['136449', 'Kazakhstan', 'Kazajistán'],
  ['136517', 'Latvia', 'Letonia'],
  ['136459', 'Lithuania', 'Lituania'],
  ['136458', 'Luxembourg', 'Luxemburgo'],
  ['136460', 'Moldova', 'Moldavia'],
  ['135984', 'N.Ireland', 'Irlanda del Norte'],
  ['133905', 'Netherlands', 'Países Bajos'],
  ['136457', 'North Macedonia', 'Macedonia del Norte'],
  ['136516', 'Norway', 'Noruega'],
  ['133901', 'Poland', 'Polonia'],
  ['135980', 'Romania', 'Rumania'],
  ['136450', 'Scotland', 'Escocia'],
  ['135983', 'Slovakia', 'Eslovaquia'],
  ['136456', 'Slovenia', 'Eslovenia'],
  ['133909', 'Spain', 'España'],
  ['133916', 'Sweden', 'Suecia'],
  ['134506', 'Switzerland', 'Suiza'],
  ['135985', 'Turkey', 'Turquía'],
  ['133915', 'Ukraine', 'Ucrania'],
  ['135982', 'Wales', 'Gales'],

  // ---- Clubes cuyo nombre en español difiere del inglés ----------------
  ['133664', 'Bayern Munich', 'Bayern Múnich'],
  ['133714', 'Paris Saint-Germain', 'París Saint-Germain'],
  ['133729', 'Atlético Madrid', 'Atlético de Madrid'],
  ['133727', 'Athletic Bilbao', 'Athletic de Bilbao'],
  ['133937', 'Celta Vigo', 'Celta de Vigo'],
  ['133619', 'Brighton and Hove Albion', 'Brighton'],
  ['133681', 'Inter Milan', 'Inter de Milán'],
  ['133667', 'AC Milan', 'AC Milán'],
  ['134781', 'Bologna', 'Bolonia'],
  ['133789', 'Club Brugge', 'Club Brujas'],
  ['133987', 'Crvena Zvezda', 'Estrella Roja'],
  ['133753', 'AEK Athens', 'AEK Atenas'],
  ['134007', 'Sparta Prague', 'Sparta Praga'],
  ['136036', 'Slavia Prague', 'Slavia Praga'],
  ['134085', 'Levski Sofia', 'Levski Sofía'],
  ['133654', 'Köln', 'Colonia'],
  ['133651', 'Hamburg', 'Hamburgo'],
  ['133707', 'Marseille', 'Marsella'],
  ['133712', 'Nice', 'Niza'],
  ['133823', 'Monaco', 'Mónaco'],
  ['133882', 'Strasbourg', 'Estrasburgo'],
];

const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const POR_ID = new Map<string, string>();
const POR_NOMBRE = new Map<string, string>();
for (const [id, original, es] of ENTRADAS) {
  if (original === es) continue; // sin cambio real: no hace falta entrada
  POR_ID.set(id, es);
  POR_NOMBRE.set(normalizar(original), es);
}

/**
 * Nombre de equipo para MOSTRAR: en español si está en el diccionario
 * (por ID del proveedor, o por nombre normalizado si no hay ID), y el
 * nombre original en cualquier otro caso.
 */
export function nombreEquipoES(
  nombreOriginal: string,
  teamProviderId?: string | null
): string {
  if (teamProviderId) {
    const porId = POR_ID.get(teamProviderId);
    if (porId) return porId;
  }
  return POR_NOMBRE.get(normalizar(nombreOriginal)) ?? nombreOriginal;
}
