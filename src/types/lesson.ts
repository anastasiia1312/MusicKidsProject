import { Timestamp } from 'firebase/firestore';

/**
 * Duración fija y obligatoria para todas las clases y disponibilidades nuevas de MusicKids.
 */
export const LESSON_DURATION_MINUTES = 45;

export type LessonStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Lesson {
  id: string;
  title: string;
  teacherId: string;
  studentId: string;
  date: Timestamp;
  duration: number; // Duración en minutos (30, 45, 60, 90)
  status: LessonStatus;
  availabilityId?: string;
  monthlyBookingId?: string;
  meetUrl?: string;
  meetSpaceName?: string;
  createdAt?: any;
  updatedAt?: any;
  // Campos complementarios resueltos para la UI
  teacherName?: string;
  studentName?: string;
  teacherEmail?: string;
  studentEmail?: string;
}

export interface CreateLessonPayload {
  title: string;
  teacherId?: string;
  studentId: string;
  date: Timestamp | Date | any;
  duration?: number;
  monthlyBookingId?: string;
  meetUrl?: string;
  meetSpaceName?: string;
  dateStr?: string;
  startTime?: string;
  idempotencyKey?: string;
}

