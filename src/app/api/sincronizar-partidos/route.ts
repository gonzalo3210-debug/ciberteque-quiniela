    // src/app/api/sincronizar-partidos/route.ts
    import { NextResponse } from 'next/server';
    import { supabase } from '@/lib/supabase';

    export async function GET(request: Request) {
    try {
        console.log('🔄 Iniciando sincronización oficial con API-Sports...');

        // 1. Buscar quinielas abiertas
        const { data: quinielasAbiertas, error: errQuinielas } = await supabase
        .from('quinielas')
        .select('id')
        .eq('estado', 'abierta');

        if (errQuinielas || !quinielasAbiertas || quinielasAbiertas.length === 0) {
        return NextResponse.json({ message: 'No hay quinielas abiertas para sincronizar.' }, { status: 200 });
        }

        const quinielaIds = quinielasAbiertas.map(q => q.id);

        // 2. Buscar partidos que NO hayan terminado, tengan ID de API, y YA hayan comenzado
        const horaActualUTC = new Date().toISOString();

        const { data: partidosActivos, error: errPartidos } = await supabase
        .from('partidos')
        .select('id, api_fixture_id, equipo_local, equipo_visitante')
        .in('quiniela_id', quinielaIds)
        .eq('es_final', false)
        .not('api_fixture_id', 'is', null)
        .lte('fecha_hora_partido', horaActualUTC); // ⚡ INGENIERÍA: El filtro "Cadenero"

        if (errPartidos || !partidosActivos || partidosActivos.length === 0) {
        return NextResponse.json({ message: 'No hay partidos en juego en este momento. Ahorrando cuota.' }, { status: 200 });
        }

        // 3. Preparar la consulta a la API-Sports directa
        const fixtureIdsStr = partidosActivos.map(p => p.api_fixture_id).join('-');
        const apiUrl = `https://${process.env.API_FOOTBALL_HOST}/fixtures?ids=${fixtureIdsStr}`;
        
        const apiResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'x-apisports-key': process.env.API_FOOTBALL_KEY as string,
        },
        cache: 'no-store'
        });

        const apiData = await apiResponse.json();

        if (!apiData.response || apiData.response.length === 0) {
            return NextResponse.json({ message: 'La API no devolvió datos para los IDs solicitados.' }, { status: 400 });
        }

        // 4. Procesar la respuesta y actualizar Supabase
        let actualizados = 0;

        for (const fixtureData of apiData.response) {
        const fixtureId = fixtureData.fixture.id;
        const estadoCorto = fixtureData.fixture.status.short; 
        const golesLocal = fixtureData.goals.home;
        const golesVisitante = fixtureData.goals.away;
        
        const terminoPartido = ['FT', 'AET', 'PEN'].includes(estadoCorto);
        
        let resultadoReal = null;
        if (terminoPartido && golesLocal !== null && golesVisitante !== null) {
            if (golesLocal > golesVisitante) resultadoReal = 'L';
            else if (golesLocal < golesVisitante) resultadoReal = 'V';
            else resultadoReal = 'E';
        }

        const partidoInterno = partidosActivos.find(p => p.api_fixture_id === fixtureId);

        if (partidoInterno) {
            await supabase
                .from('partidos')
                .update({
                    goles_local: golesLocal !== null ? golesLocal : 0,
                    goles_visitante: golesVisitante !== null ? golesVisitante : 0,
                    estado_api: estadoCorto,
                    es_final: terminoPartido,
                    ...(resultadoReal && { resultado_real: resultadoReal })
                })
                .eq('id', partidoInterno.id);
            
            actualizados++;
        }
        }

        return NextResponse.json({ 
            message: 'Sincronización completada', 
            partidosProcesados: actualizados 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Error crítico en el endpoint de sincronización:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    }