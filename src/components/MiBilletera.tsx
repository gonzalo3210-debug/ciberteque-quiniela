'use client'
import { useEffect, useState } from 'react'
import { useBilletera } from '@/hooks/useBilletera'
import { supabase } from '@/lib/supabase'

export default function MiBilletera({ usuarioId }: { usuarioId: string }) {
  // 👈 Extraemos las nuevas funciones de paginación (cargandoMas, hayMas, cargarMas)
  const { nombreUsuario, saldoTotalPesos, deudaPesos, transacciones, cargando, cargandoMas, error, hayMas, recargar, cargarMas } = useBilletera(usuarioId)
  
  // ⚙️ CONFIGURACIÓN DE CONTACTO Y DEPÓSITO
  const NUMERO_WHATSAPP = "523118776263" 
  const CLABE_INTERBANCARIA = "722969010548321155" 
  const BANCO = "Mercado Pago W" 

  const [mostrarModalDeposito, setMostrarModalDeposito] = useState(false)
  
  // 🔍 ESTADOS PARA LOS FILTROS
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroFecha, setFiltroFecha] = useState('todas')

  useEffect(() => {
    if (!usuarioId) return;

    const canalBilletera = supabase.channel(`billetera_activa_${usuarioId}`)
      .on('postgres', { event: 'UPDATE', schema: 'public', table: 'usuarios', filter: `id=eq.${usuarioId}` }, () => {
        if (recargar) recargar(true);
      })
      .on('postgres', { event: 'INSERT', schema: 'public', table: 'transacciones_creditos', filter: `usuario_id=eq.${usuarioId}` }, () => {
        if (recargar) recargar(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canalBilletera);
    }
  }, [usuarioId, recargar])

  const interpretarTransaccion = (tipo: string, descripcion: string) => {
    switch (tipo) {
      case 'recarga_manual': return { titulo: 'Recarga Mostrador', icono: '💵', color: 'text-green-400', bg: 'bg-green-950/30 border-green-900/50' }
      case 'recarga_transferencia': return { titulo: 'Transferencia', icono: '📱', color: 'text-blue-400', bg: 'bg-blue-950/30 border-blue-900/50' }
      case 'recarga_fiada': return { titulo: 'Préstamo Mostrador', icono: '✍️', color: 'text-orange-400', bg: 'bg-orange-950/30 border-orange-900/50' }
      case 'pago_deuda_efectivo': 
      case 'pago_deuda_transferencia': return { titulo: 'Abono a Deuda', icono: '✅', color: 'text-emerald-400', bg: 'bg-emerald-950/30 border-emerald-900/50' }
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

  const solicitarRetiro = () => {
    const mensaje = encodeURIComponent(`Hola, me gustaría solicitar un retiro de mi billetera.\n\nMi usuario es: ${nombreUsuario}\n\nPor la cantidad de $`);
    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${mensaje}`, '_blank');
  }

  const notificarDeposito = () => {
    const mensaje = encodeURIComponent(`Hola, acabo de realizar una transferencia para recargar mi billetera.\n\nAdjunto mi comprobante. (Usuario: ${nombreUsuario})\n\nPor la cantidad de $`);
    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${mensaje}`, '_blank');
  }

  // 🧠 LÓGICA DE FILTRADO (Aplica sobre lo que ya hemos paginado)
  const transaccionesFiltradas = transacciones.filter(tx => {
    let pasaTipo = true;
    if (filtroTipo === 'recargas') {
      pasaTipo = ['recarga_manual', 'recarga_transferencia', 'recarga_billetera'].includes(tx.tipo_movimiento);
    } else if (filtroTipo === 'jugadas') {
      pasaTipo = ['juego_ticket', 'juego_ticket_fisico'].includes(tx.tipo_movimiento);
    } else if (filtroTipo === 'premios') {
      pasaTipo = tx.tipo_movimiento === 'premio_quiniela';
    } else if (filtroTipo === 'creditos') {
      pasaTipo = ['recarga_fiada', 'pago_deuda_efectivo', 'pago_deuda_transferencia'].includes(tx.tipo_movimiento);
    }

    let pasaFecha = true;
    const fechaTx = new Date(tx.created_at);
    const hoy = new Date();

    if (filtroFecha === 'hoy') {
      pasaFecha = fechaTx.toDateString() === hoy.toDateString();
    } else if (filtroFecha === '7dias') {
      const limite = new Date();
      limite.setDate(hoy.getDate() - 7);
      pasaFecha = fechaTx >= limite;
    } else if (filtroFecha === '30dias') {
      const limite = new Date();
      limite.setDate(hoy.getDate() - 30);
      pasaFecha = fechaTx >= limite;
    } else if (filtroFecha === 'mes') {
      pasaFecha = fechaTx.getMonth() === hoy.getMonth() && fechaTx.getFullYear() === hoy.getFullYear();
    }

    return pasaTipo && pasaFecha;
  });

  if (!usuarioId) {
    return <div className="text-slate-500 italic text-center mt-10 font-bold uppercase text-xs">Inicia sesión para ver tu billetera.</div>
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-10 bg-red-950/30 border border-red-900/50 rounded-2xl p-6 text-center animate-in fade-in">
        <span className="text-4xl mb-2 block">⚠️</span>
        <h3 className="text-red-500 font-black uppercase tracking-widest text-sm mb-1">Fallo de Conexión</h3>
        <p className="text-red-400/80 text-xs font-bold uppercase">{error}</p>
      </div>
    )
  }

  if (cargando) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-2 space-y-4 animate-pulse">
        <div className="bg-slate-900 border border-slate-800 h-40 md:h-48 rounded-3xl w-full"></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3">
          <div className="h-6 bg-slate-800 rounded w-1/3 mb-4"></div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-800/50 rounded-xl w-full border border-slate-800"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4 relative">
      
      {/* TARJETA DE SALDO PRINCIPAL */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 md:p-8 rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col items-center justify-center">
        <div className="absolute -right-8 -top-8 p-4 opacity-5 text-8xl select-none">💳</div>
        <div className="absolute inset-0 bg-amber-500/5"></div>
        
        <h2 className="text-center text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">
          Mi Saldo Disponible
        </h2>
        
        <div className="relative z-10 flex items-baseline gap-2 mb-6">
          <span className="text-5xl md:text-6xl font-black text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.2)] tracking-tighter">
            ${saldoTotalPesos.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </span>
          <span className="text-sm md:text-lg text-amber-600 font-black uppercase tracking-widest">
            MXN
          </span>
        </div>

        {/* ACCIONES DE BILLETERA */}
        <div className="relative z-10 flex w-full gap-3 justify-center">
          <button 
            onClick={() => setMostrarModalDeposito(true)}
            className="flex-1 max-w-[200px] bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <span>📥</span> Depositar
          </button>
          
          {saldoTotalPesos > 0 && (
            <button 
              onClick={solicitarRetiro}
              className="flex-1 max-w-[200px] bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <span>💸</span> Retirar
            </button>
          )}
        </div>
      </div>

      {/* MODAL DE DEPÓSITO */}
      {mostrarModalDeposito && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-amber-500 font-black uppercase tracking-widest text-sm flex items-center gap-2">
                <span>🏦</span> Datos de Transferencia
              </h3>
              <button onClick={() => setMostrarModalDeposito(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            
            <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-800 mb-5 text-sm">
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Banco</p>
                <p className="text-white font-mono font-bold text-base">{BANCO}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">CLABE Interbancaria</p>
                <p className="text-amber-400 font-mono font-black text-lg select-all">{CLABE_INTERBANCARIA}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Beneficiario</p>
                <p className="text-white font-mono font-bold">Gonzalo Montero Inda</p>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-amber-500 text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                  <span>💡</span> Concepto (Opcional)
                </p>
                <p className="text-slate-300 font-mono text-xs">Si tu app bancaria te obliga a poner un concepto, te sugerimos usar: <strong className="text-white">Gasto</strong>. Si no lo pide, puedes dejarlo en blanco.</p>
              </div>
            </div>

            <button 
              onClick={notificarDeposito}
              className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(37,211,102,0.3)] flex items-center justify-center gap-2"
            >
              Ya transferí, Notificar por WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* 🚨 ALERTA DE DEUDA */}
      {deudaPesos > 0 && (
        <div className="bg-red-950/40 border border-red-900/60 rounded-2xl p-4 flex justify-between items-center shadow-lg animate-in zoom-in-95">
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl drop-shadow-md">⚠️</span>
            <div>
              <span className="block text-[10px] md:text-xs text-red-400 font-black uppercase tracking-widest">
                Saldo Pendiente
              </span>
              <span className="block text-[8px] md:text-[9px] text-red-500/80 font-bold uppercase tracking-wider mt-0.5">
                Por favor, pasa a liquidar al mostrador
              </span>
            </div>
          </div>
          <span className="text-2xl md:text-3xl font-black text-red-500 tracking-tighter">
            -${deudaPesos.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </span>
        </div>
      )}

      {/* HISTORIAL DE MOVIMIENTOS */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[500px]">
        
        {/* CABECERA Y FILTROS */}
        <div className="bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center p-3 gap-3 shrink-0">
          <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 w-full sm:w-auto">
            <span>📋</span> Historial
          </h3>
          
          <div className="flex w-full sm:w-auto gap-2">
            <select 
              value={filtroTipo} 
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="flex-1 sm:w-36 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase rounded-lg px-2 py-2 focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="todos">Todos los Tipos</option>
              <option value="recargas">Ingresos/Recargas</option>
              <option value="jugadas">Compras/Jugadas</option>
              <option value="premios">Premios</option>
              <option value="creditos">Préstamos y Abonos</option>
            </select>
            
            <select 
              value={filtroFecha} 
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="flex-1 sm:w-36 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase rounded-lg px-2 py-2 focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="todas">Todas las Fechas</option>
              <option value="hoy">Hoy</option>
              <option value="7dias">Últimos 7 días</option>
              <option value="30dias">Últimos 30 días</option>
              <option value="mes">Este Mes</option>
            </select>
          </div>
        </div>
        
        {/* LISTA DE TRANSACCIONES */}
        <div className="p-3 space-y-2 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
          {transaccionesFiltradas.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">
              {transacciones.length === 0 ? 'No tienes movimientos aún.' : 'No hay movimientos con estos filtros.'}
            </div>
          ) : (
            transaccionesFiltradas.map((tx) => {
              const info = interpretarTransaccion(tx.tipo_movimiento, tx.descripcion)
              const esSuma = tx.cantidad > 0
              const esAbono = tx.tipo_movimiento.includes('pago_deuda');
              
              let montoMostrar = Math.abs(tx.cantidad).toLocaleString('es-MX', {minimumFractionDigits: 2});

              if (esAbono && tx.descripcion) {
                const match = tx.descripcion.match(/\$(\d+(\.\d+)?)/);
                if (match) {
                  montoMostrar = Number(match[1]).toLocaleString('es-MX', {minimumFractionDigits: 2});
                }
              }
              
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
                      {tx.descripcion && !['recarga_manual', 'recarga_fiada'].includes(tx.tipo_movimiento) && (
                        <p className="text-[8px] md:text-[10px] text-slate-400/80 italic mt-0.5 max-w-[140px] md:max-w-xs truncate">
                          {tx.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col items-end">
                    <span className={`text-lg md:text-xl font-black ${esAbono ? 'text-emerald-400' : esSuma ? 'text-green-400' : 'text-red-400'}`}>
                      {esAbono ? '✓ ' : (esSuma ? '+' : '-')}${montoMostrar}
                    </span>
                    <span className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                      MXN
                    </span>
                  </div>
                </div>
              )
            })
          )}

          {/* 👇 BOTÓN DE CARGAR MÁS */}
          {hayMas && (
            <div className="pt-2 pb-4 flex justify-center">
              <button 
                onClick={cargarMas}
                disabled={cargandoMas}
                className={`bg-slate-800 border border-slate-700 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  cargandoMas ? 'text-slate-500 cursor-not-allowed' : 'text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 shadow-md'
                }`}
              >
                {cargandoMas ? '⏳ Cargando...' : '👇 Cargar más antiguos'}
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}