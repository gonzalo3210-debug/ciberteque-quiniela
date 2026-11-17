'use client';

// src/components/AjustesNotificaciones.tsx
//
// Sección "🔔 Notificaciones y sonidos" de Mi Perfil:
//  - Avisos push (Web Push): activar/desactivar en este dispositivo y
//    un toggle por tipo de aviso. Las preferencias viven en el
//    servidor (suscripciones_push); los equipos seguidos se espejean
//    desde Siguiendo ⭐ cada vez que se guarda.
//  - En iPhone sin la app instalada no se puede suscribir: se
//    muestran las instrucciones de instalación en vez del botón.
//  - Sonidos en vivo (WebAudio): preferencia local del dispositivo.

import { useEffect, useState } from 'react';
import {
  activarPush,
  actualizarPush,
  desactivarPush,
  esIosSinInstalar,
  leerPreferenciasPush,
  soportePush,
  suscripcionActual,
} from '@/lib/pushCliente';
import {
  PREFERENCIAS_PUSH_DEFECTO,
  type PreferenciasPush,
} from '@/lib/pushPreferencias';
import {
  desbloquearAudio,
  guardarPreferenciaSonidos,
  leerPreferenciaSonidos,
  sonarGol,
} from '@/lib/sonidos';

const FILAS_PREF: {
  clave: keyof PreferenciasPush;
  icono: string;
  titulo: string;
  detalle: string;
}[] = [
  { clave: 'gol_equipos', icono: '⭐', titulo: 'Goles de mis equipos', detalle: 'Cuando anote un equipo que sigues en Siguiendo' },
  { clave: 'gol_boleto', icono: '🎯', titulo: 'Goles en mi boleto', detalle: 'Cada gol en los partidos de tu quiniela' },
  { clave: 'liderato', icono: '👑', titulo: 'Cambios de liderato', detalle: 'Si subes al primer lugar o te rebasan' },
  { clave: 'cierre', icono: '⏰', titulo: 'Recordatorio de cierre', detalle: 'Faltan menos de 2 horas para el cierre y aún no tienes boleto' },
  { clave: 'premio', icono: '🏆', titulo: 'Premio acreditado', detalle: 'Cuando se liquide la quiniela y te acrediten un premio' },
  { clave: 'fin_partido', icono: '🏁', titulo: 'Fin de partido', detalle: 'Terminó un partido de una quiniela donde tienes boleto' },
];

