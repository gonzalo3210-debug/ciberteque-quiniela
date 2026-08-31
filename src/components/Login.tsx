'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function Login({ onLogin, onSwitchToRegister }: { onLogin?: (usuario: any) => void, onSwitchToRegister?: () => void }) {
  const [codigoPais, setCodigoPais] = useState('+52') 
  const [telefono, setTelefono] = useState('')
  const [nip, setNip] = useState('') 
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  
  const [mostrarNip, setMostrarNip] = useState(false)
  const [intentosFallidos, setIntentosFallidos] = useState(0)
  const [captcha, setCaptcha] = useState({ num1: 0, num2: 0, res: 0 })
  const [respuestaCaptcha, setRespuestaCaptcha] = useState('')

  const { login } = useAuth()

  const generarCaptcha = () => {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    setCaptcha({ num1: n1, num2: n2, res: n1 + n2 });
    setRespuestaCaptcha('');
  }

  const encriptarNIP = async (pin: string, tel: string) => {
    const textoAEncriptar = `${pin}-${tel}-CiberTequeSeguro2024`
    
    if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
      let hash = 0;
      for (let i = 0; i < textoAEncriptar.length; i++) {
        const char = textoAEncriptar.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
      }
      return Math.abs(hash).toString(16);
    }

    const msgUint8 = new TextEncoder().encode(textoAEncriptar)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // 🆘 NUEVO: Función para pedir ayuda por WhatsApp al administrador
  const solicitarRecuperacionNip = () => {
    const telLimpio = telefono.replace(/\D/g, '')
    const mensaje = telLimpio.length === 10
      ? `Hola, soy el número ${telLimpio}. Olvidé mi NIP de acceso en Club Pronósticos, ¿me ayudas a restablecerlo?`
      : `Hola, olvidé mi NIP de acceso en Club Pronósticos, ¿me ayudas a restablecerlo?`
    
    // Conecta directo a tu número de administración
    window.open(`https://wa.me/523118776263?text=${encodeURIComponent(mensaje)}`, '_blank')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (intentosFallidos >= 5) {
      if (parseInt(respuestaCaptcha) !== captcha.res) {
        setError('Respuesta de seguridad incorrecta. Intenta de nuevo.')
        generarCaptcha() 
        return
      }
    }

    setCargando(true)
    setError('')

    try {
      const telLimpio = telefono.replace(/\D/g, '')
      const codigoLimpio = codigoPais.trim() === '+' ? '+52' : codigoPais.trim()
      const telefonoInternacional = `${codigoLimpio}${telLimpio}` 
      
      let { data: usuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('telefono', telefonoInternacional)
        .single()

      let esUsuarioLegacy = false;

      if (!usuario && codigoLimpio === '+52') {
        const { data: usuarioAntiguo } = await supabase
          .from('usuarios')
          .select('*')
          .eq('telefono', telLimpio)
          .single()
          
        if (usuarioAntiguo) {
          usuario = usuarioAntiguo;
          esUsuarioLegacy = true;
        }
      }

      if (!usuario) {
        setError('No existe una cuenta con este número.')
        setCargando(false)
        return
      }

      const hashFormatoNuevo = await encriptarNIP(nip, telefonoInternacional)
      const hashFormatoAntiguo = await encriptarNIP(nip, telLimpio)

      const nipEsCorrecto = (usuario.nip === hashFormatoNuevo) || (usuario.nip === hashFormatoAntiguo) || (usuario.nip === nip)

      if (!nipEsCorrecto) {
        const nuevosIntentos = intentosFallidos + 1;
        setIntentosFallidos(nuevosIntentos);
        
        if (nuevosIntentos === 5) {
          generarCaptcha();
        }
        
        if (nuevosIntentos >= 5) {
          setError('Demasiados intentos. Resuelve la suma por seguridad.')
          generarCaptcha() 
        } else {
          setError(`NIP incorrecto. Te quedan ${5 - nuevosIntentos} intentos.`)
        }
        
        setCargando(false)
        return
      }

      setIntentosFallidos(0)

      if (esUsuarioLegacy || usuario.nip !== hashFormatoNuevo) {
        await supabase
          .from('usuarios')
          .update({ 
            telefono: telefonoInternacional, 
            nip: hashFormatoNuevo 
          })
          .eq('id', usuario.id)
        
        usuario.telefono = telefonoInternacional;
        usuario.nip = hashFormatoNuevo;
      }

      login(usuario) 
      if (onLogin) onLogin(usuario) 

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
          <div className="flex gap-2">
            <input 
              type="text"
              value={codigoPais}
              maxLength={4}
              onChange={(e) => {
                const lada = e.target.value.replace(/\D/g, '')
                setCodigoPais('+' + lada)
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-1 py-2.5 text-xs text-slate-300 outline-none focus:border-blue-500 w-[60px] text-center shrink-0 font-mono tracking-wider"
              placeholder="+52"
              required
            />
            <input
              type="tel"
              required
              maxLength={10}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
              className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-center font-mono tracking-wider"
              placeholder="Ej. 3110000000"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              NIP (4 dígitos)
            </label>
            {/* 🆘 BOTÓN DE OLVIDÉ MI NIP */}
            <button 
              type="button" 
              onClick={solicitarRecuperacionNip}
              className="text-[9px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider transition-colors"
            >
              ¿Lo olvidaste?
            </button>
          </div>
          
          <div className="relative">
            <input
              type={mostrarNip ? "text" : "password"}
              inputMode="numeric"
              maxLength={4}
              required
              value={nip}
              onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 tracking-[0.6em] text-center text-sm font-black transition-all pr-10"
              placeholder="••••"
            />
            <button
              type="button"
              onClick={() => setMostrarNip(!mostrarNip)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-lg"
              title={mostrarNip ? "Ocultar NIP" : "Mostrar NIP"}
            >
              {mostrarNip ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {intentosFallidos >= 5 && (
          <div className="bg-slate-950 p-4 rounded-xl border border-red-900/50 shadow-inner animate-in slide-in-from-top-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-red-400 mb-2 text-center">
              Protección de Seguridad
            </label>
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-white bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 shrink-0 shadow-md">
                {captcha.num1} + {captcha.num2} =
              </span>
              <input
                type="number"
                required
                value={respuestaCaptcha}
                onChange={(e) => setRespuestaCaptcha(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500 text-center font-black"
                placeholder="?"
              />
            </div>
          </div>
        )}

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