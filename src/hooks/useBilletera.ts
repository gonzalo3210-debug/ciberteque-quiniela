import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useBilletera(usuarioId: string) {
  // 🧠 ESTADOS
  const [saldoTotalPesos, setSaldoTotalPesos] = useState<number>(0) 
  const [deudaPesos, setDeudaPesos] = useState<number>(0) // 👈 NUEVO: Estado para la deuda
  const [transacciones, setTransacciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Envolvemos en useCallback para poder usarla en tiempo real sin redibujos infinitos
  const cargarBilletera = useCallback(async (silencioso = false) => {
    if (!usuarioId) {
      setCargando(false)
      return
    }

    if (!silencioso) setCargando(true)
    setError(null) 
    
    try {
      // 1. Traer saldo y DEUDA de la BD
      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('creditos_disponibles, saldo_pesos, deuda_pesos') // 👈 Agregamos deuda_pesos
        .eq('id', usuarioId)
        .single()
        
      if (userError) throw userError

      if (userData) {
        const totalUnificado = Number(userData.creditos_disponibles || 0) + Number(userData.saldo_pesos || 0)
        setSaldoTotalPesos(totalUnificado)
        setDeudaPesos(Number(userData.deuda_pesos || 0)) // 👈 Guardamos la deuda
      }

      // 2. Traer el historial
      const { data: txData, error: txError } = await supabase
        .from('transacciones_creditos')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(30)

      if (txError) throw txError

      if (txData) {
        setTransacciones(txData)
      }
    } catch (err: any) {
      console.error("Error al cargar la billetera:", err.message)
      if (!silencioso) setError("Error de conexión. No pudimos cargar tu billetera.")
    } finally {
      setCargando(false)
    }
  }, [usuarioId]);

  useEffect(() => {
    cargarBilletera()
  }, [cargarBilletera])

  // 👈 Exportamos deudaPesos y la función recargar
  return { saldoTotalPesos, deudaPesos, transacciones, cargando, error, recargar: cargarBilletera }
}