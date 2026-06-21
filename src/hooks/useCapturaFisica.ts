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

  // --- EFECTOS INICIALES ---
  useEffect(() => {
    cargarEquiposDB();
    cargarPartidosJornada();
  }, []);

  // --- FUNCIONES ---
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
        .select('id, nombre_jornada, precio_ticket, fecha_cierre, estado, partidos (id, equipo_local, equipo_visitante, resultado_real)')
        .eq('estado', 'abierta')
        .order('fecha_cierre', { ascending: true });
        
      if (error) throw error;

      if (abiertas && abiertas.length > 0) {
        setQuinielasAbiertas(abiertas);
        setQuiniela(abiertas[0]);
        setPartidos(abiertas[0].partidos || []);
      }
    } catch (error: any) {
      toast.error('Error al cargar las jornadas activas.');
    }
  };

  const seleccionarQuiniela = (qa: any) => {
    setQuiniela(qa);
    setPartidos(qa.partidos || []);
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

  const guardarCapturaFisica = async () => {
    if (!capTelefono || !capNombre || !capGoles || !quiniela) {
      return toast.error('Faltan datos por llenar (Nombre, WhatsApp o Goles).');
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

      // 2. VALIDACIÓN DE PROMOCIONES GRATUITAS
      const esGratis = quiniela.precio_ticket === 0;
      if (esGratis) {
        const { data: tp } = await supabase.from('tickets').select('id').eq('usuario_id', uid).eq('quiniela_id', quiniela.id);
        if (tp && tp.length > 0) {
          toast.error(`El usuario ya tiene un boleto para esta jornada gratuita.`, { id: loadingId });
          setGuardandoCaptura(false);
          return; 
        }
      }

      // 3. LÓGICA DE COBRO MATEMÁTICO DIRECTA (1 Crédito = 1 Peso)
      const precio = Number(quiniela.precio_ticket ?? 1);
      const poderAdquisitivoTotal = creditosActuales + saldoPesosActual;

      // 🚨 MENSAJE UNIFICADO (Sin multiplicaciones)
      if (precio > 0 && poderAdquisitivoTotal < precio) {
        toast.error(`Saldo Insuficiente. Tiene $${poderAdquisitivoTotal} PESOS. Necesita $${precio} PESOS.`, { id: loadingId, duration: 5000 });
        setGuardandoCaptura(false);
        return;
      }

      // Procesar selecciones vacías como Empate (E)
      const seleccionesFinales = { ...capSelecciones };
      partidos.forEach(p => { if (!seleccionesFinales[p.id]) seleccionesFinales[p.id] = 'E'; });
      
      let nuevoCreditos = creditosActuales;
      let nuevoSaldoPesos = saldoPesosActual;

      // 4. DESCUENTO DE BILLETERA MIXTA
      if (precio > 0) {
        if (nuevoCreditos >= precio) {
          // Si tiene créditos suficientes, descontamos directo de ahí
          nuevoCreditos -= precio;
        } else {
          // Si no alcanzan los créditos, descontamos de la suma total
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

      // 5. GUARDAR TICKET Y PRONÓSTICOS
      const { data: tk, error: errTk } = await supabase
        .from('tickets')
        .insert([{ 
          usuario_id: uid, 
          quiniela_id: quiniela.id, 
          metodo_ingreso: 'fisico', 
          prediccion_goles_total: parseInt(capGoles) 
        }])
        .select()
        .single();
        
      if (errTk) throw errTk;
      
      const prons = Object.keys(seleccionesFinales).map(pId => ({ 
        ticket_id: tk.id, 
        partido_id: pId, 
        eleccion_usuario: seleccionesFinales[pId] 
      }));
      
      const { error: errProns } = await supabase.from('pronosticos').insert(prons);
      if (errProns) throw errProns;
      
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(uid, nuevoCreditos + nuevoSaldoPesos);

      // 6. GENERAR WHATSAPP Y TICKET DE IMPRESIÓN
      let seleccionesTexto = '';
      partidos.forEach(p => {
        const sel = seleccionesFinales[p.id];
        const pick = sel === 'L' ? p.equipo_local : sel === 'V' ? p.equipo_visitante : 'Empate';
        seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
      });

      const msgWa = `🎫 *QUINIELA CIBERTEQUE*\nHola ${capNombre}, tu jugada para *${quiniela.nombre_jornada}* se guardó correctamente.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate (Goles): *${capGoles}*\n\n🍀 ¡Mucha suerte!`;
      
      setLinkWaReciente(`https://wa.me/52${capTelefono}?text=${encodeURIComponent(msgWa)}`);
      setTicketAImprimir({ nombre: capNombre, telefono: capTelefono, selecciones: seleccionesFinales, goles: capGoles });
      
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
    quinielasAbiertas,
    quiniela,
    partidos,
    equipos,
    capTelefono,
    setCapTelefono,
    capNombre,
    setCapNombre,
    capUsuarioId,
    setCapUsuarioId,
    capSelecciones,
    setCapSelecciones,
    capGoles,
    setCapGoles,
    guardandoCaptura,
    linkWaReciente,
    setLinkWaReciente,
    ticketAImprimir,
    setTicketAImprimir,
    seleccionarQuiniela,
    buscarClienteParaCaptura,
    guardarCapturaFisica
  };
}