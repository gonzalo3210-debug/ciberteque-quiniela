// src/hooks/useCeremoniaSorteo.ts
//
// Datos de la CEREMONIA PÚBLICA del sorteo para la vista del jugador.
// Solo trabaja cuando la quiniela visible es de modalidad sorteo:
//   - lee los 8 equipos del bombo (quinielas.equipos_sorteo),
//   - lee los pases de la sala con su equipo asignado,
//   - detecta si el sorteo ya se ejecutó (sorteoRealizado: todos los
//     pases con equipo) y arma las asignaciones con nombre de jugador
//     y equipo, listas para el plan de revelado,
//   - y lee los partidos del cuadro eliminatorio de la quiniela, que
//     alimentan el tablero "🏁 Camino a la final" (caminoFinal.ts).
// Antes del sorteo no devuelve asignaciones: la cartelera muestra el
// panel de compra de siempre. La ceremonia es presentación; aquí no
// se sortea nada ni se escribe en la base.
//
// `recargar` vuelve a leer todo: la Cartelera lo conecta al refresco
// en tiempo real de la tabla partidos (useSincronizacionRealtime, el
// mecanismo de siempre de la app), para que el camino se mueva
// cuando el árbitro o el programa de marcadores guardan resultados.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  sorteoRealizado,
  type AsignacionSorteo,
} from '@/lib/sorteoCeremonia';
import type { PartidoCamino } from '@/lib/caminoFinal';

export interface EquipoBombo {
  id: string;
  nombre: string;
  logoUrl: string | null;
}

export function useCeremoniaSorteo(quiniela: any) {
  const [cargando, setCargando] = useState(false);
  const [realizado, setRealizado] = useState(false);
  const [asignaciones, setAsignaciones] = useState<AsignacionSorteo[]>([]);
  const [equiposBombo, setEquiposBombo] = useState<EquipoBombo[]>([]);
  const [partidos, setPartidos] = useState<PartidoCamino[]>([]);
  // Solo la carga más reciente puede pintar: si la quiniela cambia o
  // llega un refresco mientras otra lectura va en vuelo, la vieja se
  // descarta al resolver.
  const tokenCarga = useRef(0);

  const quinielaId =
    quiniela?.modalidad === 'sorteo' ? (quiniela?.id as string) : null;

  const cargar = useCallback(async () => {
    if (!quinielaId) {
      setRealizado(false);
      setAsignaciones([]);
      setEquiposBombo([]);
      setPartidos([]);
      return;
    }
    const miToken = ++tokenCarga.current;
    const vigente = () => tokenCarga.current === miToken;
    setCargando(true);
    try {
      const { data: q } = await supabase
        .from('quinielas')
        .select('equipos_sorteo')
        .eq('id', quinielaId)
        .single();
      const idsBombo: string[] = q?.equipos_sorteo || [];

      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, usuario_id, equipo_asignado_id, fecha_creacion')
        .eq('quiniela_id', quinielaId)
        .order('fecha_creacion', { ascending: true });
      if (!vigente()) return;

      const filas = tickets || [];
      const idsEquipos = Array.from(
        new Set([
          ...idsBombo,
          ...filas
            .map((t: any) => t.equipo_asignado_id)
            .filter(Boolean),
        ])
      ) as string[];

      const { data: equipos } =
        idsEquipos.length > 0
          ? await supabase
              .from('equipos')
              .select('id, nombre, logo_url')
              .in('id', idsEquipos)
          : { data: [] as any[] };
      if (!vigente()) return;

      const equipoPorId = new Map<string, EquipoBombo>(
        (equipos || []).map((e: any) => [
          e.id,
          { id: e.id, nombre: e.nombre, logoUrl: e.logo_url || null },
        ])
      );
      // El bombo se muestra en el orden guardado en la quiniela.
      setEquiposBombo(
        idsBombo
          .map((id) => equipoPorId.get(id))
          .filter(Boolean) as EquipoBombo[]
      );

      // Partidos del cuadro eliminatorio (para el Camino a la final).
      const { data: filasPartidos } = await supabase
        .from('partidos')
        .select(
          'id, equipo_local, equipo_visitante, goles_local, goles_visitante, resultado_real, es_final, fecha_hora_partido'
        )
        .eq('quiniela_id', quinielaId)
        .order('fecha_hora_partido', { ascending: true });
      if (!vigente()) return;
      setPartidos(
        (filasPartidos || []).map((p: any) => ({
          id: p.id,
          equipoLocal: p.equipo_local,
          equipoVisitante: p.equipo_visitante,
          golesLocal: p.goles_local,
          golesVisitante: p.goles_visitante,
          resultadoReal: p.resultado_real,
          esFinal: p.es_final,
          fecha: p.fecha_hora_partido,
        }))
      );

      if (!sorteoRealizado(filas)) {
        setRealizado(false);
        setAsignaciones([]);
        return;
      }

      const idsUsuarios = Array.from(
        new Set(filas.map((t: any) => t.usuario_id))
      ) as string[];
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', idsUsuarios);
      if (!vigente()) return;

      const nombrePorId = new Map<string, string>(
        (usuarios || []).map((u: any) => [u.id, u.nombre])
      );
      setAsignaciones(
        filas.map((t: any) => {
          const eq = equipoPorId.get(t.equipo_asignado_id);
          return {
            ticketId: t.id,
            usuarioId: t.usuario_id,
            nombreJugador: nombrePorId.get(t.usuario_id) || 'Jugador',
            equipoId: t.equipo_asignado_id,
            nombreEquipo: eq?.nombre || 'Equipo',
            logoUrl: eq?.logoUrl || null,
          };
        })
      );
      setRealizado(true);
    } catch {
      if (vigente()) {
        setRealizado(false);
        setAsignaciones([]);
      }
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [quinielaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    cargando,
    realizado,
    asignaciones,
    equiposBombo,
    partidos,
    recargar: cargar,
  };
}
