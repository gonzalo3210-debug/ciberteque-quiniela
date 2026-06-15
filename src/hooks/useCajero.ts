import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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

  // 💰 LÓGICA MEJORADA: Ingreso Directo en Pesos
  const procesarRecargaLibre = async (usuario: any, monto: string) => {
    const pesosIngresados = parseFloat(monto);
    if (isNaN(pesosIngresados) || pesosIngresados <= 0) {
      toast.error("Ingresa una cantidad válida.");
      return false;
    }

    const loadingId = toast.loading('Procesando ingreso...');
    try {
      // Magia: Convertimos sus créditos viejos (si tiene) a pesos para limpiar su cuenta
      const totalActual = Number(usuario.creditos_disponibles || 0) + Number(usuario.saldo_pesos || 0);
      const nuevoTotal = totalActual + pesosIngresados;

      await supabase.from('usuarios').update({ creditos_disponibles: 0, saldo_pesos: nuevoTotal }).eq('id', usuario.id);

      await supabase.from('transacciones_creditos').insert([{ 
        usuario_id: usuario.id, cantidad: pesosIngresados, tipo_movimiento: 'recarga_manual', descripcion: `Ingreso Mostrador` 
      }]);

      if (actualizarSaldoGlobal) actualizarSaldoGlobal(usuario.id, nuevoTotal);
      
      await buscarUsuariosDB(busqueda, 0, true); 
      if (historialActivo === usuario.id) await verHistorial(usuario.id, true);

      toast.success(`Ingreso de $${pesosIngresados} MXN exitoso`, { id: loadingId });
      return true;
    } catch (e: any) {
      toast.error("Error procesando el ingreso", { id: loadingId });
      return false;
    }
  };

  // 💸 NUEVA LÓGICA: Retiro de Efectivo
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
      
      await supabase.from('transacciones_creditos').insert([{ 
        usuario_id: usuario.id, cantidad: -cantidadRetiro, tipo_movimiento: 'retiro_efectivo', descripcion: `Retiro Mostrador` 
      }]);
      
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
    procesarRecargaLibre, procesarRetiro 
  };
}