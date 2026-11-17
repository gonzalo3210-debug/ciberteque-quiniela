// src/hooks/useCeremoniaSorteo.ts
//
// Datos de la CEREMONIA PÚBLICA del sorteo para la vista del jugador.
// Solo trabaja cuando la quiniela visible es de modalidad sorteo:
//   - lee los 8 equipos del bombo (quinielas.equipos_sorteo),
//   - lee los pases de la sala con su equipo asignado,
//   - detecta si el sorteo ya se ejecutó (sorteoRealizado: todos los
//     pases con equipo) y arma las asignaciones con nombre de jugador
//     y equipo, listas para el plan de revelado.
// Antes del sorteo no devuelve nada: la cartelera muestra el panel de
// compra de siempre. La ceremonia es presentación; aquí no se sortea
// nada ni se escribe en la base.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  sorteoRealizado,
  type AsignacionSorteo,
} from '@/lib/sorteoCeremonia';

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

  const quinielaId =
    quiniela?.modalidad === 'sorteo' ? (quiniela?.id as string) : null;

  useEffect(() => {
    if (!quinielaId) {
      setRealizado(false);
      setAsignaciones([]);
      setEquiposBombo([]);
      return;
    }
    let vivo = true;
    (async () => {
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
        if (!vivo) return;

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
        if (!vivo) return;

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
        if (!vivo) return;

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
        if (vivo) {
          setRealizado(false);
          setAsignaciones([]);
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quinielaId]);

  return { cargando, realizado, asignaciones, equiposBombo };
}
