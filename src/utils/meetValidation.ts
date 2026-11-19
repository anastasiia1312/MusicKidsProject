import type { Lesson } from '../types/lesson';

const MEET_URL_REGEX =
  /^https:\/\/meet\.google\.com\/[a-zA-Z0-9]{2,}(?:-[a-zA-Z0-9]+)+(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

/**
 * Valida estrictamente que una URL de Google Meet tenga formato oficial válido.
 */
export function isValidMeetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return MEET_URL_REGEX.test(url.trim());
}

/**
 * Determina si la clase está en un estado autorizado para habilitar el acceso a Google Meet.
 * - Exige que no esté cancelada ni expirada.
 * - Si pertenece a un abono mensual, exige paymentStatus === 'confirmed'.
 * - Para clases manuales heredadas sin paymentStatus, permite el acceso mientras no esté cancelada/expirada.
 */
export function isLessonMeetAuthorized(lesson?: Partial<Lesson> | null): boolean {
  if (!lesson) return false;
  if (lesson.status === 'cancelled' || lesson.status === 'expired') return false;

  const paymentStatus = (lesson as any).paymentStatus;
  if (
    paymentStatus === 'pending_confirmation' ||
    paymentStatus === 'pending_payment' ||
    paymentStatus === 'pending' ||
    paymentStatus === 'expired' ||
    paymentStatus === 'cancelled' ||
    paymentStatus === 'refunded'
  ) {
    return false;
  }

  if ((lesson as any).monthlyBookingId) {
    return paymentStatus === 'confirmed';
  }

  return !paymentStatus || paymentStatus === 'confirmed';
}

/**
 * Habilita el enlace a Google Meet ÚNICAMENTE cuando:
 * 1) El acceso está autorizado según estado y pago de la clase.
 * 2) La URL de Google Meet tiene formato estructural válido.
 */
export function canJoinLessonMeet(lesson?: Partial<Lesson> | null): boolean {
  return isLessonMeetAuthorized(lesson) && isValidMeetUrl(lesson?.meetUrl);
}
