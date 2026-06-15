'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login({ onLogin, onSwitchToRegister }: { onLogin: (usuario: any) => void, onSwitchToRegister?: () => void }) {
  const [telefono, setTelefono] = useState('')
  const [nip, setNip] = useState('') 
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // 🔐 DEBE SER IDÉNTICA A LA DEL REGISTRO
  // 🔐 DEBE SER IDÉNTICA EN LOGIN, REGISTRO Y GESTOR DE USUARIOS
  const encriptarNIP = async (pin: string, tel: string) => {
    const textoAEncriptar = `${pin}-${tel}-CiberTequeSeguro2024`
    
    // PLAN B: Si estás probando en red local HTTP desde un celular, el navegador bloquea 'crypto.subtle'.
    // Usamos este hash matemático básico para que la app no truene en tus pruebas locales.
    if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
      let hash = 0;
      for (let i = 0; i < textoAEncriptar.length; i++) {
        const char = textoAEncriptar.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
      }
      return Math.abs(hash).toString(16);
    }

    // PLAN A: Encriptación Militar SHA-256 (Funciona en Producción HTTPS y Localhost)
    const msgUint8 = new TextEncoder().encode(textoAEncriptar)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8) // Añadido window.
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError('')

    try {
      // 1. Buscamos al usuario SOLO por teléfono primero
      const { data: usuario, error: supaError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('telefono', telefono)
        .single()

      if (supaError || !usuario) {
        setError('No existe una cuenta con este número.')
        setCargando(false)
        return
      }

      // 2. Encriptamos el NIP que el usuario acaba de escribir
      const nipEncriptado = await encriptarNIP(nip, telefono)

      // 3. 🧠 LÓGICA DE MIGRACIÓN SILENCIOSA
      if (usuario.nip === nipEncriptado) {
        // CASO A: Usuario moderno. El NIP ya estaba encriptado en BD y coincide.
        onLogin(usuario)
      } 
      else if (usuario.nip === nip) {
        // CASO B: Usuario antiguo. El NIP en la BD es texto plano y coincide.
        // Lo actualizamos silenciosamente a la versión segura en Supabase.
        await supabase
          .from('usuarios')
          .update({ nip: nipEncriptado })
          .eq('id', usuario.id)
        
        // Actualizamos el usuario en memoria y le damos acceso
        const usuarioActualizado = { ...usuario, nip: nipEncriptado }
        onLogin(usuarioActualizado)
      } 
      else {
        // CASO C: NIP incorrecto.
        setError('NIP incorrecto. Verifica tus datos.')
      }

    } catch (err) {
      setError('Error al conectar. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-md p-5 md:p-6 rounded-2xl border border-slate-800/60 shadow-2xl w-full max-w-sm mx-auto animate-in zoom-in-95 duration-300">
      <h2 className="text-xl md:text-2xl font-black text-white mb-5 text-center uppercase tracking-tight italic">
        Inicia Sesión
      </h2>
      
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Tu número de WhatsApp
          </label>
          <input
            type="tel"
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-center font-mono tracking-wider"
            placeholder="Ej. 3110000000"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            NIP (4 dígitos)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            value={nip}
            onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 tracking-[0.6em] text-center text-sm font-black transition-all"
            placeholder="••••"
          />
        </div>

        {error && (
          <p className="text-red-400 text-[10px] font-bold uppercase tracking-tight text-center bg-red-950/20 border border-red-900/30 py-1.5 rounded-lg animate-pulse">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className={`w-full font-black uppercase text-xs tracking-widest py-3 px-4 rounded-xl transition-all ${
            cargando 
              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:scale-[1.01] active:scale-95'
          }`}
        >
          {cargando ? 'Verificando...' : 'Entrar a jugar'}
        </button>

        {onSwitchToRegister && (
          <div className="border-t border-slate-800/60 pt-4 mt-2 text-center space-y-2">
            <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              ¿No tienes cuenta todavía?
            </p>
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="w-full bg-slate-950 hover:bg-slate-900 border border-blue-900/40 hover:border-blue-500/50 text-blue-400 hover:text-blue-300 font-black uppercase text-[10px] tracking-widest py-2.5 px-4 rounded-xl transition-all shadow-inner transform active:scale-95"
            >
              ✨ Regístrate aquí
            </button>
          </div>
        )}
      </form>
    </div>
  )
}