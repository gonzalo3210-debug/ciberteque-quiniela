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
      // 1. PETICIONES CONCURRENTES (Usuarios y Quinielas)
      const [
        { data: usuarios, error: errUsuarios },
        { data: quinielasDB, error: errQuinielas }
      ] = await Promise.all([
        supabase.from('usuarios').select('creditos_disponibles, saldo_pesos'),
        supabase.from('quinielas').select('id, nombre_jornada, precio_ticket, estado, tipo_premiacion').order('fecha_cierre', { ascending: false })
      ]);

      if (errUsuarios) throw new Error(`Error al cargar usuarios: ${errUsuarios.message}`);
      if (errQuinielas) throw new Error(`Error al cargar quinielas: ${errQuinielas.message}`);

      // 2. CÁLCULO DE SALDOS DE USUARIOS (Unificando creditos_disponibles y saldo_pesos)
      let totalCreditosDisponibles = 0;
      let totalSaldoPesos = 0;

      if (usuarios) {
        usuarios.forEach(u => {
          totalCreditosDisponibles += (Number(u.creditos_disponibles) || 0);
          totalSaldoPesos += (Number(u.saldo_pesos) || 0);
        });
      }

      // 3. UTILIDAD, RENDIMIENTO E INGRESO BRUTO (Desde Quinielas)
      // El Ingreso Bruto ES la suma de lo recaudado por jornada (boletos × precio):
      // el encabezado y la tabla salen de esta misma cuenta, una sola fuente de verdad.
      // (Antes el encabezado sumaba las 'recarga' de transacciones_creditos — dinero
      // cargado a billeteras — y por eso nunca cuadraba con la tabla de jornadas.)
      let ingresoBrutoCalc = 0;
      let utilidadTotal = 0;
      let premiosPagados = 0;
      const historialJornadas: any[] = [];

      if (quinielasDB) {
        // Conteos de boletos en paralelo y sin descargar filas (count exacto).
        // Antes: una consulta secuencial por jornada que traía todos los ids de
        // tickets solo para contarlos — eso hacía lento el módulo.
        const conteos = await Promise.all(
          quinielasDB.map(async (q) => {
            const { count, error: errTickets } = await supabase
              .from('tickets')
              .select('id', { count: 'exact', head: true })
              .eq('quiniela_id', q.id);

            if (errTickets) throw new Error(`Error en los boletos de ${q.nombre_jornada}: ${errTickets.message}`);
            return count ?? 0;
          })
        );

        quinielasDB.forEach((q, i) => {
          const boletosVendidos = conteos[i];
          const precio = q.precio_ticket ?? 0;
          const recaudacionPesos = boletosVendidos * precio;
          ingresoBrutoCalc += recaudacionPesos;

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
        });
      }

      setMetricas({
        ingresoBruto: ingresoBrutoCalc,
        utilidadNeta: utilidadTotal,
        pasivosCreditos: totalCreditosDisponibles, 
        saldoRetenido: totalSaldoPesos,
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