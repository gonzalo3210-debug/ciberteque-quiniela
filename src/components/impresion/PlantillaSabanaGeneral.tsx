import React from 'react';

export default function PlantillaSabanaGeneral({ quiniela, partidos, rankingAdmin, totalBoletosAdmin, cajaTotalPesos, cajaPremioPesos }: any) {
  if (!quiniela) return null;

  // Lógica de visualización de modalidad
  const esMarcadorExacto = quiniela.modalidad === 'marcador_exacto';

  return (
    <div className="hidden print:block print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-6">
      <div className="text-center mb-6">
        <h1 className="font-black text-2xl uppercase tracking-widest text-blue-900 border-b-2 border-blue-900 inline-block pb-1">SÁBANA OFICIAL - CIBERTEQUE</h1>
        <h2 className="text-xl font-bold uppercase mt-2">{quiniela.nombre_jornada}</h2>
        <p className="text-[10px] font-bold mt-1 text-gray-500 uppercase">
          Boletos Registrados: {totalBoletosAdmin} | Caja Total: ${cajaTotalPesos} MXN | Premio en Bolsa: ${cajaPremioPesos.toFixed(0)} MXN
        </p>
      </div>
      
      <table className="w-full border-collapse border-2 border-black text-[9px] uppercase font-mono">
        <thead>
          <tr className="bg-gray-200">
            <th className="border-2 border-black p-2 text-left">Jugador</th>
            {(partidos || []).map((p: any) => {
              const abrevL = (p.equipo_local || '').substring(0, 3).toUpperCase();
              const abrevV = (p.equipo_visitante || '').substring(0, 3).toUpperCase();
              return (
                <th key={p.id} className="border-2 border-black p-1 text-center w-12 text-[7px] leading-tight" title={`${p.equipo_local} vs ${p.equipo_visitante}`}>
                  <div className="flex flex-col items-center">
                    <span>{abrevL}</span>
                    <span className="text-[5px] text-gray-500 my-0.5">VS</span>
                    <span>{abrevV}</span>
                  </div>
                </th>
              )
            })}
            <th className="border-2 border-black p-2 text-center w-12">Goles</th>
            <th className="border-2 border-black p-2 text-center w-10">Pts</th>
          </tr>
        </thead>
        <tbody>
          {(rankingAdmin || []).map((r: any, index: number) => (
            <tr key={index} className="border-b-2 border-gray-300 hover:bg-gray-50">
              <td className="border-2 border-black p-2 font-bold">{r.nombre}</td>
              {(partidos || []).map((p: any) => {
                const pick = r.pronosticosDiccionario?.[p.id] || '-'
                // Lógica de resaltado: si el resultado real existe y coincide, resaltamos visualmente
                const acierto = p.resultado_real && pick === p.resultado_real;
                
                return (
                  <td key={p.id} className={`border-2 border-black p-1 text-center font-black ${esMarcadorExacto ? 'text-[8px]' : 'text-xs'} ${acierto ? 'bg-gray-300' : 'text-black'}`}>
                    {pick}
                  </td>
                )
              })}
              <td className="border-2 border-black p-2 text-center font-bold bg-gray-100">{r.prediccionGoles}</td>
              <td className="border-2 border-black p-2 text-center font-black bg-blue-50">{r.puntos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 text-center text-[10px] font-bold text-gray-500 uppercase">
        Documento generado automáticamente por el sistema CiberTeque. Modalidad: {quiniela.modalidad.replace('_', ' ')}
      </div>
    </div>
  );
}