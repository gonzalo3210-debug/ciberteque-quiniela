'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  extraerCodigoInvitacion,
  guardarCodigoReferido,
  INCENTIVO_NUEVO_TEXTO,
} from '@/lib/invitaciones'
import { fechaCortaEnMazatlan, horaEnMazatlan } from '@/lib/fechaMazatlan'

// 🎉 PÁGINA DE ATERRIZAJE DE INVITACIONES (pública, sin sesión)
// Es la que abre un amigo cuando toca el enlace personal de un
// jugador (/invitar?ref=CODIGO). Si el código es válido lo deja
// guardado en localStorage para que el registro lo recoja como
// referido; un código inválido o ausente simplemente muestra la
// página genérica del Club, sin tronar nada.

interface QuinielaAbierta {
  nombre: string
  modalidad: string
  precio: number
  fechaCierre: string | null
  boletos: number
}

// La fecha_cierre se guarda a veces sin zona; como en el ranking
// público, sin marca de zona se lee como UTC.
function aIsoUtc(fecha: string): string {
  return fecha.includes('Z') || fecha.includes('+') ? fecha : `${fecha}Z`
}

export default function InvitarCliente() {
  const [vieneInvitado, setVieneInvitado] = useState(false)
  const [quiniela, setQuiniela] = useState<QuinielaAbierta | null>(null)
  const [cargando, setCargando] = useState(true)

  // El código del referente: se guarda una sola vez, al llegar.
  useEffect(() => {
    const codigo = extraerCodigoInvitacion(window.location.search)
    if (codigo) {
      guardarCodigoReferido(codigo)
      setVieneInvitado(true)
    }
  }, [])

  // La quiniela abierta más próxima a cerrar (la misma regla que usa
  // la app: abiertas, no solo-admins, la que cierra primero).
  useEffect(() => {
    let viva = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('quinielas')
          .select('id, nombre_jornada, modalidad, precio_ticket, fecha_cierre')
          .eq('estado', 'abierta')
          .neq('solo_admins', true)
          .order('fecha_cierre', { ascending: true })
          .limit(1)
        if (!viva) return
        if (data && data.length > 0) {
          const q = data[0]
          let boletos = 0
          try {
            const { count } = await supabase
              .from('tickets')
              .select('id', { count: 'exact', head: true })
              .eq('quiniela_id', q.id)
            boletos = count ?? 0
          } catch {
            // Sin conteo la tarjeta sale sin bolsa; no truena.
          }
          if (!viva) return
          setQuiniela({
            nombre: q.nombre_jornada,
            modalidad: q.modalidad,
            precio: q.precio_ticket ?? 0,
            fechaCierre: q.fecha_cierre ?? null,
            boletos,
          })
        }
      } catch {
        // Sin conexión la página genérica sigue sirviendo.
      } finally {
        if (viva) setCargando(false)
      }
    })()
    return () => { viva = false }
  }, [])

  const bolsa = quiniela ? quiniela.boletos * quiniela.precio : 0
  const premio = Math.round(bolsa * 0.8)
  const cierreTexto = quiniela?.fechaCierre
    ? `${fechaCortaEnMazatlan(aIsoUtc(quiniela.fechaCierre))} · ${horaEnMazatlan(aIsoUtc(quiniela.fechaCierre))} h`
    : null

  return (
    <div className="min-h-screen bg-slate-950 pb-16 font-sans selection:bg-amber-500 selection:text-slate-900">
      {/* 🏆 ENCABEZADO DEL CLUB */}
      <div className="bg-gradient-to-b from-blue-950 to-slate-950 pt-8 pb-6 px-4 rounded-b-3xl shadow-lg border-b border-blue-900/50 text-center">
        <div className="text-5xl mb-2">⚽</div>
        <h1 className="text-3xl font-black uppercase tracking-widest text-white drop-shadow-md leading-none">
          Club<br />Pronósticos
        </h1>
        <p className="text-blue-400 font-bold uppercase tracking-widest text-[10px] mt-2">
          CiberTeque · Quinielas de fútbol
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 mt-5 space-y-4">
        {vieneInvitado && (
          <div className="bg-green-950/60 border border-green-800 rounded-2xl px-4 py-3 text-center animate-in fade-in zoom-in-95">
            <p className="text-green-400 font-black uppercase tracking-widest text-xs">
              🎉 Te invitó un jugador del Club
            </p>
            <p className="text-slate-400 text-[11px] font-bold mt-1">
              Regístrate con este mismo teléfono y quedas marcado como su invitado.
            </p>
          </div>
        )}

        {/* QUÉ ES EL CLUB */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            ¿Cómo se juega?
          </h2>
          <ul className="space-y-3 text-sm text-slate-300 font-bold leading-snug">
            <li className="flex gap-3">
              <span className="text-xl shrink-0">📝</span>
              <span>Pronosticas los partidos de la jornada: quién gana, empata o el marcador exacto.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-xl shrink-0">🎯</span>
              <span>Cada acierto suma puntos y el ranking se mueve en vivo con los partidos.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-xl shrink-0">🏆</span>
              <span>El mejor de la jornada se lleva el premio: el 80% de la bolsa es para los ganadores.</span>
            </li>
          </ul>
        </div>

        {/* INCENTIVO DE BIENVENIDA */}
        <div className="bg-gradient-to-br from-amber-950/50 to-slate-900 border border-amber-900/50 rounded-3xl p-5 shadow-lg text-center">
          <span className="text-3xl block mb-1">🎟️</span>
          <p className="text-amber-400 font-black uppercase tracking-widest text-sm">
            Precio de bienvenida
          </p>
          <p className="text-slate-300 text-xs font-bold mt-1">
            Como jugador nuevo, {INCENTIVO_NUEVO_TEXTO}.
          </p>
        </div>

        {/* QUINIELA ABIERTA */}
        {cargando ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl h-28 animate-pulse"></div>
        ) : quiniela ? (
          <div className="bg-slate-900/60 border border-blue-900/50 rounded-3xl p-5 shadow-lg">
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">
              🔴 Jornada abierta ahora
            </p>
            <h3 className="text-xl font-black text-white uppercase italic leading-tight">
              {quiniela.modalidad === 'sorteo' ? '🎲 ' : '⚽ '}{quiniela.nombre}
            </h3>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                Boleto: ${quiniela.precio}
              </span>
              {bolsa > 0 && (
                <span className="bg-amber-950/40 border border-amber-900/50 text-amber-400 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  🏆 Premio aprox: ${premio.toLocaleString('es-MX')}
                </span>
              )}
              {cierreTexto && (
                <span className="bg-slate-950/60 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  ⏰ Cierra: {cierreTexto}
                </span>
              )}
            </div>
            {bolsa === 0 && (
              <p className="text-slate-500 text-[11px] font-bold mt-3">
                La bolsa crece con cada boleto: el 80% se reparte en premios.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg text-center">
            <span className="text-3xl block mb-2">🗓️</span>
            <p className="text-slate-300 text-sm font-bold leading-snug">
              Ahorita no hay jornada abierta, pero crea tu cuenta y entras a la que sigue.
              Las jornadas nuevas salen cada semana.
            </p>
          </div>
        )}

        {/* PASOS */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Entrar es así de fácil
          </h2>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="bg-blue-600/20 text-blue-400 rounded-full w-7 h-7 flex items-center justify-center font-black shrink-0 text-sm border border-blue-500/30">1</div>
              <p className="text-xs md:text-sm text-slate-300 font-bold leading-snug pt-1">
                Crea tu cuenta con tu número de WhatsApp y un NIP de 4 números. Sin descargas, todo en el navegador.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="bg-amber-600/20 text-amber-500 rounded-full w-7 h-7 flex items-center justify-center font-black shrink-0 text-sm border border-amber-500/30">2</div>
              <p className="text-xs md:text-sm text-slate-300 font-bold leading-snug pt-1">
                Compra tu primer boleto a mitad de precio ($15) y arma tus pronósticos.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="bg-green-600/20 text-green-500 rounded-full w-7 h-7 flex items-center justify-center font-black shrink-0 text-sm border border-green-500/30">3</div>
              <p className="text-xs md:text-sm text-slate-300 font-bold leading-snug pt-1">
                Sigue los partidos en vivo y, si quedas arriba, el premio cae directo a tu billetera del Club.
              </p>
            </li>
          </ol>
        </div>

        {/* CTA */}
        <a
          href="/"
          className="w-full bg-green-600 hover:bg-green-500 text-white font-black uppercase tracking-widest py-4 rounded-2xl flex justify-center items-center gap-2 transition-transform active:scale-95 shadow-[0_0_20px_rgba(22,163,74,0.35)] text-sm"
        >
          🚀 Crear mi cuenta
        </a>
        <p className="text-center">
          <a href="/" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors">
            ¿Ya tienes cuenta? Inicia sesión
          </a>
        </p>
      </div>
    </div>
  )
}
