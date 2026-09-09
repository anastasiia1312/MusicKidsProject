import { Timestamp } from 'firebase/firestore';

export type AvailabilityDuration = 30 | 45 | 60;

export type AvailabilityStatus = 'available';

export interface TeacherAvailability {
  id?: string;
  teacherId: string;
  date: string; // Formato YYYY-MM-DD
  startTime: string; // Formato HH:mm
  duration: AvailabilityDuration; // 30, 45 o 60 minutos
  status: AvailabilityStatus; // Inicialmente siempre 'available'
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface CreateAvailabilityPayload {
  teacherId: string;
  date: string;
  startTime: string;
  duration: AvailabilityDuration;
}

export interface UpdateAvailabilityPayload {
  date: string;
  startTime: string;
  duration: AvailabilityDuration;
}
