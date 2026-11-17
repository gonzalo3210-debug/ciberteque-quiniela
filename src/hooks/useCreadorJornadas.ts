// src/hooks/useCreadorJornadas.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { construirPayloadJornada } from '@/lib/crearJornadaPayload';
import toast from 'react-hot-toast';

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
      
      toast.success('¡Configuración y equipos clonados exitosamente!', { id: idToast });
    } catch (error: any) {
      toast.error(error.message, { id: idToast });
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
      // El payload se arma con el constructor puro compartido
      // (src/lib/crearJornadaPayload.ts): la conversión de la hora
      // local a UTC, el orden de partidos y las reglas por modalidad
      // viven ahí, idénticas para el formulario clásico y el
      // asistente gráfico.
      const payload = construirPayloadJornada({
        nombreJornada, precioTicket, fechaCierre, tipoPremiacion,
        modalidad, soloAdmins, equiposSorteo, partidosNuevos
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
    setters: { setNombreJornada, setPrecioTicket, setFechaCierre, setTipoPremiacion, setModalidad, setSoloAdmins },
    acciones: { agregarPartidoInput, actualizarPartidoInput, moverPartido, eliminarPartido, agregarPartidosImportados, crearJornadaCompleta, toggleEquipoSorteo, clonarUltimoSorteo },
    estado: { creando }
  };
}