import React from 'react';

interface ModalReglasProps {
  onClose: () => void;
  onAccept?: () => void; // Lo hacemos opcional por si en otro lado solo quieren "leer" sin tener que aceptar nada
}

export default function ModalReglas({ onClose, onAccept }: ModalReglasProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 max-w-md w-full p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2.5 mb-3">
          <h3 className="text-base font-black text-white flex items-center gap-2 uppercase tracking-tight"><span>📜</span> Reglamento CiberTeque</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 font-bold font-mono text-lg">✕</button>
        </div>
        
        <div className="space-y-3.5 text-[10px] md:text-xs text-slate-300 font-medium leading-relaxed uppercase tracking-wide max-h-[300px] md:max-h-[380px] overflow-y-auto pr-1">
          <div>
            <strong className="text-blue-400 block mb-0.5">1️⃣ Cierre y Correcciones:</strong>
            <span className="text-slate-400 block pl-2 font-bold mb-1">• Boletos Digitales (App):</span>
            <span className="normal-case text-slate-300 pl-4 block leading-normal">
              Tu jugada es tu responsabilidad. <span className="text-amber-400 font-bold">Puedes modificar tus pronósticos desde la aplicación en cualquier momento antes de la fecha y hora de cierre oficial.</span> Una vez llegada la hora de cierre de la jornada, el boleto queda bloqueado y participarás con tu última selección guardada.
            </span>
            <span className="text-slate-400 block pl-2 font-bold mt-1.5 mb-1">• Boletos Físicos:</span>
            <span className="normal-case text-slate-300 pl-4 block leading-normal">Se reciben a más tardar un día antes de la fecha de cierre a las 8:00 P.M. Si detectas un error en la captura realizada por el personal de CiberTeque, debe reportarse inmediatamente antes del cierre para su corrección.</span>
          </div>

          <p>
            <strong className="text-blue-400 block mb-0.5">2️⃣ Tiempo Reglamentario (90 Min):</strong>
            <span className="normal-case leading-normal block text-slate-300">Para los pronósticos, solo cuentan los 90 minutos reglamentarios (incluyendo el tiempo agregado por el árbitro). NO cuentan los tiempos extras ni las tandas de penales.</span>
          </p>

          <p>
            <strong className="text-blue-400 block mb-0.5">3️⃣ Partidos Aplazados o Suspendidos:</strong>
            <span className="normal-case leading-normal block text-slate-300">Si un partido se suspende después de haber iniciado, se toma como válido el marcador que tenía en ese momento. Si un partido se cancela o aplaza antes de iniciar, para fines de la quiniela se declarará como Empate (E).</span>
          </p>

          <p>
            <strong className="text-blue-400 block mb-0.5">4️⃣ Criterios de Desempate:</strong>
            <span className="normal-case leading-normal block text-slate-300">El ganador se define por quién tenga más aciertos. Si dos o más jugadores empatan en puntos, el desempate se decide por la predicción de goles totales de la jornada (quien se acerque más al número real).</span>
          </p>

          <div>
            <strong className="text-blue-400 block mb-0.5">5️⃣ Empates Perfectos (Bolsa Compartida):</strong>
            <span className="normal-case text-slate-300 block leading-normal"><span className="text-amber-500 font-bold uppercase text-[9px] tracking-wider block mt-0.5">💸 En quinielas de paga:</span> Se sumarán las bolsas de los lugares ocupados y se dividirá el dinero en partes iguales.</span>
            <span className="normal-case text-slate-300 block leading-normal"><span className="text-amber-500 font-bold uppercase text-[9px] tracking-wider block mt-1">🎁 En quinielas Promocionales (Gratis):</span> Se respetará el premio completo (ej. 1 crédito) para todos los que empaten en el primer lugar.</span>
          </div>

          <p>
            <strong className="text-blue-400 block mb-0.5">6️⃣ Boletos Físicos VS Digitales:</strong>
            <span className="normal-case leading-normal block text-slate-300">Ambos tienen exactamente la misma validez. Si dejas tu boleto físico en CiberTeque, nosotros lo capturamos y aparecerás en el ranking web al igual que todos.</span>
          </p>

          <p>
            <strong className="text-amber-500 block mb-0.5">7️⃣ Actualización de Marcadores:</strong>
            <span className="normal-case leading-normal block text-slate-300">Procuramos reflejar los resultados al instante, pero la administración cuenta con un margen de tolerancia de hasta 24 horas posteriores al partido para su actualización oficial en el sistema.</span>
          </p>

          <p>
            <strong className="text-amber-500 block mb-0.5">8️⃣ Cierre y Premiación:</strong>
            <span className="normal-case leading-normal block text-slate-300">La validación final de la jornada y el pago de premios a los ganadores se realizará a más tardar el siguiente día hábil tras concluir el último encuentro de la quiniela.</span>
          </p>

          <p>
            <strong className="text-amber-500 block mb-0.5">9️⃣ Cancelación y Reembolsos:</strong>
            <span className="normal-case leading-normal block text-slate-300">En caso de fallas mayores en la plataforma o la cancelación oficial de más de la mitad de los partidos de la jornada, la quiniela será anulada y se reembolsarán íntegramente los créditos a todos los participantes.</span>
          </p>

          <p className="italic text-slate-500 mt-4 border-t border-slate-800 pt-2.5 text-[9px] md:text-[10px]">
            Al participar en CiberTeque se entiende que conoces y aceptas todos los puntos mencionados anteriormente.
          </p>
        </div>
        
        {onAccept && (
          <button 
            onClick={onAccept} 
            className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl uppercase tracking-wider text-xs transition-all shadow-lg transform active:scale-95"
          >
            Entendido y Aceptado
          </button>
        )}
      </div>
    </div>
  );
}