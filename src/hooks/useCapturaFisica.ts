// src/hooks/useCapturaFisica.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export function useCapturaFisica(actualizarSaldoGlobal?: (id: string, nuevo: number) => void) {
  // --- ESTADOS ---
  const [quinielasAbiertas, setQuinielasAbiertas] = useState<any[]>([]);
  const [quiniela, setQuiniela] = useState<any>(null);
  const [partidos, setPartidos] = useState<any[]>([]);
  const [equipos, setEquipos] = useState<any[]>([]);
  
  const [capTelefono, setCapTelefono] = useState('');
  const [capNombre, setCapNombre] = useState('');
  const [capUsuarioId, setCapUsuarioId] = useState<string | null>(null);
  const [capSelecciones, setCapSelecciones] = useState<Record<string, string>>({});
  const [capGoles, setCapGoles] = useState('');
  
  const [guardandoCaptura, setGuardandoCaptura] = useState(false);
  const [linkWaReciente, setLinkWaReciente] = useState<string | null>(null);
  const [ticketAImprimir, setTicketAImprimir] = useState<any>(null);

  // ⚡ Estado para saber cuántos lugares hay ocupados en el Sorteo
  const [ocupacionSorteo, setOcupacionSorteo] = useState(0);

  // --- EFECTOS INICIALES ---
  useEffect(() => {
    cargarEquiposDB();
    cargarPartidosJornada();
  }, []);

  // 🧠 NUEVO: Cálculo automático de goles movido al Hook (Modularidad Estricta)
  useEffect(() => {
    if (quiniela?.modalidad === 'marcador_exacto') {
      let sumaTotal = 0;
      Object.values(capSelecciones).forEach(seleccion => {
        if (typeof seleccion === 'string' && seleccion.includes('-')) {
          const [l, v] = seleccion.split('-');
          sumaTotal += (parseInt(l) || 0) + (parseInt(v) || 0);
        }
      });
      setCapGoles(sumaTotal.toString());
    }
  }, [capSelecciones, quiniela?.modalidad]);

  // --- FUNCIONES DE CARGA ---
  const cargarEquiposDB = async () => {
    try {
      const { data: eq, error } = await supabase.from('equipos').select('nombre, logo_url');
      if (error) throw error;
      if (eq) setEquipos(eq);
    } catch (error: any) {
      toast.error('Error al cargar logos de equipos.');
    }
  };

  const cargarPartidosJornada = async () => {
    try {
      const { data: abiertas, error } = await supabase
        .from('quinielas')
        .select('id, nombre_jornada, precio_ticket, fecha_cierre, estado, modalidad, partidos (id, equipo_local, equipo_visitante, resultado_real)')
        .eq('estado', 'abierta')
        .order('fecha_cierre', { ascending: true });
        
      if (error) throw error;

      if (abiertas && abiertas.length > 0) {
        setQuinielasAbiertas(abiertas);
        seleccionarQuiniela(abiertas[0]); 
      }
    } catch (error: any) {
      toast.error('Error al cargar las jornadas activas.');
    }
  };

  const seleccionarQuiniela = async (qa: any) => {
    setQuiniela(qa);
    setPartidos(qa.partidos || []);
    setCapSelecciones({}); 
    
    // Calcular cuántos lugares van si es modalidad sorteo[cite: 1]
    if (qa.modalidad === 'sorteo') {
      const { count } = await supabase.from('tickets').select('id', { count: 'exact' }).eq('quiniela_id', qa.id);
      setOcupacionSorteo(count || 0);
    } else {
      setOcupacionSorteo(0);
    }
  };

  const buscarClienteParaCaptura = async (tel: string) => {
    setLinkWaReciente(null); 
    setTicketAImprimir(null);
    setCapTelefono(tel);
    
    if (tel && tel.length >= 10) {
      const { data } = await supabase.from('usuarios').select('id, nombre').eq('telefono', tel).single();
      if (data) { setCapUsuarioId(data.id); setCapNombre(data.nombre); } 
      else { setCapUsuarioId(null); setCapNombre(''); }
    } else {
      setCapUsuarioId(null); setCapNombre('');
    }
  };

  // 🧠 NUEVO: Manejo del estado del Marcador Exacto encapsulado en el Hook
  const obtenerMarcador = (partidoId: string, equipo: 'L' | 'V') => {
    const seleccion = capSelecciones[partidoId];
    if (!seleccion || !seleccion.includes('-')) return '';
    const [l, v] = seleccion.split('-');
    return equipo === 'L' ? l : v;
  };

  const cambiarMarcador = (partidoId: string, equipo: 'L' | 'V', valor: string) => {
    // 1. Limpiamos: permitimos string vacío o solo números
    const val = valor === '' ? '' : valor.replace(/[^0-9]/g, '');
    
    // 2. Inicializamos con un guion simple en lugar de '0-0'
    let seleccionActual = capSelecciones[partidoId] || '-';
    if (!seleccionActual.includes('-')) seleccionActual = '-';
    
    let [l, v] = seleccionActual.split('-');
    if (equipo === 'L') l = val;
    else v = val;
    
    setCapSelecciones(prev => ({
      ...prev,
      [partidoId]: `${l}-${v}`
    }));
  };

  // --- LÓGICA DE GUARDADO ---
  const guardarCapturaFisica = async () => {
    const esSorteo = quiniela?.modalidad === 'sorteo';

    if (!capTelefono || !capNombre || (!esSorteo && !capGoles) || !quiniela) {
      return toast.error('Faltan datos por llenar.');
    }

    if (esSorteo && ocupacionSorteo >= 8) {
      return toast.error('La sala de sorteo ya está llena (8/8).');
    }
    
    setGuardandoCaptura(true);
    const loadingId = toast.loading('Procesando cobro y guardando ticket...');
    
    try {
      let uid = capUsuarioId;
      let creditosActuales = 0;
      let saldoPesosActual = 0;

      // 1. OBTENER O CREAR USUARIO
      if (!uid) {
        const { data: nu, error: errNu } = await supabase
          .from('usuarios')
          .insert([{ nombre: capNombre, telefono: capTelefono, creditos_disponibles: 0, saldo_pesos: 0 }])
          .select()
          .single();
        if (errNu) throw errNu;
        uid = nu.id;
      } else {
        const { data: eu, error: errEu } = await supabase
          .from('usuarios')
          .select('creditos_disponibles, saldo_pesos')
          .eq('id', uid)
          .single();
        if (errEu) throw errEu;
        if (eu) {
          creditosActuales = Number(eu.creditos_disponibles) || 0;
          saldoPesosActual = Number(eu.saldo_pesos) || 0;
        }
      }

      // 2. VALIDACIÓN DE PROMOCIONES GRATUITAS[cite: 1]
      const esGratis = quiniela.precio_ticket === 0;
      if (esGratis) {
        const { data: tp } = await supabase.from('tickets').select('id').eq('usuario_id', uid).eq('quiniela_id', quiniela.id);
        if (tp && tp.length > 0) {
          toast.error(`El usuario ya tiene un boleto para esta jornada gratuita.`, { id: loadingId });
          setGuardandoCaptura(false);
          return; 
        }
      }

      // 3. LÓGICA DE COBRO MATEMÁTICO DIRECTA
      const precio = Number(quiniela.precio_ticket ?? 1);
      const poderAdquisitivoTotal = creditosActuales + saldoPesosActual;

      if (precio > 0 && poderAdquisitivoTotal < precio) {
        toast.error(`Saldo Insuficiente. Tiene $${poderAdquisitivoTotal} PESOS. Necesita $${precio} PESOS.`, { id: loadingId, duration: 5000 });
        setGuardandoCaptura(false);
        return;
      }

      // Autocompletado inteligente con corrección de blancos
      const esMarcadorExacto = quiniela.modalidad === 'marcador_exacto';
      const seleccionesFinales = { ...capSelecciones };
      
      if (!esSorteo) {
        partidos.forEach(p => { 
          let sel = seleccionesFinales[p.id];
          if (esMarcadorExacto) {
            // Reemplazamos campos vacíos o incompletos con '0-0' para la base de datos
            if (!sel || sel === '-' || sel.startsWith('-') || sel.endsWith('-')) {
              seleccionesFinales[p.id] = '0-0';
            }
          } else {
            if (!sel) seleccionesFinales[p.id] = 'E'; 
          }
        });
      }
      
      let nuevoCreditos = creditosActuales;
      let nuevoSaldoPesos = saldoPesosActual;

      // 4. DESCUENTO DE BILLETERA MIXTA
      if (precio > 0) {
        if (nuevoCreditos >= precio) {
          nuevoCreditos -= precio;
        } else {
          const faltante = precio - nuevoCreditos;
          nuevoCreditos = 0;
          nuevoSaldoPesos -= faltante;
        }

        const { error: errUpd } = await supabase.from('usuarios').update({ 
          creditos_disponibles: nuevoCreditos, 
          saldo_pesos: nuevoSaldoPesos 
        }).eq('id', uid);
        
        if (errUpd) throw errUpd;

        await supabase.from('transacciones_creditos').insert([{ 
          usuario_id: uid, 
          cantidad: -precio, 
          tipo_movimiento: 'juego_ticket_fisico', 
          descripcion: `Ticket físico ${quiniela.nombre_jornada}` 
        }]);
      }

      // 5. GUARDAR TICKET
      const { data: tk, error: errTk } = await supabase
        .from('tickets')
        .insert([{ 
          usuario_id: uid, 
          quiniela_id: quiniela.id, 
          metodo_ingreso: 'fisico', 
          prediccion_goles_total: esSorteo ? 0 : parseInt(capGoles) 
        }])
        .select()
        .single();
        
      if (errTk) throw errTk;
      
      // Guardar Pronósticos SOLO si NO es sorteo
      if (!esSorteo) {
        const prons = Object.keys(seleccionesFinales).map(pId => ({ 
          ticket_id: tk.id, 
          partido_id: pId, 
          eleccion_usuario: seleccionesFinales[pId] 
        }));
        const { error: errProns } = await supabase.from('pronosticos').insert(prons);
        if (errProns) throw errProns;
      } else {
        setOcupacionSorteo(prev => prev + 1);
      }
      
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(uid, nuevoCreditos + nuevoSaldoPesos);

      // 6. GENERAR WHATSAPP Y TICKET DE IMPRESIÓN
      let msgWa = '';
      if (esSorteo) {
        msgWa = `🎫 *SORTEO MUNDIAL CIBERTEQUE*\nHola ${capNombre}, tu lugar para la sala *${quiniela.nombre_jornada}* ha sido asegurado con éxito.\n\nEspera a que la sala se llene (8 participantes) para conocer qué equipo te será asignado aleatoriamente.\n\n🍀 ¡Mucha suerte!`;
      } else {
        let seleccionesTexto = '';
        partidos.forEach(p => {
          const sel = seleccionesFinales[p.id];
          let pick = '';
          if (esMarcadorExacto) {
            pick = sel; 
          } else {
            pick = sel === 'L' ? p.equipo_local : sel === 'V' ? p.equipo_visitante : 'Empate';
          }
          seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
        });
        msgWa = `🎫 *QUINIELA CIBERTEQUE*\nHola ${capNombre}, tu jugada para *${quiniela.nombre_jornada}* se guardó correctamente.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate (Goles): *${capGoles}*\n\n🍀 ¡Mucha suerte!`;
      }
      
      setLinkWaReciente(`https://wa.me/52${capTelefono}?text=${encodeURIComponent(msgWa)}`);
      setTicketAImprimir({ nombre: capNombre, telefono: capTelefono, selecciones: seleccionesFinales, goles: capGoles, modalidad: quiniela.modalidad }); 
      
      toast.success('🎟️ ¡Boleto pagado y guardado con éxito!', { id: loadingId });
      
      // Limpiar formulario
      setCapTelefono(''); 
      setCapNombre(''); 
      setCapSelecciones({}); 
      setCapGoles(''); 
      setCapUsuarioId(null);

    } catch (e: any) { 
      toast.error(e.message || 'Error al guardar captura', { id: loadingId }); 
    } finally { 
      setGuardandoCaptura(false); 
    }
  };

  return {
    quinielasAbiertas, quiniela, partidos, equipos,
    capTelefono, setCapTelefono, capNombre, setCapNombre, capUsuarioId, setCapUsuarioId,
    capSelecciones, setCapSelecciones, capGoles, setCapGoles, guardandoCaptura,
    linkWaReciente, setLinkWaReciente, ticketAImprimir, setTicketAImprimir,
    ocupacionSorteo,
    seleccionarQuiniela, buscarClienteParaCaptura, guardarCapturaFisica,
    obtenerMarcador, cambiarMarcador // ⚡ NUEVAS FUNCIONES EXPORTADAS
  };
}