'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RegistroUsuario() {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [nip, setNip] = useState('') // Nuevo estado para el NIP
  const [mensaje, setMensaje] = useState('')

  const manejarRegistro = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validar que el NIP sea exactamente de 4 dígitos numéricos
    if (nip.length !== 4 || !/^\d+$/.test(nip)) {
      setMensaje('Error: El NIP debe ser exactamente de 4 números.')
      return
    }

    setMensaje('Registrando...')

    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ nombre, telefono, nip, rol: 'jugador', creditos_disponibles: 0 }]) // Agregamos el nip a la base de datos

    if (error) {
      // Si el error es porque el teléfono ya existe
      if (error.code === '23505') {
        setMensaje('Error: Este teléfono ya está registrado.')
      } else {
        setMensaje('Error: ' + error.message)
      }
    } else {
      setMensaje('¡Te has registrado con éxito! Suerte ⚽')
      setNombre('')
      setTelefono('')
      setNip('') // Limpiamos el NIP
    }
  }

  return (
    <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
      <h2 className="text-2xl font-bold mb-6 text-center">Únete a la Quiniela</h2>
      <form onSubmit={manejarRegistro} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre Completo</label>
          <input 
            type="text" 
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-blue-500 outline-none"
            placeholder="Ej. Juan Pérez"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Teléfono (WhatsApp)</label>
          <input 
            type="tel" 
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-blue-500 outline-none"
            placeholder="311 000 0000"
            required
          />
        </div>
        {/* Nuevo campo para el NIP */}
        <div>
          <label className="block text-sm font-medium mb-1">Crea un NIP (4 números)</label>
          <input 
            type="password" 
            inputMode="numeric"
            maxLength={4}
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            className="w-full p-2 rounded bg-slate-900 border border-slate-600 focus:border-blue-500 outline-none tracking-widest text-center text-lg font-bold"
            placeholder="****"
            required
          />
          <p className="text-xs text-slate-400 mt-1">Este NIP será tu contraseña secreta para entrar.</p>
        </div>
        <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors">
          Registrarme ahora
        </button>
      </form>
      {mensaje && <p className="mt-4 text-center text-sm text-blue-400">{mensaje}</p>}
    </div>
  )
}