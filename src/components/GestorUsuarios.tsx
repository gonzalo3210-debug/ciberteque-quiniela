'use client'
import { useState, useMemo } from 'react'
import { useGestorUsuarios } from '@/hooks/useGestorUsuarios'

export default function GestorUsuarios() {
  const { usuarios, cargando, actualizarUsuario, resetearNIP } = useGestorUsuarios()
  
  const [busqueda, setBusqueda] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'saldo' | 'juegan' | 'inversion' | 'promos'>('saldo')

  const [editandoUser, setEditandoUser] = useState<any>(null)
  const [resetNipUser, setResetNipUser] = useState<any>(null)
  const [nuevoNip, setNuevoNip] = useState('')
  const [procesando, setProcesando] = useState(false)

  // 🧠 Lógica de Filtrado y Búsqueda
  const usuariosMostrados = useMemo(() => {
    let filtrados = [...usuarios]

    if (busqueda) {
      const b = busqueda.toLowerCase()
      filtrados = filtrados.filter(u => u.nombre.toLowerCase().includes(b) || u.telefono.includes(b))
    }

    // 2. Aplicar Ordenamiento con las nuevas métricas
    switch (filtroActivo) {
      case 'saldo': filtrados.sort((a, b) => (b.creditos_disponibles || 0) - (a.creditos_disponibles || 0)); break;
      case 'juegan': filtrados.sort((a, b) => b.ticketsJugados - a.ticketsJugados); break;
      case 'inversion': filtrados.sort((a, b) => b.dineroIngresadoAprox - a.dineroIngresadoAprox); break;
      case 'promos': filtrados.sort((a, b) => b.premiosGanadosCreditos - a.premiosGanadosCreditos); break;
      default: filtrados.sort((a, b) => (b.creditos_disponibles || 0) - (a.creditos_disponibles || 0)); break;
    }

    return filtrados
  }, [usuarios, busqueda, filtroActivo])

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcesando(true)
    await actualizarUsuario(editandoUser.id, editandoUser.nombre, editandoUser.telefono)
    setProcesando(false)
    setEditandoUser(null)
  }

  const aplicarResetNip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nuevoNip.length !== 4) return alert("El NIP debe ser de 4 dígitos")
    setProcesando(true)
    const exito = await resetearNIP(resetNipUser.id, resetNipUser.telefono, nuevoNip)
    setProcesando(false)
    if (exito) {
      alert("NIP actualizado exitosamente.")
      setResetNipUser(null)
      setNuevoNip('')
    } else {
      alert("Error al actualizar NIP")
    }
  }

  if (cargando) return <div className="text-center mt-10 text-amber-500 font-bold animate-pulse uppercase tracking-widest">Calculando Estadísticas VIP...</div>

  return (
    <div className="w-full max-w-6xl mx-auto mt-2 animate-in fade-in duration-500 mb-20 space-y-4">
      
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span>👥</span> Base de Jugadores <span className="text-xs text-slate-500 font-bold bg-slate-950 px-2 py-1 rounded">Total: {usuarios.length}</span>
          </h2>
          <input 
            type="text" 
            placeholder="🔍 Buscar por nombre o WhatsApp..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full md:w-72 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
          {[
            { id: 'saldo', label: '💰 Más Saldo' },
            { id: 'juegan', label: '🎟️ Más Juegan' },
            { id: 'inversion', label: '💵 Mayor Inversión' }, // Renombrado
            { id: 'promos', label: '🎁 Ganadores Promos' } // Renombrado
          ].map(f => (
            <button 
              key={f.id}
              onClick={() => setFiltroActivo(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filtroActivo === f.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-500 hover:text-slate-300'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="p-3">Jugador</th>
                <th className={`p-3 text-center transition-colors ${filtroActivo === 'saldo' ? 'text-blue-400 bg-slate-900' : ''}`}>
                  💰 Billetera Actual
                </th>
                <th className={`p-3 text-center transition-colors ${filtroActivo === 'juegan' ? 'text-blue-400 bg-slate-900' : ''}`}>
                  🎟️ Boletos Jugados
                </th>
                <th className={`p-3 text-center transition-colors ${filtroActivo === 'inversion' ? 'text-blue-400 bg-slate-900' : ''}`}>
                  💵 Dinero Ingresado
                </th>
                <th className={`p-3 text-center transition-colors ${filtroActivo === 'promos' ? 'text-blue-400 bg-slate-900' : ''}`}>
                  🎁 Premios Promocionales
                </th>
                <th className="p-3 text-right">Ajustes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {usuariosMostrados.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-3">
                    <div className="font-black text-white text-xs uppercase">{u.nombre}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 font-bold">📱 {u.telefono}</div>
                  </td>
                  <td className={`p-3 text-center ${filtroActivo === 'saldo' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-black text-lg text-green-400">{u.creditos_disponibles || 0} <span className="text-[10px] text-green-600 uppercase">Crd</span></span>
                    <span className="text-[9px] text-amber-500 block font-bold uppercase mt-0.5">Saldo: ${u.saldo_pesos?.toFixed(2) || '0.00'}</span>
                  </td>
                  <td className={`p-3 text-center ${filtroActivo === 'juegan' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-bold text-slate-300 text-base">{u.ticketsJugados}</span>
                    <span className="text-[9px] text-slate-500 block uppercase">Tickets</span>
                  </td>
                  <td className={`p-3 text-center ${filtroActivo === 'inversion' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-black text-amber-400 text-base drop-shadow-md">
                      ${u.dineroIngresadoAprox} <span className="text-[10px] text-amber-600">MXN</span>
                    </span>
                    <span className="text-[9px] text-slate-500 block font-bold">Aprox. en caja</span>
                  </td>
                  <td className={`p-3 text-center ${filtroActivo === 'promos' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-black text-purple-400 text-base">{u.premiosGanadosCreditos}</span>
                    <span className="text-[9px] text-purple-600/80 block uppercase font-bold">Créditos Ganados</span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditandoUser(u)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-blue-400 transition-colors" title="Editar Nombre/Teléfono">✏️</button>
                      <button onClick={() => setResetNipUser(u)} className="p-2 bg-slate-800 hover:bg-red-900/50 rounded border border-slate-700 text-red-400 transition-colors" title="Resetear NIP de Seguridad">🔑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usuariosMostrados.length === 0 && (
            <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No se encontraron usuarios.</div>
          )}
        </div>
      </div>

      {/* MODAL: EDITAR USUARIO */}
      {editandoUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm animate-in zoom-in-95">
            <h3 className="text-white font-black uppercase tracking-widest border-b border-slate-800 pb-3 mb-4">✏️ Editar Usuario</h3>
            <form onSubmit={guardarEdicion} className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Nombre</label>
                <input type="text" value={editandoUser.nombre} onChange={e => setEditandoUser({...editandoUser, nombre: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-sm" required />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">WhatsApp</label>
                <input type="tel" value={editandoUser.telefono} onChange={e => setEditandoUser({...editandoUser, telefono: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-sm" required />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditandoUser(null)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-400 font-bold text-xs uppercase">Cancelar</button>
                <button type="submit" disabled={procesando} className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-black text-xs uppercase disabled:opacity-50">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESETEAR NIP */}
      {resetNipUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5 w-full max-w-sm animate-in zoom-in-95">
            <h3 className="text-red-400 font-black uppercase tracking-widest border-b border-red-900/30 pb-3 mb-4 flex items-center gap-2">
              <span>⚠️</span> Zona de Seguridad
            </h3>
            <p className="text-[10px] text-slate-400 mb-4 font-bold leading-tight">
              Estás a punto de forzar el cambio de NIP para el usuario <span className="text-white uppercase">{resetNipUser.nombre}</span>. El nuevo NIP se encriptará automáticamente.
            </p>
            <form onSubmit={aplicarResetNip} className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Nuevo NIP (4 Dígitos)</label>
                <input 
                  type="text" 
                  maxLength={4}
                  value={nuevoNip} 
                  onChange={e => setNuevoNip(e.target.value.replace(/\D/g, ''))} 
                  className="w-full bg-slate-950 border border-red-900/50 rounded-lg p-2 text-white text-center font-black tracking-[0.5em]" 
                  placeholder="Ej. 1234"
                  required 
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setResetNipUser(null)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-400 font-bold text-xs uppercase">Cancelar</button>
                <button type="submit" disabled={procesando || nuevoNip.length !== 4} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase disabled:opacity-50">Cambiar NIP</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}