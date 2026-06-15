import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export function useCajero(actualizarSaldoGlobal?: (id: string, nuevo: number) => void) {
  const PRECIO_CREDITO = 30;
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (busqueda.trim().length > 0) {
        buscarUsuariosDB(busqueda, 0, true);
      } else {
        setUsuarios([]);
        setHayMasUsuarios(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const buscarUsuariosDB = async (termino: string, offset = 0, esNuevaBusqueda = false) => {
    if (esNuevaBusqueda) {
      setCargando(true);
      setOffsetUsuarios(0);
    }
    
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .or(`nombre.ilike.%${termino}%,telefono.ilike.%${termino}%`)
        .order('nombre', { ascending: true })
        .range(offset, offset + LIMIT_USUARIOS - 1);
        
      if (error) throw error;
      
      if (esNuevaBusqueda) {
        setUsuarios(data || []);
      } else {
        setUsuarios(prev => [...prev, ...(data || [])]);
      }
      setHayMasUsuarios((data?.length || 0) === LIMIT_USUARIOS);
    } catch (e: any) {
      toast.error("Error al buscar usuarios");
    } finally {
      if (esNuevaBusqueda) setCargando(false);
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

  const recargarCreditos = async (usuarioId: string, saldoActual: number, cantidad: number) => {
    const loadingId = toast.loading('Procesando venta...');
    try {
      const nuevoSaldo = saldoActual + cantidad;
      const { error } = await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', usuarioId);
      if (error) throw error;

      await supabase.from('transacciones_creditos').insert([{ 
        usuario_id: usuarioId, cantidad: cantidad, tipo_movimiento: 'recarga_manual', descripcion: 'Venta en mostrador' 
      }]);

      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuarioId, nuevoSaldo);
      
      await buscarUsuariosDB(busqueda, 0, true); 
      if (historialActivo === usuarioId) await verHistorial(usuarioId, true);
      
      toast.success('¡Venta registrada con éxito!', { id: loadingId });
    } catch (e: any) {
      toast.error('Error al recargar', { id: loadingId });
    }
  };

  const procesarRecargaLibre = async (usuario: any, monto: string) => {
    const pesosIngresados = parseFloat(monto);
    if (isNaN(pesosIngresados) || pesosIngresados <= 0) {
      toast.error("Ingresa una cantidad válida.");
      return false;
    }

    const loadingId = toast.loading('Calculando conversión...');
    try {
      const saldoPesosAnterior = usuario.saldo_pesos || 0;
      const totalPesosDisponibles = saldoPesosAnterior + pesosIngresados;
      const creditosNuevos = Math.floor(totalPesosDisponibles / PRECIO_CREDITO);
      const nuevoSaldoPesos = totalPesosDisponibles % PRECIO_CREDITO;
      const nuevoSaldoCreditos = (usuario.creditos_disponibles || 0) + creditosNuevos;

      await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldoCreditos, saldo_pesos: nuevoSaldoPesos }).eq('id', usuario.id);

      if (creditosNuevos > 0) {
        await supabase.from('transacciones_creditos').insert([{ 
          usuario_id: usuario.id, cantidad: creditosNuevos, tipo_movimiento: 'recarga_billetera', descripcion: `Conversión Auto: $${pesosIngresados} MXN` 
        }]);
      }

      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuario.id, nuevoSaldoCreditos);
      
      await buscarUsuariosDB(busqueda, 0, true); 
      if (historialActivo === usuario.id) await verHistorial(usuario.id, true);

      toast.success(`Recibido: $${pesosIngresados} MXN`, { id: loadingId });
      return true;
    } catch (e: any) {
      toast.error("Error procesando el pago", { id: loadingId });
      return false;
    }
  };

  const procesarRetiro = async (usuario: any, monto: string) => {
    const cantidadRetiro = parseFloat(monto);
    if (isNaN(cantidadRetiro) || cantidadRetiro <= 0 || cantidadRetiro > (usuario.saldo_pesos || 0)) {
      toast.error("Monto inválido o insuficiente.");
      return false;
    }
    const loadingId = toast.loading('Procesando retiro...');
    try {
      const nuevoSaldoPesos = (usuario.saldo_pesos || 0) - cantidadRetiro;
      await supabase.from('usuarios').update({ saldo_pesos: nuevoSaldoPesos }).eq('id', usuario.id);
      await supabase.from('transacciones_creditos').insert([{ 
        usuario_id: usuario.id, cantidad: 0, tipo_movimiento: 'retiro_efectivo', descripcion: `Retiro: -$${cantidadRetiro} MXN` 
      }]);
      await buscarUsuariosDB(busqueda, 0, true);
      toast.success('Retiro exitoso', { id: loadingId });
      return true;
    } catch {
      toast.error("Error en el retiro", { id: loadingId });
      return false;
    }
  };

  return { 
    PRECIO_CREDITO, 
    usuarios, busqueda, setBusqueda, cargando, hayMasUsuarios, cargarMasUsuarios,
    historialActivo, datosHistorial, cargandoHistorial, hayMasHistorial, cargarMasHistorial, verHistorial, 
    recargarCreditos, procesarRecargaLibre, procesarRetiro 
  };
}