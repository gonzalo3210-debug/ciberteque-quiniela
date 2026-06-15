export interface JugadorRanking {
  id: string; // El id del ticket
  usuario_id: string;
  nombre: string;
  puntos: number;
  golesDiff: number;
  posicion: number;
}

export interface GanadorCalculado {
  usuario_id: string;
  nombre: string;
  cantidad: number; // En pesos o créditos dependiendo del formato
  lugar: string;
}

export function calcularPremios(
  ranking: JugadorRanking[],
  tipoPremiacion: string,
  precioTicket: number,
  valorCredito: number = 30,
  porcentajePremio: number = 0.80
): { ganadores: GanadorCalculado[], desgloseTexto: string, totalBolsaPesos: number } {
  
  const totalBoletos = ranking.length;
  const totalRecaudadoPesos = totalBoletos * precioTicket * valorCredito;
  const bolsaPremioPesos = totalRecaudadoPesos * porcentajePremio;
  
  let desgloseTexto = '';
  const ganadores: GanadorCalculado[] = [];

  // 1. Agrupar jugadores por empates exactos (mismos puntos y misma diferencia de goles)
  const grupos: JugadorRanking[][] = [];
  if (ranking.length > 0) {
    let currentGroup = [ranking[0]];
    for (let i = 1; i < ranking.length; i++) {
      const prev = ranking[i - 1];
      const curr = ranking[i];
      if (curr.puntos === prev.puntos && curr.golesDiff === prev.golesDiff) {
        currentGroup.push(curr);
      } else {
        grupos.push(currentGroup);
        currentGroup = [curr];
      }
    }
    grupos.push(currentGroup);
  }

  // 2. Calcular repartición según el formato
  if (['unico', 'top2', 'top3'].includes(tipoPremiacion)) {
    let porcentajes: number[] = [];
    if (tipoPremiacion === 'unico') porcentajes = [1.0];
    else if (tipoPremiacion === 'top2') porcentajes = [0.70, 0.30];
    else if (tipoPremiacion === 'top3') porcentajes = [0.60, 0.25, 0.15];

    let lugarActual = 0; 
    
    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i];
      const lugaresTomados = grupo.length;
      let porcentajeTotalGrupo = 0;
      
      // Sumar los porcentajes de los lugares que ocupa este grupo
      for (let j = 0; j < lugaresTomados; j++) {
        if (lugarActual + j < porcentajes.length) {
          porcentajeTotalGrupo += porcentajes[lugarActual + j];
        }
      }
      
      if (porcentajeTotalGrupo > 0) {
        const premioPorPersona = (bolsaPremioPesos * porcentajeTotalGrupo) / grupo.length;
        const porcentajePorPersonaTexto = ((porcentajeTotalGrupo * 100) / grupo.length).toFixed(1);
        
        desgloseTexto += `\n🏅 Nivel de Premiación ${i + 1} (${grupo.length} jugador/es):\n`;
        grupo.forEach(jugador => {
          desgloseTexto += `- ${jugador.nombre} -> $${premioPorPersona.toFixed(0)} MXN (${porcentajePorPersonaTexto}%)\n`;
          ganadores.push({
            usuario_id: jugador.usuario_id,
            nombre: jugador.nombre,
            cantidad: premioPorPersona, // En PESOS
            lugar: `Nivel ${i + 1}`
          });
        });
      }
      
      lugarActual += lugaresTomados;
      if (lugarActual >= porcentajes.length) break; // Ya se repartió toda la bolsa
    }
  } 
  else if (tipoPremiacion === 'promo_unico' || tipoPremiacion === 'promo_top2') {
    desgloseTexto = `🎁 EVENTO PROMOCIONAL 🎁\n`;
    if (grupos.length > 0) {
      const grupo1 = grupos[0]; 
      desgloseTexto += `\n🥇 1er Nivel (${grupo1.length} empatados):\n`;
      grupo1.forEach(jugador => {
        desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
        ganadores.push({ usuario_id: jugador.usuario_id, nombre: jugador.nombre, cantidad: 1, lugar: '1er Lugar' });
      });

      if (tipoPremiacion === 'promo_top2' && grupo1.length === 1 && grupos.length > 1) {
        const grupo2 = grupos[1];
        desgloseTexto += `\n🥈 2do Nivel (${grupo2.length} empatados):\n`;
        grupo2.forEach(jugador => {
          desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
          ganadores.push({ usuario_id: jugador.usuario_id, nombre: jugador.nombre, cantidad: 1, lugar: '2do Lugar' });
        });
      }
    }
    desgloseTexto += `\n(Se abonarán automáticamente a sus billeteras digitales)`;
  }

  return { ganadores, desgloseTexto, totalBolsaPesos: bolsaPremioPesos };
}