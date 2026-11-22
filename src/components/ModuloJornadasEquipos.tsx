'use client'
import { useState } from 'react'
import { useEquipos } from '@/hooks/useEquipos'
import { useCreadorJornadas, type PartidoInput } from '@/hooks/useCreadorJornadas'
import { SUPPORTED_LEAGUES } from '@/lib/sports/leagues'
import { LIGAS_SORTEO } from '@/lib/sports/ligasSorteo'
import {
  utcADatetimeLocalMazatlan,
  textoFechaMazatlan,
} from '@/lib/fechaMazatlan'
import AsistenteJornada from '@/components/AsistenteJornada'
import toast from 'react-hot-toast'

/** Partido tal como lo devuelve /api/importar-jornada. */
interface FixtureImportable {
  providerId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamES: string;
  awayTeamES: string;
  kickoffUtc: string | null;
  round: number | null;
  venue: string | null;
  /** true si el API ya lo da por terminado: llega desmarcado. */
  terminado: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

interface ModuloJornadasEquiposProps {
  vista: 'crear' | 'equipos';
  cambiarVista: (vista: 'recargas' | 'resultados' | 'crear' | 'equipos' | 'captura') => void;
}

export default function ModuloJornadasEquipos({ vista, cambiarVista }: ModuloJornadasEquiposProps) {
  // --- HOOKS DE LÓGICA DE NEGOCIO ---
  const { equipos, cargandoEquipos, guardarEquipo: guardarEquipoDB } = useEquipos();
  const { 
    formulario: f, 
    setters: s, 
    acciones: a, 
    estado: e 
  } = useCreadorJornadas();

  // --- ESTADOS LOCALES UI ---
  const [ligaFiltroJornada, setLigaFiltroJornada] = useState('Todas');
  
  // Gestión de Equipos UI
  const [formEquipoNombre, setFormEquipoNombre] = useState('');
  const [formEquipoLogo, setFormEquipoLogo] = useState('');
  const [formEquipoLiga, setFormEquipoLiga] = useState('');
  const [equipoEditandoId, setEquipoEditandoId] = useState<string | null>(null);
  const [guardandoEquipo, setGuardandoEquipo] = useState(false);
  const [busquedaEquipo, setBusquedaEquipo] = useState('');
  const [filtroLigaEquipo, setFiltroLigaEquipo] = useState('Todas');

  // ⚡ NUEVO: Estado para el buscador en la vista de Sorteo
  const [busquedaEquipoSorteo, setBusquedaEquipoSorteo] = useState('');

  // ✨ Asistente gráfico vs formulario clásico: comparten el MISMO
  // estado del hook (y el mismo borrador), así que se puede cambiar
  // de vista a mitad de camino sin perder nada. El asistente es el
  // camino por defecto; el clásico queda a un toque.
  const [modoCrear, setModoCrear] = useState<'asistente' | 'clasico'>('asistente');

  // --- IMPORTAR PARTIDOS DESDE LA API ---
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [impLiga, setImpLiga] = useState('4350'); // Liga MX por defecto
  const [impModo, setImpModo] = useState<'ronda' | 'fechas'>('ronda');
  const [impRonda, setImpRonda] = useState('');
  const [impDesde, setImpDesde] = useState('');
  const [impHasta, setImpHasta] = useState('');
  const [impResultados, setImpResultados] = useState<FixtureImportable[] | null>(null);
  const [impSeleccionados, setImpSeleccionados] = useState<Set<string>>(new Set());
  const [impBuscando, setImpBuscando] = useState(false);
  // Qué está mostrando la lista: "lo que sigue" (automático) o una
  // búsqueda manual por jornada/fechas, y su encabezado.
  const [impOrigen, setImpOrigen] = useState<'proximos' | 'manual' | null>(null);
  const [impTitulo, setImpTitulo] = useState('');
  // TODAS las ligas de fútbol del catálogo dinámico (además de las
  // curadas del Club, que van como favoritas): se piden una vez a
  // /api/ligas-catalogo cuando se abre el panel. Si la pedida falla,
  // el selector se queda solo con las del Club.
  const [impLigasFutbol, setImpLigasFutbol] = useState<{ providerId: string; name: string }[]>([]);

  const cargarCatalogoFutbol = async () => {
    if (impLigasFutbol.length > 0) return;
    try {
      const res = await fetch('/api/ligas-catalogo');
      const data = await res.json();
      if (!res.ok) return;
      const soccer = (data.sports || []).find((d: any) => d.sport === 'Soccer');
      if (soccer) {
        setImpLigasFutbol(
          (soccer.ligas || []).map((l: any) => ({ providerId: l.providerId, name: l.name }))
        );
      }
    } catch {
      // Sin catálogo dinámico: el selector conserva las del Club.
    }
  };

  /** Aplica una respuesta de la ruta: pendientes marcados, jugados no. */
  const aplicarResultadosImportables = (fixtures: FixtureImportable[]) => {
    setImpResultados(fixtures);
    setImpSeleccionados(new Set(fixtures.filter(fx => !fx.terminado).map(fx => fx.providerId)));
  };

  /**
   * "Lo que sigue" de una liga: la ruta decide sola qué ronda es la que
   * viene (la más temprana con partidos pendientes). Se carga al abrir
   * el panel y al cambiar de liga, sin teclear ningún filtro.
   */
  const cargarProximos = async (ligaId: string) => {
    setImpBuscando(true);
    setImpResultados(null);
    try {
      const res = await fetch(`/api/importar-jornada?liga=${ligaId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los partidos.');
      aplicarResultadosImportables(data.fixtures || []);
      setImpOrigen('proximos');
      const nombreLiga = data.league?.name || 'la liga';
      const rondaTxt = data.round !== null && data.round !== undefined ? ` · Jornada ${data.round}` : '';
      setImpTitulo(data.esMasReciente
        ? `${nombreLiga}${rondaTxt} — la más reciente (ya no quedan partidos pendientes)`
        : `Lo que sigue — ${nombreLiga}${rondaTxt}`);
    } catch (error: any) {
      setImpOrigen(null);
      setImpTitulo('');
      toast.error(error.message || 'Error al consultar la API.');
    } finally {
      setImpBuscando(false);
    }
  };

  /** Abre/cierra el panel; al abrir sin lista cargada, trae "lo que sigue". */
  const togglePanelImportar = () => {
    const abre = !mostrarImportar;
    setMostrarImportar(abre);
    if (abre) {
      cargarCatalogoFutbol();
      if (impResultados === null && !impBuscando) cargarProximos(impLiga);
    }
  };

  const handleBuscarImportables = async () => {
    const params = new URLSearchParams({ liga: impLiga });
    if (impModo === 'ronda') {
      if (!impRonda || parseInt(impRonda) < 1) return toast.error('Escribe el número de jornada (ronda) a importar.');
      params.set('ronda', impRonda);
    } else {
      if (!impDesde || !impHasta) return toast.error('Elige la fecha inicial y la final.');
      params.set('desde', impDesde);
      params.set('hasta', impHasta);
    }
    setImpBuscando(true);
    setImpResultados(null);
    try {
      const res = await fetch(`/api/importar-jornada?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los partidos.');
      const fixtures: FixtureImportable[] = data.fixtures || [];
      aplicarResultadosImportables(fixtures);
      setImpOrigen('manual');
      setImpTitulo(impModo === 'ronda' ? `Búsqueda manual — Jornada ${impRonda}` : 'Búsqueda manual — por fechas');
      if (fixtures.length === 0) toast('Esa liga no trae partidos para ese criterio.', { icon: 'ℹ️' });
    } catch (error: any) {
      toast.error(error.message || 'Error al consultar la API.');
    } finally {
      setImpBuscando(false);
    }
  };

  const toggleImportable = (providerId: string) => {
    setImpSeleccionados(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(providerId)) nuevo.delete(providerId); else nuevo.add(providerId);
      return nuevo;
    });
  };

