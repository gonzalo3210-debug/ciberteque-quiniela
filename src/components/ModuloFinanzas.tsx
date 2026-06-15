'use client'
import { useFinanzas } from '@/hooks/useFinanzas'

export default function ModuloFinanzas() {
  // Conectamos nuestro hook de lógica de negocio
  const { cargando, mensajeError, metricas, jornadas, cargarDatosFinancieros } = useFinanzas();

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <span className="text-4xl mb-4">📊</span>
        <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Calculando Estados Financieros...</p>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-500 w-full max-w-5xl mx-auto space-y-6">
      
      {/* ENCABEZADO */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl md:text-2xl font-black uppercase text-white tracking-tight flex items-center gap-2">
            <span>📈</span> Dashboard Financiero
          </h2>
          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Cifras Globales e Históricas</p>
        </div>
        <button onClick={cargarDatosFinancieros} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 border border-slate-700 shadow-sm">
          🔄 Refrescar Datos
        </button>
      </div>

      {/* ALERTA DE ERROR */}
      {mensajeError && (
        <div className="bg-red-950/40 border border-red-900 text-red-400 p-4 rounded-xl flex items-start gap-3 shadow-lg animate-in zoom-in-95">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="font-black uppercase text-[10px] tracking-widest mb-1">Error de Conexión</h3>
            <p className="text-xs font-mono">{mensajeError}</p>
          </div>
        </div>
      )}

      {/* MÉTRICAS PRINCIPALES (TARJETAS) */}
      {!mensajeError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-gradient-to-br from-green-950/40 to-slate-900 p-5 rounded-2xl border border-green-900/50 relative overflow-hidden shadow-lg">
            <div className="absolute -right-4 -top-4 opacity-10 text-6xl">💰</div>
            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest block mb-1 relative z-10">Utilidad Neta</span>
            <span className="text-3xl font-black text-white relative z-10">${metricas.utilidadNeta.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
            <p className="text-[8px] text-slate-400 uppercase font-bold mt-2 relative z-10">Tu ganancia real (20% de comisiones)</p>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-blue-900/40 relative overflow-hidden shadow-lg">
            <div className="absolute -right-4 -top-4 opacity-10 text-6xl">💵</div>
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1 relative z-10">Ingreso Bruto (Caja)</span>
            <span className="text-2xl font-black text-slate-200 relative z-10">${metricas.ingresoBruto.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
            <p className="text-[8px] text-slate-500 uppercase font-bold mt-2 relative z-10">Dinero físico total que ha entrado</p>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-red-900/30 relative overflow-hidden shadow-lg">
            <div className="absolute -right-4 -top-4 opacity-10 text-6xl">🎟️</div>
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block mb-1 relative z-10">Pasivos (Créditos)</span>
            <span className="text-2xl font-black text-slate-200 relative z-10">${metricas.pasivosCreditos.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
            <p className="text-[8px] text-slate-500 uppercase font-bold mt-2 relative z-10">Deuda virtual en cuentas de usuarios</p>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-amber-900/40 relative overflow-hidden shadow-lg">
            <div className="absolute -right-4 -top-4 opacity-10 text-6xl">🪙</div>
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-1 relative z-10">Saldo Retenido ($)</span>
            <span className="text-2xl font-black text-slate-200 relative z-10">${metricas.saldoRetenido.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
            <p className="text-[8px] text-slate-500 uppercase font-bold mt-2 relative z-10">Cambio guardado en monederos</p>
          </div>
        </div>
      )}

      {/* TABLA DE RENDIMIENTO POR JORNADA */}
      {!mensajeError && (
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">🏆 Rendimiento por Jornada</h3>
            <span className="bg-slate-800 text-slate-400 text-[9px] px-2 py-1 rounded font-bold uppercase">Histórico</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-500 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="p-3 border-b border-slate-800 font-bold">Jornada</th>
                  <th className="p-3 border-b border-slate-800 text-center font-bold">Estado</th>
                  <th className="p-3 border-b border-slate-800 text-center font-bold">Boletos</th>
                  <th className="p-3 border-b border-slate-800 text-right font-bold">Recaudado</th>
                  <th className="p-3 border-b border-slate-800 text-right font-bold">Premios</th>
                  <th className="p-3 border-b border-slate-800 text-right font-black text-green-500">Tu Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jornadas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                      Aún no hay jornadas registradas.
                    </td>
                  </tr>
                ) : (
                  jornadas.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-bold text-white uppercase truncate max-w-[150px]">{j.nombre}</td>
                      <td className="p-3 text-center">
                        <span className={`text-[8px] font-black uppercase px-2 py-1 rounded border ${j.estado === 'abierta' ? 'bg-amber-950/30 text-amber-500 border-amber-900/50' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>
                          {j.estado}
                        </span>
                      </td>
                      <td className="p-3 text-center font-black text-slate-300">{j.boletos}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-400">${j.recaudacion}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-500/80">${j.premio}</td>
                      <td className="p-3 text-right font-black text-green-400 bg-green-950/10">
                        ${j.utilidad}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}