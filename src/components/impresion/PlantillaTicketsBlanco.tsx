import React from 'react';

// Si no lo has extraído a su propio archivo, asegúrate de crear 'components/impresion/PlantillaTicketsBlanco.tsx'
export default function PlantillaTicketsBlanco({ quiniela, partidos, obtenerLogo }: any) {
  if (!quiniela) return null;

  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    const d = new Date(fechaDB.substring(0, 16));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  return (
    <>
      {/* 🔥 INGENIERÍA: CSS Grid Estricto
        Forzamos al navegador a crear 2 columnas idénticas (1fr 1fr) sin importar
        la orientación. Además, limitamos el alto a 96vh para evitar hojas en blanco.
      */}
      <style>{`
        @media print {
          @page { margin: 5mm !important; }
          
          /* CONTENEDOR MAESTRO: Cuadrícula de 2 columnas forzada */
          .impresion-contenedor { 
            display: grid !important; 
            grid-template-columns: 1fr 1fr !important; /* Mágia: 2 columnas siempre */
            gap: 5mm !important; /* Espacio entre los dos tickets */
            width: 100% !important; 
            height: 96vh !important; /* Tope de alto para no saltar de hoja */
            page-break-after: avoid !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          
          /* CADA TICKET: Ocupa todo su espacio asignado y empuja el texto */
          .impresion-ticket { 
            width: 100% !important; 
            height: 100% !important; 
            padding: 4mm !important; 
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
          }
          
          /* TAMAÑOS DE FUENTE ESCALADOS PARA CABER PERFECTO */
          .tabla-impresion th, .tabla-impresion td { padding: 2px !important; font-size: 9px !important; }
          .texto-reglamento { font-size: 7px !important; line-height: 1.1 !important; }
          .encabezado-impresion { margin-bottom: 8px !important; }
          .titulo-impresion { font-size: 1.25rem !important; margin-bottom: 8px !important; }
        }
      `}</style>

      {/* Observa que cambiamos print:flex por print:grid */}
      <div className="hidden print:grid print:w-full print:bg-white print:text-black zona-impresion z-[99999] impresion-contenedor">
        {[1, 2].map((num) => (
          <div className="border-2 border-black rounded-3xl bg-white impresion-ticket" key={num}>
            <div>
              <div className="text-center encabezado-impresion">
                <h1 className="font-black uppercase tracking-widest text-blue-900 titulo-impresion leading-none">CIBERTEQUE</h1>
                <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest border-b-2 border-blue-900 inline-block pb-1 mt-1 text-blue-900">Quiniela Deportiva</p>
                <div className="mt-2 text-[8px] md:text-[10px] font-black uppercase bg-blue-900 text-white py-1 px-2 rounded inline-block">
                  Cierre: {formatearFechaLocal(quiniela.fecha_cierre)}
                </div>
              </div>
              
              <h2 className="text-center font-black text-sm md:text-lg uppercase mb-2 md:mb-4 bg-amber-400 py-1 border-y-2 border-black text-black">
                {quiniela.nombre_jornada}
              </h2>
              
              <div className="mb-2 md:mb-4 space-y-1.5 md:space-y-3">
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1">
                  <span className="font-bold text-[10px] md:text-sm uppercase">Nombre:</span><span className="w-4/5"></span>
                </div>
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1">
                  <span className="font-bold text-[10px] md:text-sm uppercase">WhatsApp:</span><span className="w-4/5"></span>
                </div>
              </div>
              
              <table className="w-full mb-2 md:mb-4 border-collapse table-fixed tabla-impresion">
                <thead>
                  <tr className="bg-blue-900 text-white uppercase">
                    <th className="border-2 border-black text-right w-[40%]">Local</th>
                    <th className="border-2 border-black text-center w-[6%]">L</th>
                    <th className="border-2 border-black text-center w-[6%]">E</th>
                    <th className="border-2 border-black text-center w-[6%]">V</th>
                    <th className="border-2 border-black text-left w-[40%]">Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {(partidos || []).map((p: any) => {
                    const logoL = obtenerLogo(p.equipo_local)
                    const logoV = obtenerLogo(p.equipo_visitante)
                    return (
                      <tr key={p.id}>
                        <td className="border-2 border-black text-right overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-bold uppercase truncate max-w-[80%]">{p.equipo_local}</span>
                            {logoL ? <img src={logoL} alt="" className="w-4 h-4 md:w-5 md:h-5 object-contain" /> : <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}
                          </div>
                        </td>
                        <td className="border-2 border-black text-center font-bold"></td>
                        <td className="border-2 border-black text-center font-bold"></td>
                        <td className="border-2 border-black text-center font-bold"></td>
                        <td className="border-2 border-black text-left overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-start gap-1">
                            {logoV ? <img src={logoV} alt="" className="w-4 h-4 md:w-5 md:h-5 object-contain" /> : <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>}
                            <span className="font-bold uppercase truncate max-w-[80%]">{p.equipo_visitante}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              
              <div className="border-2 border-black p-1.5 md:p-3 text-center rounded-xl bg-gray-100 mt-2 md:mt-4">
                <span className="font-bold uppercase text-[7px] md:text-[9px] block mb-1 md:mb-2">Desempate (Total de Goles):</span>
                <div className="w-16 border-b-2 border-black mx-auto h-3 md:h-4"></div>
              </div>
              <p className="text-center text-[6px] md:text-[8px] font-bold uppercase mt-2 md:mt-4 text-blue-900">
                Costo del Boleto: {quiniela.precio_ticket ?? 1} {(quiniela.precio_ticket ?? 1) === 1 ? 'Crédito' : 'Créditos'}
              </p>
            </div>
            
            <div className="mt-2 md:mt-4 pt-2 md:pt-4 border-t-2 border-black border-dashed">
              <p className="texto-reglamento text-justify font-bold uppercase text-black">
                <b>REGLAMENTO:</b> 1. PAGO ANTICIPADO: Boleto pagado antes del 1er partido. 2. CORRECCIONES: Revise su jugada, cambios SOLO ANTES de la hora de cierre. Iniciada la jornada participa tal cual. 3. SUSPENDIDOS/APLAZADOS: Si ya inició vale el marcador en ese momento; si no inició, se declara Empate a 0. 4. RESULTADOS: Válidos a los 90 min (sin extras).
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}