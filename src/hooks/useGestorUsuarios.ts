import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useGestorUsuarios() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarUsuariosYEstadisticas = async () => {
    setCargando(true)
    try {
      // 1. Peticiones concurrentes para optimizar la velocidad de carga (UX)
      const [
        { data: usersData, error: errUsers },
        { data: ticketsData, error: errTickets },
        { data: txData, error: errTx }
      ] = await Promise.all([
        supabase.from('usuarios').select('*'),
        supabase.from('tickets').select('usuario_id'),
        supabase.from('transacciones_creditos').select('usuario_id, tipo_movimiento, cantidad')
      ])

      // 🛡️ Manejo de Errores Visuales
      if (errUsers) throw new Error(`Fallo en tabla usuarios: ${errUsers.message}`)
      if (errTickets) console.warn("Aviso en tabla tickets:", errTickets.message)
      if (errTx) console.warn("Aviso en tabla transacciones:", errTx.message)

      // 2. Procesamiento y cruce de datos
      const usuariosProcesados = (usersData || []).map(user => {
        const userId = String(user.id)
        const ticketsJugados = (ticketsData || []).filter(t => String(t.usuario_id) === userId).length
        const misTxs = (txData || []).filter(tx => String(tx.usuario_id) === userId)
        
        // Dinero ingresado: Sin multiplicadores. Suma directa de la cantidad.
        const dineroIngresadoAprox = misTxs
          .filter(tx => String(tx.tipo_movimiento || '').toLowerCase().includes('recarga'))
          .reduce((acc, curr) => acc + Number(curr.cantidad || 0), 0)

        // Premios promocionales
        const premiosGanadosCreditos = misTxs
          .filter(tx => String(tx.tipo_movimiento || '').toLowerCase().includes('premio'))
          .reduce((acc, curr) => acc + Number(curr.cantidad || 0), 0)

        // 🔥 BILLETERA ACTUAL: Suma de saldo_pesos y creditos_disponibles
        const billeteraActual = Number(user.saldo_pesos || 0) + Number(user.creditos_disponibles || 0)
        
        // 🔥 DEUDA ACTUAL
        const deudaActual = Number(user.deuda_pesos || 0)

        return {
          ...user,
          ticketsJugados,
          dineroIngresadoAprox,
          premiosGanadosCreditos,
          billeteraActual,
          deudaActual
        }
      })

      // Ordenamiento seguro por fecha (Fallback al ID)
      usuariosProcesados.sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        return b.id - a.id
      })

      setUsuarios(usuariosProcesados)
    } catch (error: any) {
      console.error("Error al cargar gestión de usuarios:", error.message || error)
    } finally {
      setCargando(false) // Libera el Skeleton Loader en la UI
    }
  }

  useEffect(() => {
    cargarUsuariosYEstadisticas()
  }, [])

  // MÓDULO DE ACTUALIZACIÓN
  const actualizarUsuario = async (id: string, nombre: string, telefono: string) => {
    const { error } = await supabase.from('usuarios').update({ nombre, telefono }).eq('id', id)
    if (!error) {
      await cargarUsuariosYEstadisticas() 
      return true
    }
    return false
  }

  // MÓDULO DE ABONO A DEUDAS
  const abonarDeuda = async (id: string, monto: number) => {
    try {
      const { data: user } = await supabase.from('usuarios').select('deuda_pesos').eq('id', id).single()
      if (!user) return false;

      const deudaActual = Number(user.deuda_pesos || 0);
      if (deudaActual <= 0) return false;

      // Protegemos para que no pague más de lo que debe
      const abonoReal = Math.min(monto, deudaActual);
      const nuevaDeuda = deudaActual - abonoReal;

      // 1. Actualizamos la deuda en el usuario
      const { error: errUpdate } = await supabase.from('usuarios').update({ deuda_pesos: nuevaDeuda }).eq('id', id);
      if (errUpdate) throw errUpdate;

      // 2. Registramos el movimiento contable en negativo (como cobro de deuda)
      await supabase.from('transacciones_creditos').insert([{
        usuario_id: id,
        cantidad: -abonoReal, 
        tipo_movimiento: 'abono_deuda',
        descripcion: 'Abono manual a deuda desde Gestor de Usuarios'
      }]);

      await cargarUsuariosYEstadisticas();
      return true;
    } catch (e) {
      console.error("Error al abonar:", e);
      return false;
    }
  }

  // MÓDULO DE SEGURIDAD INDEPENDIENTE
  const encriptarNIP = async (pin: string, tel: string) => {
    const textoAEncriptar = `${pin}-${tel}-CiberTequeSeguro2024`
    
    // Fallback criptográfico para entornos de desarrollo local (sin HTTPS)
    if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
      let hash = 0;
      for (let i = 0; i < textoAEncriptar.length; i++) {
        const char = textoAEncriptar.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
      }
      return Math.abs(hash).toString(16);
    }

    const msgUint8 = new TextEncoder().encode(textoAEncriptar)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const resetearNIP = async (id: string, telefono: string, nuevoNip: string) => {
    const nipHash = await encriptarNIP(nuevoNip, telefono)
    const { error } = await supabase.from('usuarios').update({ nip: nipHash }).eq('id', id)
    return !error
  }

  return { 
    usuarios, 
    cargando, 
    actualizarUsuario,
    abonarDeuda,
    resetearNIP,
    recargarDatos: cargarUsuariosYEstadisticas 
  }
}