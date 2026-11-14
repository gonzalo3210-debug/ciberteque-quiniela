'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase' // 🔥 IMPORTAMOS SUPABASE PARA LA SINCRONIZACIÓN
import RegistroUsuario from '@/components/RegistroUsuario'
import Cartelera from '@/components/Cartelera'
import Login from '@/components/Login'
import MisJugadas from '@/components/MisJugadas'
import AdminPanel from '@/components/AdminPanel'
import Posiciones from '@/components/Posiciones'
import SeccionPartidos from '@/components/SeccionPartidos'
import SeccionNoticias from '@/components/SeccionNoticias'
import MiBilletera from '@/components/MiBilletera'
import Perfil from '@/components/Perfil'
import ModuloFinanzas from '@/components/ModuloFinanzas'
// 👇 IMPORTAMOS EL NUEVO GESTOR DE USUARIOS (Ajusta la ruta si lo guardaste en admin/)
import GestorUsuarios from '@/components/GestorUsuarios'
// 🔔 Importamos el Centro de Notificaciones
import CentroNotificaciones from '@/components/CentroNotificaciones'

type Pestana = 'jugar' | 'historial' | 'admin' | 'ranking' | 'noticias' | 'partidos' | 'billetera' | 'perfil' | 'finanzas' | 'usuarios'

