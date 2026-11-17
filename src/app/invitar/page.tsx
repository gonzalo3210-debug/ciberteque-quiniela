import type { Metadata } from 'next'
import InvitarCliente from './InvitarCliente'

// Página pública de aterrizaje de los enlaces de invitación
// (/invitar?ref=CODIGO). Este archivo es el componente de servidor
// solo para poder declarar el metadata —el título y la descripción
// son la vista previa que WhatsApp muestra al compartir el enlace—;
// todo lo interactivo vive en InvitarCliente.tsx.
export const metadata: Metadata = {
  title: 'Únete al Club de Pronósticos',
  description:
    'Te invitaron al Club de Pronósticos: pronostica los partidos de la jornada, suma puntos y gana la bolsa. Como jugador nuevo, tu primer boleto a mitad de precio ($15).',
}

export default function PaginaInvitar() {
  return <InvitarCliente />
}
