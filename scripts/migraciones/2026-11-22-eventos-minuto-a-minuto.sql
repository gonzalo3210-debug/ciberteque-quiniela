-- =====================================================================
-- Club de Pronósticos — Eventos del Club para el ⚡ Minuto a minuto
-- (2026-11-22)
--
-- CÓMO CORRERLA: Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente (IF NOT EXISTS): se puede correr dos veces sin daño.
--
-- POR QUÉ: TheSportsDB NO devuelve línea de tiempo de la Liga MX
-- (lookuptimeline.php = null, verificado 2026-11-20), así que el
-- Minuto a minuto de Noticias sale vacío justo en la liga del Club.
-- La ruta aprobada por Gonzalo: construir los eventos con los GOLES
-- que el programa de marcadores (scripts/marcador-directo, en la
-- Dell) ya detecta en cada pasada al comparar marcadores — hoy esos
-- eventos solo se usan para despachar push y se pierden.
--
-- ESTA TABLA es la fuente que la app lee (ruta /api/eventos-club).
-- Falta la otra mitad, FUERA de esta migración: que el programa de
-- marcadores INSERTe aquí cada evento que ya detecta
-- (detectarEventosNotificacion en logica.mjs): gol (con el equipo
-- que anotó y el marcador tras el gol), gol_anulado y fin_partido,
-- usando la misma `clave` de dedupe que ya usa para los push
-- (gol:{partido_id}:{marcador}, anulado:{partido_id}:{marcador},
-- fin:{partido_id}) y, si el feed lo trae en esa pasada, el minuto
-- (strProgress) en `minuto`. Sin goleador: esa fuente no lo conoce.
--
-- RLS: el proyecto hoy NO tiene Row-Level Security en ninguna tabla
-- (decisión pendiente de Gonzalo; la app trabaja con la llave
-- anónima). Esta tabla sigue ese mismo patrón: NO se activa RLS.
-- =====================================================================

create table if not exists public.eventos_minuto (
  id uuid primary key default gen_random_uuid(),
  -- Partido del Club (tabla partidos) y su quiniela.
  partido_id uuid not null,
  quiniela_id uuid,
  -- 'gol' | 'gol_anulado' | 'fin_partido' (lo que el programa detecta)
  tipo text not null,
  -- Equipo que anotó (nombre del Club), solo en tipo 'gol'.
  equipo_anoto text,
  -- Marcador DESPUÉS del evento.
  goles_local integer,
  goles_visitante integer,
  -- Minuto del feed al detectarse (strProgress numérico); puede faltar.
  minuto integer,
  -- Dedupe: la misma clave que el programa usa para los push.
  clave text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_eventos_minuto_partido
  on public.eventos_minuto (partido_id, created_at);
