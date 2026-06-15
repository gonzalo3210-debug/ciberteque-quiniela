import React from 'react';

export default function PlantillaTablaResultados({ quiniela, rankingAdmin, totalBoletosAdmin }: any) {
  if (!quiniela) return null;

  return (
    <div className="hidden print:block print:w-full print:bg-white print:text-black zona-impresion z-[99999] p-8">
      <div className="text-center mb-8">
        <h1 className="font-black text-3xl uppercase tracking-widest text-black border-b-4 border-black inline-block pb-2">RESULTADOS FINALES</h1>
        <h2 className="text-2xl font-bold uppercase mt-4">{quiniela.nombre_jornada}</h2>
        <p className="text-sm font-bold mt-2 text-gray-600 uppercase">Boletos Registrados: {totalBoletosAdmin} | Formato: {quiniela.tipo_premiacion}</p>
      </div>
      <table className="w-full border-collapse border-2 border-black text-sm uppercase">
        <thead>
          <tr className="bg-gray-200">
            <th className="border-2 border-black p-3 text-center w-16">Pos</th>
            <th className="border-2 border-black p-3 text-left">Jugador</th>
            <th className="border-2 border-black p-3 text-center w-24">Dif. Goles</th>
            <th className="border-2 border-black p-3 text-center w-24">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {(rankingAdmin || []).map((r: any, index: number) => (
            <tr key={index} className="border-b border-black">
              <td className="border-2 border-black p-3 text-center font-black text-lg">{r.posicion}</td>
              <td className="border-2 border-black p-3 font-bold text-lg">{r.nombre}</td>
              <td className="border-2 border-black p-3 text-center font-bold text-lg">{r.golesDiff === 999 ? '-' : r.golesDiff}</td>
              <td className="border-2 border-black p-3 text-center font-black text-xl">{r.puntos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 text-center text-xs font-bold text-gray-500 uppercase">CiberTeque - Generado automáticamente</div>
    </div>
  );
}