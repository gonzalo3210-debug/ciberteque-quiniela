# lib/sports — adaptador de proveedor deportivo

Base de la integración con APIs de deportes acordada con Gonzalo
(2026-11-10/13). Es la pieza única por la que la app pide partidos, tabla
y logos a proveedores externos.

## Ya conectado (2026-11-13)

- **Tabla de la Liga MX**: ruta de servidor `src/app/api/tabla-liga`
  (usa `getStandings(LIGA_MX_PROVIDER_ID, LIGA_MX_SEASON)`) → componente
  `src/components/TablaLiga.tsx` en la pestaña "⚽ Tabla Liga MX" de la
  página principal. OJO: es la tabla DE LA LIGA; el ranking del Club entre
  jugadores (Supabase, pestaña Ranking) es otra cosa y no se toca.
- **Tabla EN VIVO**: `computeLiveStandings(base, liveResults)` en
  `liveStandings.ts` — función pura que recalcula la tabla aplicando los
  marcadores en curso. Decisión de Gonzalo (2026-11-13): la tabla debe
  recalcularse AL CAER GOL. El refresco/polling que la invoque al detectar
  un cambio de marcador aún NO está construido; la función ya quedó lista
  y probada con datos reales.
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

## Notas del nivel gratis de TheSportsDB

- ~30 consultas/minuto; el módulo cachea con `next.revalidate`
  (fixtures 5 min, tabla 10 min, equipos 24 h).
- Liga MX = idLeague **4350**.
- Primer chequeo pendiente con la llave real: pedir la tabla de Liga MX y
  contar si regresa los **18 equipos completos**; en el nivel gratis
  `lookuptable` por temporada está limitado a ligas destacadas. Si llega
  recortada, la tabla se calcula con los resultados que la propia app ya
  guarda (plan ya acordado).
- Los marcadores EN VIVO no dependen de este módulo: se siguen metiendo a
  mano en el Árbitro; la ruta `src/app/api/sincronizar-partidos` (API-Football)
  queda como estaba.

## Migración futura a API-Football

Implementar `SportsProvider` en un `apiFootball.ts` nuevo y cambiar una
línea en `getSportsProvider()` (provider.ts). Los consumidores no se tocan.
