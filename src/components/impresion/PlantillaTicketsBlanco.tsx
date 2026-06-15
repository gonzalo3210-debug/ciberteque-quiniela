import React from 'react';

// 1. Tipado estricto para evitar errores de datos faltantes
interface Partido {
  id: string | number;
  equipo_local: string;
  equipo_visitante: string;
}

interface Quiniela {
  nombre_jornada: string;
  fecha_cierre: string;
  precio_ticket?: number;
}

interface PlantillaTicketsBlancoProps {
  quiniela: Quiniela | null;
  partidos: Partido[];
  obtenerLogo: (equipo: string) => string | null;
}

export default function PlantillaTicketsBlanco({ quiniela, partidos, obtenerLogo }: PlantillaTicketsBlancoProps) {
  // Manejo de Estado/UX: Prevenir pantalla en blanco sin contexto
  if (!quiniela) {
    return (
      <div className="hidden print:flex p-10 text-center font-bold text-red-500">
        ⚠️ Error: No hay datos de jornada para imprimir.
      </div>
    );
  }

  // Lógica encapsulada: Formateo de fecha con estándar local (es-MX)
  const formatearFecha = (fechaString: string) => {
    if (!fechaString) return 'SIN FECHA';
    try {
      const fecha = new Date(fechaString);
      return new Intl.DateTimeFormat('es-MX', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(fecha);
    } catch (error) {
      return fechaString; // Fallback seguro
    }
  };

  return (
    <div className="hidden print:flex print:flex-row print:justify-between print:w-full print:h-full print:bg-white print:text-black zona-impresion z-[99999]">
      {[1, 2].map((num) => (
        <div className="w-[48%] h-full border-2 border-black rounded-3xl p-4 bg-white flex flex-col justify-between" key={num}>
          <div>
            <div className="text-center mb-4">
              <h1 className="font-black text-3xl uppercase tracking-widest text-blue-900">CIBERTEQUE</h1>
              <p className="text-xs font-bold uppercase tracking-widest border-b-2 border-blue-900 inline-block pb-1 mt-1 text-blue-900">Quiniela Deportiva</p>
              <div className="mt-2 text-[10px] font-black uppercase bg-blue-900 text-white py-1 px-2 rounded">
                Cierre: {formatearFecha(quiniela.fecha_cierre)}
              </div>
            </div>
            <h2 className="text-center font-black text-lg uppercase mb-4 bg-amber-400 py-1 border-y-2 border-black text-black">
              {quiniela.nombre_jornada}
            </h2>
            
            <div className="mb-4 space-y-3">
              <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1">
                <span className="font-bold text-sm uppercase">Nombre:</span><span className="w-4/5"></span>
              </div>
              <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1">
                <span className="font-bold text-sm uppercase">WhatsApp:</span><span className="w-4/5"></span>
              </div>
            </div>
            
            <table className="w-full text-sm mb-4 border-collapse table-fixed">
              <thead>
                <tr className="bg-blue-900 text-white text-[8px] uppercase">
                  <th className="border-2 border-black p-1 text-right w-[40%]">Local</th>
                  <th className="border-2 border-black p-1 text-center w-[6%]">L</th>
                  <th className="border-2 border-black p-1 text-center w-[6%]">E</th>
                  <th className="border-2 border-black p-1 text-center w-[6%]">V</th>
                  <th className="border-2 border-black p-1 text-left w-[40%]">Visita</th>
                </tr>
              </thead>
              <tbody>
                {(partidos || []).map((p) => {
                  const logoL = obtenerLogo(p.equipo_local);
                  const logoV = obtenerLogo(p.equipo_visitante);
                  return (
                    <tr key={p.id}>
                      <td className="border-2 border-black p-1 text-right overflow-hidden bg-gray-50">
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-bold uppercase text-[8px] truncate max-w-[80%]">{p.equipo_local}</span>
                          {logoL ? <img src={logoL} alt="" className="w-5 h-5 object-contain" /> : <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}
                        </div>
                      </td>
                      <td className="border-2 border-black p-0.5 text-center font-bold"></td>
                      <td className="border-2 border-black p-0.5 text-center font-bold"></td>
                      <td className="border-2 border-black p-0.5 text-center font-bold"></td>
                      <td className="border-2 border-black p-1 text-left overflow-hidden bg-gray-50">
                        <div className="flex items-center justify-start gap-1">
                          {logoV ? <img src={logoV} alt="" className="w-5 h-5 object-contain" /> : <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}
                          <span className="font-bold uppercase text-[8px] truncate max-w-[80%]">{p.equipo_visitante}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            <div className="border-2 border-black p-3 text-center rounded-xl bg-gray-100 mt-6">
              <span className="font-bold uppercase text-[9px] block mb-2">Desempate (Total de Goles):</span>
              <div className="w-16 border-b-2 border-black mx-auto h-4"></div>
            </div>
            <p className="text-center text-[8px] font-bold uppercase mt-4 text-blue-900">
              Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t-2 border-black border-dashed">
            <p className="text-[7px] text-justify leading-tight font-bold uppercase text-black"><b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).</p>
          </div>
        </div>
      ))}
    </div>
  );
}