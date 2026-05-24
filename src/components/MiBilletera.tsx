'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MiBilletera({ usuarioId }: { usuarioId: string }) {
  const [saldo, setSaldo] = useState<number>(0)
  const [transacciones, setTransacciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  // ⚙️ CONSTANTE MONETARIA DE CIBERTEQUE
  const VALOR_CREDITO = 30 // $30 MXN por crédito

  useEffect(() => {
    if (!usuarioId) {
      setCargando(false)
      return
    }

    async function cargarBilletera() {
      setCargando(true)
      
      // 1. Traer el saldo actual del usuario
      const { data: userData } = await supabase
        .from('usuarios')
        .select('creditos_disponibles')
        .eq('id', usuarioId)
        .single()
        
      if (userData) {
        setSaldo(userData.creditos_disponibles || 0)
      }

      // 2. Traer el historial de movimientos (últimos 30)
      const { data: txData } = await supabase
        .from('transacciones_creditos')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(30)

      if (txData) {
        setTransacciones(txData)
      }
      
      setCargando(false)
    }

    cargarBilletera()
  }, [usuarioId])

  if (cargando) {
    return <div className="text-amber-500 animate-pulse text-center mt-10 font-bold uppercase tracking-widest">Cargando Billetera...</div>
  }

  if (!usuarioId) {
    return <div className="text-slate-500 italic text-center mt-10 font-bold uppercase">Inicia sesión para ver tu billetera.</div>
  }

  const interpretarTransaccion = (tipo: string, descripcion: string) => {
    switch (tipo) {
      case 'recarga_manual': return { titulo: 'Recarga en Mostrador', icono: '💵', color: 'text-green-400', bg: 'bg-green-950/30 border-green-900' }
      case 'juego_ticket_fisico': 
      case 'juego_ticket': return { titulo: 'Compra de Boleto', icono: '🎟️', color: 'text-amber-500', bg: 'bg-amber-950/20 border-amber-900/50' }
      case 'premio_quiniela': return { titulo: 'Premio Ganado', icono: '🏆', color: 'text-yellow-400', bg: 'bg-yellow-950/40 border-yellow-600' }
      default: return { titulo: descripcion || 'Movimiento', icono: '📝', color: 'text-slate-300', bg: 'bg-slate-800/40 border-slate-700' }
    }
  }

  const formatearFecha = (fechaISO: string) => {
    const fecha = new Date(fechaISO)
    return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 animate-in fade-in duration-500 mb-20 space-y-6">
      
      {/* TARJETA DE SALDO PRINCIPAL */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
        <div className="absolute -right-10 -top-10 p-4 opacity-5 text-9xl select-none">💳</div>
        
        <h2 className="text-center text-sm font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">
          Mi Saldo Disponible
        </h2>
        
        <div className="flex flex-col items-center justify-center relative z-10">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.2)]">
              {saldo}
            </span>
            <span className="text-xl text-green-600 font-bold uppercase tracking-widest">
              Créditos
            </span>
          </div>
          
          <div className="mt-4 bg-slate-950/80 px-6 py-2 rounded-full border border-slate-800 shadow-inner">
            <span className="text-xs text-slate-500 font-bold uppercase mr-2">Valor Real:</span>
            <span className="text-lg font-black text-white">${(saldo * VALOR_CREDITO).toFixed(2)} MXN</span>
          </div>
        </div>
      </div>

      {/* HISTORIAL DE MOVIMIENTOS */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="bg-slate-950 p-4 border-b border-slate-800">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span>📋</span> Historial de Movimientos
          </h3>
        </div>
        
        <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto">
          {transacciones.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs font-bold uppercase tracking-widest italic">
              No tienes movimientos aún.
            </div>
          ) : (
            transacciones.map((tx) => {
              const info = interpretarTransaccion(tx.tipo_movimiento, tx.descripcion)
              const esSuma = tx.cantidad > 0
              
              return (
                <div key={tx.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${info.bg}`}>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">{info.icono}</div>
                    <div>
                      <p className={`font-black text-sm uppercase tracking-tight ${info.color}`}>
                        {info.titulo}
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                        {formatearFecha(tx.created_at)}
                      </p>
                      {tx.descripcion && tx.tipo_movimiento !== 'recarga_manual' && (
                        <p className="text-[10px] text-slate-400 italic mt-1 max-w-[150px] sm:max-w-xs truncate">
                          {tx.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col items-end">
                    <span className={`text-xl font-black ${esSuma ? 'text-green-400' : 'text-red-400'}`}>
                      {esSuma ? '+' : ''}{tx.cantidad}
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">
                      {Math.abs(tx.cantidad) === 1 ? 'crédito' : 'créditos'}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

    </div>
  )
}