function Interruptor({
  activo,
  onClick,
  deshabilitado,
}: {
  activo: boolean;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={deshabilitado}
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        activo ? 'bg-blue-600' : 'bg-slate-700'
      } ${deshabilitado ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
          activo ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

type Fase = 'cargando' | 'sin-soporte' | 'ios' | 'listo';

export default function AjustesNotificaciones({
  usuarioActivo,
}: {
  usuarioActivo: any;
}) {
  const usuarioId: string = usuarioActivo?.id || '';
  const [fase, setFase] = useState<Fase>('cargando');
  const [activo, setActivo] = useState(false);
  const [denegado, setDenegado] = useState(false);
  const [prefs, setPrefs] = useState<PreferenciasPush>({
    ...PREFERENCIAS_PUSH_DEFECTO,
  });
  const [sonidos, setSonidos] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setSonidos(leerPreferenciaSonidos());
    if (!usuarioId) return;
    let vivo = true;
    (async () => {
      if (!soportePush()) {
        if (vivo) setFase('sin-soporte');
        return;
      }
      if (esIosSinInstalar()) {
        if (vivo) setFase('ios');
        return;
      }
      const sub = await suscripcionActual();
      if (!vivo) return;
      if (sub && Notification.permission === 'granted') {
        setActivo(true);
        const leidas = await leerPreferenciasPush(usuarioId);
        if (!vivo) return;
        if (leidas?.existe) {
          setPrefs(leidas.preferencias);
          // Los equipos seguidos pudieron cambiar en Siguiendo:
          // se re-espejean al servidor sin tocar las preferencias.
          void actualizarPush(usuarioId, leidas.preferencias);
        } else if (leidas) {
          // El navegador tiene suscripción pero el servidor no: se sana.
          void actualizarPush(usuarioId, { ...PREFERENCIAS_PUSH_DEFECTO });
        }
      }
      if (vivo) setFase('listo');
    })();
    return () => {
      vivo = false;
    };
  }, [usuarioId]);

  const manejarActivar = async () => {
    setTrabajando(true);
    setAviso(null);
    const r = await activarPush(usuarioId, prefs);
    setTrabajando(false);
    if (r.ok) {
      setActivo(true);
      setDenegado(false);
      setAviso('✅ Avisos activados en este dispositivo.');
    } else if (r.motivo === 'denegado') {
      setDenegado(true);
    } else if (r.motivo === 'sin-llave') {
      setAviso('⚠️ Los avisos aún no están configurados en el servidor.');
    } else {
      setAviso(`⚠️ No se pudieron activar${r.detalle ? `: ${r.detalle}` : '.'}`);
    }
  };

  const manejarDesactivar = async () => {
    setTrabajando(true);
    await desactivarPush(usuarioId);
    setTrabajando(false);
    setActivo(false);
    setAviso('Avisos desactivados en este dispositivo.');
  };

  const alternarPref = async (clave: keyof PreferenciasPush) => {
    const nuevas = { ...prefs, [clave]: !prefs[clave] };
    setPrefs(nuevas);
    if (activo) {
      const ok = await actualizarPush(usuarioId, nuevas);
      if (!ok) setAviso('⚠️ El cambio no se guardó en el servidor; se aplicará al reactivar.');
    }
  };

  const alternarSonidos = () => {
    const nuevo = !sonidos;
    setSonidos(nuevo);
    guardarPreferenciaSonidos(nuevo);
    if (nuevo) {
      // El clic es el gesto que el navegador exige para dar audio:
      // se desbloquea y se oye el sonido de gol a modo de prueba.
      desbloquearAudio();
      sonarGol();
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg relative">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
        <span>🔔</span> Notificaciones y sonidos
      </h3>

      {/* ---------- Avisos push ---------- */}
      {fase === 'cargando' && (
        <p className="text-slate-500 text-xs font-bold animate-pulse">
          Revisando los avisos de este dispositivo…
        </p>
      )}

      {fase === 'sin-soporte' && (
        <p className="text-slate-400 text-xs leading-relaxed">
          Este navegador no soporta avisos push. Prueba con Chrome o con la
          app instalada en tu pantalla de inicio.
        </p>
      )}

      {fase === 'ios' && (
        <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-3.5">
          <p className="text-blue-300 text-xs font-bold mb-1">
            📱 En iPhone los avisos necesitan la app instalada
          </p>
          <p className="text-slate-400 text-xs leading-relaxed">
            Toca <strong className="text-slate-200">Compartir</strong> y luego{' '}
            <strong className="text-slate-200">«Agregar a pantalla de inicio»</strong>.
            Abre la app desde el nuevo icono y vuelve a esta pantalla para
            activar los avisos.
          </p>
        </div>
      )}

      {fase === 'listo' && (
        <>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <p className="text-white text-sm font-black">
                {activo ? '✅ Avisos activados' : 'Avisos en este dispositivo'}
              </p>
              <p className="text-slate-500 text-[11px] leading-snug">
                {activo
                  ? 'Te llegarán aunque la app esté cerrada, según los tipos de abajo.'
                  : 'Actívalos para enterarte de goles y lideratos sin abrir la app.'}
              </p>
            </div>
            {activo ? (
              <button
                onClick={manejarDesactivar}
                disabled={trabajando}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all shrink-0 disabled:opacity-50"
              >
                Desactivar
              </button>
            ) : (
              <button
                onClick={manejarActivar}
                disabled={trabajando}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all shrink-0 disabled:opacity-50 shadow-[0_0_15px_rgba(37,99,235,0.35)]"
              >
                {trabajando ? '⏳…' : 'Activar avisos'}
              </button>
            )}
          </div>

          {denegado && !activo && (
            <p className="text-amber-400 text-[11px] leading-relaxed bg-amber-950/30 border border-amber-900/40 rounded-lg p-2.5 mb-2">
              🚫 El navegador bloqueó el permiso. Para activarlo: toca el
              candado o el icono de ajustes junto a la dirección del sitio,
              entra a «Notificaciones» y elige «Permitir»; después vuelve a
              tocar «Activar avisos».
            </p>
          )}

          <div className="flex flex-col divide-y divide-slate-800/70">
            {FILAS_PREF.map((fila) => (
              <div key={fila.clave} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-slate-200 text-xs font-bold">
                    {fila.icono} {fila.titulo}
                  </p>
                  <p className="text-slate-500 text-[10px] leading-snug">{fila.detalle}</p>
                </div>
                <Interruptor
                  activo={prefs[fila.clave]}
                  onClick={() => void alternarPref(fila.clave)}
                />
              </div>
            ))}
          </div>
          {!activo && (
            <p className="text-slate-600 text-[10px] mt-1">
              Los tipos que dejes prendidos se aplican en cuanto actives los avisos.
            </p>
          )}
        </>
      )}

      {aviso && <p className="text-slate-400 text-[11px] mt-3">{aviso}</p>}

      {/* ---------- Sonidos en vivo ---------- */}
      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800">
        <div className="min-w-0">
          <p className="text-slate-200 text-xs font-bold">🔊 Sonidos en vivo</p>
          <p className="text-slate-500 text-[10px] leading-snug">
            Sonido de gol y silbatazo final en la vista en vivo, y vibración
            al gol. Solo con la app abierta y solo en partidos de tu
            quiniela o de tus equipos seguidos.
          </p>
        </div>
        <Interruptor activo={sonidos} onClick={alternarSonidos} />
      </div>
    </div>
  );
}
