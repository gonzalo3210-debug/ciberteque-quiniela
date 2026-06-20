import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useFinanzas() {
  const [cargando, setCargando] = useState(true);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [jornadas, setJornadas] = useState<any[]>([]);
  const [metricas, setMetricas] = useState({
    ingresoBruto: 0,
    utilidadNeta: 0,
    pasivosCreditos: 0,
    saldoRetenido: 0,
    premiosEntregados: 0
  });

  const cargarDatosFinancieros = useCallback(async () => {
    setCargando(true);
    setMensajeError(null);
    
    try {
      // 1. PASIVOS Y SALDO RETENIDO (Desde Usuarios)
      const { data: usuarios, error: errUsuarios } = await supabase.from('usuarios').select('creditos_disponibles, saldo_pesos');
      if (errUsuarios) throw new Error(`Error al cargar usuarios: ${errUsuarios.message}`);

      let totalCreditos = 0;
      let totalPesos = 0;
      if (usuarios) {
        usuarios.forEach(u => {
          totalCreditos += (Number(u.creditos_disponibles) || 0);
          totalPesos += (Number(u.saldo_pesos) || 0);
        });
      }

      // 2. INGRESO BRUTO (Desde Transacciones de Recarga)
      const { data: recargas, error: errRecargas } = await supabase
        .from('transacciones_creditos')
        .select('cantidad')
        .in('tipo_movimiento', ['recarga_manual', 'recarga_billetera'])
        .gt('cantidad', 0);
      
      if (errRecargas) throw new Error(`Error al cargar recargas: ${errRecargas.message}`);

      let totalRecargasCreditos = 0;
      if (recargas) {
        recargas.forEach(r => totalRecargasCreditos += (Number(r.cantidad) || 0));
      }
      
      // 🔥 Ahora el cálculo es 1 a 1 (Pesos puros)
      const ingresoBrutoCalc = totalRecargasCreditos + totalPesos;

      // 3. UTILIDAD Y RENDIMIENTO (Desde Quinielas)
      const { data: quinielasDB, error: errQuinielas } = await supabase
        .from('quinielas')
        .select('id, nombre_jornada, precio_ticket, estado, tipo_premiacion') 
        .order('fecha_cierre', { ascending: false });

      if (errQuinielas) throw new Error(`Error al cargar quinielas: ${errQuinielas.message}`);

      let utilidadTotal = 0;
      let premiosPagados = 0;
      const historialJornadas: any[] = [];

      if (quinielasDB) {
        for (const q of quinielasDB) {
          const { data: tData, error: errTickets } = await supabase
            .from('tickets')
            .select('id')
            .eq('quiniela_id', q.id);
          
          if (errTickets) throw new Error(`Error en los boletos de ${q.nombre_jornada}: ${errTickets.message}`);

          const boletosVendidos = tData ? tData.length : 0;
          
          // 🔥 Eliminamos el * 30. Se usa el precio exacto (ej. 30, 50, 100 pesos)
          const precio = q.precio_ticket ?? 0;
          const recaudacionPesos = boletosVendidos * precio;
          
          let utilidad = 0;
          let premio = 0;

          if (q.estado === 'cerrada') {
            if (q.tipo_premiacion !== 'promo_unico' && q.tipo_premiacion !== 'promo_top2') {
              utilidad = recaudacionPesos * 0.20;
              premio = recaudacionPesos * 0.80;
              utilidadTotal += utilidad;
              premiosPagados += premio;
            }
          }

          historialJornadas.push({
            id: q.id,
            nombre: q.nombre_jornada,
            estado: q.estado,
            boletos: boletosVendidos,
            recaudacion: recaudacionPesos,
            utilidad: q.estado === 'cerrada' ? utilidad : 0,
            premio: q.estado === 'cerrada' ? premio : 0
          });
        }
      }

      setMetricas({
        ingresoBruto: ingresoBrutoCalc,
        utilidadNeta: utilidadTotal,
        pasivosCreditos: totalCreditos, // 1 a 1 en pesos
        saldoRetenido: totalPesos,
        premiosEntregados: premiosPagados
      });
      setJornadas(historialJornadas);

    } catch (error: any) {
      setMensajeError(error.message || 'Ocurrió un error desconocido al calcular las finanzas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatosFinancieros();
  }, [cargarDatosFinancieros]);

  return {
    cargando,
    mensajeError,
    metricas,
    jornadas,
    cargarDatosFinancieros
  };
}