export default function Home() {
  const [usuarioActivo, setUsuarioActivo] = useState<any>(null)
  const [vista, setVista] = useState<'login' | 'registro'>('login')

  // 👇 Agregamos 'usuarios' a las opciones posibles
  const [pestana, setPestana] = useState<Pestana>('jugar')
  const [cargandoSesion, setCargandoSesion] = useState(true)

  // 🧭 Carcasa nueva (rediseño tipo 365Scores, 2026-11-14): la navegación
  // principal son DOS secciones en la barra inferior — Quiniela y
  // Partidos. `pestana` sigue siendo la vista concreta; la sección se
  // deriva de ella y se recuerda la última vista de Quiniela para
  // volver a ella al tocar "Quiniela".
  const [ultimaVistaQuiniela, setUltimaVistaQuiniela] = useState<Pestana>('jugar')
  const seccion: 'quiniela' | 'partidos' = pestana === 'partidos' ? 'partidos' : 'quiniela'

  // 👤 Submenú del botón de perfil en la barra superior
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false)
  const menuPerfilRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickFuera = (event: MouseEvent) => {
      if (menuPerfilRef.current && !menuPerfilRef.current.contains(event.target as Node)) {
        setMenuPerfilAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFuera)
    return () => document.removeEventListener('mousedown', handleClickFuera)
  }, [])

  // 1. LA MAGIA DE LA MEMORIA + SINCRONIZACIÓN SILENCIOSA
  useEffect(() => {
    const sesionGuardada = localStorage.getItem('club_pronosticos_usuario')
    if (sesionGuardada) {
      const usuarioLocal = JSON.parse(sesionGuardada)
      setUsuarioActivo(usuarioLocal)

      // 🔥 Sincronización silenciosa con la Base de Datos
      const refrescarDatos = async () => {
        try {
          const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', usuarioLocal.id)
            .single()

          if (data && !error) {
            setUsuarioActivo(data)
            localStorage.setItem('club_pronosticos_usuario', JSON.stringify(data))
          }
        } catch (err) {
          console.error("Error al sincronizar usuario:", err)
        }
      }
      refrescarDatos()
    }

    // Recuperar última pestaña
    const pestanaGuardada = localStorage.getItem('club_pronosticos_pestana')
    if (pestanaGuardada) {
      // La vieja pestaña 'tabla' (Tabla Liga MX) ahora es la sección 'partidos'
      const restaurada = (pestanaGuardada === 'tabla' ? 'partidos' : pestanaGuardada) as Pestana
      setPestana(restaurada)
      if (restaurada !== 'partidos') setUltimaVistaQuiniela(restaurada)
    }

    setCargandoSesion(false)
  }, [])

  // FUNCIÓN NUEVA: Cambia la pestaña y la guarda en la memoria
  const cambiarPestana = (nuevaPestana: Pestana) => {
    setPestana(nuevaPestana)
    if (nuevaPestana !== 'partidos') setUltimaVistaQuiniela(nuevaPestana)
    localStorage.setItem('club_pronosticos_pestana', nuevaPestana)
  }

  // 2. FUNCIÓN DE LOGIN
  const iniciarSesion = (user: any) => {
    setUsuarioActivo(user)
    localStorage.setItem('club_pronosticos_usuario', JSON.stringify(user))
  }

  // 3. FUNCIÓN DE LOGOUT
  const cerrarSesion = () => {
    setUsuarioActivo(null)
    setMenuPerfilAbierto(false)
    localStorage.removeItem('club_pronosticos_usuario')
    localStorage.removeItem('club_pronosticos_pestana')
    setPestana('jugar')
    setUltimaVistaQuiniela('jugar')
  }

  // 4. ACTUALIZAR SALDO
  const manejarActualizacionSaldo = (idUsuarioModificado: string, nuevoSaldo: number) => {
    if (usuarioActivo && usuarioActivo.id === idUsuarioModificado) {
      const usuarioActualizado = { ...usuarioActivo, creditos_disponibles: nuevoSaldo }
      setUsuarioActivo(usuarioActualizado)
      localStorage.setItem('club_pronosticos_usuario', JSON.stringify(usuarioActualizado))
    }
  }

  // 5. ACTUALIZAR CUALQUIER DATO DEL USUARIO (COMO LA FOTO DE PERFIL)
  const manejarCambiosUsuario = (idUsuarioModificado: string, nuevosDatos: any) => {
    if (usuarioActivo && usuarioActivo.id === idUsuarioModificado) {
      const usuarioActualizado = { ...usuarioActivo, ...nuevosDatos }
      setUsuarioActivo(usuarioActualizado)
      localStorage.setItem('club_pronosticos_usuario', JSON.stringify(usuarioActualizado))
    }
  }

  if (cargandoSesion) {
    return <main className="flex min-h-screen bg-slate-950 items-center justify-center"><div className="text-blue-500 font-bold animate-pulse">Cargando el Club...</div></main>
  }

  // 💳 Saldo de la billetera (mismo total que muestra Mi Billetera:
  // créditos disponibles + saldo en pesos)
  const saldoTotal = usuarioActivo
    ? Number(usuarioActivo.creditos_disponibles || 0) + Number(usuarioActivo.saldo_pesos || 0)
    : 0
  const avatarUrl = usuarioActivo
    ? usuarioActivo.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(usuarioActivo.nombre || 'User')}&background=1e293b&color=3b82f6&size=100&bold=true`
    : ''

  // Estilo de los ítems del submenú de la sección Quiniela: misma franja
  // lineal de pestañas del panel de administrador (AdminPanel) — ítem
  // activo como pastilla rellena, inactivos solo texto
  const claseTab = (activa: boolean, clasesActivo: string) =>
    `shrink-0 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
      activa ? clasesActivo : 'text-slate-500 hover:text-slate-300'
    }`

  return (
    <main className="flex min-h-screen flex-col items-center py-4 px-6 bg-slate-950 text-white selection:bg-blue-500/30 relative">

      {usuarioActivo ? (
        <>
          {/* ══════════ BARRA SUPERIOR FIJA ══════════ */}
          <header className="fixed top-0 inset-x-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800/70 print:hidden">
            <div className="mx-auto w-full max-w-5xl flex items-center gap-2 px-3 py-2">

              {/* 👤 Perfil con submenú */}
              <div className="relative shrink-0" ref={menuPerfilRef}>
                <button
                  onClick={() => setMenuPerfilAbierto((v) => !v)}
                  title="Mi cuenta"
                  className="block w-10 h-10 rounded-full overflow-hidden border-2 border-slate-700 hover:border-blue-500 transition-all"
                >
                  <img src={avatarUrl} alt={usuarioActivo.nombre || 'Mi perfil'} className="w-full h-full object-cover" />
                </button>

                {menuPerfilAbierto && (
                  <div className="absolute left-0 top-full mt-2 w-60 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden animate-in slide-in-from-top-2 origin-top-left z-50">
                    <div className="px-4 py-3 bg-slate-950 border-b border-slate-800">
                      <p className="font-black text-white text-sm truncate">{usuarioActivo.nombre || 'Jugador'}</p>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        {usuarioActivo.rol === 'admin' ? 'Administrador' : 'Jugador'}
                      </p>
                    </div>
                    <button
                      onClick={() => { setMenuPerfilAbierto(false); cambiarPestana('perfil') }}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      👤 Mi Perfil
                    </button>
                    <button
                      disabled
                      title="Disponible pronto"
                      className="w-full text-left px-4 py-3 text-sm font-bold text-slate-500 cursor-not-allowed flex items-center justify-between"
                    >
                      <span>🌐 Cambiar idioma</span>
                      <span className="text-[9px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">Pronto</span>
                    </button>
                    <div className="border-t border-slate-800">
                      <button
                        onClick={cerrarSesion}
                        className="w-full text-left px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                      >
                        🚪 Cerrar sesión
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Logo de la app (el mismo asset del icono PWA) */}
              <div className="flex items-center gap-2.5 min-w-0">
                <img src="/icon-192x192.png" alt="Club Pronósticos" className="w-9 h-9 rounded-xl shrink-0" />
                <span className="font-black tracking-tighter text-lg leading-none text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-700 truncate">
                  CLUB PRONÓSTICOS
                </span>
              </div>

              {/* 💳 Saldo → Billetera · 🔔 Notificaciones */}
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <button
                  onClick={() => cambiarPestana('billetera')}
                  title="Mi Billetera"
                  className={`px-3.5 py-2 rounded-full font-black text-sm transition-all ${
                    pestana === 'billetera'
                      ? 'bg-green-600 text-white shadow-[0_0_16px_rgba(22,163,74,0.45)]'
                      : 'bg-slate-900 border border-green-800/60 text-green-400 hover:border-green-500'
                  }`}
                >
                  ${saldoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
                <CentroNotificaciones integrada />
              </div>
            </div>
          </header>

          <div className="w-full max-w-5xl flex flex-col items-center animate-in fade-in duration-700 pt-16">

            {/* ── Submenú de la sección QUINIELA: franja lineal de pestañas
                estilo panel de administrador, deslizable si no cabe ── */}
            {seccion === 'quiniela' && (
              <div className="w-full mb-8 print:hidden">
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shadow-inner overflow-x-auto w-full">
                  <button onClick={() => cambiarPestana('jugar')} className={claseTab(pestana === 'jugar', 'bg-blue-600 text-white shadow-md')}>
                    Jugar
                  </button>
                  <button onClick={() => cambiarPestana('historial')} className={claseTab(pestana === 'historial', 'bg-blue-600 text-white shadow-md')}>
                    Mis Jugadas
                  </button>
                  <button onClick={() => cambiarPestana('ranking')} className={claseTab(pestana === 'ranking', 'bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20')}>
                    🏆 Ranking
                  </button>
                  <button onClick={() => cambiarPestana('noticias')} className={claseTab(pestana === 'noticias', 'bg-sky-600 text-white shadow-md')}>
                    📰 Noticias
                  </button>
                  <button onClick={() => cambiarPestana('billetera')} className={claseTab(pestana === 'billetera', 'bg-green-600 text-white shadow-md')}>
                    💳 Billetera
                  </button>
                  <button onClick={() => cambiarPestana('perfil')} className={claseTab(pestana === 'perfil', 'bg-purple-600 text-white shadow-md')}>
                    👤 Mi Perfil
                  </button>

                  {/* Accesos de administrador (solo rol admin), en la misma franja */}
                  {usuarioActivo.rol === 'admin' && (
                    <>
                      <button onClick={() => cambiarPestana('admin')} className={claseTab(pestana === 'admin', 'bg-red-600 text-white shadow-md')}>
                        ⚙️ Panel
                      </button>
                      <button onClick={() => cambiarPestana('finanzas')} className={claseTab(pestana === 'finanzas', 'bg-emerald-600 text-white shadow-md')}>
                        📊 Finanzas
                      </button>
                      <button onClick={() => cambiarPestana('usuarios')} className={claseTab(pestana === 'usuarios', 'bg-teal-600 text-white shadow-md')}>
                        👥 Usuarios
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="w-full flex justify-center pb-28">
              {pestana === 'jugar' && (
                <Cartelera
                  usuarioActivo={usuarioActivo}
                  actualizarSaldo={(nuevo) => manejarActualizacionSaldo(usuarioActivo.id, nuevo)}
                />
              )}

              {pestana === 'historial' && (
                <MisJugadas usuarioId={usuarioActivo.id} />
              )}

              {pestana === 'ranking' && (
                <Posiciones />
              )}

              {pestana === 'noticias' && (
                <SeccionNoticias />
              )}

              {pestana === 'partidos' && (
                <SeccionPartidos />
              )}

              {pestana === 'billetera' && (
                <MiBilletera usuarioId={usuarioActivo.id} />
              )}

              {pestana === 'perfil' && (
                <Perfil
                  usuarioActivo={usuarioActivo}
                  onUpdate={(nuevosDatos) => manejarCambiosUsuario(usuarioActivo.id, nuevosDatos)}
                />
              )}

              {pestana === 'admin' && usuarioActivo.rol === 'admin' && (
                <AdminPanel
                  actualizarSaldoGlobal={manejarActualizacionSaldo}
                />
              )}

              {pestana === 'finanzas' && usuarioActivo.rol === 'admin' && (
                <ModuloFinanzas />
              )}

              {/* 👇 RENDERIZADO DEL GESTOR DE USUARIOS (CRM) */}
              {pestana === 'usuarios' && usuarioActivo.rol === 'admin' && (
                <GestorUsuarios />
              )}
            </div>
          </div>

          {/* ══════════ BARRA INFERIOR: 2 SECCIONES ══════════ */}
          <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/90 backdrop-blur border-t border-slate-800/70 print:hidden">
            <div className="mx-auto w-full max-w-5xl grid grid-cols-2 gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => cambiarPestana(ultimaVistaQuiniela)}
                className={`py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                  seccion === 'quiniela'
                    ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🎯 Quiniela
              </button>
              <button
                onClick={() => cambiarPestana('partidos')}
                className={`py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                  seccion === 'partidos'
                    ? 'bg-cyan-600 text-white shadow-[0_0_20px_rgba(8,145,178,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⚽ Partidos
              </button>
            </div>
          </nav>
        </>
      ) : (
        <>
          {/* 🔔 ENCABEZADO CON CAMPANITA FIJA EN LA ESQUINA SUPERIOR DERECHA */}
          <div className="w-full max-w-5xl flex items-center justify-between mb-4 relative px-2">
            <div className="w-10"></div> {/* Espaciador izquierdo para equilibrar */}

            <div className="text-center flex-1">
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-700 drop-shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                CLUB PRONÓSTICOS
              </h1>
              <p className="text-slate-500 mt-2 text-sm md:text-lg font-medium tracking-wide uppercase">
                Demuestra que eres el que más sabe de fútbol
              </p>
            </div>

            {/* Campana posicionada estéticamente en la esquina superior derecha */}
            <div className="absolute right-0 top-0">
              <CentroNotificaciones />
            </div>
          </div>

          <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in duration-500 mt-6">
            {/* 🔥 SECCIÓN DE LOGIN/REGISTRO ACTUALIZADA CON LAS FUNCIONES CONECTADAS */}
            {vista === 'login' ? (
              <Login
                onLogin={iniciarSesion}
                onSwitchToRegister={() => setVista('registro')}
              />
            ) : (
              <RegistroUsuario
                onVolverAlLogin={() => setVista('login')}
              />
            )}
          </div>
        </>
      )}
    </main>
  )
}
