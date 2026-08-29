'use client'
import React, { createContext, useContext, useState, useEffect } from 'react';

// Estructura basada en tu tabla 'usuarios'
interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: string;
  avatar_url?: string;
}

interface AuthContextType {
  usuario: UsuarioSesion | null;
  cargandoSesion: boolean;
  login: (datosUsuario: UsuarioSesion) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true); // UX: Estado de carga inicial

  useEffect(() => {
    // Solo leemos el localStorage UNA VEZ al cargar la app
    const inicializarSesion = () => {
      try {
        const sesionGuardada = localStorage.getItem('usuarioActivo') || localStorage.getItem('user');
        if (sesionGuardada) {
          const parsed = JSON.parse(sesionGuardada);
          if (parsed && parsed.id) {
            setUsuario(parsed);
          }
        }
      } catch (error) {
        console.error("Error leyendo sesión:", error);
      } finally {
        setCargandoSesion(false);
      }
    };

    inicializarSesion();
  }, []);

  const login = (datosUsuario: UsuarioSesion) => {
    setUsuario(datosUsuario);
    localStorage.setItem('usuarioActivo', JSON.stringify(datosUsuario));
  };

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem('usuarioActivo');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ usuario, cargandoSesion, login, logout }}>
      {/* UX: Loader global invisible o suave mientras decide si hay sesión */}
      {cargandoSesion ? (
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
          <div className="animate-spin text-4xl">⚽</div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

// Custom hook modular para consumir la sesión en cualquier componente
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}