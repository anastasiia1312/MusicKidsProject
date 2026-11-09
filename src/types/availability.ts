import { Timestamp } from 'firebase/firestore';

export type AvailabilityDuration = 30 | 45 | 60;

export type AvailabilityStatus = 'available' | 'booked';

export interface TeacherAvailability {
  id?: string;
  teacherId: string;
  date: string; // Formato YYYY-MM-DD
  startTime: string; // Formato HH:mm
  duration: AvailabilityDuration; // 30, 45 o 60 minutos
  status: AvailabilityStatus; // Inicialmente siempre 'available'
  lessonId?: string; // Referencia cruzada a la clase reservada
  meetUrl?: string; // Enlace de Google Meet generado por el profesor
  meetSpaceName?: string; // Nombre del espacio oficial en Google Meet API
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface CreateAvailabilityPayload {
  teacherId: string;
  date: string;
  startTime: string;
  duration: AvailabilityDuration;
  meetUrl?: string;
  meetSpaceName?: string;
}

export interface UpdateAvailabilityPayload {
  date: string;
  startTime: string;
  duration: AvailabilityDuration;
  meetUrl?: string;
  meetSpaceName?: string;
}
