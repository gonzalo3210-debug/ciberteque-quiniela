'use client'
import { useState, useMemo } from 'react'
import { useGestorUsuarios } from '@/hooks/useGestorUsuarios'

type SortField = 'saldo' | 'juegan' | 'inversion' | 'promos' | null;

export default function GestorUsuarios() {
  const { usuarios, cargando, actualizarUsuario, resetearNIP } = useGestorUsuarios()
  
  const [busqueda, setBusqueda] = useState('')
  const [ordenActivo, setOrdenActivo] = useState<SortField>('saldo')

  const [editandoUser, setEditandoUser] = useState<any>(null)
  const [resetNipUser, setResetNipUser] = useState<any>(null)
  const [nuevoNip, setNuevoNip] = useState('')
  const [procesando, setProcesando] = useState(false)

  // 🧠 Lógica de Filtrado y Búsqueda Dinámica
  const usuariosMostrados = useMemo(() => {
    let filtrados = [...usuarios]

    if (busqueda) {
      const b = busqueda.toLowerCase()
      filtrados = filtrados.filter(u => u.nombre.toLowerCase().includes(b) || u.telefono.includes(b))
    }

    // 🔥 Ordenamiento actualizado para usar la suma de la billetera
    switch (ordenActivo) {
      case 'saldo': filtrados.sort((a, b) => (b.billeteraActual || 0) - (a.billeteraActual || 0)); break;
      case 'juegan': filtrados.sort((a, b) => b.ticketsJugados - a.ticketsJugados); break;
      case 'inversion': filtrados.sort((a, b) => b.dineroIngresadoAprox - a.dineroIngresadoAprox); break;
      case 'promos': filtrados.sort((a, b) => b.premiosGanadosCreditos - a.premiosGanadosCreditos); break;
      default: filtrados.sort((a, b) => (b.billeteraActual || 0) - (a.billeteraActual || 0)); break;
    }

    return filtrados
  }, [usuarios, busqueda, ordenActivo])

  const manejarOrden = (columna: SortField) => {
    setOrdenActivo(columna);
  }

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
      
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl flex justify-between items-center">
        <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
          <span>👥</span> Base de Jugadores 
        </h2>
        <span className="text-xs text-slate-500 font-bold bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">Total: {usuarios.length}</span>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="p-3 w-64">
                  <div className="flex flex-col gap-2">
                    <span className="ml-1 text-slate-300 font-black">Jugador / Búsqueda</span>
                    <input 
                      type="text" 
                      placeholder="🔍 Buscar nombre o WA..." 
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500 placeholder:text-slate-600 transition-colors"
                    />
                  </div>
                </th>
                <th 
                  onClick={() => manejarOrden('saldo')} 
                  className={`p-3 text-center cursor-pointer hover:bg-slate-800/50 transition-colors align-bottom pb-4 ${ordenActivo === 'saldo' ? 'text-green-400 bg-slate-900' : ''}`}
                  title="Ordenar por billetera"
                >
                  <div className="flex flex-col items-center justify-end h-full gap-1">
                    <span>💰 Billetera (MXN)</span>
                    {ordenActivo === 'saldo' && <span className="text-[8px] text-green-500">▼ MÁS A MENOS</span>}
                  </div>
                </th>
                <th 
                  onClick={() => manejarOrden('juegan')} 
                  className={`p-3 text-center cursor-pointer hover:bg-slate-800/50 transition-colors align-bottom pb-4 ${ordenActivo === 'juegan' ? 'text-green-400 bg-slate-900' : ''}`}
                  title="Ordenar por actividad"
                >
                  <div className="flex flex-col items-center justify-end h-full gap-1">
                    <span>🎟️ Boletos Jugados</span>
                    {ordenActivo === 'juegan' && <span className="text-[8px] text-green-500">▼ MÁS A MENOS</span>}
                  </div>
                </th>
                <th 
                  onClick={() => manejarOrden('inversion')} 
                  className={`p-3 text-center cursor-pointer hover:bg-slate-800/50 transition-colors align-bottom pb-4 ${ordenActivo === 'inversion' ? 'text-green-400 bg-slate-900' : ''}`}
                  title="Ordenar por inversión"
                >
                  <div className="flex flex-col items-center justify-end h-full gap-1">
                    <span>💵 Dinero Ingresado</span>
                    {ordenActivo === 'inversion' && <span className="text-[8px] text-green-500">▼ MÁS A MENOS</span>}
                  </div>
                </th>
                <th 
                  onClick={() => manejarOrden('promos')} 
                  className={`p-3 text-center cursor-pointer hover:bg-slate-800/50 transition-colors align-bottom pb-4 ${ordenActivo === 'promos' ? 'text-green-400 bg-slate-900' : ''}`}
                  title="Ordenar por premios"
                >
                  <div className="flex flex-col items-center justify-end h-full gap-1">
                    <span>🎁 Promocionales</span>
                    {ordenActivo === 'promos' && <span className="text-[8px] text-green-500">▼ MÁS A MENOS</span>}
                  </div>
                </th>
                <th className="p-3 text-right align-bottom pb-4">Ajustes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {usuariosMostrados.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-3">
                    <div className="font-black text-white text-xs uppercase pl-1">{u.nombre}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 font-bold pl-1">📱 {u.telefono}</div>
                  </td>
                  <td className={`p-3 text-center ${ordenActivo === 'saldo' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-black text-lg text-green-400 drop-shadow-md">
                      ${(u.billeteraActual || 0).toFixed(2)} <span className="text-[10px] text-green-600">MXN</span>
                    </span>
                  </td>
                  <td className={`p-3 text-center ${ordenActivo === 'juegan' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-bold text-slate-300 text-base">{u.ticketsJugados}</span>
                    <span className="text-[9px] text-slate-500 block uppercase">Tickets</span>
                  </td>
                  <td className={`p-3 text-center ${ordenActivo === 'inversion' ? 'bg-slate-900/30' : ''}`}>
                    <span className="font-black text-amber-400 text-base drop-shadow-md">
                      ${(u.dineroIngresadoAprox || 0).toFixed(2)} <span className="text-[10px] text-amber-600">MXN</span>
                    </span>
                    <span className="text-[9px] text-slate-500 block font-bold">Total Ingresado</span>
                  </td>
                  <td className={`p-3 text-center ${ordenActivo === 'promos' ? 'bg-slate-900/30' : ''}`}>
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
            <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No se encontraron usuarios con esos datos.</div>
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