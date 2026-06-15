import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useGestorUsuarios() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarUsuariosYEstadisticas = async () => {
    setCargando(true)
    try {
      // 1. Traer todos los usuarios (Aseguramos traer saldo_pesos incluido en el '*')
      const { data: usersData, error: errUsers } = await supabase.from('usuarios').select('*')
      
      // 2. Traer todos los tickets (para saber quién juega más)
      const { data: ticketsData, error: errTickets } = await supabase.from('tickets').select('usuario_id')
      
      // 3. Traer todas las transacciones (para saber quién compra y quién gana más)
      const { data: txData, error: errTx } = await supabase.from('transacciones_creditos').select('usuario_id, tipo_movimiento, cantidad')

      // 🔥 VALIDACIÓN MEJORADA
      if (errUsers) throw new Error(`Fallo en tabla usuarios: ${errUsers.message}`)
      if (errTickets) console.error("Aviso en tabla tickets:", errTickets.message)
      if (errTx) console.error("Aviso en tabla transacciones:", errTx.message)

      // 4. Cruzar los datos para armar las estadísticas
      const usuariosProcesados = (usersData || []).map(user => {
        // Aseguramos que los IDs coincidan incluso si uno es texto y otro número
        const ticketsJugados = (ticketsData || []).filter(t => String(t.usuario_id) === String(user.id)).length

        const misTxs = (txData || []).filter(tx => String(tx.usuario_id) === String(user.id))
        
        // 🛡️ BÚSQUEDA FLEXIBLE: Detecta 'recarga_manual' Y 'recarga_billetera' buscando la palabra "recarga"
        const creditosComprados = misTxs
          .filter(tx => String(tx.tipo_movimiento || '').toLowerCase().includes('recarga'))
          .reduce((acc, curr) => acc + Number(curr.cantidad || 0), 0)

        // 🆕 LÓGICA DE NEGOCIO: Dinero ingresado (Créditos comprados a $30 + saldo en pesos sobrante)
        const dineroIngresadoAprox = (creditosComprados * 30) + Number(user.saldo_pesos || 0)

        // 🆕 LÓGICA DE NEGOCIO: Sumar premios ganados (solo créditos promocionales)
        const premiosGanadosCreditos = misTxs
          .filter(tx => String(tx.tipo_movimiento || '').toLowerCase().includes('premio'))
          .reduce((acc, curr) => acc + Number(curr.cantidad || 0), 0)

        return {
          ...user,
          ticketsJugados,
          creditosComprados,
          dineroIngresadoAprox,
          premiosGanadosCreditos
        }
      })

      // Ordenamos manualmente por fecha si existe, o por ID para evitar errores de BD
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
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarUsuariosYEstadisticas()
  }, [])

  // ✏️ ACTUALIZAR DATOS BÁSICOS
  const actualizarUsuario = async (id: string, nombre: string, telefono: string) => {
    const { error } = await supabase.from('usuarios').update({ nombre, telefono }).eq('id', id)
    if (!error) {
      cargarUsuariosYEstadisticas() 
      return true
    }
    return false
  }

  // 🔐 SEGURIDAD: ENCRIPTAR Y RESETEAR NIP
  const encriptarNIP = async (pin: string, tel: string) => {
    const textoAEncriptar = `${pin}-${tel}-CiberTequeSeguro2024`
    
    // Fallback de seguridad si se prueba en localhost
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
    resetearNIP,
    recargarDatos: cargarUsuariosYEstadisticas 
  }
}