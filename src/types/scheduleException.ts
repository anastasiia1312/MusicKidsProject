import { Timestamp } from 'firebase/firestore';

export type ScheduleExceptionType = 'blocked_date' | 'blocked_slot' | 'vacation';

/**
 * Representa una excepción a la disponibilidad semanal recurrente de un profesor.
 * - 'blocked_slot': Bloquea una ocurrencia específica de una regla recurrente en una fecha puntual.
 * - 'blocked_date': Bloquea una fecha completa (startDate == endDate).
 * - 'vacation': Bloquea un intervalo de fechas consecutivas (vacaciones / ausencia multidia).
 */
export interface TeacherScheduleException {
  id?: string;
  teacherId: string;
  type: ScheduleExceptionType;
  startDate: string; // Formato "YYYY-MM-DD"
  endDate: string; // Formato "YYYY-MM-DD"
  recurringSlotId?: string; // Requerido para 'blocked_slot'
  targetTime?: string; // Opcional "HH:mm" para facilitar búsquedas y reportes
  reason?: string; // Motivo opcional (ej: "Feriado", "Vacaciones de invierno", "Médico")
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface CreateScheduleExceptionPayload {
  teacherId: string;
  type: ScheduleExceptionType;
  startDate: string;
  endDate: string;
  recurringSlotId?: string;
  targetTime?: string;
  reason?: string;
}
