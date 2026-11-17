-- =====================================================================
-- Club de Pronósticos — Atribución de invitaciones (2026-11-17)
--
-- CÓMO CORRERLA: Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente (IF NOT EXISTS): se puede correr dos veces sin daño.
--
-- Agrega:
--   usuarios.referido_por — el CÓDIGO de invitación (8 caracteres,
--   ver src/lib/invitaciones.ts) del jugador que invitó a este
--   usuario. NULL para quien llegó solo o se registró antes de que
--   existieran los enlaces de invitación.
--
-- Sin esta migración la app funciona EXACTAMENTE igual: la landing
-- guarda el código en el localStorage del visitante y el registro
-- intenta guardarlo; si la columna no existe, el insert se reintenta
-- sin ese campo (la atribución se pierde, el registro no se rompe).
-- Correrla solo enciende la atribución.
--
-- El código NO es el id del referente: es su código público de
-- invitación. Para saber qué usuario es dueño de un código se
-- recalcula el código de cada usuario (función pura
-- codigoInvitacionDeUsuario en src/lib/invitaciones.ts).
--
-- RLS: el proyecto hoy NO tiene Row-Level Security en ninguna tabla
-- (decisión pendiente de Gonzalo; la app entera trabaja con la llave
-- anónima desde el navegador). Esta columna sigue ese mismo patrón:
-- no se activa RLS aquí.
-- =====================================================================

alter table public.usuarios
  add column if not exists referido_por text;

comment on column public.usuarios.referido_por is
  'Código de invitación (8 caracteres) del jugador que invitó a este usuario; NULL si llegó solo. Ver src/lib/invitaciones.ts.';

-- Para contar invitados por código sin escaneos completos.
create index if not exists idx_usuarios_referido_por
  on public.usuarios (referido_por)
  where referido_por is not null;
