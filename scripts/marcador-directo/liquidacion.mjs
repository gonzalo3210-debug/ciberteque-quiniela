// scripts/marcador-directo/liquidacion.mjs
//
// LIQUIDACIÓN AUTOMÁTICA de quinielas: lógica PURA (sin red, sin base,
// sin reloj propio). Es la réplica fiel de la liquidación manual de la
// app, tomada de su código real:
//
//  - Puntos por boleto y ranking: el cálculo de
//    src/hooks/useArbitro.ts (cargarDetallesQuiniela, que arma el
//    ranking con el que se liquida, y guardarYCalificar, que escribe
//    puntos_totales con el mismo algoritmo).
//  - Reparto del premio: puerto exacto de
//    src/utils/calculadoraPremios.ts (calcularPremios), llamado por
//    cerrarJornadaDefinitivo con valorCredito = 1 y 80% de premio.
//  - Pago a billetera: el plan de procesarPagoPremio de useArbitro.ts
//    (saldo = creditos_disponibles + saldo_pesos; cobro automático de
//    la deuda con el premio; todo queda unificado en saldo_pesos; los
//    movimientos son premio_quiniela por el premio COMPLETO y, si
//    hubo cobro, abono_deuda negativo).
//
// Autorización: Gonzalo aprobó la liquidación automática el
// 2026-11-17. Aplica SOLO a modos por puntos (clásica y marcador
// exacto); el sorteo se excluye (su cierre es por supervivencia y
// sigue manual). La ventana de seguridad y los candados viven aquí
// como funciones puras; el ejecutor (red y base) está en
// marcador-directo.mjs.

export const PORCENTAJE_PREMIO = 0.8;
export const PORCENTAJE_ADMIN = 0.2;

// ---------- Goles totales -------------------------------------------------

/** Suma de goles de los partidos con AMBOS goles capturados. */
export function totalesDeGoles(partidos) {
  let suma = 0;
  let hayGoles = false;
  for (const p of partidos || []) {
    if (
      p.goles_local !== null &&
      p.goles_local !== undefined &&
      p.goles_visitante !== null &&
      p.goles_visitante !== undefined
    ) {
      suma += p.goles_local + p.goles_visitante;
      hayGoles = true;
    }
  }
  return { suma, hayGoles };
}

/**
 * El goles_totales_real con el que la app liquida: si hay goles
 * capturados manda su suma (así lo deja guardarYCalificar); si no hay
 * ninguno, vale el que la quiniela ya trajera guardado (o null).
 */
export function golesTotalesEfectivos(quiniela, partidos) {
  const { suma, hayGoles } = totalesDeGoles(partidos);
  if (hayGoles) return suma;
  return quiniela.goles_totales_real ?? null;
}

// ---------- Puntos y tabla (réplica de useArbitro.ts) ---------------------

/**
 * Puntos finales de UN boleto, con el algoritmo EXACTO de la app:
 *  - marcador_exacto: la elección debe traer "-" y el partido debe
 *    tener goles capturados; marcador exacto = 3, solo tendencia = 1.
 *    (Sin "-" o sin goles, la app da 0 — se replica tal cual.)
 *  - demás modos: 1 si resultado_real === elección.
 * Un pronóstico sin partido o sin resultado_real no suma.
 */
export function puntosTicketLiquidacion(modalidad, ticket, partidosPorId) {
  let puntos = 0;
  for (const pron of ticket.pronosticos || []) {
    const p = partidosPorId.get(pron.partido_id);
    if (!p || !p.resultado_real) continue;
    if (modalidad === 'marcador_exacto') {
      const eleccion = String(pron.eleccion_usuario ?? '');
      if (
        eleccion.includes('-') &&
        p.goles_local !== null &&
        p.goles_local !== undefined &&
        p.goles_visitante !== null &&
        p.goles_visitante !== undefined
      ) {
        const [pl, pv] = eleccion.split('-').map(Number);
        if (pl === p.goles_local && pv === p.goles_visitante) {
          puntos += 3;
        } else {
          const tendencia = pl > pv ? 'L' : pl < pv ? 'V' : 'E';
          if (tendencia === p.resultado_real) puntos += 1;
        }
      }
    } else if (p.resultado_real === pron.eleccion_usuario) {
      puntos += 1;
    }
  }
  return puntos;
}

/**
 * Tabla final de la quiniela (la del rankingAdmin con el que liquida
 * la app): puntos, diferencia de goles contra el total efectivo
 * (999 si no hay total), orden puntos desc / diferencia asc y lugares
 * compartidos en empate exacto. `quiniela.goles_totales_real` debe
 * venir YA efectivo (ver golesTotalesEfectivos).
 *
 * @returns [{ ticket_id, usuario_id, nombre, puntos, golesDiff, posicion }]
 */