  const handleAgregarImportados = () => {
    if (!impResultados) return;
    const elegidos = impResultados.filter(fx => impSeleccionados.has(fx.providerId));
    if (elegidos.length === 0) return toast.error('No hay ningún partido marcado.');
    const nuevos: PartidoInput[] = elegidos.map(fx => ({
      local: fx.homeTeamES,
      visitante: fx.awayTeamES,
      fecha_hora: utcADatetimeLocalMazatlan(fx.kickoffUtc),
      api_fixture_id: fx.providerId,
    }));
    const { agregados, omitidos } = a.agregarPartidosImportados(nuevos);
    if (agregados > 0) {
      toast.success(`Se agregaron ${agregados} partido(s) a la jornada.${omitidos > 0 ? ` (${omitidos} ya estaban, se omitieron.)` : ''}`);
      setMostrarImportar(false);
      setImpResultados(null);
      setImpSeleccionados(new Set());
      setImpOrigen(null);
      setImpTitulo('');
    } else {
      toast('Todos esos partidos ya están en la jornada.', { icon: 'ℹ️' });
    }
  };

  const ligasDinamicas = Array.from(new Set(equipos.map(eq => eq.liga || 'Sin Liga'))).sort();

  // --- FUNCIONES GESTIÓN EQUIPOS UI ---
  const iniciarEdicionEquipo = (equipo: any) => { 
    setEquipoEditandoId(equipo.id)
    setFormEquipoNombre(equipo.nombre)
    setFormEquipoLogo(equipo.logo_url || '')
    setFormEquipoLiga(equipo.liga || '')
    window.scrollTo({ top: 0, behavior: 'smooth' }) 
  }
  
