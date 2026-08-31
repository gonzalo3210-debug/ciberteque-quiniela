// src/hooks/useCreadorJornadas.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export interface PartidoInput {
  local: string;
  visitante: string;
  fecha_hora: string;
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
    setPartidosNuevos(nuevos);
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
      // ⚡ INGENIERÍA: Conversión estricta de la hora local a UTC antes de tocar la BD
      const fechaCierreUTC = new Date(fechaCierre).toISOString();

      // 1. Insertar Quiniela
      const { data: q, error: qErr } = await supabase.from('quinielas').insert([{ 
        nombre_jornada: nombreJornada, 
        precio_ticket: parseInt(precioTicket), 
        fecha_cierre: fechaCierreUTC, 
        tipo_premiacion: tipoPremiacion, 
        estado: 'abierta',
        modalidad: modalidad, 
        solo_admins: soloAdmins,
        equipos_sorteo: modalidad === 'sorteo' ? equiposSorteo : [] 
      }]).select().single();
      
      if (qErr) throw qErr;
      
      // 2. Ordenar y preparar partidos
      if (modalidad !== 'sorteo') {
        const partidosOrdenados = [...partidosNuevos].sort((a, b) => {
          if (a.fecha_hora && b.fecha_hora) return new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime();
          if (a.fecha_hora && !b.fecha_hora) return -1;
          if (!a.fecha_hora && b.fecha_hora) return 1;
          return 0;
        });

        const partidosData = partidosOrdenados.map(p => ({ 
          quiniela_id: q.id, 
          equipo_local: p.local, 
          equipo_visitante: p.visitante, 
          fecha_hora_partido: p.fecha_hora ? new Date(p.fecha_hora).toISOString() : null 
        }));
        
        // 3. Insertar Partidos
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
    acciones: { agregarPartidoInput, actualizarPartidoInput, moverPartido, eliminarPartido, crearJornadaCompleta, toggleEquipoSorteo, clonarUltimoSorteo },
    estado: { creando }
  };
}