import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface PublicTeacherCard {
  uid: string;
  name: string;
  photoURL: string | null;
  instruments: string[];
  bio?: string;
  singleLessonPrice?: number;
}

export const INSTRUMENT_LABELS: Record<string, string> = {
  guitar: 'Guitarra',
  ukulele: 'Ukulele',
  solfege: 'Solfeo',
  vocal: 'Vocal',
};

export function getInstrumentLabel(key: string): string {
  if (INSTRUMENT_LABELS[key]) return INSTRUMENT_LABELS[key];
  if (!key) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Obtiene los profesores activos de Firestore para el catálogo del alumno.
 * Regla de negocio: role === 'teacher' y status !== 'disabled'.
 * Omite deliberadamente campos privados como email o birthDate.
 */
export async function getActiveTeachers(): Promise<PublicTeacherCard[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'teacher'));
    const querySnapshot = await getDocs(q);

    const teachers: PublicTeacherCard[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Excluir cuentas expresamente desactivadas
      if (data.status === 'disabled') {
        return;
      }

      // Sanitizar datos visibles al alumno
      teachers.push({
        uid: docSnap.id,
        name: data.name?.trim() || 'Profesor de Música',
        photoURL: data.photoURL || null,
        instruments: Array.isArray(data.instruments) ? data.instruments : [],
        bio: data.bio?.trim() || undefined,
        singleLessonPrice:
          typeof data.singleLessonPrice === 'number' && !isNaN(data.singleLessonPrice)
            ? data.singleLessonPrice
            : undefined,
      });
    });

    // Ordenar alfabéticamente por nombre
    teachers.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    return teachers;
  } catch (error) {
    console.error('Error al consultar profesores activos en Firestore:', error);
    throw error;
  }
}
