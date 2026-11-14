# lib/sports — adaptador de proveedor deportivo

Base de la integración con APIs de deportes acordada con Gonzalo
(2026-11-10/13). Es la pieza única por la que la app pide partidos, tabla
y logos a proveedores externos.

## Ya conectado

- **Sección "⚽ Partidos"** (rediseño 2026-11-13, tipo 365Scores): la vieja
  pestaña "Tabla Liga MX" se reemplazó por UNA sola sección en el menú
  (`src/components/SeccionPartidos.tsx`) con vistas Favoritos, Resultados,
  Posiciones y Siguiendo. Nada de un botón por liga.
  - **Ligas soportadas**: catálogo `SUPPORTED_LEAGUES` en `leagues.ts`
    (Liga MX, Nations, Champions, Premier, La Liga, Serie A, Bundesliga,
    Ligue 1, Grecia y Copa Libertadores 4501). Cada liga trae su
    temporada, su esquema de zonas y si el proveedor da tabla de ella.
  - **Resultados/Favoritos**: ruta `src/app/api/partidos?dias=N` —
    calendario de temporada recortado a la ventana de Mazatlán (ayer a
    hoy+N días), agrupado por liga, con escudos y mezcla de marcadores
    en vivo. Favoritos (ligas/equipos con estrella) vive en localStorage
    (`src/lib/favoritos.ts`), sin tocar Supabase; por defecto se siguen
    Liga MX, Nations y Champions.
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
- **Sin tabla**: Champions, Nations League y Libertadores devuelven el
  cuerpo vacío en `lookuptable` (grupos/copa): `hasStandings=false` y la
  vista de Posiciones muestra un mensaje claro, sin romperse.
- Llave premium de TheSportsDB activa (cuenta gonzalo3210): tabla de
  Liga MX verificada COMPLETA (18/18) y temporada con 153 eventos.

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