export function calcularTablaLiquidacion(quiniela, tickets, partidos, nombresPorUsuario = {}) {
  const partidosPorId = new Map((partidos || []).map((p) => [p.id, p]));
  const golesRealesAct =
    quiniela.goles_totales_real !== null && quiniela.goles_totales_real !== undefined
      ? quiniela.goles_totales_real
      : -1;

  const filas = (tickets || []).map((ticket) => ({
    ticket_id: ticket.id,
    usuario_id: ticket.usuario_id,
    nombre: nombresPorUsuario[ticket.usuario_id] || 'Mostrador',
    puntos: puntosTicketLiquidacion(quiniela.modalidad, ticket, partidosPorId),
    golesDiff:
      golesRealesAct !== -1
        ? Math.abs((ticket.prediccion_goles_total || 0) - golesRealesAct)
        : 999,
  }));

  filas.sort((a, b) => b.puntos - a.puntos || a.golesDiff - b.golesDiff);
  filas.forEach((fila, idx) => {
    if (idx > 0) {
      const anterior = filas[idx - 1];
      fila.posicion =
        fila.puntos === anterior.puntos && fila.golesDiff === anterior.golesDiff
          ? anterior.posicion
          : idx + 1;
    } else {
      fila.posicion = 1;
    }
  });
  return filas;
}

// ---------- Reparto del premio (puerto de calculadoraPremios.ts) ----------

/**
 * Puerto fiel de calcularPremios de src/utils/calculadoraPremios.ts.
 * El ranking debe venir ordenado (calcularTablaLiquidacion). Los
 * empates EXACTOS (puntos y diferencia) forman un grupo que se reparte
 * la suma de los porcentajes de los lugares que ocupa.
 *
 * @returns {{ ganadores: [{usuario_id, nombre, cantidad, lugar}],
 *             desgloseTexto: string, totalBolsaPesos: number,
 *             totalRecaudado: number }}
 */
export function calcularPremios(ranking, tipoPremiacion, precioTicket, valorCredito = 1, porcentajePremio = PORCENTAJE_PREMIO) {
  const totalBoletos = ranking.length;
  const totalRecaudado = totalBoletos * precioTicket * valorCredito;
  const bolsaPremioPesos = totalRecaudado * porcentajePremio;

  let desgloseTexto = '';
  const ganadores = [];

  // 1. Agrupar por empates exactos (mismos puntos y misma diferencia).
  const grupos = [];
  if (ranking.length > 0) {
    let grupoActual = [ranking[0]];
    for (let i = 1; i < ranking.length; i++) {
      const prev = ranking[i - 1];
      const curr = ranking[i];
      if (curr.puntos === prev.puntos && curr.golesDiff === prev.golesDiff) {
        grupoActual.push(curr);
      } else {
        grupos.push(grupoActual);
        grupoActual = [curr];
      }
    }
    grupos.push(grupoActual);
  }

  // 2. Repartición según el formato.
  if (['unico', 'top2', 'top3'].includes(tipoPremiacion)) {
    let porcentajes = [];
    if (tipoPremiacion === 'unico') porcentajes = [1.0];
    else if (tipoPremiacion === 'top2') porcentajes = [0.7, 0.3];
    else if (tipoPremiacion === 'top3') porcentajes = [0.6, 0.25, 0.15];

    let lugarActual = 0;
    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i];
      const lugaresTomados = grupo.length;
      let porcentajeTotalGrupo = 0;
      for (let j = 0; j < lugaresTomados; j++) {
        if (lugarActual + j < porcentajes.length) {
          porcentajeTotalGrupo += porcentajes[lugarActual + j];
        }
      }

      if (porcentajeTotalGrupo > 0) {
        const premioPorPersona = (bolsaPremioPesos * porcentajeTotalGrupo) / grupo.length;
        const porcentajePorPersonaTexto = ((porcentajeTotalGrupo * 100) / grupo.length).toFixed(1);

        desgloseTexto += `\n🏅 Nivel de Premiación ${i + 1} (${grupo.length} jugador/es):\n`;
        grupo.forEach((jugador) => {
          desgloseTexto += `- ${jugador.nombre} -> $${premioPorPersona.toFixed(0)} MXN (${porcentajePorPersonaTexto}%)\n`;
          ganadores.push({
            usuario_id: jugador.usuario_id,
            nombre: jugador.nombre,
            cantidad: premioPorPersona,
            lugar: `Nivel ${i + 1}`,
          });
        });
      }

      lugarActual += lugaresTomados;
      if (lugarActual >= porcentajes.length) break;
    }
  } else if (tipoPremiacion === 'promo_unico' || tipoPremiacion === 'promo_top2') {
    desgloseTexto = `🎁 EVENTO PROMOCIONAL 🎁\n`;
    if (grupos.length > 0) {
      const grupo1 = grupos[0];
      desgloseTexto += `\n🥇 1er Nivel (${grupo1.length} empatados):\n`;
      grupo1.forEach((jugador) => {
        desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
        ganadores.push({
          usuario_id: jugador.usuario_id,
          nombre: jugador.nombre,
          cantidad: 1,
          lugar: '1er Lugar',
        });
      });

      if (tipoPremiacion === 'promo_top2' && grupo1.length === 1 && grupos.length > 1) {
        const grupo2 = grupos[1];
        desgloseTexto += `\n🥈 2do Nivel (${grupo2.length} empatados):\n`;
        grupo2.forEach((jugador) => {
          desgloseTexto += `- ${jugador.nombre} -> Gana 1 Crédito\n`;
          ganadores.push({
            usuario_id: jugador.usuario_id,
            nombre: jugador.nombre,
            cantidad: 1,
            lugar: '2do Lugar',
          });
        });
      }
    }
    desgloseTexto += `\n(Se abonarán automáticamente a sus billeteras digitales)`;
  }

  return { ganadores, desgloseTexto, totalBolsaPesos: bolsaPremioPesos, totalRecaudado };
}

