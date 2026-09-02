import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  documentId,
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './authService';
import type { UserProfile } from '../types/auth';
import type { Lesson, CreateLessonPayload } from '../types/lesson';

/**
 * Obtiene la lista de todos los usuarios registrados con rol 'student'
 */
export async function getStudents(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const q = query(collection(db, path), where('role', '==', 'student'));
    const querySnapshot = await getDocs(q);
    const students: UserProfile[] = [];
    querySnapshot.forEach((docSnap) => {
      students.push(docSnap.data() as UserProfile);
    });
    return students;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Crea una nueva clase en la colección 'lessons'
 */
export async function createLesson(payload: CreateLessonPayload): Promise<string> {
  const path = 'lessons';
  try {
    const lessonData: Record<string, any> = {
      title: payload.title.trim(),
      teacherId: payload.teacherId,
      studentId: payload.studentId,
      date: payload.date,
      duration: payload.duration,
      status: 'scheduled' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (payload.meetUrl) {
      lessonData.meetUrl = payload.meetUrl;
    }
    if (payload.meetSpaceName) {
      lessonData.meetSpaceName = payload.meetSpaceName;
    }

    const docRef = await addDoc(collection(db, path), lessonData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Helper para resolver y poblar los nombres y correos de profesor y alumno en una lista de clases
 */
export async function populateLessonUsers(lessons: Lesson[]): Promise<Lesson[]> {
  if (lessons.length === 0) return [];

  // Extraer todos los UIDs únicos de profesores y alumnos
  const userIds = Array.from(
    new Set([
      ...lessons.map((l) => l.teacherId),
      ...lessons.map((l) => l.studentId),
    ])
  ).filter(Boolean);

  if (userIds.length === 0) return lessons;

  const userCache = new Map<string, UserProfile>();

  try {
    // Firestore where in soporta hasta 30 elementos por lote
    for (let i = 0; i < userIds.length; i += 30) {
      const batchIds = userIds.slice(i, i + 30);
      const q = query(
        collection(db, 'users'),
        where(documentId(), 'in', batchIds)
      );
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        userCache.set(docSnap.id, docSnap.data() as UserProfile);
      });
    }

    return lessons.map((lesson) => {
      const teacher = userCache.get(lesson.teacherId);
      const student = userCache.get(lesson.studentId);

      return {
        ...lesson,
        teacherName: teacher?.name || 'Profesor',
        teacherEmail: teacher?.email || '',
        studentName: student?.name || 'Alumno',
        studentEmail: student?.email || '',
      };
    });
  } catch (error) {
    console.error('Error al resolver usuarios de clases:', error);
    return lessons;
  }
}

/**
 * Obtiene todas las clases creadas por un profesor específico, ordenadas por fecha
 */
export async function getTeacherLessons(teacherId: string): Promise<Lesson[]> {
  const path = 'lessons';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherId));
    const querySnapshot = await getDocs(q);
    const rawLessons: Lesson[] = [];

    querySnapshot.forEach((docSnap) => {
      rawLessons.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Lesson, 'id'>),
      });
    });

    // Ordenar cronológicamente en memoria por fecha (ascendente)
    rawLessons.sort((a, b) => {
      const timeA = a.date?.toMillis ? a.date.toMillis() : 0;
      const timeB = b.date?.toMillis ? b.date.toMillis() : 0;
      return timeA - timeB;
    });

    return await populateLessonUsers(rawLessons);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Obtiene todas las clases asignadas a un alumno específico, ordenadas por fecha
 */
export async function getStudentLessons(studentId: string): Promise<Lesson[]> {
  const path = 'lessons';
  try {
    const q = query(collection(db, path), where('studentId', '==', studentId));
    const querySnapshot = await getDocs(q);
    const rawLessons: Lesson[] = [];

    querySnapshot.forEach((docSnap) => {
      rawLessons.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Lesson, 'id'>),
      });
    });

    // Ordenar cronológicamente en memoria por fecha (ascendente)
    rawLessons.sort((a, b) => {
      const timeA = a.date?.toMillis ? a.date.toMillis() : 0;
      const timeB = b.date?.toMillis ? b.date.toMillis() : 0;
      return timeA - timeB;
    });

    return await populateLessonUsers(rawLessons);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Obtiene una clase individual por su ID, resolviendo los nombres de profesor y alumno
 */
export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  const path = `lessons/${lessonId}`;
  try {
    const docRef = doc(db, 'lessons', lessonId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const rawLesson: Lesson = {
      id: docSnap.id,
      ...(docSnap.data() as Omit<Lesson, 'id'>),
    };

    const populated = await populateLessonUsers([rawLesson]);
    return populated[0] || rawLesson;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
