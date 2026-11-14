// src/lib/noticiasClub.ts
//
// Noticias DEL CLUB para la sección 📰 Noticias (2026-11-14): eventos
// generados SOLO de los datos que la app ya tiene en Supabase, sin
// esquema nuevo. Función pura: recibe las quinielas anidadas (la
// misma forma que devuelve obtenerDatosAnidadosPosiciones: quiniela
// con partidos, tickets y pronósticos) y el catálogo de usuarios, y
// devuelve el feed de novedades del club:
//
//   🆕 jornada nueva/abierta (con su cierre),
//   ⏰ aviso si la jornada abierta cierra en menos de 48 h,
//   ⚽ cada partido que termina, con su marcador,
//   🏆 quién va ganando la jornada en curso (líder y puntos, con la
//      MISMA cuenta de puntos que usa el Ranking: marcador exacto =
//      3, tendencia = 1, desempate por goles totales),
//   🎉 el ganador cuando la jornada ya se liquidó.
//
// Los instantes de ordenación salen de los propios datos: la jornada
// abierta se fecha en su cierre (no hay created_at en la tabla), los
// finales en la hora del partido y el líder en la hora del último
// final ya jugado.
import { fechaCortaEnMazatlan, horaEnMazatlan } from '@/lib/fechaMazatlan';

export type SubtipoNoticiaClub =
  | 'nueva'
  | 'cierre'
  | 'final'
  | 'lider'
  | 'ganador';

export interface NoticiaClub {
  id: string;
  subtipo: SubtipoNoticiaClub;
  icono: string;
  titulo: string;
  detalle?: string;
  /** Instante ISO para ordenar el feed y mostrar fecha/hora. */
  fechaISO: string;
}

const PORCENTAJE_PREMIO = 0.8; // igual que en el Ranking (usePosiciones)

type MapaUsuarios = Record<string, { nombre: string } | undefined>;

function getLEV(marcador: string | null | undefined): string | null {
  if (!marcador) return null;
  const limpio = marcador.replace(/\s+/g, '').toUpperCase();
  if (['L', 'E', 'V'].includes(limpio)) return limpio;
  if (limpio.includes('-')) {
    const [l, v] = limpio.split('-').map(Number);
    if (!isNaN(l) && !isNaN(v)) {
      if (l > v) return 'L';
      if (l < v) return 'V';
      return 'E';
    }
  }
  return null;
}

function partidoTerminado(p: any): boolean {
  return (
    p?.es_final === true ||
    (p?.goles_local !== null &&
      p?.goles_local !== undefined &&
      p?.goles_visitante !== null &&
      p?.goles_visitante !== undefined) ||
    (p?.resultado_real !== null && p?.resultado_real !== undefined)
  );
}

interface RenglonRanking {
  nombre: string;
  puntos: number;
  golesDiff: number;
}

/** Ranking de una quiniela con la misma cuenta que la pestaña Ranking. */
export function rankingDeQuiniela(
  quiniela: any,
  mapaUsuarios: MapaUsuarios
): RenglonRanking[] {
  const partidos = quiniela.partidos || [];
  const golesReales =
    quiniela.goles_totales_real !== null &&
    quiniela.goles_totales_real !== undefined
      ? quiniela.goles_totales_real
      : -1;

  const renglones: RenglonRanking[] = (quiniela.tickets || []).map(
    (ticket: any) => {
      let puntos = 0;
      if (quiniela.modalidad === 'sorteo') {
        puntos = ticket.puntos_totales || 0;
      } else {
        for (const pron of ticket.pronosticos || []) {
          const partido = partidos.find((p: any) => p.id === pron.partido_id);
          if (!partido || !partidoTerminado(partido)) continue;
          const pickStr = (pron.eleccion_usuario || '').replace(/\s+/g, '');
          let realStr = '';
          if (
            partido.goles_local !== null &&
            partido.goles_local !== undefined &&
            partido.goles_visitante !== null &&
            partido.goles_visitante !== undefined
          ) {
            realStr = `${partido.goles_local}-${partido.goles_visitante}`;
          } else {
            realStr = (partido.resultado_real || '').replace(/\s+/g, '');
          }
          if (!realStr) continue;
          if (pickStr === realStr) {
            puntos += quiniela.modalidad === 'marcador_exacto' ? 3 : 1;
          } else {
            const pickLEV = getLEV(pickStr);
            const realLEV = getLEV(realStr) || getLEV(partido.resultado_real);
            if (pickLEV && realLEV && pickLEV === realLEV) puntos += 1;
          }
        }
      }
      return {
        nombre: mapaUsuarios[ticket.usuario_id]?.nombre || 'Un jugador',
        puntos,
        golesDiff:
          golesReales !== -1
            ? Math.abs((ticket.prediccion_goles_total || 0) - golesReales)
            : 999,
      };
    }
  );

  renglones.sort((a, b) =>
    b.puntos !== a.puntos ? b.puntos - a.puntos : a.golesDiff - b.golesDiff
  );
  return renglones;
}

function fechaLegible(iso: string): string {
  try {
    return `${fechaCortaEnMazatlan(iso)} · ${horaEnMazatlan(iso)}`;
  } catch {
    return '';
  }
}

