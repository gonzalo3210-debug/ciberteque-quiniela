-- =====================================================================
-- Club de Pronósticos — ID de TheSportsDB por equipo (2026-11-23)
--
-- CÓMO CORRERLA: Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente (IF NOT EXISTS): se puede correr dos veces sin daño.
-- ⚠️ NO ESTÁ APLICADA: la preparó Chela en la rama
-- `chela/escudos-thesportsdb` y espera la aprobación de Gonzalo.
--
-- POR QUÉ: los escudos del catálogo EQUIPOS se asocian al partido por
-- el NOMBRE EXACTO del equipo. El 2026-11-23, en la quiniela CUARTOS
-- IDA + CHAMPIONS, PSV, PSG, Roma y Bayern Múnich se veían como un
-- círculo con "?" aunque su URL de ESPN cargaba bien: el catálogo los
-- tenía como "PSV Eindhoven", "Paris Saint-Germain", "AS Roma" y
-- "Bayern Munich" y la quiniela usa los nombres cortos. Se corrigió a
-- mano renombrando, pero la solución estructural es guardar el ID que
-- TheSportsDB da a cada equipo (idTeam) y jalar el escudo desde la
-- API con ese ID (ruta /api/escudo-equipo -> lookupteam.php), sin
-- depender de cómo se escriba el nombre.
--
-- QUÉ HACE: agrega la columna `id_api` (TEXT, nullable) a la tabla
-- `equipos`. NULL = el equipo sigue con su logo manual (logo_url),
-- como hoy. El código nuevo tolera que la columna aún no exista
-- (la vista Jugar reintenta su consulta sin ella y el guardado del
-- admin reintenta sin el campo), así que el orden seguro es:
--   1) correr esta migración, 2) publicar el código, 3) capturar los
--   IDs en el panel de equipos (campo nuevo "ID TheSportsDB").
--
-- IDs verificados contra la API real el 2026-11-23 (lookupteam.php);
-- se dejan como UPDATEs COMENTADOS de referencia: NO se corren solos
-- porque el nombre exacto de cada registro en producción pudo cambiar
-- con la corrección manual de ese día. Gonzalo/admin los captura
-- desde el panel, o descomenta ajustando el nombre si prefiere SQL.
--   PSV Eindhoven        -> 133768
--   Paris Saint-Germain  -> 133714  (strTeamShort: PSG)
--   Roma (AS Roma)       -> 133682  (la API lo nombra solo "Roma")
--   Bayern Munich        -> 133664
--
-- RLS: el proyecto hoy NO tiene Row-Level Security en ninguna tabla
-- (decisión pendiente de Gonzalo); esta migración no cambia eso.
-- =====================================================================

alter table public.equipos
  add column if not exists id_api text;

comment on column public.equipos.id_api is
  'ID del equipo en TheSportsDB (idTeam). Con valor, el escudo se jala de la API (lookupteam) y tiene prioridad sobre logo_url.';

create index if not exists idx_equipos_id_api
  on public.equipos (id_api)
  where id_api is not null;

-- Referencia (NO ejecutar sin verificar el nombre exacto del registro):
-- update public.equipos set id_api = '133768' where nombre = 'PSV';
-- update public.equipos set id_api = '133714' where nombre = 'PSG';
-- update public.equipos set id_api = '133682' where nombre = 'Roma';
-- update public.equipos set id_api = '133664' where nombre = 'Bayern Múnich';
