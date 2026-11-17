# Programa de marcadores directos

Mantiene los marcadores de las quinielas **al momento**, sin que nadie
tenga que guardar avances a mano desde el panel.

Cada pocos segundos el programa:

1. Busca en Supabase los partidos de las quinielas **abiertas** que ya
   van a empezar (en ≤15 min) o que empezaron hace ≤5 horas y aún no
   están marcados como final.
2. Pide **una sola vez** el feed en vivo premium de TheSportsDB (trae
   todos los partidos en vivo de todas las ligas).
3. Escribe en la base **solo lo que cambió**: goles y resultado (L/E/V)
   durante el juego, y el marcador final cuando la API confirma que el
   partido terminó.

## Reglas de oro (lo que el programa NUNCA hace)

- **Nunca adelanta un final.** Un partido se marca `es_final` solo si el
  feed dice terminado (FT/AET/PEN). Ni aunque el marcador ya no se mueva.
- **Nunca cierra ni liquida una quiniela**, y nunca toca
  `goles_totales_real`. Liquidar sigue siendo a mano, como siempre.
- **Nunca escribe en un partido sin enlace confirmado** con la API
  (ver "El enlace" abajo), ni inventa marcadores: si el feed no trae
  goles, no escribe.
- **No escribe si nada cambió.** Que avance el minuto del partido no
  genera escrituras.
- Durante el juego se confía **solo en la API premium** (regla acordada
  el 2026-11-14); el final lo marca el estado de término del propio feed.
- Si se cae la red o la API, lo anota en el registro y reintenta al
  siguiente ciclo: **el programa no se tumba**.

## Requisitos

- **Node.js 22 o más nuevo** (recomendado el LTS vigente) en la laptop.
- Estar en la **carpeta del repo** con las dependencias instaladas
  (`npm install` ya hecho, el de siempre para correr la app): el
  programa usa `@supabase/supabase-js`, que ya es dependencia del repo.
- El archivo **`.env.local`** del repo con las llaves (el mismo de la
  app). No hay que instalar nada más.

## Variables que necesita

Las lee del `.env.local` del repo o del entorno (el entorno manda):

| Variable | ¿Para qué? |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`) | Dirección del proyecto Supabase. Ya está en tu `.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **La llave correcta a futuro.** Salta cualquier restricción de la base. Hoy el programa cae a la anónima si esta no existe (ver abajo). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `SUPABASE_ANON_KEY`) | Llave anónima, la que ya trae tu `.env.local`. |
| `THESPORTSDB_API_KEY` | La llave premium de TheSportsDB, la misma de la app. Ya está en tu `.env.local`. |
| `PUSH_DISPATCH_SECRET` | Secreto para despachar notificaciones push. Sin él, el programa no manda avisos (y trabaja igual). Se genera con `node scripts/generar-vapid.mjs` y debe ser EL MISMO en el `.env.local` y en Vercel. |
| `PUSH_DISPATCH_URL` | (Opcional) Dirección del despachador; por defecto la de producción (`https://ciberteque-quiniela.vercel.app/api/push/despachar`). |

> **Sobre la llave de Supabase:** mientras la base tenga RLS apagado, la
> llave anónima puede escribir y el programa funciona con ella (al
> arrancar avisa que la está usando). La correcta a futuro es la
> **service_role**: cuando se atienda la alerta de seguridad de Supabase
> y se encienda RLS con políticas, la anónima dejará de poder escribir
> y este programa deberá correr con `SUPABASE_SERVICE_ROLE_KEY` en el
> `.env.local`. Esa llave es **secreta**: vive solo en la laptop, jamás
> se sube al repo ni se pone en la app web.

## Cómo correrlo

Desde la raíz del repo:

```powershell
# 1) PRIMERO en seco: anota lo que haría, sin escribir nada en la base
node scripts/marcador-directo/marcador-directo.mjs --once --dry-run

# 2) Ya en serio, una pasada
node scripts/marcador-directo/marcador-directo.mjs --once

# 3) Continuo durante la jornada (cada 20 s; Ctrl+C para detener)
node scripts/marcador-directo/marcador-directo.mjs

# Continuo pero más seguido (se acepta de 10 a 30 s)
node scripts/marcador-directo/marcador-directo.mjs --interval=15
```

Déjalo corriendo en una ventana de PowerShell mientras se juegan los
partidos de la jornada. Cuando no hay partidos en ventana, el programa
lo anota una vez cada 5 minutos y sigue revisando sin gastar llamadas
a la API.

### El registro (log)

Cada línea lleva la hora de Mazatlán. Lo importante se ve así:

```
[17/11/2026, 12:03:11] Marcador: Portugal 1-0 Dinamarca · antes –-– · final=no
[17/11/2026, 13:58:40] Marcador: Portugal 1-4 Dinamarca · antes 1-0 · final=sí
[17/11/2026, 12:00:03] Enlazado: Puebla vs San Luis → api_fixture_id=2487597
```

