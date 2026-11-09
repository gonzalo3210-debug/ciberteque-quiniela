// Normalización de teléfonos de México.
// Formato canónico de guardado: +52 + 10 dígitos (ej. +523111234567).
// Históricamente hubo registros guardados con otros formatos (10 dígitos solos,
// con espacios/paréntesis, 52 o 521 pegados); estas utilidades permiten
// reconocerlos a todos como el mismo número y evitar cuentas duplicadas.

export function soloDigitos(valor: string): string {
  return (valor || '').replace(/\D/g, '')
}

// Extrae los 10 dígitos nacionales de un número mexicano venga como venga:
// 3111234567 | 523111234567 | 5213111234567 | (311) 123-4567 | +52 311 123 4567
// Devuelve null si no se puede interpretar como número mexicano de 10 dígitos.
export function extraerNacionalMX(valor: string): string | null {
  const d = soloDigitos(valor)
  if (d.length === 10) return d
  if (d.length === 12 && d.startsWith('52')) return d.slice(2)
  if (d.length === 13 && d.startsWith('521')) return d.slice(3)
  return null
}

// Forma canónica en que se guarda el teléfono de un número mexicano.
export function telefonoCanonicoMX(nacional10: string): string {
  return `+52${nacional10}`
}

// Formas "limpias" en que un número pudo haber quedado guardado antes.
export function formasGuardadasMX(nacional10: string): string[] {
  return [
    `+52${nacional10}`,
    nacional10,
    `52${nacional10}`,
    `521${nacional10}`,
  ]
}

// ¿El valor guardado (sea cual sea su formato histórico) es este número?
export function esMismoNumeroMX(valorGuardado: string, nacional10: string): boolean {
  return extraerNacionalMX(valorGuardado) === nacional10
}
