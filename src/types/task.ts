/**
 * Tipos de datos para el módulo de Tareas y Materiales
 * Proyecto: MusicKids
 */

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  path: string; // Ruta interna en Firebase Storage (para eliminación segura sin huérfanos)
  size: number; // Tamaño en bytes
  type: string; // MIME type (ej. "application/pdf", "image/png", "audio/mpeg")
}

export interface Task {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  attachments: TaskAttachment[];
  createdAt: any;
  updatedAt: any;
}

export interface CreateTaskPayload {
  title: string;
  description: string;
  studentId: string;
  attachments?: TaskAttachment[];
}

export interface UpdateTaskPayload {
  title: string;
  description: string;
  studentId: string;
  attachments?: TaskAttachment[];
}
