# lib/sports — adaptador de proveedor deportivo

Base de la integración con APIs de deportes acordada con Gonzalo
(2026-11-10/13). Nada de esto está conectado todavía a pantallas: es la
pieza única por la que la app pedirá partidos, tabla y logos.

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
