'use client'
import { useBilletera } from '@/hooks/useBilletera'

export default function MiBilletera({ usuarioId }: { usuarioId: string }) {
  // 🧠 Consumimos la lógica separada con el saldo unificado
  const { saldoTotalPesos, transacciones, cargando, error } = useBilletera(usuarioId)

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

  // 🛑 ESTADO: Sin Usuario
  if (!usuarioId) {
    return <div className="text-slate-500 italic text-center mt-10 font-bold uppercase text-xs">Inicia sesión para ver tu billetera.</div>
  }

  // ❌ ESTADO: Error de red
  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-10 bg-red-950/30 border border-red-900/50 rounded-2xl p-6 text-center animate-in fade-in">
        <span className="text-4xl mb-2 block">⚠️</span>
        <h3 className="text-red-500 font-black uppercase tracking-widest text-sm mb-1">Fallo de Conexión</h3>
        <p className="text-red-400/80 text-xs font-bold uppercase">{error}</p>
      </div>
    )
  }

  // ⏳ ESTADO: Cargando (Skeleton Loader)
  if (cargando) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-2 space-y-4 animate-pulse">
        {/* Skeleton Tarjeta Principal */}
        <div className="bg-slate-900 border border-slate-800 h-40 md:h-48 rounded-3xl w-full"></div>
        {/* Skeleton Historial */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3">
          <div className="h-6 bg-slate-800 rounded w-1/3 mb-4"></div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-800/50 rounded-xl w-full border border-slate-800"></div>
          ))}
        </div>
      </div>
    )
  }

  // ✅ ESTADO: Renderizado Exitoso
  return (
    <div className="w-full max-w-2xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4">
      
      {/* TARJETA DE SALDO PRINCIPAL UNIFICADA (SOLO PESOS MXN) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 md:p-8 rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col items-center justify-center">
        <div className="absolute -right-8 -top-8 p-4 opacity-5 text-8xl select-none">💳</div>
        <div className="absolute inset-0 bg-amber-500/5"></div>
        
        <h2 className="text-center text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">
          Mi Saldo Disponible
        </h2>
        
        <div className="relative z-10 flex items-baseline gap-2">
          <span className="text-5xl md:text-6xl font-black text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.2)] tracking-tighter">
            ${saldoTotalPesos.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </span>
          <span className="text-sm md:text-lg text-amber-600 font-black uppercase tracking-widest">
            MXN
          </span>
        </div>
      </div>

      {/* HISTORIAL DE MOVIMIENTOS COMPACTO */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="bg-slate-950 p-4 border-b border-slate-800">
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
              const montoAbsoluto = Math.abs(tx.cantidad).toLocaleString('es-MX', {minimumFractionDigits: 2})
              
              return (
                <div key={tx.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${info.bg}`}>
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="text-2xl md:text-3xl opacity-90">{info.icono}</div>
                    <div>
                      <p className={`font-black text-[10px] md:text-sm uppercase tracking-tight ${info.color}`}>
                        {info.titulo}
                      </p>
                      <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                        {formatearFecha(tx.created_at)}
                      </p>
                      {tx.descripcion && tx.tipo_movimiento !== 'recarga_manual' && (
                        <p className="text-[8px] md:text-[10px] text-slate-400/80 italic mt-0.5 max-w-[140px] md:max-w-xs truncate">
                          {tx.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col items-end">
                    <span className={`text-lg md:text-xl font-black ${esSuma ? 'text-green-400' : 'text-red-400'}`}>
                      {esSuma ? '+' : '-'}${montoAbsoluto}
                    </span>
                    <span className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                      MXN
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