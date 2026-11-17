// src/app/api/push/desuscribir/route.ts
//
// Borra la suscripción push de un navegador.
// POST { endpoint, usuario_id? } — el endpoint identifica la fila;
// si viene usuario_id, también debe coincidir.

import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/pushServidor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 });
  }

  const endpoint = body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'Falta un endpoint válido.' }, { status: 400 });
  }

  let consulta = supabaseServidor()
    .from('suscripciones_push')
    .delete()
    .eq('endpoint', endpoint);

  const usuarioId = body?.usuario_id;
  if (typeof usuarioId === 'string' && usuarioId.length > 0) {
    consulta = consulta.eq('usuario_id', usuarioId);
  }

  const { error } = await consulta;
  if (error) {
    console.error('Error borrando suscripción push:', error.message);
    return NextResponse.json(
      { error: 'No se pudo borrar la suscripción.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
