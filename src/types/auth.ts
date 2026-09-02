/**
 * Tipos de datos para el sistema de autenticación y perfiles de MusicKids
 */

export type UserRole = 'student' | 'teacher';

export type AuthProviderType = 'email' | 'google';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL: string | null;
  authProvider: AuthProviderType;
  createdAt: any; // Firebase Timestamp o string serializado
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
