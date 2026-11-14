# lib/sports — adaptador de proveedor deportivo

Base de la integración con APIs de deportes acordada con Gonzalo
(2026-11-10/13). Es la pieza única por la que la app pide partidos, tabla
y logos a proveedores externos.

## Ya conectado

- **Sección "⚽ Partidos"** (rediseño 2026-11-13, tipo 365Scores;
  reorganizada 2026-11-14 al diseño de Gonzalo): la vieja pestaña
  "Tabla Liga MX" se reemplazó por UNA sola sección en el menú
  (`src/components/SeccionPartidos.tsx`). Nada de un botón por liga.
  Arriba lleva tres FILTROS y debajo las PESTAÑAS de la sección:
  - **🔴 Live** (ruta `src/app/api/en-vivo`): partidos en vivo ahora,
    en bloques por prioridad — 🎯 De tu quiniela, ⭐ Tus favoritos,
    🔴 En vivo ahora (resto de ligas soportadas). La ruta devuelve el
    livescore v2 filtrado a ligas soportadas MÁS los partidos que
    coincidan con los pares de la jornada (`?pares=Local|Visitante;…`),
    porque los de quiniela a veces son de otra competencia (amistosos
    de selecciones). La clasificación la hace el cliente.
  - **📅 Calendario**: partidos por día (selector ‹ › y Hoy) de todas
    las ligas soportadas; es la vista Resultados de siempre.
  - **🔎 Buscar** (ruta `src/app/api/buscar?q=`): ligas y equipos por
    nombre, insensible a acentos y con la capa de nombres en español
    ("Dinamarca" encuentra a "Denmark"). Un equipo abre su vista; una
    liga, sus posiciones.
  - **🎯 Quiniela**: los partidos de la jornada activa o abierta del
    Club (Supabase, hook `src/hooks/useJornadaActual.ts`) EMPAREJADOS
    con los fixtures de la API (`src/lib/emparejar.ts`: par de equipos
    con nombres normalizados + diccionario español, fecha ±1 día)
    para traer marcador y minuto en vivo; el que no se empareja (p.
    ej. amistosos fuera de las ligas soportadas) se pinta con los
    datos de la app. Los fixtures se piden con el modo rango de
    `/api/partidos?desde=&hasta=`.
  - **⭐ Favoritos / ⭐ Siguiendo**: partidos de las ligas/equipos que
    sigue el usuario y su administración. Favoritos vive en
    localStorage (`src/lib/favoritos.ts`), sin tocar Supabase; por
    defecto se siguen Liga MX, Nations y Champions.
  - **Ligas soportadas**: catálogo `SUPPORTED_LEAGUES` en `leagues.ts`
    (Liga MX, Nations, Champions, Premier, La Liga, Serie A, Bundesliga,
    Ligue 1, Grecia y Copa Libertadores 4501). Cada liga trae su
    temporada, su esquema de zonas y si el proveedor da tabla de ella.
  - **Resultados/Favoritos**: ruta `src/app/api/partidos?dias=N` —
    calendario de temporada recortado a la ventana de Mazatlán (ayer a
    hoy+N días), agrupado por liga, con escudos y mezcla de marcadores
    en vivo.
  - **Posiciones**: ruta `src/app/api/tabla-liga?liga={id}` generalizada
    → `src/components/TablaLiga.tsx` parametrizado por liga, con selector
    dentro de la sección. OJO: es la tabla DE LA LIGA; el ranking del
    Club entre jugadores (Supabase, pestaña Ranking) es otra cosa.
  - **Equipos por liga**: ruta `src/app/api/equipos-liga?liga={id}` para
    administrar favoritos; si el proveedor no trae catálogo de equipos
    (Nations), la lista se arma desde el calendario de la temporada.
