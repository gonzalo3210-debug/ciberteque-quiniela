'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  enlaceInvitacion,
  textoWhatsAppInvitacion,
  enlaceCompartirWhatsApp,
} from '@/lib/invitaciones'

// 📣 TARJETA "INVITA A TUS AMIGOS" (Mi Perfil)
// Cada jugador tiene un enlace personal (el código sale de su id,
// ver src/lib/invitaciones.ts) para invitar amigos por WhatsApp.
// La quiniela abierta solo personaliza el texto del mensaje; sin
// jornada abierta se manda el texto genérico del Club.
export default function TarjetaInvitacion({ usuarioActivo }: { usuarioActivo: any }) {
  const [enlace, setEnlace] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [jornada, setJornada] = useState<{ nombre: string; precio: number | null } | null>(null)

  useEffect(() => {
    if (!usuarioActivo?.id) return
    setEnlace(enlaceInvitacion(window.location.origin, usuarioActivo.id))
  }, [usuarioActivo?.id])

  // La quiniela abierta más próxima a cerrar, solo para el texto.
  useEffect(() => {
    let viva = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('quinielas')
          .select('nombre_jornada, precio_ticket')
          .eq('estado', 'abierta')
          .neq('solo_admins', true)
          .order('fecha_cierre', { ascending: true })
          .limit(1)
        if (viva && data && data.length > 0) {
          setJornada({
            nombre: data[0].nombre_jornada,
            precio: data[0].precio_ticket ?? null,
          })
        }
      } catch {
        // Sin jornada el texto genérico basta; la tarjeta no truena.
      }
    })()
    return () => { viva = false }
  }, [])

  if (!enlace) return null

  const texto = textoWhatsAppInvitacion({
    enlace,
    nombreJornada: jornada?.nombre,
    precioBoleto: jornada?.precio,
  })

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
    } catch {
      // Respaldo para navegadores sin clipboard API (contextos no seguros).
      const area = document.createElement('textarea')
      area.value = enlace
      document.body.appendChild(area)
      area.select()
      try { document.execCommand('copy') } catch { /* se queda el enlace visible para copiarlo a mano */ }
      document.body.removeChild(area)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
      <div className="absolute -right-6 -top-6 text-8xl md:text-9xl opacity-5 pointer-events-none select-none">📣</div>

      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2 relative z-10">
        <span>📣</span> Invita a tus amigos
      </h3>
      <p className="text-slate-400 text-xs leading-relaxed mb-4 relative z-10">
        Mándales tu enlace personal: al registrarse quedan marcados como invitados tuyos
        y su primer boleto les sale a mitad de precio ($15). Entre más jugadores, más grande la bolsa. 🏆
      </p>

      <div className="flex flex-col sm:flex-row gap-2 relative z-10">
        <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-[11px] md:text-xs text-blue-300 font-mono truncate flex items-center" title={enlace}>
          {enlace}
        </div>
        <button
          onClick={copiarEnlace}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
        >
          {copiado ? '✅ ¡Copiado!' : '📋 Copiar'}
        </button>
        <a
          href={enlaceCompartirWhatsApp(texto)}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(22,163,74,0.3)]"
        >
          <span>💬</span> Compartir por WhatsApp
        </a>
      </div>
    </div>
  )
}
