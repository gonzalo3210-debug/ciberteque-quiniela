import React from 'react';

export default function PlantillaReciboJugada({ quiniela, partidos, ticketAImprimir }: any) {
  if (!quiniela || !ticketAImprimir) return null;

  return (
    <div className="hidden print:block zona-impresion text-black bg-white" style={{ fontFamily: 'monospace', fontSize: '12px', width: '80mm', padding: '0', margin: '0' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px', borderBottom: '1px dashed black', paddingBottom: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>CIBERTEQUE</h2>
        <p style={{ margin: 0, fontSize: '10px' }}>PRONÓSTICOS DEPORTIVOS</p>
        <p style={{ margin: '5px 0 0 0', fontSize: '11px', fontWeight: 'bold' }}>{quiniela.nombre_jornada}</p>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <p style={{ margin: 0 }}><strong>Jugador:</strong> {ticketAImprimir.nombre}</p>
        <p style={{ margin: 0 }}><strong>Cel:</strong> {ticketAImprimir.telefono}</p>
        <p style={{ margin: 0 }}><strong>Fecha:</strong> {new Date().toLocaleString()}</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
         <thead>
           <tr style={{ borderBottom: '1px solid black' }}>
             <th style={{ textAlign: 'left', padding: '2px 0' }}>Partido</th>
             <th style={{ textAlign: 'center', padding: '2px 0' }}>Pick</th>
           </tr>
         </thead>
         <tbody>
           {(partidos || []).map((p: any, i: number) => (
             <tr key={p.id} style={{ borderBottom: '1px dotted #ccc' }}>
               <td style={{ fontSize: '10px', padding: '3px 0' }}>{i+1}. {p.equipo_local.substring(0,10)} v {p.equipo_visitante.substring(0,10)}</td>
               <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{ticketAImprimir.selecciones[p.id] || '-'}</td>
             </tr>
           ))}
         </tbody>
      </table>
      <div style={{ textAlign: 'center', borderTop: '1px dashed black', paddingTop: '10px' }}>
        <p style={{ margin: 0, fontSize: '14px' }}><strong>Desempate:</strong> {ticketAImprimir.goles} Goles</p>
        <p style={{ margin: '10px 0 0 0', fontSize: '10px' }}>¡Conserva este recibo!</p>
        <p style={{ margin: 0, fontSize: '9px' }}>Revisa en: ciberteque-quiniela.vercel.app</p>
      </div>
    </div>
  );
}