import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const TAMANO_PAGINA = 30; // 👈 Cantidad de registros por carga

export function useBilletera(usuarioId: string) {
  // 🧠 ESTADOS
  const [saldoTotalPesos, setSaldoTotalPesos] = useState<number>(0) 
  const [deudaPesos, setDeudaPesos] = useState<number>(0)
  const [nombreUsuario, setNombreUsuario] = useState<string>('')
  
  const [transacciones, setTransacciones] = useState<any[]>([])
  
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false) // 👈 Nuevo: Para el botón de Cargar Más
  const [error, setError] = useState<string | null>(null)
  const [hayMas, setHayMas] = useState(true) // 👈 Nuevo: Saber si llegamos al final

  // 🔄 CARGA INICIAL
  const cargarBilletera = useCallback(async (silencioso = false) => {
    if (!usuarioId) {
      setCargando(false)
      return
    }

    if (!silencioso) setCargando(true)
    setError(null) 
    
    try {
      // 1. Traer saldo, deuda y NOMBRE
      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('nombre, creditos_disponibles, saldo_pesos, deuda_pesos')
        .eq('id', usuarioId)
        .single()
        
      if (userError) throw userError

      if (userData) {
        const totalUnificado = Number(userData.creditos_disponibles || 0) + Number(userData.saldo_pesos || 0)
        setSaldoTotalPesos(totalUnificado)
        setDeudaPesos(Number(userData.deuda_pesos || 0))
        setNombreUsuario(userData.nombre || 'Usuario')
      }

      // 2. Traer el historial inicial (Primeros 30)
      const { data: txData, error: txError } = await supabase
        .from('transacciones_creditos')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .range(0, TAMANO_PAGINA - 1) // 👈 Rango de 0 a 29

      if (txError) throw txError

      if (txData) {
        setTransacciones(txData)
        // Si nos trajo exactamente 30, asumimos que puede haber más
        setHayMas(txData.length === TAMANO_PAGINA)
      }
    } catch (err: any) {
      console.error("Error al cargar la billetera:", err.message)
      if (!silencioso) setError("Error de conexión. No pudimos cargar tu billetera.")
    } finally {
      setCargando(false)
    }
  }, [usuarioId]);

  // ➕ FUNCIÓN PARA CARGAR MÁS
  const cargarMas = async () => {
    if (!usuarioId || cargandoMas || !hayMas) return;
    
    setCargandoMas(true);
    try {
      const inicio = transacciones.length;
      const fin = inicio + TAMANO_PAGINA - 1;

      const { data: txData, error: txError } = await supabase
        .from('transacciones_creditos')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .range(inicio, fin); // 👈 Traemos el siguiente bloque (ej. 30 a 59)

      if (txError) throw txError;

      if (txData) {
        // Agregamos los nuevos registros a los que ya teníamos
        setTransacciones(prev => [...prev, ...txData]);
        setHayMas(txData.length === TAMANO_PAGINA);
      }
    } catch (err: any) {
      console.error("Error al cargar más transacciones:", err.message);
    } finally {
      setCargandoMas(false);
    }
  };

  useEffect(() => {
    cargarBilletera()
  }, [cargarBilletera])

  // Exportamos todo al componente visual
  return { 
    nombreUsuario, saldoTotalPesos, deudaPesos, transacciones, 
    cargando, cargandoMas, error, hayMas, 
    recargar: cargarBilletera, cargarMas 
  }
}