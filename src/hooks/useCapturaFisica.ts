import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export function useCapturaFisica(actualizarSaldoGlobal?: (id: string, nuevo: number) => void) {
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

  useEffect(() => {
    cargarEquiposDB();
    cargarPartidosJornada();
  }, []);

  const cargarEquiposDB = async () => {
    const { data } = await supabase.from('equipos').select('nombre, logo_url');
    if (data) setEquipos(data);
  };

  const cargarPartidosJornada = async () => {
    const { data } = await supabase
      .from('quinielas')
      .select('id, nombre_jornada, precio_ticket, fecha_cierre, estado, partidos (id, equipo_local, equipo_visitante, resultado_real)')
      .eq('estado', 'abierta')
      .order('fecha_cierre', { ascending: true });
      
    if (data && data.length > 0) {
      setQuinielasAbiertas(data);
      setQuiniela(data[0]);
      setPartidos(data[0].partidos || []);
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
    if (!capTelefono || !capNombre || !capGoles || !quiniela) return toast.error('Faltan datos por llenar.');
    setGuardandoCaptura(true);
    const loadingId = toast.loading('Guardando ticket...');
    
    try {
      let uid = capUsuarioId;
      let creditosActuales = 0;

      if (!uid) {
        const { data: nu } = await supabase.from('usuarios').insert([{ nombre: capNombre, telefono: capTelefono, creditos_disponibles: 0, saldo_pesos: 0 }]).select().single();
        uid = nu.id;
      } else {
        const { data: eu } = await supabase.from('usuarios').select('creditos_disponibles').eq('id', uid).single();
        if (eu) creditosActuales = eu.creditos_disponibles || 0;
      }

      const esGratis = quiniela.precio_ticket === 0;
      if (esGratis) {
        const { data: tp } = await supabase.from('tickets').select('id').eq('usuario_id', uid).eq('quiniela_id', quiniela.id);
        if (tp && tp.length > 0) {
          toast.error(`El usuario ya tiene un boleto para esta jornada gratuita.`, { id: loadingId });
          setGuardandoCaptura(false);
          return; 
        }
      }

      const seleccionesFinales = { ...capSelecciones };
      partidos.forEach(p => { if (!seleccionesFinales[p.id]) seleccionesFinales[p.id] = 'E'; });
      
      const precio = quiniela.precio_ticket ?? 1; 
      let nuevoSaldo = creditosActuales;

      if (precio > 0) {
        if (creditosActuales >= precio) {
          nuevoSaldo = creditosActuales - precio;
          await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', uid);
        } else {
          const faltante = precio - creditosActuales;
          await supabase.from('transacciones_creditos').insert([{ usuario_id: uid, cantidad: faltante, tipo_movimiento: 'recarga_manual', descripcion: 'Pago en mostrador (Físico)' }]);
          nuevoSaldo = 0;
          await supabase.from('usuarios').update({ creditos_disponibles: nuevoSaldo }).eq('id', uid);
        }
        await supabase.from('transacciones_creditos').insert([{ usuario_id: uid, cantidad: -precio, tipo_movimiento: 'juego_ticket_fisico', descripcion: `Ticket físico ${quiniela.nombre_jornada}` }]);
      }

      const { data: tk } = await supabase.from('tickets').insert([{ usuario_id: uid, quiniela_id: quiniela.id, metodo_ingreso: 'fisico', prediccion_goles_total: parseInt(capGoles) }]).select().single();
      
      const prons = Object.keys(seleccionesFinales).map(pId => ({ ticket_id: tk.id, partido_id: pId, eleccion_usuario: seleccionesFinales[pId] }));
      await supabase.from('pronosticos').insert(prons);
      
      if (actualizarSaldoGlobal) actualizarSaldoGlobal(uid, nuevoSaldo);

      let seleccionesTexto = '';
      partidos.forEach(p => {
        const sel = seleccionesFinales[p.id];
        const pick = sel === 'L' ? p.equipo_local : sel === 'V' ? p.equipo_visitante : 'Empate';
        seleccionesTexto += `⚽ ${p.equipo_local} vs ${p.equipo_visitante} 👉 *${pick}*\n`;
      });

      const msgWa = `🎫 *QUINIELA CIBERTEQUE*\nHola ${capNombre}, tu jugada para *${quiniela.nombre_jornada}* se guardó correctamente.\n\n*Tus pronósticos:*\n${seleccionesTexto}\nDesempate (Goles): *${capGoles}*\n\n🍀 ¡Mucha suerte!`;
      
      setLinkWaReciente(`https://wa.me/52${capTelefono}?text=${encodeURIComponent(msgWa)}`);
      setTicketAImprimir({ nombre: capNombre, telefono: capTelefono, selecciones: seleccionesFinales, goles: capGoles });
      
      toast.success('🎟️ ¡Boleto guardado con éxito!', { id: loadingId });
      setCapTelefono(''); setCapNombre(''); setCapSelecciones({}); setCapGoles(''); 
    } catch (e: any) { 
      toast.error('Error al guardar captura', { id: loadingId }); 
    } finally { 
      setGuardandoCaptura(false); 
    }
  };

  return {
    quinielasAbiertas, quiniela, seleccionarQuiniela, partidos, equipos,
    capTelefono, capNombre, capUsuarioId, capSelecciones, capGoles,
    // 🔥 AQUÍ ESTÁ LA MAGIA QUE FALTABA:
    setCapNombre, setCapGoles, setCapSelecciones, setCapTelefono, setCapUsuarioId,
    buscarClienteParaCaptura, guardarCapturaFisica, guardandoCaptura,
    linkWaReciente, setLinkWaReciente, ticketAImprimir, setTicketAImprimir
  };
}