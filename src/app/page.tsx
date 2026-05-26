'use client'
import { useState, useEffect } from 'react'
import RegistroUsuario from '@/components/RegistroUsuario'
import Cartelera from '@/components/Cartelera'
import Login from '@/components/Login'
import MisJugadas from '@/components/MisJugadas'
import AdminPanel from '@/components/AdminPanel'
import Posiciones from '@/components/Posiciones'
import MiBilletera from '@/components/MiBilletera'
import Perfil from '@/components/Perfil' // 🔥 IMPORTAMOS EL NUEVO COMPONENTE

export default function Home() {
  const [usuarioActivo, setUsuarioActivo] = useState<any>(null)
  const [vista, setVista] = useState<'login' | 'registro'>('login')
  // 🔥 AÑADIMOS 'perfil' a los tipos de la pestaña
  const [pestana, setPestana] = useState<'jugar' | 'historial' | 'admin' | 'ranking' | 'billetera' | 'perfil'>('jugar')
  const [cargandoSesion, setCargandoSesion] = useState(true)

  // 1. LA MAGIA DE LA MEMORIA: Recuperamos usuario y pestaña al abrir/recargar
  useEffect(() => {
    // Recuperar usuario
    const sesionGuardada = localStorage.getItem('club_pronosticos_usuario')
    if (sesionGuardada) {
      setUsuarioActivo(JSON.parse(sesionGuardada))
    }
    
    // Recuperar última pestaña visitada para evitar que te regrese al inicio si se recarga la página
    const pestanaGuardada = localStorage.getItem('club_pronosticos_pestana')
    if (pestanaGuardada) {
      setPestana(pestanaGuardada as any)
    }

    setCargandoSesion(false)
  }, [])

  // FUNCIÓN NUEVA: Cambia la pestaña y la guarda en la memoria del navegador
  const cambiarPestana = (nuevaPestana: 'jugar' | 'historial' | 'admin' | 'ranking' | 'billetera' | 'perfil') => {
    setPestana(nuevaPestana)
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
    localStorage.removeItem('club_pronosticos_usuario')
    localStorage.removeItem('club_pronosticos_pestana') // Limpiamos la pestaña al salir
    setPestana('jugar')
  }

  // 4. ACTUALIZAR SALDO
  const manejarActualizacionSaldo = (idUsuarioModificado: string, nuevoSaldo: number) => {
    if (usuarioActivo && usuarioActivo.id === idUsuarioModificado) {
      const usuarioActualizado = { ...usuarioActivo, creditos_disponibles: nuevoSaldo }
      setUsuarioActivo(usuarioActualizado)
      localStorage.setItem('club_pronosticos_usuario', JSON.stringify(usuarioActualizado))
    }
  }

  if (cargandoSesion) {
    return <main className="flex min-h-screen bg-slate-950 items-center justify-center"><div className="text-blue-500 font-bold animate-pulse">Cargando el Club...</div></main>
  }

  return (
    <main className="flex min-h-screen flex-col items-center py-12 px-6 bg-slate-950 text-white selection:bg-blue-500/30">
      
      <div className="text-center mb-12">
        <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-700 drop-shadow-[0_0_15px_rgba(37,99,235,0.4)]">
          CLUB PRONÓSTICOS
        </h1>
        <p className="text-slate-500 mt-3 text-lg font-medium tracking-wide uppercase">
          Demuestra que eres el que más sabe de fútbol
        </p>
      </div>

      {usuarioActivo ? (
        <div className="w-full max-w-5xl flex flex-col items-center animate-in fade-in duration-700">
          
          <div className="bg-slate-900/60 backdrop-blur-md px-8 py-4 rounded-full mb-8 border border-slate-800 text-sm flex flex-wrap gap-6 justify-center items-center shadow-2xl">
            <span className="text-slate-400 uppercase tracking-widest text-xs font-bold">
              Jugador: <strong className="text-white ml-1">{usuarioActivo.nombre}</strong>
            </span>
            <span className="h-4 w-[1px] bg-slate-800"></span>
            <span className="text-slate-400 uppercase tracking-widest text-xs font-bold">
              Créditos: <strong className="text-green-400 text-xl ml-1 drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]">{usuarioActivo.creditos_disponibles}</strong>
            </span>
            <span className="h-4 w-[1px] bg-slate-800"></span>
            <button 
              onClick={cerrarSesion} 
              className="text-red-500 hover:text-red-400 font-black uppercase text-xs tracking-tighter transition-all hover:scale-110 active:scale-95"
            >
              Cerrar Sesión
            </button>
          </div>

          <div className="flex flex-wrap bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 mb-10 w-full max-w-4xl shadow-2xl">
            {/* 🔥 BOTÓN DEL PERFIL */}
            <button 
              onClick={() => cambiarPestana('perfil')}
              className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                pestana === 'perfil' 
                ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)]' 
                : 'text-purple-500/70 hover:text-purple-400'
              }`}
            >
              👤 Mi Perfil
            </button>

            <button 
              onClick={() => cambiarPestana('jugar')}
              className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                pestana === 'jugar' 
                ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Jugar
            </button>
            <button 
              onClick={() => cambiarPestana('historial')}
              className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                pestana === 'historial' 
                ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Mis Jugadas
            </button>

            <button 
              onClick={() => cambiarPestana('ranking')}
              className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                pestana === 'ranking' 
                ? 'bg-amber-600 text-white shadow-[0_0_20px_rgba(217,119,6,0.4)]' 
                : 'text-amber-500/70 hover:text-amber-400'
              }`}
            >
              🏆 Ranking
            </button>

            <button 
              onClick={() => cambiarPestana('billetera')}
              className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                pestana === 'billetera' 
                ? 'bg-green-600 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)]' 
                : 'text-green-500/70 hover:text-green-400'
              }`}
            >
              💳 Billetera
            </button>
            
            {usuarioActivo.rol === 'admin' && (
              <button 
                onClick={() => cambiarPestana('admin')}
                className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                  pestana === 'admin' 
                  ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]' 
                  : 'text-red-500/40 hover:text-red-400'
                }`}
              >
                Admin
              </button>
            )}
          </div>

          <div className="w-full flex justify-center pb-20">
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

            {pestana === 'billetera' && (
              <MiBilletera usuarioId={usuarioActivo.id} />
            )}

            {/* 🔥 RENDERIZAMOS EL COMPONENTE PERFIL */}
            {pestana === 'perfil' && (
              <Perfil usuarioActivo={usuarioActivo} />
            )}
            
            {pestana === 'admin' && usuarioActivo.rol === 'admin' && (
              <AdminPanel 
                actualizarSaldoGlobal={manejarActualizacionSaldo}
              />
            )}
          </div>
          
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in duration-500">
          {vista === 'login' ? (
            <>
              <Login onLogin={iniciarSesion} />
              <p className="mt-8 text-slate-500 text-sm font-medium">
                ¿No tienes cuenta todavía?{' '}
                <button onClick={() => setVista('registro')} className="text-blue-500 hover:text-blue-400 underline underline-offset-4 font-bold ml-1">
                  Regístrate aquí
                </button>
              </p>
            </>
          ) : (
            <>
              <RegistroUsuario />
              <p className="mt-8 text-slate-500 text-sm font-medium">
                ¿Ya eres parte del club?{' '}
                <button onClick={() => setVista('login')} className="text-blue-500 hover:text-blue-400 underline underline-offset-4 font-bold ml-1">
                  Inicia sesión aquí
                </button>
              </p>
            </>
          )}
        </div>
      )}
    </main>
  )
}