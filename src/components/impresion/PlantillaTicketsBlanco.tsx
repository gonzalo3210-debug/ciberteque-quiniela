import React from 'react';

// Si no lo has extraído a su propio archivo, asegúrate de crear 'components/impresion/PlantillaTicketsBlanco.tsx'
export default function PlantillaTicketsBlanco({ quiniela, partidos, obtenerLogo }: any) {
  if (!quiniela) return null;

  // ⚡ CORRECCIÓN DE ZONA HORARIA ⚡
  const formatearFechaLocal = (fechaDB: string) => {
    if (!fechaDB) return '';
    // Nos aseguramos de que el navegador sepa que viene en UTC (Greenwich) para que haga la resta de horas local
    const fechaUTC = fechaDB.includes('Z') || fechaDB.includes('+') ? fechaDB : `${fechaDB}Z`;
    const d = new Date(fechaUTC);
    
    // Forzamos el formato de México (DD/MM/AAAA)
    return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit', hour12: true}).toUpperCase()}`;
  }

  // 💡 Lógica centralizada: Determinamos la modalidad
  const esMarcadorExacto = quiniela.modalidad === 'marcador_exacto';

  // 💡 Ordenamiento cronológico defensivo
  const partidosOrdenados = [...(partidos || [])].sort((a, b) => {
    const fechaA = new Date(a.fecha_hora_partido ? (a.fecha_hora_partido.includes('Z') ? a.fecha_hora_partido : `${a.fecha_hora_partido}Z`) : 0).getTime();
    const fechaB = new Date(b.fecha_hora_partido ? (b.fecha_hora_partido.includes('Z') ? b.fecha_hora_partido : `${b.fecha_hora_partido}Z`) : 0).getTime();
    return fechaA - fechaB;
  });

  return (
    <>
      {/* 🔥 INGENIERÍA: CSS Grid Estricto */}
      <style>{`
        @media print {
          @page { margin: 5mm !important; }
          
          /* CONTENEDOR MAESTRO: Cuadrícula de 2 columnas forzada */
          .impresion-contenedor { 
            display: grid !important; 
            grid-template-columns: 1fr 1fr !important;
            gap: 5mm !important;
            width: 100% !important; 
            height: 96vh !important;
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
          .encabezado-impresion { margin-bottom: 6px !important; }
          .titulo-impresion { font-size: 1.25rem !important; margin-bottom: 4px !important; }
        }
      `}</style>

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
              
              <h2 className="text-center font-black text-sm md:text-lg uppercase mb-2 md:mb-3 bg-amber-400 py-1 border-y-2 border-black text-black">
                {quiniela.nombre_jornada} {esMarcadorExacto && "- MARCADORES"}
              </h2>
              
              <div className="mb-2 md:mb-3 space-y-1 md:space-y-2">
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1">
                  <span className="font-bold text-[9px] md:text-xs uppercase">Nombre:</span><span className="w-4/5"></span>
                </div>
                <div className="flex justify-between items-end border-b-2 border-black border-dashed pb-1">
                  <span className="font-bold text-[9px] md:text-xs uppercase">WhatsApp:</span><span className="w-4/5"></span>
                </div>
              </div>
              
              <table className="w-full mb-2 border-collapse table-fixed tabla-impresion">
                <thead>
                  <tr className="bg-blue-900 text-white uppercase">
                    <th className="border-2 border-black text-right w-[40%]">Local</th>
                    
                    {/* RENDERIZADO CONDICIONAL DE CABECERAS */}
                    {esMarcadorExacto ? (
                      <th className="border-2 border-black text-center w-[20%]">Marcador</th>
                    ) : (
                      <>
                        <th className="border-2 border-black text-center w-[6%]">L</th>
                        <th className="border-2 border-black text-center w-[6%]">E</th>
                        <th className="border-2 border-black text-center w-[6%]">V</th>
                      </>
                    )}

                    <th className="border-2 border-black text-left w-[40%]">Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {partidosOrdenados.map((p: any) => {
                    const logoL = obtenerLogo(p.equipo_local)
                    const logoV = obtenerLogo(p.equipo_visitante)
                    return (
                      <tr key={p.id}>
                        <td className="border-2 border-black text-right overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-bold uppercase truncate max-w-[80%]">{p.equipo_local}</span>
                            {logoL ? (
                              <img 
                                src={logoL} 
                                alt="" 
                                loading="eager" 
                                decoding="sync"
                                className="w-4 h-4 md:w-5 md:h-5 object-contain" 
                                onError={(e: any) => { e.target.src = 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png' }}
                              />
                            ) : (
                              <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>
                            )}
                          </div>
                        </td>
                        
                        {/* ⚡ MEJORA UX: Dos casillas con un guion en medio para llenado manual */}
                        {esMarcadorExacto ? (
                           <td className="border-2 border-black text-center p-0.5">
                             <div className="flex items-center justify-center gap-1">
                               <div className="w-4 h-4 md:w-5 md:h-5 border border-slate-400 rounded-sm bg-white"></div>
                               <span className="font-black text-slate-500 text-[10px]">-</span>
                               <div className="w-4 h-4 md:w-5 md:h-5 border border-slate-400 rounded-sm bg-white"></div>
                             </div>
                           </td>
                        ) : (
                          <>
                            <td className="border-2 border-black text-center font-bold"></td>
                            <td className="border-2 border-black text-center font-bold"></td>
                            <td className="border-2 border-black text-center font-bold"></td>
                          </>
                        )}

                        <td className="border-2 border-black text-left overflow-hidden bg-gray-50">
                          <div className="flex items-center justify-start gap-1">
                            {logoV ? (
                              <img 
                                src={logoV} 
                                alt="" 
                                loading="eager" 
                                decoding="sync"
                                className="w-4 h-4 md:w-5 md:h-5 object-contain" 
                                onError={(e: any) => { e.target.src = 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png' }}
                              />
                            ) : (
                              <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border border-black flex items-center justify-center text-[5px]">?</div>
                            )}
                            <span className="font-bold uppercase truncate max-w-[80%]">{p.equipo_visitante}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* ⚡ NUEVA SECCIÓN INFERIOR: DESEMPATE, COSTO, PAGOS Y CONTACTO */}
              <div className="flex flex-col gap-1.5 mt-2 md:mt-3">
                {/* Fila 1: Desempate y Costo */}
                <div className="flex gap-2 items-stretch">
                  {!esMarcadorExacto && (
                    <div className="flex-1 border-2 border-black p-1 text-center rounded-xl bg-gray-100 flex flex-col justify-center">
                      <span className="font-bold uppercase text-[7px] md:text-[8px] block mb-0.5">Desempate (Goles):</span>
                      <div className="w-16 border-b-2 border-black mx-auto h-3"></div>
                    </div>
                  )}
                  <div className={`border-2 border-black p-1 text-center rounded-xl bg-amber-400 flex flex-col justify-center shadow-[2px_2px_0px_#000] ${esMarcadorExacto ? 'w-full py-1.5' : 'flex-1'}`}>
                    <span className="font-black uppercase text-[7px] md:text-[8px] text-black">Costo del Boleto</span>
                    <span className="font-black text-sm md:text-lg text-black leading-none mt-0.5">
                      ${Number(quiniela.precio_ticket ?? 30).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Fila 2: Información de Pago y QRs SEPARADOS */}
                <div className="border-2 border-black rounded-xl p-1.5 flex justify-between items-center bg-white mt-0.5">
                  
                  {/* QR Izquierdo: App */}
                  <div className="text-center flex flex-col items-center shrink-0 px-1">
                    <img 
                      src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://ciberteque-quiniela.vercel.app" 
                      alt="QR App" 
                      loading="eager"
                      decoding="sync"
                      className="w-10 h-10 md:w-12 md:h-12 object-contain"
                    />
                    <span className="text-[5px] md:text-[6px] font-black uppercase mt-1 text-blue-900">La App</span>
                  </div>
                  
                  {/* Datos en texto (Centro) - Fuentes más grandes */}
                  <div className="flex-1 flex flex-col justify-center items-center text-center border-x-2 border-dashed border-gray-400 px-2 mx-1">
                    <p className="text-[6px] md:text-[8px] font-black text-black leading-tight">
                      📲 WA: <span className="font-mono text-green-700">311 877 6263</span>
                    </p>
                    <p className="text-[6px] md:text-[8px] font-black text-black leading-tight mt-1">
                      🏦 PAGO CLABE (Mercado Pago):
                    </p>
                    <p className="text-[8px] md:text-[11px] font-mono font-black text-blue-900 leading-none mt-0.5 tracking-wider">
                      722969010548321155
                    </p>
                    <p className="text-[5.5px] md:text-[7px] font-bold text-gray-600 uppercase mt-1">
                      A nombre de: Gonzalo Montero Inda
                    </p>
                  </div>

                  {/* QR Derecho: WhatsApp */}
                  <div className="text-center flex flex-col items-center shrink-0 px-1">
                    <img 
                      src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://wa.me/523118776263" 
                      alt="QR WA" 
                      loading="eager"
                      decoding="sync"
                      className="w-10 h-10 md:w-12 md:h-12 object-contain"
                    />
                    <span className="text-[5px] md:text-[6px] font-black uppercase mt-1 text-green-700">WhatsApp</span>
                  </div>

                </div>
              </div>

            </div>
            
            <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t-2 border-black border-dashed">
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