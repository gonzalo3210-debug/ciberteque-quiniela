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
//     alimentan el tablero "🏁 Camino a la final" (caminoFinal.ts),
//   - y resuelve LA SIEMBRA REAL del bombo contra la tabla de su
//     liga (/api/tabla-liga, resolverSiembra en bomboSorteo.ts): la
//     posición de cada equipo sale de la tabla, nunca del orden
//     guardado — ese orden puede ser el de selección manual del
//     admin (desmarcó un equipo, lo volvió a marcar y el arreglo lo
//     mandó al final). Así cualquier sala ya creada se ve bien sin
//     re-guardar la quiniela; si ninguna liga elegible resuelve a
//     todo el bombo, la siembra queda marcada como 'guardada' y el
//     tablero lo avisa.
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
import {
  resolverSiembra,
  type SiembraResuelta,
} from '@/lib/bomboSorteo';
import { nombreEquipoES } from '@/lib/sports/nombresES';
import { LIGAS_SORTEO } from '@/lib/sports/ligasSorteo';
import type { StandingRow } from '@/lib/sports/types';

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
  const [siembra, setSiembra] = useState<SiembraResuelta | null>(null);
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
      setSiembra(null);
      setPartidos([]);
      return;
    }
    const miToken = ++tokenCarga.current;
    const vigente = () => tokenCarga.current === miToken;
    setCargando(true);
    try {
      const { data: q } = await supabase
        .from('quinielas')
        .select('equipos_sorteo, fecha_cierre')
        .eq('id', quinielaId)
        .single();
      const idsBombo: string[] = q?.equipos_sorteo || [];
      const fechaCierre: string | null = q?.fecha_cierre || null;

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
      const bombo = idsBombo
        .map((id) => equipoPorId.get(id))
        .filter(Boolean) as EquipoBombo[];
      setEquiposBombo(bombo);

      // LA SIEMBRA REAL: se deriva de la tabla de la liga (la
      // primera liga elegible cuya tabla resuelva a TODO el bombo
      // manda: Liga MX, Femenil o Expansión), nunca del orden
      // guardado. Si ninguna resuelve, queda el orden guardado,
      // marcado como respaldo para que el tablero lo avise.
      if (bombo.length > 0) {
        const nombresBombo = bombo.map((e) => e.nombre);
        let siembraResuelta = resolverSiembra(
          nombresBombo,
          null,
          nombreEquipoES
        );
        for (const liga of LIGAS_SORTEO) {
          try {
            const res = await fetch(
              `/api/tabla-liga?liga=${liga.providerId}`
            );
            if (!res.ok) continue;
            const data = await res.json();
            // La siembra manda con la tabla OFICIAL: la fase
            // regular ya cerró y la tabla en vivo se distorsiona
            // con los partidos de la liguilla en curso; esa solo
            // es el respaldo si la oficial no resuelve.
            const candidatas = [data.rows, data.liveRows].filter(
              Boolean
            ) as StandingRow[][];
            let intento: SiembraResuelta | null = null;
            for (const filas of candidatas) {
              const t = resolverSiembra(
                nombresBombo,
                filas,
                nombreEquipoES
              );
              if (t.fuente === 'tabla') {
                intento = t;
                break;
              }
              intento ??= t;
            }
            if (intento && intento.fuente === 'tabla') {
              siembraResuelta = intento;
              break;
            }
          } catch {
            // Sin tabla de esta liga: se prueba la siguiente.
          }
        }
        if (!vigente()) return;
        setSiembra(siembraResuelta);
      } else {
        setSiembra(null);
      }

      // Partidos del cuadro eliminatorio (para el Camino a la final):
      // los propios de la quiniela de sorteo MÁS los de la liguilla
      // entre equipos del bombo, vivan en la quiniela que vivan
      // (los cuartos, las semis y la final se juegan dentro de las
      // jornadas semanales, no en la de sorteo: sin este cruce el
      // tablero no veía ningún partido y todos salían «esperando
      // rival»). La ventana corre desde 7 días antes del cierre del
      // sorteo para no jalar los cruces de fase regular entre los
      // mismos equipos.
      const { data: filasPartidos } = await supabase
        .from('partidos')
        .select(
          'id, equipo_local, equipo_visitante, goles_local, goles_visitante, resultado_real, es_final, fecha_hora_partido'
        )
        .eq('quiniela_id', quinielaId)
        .order('fecha_hora_partido', { ascending: true });
      if (!vigente()) return;
      let partidosCuadro: any[] = filasPartidos || [];
      if (bombo.length > 0 && fechaCierre) {
        const desde = new Date(
          new Date(fechaCierre).getTime() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();
        const nombresBomboLista = bombo.map((e) => e.nombre);
        const { data: filasLiguilla } = await supabase
          .from('partidos')
          .select(
            'id, equipo_local, equipo_visitante, goles_local, goles_visitante, resultado_real, es_final, fecha_hora_partido'
          )
          .in('equipo_local', nombresBomboLista)
          .in('equipo_visitante', nombresBomboLista)
          .gte('fecha_hora_partido', desde)
          .order('fecha_hora_partido', { ascending: true });
        if (!vigente()) return;
        const idsYa = new Set(partidosCuadro.map((p: any) => p.id));
        partidosCuadro = [
          ...partidosCuadro,
          ...(filasLiguilla || []).filter((p: any) => !idsYa.has(p.id)),
        ];
      }
      setPartidos(
        partidosCuadro.map((p: any) => ({
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
        .select('id, nombre, avatar_url')
        .in('id', idsUsuarios);
      if (!vigente()) return;

      const nombrePorId = new Map<string, string>(
        (usuarios || []).map((u: any) => [u.id, u.nombre])
      );
      const avatarPorId = new Map<string, string | null>(
        (usuarios || []).map((u: any) => [u.id, u.avatar_url || null])
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
            avatarUrl: avatarPorId.get(t.usuario_id) ?? null,
          };
        })
      );
      setRealizado(true);
    } catch {
      if (vigente()) {
        setRealizado(false);
        setAsignaciones([]);
        setSiembra(null);
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
    siembra,
    partidos,
    recargar: cargar,
  };
}