/** Genera el feed de noticias del club desde las quinielas anidadas. */
export function generarNoticiasClub(
  quinielas: any[],
  mapaUsuarios: MapaUsuarios,
  ahora: Date = new Date()
): NoticiaClub[] {
  const eventos: NoticiaClub[] = [];

  // De la más reciente a la más vieja. Los FINALES solo se publican de
  // las DOS jornadas más recientes (la en curso y la última jugada):
  // de las demás jornadas liquidadas basta su noticia de ganador, para
  // que el feed no se llene de marcadores viejos.
  const ordenadas = [...(quinielas || [])].sort((a: any, b: any) =>
    (b.fecha_cierre || '').localeCompare(a.fecha_cierre || '')
  );

  ordenadas.forEach((q, indiceQuiniela) => {
    const partidos = [...(q.partidos || [])].sort((a: any, b: any) =>
      (a.fecha_hora_partido || '').localeCompare(b.fecha_hora_partido || '')
    );
    const finales = partidos.filter(
      (p: any) =>
        partidoTerminado(p) &&
        p.goles_local !== null &&
        p.goles_local !== undefined
    );
    const nombre = q.nombre_jornada || 'Jornada';

    // 🆕 Jornada abierta (y ⏰ si cierra en menos de 48 h)
    if (q.estado === 'abierta') {
      eventos.push({
        id: `${q.id}-nueva`,
        subtipo: 'nueva',
        icono: '🆕',
        titulo: `Jornada ${nombre} abierta`,
        detalle: `Boleto $${q.precio_ticket ?? 30} · Cierra el ${fechaLegible(q.fecha_cierre)}`,
        fechaISO: q.fecha_cierre,
      });
      const msCierre = new Date(q.fecha_cierre).getTime() - ahora.getTime();
      if (msCierre > 0 && msCierre < 48 * 3_600_000) {
        const horas = Math.max(1, Math.round(msCierre / 3_600_000));
        eventos.push({
          id: `${q.id}-cierre`,
          subtipo: 'cierre',
          icono: '⏰',
          titulo: `${nombre} cierra pronto`,
          detalle: `Quedan ${horas} h para meter tu boleto · Cierra el ${fechaLegible(q.fecha_cierre)}`,
          fechaISO: q.fecha_cierre,
        });
      }
    }

    // ⚽ Finales con marcador (solo las 2 jornadas más recientes)
    for (const p of indiceQuiniela < 2 ? finales : []) {
      eventos.push({
        id: `${q.id}-final-${p.id}`,
        subtipo: 'final',
        icono: '⚽',
        titulo: `Final: ${p.equipo_local} ${p.goles_local} - ${p.goles_visitante} ${p.equipo_visitante}`,
        detalle: nombre,
        fechaISO: p.fecha_hora_partido || q.fecha_cierre,
      });
    }

    const enCurso =
      (q.estado === 'abierta' && finales.length > 0) ||
      (q.estado === 'cerrada' &&
        (q.goles_totales_real === null || q.goles_totales_real === undefined));
    const liquidada =
      q.estado === 'cerrada' &&
      q.goles_totales_real !== null &&
      q.goles_totales_real !== undefined;

    // 🏆 Líder de la jornada en curso
    if (enCurso && q.modalidad !== 'sorteo' && finales.length > 0) {
      const ranking = rankingDeQuiniela(q, mapaUsuarios);
      const lider = ranking[0];
      if (lider && lider.puntos > 0) {
        const ultimoFinal = finales[finales.length - 1];
        eventos.push({
          id: `${q.id}-lider`,
          subtipo: 'lider',
          icono: '🏆',
          titulo: `${lider.nombre.trim()} va ganando ${nombre}`,
          detalle: `Lleva ${lider.puntos} puntos con ${finales.length} de ${partidos.length} partidos jugados`,
          fechaISO: ultimoFinal.fecha_hora_partido || q.fecha_cierre,
        });
      }
    }

    // 🎉 Ganador de la jornada liquidada
    if (liquidada) {
      const ranking = rankingDeQuiniela(q, mapaUsuarios);
      const ganador = ranking[0];
      if (ganador) {
        const ultimoPartido = partidos[partidos.length - 1];
        const fechaGanador =
          ultimoPartido?.fecha_hora_partido &&
          ultimoPartido.fecha_hora_partido > q.fecha_cierre
            ? ultimoPartido.fecha_hora_partido
            : q.fecha_cierre;
        const premio = Math.round(
          (q.tickets || []).length * (q.precio_ticket ?? 30) * PORCENTAJE_PREMIO
        );
        eventos.push({
          id: `${q.id}-ganador`,
          subtipo: 'ganador',
          icono: '🎉',
          titulo: `${ganador.nombre.trim()} ganó ${nombre}`,
          detalle: `Con ${ganador.puntos} puntos · Premio $${premio.toLocaleString('es-MX')}`,
          fechaISO: fechaGanador,
        });
      }
    }
  });

  eventos.sort((a, b) => b.fechaISO.localeCompare(a.fechaISO));
  return eventos.slice(0, 30);
}
