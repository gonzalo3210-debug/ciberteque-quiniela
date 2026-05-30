'use client'
import { useState } from 'react'
import ModuloRecargasCaptura from './ModuloRecargasCaptura'
import ModuloJornadasEquipos from './ModuloJornadasEquipos'
import ModuloArbitro from './ModuloArbitro'

export default function AdminPanel({ actualizarSaldoGlobal }: { actualizarSaldoGlobal?: (id: string, nuevo: number) => void }) {
  const [adminVista, setAdminVista] = useState<'recargas' | 'resultados' | 'crear' | 'equipos' | 'captura'>('recargas')

  return (
    <div className="w-full max-w-4xl bg-slate-900/80 p-6 rounded-2xl border border-blue-900/30 mt-8 shadow-2xl animate-in slide-in-from-bottom-4 duration-500 print:bg-transparent print:border-none print:shadow-none print:p-0 print:m-0 print:w-auto">
      
      {/* 1. Quitamos el print:hidden global y hacemos la caja transparente al imprimir */}
      {/* 2. Ocultamos el MENÚ al imprimir */}
      <div className="flex flex-col lg:flex-row justify-between items-center mb-8 border-b border-slate-800 pb-4 gap-4 print:hidden">
        <h2 className="text-2xl font-black text-blue-400 flex items-center gap-2 italic uppercase">
          <span>⚙️</span> CONTROL CIBERTEQUE
        </h2>
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shadow-inner overflow-x-auto w-full lg:w-auto">
          <button onClick={() => setAdminVista('recargas')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'recargas' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>💰 Ventas</button>
          <button onClick={() => setAdminVista('captura')} className={`px-4 py-2 rounded-md font-black text-xs uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1 ${adminVista === 'captura' ? 'bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20' : 'text-amber-500 hover:text-amber-400 hover:bg-slate-800'}`}>⚡ Captura Física</button>
          <button onClick={() => setAdminVista('crear')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'crear' ? 'bg-green-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>➕ Nueva Jornada</button>
          <button onClick={() => setAdminVista('equipos')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'equipos' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>🛡️ Equipos</button>
          <button onClick={() => setAdminVista('resultados')} className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${adminVista === 'resultados' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>⚽ Árbitro / Impresión</button>
        </div>
      </div>

      {/* 🔥 AQUÍ ESTABA EL PROBLEMA: Le quitamos la clase print:hidden a este contenedor */}
      <div>
        {(adminVista === 'recargas' || adminVista === 'captura') && (
          <ModuloRecargasCaptura vista={adminVista} actualizarSaldoGlobal={actualizarSaldoGlobal} />
        )}

        {(adminVista === 'crear' || adminVista === 'equipos') && (
          <ModuloJornadasEquipos vista={adminVista} cambiarVista={setAdminVista} />
        )}
      </div>

      {/* 4. Dejamos libre el ÁRBITRO (Él mismo maneja sus partes ocultas y visibles) */}
      {adminVista === 'resultados' && (
        <ModuloArbitro actualizarSaldoGlobal={actualizarSaldoGlobal} />
      )}

    </div>
  )
}