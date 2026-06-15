// src/hooks/useCreadorJornadas.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface PartidoInput {
  local: string;
  visitante: string;
  fecha_hora: string;
}

export type TipoPremiacion = 'unico' | 'top2' | 'top3' | 'promo_unico' | 'promo_top2';

export function useCreadorJornadas() {
  // Estados del formulario
  const [nombreJornada, setNombreJornada] = useState('');
  const [precioTicket, setPrecioTicket] = useState('1');
  const [fechaCierre, setFechaCierre] = useState('');
  const [tipoPremiacion, setTipoPremiacion] = useState<TipoPremiacion>('unico');
  const [partidosNuevos, setPartidosNuevos] = useState<PartidoInput[]>([{ local: '', visitante: '', fecha_hora: '' }]);
  
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
      } catch (error) {
        console.error("Error leyendo borrador:", error);
      }
    }
    setCargadoBorrador(true);
  }, []);

  // 2. Guardar borrador automáticamente al cambiar los datos
  useEffect(() => {
    if (!cargadoBorrador) return;
    const datosBorrador = { nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos };
    localStorage.setItem('ciberteque_borrador_jornada', JSON.stringify(datosBorrador));
  }, [nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos, cargadoBorrador]);

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

  const resetearFormulario = () => {
    setNombreJornada('');
    setFechaCierre('');
    setPrecioTicket('1');
    setTipoPremiacion('unico');
    setPartidosNuevos([{ local: '', visitante: '', fecha_hora: '' }]);
    localStorage.removeItem('ciberteque_borrador_jornada');
  };

  // Función principal de envío a BD
  const crearJornadaCompleta = async () => {
    if (!nombreJornada || !fechaCierre) {
      return { success: false, message: "Ponle nombre a la jornada y fecha de cierre." };
    }
    
    setCreando(true);
    try {
      // 1. Insertar Quiniela
      const { data: q, error: qErr } = await supabase.from('quinielas').insert([{ 
        nombre_jornada: nombreJornada, 
        precio_ticket: parseInt(precioTicket), 
        fecha_cierre: fechaCierre, 
        tipo_premiacion: tipoPremiacion, 
        estado: 'abierta' 
      }]).select().single();
      
      if (qErr) throw qErr;
      
      // 2. Ordenar y preparar partidos
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
        fecha_hora: p.fecha_hora || null 
      }));
      
      // 3. Insertar Partidos
      const { error: pErr } = await supabase.from('partidos').insert(partidosData);
      if (pErr) throw pErr;

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
    formulario: { nombreJornada, precioTicket, fechaCierre, tipoPremiacion, partidosNuevos },
    setters: { setNombreJornada, setPrecioTicket, setFechaCierre, setTipoPremiacion },
    acciones: { agregarPartidoInput, actualizarPartidoInput, moverPartido, eliminarPartido, crearJornadaCompleta },
    estado: { creando }
  };
}