// ---------- Pago a billetera (plan de procesarPagoPremio) -----------------

/**
 * Plan puro de procesarPagoPremio (useArbitro.ts): dado el renglón
 * actual del usuario y el premio, devuelve la actualización de
 * `usuarios` y los movimientos de `transacciones_creditos` EXACTOS
 * que hace la app:
 *  - saldo actual = creditos_disponibles + saldo_pesos.
 *  - cobro de deuda = min(premio, |deuda_pesos|); el sobrante se suma.
 *  - todo queda en saldo_pesos, creditos_disponibles en 0.
 *  - movimientos: premio_quiniela por el premio COMPLETO y, si hubo
 *    cobro, abono_deuda por -cobro con su descripción fija.
 */
export function planPagoPremio(usuario, cantidadPremio, descripcionPremio) {
  const saldoActual =
    Number(usuario?.creditos_disponibles || 0) + Number(usuario?.saldo_pesos || 0);
  let deudaActual = Math.abs(Number(usuario?.deuda_pesos || 0));
  let premioSobrante = cantidadPremio;
  let cobroDeuda = 0;

  if (deudaActual > 0) {
    cobroDeuda = Math.min(premioSobrante, deudaActual);
    premioSobrante -= cobroDeuda;
    deudaActual -= cobroDeuda;
  }

  const nuevoSaldo = saldoActual + premioSobrante;

  const transacciones = [
    {
      usuario_id: usuario.id,
      cantidad: cantidadPremio,
      tipo_movimiento: 'premio_quiniela',
      descripcion: descripcionPremio,
    },
  ];
  if (cobroDeuda > 0) {
    transacciones.push({
      usuario_id: usuario.id,
      cantidad: -cobroDeuda,
      tipo_movimiento: 'abono_deuda',
      descripcion: 'Cobro automático de saldo pendiente por premio ganado',
    });
  }

  return {
    saldoActual,
    deudaInicial: Math.abs(Number(usuario?.deuda_pesos || 0)),
    cobroDeuda,
    premioSobrante,
    nuevoSaldo,
    deudaRestante: deudaActual,
    actualizacion: {
      creditos_disponibles: 0,
      saldo_pesos: nuevoSaldo,
      deuda_pesos: deudaActual,
    },
    transacciones,
  };
}

/** Descripción del movimiento de premio, como la arma la app. */
export function descripcionPremio(ganador, nombreJornada) {
  return `Premio ${ganador.lugar}: ${nombreJornada}`;
}

// ---------- Elegibilidad, foto y ventana de seguridad ---------------------

/**
 * ¿La quiniela puede entrar a la ventana de liquidación automática?
 * Réplica de los candados de cerrarJornadaDefinitivo: no sorteo,
 * abierta, con partidos TODOS con resultado y marcados finales, con
 * total de goles disponible (capturado o ya guardado) y con boletos.
 * (El conteo de boletos lo confirma el ejecutor al construir el plan.)
 */
export function evaluarElegibilidad(quiniela, partidos) {
  if (!quiniela) return { elegible: false, motivo: 'sin quiniela' };
  if (quiniela.modalidad === 'sorteo') {
    return { elegible: false, motivo: 'modalidad sorteo: su cierre es manual' };
  }
  if (quiniela.estado !== 'abierta') {
    return { elegible: false, motivo: `la quiniela ya no está abierta (${quiniela.estado})` };
  }
  if (!partidos || partidos.length === 0) {
    return { elegible: false, motivo: 'la quiniela no tiene partidos' };
  }
  if (partidos.some((p) => !p.resultado_real)) {
    return { elegible: false, motivo: 'falta resultado en algún partido' };
  }
  if (partidos.some((p) => !p.es_final)) {
    return { elegible: false, motivo: 'aún hay partidos sin marcar final' };
  }
  if (golesTotalesEfectivos(quiniela, partidos) === null) {
    return {
      elegible: false,
      motivo: 'sin total de goles (ni capturado ni guardado): la app pediría el resultado oficial a mano',
    };
  }
  return { elegible: true };
}

