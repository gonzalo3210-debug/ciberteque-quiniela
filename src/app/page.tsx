'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase' // 🔥 IMPORTAMOS SUPABASE PARA LA SINCRONIZACIÓN
import RegistroUsuario from '@/components/RegistroUsuario'
import Cartelera from '@/components/Cartelera'
import Login from '@/components/Login'
import MisJugadas from '@/components/MisJugadas'
import AdminPanel from '@/components/AdminPanel'
import Posiciones from '@/components/Posiciones'
import MiBilletera from '@/components/MiBilletera'
import Perfil from '@/components/Perfil'
import ModuloFinanzas from '@/components/ModuloFinanzas' // 👈 IMPORTAMOS EL NUEVO MÓDULO

export default function Home() {
  const [usuarioActivo, setUsuarioActivo] = useState<any>(null)
  const [vista, setVista] = useState<'login' | 'registro'>('login')
  // 👇 Agregamos 'finanzas' a las opciones posibles
  const [pestana, setPestana] = useState<'jugar' | 'historial' | 'admin' | 'ranking' | 'billetera' | 'perfil' | 'finanzas'>('jugar')
  const [cargandoSesion, setCargandoSesion] = useState(true)

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
      setPestana(pestanaGuardada as any)
    }

    setCargandoSesion(false)
  }, [])

  // FUNCIÓN NUEVA: Cambia la pestaña y la guarda en la memoria
  const cambiarPestana = (nuevaPestana: 'jugar' | 'historial' | 'admin' | 'ranking' | 'billetera' | 'perfil' | 'finanzas') => {
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
    localStorage.removeItem('club_pronosticos_pestana')
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

  return (
    <main className="flex min-h-screen flex-col items-center py-4 px-6 bg-slate-950 text-white selection:bg-blue-500/30">
      
      <div className="text-center mb-4">
        <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-700 drop-shadow-[0_0_15px_rgba(37,99,235,0.4)]">
          CLUB PRONÓSTICOS
        </h1>
        <p className="text-slate-500 mt-3 text-lg font-medium tracking-wide uppercase">
          Demuestra que eres el que más sabe de fútbol
        </p>
      </div>

      {usuarioActivo ? (
        <div className="w-full max-w-5xl flex flex-col items-center animate-in fade-in duration-700">
          
          <div className="flex flex-wrap gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/50 mb-10 w-full max-w-5xl shadow-2xl">
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
            
            {/* BOTONES EXCLUSIVOS DE ADMINISTRADOR */}
            {usuarioActivo.rol === 'admin' && (
              <>
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
                
                <button 
                  onClick={() => cambiarPestana('finanzas')}
                  className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                    pestana === 'finanzas' 
                    ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(5,150,105,0.4)]' 
                    : 'text-emerald-500/40 hover:text-emerald-400'
                  }`}
                >
                  📊 Finanzas
                </button>
              </>
            )}

            {/* BOTÓN DE SALIR INTEGRADO AL MENÚ */}
            <button 
              onClick={cerrarSesion} 
              className="flex-1 sm:flex-none sm:ml-auto min-w-[100px] px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap text-red-500 hover:text-white hover:bg-red-600 flex items-center justify-center gap-2"
            >
              <span>🚪</span> Salir
            </button>
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

            {/* 👇 RENDERIZADO DEL DASHBOARD FINANCIERO PROTEGIDO */}
            {pestana === 'finanzas' && usuarioActivo.rol === 'admin' && (
              <ModuloFinanzas />
            )}
          </div>
          
        </div>
      ) : (
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
      )}
    </main>
  )
}