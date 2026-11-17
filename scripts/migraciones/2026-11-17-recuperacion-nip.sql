-- =====================================================================
-- Club de Pronósticos — Recuperación automática de NIP con palabra
-- secreta (2026-11-17)
--
-- CÓMO CORRERLA: Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente (IF NOT EXISTS): se puede correr dos veces sin daño.
--
-- Agrega a `usuarios`:
--   palabra_secreta_hash         — hash SHA-256 de la palabra secreta
--                                  del jugador (ver src/lib/
--                                  recuperacion.ts). NUNCA la palabra
--                                  en claro y nunca se muestra.
--   recuperacion_intentos        — fallos seguidos al intentar
--                                  recuperar (límite de intentos).
--   recuperacion_bloqueado_hasta — fin del bloqueo temporal tras
--                                  5 fallos seguidos (15 minutos).
--
-- Sin esta migración la app funciona EXACTAMENTE igual que antes:
-- las filas no traen estos campos, ningún jugador "tiene palabra
-- secreta" y el "olvidé mi NIP" sigue mandando al WhatsApp de
-- Gonzalo. Correrla solo enciende la recuperación automática.
--
-- RLS: el proyecto hoy NO tiene Row-Level Security en ninguna tabla
-- (decisión pendiente de Gonzalo; la app entera trabaja con la llave
-- anónima desde el navegador). Estas columnas siguen ese mismo
-- patrón: no se activa RLS aquí.
-- =====================================================================

alter table public.usuarios
  add column if not exists palabra_secreta_hash text,
  add column if not exists recuperacion_intentos integer not null default 0,
  add column if not exists recuperacion_bloqueado_hasta timestamptz;

comment on column public.usuarios.palabra_secreta_hash is
  'Hash SHA-256 de la palabra secreta para recuperar el NIP (ligado al id del usuario). NULL si el jugador aún no la crea. Ver src/lib/recuperacion.ts.';

comment on column public.usuarios.recuperacion_intentos is
  'Fallos seguidos en la recuperación de NIP; al llegar a 5 se bloquea la recuperación por 15 minutos (recuperacion_bloqueado_hasta).';

comment on column public.usuarios.recuperacion_bloqueado_hasta is
  'Fin del bloqueo temporal de la recuperación de NIP; NULL si no hay bloqueo.';
