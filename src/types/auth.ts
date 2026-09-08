/**
 * Tipos de datos para el sistema de autenticación y perfiles de MusicKids
 */

export type UserRole = 'student' | 'teacher';

export type AuthProviderType = 'email' | 'google';

export type TeacherInstrument = 'guitar' | 'ukulele' | 'solfege' | 'vocal';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL: string | null;
  authProvider: AuthProviderType;
  createdAt: any; // Firebase Timestamp o string serializado
  // Campos opcionales del perfil del profesor:
  birthDate?: string; // Formato YYYY-MM-DD
  instruments?: string[]; // Array con 'guitar', 'ukulele', 'solfege', 'vocal'
  education?: string; // Formación musical y estudios
  bio?: string; // Presentación personal
  updatedAt?: any;
}

export interface TeacherProfileFormData {
  birthDate: string;
  instruments: string[];
  education: string;
  bio: string;
}

export interface StudentProfileFormData {
  birthDate: string;
  bio: string;
}

export interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
  role: UserRole | '';
}

export interface LoginFormData {
  email: string;
  password: string;
}
