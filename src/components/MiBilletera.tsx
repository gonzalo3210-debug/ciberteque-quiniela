'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MiBilletera({ usuarioId }: { usuarioId: string }) {
  const [saldo, setSaldo] = useState<number>(0)
  const [saldoPesos, setSaldoPesos] = useState<number>(0) 
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
      
      // 1. Traer el saldo de créditos Y el saldo en pesos
      const { data: userData } = await supabase
        .from('usuarios')
        .select('creditos_disponibles, saldo_pesos')
        .eq('id', usuarioId)
        .single()
        
      if (userData) {
        setSaldo(userData.creditos_disponibles || 0)
        setSaldoPesos(userData.saldo_pesos || 0) 
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
    return <div className="text-amber-500 animate-pulse text-center mt-10 font-bold uppercase tracking-widest text-xs">Cargando Billetera...</div>
  }

  if (!usuarioId) {
    return <div className="text-slate-500 italic text-center mt-10 font-bold uppercase text-xs">Inicia sesión para ver tu billetera.</div>
  }

  const interpretarTransaccion = (tipo: string, descripcion: string) => {
    switch (tipo) {
      case 'recarga_manual': return { titulo: 'Recarga Mostrador', icono: '💵', color: 'text-green-400', bg: 'bg-green-950/30 border-green-900/50' }
      case 'recarga_billetera': return { titulo: 'Conversión Auto', icono: '🔄', color: 'text-amber-400', bg: 'bg-amber-950/30 border-amber-900/50' }
      case 'juego_ticket_fisico': 
      case 'juego_ticket': return { titulo: 'Compra Boleto', icono: '🎟️', color: 'text-blue-400', bg: 'bg-blue-950/20 border-blue-900/40' }
      case 'premio_quiniela': return { titulo: 'Premio Ganado', icono: '🏆', color: 'text-yellow-400', bg: 'bg-yellow-950/40 border-yellow-600/50' }
      default: return { titulo: descripcion || 'Movimiento', icono: '📝', color: 'text-slate-300', bg: 'bg-slate-800/40 border-slate-700' }
    }
  }

  const formatearFecha = (fechaISO: string) => {
    const fecha = new Date(fechaISO)
    return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4">
      
      {/* TARJETA DE SALDO PRINCIPAL COMPACTA */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 md:p-6 rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.4)] relative overflow-hidden">
        <div className="absolute -right-8 -top-8 p-4 opacity-5 text-8xl select-none">💳</div>
        
        <h2 className="text-center text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">
          Mi Saldo Disponible
        </h2>
        
        <div className="flex flex-col items-center justify-center relative z-10">
          {/* Créditos */}
          <div className="flex items-baseline gap-1.5 md:gap-2">
            <span className="text-4xl md:text-5xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.2)]">
              {saldo}
            </span>
            <span className="text-sm md:text-base text-green-600 font-bold uppercase tracking-widest">
              Créditos
            </span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {/* Saldo a Favor en Pesos (El Cambio) */}
            <div className="bg-amber-950/30 px-5 py-2 rounded-full border border-amber-900/50 shadow-inner flex items-center gap-2">
              <span className="text-[10px] md:text-[11px] text-amber-500/80 font-bold uppercase">Saldo a Favor (Cambio):</span>
              <span className="text-sm md:text-base font-black text-amber-400">${saldoPesos.toFixed(2)} <span className="text-[9px] text-amber-600">MXN</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* HISTORIAL DE MOVIMIENTOS COMPACTO */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="bg-slate-950 p-3 border-b border-slate-800">
          <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span>📋</span> Historial de Movimientos
          </h3>
        </div>
        
        <div className="p-2 space-y-1.5 max-h-[350px] md:max-h-[450px] overflow-y-auto">
          {transacciones.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">
              No tienes movimientos aún.
            </div>
          ) : (
            transacciones.map((tx) => {
              const info = interpretarTransaccion(tx.tipo_movimiento, tx.descripcion)
              const esSuma = tx.cantidad > 0
              
              return (
                <div key={tx.id} className={`flex items-center justify-between p-2.5 md:p-3 rounded-xl border transition-colors ${info.bg}`}>
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <div className="text-xl md:text-2xl opacity-90">{info.icono}</div>
                    <div>
                      <p className={`font-black text-[10px] md:text-xs uppercase tracking-tight ${info.color}`}>
                        {info.titulo}
                      </p>
                      <p className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                        {formatearFecha(tx.created_at)}
                      </p>
                      {tx.descripcion && tx.tipo_movimiento !== 'recarga_manual' && (
                        <p className="text-[8px] md:text-[9px] text-slate-400/80 italic mt-0.5 max-w-[140px] md:max-w-xs truncate">
                          {tx.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col items-end">
                    <span className={`text-base md:text-lg font-black ${esSuma ? 'text-green-400' : 'text-red-400'}`}>
                      {esSuma ? '+' : ''}{tx.cantidad}
                    </span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase">
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