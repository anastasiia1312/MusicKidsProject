import { Timestamp } from 'firebase/firestore';

export type RecurringSlotDuration = 30 | 45 | 60;

/**
 * Representa una regla de disponibilidad recurrente semanal de un profesor.
 * Se repite permanentemente de forma indefinida a partir de originDate.
 * dayOfWeek: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado (estándar JavaScript Date.getDay()).
 */
export interface TeacherRecurringSlot {
  id?: string;
  teacherId: string;
  dayOfWeek: number; // 0 (Domingo) a 6 (Sábado)
  startTime: string; // Formato "HH:mm" (24h, ej: "09:00")
  endTime: string; // Formato "HH:mm" (24h, ej: "09:45")
  duration: RecurringSlotDuration; // 30, 45 o 60 minutos
  isActive: boolean; // Si la regla está activa o pausada/desactivada
  originDate: string; // Formato "YYYY-MM-DD" de inicio de la recurrencia
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface CreateRecurringSlotPayload {
  teacherId: string;
  dayOfWeek: number; // 0–6
  startTime: string; // "HH:mm"
  duration: RecurringSlotDuration; // 30, 45, 60
  originDate: string; // "YYYY-MM-DD"
  isActive?: boolean;
}

export interface UpdateRecurringSlotPayload {
  dayOfWeek?: number;
  startTime?: string;
  duration?: RecurringSlotDuration;
  originDate?: string;
  isActive?: boolean;
}
