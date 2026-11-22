// src/hooks/useCreadorJornadas.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { construirPayloadJornada } from '@/lib/crearJornadaPayload';
import {
  mapearEquiposARegistro,
  resolverSiembra,
  sugerirBombo,
  type FuenteBombo,
} from '@/lib/bomboSorteo';
import {
  LIGA_SORTEO_DEFECTO,
  getLigaSorteo,
  type LigaSorteo,
} from '@/lib/sports/ligasSorteo';
import { nombreEquipoES } from '@/lib/sports/nombresES';
import type { SportsFixture, StandingRow } from '@/lib/sports/types';
import toast from 'react-hot-toast';

/** De dónde salió el bombo actual al jalarlo (para avisar en la vista). */
export interface OrigenBombo {
  tipo: FuenteBombo;
  /** Nombre de la liga de la que se jaló (p. ej. "Liga MX"). */
  liga: string;
  /** Equipos de la fuente que no están en el registro del Club. */
  noRegistrados: string[];
}

export interface PartidoInput {
  local: string;
  visitante: string;
  fecha_hora: string;
  /**
   * ID del partido en el proveedor externo (TheSportsDB) cuando el
   * partido se importó desde la API; null/undefined si se tecleó a mano.
   * Se guarda en partidos.api_fixture_id para que el programa de
   * marcadores enlace el partido de la base con el del API.
   */
  api_fixture_id?: string | null;
}

export type TipoPremiacion = 'unico' | 'top2' | 'top3' | 'promo_unico' | 'promo_top2';
export type Modalidad = 'clasica' | 'marcador_exacto' | 'sorteo';