- **Tabla EN VIVO**: `computeLiveStandings(base, liveResults)` en
  `liveStandings.ts` — función pura que recalcula la tabla aplicando los
  marcadores en curso. Decisión de Gonzalo (2026-11-13): la tabla debe
  recalcularse AL CAER GOL. YA está conectada: `getLiveScores()`
  (API v2 premium, una consulta para todas las ligas, caché 60 s) alimenta
  `/api/tabla-liga`, que devuelve `liveRows` recalculada cuando la liga
  tiene partidos en curso, y la vista la marca "EN VIVO" refrescándose
  cada 2 minutos (igual que la lista de partidos).
- **Tabla de Champions desde fuente secundaria (2026-11-14)**:
  TheSportsDB tampoco trae la tabla de la Champions y la calculada
  salía incompleta (su calendario no trae todas las jornadas), así que
  la tabla OFICIAL de la fase de liga (36 equipos) se pide a
  **football-data.org** — ver la sección propia más abajo. Ya NO se
  marca "calculada". Si esa fuente falla, la ruta cae al respaldo
  calculado de siempre.
- **Sin tabla oficial → tabla calculada**: Nations League y
  Libertadores devuelven el cuerpo vacío en `lookuptable` (grupos/copa),
  así que `hasStandings=false` — pero ya no se muestra solo el aviso: la
  app CALCULA la tabla desde los resultados de la temporada con
  `computeStandingsFromResults(fixtures, modo)` (`computedStandings.ts`,
  función pura). `/api/tabla-liga` la devuelve con `calculated: true` y
  `groups`, y la vista la marca **"🧮 Tabla calculada por la app"**,
  distinta de la oficial; la tabla en vivo al caer gol también aplica
  por grupo (`liveGroups`). Detalles y límites del cálculo:
  - Solo cuentan partidos finalizados (3/1 puntos). Desempate:
    puntos → DG → GF → nombre. **Sin enfrentamiento directo.**
  - El proveedor NO trae campo de grupo: la fase se aísla por la RONDA
    (en una jornada de grupos/liga nadie juega dos veces en la misma
    ronda; las clasificatorias y llaves sí repiten). Champions
    (`computedTable: 'unica'`): una sola tabla con las rondas
    "completas" (verificado: rondas 4-8, 36 equipos; las
    clasificatorias quedan fuera).
  - Nations y Libertadores (`computedTable: 'grupos'`): los grupos son
    las componentes del grafo de partidos de la fase (quién juega
    contra quién — membresía real del calendario, verificado:
    Nations 14 grupos, Libertadores 8 de 4 con sus 96 partidos). Los
    nombres oficiales de grupo no vienen en el dato: se etiquetan
    "Grupo 1", "Grupo 2", ... sin fingir el nombre oficial.
  - Ojo: un partido con estado `AWD` (adjudicado, p. ej. 0-3) cuenta
    como finalizado con su marcador; el adaptador lo mapea así desde
    2026-11-13 (antes salía "en vivo" para siempre).
- Llave premium de TheSportsDB activa (cuenta gonzalo3210): tabla de
  Liga MX verificada COMPLETA (18/18) y temporada con 153 eventos.

## Nombres de equipos en español (capa de mostrar)

El proveedor da los nombres en inglés; la app los muestra en español
con `nombreEquipoES(nombre, teamProviderId)` de **`nombresES.ts`**
(archivo puro, importable desde componentes cliente). Es SOLO una capa
de presentación: no toca datos guardados, favoritos de localStorage ni
matching interno (siguen con nombre e ID originales del proveedor).

- Clave preferida: el **ID del equipo** en el proveedor; respaldo por
  nombre normalizado (sin acentos) si una vista no trae el ID.
- Cobertura: las selecciones de Nations League cuyo nombre difiere del
  inglés (Dinamarca, Alemania, Bosnia y Herzegovina, Irlanda del
  Norte...) y los clubes de las ligas soportadas con nombre español
  distinto (Bayern Múnich, París Saint-Germain, Club Brujas, Inter de
  Milán...). Lo que no está en el diccionario cae al nombre original.
