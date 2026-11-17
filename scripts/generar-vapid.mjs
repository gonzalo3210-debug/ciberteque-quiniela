// scripts/generar-vapid.mjs
//
// Genera el par de llaves VAPID para las notificaciones push (Web Push)
// y el secreto del despachador, y los agrega al .env.local del repo
// SOLO si aún no están (nunca sobrescribe ni imprime los valores).
//
// Uso (desde la raíz del repo, con las dependencias instaladas):
//   node scripts/generar-vapid.mjs
//
// Las llaves viven únicamente en el .env.local (gitignored). Para
// producción hay que copiar las mismas variables al panel de Vercel:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//   PUSH_DISPATCH_SECRET
// (ver el reporte del paquete v12 y la migración en
// scripts/migraciones/2026-11-17-notificaciones-push.sql).

import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// web-push es CommonJS sin export default ESM: se carga con require.
const webpush = createRequire(import.meta.url)('web-push');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_ENV = path.join(RAIZ, '.env.local');

const texto = await readFile(RUTA_ENV, 'utf8').catch(() => '');
const presentes = new Set(
  texto
    .split(/\r?\n/)
    .map((l) => l.split('=')[0]?.trim())
    .filter(Boolean)
);

const faltantes = [];
const agregar = (clave, valor) => {
  if (!presentes.has(clave)) faltantes.push(`${clave}=${valor}`);
};

const vapid = webpush.generateVAPIDKeys();
agregar('NEXT_PUBLIC_VAPID_PUBLIC_KEY', vapid.publicKey);
agregar('VAPID_PRIVATE_KEY', vapid.privateKey);
agregar('VAPID_SUBJECT', 'mailto:notificaciones@ciberteque.app');
agregar('PUSH_DISPATCH_SECRET', randomBytes(24).toString('hex'));

if (faltantes.length === 0) {
  console.log('El .env.local ya tenía todas las variables de push. No se tocó nada.');
} else {
  const bloque =
    '\n# Notificaciones push (generado por scripts/generar-vapid.mjs)\n' +
    faltantes.join('\n') +
    '\n';
  await appendFile(RUTA_ENV, bloque, 'utf8');
  console.log(
    `Agregadas al .env.local: ${faltantes.map((l) => l.split('=')[0]).join(', ')}`
  );
  console.log('Copia estas mismas variables al panel de Vercel para producción.');
}
