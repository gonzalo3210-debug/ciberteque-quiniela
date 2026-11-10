import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { extraerNacionalMX, soloDigitos, esMismoNumeroMX } from '@/lib/telefono';
import toast from 'react-hot-toast';

export function useCajero(actualizarSaldoGlobal?: (id: string, nuevo: number) => void) {
  const LIMIT_USUARIOS = 5;
  const LIMIT_HISTORIAL = 10;

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [hayMasUsuarios, setHayMasUsuarios] = useState(false);
  const [offsetUsuarios, setOffsetUsuarios] = useState(0);
  
  const [historialActivo, setHistorialActivo] = useState<string | null>(null);
  const [datosHistorial, setDatosHistorial] = useState<any[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [hayMasHistorial, setHayMasHistorial] = useState(false);
  const [offsetHistorial, setOffsetHistorial] = useState(0);

  // Número de la búsqueda vigente: cada búsqueda nueva lo sube y cualquier
  // respuesta que llegue con un número viejo se descarta (no pisa la nueva).
  const seqBusquedaRef = useRef(0);

  useEffect(() => {
    if (busqueda.trim().length === 0) {
      seqBusquedaRef.current++; // invalida respuestas que aún vengan en vuelo
      setUsuarios([]);
      setHayMasUsuarios(false);
      setCargando(false);
      return;
    }

    // La búsqueda nueva arranca desde la primera tecla: el resultado
    // anterior desaparece de inmediato y se muestra el estado de búsqueda.
    seqBusquedaRef.current++;
    setUsuarios([]);
    setHayMasUsuarios(false);
    setCargando(true);

    const timer = setTimeout(() => {
      buscarUsuariosDB(busqueda, 0, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const buscarUsuariosDB = async (termino: string, offset = 0, esNuevaBusqueda = false) => {
    const miSeq = esNuevaBusqueda ? ++seqBusquedaRef.current : seqBusquedaRef.current;

    if (esNuevaBusqueda) {
      setCargando(true);
      setOffsetUsuarios(0);
      setUsuarios([]); // fuera el resultado anterior mientras se busca
      setHayMasUsuarios(false);
    }

    try {
      const terminoLimpio = termino.trim();
      // El teléfono se busca por sus 10 dígitos nacionales: así encuentra la
      // cuenta escriban el número como lo escriban (10 dígitos, con 52/521,
      // con espacios), sin importar el formato limpio en que quedó guardado.
      const nacional = extraerNacionalMX(terminoLimpio);
      const digitos = soloDigitos(terminoLimpio);
      const patronTelefono = nacional ?? (digitos.length >= 3 ? digitos : terminoLimpio);

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, telefono, creditos_disponibles, saldo_pesos, deuda_pesos')
        .or(`nombre.ilike.%${terminoLimpio}%,telefono.ilike.%${patronTelefono}%`)
        .order('nombre', { ascending: true })
        .range(offset, offset + LIMIT_USUARIOS - 1);

      if (error) throw error;
      if (miSeq !== seqBusquedaRef.current) return; // respuesta vieja: se descarta

      let filas = data || [];
      const paginaLlena = filas.length === LIMIT_USUARIOS;

      // Los registros viejos guardados con espacios o paréntesis no salen con
      // ilike; se rescatan comparando el número ya normalizado, igual que en
      // el Login (solo cuando se tecleó un número completo).
      if (esNuevaBusqueda && nacional) {
        const { data: indice } = await supabase.from('usuarios').select('id, telefono');
        if (miSeq !== seqBusquedaRef.current) return;

        const idsExtra = (indice || [])
          .filter((u: any) => esMismoNumeroMX(u.telefono || '', nacional) && !filas.some((f: any) => f.id === u.id))
          .map((u: any) => u.id);

        if (idsExtra.length > 0) {
          const { data: extra } = await supabase
            .from('usuarios')
            .select('id, nombre, telefono, creditos_disponibles, saldo_pesos, deuda_pesos')
            .in('id', idsExtra)
            .order('nombre', { ascending: true });

          if (miSeq !== seqBusquedaRef.current) return;
          if (extra) filas = [...filas, ...extra];
        }
      }

      if (esNuevaBusqueda) {
        setUsuarios(filas);
      } else {
        setUsuarios(prev => [...prev, ...filas]);
      }
      setHayMasUsuarios(paginaLlena);
    } catch (e: any) {
      if (miSeq === seqBusquedaRef.current) toast.error("Error al buscar usuarios");
    } finally {
      if (esNuevaBusqueda && miSeq === seqBusquedaRef.current) setCargando(false);
    }
  };

  const cargarMasUsuarios = () => {
    const nuevoOffset = offsetUsuarios + LIMIT_USUARIOS;
    setOffsetUsuarios(nuevoOffset);
    buscarUsuariosDB(busqueda, nuevoOffset, false);
  };

  const verHistorial = async (usuarioId: string, forceRefresh = false) => {
    if (historialActivo === usuarioId && !forceRefresh) { 
      setHistorialActivo(null); 
      return; 
    }
    setHistorialActivo(usuarioId);
    setCargandoHistorial(true);
    setOffsetHistorial(0);
    
    try {
      const { data } = await supabase
        .from('transacciones_creditos')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .range(0, LIMIT_HISTORIAL - 1);
        
      setDatosHistorial(data || []);
      setHayMasHistorial((data?.length || 0) === LIMIT_HISTORIAL);
    } catch (e: any) {
      toast.error("Error al cargar historial");
    } finally {
      setCargandoHistorial(false);
    }
  };

  const cargarMasHistorial = async () => {
    if (!historialActivo) return;
    const nuevoOffset = offsetHistorial + LIMIT_HISTORIAL;
    setOffsetHistorial(nuevoOffset);
    
    try {
      const { data } = await supabase
        .from('transacciones_creditos')
        .select('*')
        .eq('usuario_id', historialActivo)
        .order('created_at', { ascending: false })
        .range(nuevoOffset, nuevoOffset + LIMIT_HISTORIAL - 1);
        
      setDatosHistorial(prev => [...prev, ...(data || [])]);
      setHayMasHistorial((data?.length || 0) === LIMIT_HISTORIAL);
    } catch (e) {
      toast.error("Error al cargar más historial");
    }
  };

  const procesarIngreso = async (usuario: any, monto: string, metodo: 'efectivo' | 'transferencia' | 'fiado') => {
    const pesosIngresados = parseFloat(monto);
    if (isNaN(pesosIngresados) || pesosIngresados <= 0) {
      toast.error("Ingresa una cantidad válida.");
      return false;
    }

    const loadingId = toast.loading('Procesando ingreso inteligente...');
    try {
      const deudaActual = Number(usuario.deuda_pesos || 0);
      const totalActual = Number(usuario.creditos_disponibles || 0) + Number(usuario.saldo_pesos || 0);
      
      let nuevaDeuda = deudaActual;
      let nuevoTotal = totalActual;
      const transacciones = [];

      if (metodo === 'fiado') {
        // Al fiar, la deuda sube y el saldo disponible también sube (para que puedan jugar)
        nuevaDeuda = deudaActual + pesosIngresados;
        nuevoTotal = totalActual + pesosIngresados;
        transacciones.push({ usuario_id: usuario.id, cantidad: pesosIngresados, tipo_movimiento: 'recarga_fiada', descripcion: 'Préstamo/Fiado (Mostrador)' });
      } else {
        if (deudaActual > 0) {
          // 1. Registramos el ingreso TOTAL primero
          transacciones.push({ 
            usuario_id: usuario.id, 
            cantidad: pesosIngresados, 
            tipo_movimiento: metodo === 'transferencia' ? 'recarga_transferencia' : 'recarga_manual', 
            descripcion: metodo === 'transferencia' ? 'Ingreso por Transferencia' : 'Ingreso Mostrador (Efectivo)' 
          });

          // 2. Calculamos cuánto vamos a cobrar de la deuda y generamos un registro NEGATIVO (deducción)
          const montoCobrado = Math.min(pesosIngresados, deudaActual);
          nuevaDeuda = deudaActual - montoCobrado;
          nuevoTotal = totalActual + pesosIngresados - montoCobrado; // Efecto neto en el saldo

          transacciones.push({ 
            usuario_id: usuario.id, 
            cantidad: -montoCobrado, // Se resta del saldo para cobrar la deuda
            tipo_movimiento: metodo === 'transferencia' ? 'pago_deuda_transferencia' : 'pago_deuda_efectivo', 
            descripcion: montoCobrado === deudaActual ? `Liquidación de deuda (${metodo})` : `Abono a deuda (${metodo})` 
          });
        } else {
          // Ingreso normal sin deudas
          nuevoTotal = totalActual + pesosIngresados;
          transacciones.push({ usuario_id: usuario.id, cantidad: pesosIngresados, tipo_movimiento: metodo === 'transferencia' ? 'recarga_transferencia' : 'recarga_manual', descripcion: metodo === 'transferencia' ? 'Ingreso por Transferencia' : 'Ingreso Mostrador (Efectivo)' });
        }
      }

      await supabase.from('usuarios').update({ creditos_disponibles: 0, saldo_pesos: nuevoTotal, deuda_pesos: nuevaDeuda }).eq('id', usuario.id);
      await supabase.from('transacciones_creditos').insert(transacciones);

      // 👇 DISPARADOR ULTRA RÁPIDO DE NOTIFICACIONES 👇
      try {
        let textoNotificacion = `ha registrado un ingreso de $${pesosIngresados} MXN a tu cuenta.`;
        if (metodo === 'fiado') {
          textoNotificacion = `te ha otorgado un préstamo/fiado de $${pesosIngresados} MXN.`;
        } else if (deudaActual > 0) {
          const cobrado = Math.min(pesosIngresados, deudaActual);
          textoNotificacion = `ha registrado un ingreso de $${pesosIngresados} MXN (Se descontaron automáticamente $${cobrado} de deuda).`;
        }

        await supabase.from('notificaciones').insert({
          usuario_emisor_id: null,
          usuario_receptor_id: usuario.id, 
          tipo: 'recarga',
          contenido: textoNotificacion,
        });
      } catch (err) {
        console.error("Fallo general en notificaciones:", err);
      }
      // 👆 FIN DEL DISPARADOR 👆

      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuario.id, nuevoTotal);
      await buscarUsuariosDB(busqueda, 0, true); 
      if (historialActivo === usuario.id) await verHistorial(usuario.id, true);

      toast.success(`Operación registrada exitosamente`, { id: loadingId });
      return true;
    } catch (e: any) {
      toast.error("Error procesando la operación", { id: loadingId });
      return false;
    }
  };

  const procesarRetiro = async (usuario: any, monto: string) => {
    const cantidadRetiro = parseFloat(monto);
    const totalActual = Number(usuario.creditos_disponibles || 0) + Number(usuario.saldo_pesos || 0);

    if (isNaN(cantidadRetiro) || cantidadRetiro <= 0 || cantidadRetiro > totalActual) {
      toast.error("Monto inválido o saldo insuficiente.");
      return false;
    }
    
    const loadingId = toast.loading('Procesando retiro...');
    try {
      const nuevoTotal = totalActual - cantidadRetiro;
      await supabase.from('usuarios').update({ creditos_disponibles: 0, saldo_pesos: nuevoTotal }).eq('id', usuario.id);
      await supabase.from('transacciones_creditos').insert([{ usuario_id: usuario.id, cantidad: -cantidadRetiro, tipo_movimiento: 'retiro_efectivo', descripcion: `Retiro Mostrador` }]);
      
      try {
        await supabase.from('notificaciones').insert({
          usuario_emisor_id: null,
          usuario_receptor_id: usuario.id,
          tipo: 'recarga',
          contenido: `ha registrado un retiro de $${cantidadRetiro} MXN de tu saldo.`,
        });
      } catch (err) {
        console.error("Fallo general en notificaciones:", err);
      }

      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuario.id, nuevoTotal);
      await buscarUsuariosDB(busqueda, 0, true);
      if (historialActivo === usuario.id) await verHistorial(usuario.id, true);
      
      toast.success(`Retiro de $${cantidadRetiro} MXN exitoso`, { id: loadingId });
      return true;
    } catch {
      toast.error("Error en el retiro", { id: loadingId });
      return false;
    }
  };

  return { 
    usuarios, busqueda, setBusqueda, cargando, hayMasUsuarios, cargarMasUsuarios,
    historialActivo, datosHistorial, cargandoHistorial, hayMasHistorial, cargarMasHistorial, verHistorial, 
    procesarIngreso, procesarRetiro
  };
}