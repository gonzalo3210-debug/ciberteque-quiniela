'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RegistroUsuario({ onVolverAlLogin }: { onVolverAlLogin?: () => void }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [nip, setNip] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [registroExitoso, setRegistroExitoso] = useState(false)

  const manejarRegistro = async (e: React.FormEvent) => {
    e.preventDefault()

    if (nip.length !== 4 || !/^\d+$/.test(nip)) {
      setMensaje('Error: El NIP debe ser exactamente de 4 números.')
      return
    }

    setMensaje('Registrando...')

    const { error } = await supabase
      .from('usuarios')
      .insert([{ nombre, telefono, nip, rol: 'jugador', creditos_disponibles: 0 }])

    if (error) {
      if (error.code === '23505') {
        setMensaje('Error: Este teléfono ya está registrado.')
      } else {
        setMensaje('Error: ' + error.message)
      }
    } else {
      setRegistroExitoso(true)
      setMensaje('¡Registro exitoso! Redirigiendo...')
      
      // Esperamos 2.5 segundos y volvemos al login
      setTimeout(() => {
        if (onVolverAlLogin) onVolverAlLogin()
      }, 2500)
    }
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-800/60 shadow-2xl w-full max-w-sm mx-auto animate-in zoom-in-95 duration-300">
      
      {registroExitoso ? (
        <div className="py-10 text-center animate-in fade-in zoom-in duration-500">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight italic">¡Bienvenido al Club!</h2>
          <p className="text-green-400 font-bold mt-2 text-xs uppercase tracking-widest">Cuenta creada con éxito</p>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-black text-white mb-5 text-center uppercase tracking-tight italic">Únete al Club</h2>
          
          <form onSubmit={manejarRegistro} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Nombre Completo</label>
              <input 
                type="text" 
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all text-center"
                placeholder="Ej. Juan Pérez"
                required
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Teléfono (WhatsApp)</label>
              <input 
                type="tel" 
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all text-center font-mono tracking-wider"
                placeholder="311 000 0000"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">NIP (4 números)</label>
              <input 
                type="password" 
                inputMode="numeric"
                maxLength={4}
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 tracking-[0.6em] text-center text-sm font-black transition-all"
                placeholder="••••"
                required
              />
            </div>

            <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-3 rounded-xl uppercase text-xs tracking-widest transition-all shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:scale-[1.01] active:scale-95">
              Registrarme ahora
            </button>
          </form>

          {mensaje && (
            <p className="mt-4 text-center text-[10px] font-bold text-blue-400 uppercase tracking-widest bg-blue-950/20 py-2 rounded-lg border border-blue-900/30">
              {mensaje}
            </p>
          )}

          {onVolverAlLogin && (
            <div className="mt-6 border-t border-slate-800 pt-4 text-center">
              <button 
                onClick={onVolverAlLogin}
                className="text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-all"
              >
                Volver al Inicio de Sesión
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}