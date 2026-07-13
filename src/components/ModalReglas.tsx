'use client'
import { useEffect } from 'react'

interface ModalReglasProps {
  onClose: () => void;
  onAccept: () => void;
}

export default function ModalReglas({ onClose, onAccept }: ModalReglasProps) {
  // Prevenir scroll en el body cuando el modal está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-4 md:p-5 border-b border-slate-800 shrink-0 bg-slate-900/50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📜</span>
            <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-widest">
              Reglamento Oficial
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* BODY (Scrollable) */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6 text-sm text-slate-300 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
          
          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>1️⃣</span> Cierre y Correcciones
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong className="text-slate-300">Boletos Digitales (App):</strong> Tu jugada es tu responsabilidad. Puedes modificar tus pronósticos en cualquier momento antes de la fecha y hora de cierre. Al llegar la hora, el boleto se bloquea y participarás con tu última selección.</li>
              <li><strong className="text-slate-300">Boletos Físicos:</strong> Se reciben a más tardar un día antes de la fecha de cierre a las 8:00 P.M. Errores de captura por el personal deben reportarse antes del cierre oficial.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>2️⃣</span> Tiempo Reglamentario
            </h3>
            <p className="text-slate-400">Para los pronósticos, solo cuentan los 90 minutos reglamentarios (incluyendo el tiempo agregado). <strong className="text-red-400">NO</strong> cuentan los tiempos extras ni penales, a menos que se especifique lo contrario.</p>
          </section>

          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>3️⃣</span> Partidos Aplazados o Suspendidos
            </h3>
            <p className="text-slate-400">Si un partido se suspende ya iniciado, se toma como válido el marcador en ese momento. Si se cancela antes de iniciar, se declarará como Empate (E) para modalidad clásica, y 0-0 para marcador exacto.</p>
          </section>

          <section className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <h3 className="font-black text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span>4️⃣</span> Dinámica por Modalidad
            </h3>
            <div className="space-y-4">
              <div>
                <span className="font-bold text-white uppercase text-xs">⚽ Clásica (L-E-V):</span>
                <p className="text-slate-400 text-xs mt-1">Gana quien acumule más aciertos pronosticando Local, Empate o Visitante.</p>
              </div>
              <div className="space-y-1.5">
                <span className="font-bold text-white uppercase text-xs">🎯 Marcador Exacto:</span>
                <div className="flex items-start gap-2 text-xs text-slate-400"><span className="text-green-500 text-base leading-none">🟢</span> <span><strong>Acierto Exacto (3 pts):</strong> Atinar a los goles exactos de ambos equipos.</span></div>
                <div className="flex items-start gap-2 text-xs text-slate-400"><span className="text-amber-500 text-base leading-none">🟡</span> <span><strong>Tendencia (1 pt):</strong> Fallar en los goles, pero atinarle a qué equipo ganó o si fue empate.</span></div>
                <div className="flex items-start gap-2 text-xs text-slate-400"><span className="text-red-500 text-base leading-none">🔴</span> <span><strong>Fallo (0 pts):</strong> No atinar ni al ganador ni a los goles.</span></div>
              </div>
              <div>
                <span className="font-bold text-white uppercase text-xs">🎲 Sorteo (Acceso Virtual):</span>
                <p className="text-slate-400 text-xs mt-1">Adquieres pases a ciegas. Al llenarse la sala o llegar el cierre, el sistema asignará aleatoriamente un equipo por pase. Ganas si tu equipo resulta victorioso.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>5️⃣</span> Criterios de Desempate
            </h3>
            <p className="text-slate-400">Si hay empate en puntos, se decide por la predicción de <strong className="text-slate-200">Goles Totales</strong> (quien se acerque más al número real, sin importar si se pasa o le falta). En la modalidad Clásica lo ingresas manualmente, en Marcador Exacto es la suma automática de tus pronósticos.</p>
          </section>

          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>6️⃣</span> Empates Perfectos (Bolsa)
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong className="text-amber-400">De paga:</strong> Se sumarán las bolsas de los lugares ocupados y se dividirá el dinero en partes iguales.</li>
              <li><strong className="text-green-400">Gratis (Promocional):</strong> Se respetará el premio completo para todos los que empaten en primer lugar.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>7️⃣</span> Actualización y Premiación
            </h3>
            <p className="text-slate-400">Contamos con un margen de tolerancia de hasta 24 horas posteriores al partido para actualizar resultados. El pago de premios se realizará a más tardar el siguiente día hábil tras concluir la jornada.</p>
          </section>

          <section>
            <h3 className="font-black text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>8️⃣</span> Cancelación y Reembolsos
            </h3>
            <p className="text-slate-400">En caso de fallas mayores o cancelación oficial de más de la mitad de los partidos, la quiniela será anulada. Para Sorteos, si no se llena el cupo mínimo, la administración decide si se realiza o se anula. Toda quiniela anulada resultará en un reembolso íntegro a tu saldo.</p>
          </section>

        </div>

        {/* FOOTER */}
        <div className="p-4 md:p-5 border-t border-slate-800 shrink-0 bg-slate-900/80 rounded-b-2xl flex flex-col sm:flex-row gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Volver
          </button>
          <button 
            onClick={onAccept}
            className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest text-white bg-green-600 hover:bg-green-500 shadow-[0_0_15px_rgba(22,163,74,0.3)] transition-all"
          >
            Aceptar y Continuar
          </button>
        </div>

      </div>
    </div>
  )
}