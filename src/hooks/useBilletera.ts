import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useBilletera(usuarioId: string) {
  const [saldo, setSaldo] = useState<number>(0)
  const [saldoPesos, setSaldoPesos] = useState<number>(0) 
  const [transacciones, setTransacciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!usuarioId) {
      setCargando(false)
      return
    }

    async function cargarBilletera() {
      setCargando(true)
      setError(null) // Reiniciamos el error en cada intento
      
      try {
        // 1. Traer el saldo de créditos Y el saldo en pesos
        const { data: userData, error: userError } = await supabase
          .from('usuarios')
          .select('creditos_disponibles, saldo_pesos')
          .eq('id', usuarioId)
          .single()
          
        if (userError) throw userError

        if (userData) {
          setSaldo(userData.creditos_disponibles || 0)
          setSaldoPesos(userData.saldo_pesos || 0) 
        }

        // 2. Traer el historial de movimientos (últimos 30)
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
        setError("Error de conexión. No pudimos cargar tu billetera.")
      } finally {
        setCargando(false)
      }
    }

    cargarBilletera()
  }, [usuarioId])

  return { saldo, saldoPesos, transacciones, cargando, error }
}