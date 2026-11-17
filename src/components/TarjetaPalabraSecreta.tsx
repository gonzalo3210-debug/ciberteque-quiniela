'use client';

// src/components/TarjetaPalabraSecreta.tsx
//
// Sección "🔐 Palabra secreta" de Mi Perfil: crear o cambiar la
// palabra con la que el jugador puede recuperar su acceso solo
// (número + palabra secreta → NIP nuevo, desde la pantalla de
// acceso). La palabra se guarda con hash (src/lib/recuperacion.ts)
// y NUNCA se muestra de vuelta: para cambiarla hay que escribir la
// actual.
//
// Si la migración (2026-11-17-recuperacion-nip.sql) aún no se
// corre, la consulta de la columna falla y la tarjeta simplemente
// NO se muestra: Mi Perfil queda exactamente como antes.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  COLUMNA_PALABRA_SECRETA,
  COLUMNA_INTENTOS_RECUPERACION,
  COLUMNA_BLOQUEO_RECUPERACION,
  hashPalabraSecreta,
  normalizarPalabraSecreta,
  palabraSecretaCoincide,
  palabraSecretaValida,
  esErrorColumnaRecuperacion,
} from '@/lib/recuperacion';

export default function TarjetaPalabraSecreta({ usuarioActivo }: { usuarioActivo: any }) {
  const [cargando, setCargando] = useState(true);
  const [disponible, setDisponible] = useState(false);
  const [tienePalabra, setTienePalabra] = useState(false);
  const [hashActual, setHashActual] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [palabraActual, setPalabraActual] = useState('');
  const [palabraNueva, setPalabraNueva] = useState('');
  const [palabraConfirm, setPalabraConfirm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [esError, setEsError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      if (!usuarioActivo?.id) {
        setCargando(false);
        return;
      }
      const { data, error } = await supabase
        .from('usuarios')
        .select(COLUMNA_PALABRA_SECRETA)
        .eq('id', usuarioActivo.id)
        .single();
      if (!vivo) return;
      if (error) {
        setDisponible(false);
      } else {
        setDisponible(true);
        const hash = (data as any)?.[COLUMNA_PALABRA_SECRETA];
        const valido = typeof hash === 'string' && hash.length > 0;
        setHashActual(valido ? hash : null);
        setTienePalabra(valido);
      }
      setCargando(false);
    };
    cargar();
    return () => {
      vivo = false;
    };
  }, [usuarioActivo?.id]);

  const guardar = async () => {
    setMensaje('');
    if (!palabraSecretaValida(palabraNueva)) {
      setEsError(true);
      setMensaje('Tu palabra secreta debe tener al menos 4 letras o números.');
      return;
    }
    if (normalizarPalabraSecreta(palabraNueva) !== normalizarPalabraSecreta(palabraConfirm)) {
      setEsError(true);
      setMensaje('La palabra nueva no coincide en los dos campos.');
      return;
    }
    if (tienePalabra) {
      const coincide = await palabraSecretaCoincide(palabraActual, usuarioActivo.id, hashActual);
      if (!coincide) {
        setEsError(true);
        setMensaje('Tu palabra actual no coincide.');
        return;
      }
    }
    setGuardando(true);
    try {
      const hash = await hashPalabraSecreta(palabraNueva, usuarioActivo.id);
      const { error } = await supabase
        .from('usuarios')
        .update({
          [COLUMNA_PALABRA_SECRETA]: hash,
          [COLUMNA_INTENTOS_RECUPERACION]: 0,
          [COLUMNA_BLOQUEO_RECUPERACION]: null,
        })
        .eq('id', usuarioActivo.id);
      if (error) {
        setEsError(true);
        setMensaje(
          esErrorColumnaRecuperacion(error)
            ? 'Esta función se está activando. Inténtalo más tarde.'
            : 'No se pudo guardar. Inténtalo de nuevo.'
        );
        return;
      }
      setHashActual(hash);
      setTienePalabra(true);
      setEditando(false);
      setPalabraActual('');
      setPalabraNueva('');
      setPalabraConfirm('');
      setEsError(false);
      setMensaje('✅ Tu palabra secreta quedó guardada.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando || !disponible) return null;

  const inputCls =
    'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-center';

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3 border-b border-slate-800 pb-3">
        <span>🔐</span> Palabra secreta
      </h3>

      {!tienePalabra && !editando && (
        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl px-3 py-3 text-center">
          <p className="text-[10px] md:text-xs text-emerald-300 font-bold uppercase tracking-wider leading-relaxed mb-3">
            Crea tu palabra secreta para que puedas recuperar tu acceso sin ayuda si un día olvidas tu NIP
          </p>
          <button
            onClick={() => {
              setEditando(true);
              setMensaje('');
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest py-2.5 px-4 rounded-xl transition-all active:scale-95"
          >
            Crear mi palabra secreta
          </button>
        </div>
      )}

      {tienePalabra && !editando && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[10px] md:text-xs text-slate-300 font-bold uppercase tracking-wider leading-relaxed">
            ✅ Ya tienes tu palabra secreta. Con ella creas un NIP nuevo desde la pantalla de acceso.
          </p>
          <button
            onClick={() => {
              setEditando(true);
              setMensaje('');
            }}
            className="bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm shrink-0"
          >
            Cambiarla
          </button>
        </div>
      )}

      {editando && (
        <div className="space-y-3">
          {tienePalabra && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Tu palabra actual
              </label>
              <input
                type="password"
                value={palabraActual}
                onChange={(e) => setPalabraActual(e.target.value)}
                className={inputCls}
                placeholder="La que tienes guardada"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              {tienePalabra ? 'Palabra nueva' : 'Tu palabra secreta'}
            </label>
            <input
              type="password"
              value={palabraNueva}
              onChange={(e) => setPalabraNueva(e.target.value)}
              className={inputCls}
              placeholder="Ej. el nombre de tu mascota"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Confírmala
            </label>
            <input
              type="password"
              value={palabraConfirm}
              onChange={(e) => setPalabraConfirm(e.target.value)}
              className={inputCls}
              placeholder="Escríbela otra vez"
            />
            <p className="text-[8px] text-slate-500 mt-1 text-center font-bold uppercase">
              Se guarda cifrada y se compara sin acentos ni mayúsculas. Elige algo que solo tú sepas.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className={`flex-1 font-black uppercase text-[10px] tracking-widest py-2.5 px-4 rounded-xl transition-all ${
                guardando
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
              }`}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => {
                setEditando(false);
                setPalabraActual('');
                setPalabraNueva('');
                setPalabraConfirm('');
                setMensaje('');
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {mensaje && (
        <p
          className={`mt-3 text-center text-[10px] font-bold uppercase tracking-widest py-2 rounded-lg border ${
            esError
              ? 'bg-red-950/20 border-red-900/30 text-red-400'
              : 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
          }`}
        >
          {mensaje}
        </p>
      )}
    </div>
  );
}