- **Agregar un nombre**: una línea `[id, nombre original, nombre ES]`
  en el arreglo `ENTRADAS` de `nombresES.ts`, con el ID que da el
  proveedor para ese equipo.

## Fuente secundaria: football-data.org (tabla de Champions)

`footballData.ts` — se usa SOLO para la tabla oficial de la UEFA
Champions League (liga 4480), que TheSportsDB no publica:

- Endpoint v4: `GET /v4/competitions/CL/standings` con el header
  `X-Auth-Token`; se toma la tabla de tipo `TOTAL` (fase de liga,
  36 equipos) y se mapea a la forma neutra `StandingRow`.
- Cada equipo se devuelve con su **ID y nombre canónico de
  TheSportsDB** (mapa en el propio archivo, verificado contra ambas
  APIs) para que la capa de nombres en español, el resaltado por
  equipo y el recálculo en vivo funcionen igual; el escudo es el
  `crest` de football-data.
- Zonas de la fase de liga (en `leagues.ts`, `zones: 'champions'`):
  **1–8 octavos directo, 9–24 playoff, 25–36 eliminados**.
- Caché de 1 hora vía `next.revalidate`; el plan gratis permite
  10 peticiones/minuto, de sobra con ese caché.
- **Respaldo**: si falta el token o la fuente falla, `getStandings`
  propaga el error y `/api/tabla-liga` responde con la tabla
  CALCULADA por la app (la de antes), marcada como tal. Nada se rompe.
- El token va en la variable **`FOOTBALL_DATA_TOKEN`** de `.env.local`
  y, al publicar, hay que agregarla también en **Vercel**
  (Environment Variables), igual que `THESPORTSDB_API_KEY`; sin ella,
  producción simplemente cae al respaldo calculado.

## Uso (solo servidor: route handlers, server components, scripts)

```ts
import { getSportsProvider, LIGA_MX_PROVIDER_ID } from '@/lib/sports';

const sports = getSportsProvider();
const jornada17 = await sports.getFixtures(LIGA_MX_PROVIDER_ID, {
  season: '2026-2027',
  round: 17,
});
const tabla = await sports.getStandings(LIGA_MX_PROVIDER_ID, '2026-2027');
const logos = await sports.getTeamLogos(LIGA_MX_PROVIDER_ID); // { América: 'https://…' }
```

## Configuración

En `.env.local` (y en Vercel cuando se apruebe publicar):

```
THESPORTSDB_API_KEY=<llave gratis de thesportsdb.com>
FOOTBALL_DATA_TOKEN=<token gratis de football-data.org> # solo tabla de Champions
```

- La llave se registra gratis con el correo de Gonzalo en thesportsdb.com.
- Sin la variable, el módulo truena con un error claro; NO hay llave
  quemada en el código.
- `THESPORTSDB_BASE_URL` (opcional) sobreescribe la base de la API v1.

## Notas de TheSportsDB (cuenta premium)

- El módulo cachea con `next.revalidate` (fixtures de temporada 1 h,
  tabla 10 min, equipos 24 h, livescore v2 60 s).
- Liga MX = idLeague **4350**; Copa Libertadores = **4501** (temporada
  "2026", año calendario). El resto de IDs vive en `leagues.ts`.
- `strTimestamp` viene en UTC sin la "Z": el adaptador lo normaliza.
- Los marcadores en vivo DEL ÁRBITRO del Club se siguen metiendo como
  siempre; la ruta `src/app/api/sincronizar-partidos` (API-Football)
  queda como estaba. El livescore de este módulo es para la sección
  Partidos y la tabla en vivo, no para el Árbitro.

## Migración futura a API-Football

Implementar `SportsProvider` en un `apiFootball.ts` nuevo y cambiar una
línea en `getSportsProvider()` (provider.ts). Los consumidores no se tocan.
