/**
 * Tipos de datos para Cloud Functions v2 de MusicKids
 * SUBBLOQUE 6B.3.3: Creación atómica de reservas mensuales
 */

export interface CreateMonthlyBookingPayload {
  teacherId: string;
  month: string; // Formato "YYYY-MM" (ej: "2026-03")
  recurringSlotIds: string[]; // 1 a 3 IDs de teacherRecurringSlots
  weeklyFrequency: 1 | 2 | 3;
  idempotencyKey?: string;
  studentId?: string; // Opcional en el payload, si viene debe ser idéntico a request.auth.uid
}

export interface ProjectedClassOccurrence {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  duration: 45;
  formattedDate: string;
  recurringSlotId: string;
}

export interface CreateMonthlyBookingResponse {
  success: boolean;
  bookingId: string;
  status: 'pending_payment_confirmation';
  totalPrice: number;
  currency: 'ARS';
  totalLessons: number;
  occurrences: ProjectedClassOccurrence[];
  lessonIds: string[];
  expiresAt: string; // ISO 8601 string
  message: string;
  bankDetails?: {
    alias: string;
    cbuCvu: string;
    accountHolder: string;
    bankName?: string;
  } | null;
}

export interface DailyIntervalSlot {
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  bookingId: string;
  lessonId?: string;
  studentId: string;
  status: 'pending_payment_confirmation' | 'scheduled' | 'confirmed' | 'cancelled' | 'expired';
  expiresAt?: string | null;
}

export interface TeacherDailyScheduleDoc {
  teacherId: string;
  date: string;
  intervals: DailyIntervalSlot[];
  updatedAt: any;
}

export interface ConfirmMonthlyBookingPaymentPayload {
  bookingId: string;
}

export interface ConfirmMonthlyBookingPaymentResponse {
  success: boolean;
  bookingId: string;
  status: 'confirmed';
  totalLessons: number;
  confirmedLessonsCount: number;
  message: string;
}

export interface GetTeacherPublicAvailabilityPayload {
  teacherId: string;
  month: string; // "YYYY-MM"
}

export interface SanitizedOccupiedInterval {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export interface GetTeacherPublicAvailabilityResponse {
  teacherId: string;
  month: string;
  occupiedIntervals: SanitizedOccupiedInterval[];
  blockedDates: string[];
}

/**
 * Tipos de datos para el SUBBLOQUE 6B.3.3.4.A:
 * Creación manual transaccional de clases individuales
 */
export interface CreateManualLessonPayload {
  studentId: string;
  title: string;
  date: string; // Formato "YYYY-MM-DD"
  startTime: string; // Formato "HH:mm"
  duration?: number; // 45 minutos obligatorio para nuevas clases
  idempotencyKey?: string;
}

export interface CreateManualLessonResponse {
  success: boolean;
  lessonId: string;
  title: string;
  teacherId: string;
  studentId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  duration: 45;
  status: 'scheduled';
  meetUrl: string; // Enlace oficial verificado de Google Meet
  meetSpaceName: string | null;
  message: string;
}export interface ExpireMonthlyBookingsPayload {
  bookingId?: string;
}

export interface ExpireMonthlyBookingsResponse {
  success: boolean;
  totalChecked: number;
  expiredCount: number;
  expiredBookingIds: string[];
  message: string;
}
