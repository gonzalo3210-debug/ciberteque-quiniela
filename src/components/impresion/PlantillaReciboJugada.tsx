import React from 'react';

interface PlantillaReciboJugadaProps {
  quiniela: any;
  partidos: any[];
  ticketAImprimir: any; 
  obtenerLogo: (nombre: string) => string | null;
}

export default function PlantillaReciboJugada({ quiniela, partidos, ticketAImprimir, obtenerLogo }: PlantillaReciboJugadaProps) {
  if (!quiniela || !ticketAImprimir) return null;

  return (
    <>
      {/* Estilos CSS inline específicos para forzar el ajuste en una sola página física */}
      <style>{`
        @media print {
          @page { 
            margin: 4mm 6mm !important; 
          }
          
          /* Contenedor principal blindado para ocupar máximo el alto de una hoja */
          .recibo-print-container {
            width: 100% !important;
            max-width: 100% !important;
            height: 94vh !important;
            max-height: 94vh !important;
            padding: 12px !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            background-color: white !important;
            page-break-inside: avoid !important;
          }

          /* Reducción milimétrica de espaciados en la cabecera */
          .recibo-header {
            margin-bottom: 8px !important;
            padding-bottom: 8px !important;
          }

          /* Optimización de la tabla para evitar desbordes verticales */
          .recibo-tabla th {
            padding: 5px 4px !important;
            font-size: 10px !important;
          }
          .recibo-tabla td {
            padding: 3px 4px !important;
            font-size: 10px !important;
          }

          /* Escudos ligeramente más compactos para cuidar las filas */
          .recibo-logo-equipo {
            width: 22px !important;
            height: 22px !important;
          }

          /* Casillas L-E-V compactas */
          .recibo-casilla-opc {
            width: 24px !important;
            height: 24px !important;
            font-size: 11px !important;
          }

          /* Caja de desempate optimizada */
          .recibo-desempate {
            margin-bottom: 8px !important;
            padding: 8px !important;
          }
          .recibo-desempate-titulo {
            font-size: 10px !important;
          }
          .recibo-desempate-goles {
            font-size: 24px !important;
            line-height: 1 !important;
          }
        }
      `}</style>

      <div className="zona-impresion font-sans w-full max-w-3xl mx-auto p-4 bg-white recibo-print-container">
        <div>
          {/* Cabecera del Boleto */}
          <div className="text-center mb-5 border-b-2 border-slate-300 pb-4 recibo-header">
            <h1 className="text-4xl font-black uppercase tracking-widest text-blue-900 drop-shadow-sm">CiberTeque</h1>
            <h2 className="text-sm font-bold uppercase tracking-widest mt-0.5 text-slate-500">Comprobante Oficial de Jugada</h2>
            <div className="mt-2 inline-block bg-amber-400 text-black border-2 border-black px-6 py-1 font-black uppercase text-lg rounded-xl shadow-sm">
              {quiniela.nombre_jornada}
            </div>
          </div>

          {/* Datos del Jugador */}
          <div className="flex justify-between items-center mb-4 bg-blue-50 border-l-4 border-blue-600 p-3 rounded-r-xl">
            <div className="space-y-0.5 text-blue-950">
              <p className="text-xs md:text-sm"><span className="font-bold uppercase text-blue-800">Jugador:</span> <span className="font-black text-lg ml-2">{ticketAImprimir.nombre}</span></p>
              <p className="text-xs md:text-sm"><span className="font-bold uppercase text-blue-800">Celular:</span> <span className="font-mono font-bold ml-2">{ticketAImprimir.telefono || 'N/A'}</span></p>
            </div>
            <div className="text-right bg-white p-1.5 rounded border border-blue-200">
              <p className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Fecha de Registro</p>
              <p className="text-[11px] font-mono font-black text-blue-900">{new Date().toLocaleString('es-MX')}</p>
            </div>
          </div>

          {/* Tabla de Partidos con L-E-V al CENTRO */}
          <div className="border-2 border-blue-900 rounded-xl overflow-hidden mb-4 shadow-sm">
            <table className="w-full text-sm recibo-tabla">
              <thead className="bg-blue-900 text-white text-xs font-black uppercase tracking-widest">
                <tr>
                  <th className="p-2 text-center w-10 border-r border-blue-800">#</th>
                  <th className="p-2 text-right border-r border-blue-800 w-[35%] pr-4">Local</th>
                  <th className="p-2 text-center w-11 border-r border-blue-800">L</th>
                  <th className="p-2 text-center w-11 border-r border-blue-800">E</th>
                  <th className="p-2 text-center w-11 border-r border-blue-800">V</th>
                  <th className="p-2 text-left w-[35%] pl-4">Visitante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold text-xs uppercase bg-white">
                {partidos.map((partido: any, index: number) => {
                  const eleccion = ticketAImprimir.selecciones[partido.id];
                  const logoL = obtenerLogo(partido.equipo_local);
                  const logoV = obtenerLogo(partido.equipo_visitante);
                  
                  return (
                    <tr key={partido.id} className="hover:bg-slate-50 even:bg-slate-50/50">
                      <td className="p-1.5 text-center border-r border-slate-200 text-slate-400 font-black">{index + 1}</td>
                      
                      {/* EQUIPO LOCAL */}
                      <td className="p-1.5 border-r border-slate-200">
                        <div className="flex items-center justify-end gap-2 pr-1">
                          <span className="truncate max-w-[130px] text-slate-800">{partido.equipo_local}</span>
                          {logoL ? (
                            <img 
                              src={logoL} 
                              alt="" 
                              className="w-6 h-6 object-contain drop-shadow-sm recibo-logo-equipo" 
                              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-[7px] text-slate-400 bg-slate-100 shrink-0">?</div>
                          )}
                        </div>
                      </td>
                      
                      {/* CASILLAS CENTRADAS (L - E - V) */}
                      <td className="p-1 text-center border-r border-slate-200 bg-blue-50/20">
                        <div className={`w-6 h-6 mx-auto flex items-center justify-center rounded font-black text-xs border-2 transition-all recibo-casilla-opc ${eleccion === 'L' ? 'bg-blue-600 text-white border-blue-700 shadow-inner' : 'bg-white text-slate-300 border-slate-200'}`}>
                          L
                        </div>
                      </td>
                      <td className="p-1 text-center border-r border-slate-200 bg-slate-100/40">
                        <div className={`w-6 h-6 mx-auto flex items-center justify-center rounded font-black text-xs border-2 transition-all recibo-casilla-opc ${eleccion === 'E' ? 'bg-blue-600 text-white border-blue-700 shadow-inner' : 'bg-white text-slate-300 border-slate-200'}`}>
                          E
                        </div>
                      </td>
                      <td className="p-1 text-center border-r border-slate-200 bg-blue-50/20">
                        <div className={`w-6 h-6 mx-auto flex items-center justify-center rounded font-black text-xs border-2 transition-all recibo-casilla-opc ${eleccion === 'V' ? 'bg-blue-600 text-white border-blue-700 shadow-inner' : 'bg-white text-slate-300 border-slate-200'}`}>
                          V
                        </div>
                      </td>
                      
                      {/* EQUIPO VISITANTE */}
                      <td className="p-1.5">
                        <div className="flex items-center justify-start gap-2 pl-1">
                          {logoV ? (
                            <img 
                              src={logoV} 
                              alt="" 
                              className="w-6 h-6 object-contain drop-shadow-sm recibo-logo-equipo" 
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-[7px] text-slate-400 bg-slate-100 shrink-0">?</div>
                          )}
                          <span className="truncate max-w-[130px] text-slate-800">{partido.equipo_visitante}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bloque inferior agrupado para garantizar que nunca se separe */}
        <div>
          {/* Pie del Boleto - Criterio de Desempate */}
          <div className="bg-amber-100 border-2 border-amber-400 p-3 rounded-xl text-center flex flex-col items-center justify-center mb-4 shadow-sm recibo-desemp">
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-800 mb-0.5 recibo-desempate-titulo">Desempate Oficial (Goles Totales)</span>
            <span className="text-3xl font-black text-amber-900 recibo-desempate-goles">{ticketAImprimir.goles} <span className="text-base font-bold text-amber-700">GOLES</span></span>
          </div>

          <div className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <p className="text-blue-900 font-black text-xs mb-0.5">¡Conserva este recibo para cualquier aclaración o cobro de premio!</p>
            <p>Revisa la tabla de posiciones en vivo en:</p>
            <p className="text-blue-600 lowercase mt-0.5">ciberteque-quiniela.vercel.app</p>
          </div>
        </div>

      </div>
    </>
  );
}