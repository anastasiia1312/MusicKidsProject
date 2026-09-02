import { Timestamp } from 'firebase/firestore';

export type LessonStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Lesson {
  id: string;
  title: string;
  teacherId: string;
  studentId: string;
  date: Timestamp;
  duration: number; // Duración en minutos (30, 45, 60, 90)
  status: LessonStatus;
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
  teacherId: string;
  studentId: string;
  date: Timestamp;
  duration: number;
  meetUrl?: string;
  meetSpaceName?: string;
}
