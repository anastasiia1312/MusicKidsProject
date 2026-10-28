import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile, UserRole, UserStatus } from '../types/auth';

export interface AdminUserStats {
  total: number;
  teachers: number;
  students: number;
  admins: number;
}

/**
 * Consulta la colección 'users' de Firestore y normaliza los documentos.
 * Los usuarios sin campo 'status' se consideran 'active' por compatibilidad.
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  try {
    const usersCol = collection(db, 'users');
    const snapshot = await getDocs(usersCol);

    const users: UserProfile[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Normalizar datos asegurando campos básicos
      const userProfile: UserProfile = {
        uid: docSnap.id,
        name: data.name || 'Sin nombre',
        email: data.email || '',
        role: (data.role as UserRole) || 'student',
        // Si no tiene status definido, por defecto es 'active'
        status: (data.status as UserStatus) || 'active',
        photoURL: data.photoURL || null,
        authProvider: data.authProvider || 'email',
        createdAt: data.createdAt,
        birthDate: data.birthDate,
        instruments: Array.isArray(data.instruments) ? data.instruments : [],
        education: data.education,
        bio: data.bio,
        singleLessonPrice: typeof data.singleLessonPrice === 'number' ? data.singleLessonPrice : undefined,
        monthlyPlans: Array.isArray(data.monthlyPlans) ? data.monthlyPlans : undefined,
        updatedAt: data.updatedAt,
      };

      users.push(userProfile);
    });

    // Ordenar de más reciente a más antiguo si createdAt existe
    users.sort((a, b) => {
      const timeA = parseCreatedAtMillis(a.createdAt);
      const timeB = parseCreatedAtMillis(b.createdAt);
      return timeB - timeA;
    });

    return users;
  } catch (error) {
    console.error('Error al obtener la lista de usuarios en adminService:', error);
    throw error;
  }
}

/**
 * Convierte cualquier formato de createdAt (Firestore Timestamp, objeto {seconds}, string ISO o Date) a milisegundos.
 */
export function parseCreatedAtMillis(createdAt: any): number {
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === 'function') {
    return createdAt.toMillis();
  }
  if (typeof createdAt.toDate === 'function') {
    return createdAt.toDate().getTime();
  }
  if (typeof createdAt.seconds === 'number') {
    return createdAt.seconds * 1000;
  }
  if (typeof createdAt === 'string' || typeof createdAt === 'number') {
    const parsed = new Date(createdAt).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Formatea una fecha de registro amigable en español.
 */
export function formatRegistrationDate(createdAt: any): string {
  const millis = parseCreatedAtMillis(createdAt);
  if (!millis) return 'Fecha no disponible';

  try {
    const date = new Date(millis);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return 'Fecha inválida';
  }
}

/**
 * Calcula las estadísticas requeridas del panel de administración.
 */
export function calculateUserStats(users: UserProfile[]): AdminUserStats {
  let teachers = 0;
  let students = 0;
  let admins = 0;

  users.forEach((u) => {
    if (u.role === 'teacher') teachers++;
    else if (u.role === 'student') students++;
    else if (u.role === 'admin') admins++;
  });

  return {
    total: users.length,
    teachers,
    students,
    admins,
  };
}

/**
 * Actualiza el estado de un usuario a 'active' o 'disabled'.
 * - Protegido contra auto-desactivación: un administrador no puede modificar su propio estado.
 * - Modifica exclusivamente el campo 'status' para cumplir con las reglas estrictas de Firestore.
 */
export async function updateUserStatus(
  currentAdminUid: string,
  targetUserId: string,
  newStatus: UserStatus
): Promise<void> {
  if (!currentAdminUid) {
    throw new Error('Debe iniciar sesión como administrador para realizar esta acción.');
  }

  if (currentAdminUid === targetUserId) {
    throw new Error('Un administrador no puede modificar el estado de su propia cuenta.');
  }

  try {
    const userDocRef = doc(db, 'users', targetUserId);
    // Modificar exclusivamente el campo 'status'
    await updateDoc(userDocRef, {
      status: newStatus,
    });
  } catch (error: any) {
    console.error(`Error al actualizar estado del usuario ${targetUserId} a ${newStatus}:`, error);
    throw error;
  }
}
