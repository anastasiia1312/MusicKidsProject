import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './firebase';
import { handleFirestoreError, OperationType } from './authService';
import type { UserProfile } from '../types/auth';
import type { Lesson, CreateLessonPayload } from '../types/lesson';

interface CreateManualLessonCallablePayload {
  studentId: string;
  title: string;
  date: string;
  startTime: string;
  duration?: number;
  idempotencyKey?: string;
}

interface CreateManualLessonCallableResponse {
  success: boolean;
  lessonId: string;
  title: string;
  teacherId: string;
  studentId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: 45;
  status: 'scheduled';
  meetUrl: string;
  meetSpaceName: string | null;
  message: string;
}

/**
 * Adapta errores de Firebase Functions a mensajes amigables y comprensibles para el usuario
 */
export function formatManualLessonError(error: any): string {
  if (!error) return 'Ocurrió un error inesperado al procesar la solicitud.';

  const code = (error.code || '').replace('functions/', '').toLowerCase();
  const rawMsg = (error.message || '').toString();

  switch (code) {
    case 'already-exists':
      return 'El horario seleccionado ya se encuentra ocupado por otra clase o abono mensual.';

    case 'unauthenticated':
      return 'Debés iniciar sesión en MusicKids para crear una clase.';

    case 'permission-denied':
      return 'No tenés permisos para realizar esta acción. Solo profesores activos pueden programar clases.';

    case 'failed-precondition': {
      const lower = rawMsg.toLowerCase();
      if (lower.includes('meet') || lower.includes('sala')) {
        return 'Debés configurar tu sala permanente de Google Meet en tu perfil antes de programar una clase.';
      }
      if (lower.includes('bloquead') || lower.includes('vacation') || lower.includes('calendario')) {
        return 'La fecha u horario seleccionado se encuentra bloqueado en tu calendario de disponibilidad.';
      }
      if (lower.includes('transcurrido') || lower.includes('comenzado') || lower.includes('pasado')) {
        return 'No podés programar clases en fechas u horarios que ya han transcurrido.';
      }
      if (lower.includes('alumno')) {
        return 'El alumno seleccionado no se encuentra disponible o no existe.';
      }
      return rawMsg && !rawMsg.includes('INTERNAL')
        ? rawMsg
        : 'No se cumplen las condiciones necesarias para programar la clase en este horario.';
    }

    case 'unavailable':
      return 'No se pudo conectar con el servidor de MusicKids. Verificá tu conexión a internet e intentá nuevamente.';

    case 'deadline-exceeded':
      return 'El servidor tardó demasiado en responder. Por favor, verificá en tu panel si la clase fue creada o intentá nuevamente.';

    case 'invalid-argument':
      return 'Los datos de la clase son inválidos. Por favor, revisá los campos del formulario.';

    case 'not-found':
      return 'El servicio de creación de clases no se encuentra disponible en este momento. Por favor, intentá más tarde.';

    default:
      if (rawMsg && !rawMsg.includes('INTERNAL') && !rawMsg.includes('FirebaseError')) {
        return rawMsg;
      }
      return 'Ocurrió un error al registrar la clase. Por favor, intentá nuevamente.';
  }
}

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
 * Crea una nueva clase en la plataforma mediante la Cloud Function v2 'createManualLesson'
 * Garantiza la serialización atómica de horarios con teacherDailySchedule y evita solapamientos.
 */
export async function createLesson(payload: CreateLessonPayload): Promise<string> {
  // 1. Verificación de autenticación del profesor
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Debés iniciar sesión en MusicKids para crear una clase.');
  }

  // 2. Extraer fecha (YYYY-MM-DD) y hora (HH:mm)
  let dateStr = payload.dateStr?.trim();
  let startTimeStr = payload.startTime?.trim();

  if (!dateStr || !startTimeStr) {
    if (!payload.date) {
      throw new Error('Debés indicar la fecha y hora de la clase.');
    }
    const dateObj =
      payload.date instanceof Timestamp
        ? payload.date.toDate()
        : payload.date instanceof Date
        ? payload.date
        : new Date(payload.date);

    if (isNaN(dateObj.getTime())) {
      throw new Error('La fecha de la clase no es válida.');
    }

    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    if (!dateStr) dateStr = `${y}-${m}-${d}`;

    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    if (!startTimeStr) startTimeStr = `${h}:${min}`;
  }

  // 3. Generar idempotencyKey estable por intento de creación
  const stableIdempotencyKey =
    payload.idempotencyKey?.trim() ||
    `man_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // 4. Adaptar payload al contrato estricto de la Cloud Function
  // NOTA DE SEGURIDAD: NO se envían teacherId, meetUrl ni meetSpaceName como autoridad desde el cliente.
  const functionPayload: CreateManualLessonCallablePayload = {
    studentId: payload.studentId.trim(),
    title: payload.title.trim(),
    date: dateStr,
    startTime: startTimeStr,
    duration: 45,
    idempotencyKey: stableIdempotencyKey,
  };

  const createManualLessonFn = httpsCallable<
    CreateManualLessonCallablePayload,
    CreateManualLessonCallableResponse
  >(functions, 'createManualLesson');

  // 5. Invocación con reintento automático seguro en fallos transitorios de red
  // utilizando exactamente la misma idempotencyKey
  let lastError: any = null;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await createManualLessonFn(functionPayload);
      if (response.data && response.data.lessonId) {
        return response.data.lessonId;
      }
      throw new Error('Respuesta del servidor incompleta sin identificador de clase.');
    } catch (err: any) {
      lastError = err;
      const code = (err?.code || '').replace('functions/', '').toLowerCase();

      // Solo reintentar automáticamente si es un fallo de conectividad transitorio ('unavailable')
      if (attempt < maxAttempts && code === 'unavailable') {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }

      break;
    }
  }

  // 6. Manejo y formateo de errores comprensibles para el usuario
  const userFriendlyMessage = formatManualLessonError(lastError);
  throw new Error(userFriendlyMessage);
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

export interface BookSlotParams {
  availabilityId: string;
  teacherId: string;
  studentId: string;
  teacherName?: string;
  slotDate: string;
  slotStartTime: string;
  duration: number;
}

/**
 * @deprecated [LEGACY] La reserva de clases individuales fuera de un abono mensual ha sido descontinuada.
 * MusicKids gestiona las reservas exclusivamente mediante abonos mensuales recurrentes (teacherRecurringSlots).
 */
export async function bookTeacherSlot(params: BookSlotParams): Promise<{ lessonId: string }> {
  throw new Error(
    'INDIVIDUAL_BOOKINGS_DEPRECATED: La reserva de clases individuales fuera de un abono mensual ha sido descontinuada. Las clases se contratan exclusivamente mediante abonos mensuales.'
  );
}
