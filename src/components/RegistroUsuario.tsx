'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { extraerNacionalMX, telefonoCanonicoMX, formasGuardadasMX, esMismoNumeroMX } from '@/lib/telefono'

export default function RegistroUsuario({ onVolverAlLogin }: { onVolverAlLogin?: () => void }) {
  const [nombre, setNombre] = useState('')
  const [codigoPais, setCodigoPais] = useState('+52') 
  const [telefono, setTelefono] = useState('')
  const [nip, setNip] = useState('')
  const [nipConfirm, setNipConfirm] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [registroExitoso, setRegistroExitoso] = useState(false)
  
  // 👁️ NUEVO ESTADO
  const [mostrarNip, setMostrarNip] = useState(false)

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

  const manejarRegistro = async (e: React.FormEvent) => {
    e.preventDefault()

    if (nip.length !== 4 || !/^\d+$/.test(nip)) {
      setMensaje('Error: El NIP debe ser exactamente de 4 números.')
      return
    }

    if (nip !== nipConfirm) {
      setMensaje('Error: Los NIP no coinciden. Escríbelo igual en los dos campos.')
      return
    }

    // Normalización: un solo formato oficial de guardado, venga como venga el número.
    const codigoLimpio = codigoPais.trim() === '+' ? '+52' : codigoPais.trim()
    let telefonoFinal = ''

    if (codigoLimpio === '+52') {
      const nacional = extraerNacionalMX(telefono)
      if (!nacional) {
        setMensaje('Error: Ingresa un número de teléfono válido (10 dígitos).')
        return
      }
      telefonoFinal = telefonoCanonicoMX(nacional)
    } else {
      const telLimpio = telefono.replace(/\D/g, '')
      if (telLimpio.length < 10) {
        setMensaje('Error: Ingresa un número de teléfono válido (10 dígitos).')
        return
      }
      telefonoFinal = `${codigoLimpio}${telLimpio}`
    }

    setMensaje('Asegurando datos y registrando...')

    try {
      // Freno a duplicados: si el número ya tiene cuenta en CUALQUIER formato
      // histórico (con +52, sin +, con espacios/paréntesis, etc.) no se crea otra.
      if (codigoLimpio === '+52') {
        const nacional = telefonoFinal.slice(3)
        const { data: coincidencias } = await supabase
          .from('usuarios')
          .select('id')
          .in('telefono', formasGuardadasMX(nacional))
          .limit(1)

        let yaExiste = !!(coincidencias && coincidencias.length > 0)

        if (!yaExiste) {
          // Último recurso: revisar los números guardados con formatos viejos
          // (espacios, paréntesis) que una búsqueda exacta no encuentra.
          const { data: todos } = await supabase.from('usuarios').select('telefono')
          if (todos) {
            yaExiste = todos.some((u: any) => esMismoNumeroMX(u.telefono || '', nacional))
          }
        }

        if (yaExiste) {
          setMensaje('Error: Este número ya tiene una cuenta. Si ya jugabas antes, inicia sesión con tu NIP o pide ayuda por WhatsApp para recuperarla.')
          return
        }
      }

      const nipEncriptado = await encriptarNIP(nip, telefonoFinal)
      const { error } = await supabase
        .from('usuarios')
        .insert([{ 
          nombre: nombre.trim(), 
          telefono: telefonoFinal, 
          nip: nipEncriptado, 
          rol: 'jugador', 
          creditos_disponibles: 0 
        }])

      if (error) {
        if (error.code === '23505') {
          setMensaje('Error: Este teléfono ya está registrado.')
        } else {
          setMensaje('Error: ' + error.message)
        }
      } else {
        setRegistroExitoso(true)
        setMensaje('¡Registro exitoso! Redirigiendo...')
        setTimeout(() => {
          if (onVolverAlLogin) onVolverAlLogin()
        }, 2500)
      }
    } catch (err) {
      console.error("Error de encriptación:", err)
      setMensaje('Error interno al procesar la seguridad de tu cuenta.')
    }
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-800/60 shadow-2xl w-full max-w-sm mx-auto animate-in zoom-in-95 duration-300">
      
      {registroExitoso ? (
        <div className="py-10 text-center animate-in fade-in zoom-in duration-500">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight italic">¡Bienvenido al Club!</h2>
          <p className="text-green-400 font-bold mt-2 text-xs uppercase tracking-widest">Cuenta creada y asegurada</p>
          <p className="text-slate-400 font-bold mt-3 text-[10px] uppercase tracking-widest">Entra con tu número de WhatsApp y tu NIP</p>
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
                  value={telefono}
                  maxLength={13}
                  onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))} 
                  className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all text-center font-mono tracking-wider"
                  placeholder="311 000 0000"
                  required
                />
              </div>
              <p className="text-[8px] text-slate-500 mt-1 text-center font-bold uppercase">Escríbelo como sea: el sistema lo ordena solo.</p>
            </div>

            <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-blue-300 font-bold uppercase tracking-wider text-center leading-relaxed">
                🔐 Tu NIP es tu contraseña de 4 números para entrar a tu cuenta.
                Elige uno que recuerdes y no lo compartas con nadie.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">NIP (4 números)</label>
              {/* 👁️ CONTENEDOR RELATIVO PARA EL BOTÓN DE MOSTRAR NIP */}
              <div className="relative">
                <input 
                  type={mostrarNip ? "text" : "password"} 
                  inputMode="numeric"
                  maxLength={4}
                  value={nip}
                  onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 tracking-[0.6em] text-center text-sm font-black transition-all pr-10"
                  placeholder="••••"
                  required
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

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Confirma tu NIP</label>
              <input 
                type={mostrarNip ? "text" : "password"} 
                inputMode="numeric"
                maxLength={4}
                value={nipConfirm}
                onChange={(e) => setNipConfirm(e.target.value.replace(/\D/g, ''))} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 tracking-[0.6em] text-center text-sm font-black transition-all"
                placeholder="••••"
                required
              />
              <p className="text-[8px] text-slate-500 mt-1 text-center font-bold uppercase">Tu NIP se guarda cifrado: nadie puede verlo, ni el administrador. Si lo olvidas, te ayudamos a restablecerlo por WhatsApp.</p>
            </div>

            <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-3 rounded-xl uppercase text-xs tracking-widest transition-all shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:scale-[1.01] active:scale-95">
              Registrarme ahora
            </button>
          </form>

          {mensaje && (
            <p className={`mt-4 text-center text-[10px] font-bold uppercase tracking-widest py-2 rounded-lg border ${mensaje.includes('Error') ? 'bg-red-950/20 border-red-900/30 text-red-400' : 'bg-blue-950/20 border-blue-900/30 text-blue-400'}`}>
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