  const cancelarEdicionEquipo = () => { 
    setEquipoEditandoId(null)
    setFormEquipoNombre('')
    setFormEquipoLogo('')
    setFormEquipoLiga('') 
  }

  const handleGuardarEquipo = async () => {
    if (!formEquipoNombre) return toast.error('El nombre del equipo es obligatorio');
    setGuardandoEquipo(true)
    
    const urlLogoFinal = formEquipoLogo.trim() || 'https://a.espncdn.com/i/teamlogos/default-soccer-35.png'
    const ligaFinal = formEquipoLiga.trim() || 'Sin Liga'
    
    const result = await guardarEquipoDB(equipoEditandoId, {
      nombre: formEquipoNombre.trim(),
      liga: ligaFinal,
      logo_url: urlLogoFinal
    });

    if (result.success) {
      toast.success(equipoEditandoId ? 'Equipo actualizado' : '¡Equipo guardado con éxito!'); 
      cancelarEdicionEquipo();
    } else {
      toast.error(result.message || 'Error al guardar el equipo'); 
    }
    
    setGuardandoEquipo(false);
  }

  // --- FUNCIÓN MANEJADORA DE CREACIÓN JORNADA ---
  const handleCrearJornada = async () => {
    const loadingToast = toast.loading('Procesando jornada...');
    const result = await a.crearJornadaCompleta();
    
    if (result.success) {
      toast.success(result.message, { id: loadingToast });
      cambiarVista('recargas'); // Redirige al cajero como lo tenías
    } else {
      toast.error(result.message, { id: loadingToast });
    }
  }

  // Filtros de Galería
  const equiposVisiblesEnGaleria = (equipos || []).filter(eq => {
    const coincideTexto = (eq.nombre || '').toLowerCase().includes(busquedaEquipo.toLowerCase())
    const coincideLiga = filtroLigaEquipo === 'Todas' || eq.liga === filtroLigaEquipo
    return coincideTexto && coincideLiga
  })

  const equiposAgrupados = ligasDinamicas.reduce((acc, liga) => {
    const eq = equiposVisiblesEnGaleria.filter(e => (e.liga || 'Sin Liga') === liga)
    if (eq.length > 0) acc[liga] = eq
    return acc
  }, {} as Record<string, any[]>)


