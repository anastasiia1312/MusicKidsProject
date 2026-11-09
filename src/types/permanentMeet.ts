/**
 * Tipos de datos para el módulo de Sala Permanente de Google Meet por Profesor (Subbloque 4).
 */

export interface TeacherPermanentMeetConfig {
  teacherId: string;
  permanentMeetUrl: string;
  permanentMeetSpaceName: string;
  createdAt: any;
  updatedAt?: any;
}

export interface PermanentMeetSpaceResult {
  meetUrl: string;
  meetSpaceName: string;
  isExisting: boolean;
}
