-- =====================================================================
-- Club de Pronósticos — Notificaciones push (paquete v12, 2026-11-17)
--
-- CÓMO CORRERLA: Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente (IF NOT EXISTS): se puede correr dos veces sin daño.
--
-- Crea:
--   1) suscripciones_push      — un renglón por navegador suscrito.
--   2) notificaciones_enviadas — dedupe de despachos (qué evento ya se
--      le mandó a qué usuario), para que un gol no llegue dos veces
--      aunque el programa de marcadores reinicie.
--
-- RLS: el proyecto hoy NO tiene Row-Level Security en ninguna tabla
-- (decisión pendiente de Gonzalo; la app entera trabaja con la llave
-- anónima desde el navegador). Estas tablas siguen ese mismo patrón:
-- NO se activa RLS aquí. Cuando se haga el proyecto de RLS, estas dos
-- tablas entran en el mismo paquete de políticas.
-- =====================================================================

create table if not exists public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- PreferenciasPush (ver src/lib/pushPreferencias.ts):
  -- { gol_equipos, gol_boleto, liderato, cierre, premio, fin_partido }
  preferencias jsonb not null default
    '{"gol_equipos":true,"gol_boleto":true,"liderato":true,"cierre":true,"premio":true,"fin_partido":false}'::jsonb,
  -- Espejo de los equipos que el jugador sigue en Siguiendo ⭐
  -- (viven en el localStorage de su navegador; se sincronizan a esta
  -- columna al suscribirse y al abrir Mi Perfil con el push activo).
  -- Forma: [{ "teamProviderId": "…", "teamName": "…" }]
  equipos_seguidos jsonb not null default '[]'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suscripciones_push_usuario
  on public.suscripciones_push (usuario_id);

create table if not exists public.notificaciones_enviadas (
  id bigint generated always as identity primary key,
  clave_evento text not null,
  usuario_id uuid not null,
  tipo text not null,
  created_at timestamptz not null default now()
);

-- El dedupe vive en este índice único: insertar la misma
-- (clave_evento, usuario_id) dos veces es un conflicto y la ruta
-- despachadora lo interpreta como "ya se le mandó, no repetir".
create unique index if not exists idx_notificaciones_enviadas_clave_usuario
  on public.notificaciones_enviadas (clave_evento, usuario_id);