export function useCreadorJornadas() {
  // Estados del formulario
  const [nombreJornada, setNombreJornada] = useState('');
  const [precioTicket, setPrecioTicket] = useState('1');
  const [fechaCierre, setFechaCierre] = useState('');
  const [tipoPremiacion, setTipoPremiacion] = useState<TipoPremiacion>('unico');
  const [partidosNuevos, setPartidosNuevos] = useState<PartidoInput[]>([{ local: '', visitante: '', fecha_hora: '' }]);
  
  // Estados de configuración
  const [modalidad, setModalidad] = useState<Modalidad>('clasica');
  const [soloAdmins, setSoloAdmins] = useState(false);

  // Estado para guardar los IDs de los 8 equipos del Sorteo Mundial
  const [equiposSorteo, setEquiposSorteo] = useState<string[]>([]);

  // Origen del bombo cuando se llenó con «Jalar top 8» (null si se
  // eligió a mano o se clonó): la vista lo muestra junto al bombo.
  const [fuenteBombo, setFuenteBombo] = useState<OrigenBombo | null>(null);
  const [jalandoBombo, setJalandoBombo] = useState(false);

  // Liga elegida en el selector del bombo (solo ligas con liguilla,
  // ver ligasSorteo.ts): de ella se jalan la tabla y los partidos.
  const [ligaBombo, setLigaBombo] = useState<LigaSorteo>(LIGA_SORTEO_DEFECTO);

  // Estados de control
  const [creando, setCreando] = useState(false);
  const [cargadoBorrador, setCargadoBorrador] = useState(false);

  // 1. Cargar borrador al montar
  useEffect(() => {
    const borrador = localStorage.getItem('ciberteque_borrador_jornada');
    if (borrador) {
      try {
        const datos = JSON.parse(borrador);
        if (datos.nombreJornada) setNombreJornada(datos.nombreJornada);
        if (datos.precioTicket) setPrecioTicket(datos.precioTicket);
        if (datos.fechaCierre) setFechaCierre(datos.fechaCierre);
        if (datos.tipoPremiacion) setTipoPremiacion(datos.tipoPremiacion);
        if (datos.partidosNuevos && datos.partidosNuevos.length > 0) setPartidosNuevos(datos.partidosNuevos);
        
        if (datos.modalidad) setModalidad(datos.modalidad);
        if (datos.soloAdmins !== undefined) setSoloAdmins(datos.soloAdmins);
        if (datos.equiposSorteo) setEquiposSorteo(datos.equiposSorteo);
      } catch (error) {
        console.error("Error leyendo borrador:", error);
      }
    }
    setCargadoBorrador(true);
  }, []);

  // 2. Guardar borrador automáticamente al cambiar los datos
  useEffect(() => {
    if (!cargadoBorrador) return;
    const datosBorrador = { nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos, modalidad, soloAdmins, equiposSorteo };
    localStorage.setItem('ciberteque_borrador_jornada', JSON.stringify(datosBorrador));
  }, [nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos, modalidad, soloAdmins, equiposSorteo, cargadoBorrador]);

  // Funciones manipuladoras de partidos
  const agregarPartidoInput = () => {
    const ultimaFecha = partidosNuevos.length > 0 ? partidosNuevos[partidosNuevos.length - 1].fecha_hora : '';
    setPartidosNuevos([...partidosNuevos, { local: '', visitante: '', fecha_hora: ultimaFecha }]);
  };
  
  const actualizarPartidoInput = (index: number, campo: keyof PartidoInput, valor: string) => {
    const nuevos = [...partidosNuevos];
    nuevos[index] = { ...nuevos[index], [campo]: valor };
    // OJO: editar nombre u hora de un partido importado NO suelta su
    // api_fixture_id: el enlace es con el partido, no con el texto, y
    // así el marcador en vivo sigue llegando aunque se ajuste el nombre
    // a como lo conoce el catálogo del Club. Si un renglón importado se
    // convierte en OTRO partido, lo correcto es borrarlo y agregarlo a
    // mano (queda sin enlace, como los de siempre).
    setPartidosNuevos(nuevos);
  };

  /**
   * Agrega partidos importados desde la API a la jornada en construcción.
   * - Quita primero los renglones completamente vacíos (el renglón
   *   inicial en blanco no debe sobrevivir a una importación).
   * - Omite los que ya estén en la lista con el mismo api_fixture_id
   *   (importar dos veces la misma liga/ronda no duplica).
   * Devuelve cuántos se agregaron y cuántos se omitieron por duplicados.
   */
  const agregarPartidosImportados = (importados: PartidoInput[]) => {
    const base = partidosNuevos.filter(p => p.local.trim() !== '' || p.visitante.trim() !== '' || p.fecha_hora !== '' || p.api_fixture_id);
    const idsYa = new Set(base.map(p => p.api_fixture_id).filter(Boolean));
    const nuevos = [...base];
    let agregados = 0;
    let omitidos = 0;
    for (const p of importados) {
      if (p.api_fixture_id && idsYa.has(p.api_fixture_id)) {
        omitidos++;
        continue;
      }
      if (p.api_fixture_id) idsYa.add(p.api_fixture_id);
      nuevos.push(p);
      agregados++;
    }
    setPartidosNuevos(nuevos.length > 0 ? nuevos : [{ local: '', visitante: '', fecha_hora: '' }]);
    return { agregados, omitidos };
  };

  const moverPartido = (index: number, direccion: number) => {
    const nuevos = [...partidosNuevos];
    const temp = nuevos[index];
    nuevos[index] = nuevos[index + direccion];
    nuevos[index + direccion] = temp;
    setPartidosNuevos(nuevos);
  };

  const eliminarPartido = (index: number) => {
    setPartidosNuevos(partidosNuevos.filter((_, i) => i !== index));
  };

  // Función para seleccionar/quitar equipos del Sorteo
  const toggleEquipoSorteo = (equipoId: string) => {
    // Al primer toque manual el bombo ya no es "el jalado": el aviso
    // de origen deja de describirlo.
    setFuenteBombo(null);
    setEquiposSorteo(prev => {
      if (prev.includes(equipoId)) return prev.filter(id => id !== equipoId);
      if (prev.length >= 8) {
        toast.error('Ya seleccionaste el máximo de 8 equipos.');
        return prev;
      }
      return [...prev, equipoId];
    });
  };

  // Función para Clonar Sorteo Anterior
  const clonarUltimoSorteo = async () => {
    const idToast = toast.loading('Buscando última sala de sorteo...');
    try {
      const { data, error } = await supabase
        .from('quinielas')
        .select('precio_ticket, tipo_premiacion, equipos_sorteo')
        .eq('modalidad', 'sorteo')
        .order('fecha_cierre', { ascending: false })
        .limit(1)
        .single();
        
      if (error || !data) throw new Error('No se encontró ningún sorteo previo para clonar.');
      if (!data.equipos_sorteo || data.equipos_sorteo.length !== 8) throw new Error('El sorteo anterior no tiene los 8 equipos completos.');

      setPrecioTicket(data.precio_ticket.toString());
      setTipoPremiacion(data.tipo_premiacion as TipoPremiacion);
      setEquiposSorteo(data.equipos_sorteo);
      setFuenteBombo(null);

      toast.success('¡Configuración y equipos clonados exitosamente!', { id: idToast });
    } catch (error: any) {
      toast.error(error.message, { id: idToast });
    }
  };

  /**
   * ⬇️ JALAR LOS EQUIPOS DEL BOMBO (decisión de Gonzalo, 2026-11-22):
   * llena el bombo sin escoger escudo por escudo, desde la liga
   * elegida en el selector (solo ligas con liguilla: ligasSorteo.ts).
   * La tabla sale de /api/tabla-liga?liga= —la MISMA de Posiciones:
   * si la ruta trae la tabla recalculada (liveRows, con el en vivo y
   * la retención de 24 h de finales), manda esa— y los partidos de
   * /api/partidos?liga= (la temporada completa de esa liga). La
   * lógica pura (src/lib/bomboSorteo.ts) prefiere las llaves de
   * cuartos si la API ya las lista y, si no, el top 8 de la tabla; el
   * cruce al registro es por nombre con nombresES. Lo que no esté
   * registrado NO se inventa: quedan marcados los hallados y la vista
   * reporta los faltantes para elegirlos a mano. El bombo jalado se
   * puede seguir corrigiendo en la rejilla de siempre.
   */
  const jalarEquiposBombo = async (
    equiposRegistro: { id: string; nombre: string }[],
    ligaId?: string
  ) => {
    const liga = (ligaId && getLigaSorteo(ligaId)) || ligaBombo;
    const idToast = toast.loading(`Jalando los equipos de ${liga.name}...`);
    setJalandoBombo(true);
    try {
      const [resTabla, resPartidos] = await Promise.all([
        fetch(`/api/tabla-liga?liga=${liga.providerId}`),
        fetch(`/api/partidos?liga=${liga.providerId}`),
      ]);
      const dataTabla = await resTabla.json();
      if (!resTabla.ok) {
        throw new Error(dataTabla?.error || `No se pudo cargar la tabla de ${liga.name}.`);
      }
      const filas: StandingRow[] = dataTabla.liveRows ?? dataTabla.rows ?? [];
      if (filas.length === 0) {
        throw new Error(`La tabla de ${liga.name} vino vacía. Intenta de nuevo en unos minutos.`);
      }
      // Si los partidos fallan, se sigue solo con la tabla.
      let fixtures: SportsFixture[] = [];
      if (resPartidos.ok) {
        const dataPartidos = await resPartidos.json();
        fixtures = dataPartidos.fixtures ?? [];
      }

      const sugerido = sugerirBombo(fixtures, filas, nombreEquipoES, liga.rondasRegulares);
      const mapeo = mapearEquiposARegistro(sugerido.equipos, equiposRegistro, nombreEquipoES);
      if (mapeo.ids.length === 0) {
        throw new Error('Ninguno de los equipos de la fuente está en el registro del Club. Regístralos primero en Equipos.');
      }

      setEquiposSorteo(mapeo.ids);
      setFuenteBombo({ tipo: sugerido.fuente, liga: liga.name, noRegistrados: mapeo.noRegistrados });

      const desde =
        sugerido.fuente === 'cuartos'
          ? `desde los partidos de cuartos de final de ${liga.name}`
          : `con el top 8 de la tabla general de ${liga.name}`;
      if (mapeo.noRegistrados.length > 0) {
        toast.success(
          `Bombo llenado ${desde} (${mapeo.ids.length}/8). No registrados: ${mapeo.noRegistrados.join(', ')} — elígelos a mano cuando estén en el registro.`,
          { id: idToast, duration: 8000 }
        );
      } else {
        toast.success(`¡Bombo llenado ${desde}!`, { id: idToast });
      }
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron jalar los equipos.', { id: idToast });
    } finally {
      setJalandoBombo(false);
    }
  };

  const resetearFormulario = () => {
    setNombreJornada('');
    setFechaCierre('');
    setPrecioTicket('1');
    setTipoPremiacion('unico');
    setPartidosNuevos([{ local: '', visitante: '', fecha_hora: '' }]);
    setModalidad('clasica');
    setSoloAdmins(false);
    setEquiposSorteo([]);
    setFuenteBombo(null);
    localStorage.removeItem('ciberteque_borrador_jornada');
  };

  // Función principal de envío a BD
  const crearJornadaCompleta = async () => {
    if (!nombreJornada || !fechaCierre) {
      return { success: false, message: "Ponle nombre a la jornada y fecha de cierre." };
    }

    if (modalidad === 'sorteo' && equiposSorteo.length !== 8) {
      return { success: false, message: `Selecciona exactamente 8 equipos. Actualmente tienes ${equiposSorteo.length}.` };
    }
    
    setCreando(true);
    try {
      // LA SIEMBRA SE GUARDA POR TABLA, no por orden de selección
      // (segunda capa del arreglo del 2026-11-22; la primera es el
      // tablero, que deriva la siembra al mostrar): si el admin
      // llenó el bombo a mano y desmarcó/re-marcó un equipo, el
      // arreglo de selección lo manda al final. Aquí se reordena
      // por la posición en la tabla de la liga elegida cuando la
      // tabla está disponible y resuelve a los 8; si algo falla, se
      // guarda el orden de selección y el tablero corrige al vuelo.
      let equiposSorteoFinal = equiposSorteo;
      if (modalidad === 'sorteo' && equiposSorteo.length === 8) {
        try {
          const { data: filasEq } = await supabase
            .from('equipos')
            .select('id, nombre')
            .in('id', equiposSorteo);
          const nombrePorId = new Map<string, string>(
            (filasEq ?? []).map((e: any) => [e.id, e.nombre])
          );
          const nombres: string[] = [];
          let completos = true;
          for (const id of equiposSorteo) {
            const n = nombrePorId.get(id);
            if (!n) {
              completos = false;
              break;
            }
            nombres.push(n);
          }
          if (completos) {
            const resTabla = await fetch(
              `/api/tabla-liga?liga=${ligaBombo.providerId}`
            );
            if (resTabla.ok) {
              const dataTabla = await resTabla.json();
              const filas = (dataTabla.liveRows ??
                dataTabla.rows ??
                []) as StandingRow[];
              const siembra = resolverSiembra(
                nombres,
                filas,
                nombreEquipoES
              );
              if (siembra.fuente === 'tabla') {
                const idPorNombre = new Map<string, string>();
                equiposSorteo.forEach((id, i) => {
                  if (!idPorNombre.has(nombres[i])) {
                    idPorNombre.set(nombres[i], id);
                  }
                });
                const ordenados = siembra.orden.map((n) =>
                  idPorNombre.get(n)
                );
                if (
                  ordenados.every((id) => typeof id === 'string') &&
                  new Set(ordenados).size === 8
                ) {
                  equiposSorteoFinal = ordenados as string[];
                }
              }
            }
          }
        } catch {
          // Mejor esfuerzo: se guarda el orden de selección.
        }
      }

      // El payload se arma con el constructor puro compartido
      // (src/lib/crearJornadaPayload.ts): la conversión de la hora
      // local a UTC, el orden de partidos y las reglas por modalidad
      // viven ahí, idénticas para el formulario clásico y el
      // asistente gráfico.
      const payload = construirPayloadJornada({
        nombreJornada, precioTicket, fechaCierre, tipoPremiacion,
        modalidad, soloAdmins, equiposSorteo: equiposSorteoFinal, partidosNuevos
      });

      // 1. Insertar Quiniela
      const { data: q, error: qErr } = await supabase.from('quinielas').insert([payload.quiniela]).select().single();
      
      if (qErr) throw qErr;
      
      // 2. Insertar Partidos (en sorteo el payload no trae partidos)
      if (modalidad !== 'sorteo') {
        const partidosData = payload.partidos.map(p => ({ quiniela_id: q.id, ...p }));
        
        const { error: pErr } = await supabase.from('partidos').insert(partidosData);
        if (pErr) throw pErr;
      }

      // 📢 4. NUEVO: Notificación Masiva a Jugadores
      if (!soloAdmins) {
        // Obtenemos al usuario que crea la jornada (Tú)
        const { data: { user } } = await supabase.auth.getUser();
        
        // Obtenemos todos los usuarios registrados
        const { data: usuariosRegistrados, error: errUsuarios } = await supabase
          .from('usuarios')
          .select('id');

        if (!errUsuarios && usuariosRegistrados && usuariosRegistrados.length > 0) {
          
          // 👇 AQUÍ ESTÁ EL CAMBIO A "boleto"
          const mensajeExtra = modalidad === 'sorteo' 
            ? 'La sala de Supervivencia está abierta. ¡Consigue tu boleto!'
            : '¡Ya puedes ingresar tu boleto!';

          const notificacionesMasivas = usuariosRegistrados
            .filter(u => u.id !== user?.id) // No te notificas a ti mismo
            .map(u => ({
              usuario_emisor_id: user?.id || null,
              usuario_receptor_id: u.id,
              tipo: 'jornada', // Este tipo renderiza "Club Pronósticos" y el ⚽
              contenido: `ha publicado la ${nombreJornada}. ${mensajeExtra}`
            }));

          if (notificacionesMasivas.length > 0) {
            await supabase.from('notificaciones').insert(notificacionesMasivas);
          }
        }
      }

      resetearFormulario();
      return { success: true, message: "¡Jornada publicada en CiberTeque con éxito!" };

    } catch (e: any) {
      console.error(e);
      return { success: false, message: e.message || "Error al crear la jornada en la base de datos." };
    } finally {
      setCreando(false);
    }
  };

  return {
    formulario: { nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos, modalidad, soloAdmins, equiposSorteo },
    setters: { setNombreJornada, setPrecioTicket, setFechaCierre, setTipoPremiacion, setModalidad, setSoloAdmins, setLigaBombo },
    acciones: { agregarPartidoInput, actualizarPartidoInput, moverPartido, eliminarPartido, agregarPartidosImportados, crearJornadaCompleta, toggleEquipoSorteo, clonarUltimoSorteo, jalarEquiposBombo },
    estado: { creando, fuenteBombo, jalandoBombo, ligaBombo }
  };
}