  return (
    <>
      {/* --- VISTA: CREAR JORNADA --- */}
      {vista === 'crear' && (
        <div className="space-y-4 animate-in fade-in duration-300 w-full max-w-4xl mx-auto">
          {/* Conmutador asistente / clásico (mismo estado, dos vistas) */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            <button type="button" onClick={() => setModoCrear('asistente')} className={`py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${modoCrear === 'asistente' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>
              ✨ Asistente gráfico
            </button>
            <button type="button" onClick={() => setModoCrear('clasico')} className={`py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${modoCrear === 'clasico' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>
              📝 Formulario clásico
            </button>
          </div>

          {modoCrear === 'asistente' ? (
            <AsistenteJornada f={f} s={s} a={a} e={e} equipos={equipos} onCrear={handleCrearJornada} onClasico={() => setModoCrear('clasico')} />
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800 shadow-inner">
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Nombre de la Jornada</label>
              <input type="text" placeholder="Ej. Jornada 1" value={f.nombreJornada} onChange={(e) => s.setNombreJornada(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500 transition-all text-xs font-bold placeholder:text-slate-600" />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Cierre de Quiniela</label>
              <input type="datetime-local" value={f.fechaCierre} onChange={(e) => s.setFechaCierre(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500 transition-all text-xs font-bold" />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Precio (Créditos)</label>
              <input type="number" value={f.precioTicket} onChange={(e) => s.setPrecioTicket(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500 transition-all text-center font-black text-xs" />
            </div>
            <div>
              <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Premiación</label>
              <select value={f.tipoPremiacion} onChange={(e: any) => s.setTipoPremiacion(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white outline-none focus:border-green-500 transition-all text-[10px] md:text-xs font-bold h-[34px]">
                <optgroup label="Cobro Normal (80%)">
                  <option value="unico">1ro (100%)</option>
                  <option value="top2">Top 2 (70-30)</option>
                  <option value="top3">Top 3 (60-25-15)</option>
                </optgroup>
                <optgroup label="Gratis (Fijos)">
                  <option value="promo_unico">Promo (1 Cr al 1ro)</option>
                  <option value="promo_top2">Promo (1 Cr al 1ro y 2do)</option>
                </optgroup>
              </select>
            </div>
          </div>
          
          {/* PANEL DE CONFIGURACIÓN ESPECIAL */}
          <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800 shadow-inner">
            <div className="flex-1">
              <label className="text-[9px] md:text-[10px] text-amber-500 font-bold uppercase mb-1.5 block tracking-wider flex items-center gap-1"><span>⚙️</span> Modalidad de Juego</label>
              <select value={f.modalidad} onChange={(e: any) => s.setModalidad(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-amber-400 outline-none focus:border-amber-500 transition-all text-xs font-black h-[38px]">
                <option value="clasica">Tradicional (Local / Empate / Visita)</option>
                <option value="marcador_exacto">Marcador Exacto (Ej. 2-1)</option>
                <option value="sorteo">Sorteo Aleatorio (8 Participantes)</option>
              </select>
            </div>
            <div className="flex-1 flex flex-col justify-center mt-2 sm:mt-0 border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={f.soloAdmins} 
                  onChange={(e) => s.setSoloAdmins(e.target.checked)} 
                  className="w-5 h-5 accent-red-600 rounded bg-slate-950 border-slate-700 cursor-pointer"
                />
                <div>
                  <span className="block text-[10px] md:text-xs text-red-400 font-black uppercase tracking-widest group-hover:text-red-300 transition-colors">
                    Ocultar a Clientes
                  </span>
                  <span className="block text-[8px] md:text-[9px] text-slate-500 uppercase tracking-widest mt-0.5 font-bold">
                    Solo visible en Mostrador / Modo Prueba
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* ⚡ VISTA CONDICIONAL: SELECTOR DE SORTEO VS PARTIDOS TRADICIONALES */}
          {f.modalidad === 'sorteo' ? (
            <div className="bg-blue-950/20 border border-blue-900/50 p-4 rounded-xl space-y-4 shadow-inner">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-blue-900/50 pb-3">
                <div className="flex-1">
                  <h4 className="text-blue-400 font-black uppercase text-sm tracking-widest flex items-center gap-2"><span>🎲</span> Selecciona 8 Equipos</h4>
                  <p className="text-slate-400 text-[10px] mt-1">Llevas: <strong className={(f.equiposSorteo?.length || 0) === 8 ? "text-green-400" : "text-amber-400"}>{f.equiposSorteo?.length || 0}/8</strong></p>
                </div>
                
                {/* ⚡ NUEVO BUSCADOR */}
                <div className="flex-1 w-full relative">
                  <input 
                    type="text" 
                    placeholder="Buscar equipo o país..." 
                    value={busquedaEquipoSorteo}
                    onChange={(e) => setBusquedaEquipoSorteo(e.target.value)}
                    className="w-full bg-slate-950 border border-blue-900/50 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-bold placeholder:text-slate-600 shadow-inner"
                  />
                </div>

                <select value={e.ligaBombo?.providerId || '4350'} onChange={(ev) => { const liga = LIGAS_SORTEO.find(l => l.providerId === ev.target.value); if (liga) s.setLigaBombo(liga); }} disabled={e.jalandoBombo} title="Liga de la que se jalan los equipos (solo ligas con liguilla)" className="bg-slate-950 border border-emerald-700 rounded-lg px-2 py-2 text-[10px] text-emerald-100 font-black uppercase outline-none focus:border-emerald-500 disabled:opacity-60 shrink-0">
                  {LIGAS_SORTEO.map(l => <option key={l.providerId} value={l.providerId}>{l.name}</option>)}
                </select>

                <button onClick={() => a.jalarEquiposBombo(equipos)} disabled={e.jalandoBombo} type="button" className="bg-emerald-900 hover:bg-emerald-800 disabled:opacity-60 text-emerald-100 text-[10px] font-black uppercase px-4 py-2 rounded-lg border border-emerald-700 transition-all shadow-md shrink-0">
                  {e.jalandoBombo ? '⏳ Jalando…' : `⬇️ Jalar top 8 de ${e.ligaBombo?.name || 'Liga MX'}`}
                </button>

                <button onClick={a.clonarUltimoSorteo} type="button" className="bg-blue-900 hover:bg-blue-800 text-blue-100 text-[10px] font-black uppercase px-4 py-2 rounded-lg border border-blue-700 transition-all shadow-md shrink-0">
                  ♻️ Clonar Sorteo Anterior
                </button>
              </div>

              {e.fuenteBombo && (
                <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-emerald-300 text-[10px] font-bold">
                    ⬇️ Bombo jalado {e.fuenteBombo.tipo === 'cuartos' ? 'desde los partidos de cuartos de final' : 'desde la tabla general (top 8)'}{e.fuenteBombo.liga ? ` · ${e.fuenteBombo.liga}` : ''}. Puedes corregir cualquier equipo a mano en la rejilla.
                  </p>
                  {(e.fuenteBombo.noRegistrados || []).map((nombre: string) => (
                    <p key={nombre} className="text-amber-300 text-[10px] font-bold">
                      ⚠️ No registrado: {nombre} — regístralo en Equipos y elígelo a mano para completar el bombo.
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {equipos
                  .filter(eq => eq.nombre.toLowerCase().includes(busquedaEquipoSorteo.toLowerCase()))
                  .map(eq => {
                  const seleccionado = f.equiposSorteo?.includes(eq.id);
                  return (
                    <div key={eq.id} onClick={() => a.toggleEquipoSorteo(eq.id)} className={`p-2 rounded-lg flex flex-col items-center gap-1.5 cursor-pointer transition-all border shadow-sm ${seleccionado ? 'bg-blue-600 border-blue-400 scale-[1.05] shadow-[0_0_15px_rgba(37,99,235,0.5)] z-10' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
                      <div className="w-8 h-8 flex items-center justify-center bg-slate-950 rounded-full border border-slate-800/80 p-1">
                        <img src={eq.logo_url} alt="" className="w-full h-full object-contain" onError={(evt:any)=>{evt.target.src='https://a.espncdn.com/i/teamlogos/default-soccer-35.png'}} />
                      </div>
                      <span className={`text-[8px] font-bold truncate uppercase w-full text-center ${seleccionado ? 'text-white' : 'text-slate-400'}`}>{eq.nombre}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">🎯 Filtrar Autocompletado:</span>
                <select value={ligaFiltroJornada} onChange={(e) => setLigaFiltroJornada(e.target.value)} className="w-full sm:w-auto bg-slate-900 text-xs py-1.5 px-3 rounded-lg border border-slate-700 text-white font-bold outline-none focus:border-green-500">
                  <option value="Todas">Todas las Ligas</option>
                  {ligasDinamicas.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* 🌐 IMPORTAR PARTIDOS DESDE LA API */}
              <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl shadow-inner overflow-hidden">
                <button type="button" onClick={togglePanelImportar} className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-900/20 transition-colors">
                  <span className="text-emerald-400 font-black uppercase text-xs tracking-widest flex items-center gap-2"><span>🌐</span> Importar desde la API</span>
                  <span className="text-emerald-500 text-[10px] font-black">{mostrarImportar ? '▲ Cerrar' : '▼ Abrir'}</span>
                </button>

                {mostrarImportar && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      Al abrirse, el panel muestra solo <strong className="text-slate-200">lo que sigue</strong> de la liga (la jornada que viene, con sus partidos pendientes ya marcados). Los controles de abajo son solo para buscar una jornada más lejana o pasada. Los partidos se agregan a la lista de abajo <strong className="text-slate-200">ya enlazados</strong> (🔗), para que los marcadores se actualicen solos. Puedes importar de otra liga después para agregar, por ejemplo, un partido europeo.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Liga</label>
                        <select value={impLiga} onChange={(e) => { setImpLiga(e.target.value); cargarProximos(e.target.value); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold h-[34px]">
                          <optgroup label="⭐ Ligas del club">
                            {SUPPORTED_LEAGUES.map(l => <option key={l.providerId} value={l.providerId}>{l.name}</option>)}
                          </optgroup>
                          {impLigasFutbol.length > 0 && (
                            <optgroup label="🌎 Todas las ligas de fútbol">
                              {impLigasFutbol
                                .filter(l => !SUPPORTED_LEAGUES.some(c => c.providerId === l.providerId))
                                .map(l => <option key={l.providerId} value={l.providerId}>{l.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Buscar por</label>
                        <select value={impModo} onChange={(e: any) => { setImpModo(e.target.value); setImpResultados(null); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold h-[34px]">
                          <option value="ronda">Número de jornada</option>
                          <option value="fechas">Rango de fechas</option>
                        </select>
                      </div>
                      {impModo === 'ronda' ? (
                        <div>
                          <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Jornada (ronda)</label>
                          <input type="number" min="1" placeholder="Ej. 17" value={impRonda} onChange={(e) => setImpRonda(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold text-center" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Desde</label>
                            <input type="date" value={impDesde} onChange={(e) => setImpDesde(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold" />
                          </div>
                          <div>
                            <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-wider">Hasta</label>
                            <input type="date" value={impHasta} onChange={(e) => setImpHasta(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white outline-none focus:border-emerald-500 transition-all text-xs font-bold" />
                          </div>
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={handleBuscarImportables} disabled={impBuscando} className={`w-full py-2.5 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs transition-all ${impBuscando ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'}`}>
                      {impBuscando ? 'Consultando la API...' : '🔎 Buscar partidos'}
                    </button>

                    {impBuscando && impResultados === null && (
                      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">Cargando partidos…</p>
                    )}

                    {impResultados !== null && (
                      <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 truncate">📍 {impTitulo}</span>
                        {impOrigen === 'manual' && (
                          <button type="button" onClick={() => cargarProximos(impLiga)} disabled={impBuscando} className="shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded transition-all disabled:opacity-40">
                            ↩ Volver a lo que sigue
                          </button>
                        )}
                      </div>
                    )}

                    {impResultados !== null && impResultados.length === 0 && (
                      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">Sin partidos para mostrar.</p>
                    )}

                    {impResultados !== null && impResultados.length > 0 && (
                      <div className="space-y-2">
                        <div className="max-h-[320px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                          {impResultados.map(fx => {
                            const marcado = impSeleccionados.has(fx.providerId);
                            return (
                              <label key={fx.providerId} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${marcado ? 'bg-emerald-900/30 border-emerald-700/60' : 'bg-slate-950/60 border-slate-800 opacity-60'}`}>
                                <input type="checkbox" checked={marcado} onChange={() => toggleImportable(fx.providerId)} className="w-4 h-4 accent-emerald-500 shrink-0 cursor-pointer" />
                                <div className="flex-1 min-w-0">
                                  <span className="block text-xs font-bold text-white truncate uppercase">{fx.homeTeamES} <span className="text-slate-500 italic normal-case">vs</span> {fx.awayTeamES}</span>
                                  <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                    {textoFechaMazatlan(fx.kickoffUtc)}{fx.round !== null ? ` · Jornada ${fx.round}` : ''}{fx.venue ? ` · ${fx.venue}` : ''}
                                  </span>
                                  {fx.terminado && (
                                    <span className="inline-block text-[8px] font-black uppercase tracking-wider text-slate-300 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded mt-1">
                                      ✅ Finalizado{fx.homeScore !== null && fx.awayScore !== null ? ` · ${fx.homeScore} - ${fx.awayScore}` : ''}
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        <button type="button" onClick={handleAgregarImportados} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] md:text-xs transition-all shadow-md">
                          ➕ Agregar marcados ({impSeleccionados.size})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <label className="text-[10px] text-slate-500 font-bold uppercase block tracking-widest px-1">Partidos de la Jornada</label>
              <datalist id="lista-equipos">
                {equipos.filter(eq => ligaFiltroJornada === 'Todas' ? true : eq.liga === ligaFiltroJornada).map(eq => <option key={eq.id} value={eq.nombre} />)}
              </datalist>
              
              {(f.partidosNuevos || []).map((p, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-2 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80 hover:border-slate-600 transition-colors relative group items-center">
                  
                  <div className="flex justify-between items-center w-full md:w-auto md:flex-col md:gap-1 border-b md:border-b-0 md:border-r border-slate-700/50 pb-2 md:pb-0 md:pr-3 shrink-0">
                     <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Partido {idx + 1}</span>
                     {p.api_fixture_id && (
                       <span title="Importado de la API: su marcador se actualiza solo. Puedes ajustar el nombre u la hora y el enlace se queda; si lo conviertes en otro partido, bórralo y agrégalo a mano." className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-1.5 py-0.5 rounded">🔗 API</span>
                     )}
                     <div className="flex gap-1">
                       <button onClick={() => a.moverPartido(idx, -1)} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center bg-slate-950 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all text-[10px]" title="Subir">▲</button>
                       <button onClick={() => a.moverPartido(idx, 1)} disabled={idx === f.partidosNuevos.length - 1} className="w-6 h-6 flex items-center justify-center bg-slate-950 border border-slate-700 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all text-[10px]" title="Bajar">▼</button>
                       <button onClick={() => a.eliminarPartido(idx)} disabled={f.partidosNuevos.length === 1} className="w-6 h-6 flex items-center justify-center bg-red-950/30 border border-red-900/50 rounded text-red-500 hover:text-red-400 hover:bg-red-900/50 disabled:opacity-30 transition-all text-[10px] ml-1" title="Eliminar">✕</button>
                     </div>
                  </div>
                  
                  <div className="flex flex-1 w-full items-center gap-2">
                    <input list="lista-equipos" placeholder="Local" value={p.local} onChange={(ev) => a.actualizarPartidoInput(idx, 'local', ev.target.value)} className="flex-1 w-full bg-slate-950 text-xs md:text-sm p-2 rounded-lg border border-slate-700 text-white outline-none focus:border-green-500 font-bold uppercase text-right" />
                    <span className="text-[10px] font-black text-slate-600 italic shrink-0 w-4 text-center">VS</span>
                    <input list="lista-equipos" placeholder="Visita" value={p.visitante} onChange={(ev) => a.actualizarPartidoInput(idx, 'visitante', ev.target.value)} className="flex-1 w-full bg-slate-950 text-xs md:text-sm p-2 rounded-lg border border-slate-700 text-white outline-none focus:border-green-500 font-bold uppercase" />
                  </div>
                  
                  <div className="w-full md:w-[150px] shrink-0">
                     <input type="datetime-local" value={p.fecha_hora} onChange={(ev) => a.actualizarPartidoInput(idx, 'fecha_hora', ev.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 outline-none focus:border-green-500 transition-all text-[10px] font-bold" />
                  </div>
                </div>
              ))}
              <button onClick={a.agregarPartidoInput} className="w-full py-3 md:py-2.5 mt-1 border border-dashed border-slate-700 rounded-xl text-slate-500 font-black text-[10px] uppercase hover:bg-slate-800 hover:text-slate-300 hover:border-slate-500 transition-all tracking-widest">+ Agregar Partido</button>
            </div>
          )}
          
          <div className="pt-2">
            <button onClick={handleCrearJornada} disabled={e.creando} className={`w-full py-3.5 rounded-xl font-black uppercase tracking-[0.15em] transition-all flex justify-center items-center gap-2 text-xs md:text-sm ${e.creando ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:scale-[1.01] active:scale-95'}`}>
              {e.creando ? 'Procesando...' : <><span>🚀</span> Publicar Jornada en CiberTeque</>}
            </button>
          </div>
          </>
          )}
        </div>
      )}

      {/* --- VISTA: EQUIPOS --- */}
      {vista === 'equipos' && (
        <div className="space-y-6 animate-in fade-in duration-300 w-full max-w-4xl mx-auto">
          <div className={`p-4 md:p-5 rounded-2xl border shadow-lg transition-colors ${equipoEditandoId ? 'bg-purple-950/20 border-purple-800/50' : 'bg-slate-900/50 border-slate-800'}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-xs md:text-sm font-black uppercase tracking-wider ${equipoEditandoId ? 'text-purple-400' : 'text-slate-300'}`}>{equipoEditandoId ? '✏️ Editando Equipo' : '🛡️ Registrar Equipo'}</h3>
              {equipoEditandoId && <button onClick={cancelarEdicionEquipo} className="text-[9px] font-bold text-slate-500 hover:text-slate-300 uppercase underline tracking-wider">Cancelar</button>}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-widest">Nombre del Equipo</label>
                <input type="text" placeholder="Ej. Toluca" value={formEquipoNombre} onChange={(e) => setFormEquipoNombre(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 font-bold text-xs" />
              </div>
              <datalist id="lista-ligas-db">{ligasDinamicas.map(l => <option key={l} value={l} />)}</datalist>
              <div>
                <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-widest">Liga</label>
                <input list="lista-ligas-db" placeholder="Ej. Liga MX" value={formEquipoLiga} onChange={(e) => setFormEquipoLiga(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 font-bold text-xs" />
              </div>
              <div>
                <label className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase mb-1.5 block tracking-widest">URL Logo (ESPN)</label>
                <input type="text" placeholder="https://..." value={formEquipoLogo} onChange={(e) => setFormEquipoLogo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-[10px] md:text-xs outline-none focus:border-purple-500 font-mono" />
              </div>
            </div>
            
            <button onClick={handleGuardarEquipo} disabled={guardandoEquipo} className={`w-full mt-4 text-white py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all shadow-md ${equipoEditandoId ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30' : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'}`}>
              {guardandoEquipo ? 'Procesando...' : equipoEditandoId ? '💾 Actualizar' : '➕ Agregar a BD'}
            </button>
          </div>
          
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <input type="text" placeholder="Buscar por nombre..." value={busquedaEquipo} onChange={(e) => setBusquedaEquipo(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-bold placeholder:text-slate-600" />
              <select value={filtroLigaEquipo} onChange={(e) => setFiltroLigaEquipo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-bold">
                <option value="Todas">Todas las Ligas</option>
                {ligasDinamicas.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            
            {cargandoEquipos ? (
              <div className="space-y-6 animate-pulse">
                <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                  <div className="h-4 bg-slate-800 rounded w-1/4 mb-4"></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center gap-2">
                        <div className="w-10 h-10 bg-slate-800 rounded-full"></div>
                        <div className="w-full h-3 bg-slate-800 rounded"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : Object.keys(equiposAgrupados || {}).length === 0 ? (
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-8 text-center">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">No se encontraron equipos.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.keys(equiposAgrupados).sort().map(liga => (
                  <div key={liga} className="bg-slate-950/30 p-3 md:p-4 rounded-xl border border-slate-800/50">
                    <h5 className="text-[10px] md:text-xs text-purple-400 font-black uppercase tracking-widest mb-3 border-b border-slate-800/80 pb-2">{liga} <span className="text-slate-600 font-bold ml-1">({equiposAgrupados[liga]?.length || 0})</span></h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
                      {(equiposAgrupados[liga] || []).map(eq => (
                        <div key={eq.id} onClick={() => iniciarEdicionEquipo(eq)} className={`p-2 rounded-lg flex flex-col items-center gap-1.5 cursor-pointer transition-all border shadow-sm group ${equipoEditandoId === eq.id ? 'bg-purple-900/30 border-purple-500/50 scale-[1.02]' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-800'}`} title="Editar equipo">
                          <div className="w-10 h-10 flex items-center justify-center bg-slate-950 rounded-full border border-slate-800/80 p-1.5 group-hover:border-slate-600 transition-colors">
                            <img src={eq.logo_url} alt="" className="w-full h-full object-contain drop-shadow-md" onError={(evt:any)=>{evt.target.src='https://a.espncdn.com/i/teamlogos/default-soccer-35.png'}} />
                          </div>
                          <span className="text-[9px] md:text-[10px] font-bold text-slate-300 truncate uppercase w-full text-center group-hover:text-white transition-colors">{eq.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}