## Notificaciones push

Con la misma pasada que escribe los marcadores, el programa detecta
**eventos de aviso** y los despacha a la app (`/api/push/despachar`),
que es quien los manda a los celulares de los jugadores suscritos:

- ⚽ **Gol** en un partido de quiniela abierta (a quienes siguen a ese
  equipo ⭐ y a quienes tienen boleto en la quiniela).
- 🚫 **Gol anulado**: si el VAR echa atrás un gol ya avisado, sale una
  corrección; si el aviso original nunca salió, no sale nada.
- 🏁 **Fin de partido** (solo a quienes prendieron ese aviso).
- 👑 **Cambios de liderato**: tras cada marcador se recalcula el
  ranking provisional igual que en la app; a quien entra al 1° le
  llega "¡Vas en primer lugar!" y a quien sale, "Te rebasaron".
- ⏰ **Recordatorio de cierre**: si una quiniela abierta cierra en
  menos de 2 horas, avisa una sola vez a cada jugador sin boleto
  (se revisa una vez por minuto, haya o no partidos en ventana).

Reglas de la detección (lógica pura en `logica.mjs`, con pruebas en
`pruebas-notificaciones.mjs`):

- **Línea base silenciosa**: lo primero que el programa ve de un
  partido o de un liderato se anota sin avisar; nada de spamear goles
  viejos al arrancar a mitad de jornada.
- **Sin duplicados**: cada evento tiene una clave (p. ej.
  `gol:<partido>:2-0:boleto`); las despachadas se guardan en
  `estado-notificaciones.json` junto al programa y la ruta además
  dedupea en la base (`notificaciones_enviadas`). Ni un reinicio
  repite un aviso.
- **Los marcadores mandan**: si el despacho falla, el estado de
  notificaciones no avanza y los eventos se regeneran al siguiente
  ciclo; el programa nunca se cae por los avisos.
- Con `--dry-run` el registro muestra `NOTIFICARÍA: …` por cada evento
  que saldría, sin mandar nada ni guardar estado.

Para activar los avisos hace falta (una sola vez): correr la migración
`scripts/migraciones/2026-11-17-notificaciones-push.sql` en Supabase y
tener las variables VAPID + `PUSH_DISPATCH_SECRET` en Vercel y en el
`.env.local` (ver `scripts/generar-vapid.mjs`).

## El enlace (api_fixture_id)

Para escribir, cada partido necesita su `api_fixture_id`: el id del
mismo partido en TheSportsDB.

- Las jornadas **importadas desde la API** (la pieza anterior del panel)
  ya nacen enlazadas.
- Las jornadas **creadas a mano** (como la J17) no lo traen. El programa
  intenta enlazarlas solo: busca en las temporadas de las ligas del
  catálogo el partido con **los mismos dos equipos** (con los nombres en
  español de la app, p. ej. "Dinamarca" ↔ "Denmark") y **fecha a ±1
  día**. Solo enlaza si hay **exactamente un** candidato: si hay dos
  (ida y vuelta en la misma semana, por ejemplo) o ninguno, **no
  adivina**: lo anota en el registro y salta ese partido. Ese partido
  se seguiría actualizando a mano hasta enlazarlo o recrearlo importado.

## Prueba viva (pendiente, en la laptop)

Desde el entorno de Chela **no se puede** correr contra la base real
(el egreso a Supabase está bloqueado ahí), así que la prueba de punta a
punta se hace en tu laptop:

1. Con una jornada abierta y un partido por jugarse, corre
   `--once --dry-run` antes del partido: debe anunciar que no hay nada
   que escribir (o el enlace, si la jornada se creó a mano).
2. Ya con el partido en juego, corre en continuo con `--dry-run` unos
   minutos: debe anunciar `ESCRIBIRÍA:` con el marcador en vivo.
3. Quita el `--dry-run` y deja que escriba: revisa en la app que el
   marcador de la quiniela se mueve solo y que el FINAL cae solo cuando
   el partido termina de verdad.

La lógica de decisión (estados del feed, L/E/V, cuándo escribir, el
enlace por nombres con su caso confiado y su caso ambiguo) sí quedó
probada con fixtures de ejemplo: 55 comprobaciones, todas en verde.

## Archivos

- `marcador-directo.mjs` — el programa (config, Supabase, API, ciclo).
- `logica.mjs` — la lógica pura y probada: clasificación de estados con
  el criterio de la app, derivación L/E/V, decisión de escritura y
  emparejamiento por nombres (el criterio de `src/lib/emparejar.ts` y
  `src/lib/sports/nombresES.ts`, cuyo código el programa importa
  directamente; si tu Node no puede importarlo, cae a leer su tabla de
  nombres y lo anota en el registro de arranque).
