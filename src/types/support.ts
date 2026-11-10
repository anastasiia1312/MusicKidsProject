/**
 * Tipos de datos para el Sistema de Soporte Técnico (BLOQUE 8)
 * Proyecto: MusicKids
 */

export type SupportCategory =
  | 'access_issues'
  | 'classes_and_bookings'
  | 'payments_and_plans'
  | 'virtual_classroom'
  | 'musical_tools'
  | 'other';

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string }[] = [
  { id: 'access_issues', label: 'Problemas de acceso' },
  { id: 'classes_and_bookings', label: 'Clases y reservas' },
  { id: 'payments_and_plans', label: 'Pagos y abonos' },
  { id: 'virtual_classroom', label: 'Aula virtual y Google Meet' },
  { id: 'musical_tools', label: 'Herramientas musicales' },
  { id: 'other', label: 'Otros problemas' },
];

export function getCategoryLabel(category: SupportCategory | string): string {
  const found = SUPPORT_CATEGORIES.find((c) => c.id === category);
  return found ? found.label : category;
}

export type SupportTicketStatus = 'pending' | 'in_progress' | 'resolved';

export const SUPPORT_STATUS_CONFIG: Record<
  SupportTicketStatus,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  pending: {
    label: 'Pendiente',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
  },
  in_progress: {
    label: 'En proceso',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-800',
    borderClass: 'border-sky-200',
  },
  resolved: {
    label: 'Resuelto',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
  },
};

export interface SupportTicket {
  id: string;
  ticketNumber: string; // Ej: "TK-4821"
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'student' | 'teacher';
  category: SupportCategory;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  unreadForAdmin: boolean;
  unreadForUser: boolean;
  messageCount: number;
  createdAt: any;
  updatedAt: any;
  lastActivityAt: any;
  resolvedAt?: any;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'teacher' | 'admin';
  content: string;
  createdAt: any;
}

export interface CreateSupportTicketPayload {
  subject: string;
  category: SupportCategory;
  description: string;
}

export interface SendSupportMessagePayload {
  ticketId: string;
  content: string;
}
