/**
 * Tipos de datos para el SUBBLOQUE 6A:
 * Selección y vista previa de reservas mensuales de alumnos en MusicKids.
 */

export type OccurrenceStatus =
  | 'available'
  | 'occupied'
  | 'vacation'
  | 'blocked_date'
  | 'blocked_slot'
  | 'not_originated'
  | 'past';

export interface MonthlyOccurrencePreview {
  id: string; // ID único: ${ruleId}-${date}
  ruleId: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0: Domingo ... 6: Sábado
  dayName: string; // "Lunes", "Martes", etc.
  formattedDate: string; // e.g. "Lunes 7 de diciembre de 2026"
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // 30, 45, 60
  status: OccurrenceStatus;
  statusLabel: string;
  conflictReason?: string;
  exceptionId?: string;
}

export interface MonthOption {
  year: number;
  month: number; // 1-12
  monthKey: string; // Formato YYYY-MM (ej: "2026-12")
  label: string; // "Diciembre 2026"
  isCurrentMonth: boolean;
}

export interface MonthlyPreviewResult {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  targetClassesPerWeek: number; // 1, 2 o 3
  selectedRulesCount: number;
  totalOccurrences: number;
  availableCount: number;
  unavailableCount: number;
  isFullyAvailable: boolean; // true si unavailableCount === 0 && totalOccurrences > 0
  occurrences: MonthlyOccurrencePreview[];
}

/**
 * Tipos de datos para el SUBBLOQUE 6B:
 * Confirmación Real y Atómica de Abonos Mensuales.
 */
export type MonthlyBookingStatus =
  | 'confirmed'
  | 'pending_payment'
  | 'pending_payment_confirmation'
  | 'cancelled'
  | 'refunded'
  | 'expired';

export interface ProjectedOccurrence {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // 45
  formattedDate?: string;
}

/**
 * Entidad principal en la colección 'monthlyBookings/{bookingId}'
 */
export interface MonthlyBooking {
  id?: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  month: string; // Formato YYYY-MM (ej: "2026-12")
  year?: number;
  monthNumber?: number;
  recurringSlotIds: string[];
  weeklyFrequency: 1 | 2 | 3;
  lessonIds?: string[];
  totalLessons: number;
  occurrences?: ProjectedOccurrence[];
  status: MonthlyBookingStatus;
  totalPrice?: number;
  price?: number;
  currency?: string;
  idempotencyKey?: string;
  createdAt: any;
  updatedAt: any;
  expiresAt?: any; // Fecha exacta de expiración (24 horas después de createdAt)
  confirmedAt?: any;
  expiredAt?: any;
}

/**
 * Payload de entrada para la confirmación de abono mensual
 */
export interface ConfirmMonthlyBookingPayload {
  teacherId: string;
  month: string; // Formato YYYY-MM
  recurringSlotIds: string[];
  idempotencyKey?: string;
}

/**
 * Resultado retornado tras una confirmación exitosa
 */
export interface ConfirmMonthlyBookingResult {
  success: boolean;
  bookingId: string;
  lessonIds: string[];
  totalLessons: number;
  message: string;
}

/**
 * Payload de entrada para la reserva temporal de 24 horas (SUBBLOQUE 6B.3)
 */
export interface CreateTemporaryMonthlyBookingPayload {
  teacherId: string;
  month: string; // Formato YYYY-MM
  recurringSlotIds: string[];
  weeklyFrequency?: number;
  idempotencyKey?: string;
}

/**
 * Resultado de una reserva temporal de 24 horas
 */
export interface TemporaryMonthlyBookingResult {
  success: boolean;
  bookingId?: string;
  booking?: MonthlyBooking;
  expiresAt?: Date;
  expiresAtFormatted?: string;
  totalPrice?: number;
  currency?: 'ARS';
  totalLessons?: number;
  message: string;
  errorCode?: string;
  bankDetails?: {
    alias: string;
    cbuCvu: string;
    accountHolder: string;
    bankName?: string;
  } | null;
}

/**
 * Documento de bloqueo determinista para exclusividad de horario
 * Colección: 'teacherSlotLocks/{lockKey}'
 * lockKey = `${teacherId}_${date}_${startTime}`
 */
export interface TeacherSlotLock {
  id?: string;
  teacherId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // en minutos (45)
  bookingType: 'monthly' | 'punctual' | 'manual';
  bookingId: string; // ID del abono mensual o de la clase
  studentId: string;
  createdAt: any;
  expiresAt?: any; // Expiración exacta a las 24 horas para reservas temporales
}