/**
 * Foto canónica de los marcadores al momento: cualquier cambio en
 * goles, resultado, banderas de final o en el total de goles produce
 * una foto distinta (y por tanto reinicia la ventana).
 */
export function fotoMarcadores(partidos, golesTotalesReal) {
  const filas = (partidos || [])
    .map(
      (p) =>
        `${p.id}:${p.goles_local ?? '·'}-${p.goles_visitante ?? '·'}:` +
        `${p.resultado_real ?? '·'}:${p.es_final ? 'F' : '·'}`
    )
    .sort();
  return `${golesTotalesReal ?? '·'}|${filas.join('|')}`;
}

/** Estado vacío de liquidaciones (la forma que se persiste en disco). */
export function crearEstadoLiquidaciones() {
  return { v: 1, ventanas: {}, enCurso: {}, liquidadas: {} };
}

/**
 * Evalúa la ventana de seguridad de UNA quiniela (función pura).
 *
 * @param entradaPrevia  { foto, desdeMs } | undefined
 * @param foto           fotoMarcadores actual
 * @param ahoraMs        instante del ciclo
 * @param ventanaMs      duración de la ventana (10 min por defecto)
 * @returns {{ accion: 'iniciar'|'reiniciar'|'esperar'|'liquidar',
 *             entrada: {foto, desdeMs}|null, restantesMs: number }}
 *   - iniciar:   no había ventana; `entrada` es la nueva.
 *   - reiniciar: la foto cambió; `entrada` es la nueva (reloj a cero).
 *   - esperar:   misma foto, ventana aún corriendo.
 *   - liquidar:  misma foto y ventana cumplida.
 */
export function evaluarVentana(entradaPrevia, foto, ahoraMs, ventanaMs) {
  if (!entradaPrevia || entradaPrevia.foto !== foto) {
    return {
      accion: entradaPrevia ? 'reiniciar' : 'iniciar',
      entrada: { foto, desdeMs: ahoraMs },
      restantesMs: ventanaMs,
    };
  }
  const transcurrido = ahoraMs - entradaPrevia.desdeMs;
  if (transcurrido >= ventanaMs) {
    return { accion: 'liquidar', entrada: entradaPrevia, restantesMs: 0 };
  }
  return {
    accion: 'esperar',
    entrada: entradaPrevia,
    restantesMs: ventanaMs - transcurrido,
  };
}

// ---------- Plan completo y diario ----------------------------------------

/**
 * Plan completo de liquidación (sin tocar la base): tabla final,
 * ganadores con montos, totales y los puntos que hay que escribir en
 * cada boleto. Los saldos de los ganadores NO van aquí: la app los
 * lee al momento de pagar, y el ejecutor hace lo mismo.
 */
export function construirPlanLiquidacion(quiniela, tickets, partidos, nombresPorUsuario = {}) {
  const golesReales = golesTotalesEfectivos(quiniela, partidos);
  const quinielaEfectiva = { ...quiniela, goles_totales_real: golesReales };
  const tabla = calcularTablaLiquidacion(quinielaEfectiva, tickets, partidos, nombresPorUsuario);
  const precioTicket = quiniela.precio_ticket ?? 30;
  const tipoPremiacion = quiniela.tipo_premiacion || 'unico';
  const premios = calcularPremios(tabla, tipoPremiacion, precioTicket, 1, PORCENTAJE_PREMIO);

  const partidosPorId = new Map((partidos || []).map((p) => [p.id, p]));
  const puntosPorTicket = {};
  for (const ticket of tickets || []) {
    puntosPorTicket[ticket.id] = puntosTicketLiquidacion(
      quiniela.modalidad,
      ticket,
      partidosPorId
    );
  }

  return {
    golesTotalesReal: golesReales,
    tabla,
    ganadores: premios.ganadores,
    desgloseTexto: premios.desgloseTexto,
    totalRecaudado: premios.totalRecaudado,
    bolsaPremios: premios.totalBolsaPesos,
    comision: premios.totalRecaudado - premios.totalBolsaPesos,
    puntosPorTicket,
  };
}

/** Ganadores aún no pagados según el diario (para reanudar sin duplicar). */
export function ganadoresPendientes(ganadores, pagadosIds) {
  const pagados = new Set(pagadosIds || []);
  return (ganadores || []).filter((g) => !pagados.has(g.usuario_id));
}
