'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login({ onLogin }: { onLogin: (usuario: any) => void }) {
  const [telefono, setTelefono] = useState('')
  const [nip, setNip] = useState('') // Nuevo estado para el NIP
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError('')

    try {
      const { data, error: supaError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('telefono', telefono)
        .eq('nip', nip) // Ahora exigimos que el NIP también coincida
        .single()

      if (supaError || !data) {
        // Por seguridad, damos un error genérico (no decimos si falló el número o el NIP)
        setError('Teléfono o NIP incorrectos. Verifica tus datos.')
        setCargando(false)
        return
      }

      // Si el usuario existe y el NIP es correcto, lo dejamos pasar
      onLogin(data)

    } catch (err) {
      setError('Error al conectar. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-xl w-full max-w-md">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Inicia Sesión</h2>
      
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">
            Tu número de WhatsApp
          </label>
          <input
            type="tel"
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Ej. 3110000000"
          />
        </div>

        {/* Nueva cajita para pedir el NIP */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">
            NIP (4 dígitos)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 tracking-widest text-center text-lg font-bold"
            placeholder="****"
          />
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className={`w-full font-bold py-3 px-4 rounded-lg transition-all ${
            cargando 
              ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50'
          }`}
        >
          {cargando ? 'Verificando...' : 'Entrar a jugar'}
        </button>
      </form>
    </div>
  )
}