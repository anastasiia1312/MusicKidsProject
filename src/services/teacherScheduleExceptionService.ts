import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { handleFirestoreError, OperationType } from './authService';
import type {
  TeacherScheduleException,
  CreateScheduleExceptionPayload,
  ScheduleExceptionType,
} from '../types/scheduleException';
import type { Lesson } from '../types/lesson';
import type { TeacherRecurringSlot } from '../types/recurringSchedule';
import { populateLessonUsers } from './lessonService';
import { hasIntervalOverlap } from './recurringScheduleService';

export const EXCEPTIONS_COLLECTION = 'teacherScheduleExceptions';

/**
 * Valida que una fecha string tenga formato YYYY-MM-DD y sea válida en el calendario.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return false;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

/**
 * Valida un payload para crear una excepción de horario.
 */
export function validateScheduleExceptionPayload(payload: CreateScheduleExceptionPayload): void {
  if (!payload) {
    throw new Error('Los datos de la excepción son obligatorios.');
  }

  if (!payload.teacherId || typeof payload.teacherId !== 'string' || !payload.teacherId.trim()) {
    throw new Error('El ID del profesor es obligatorio.');
  }

  if (payload.type === 'vacation') {
    throw new Error(
      'La creación de nuevos períodos de vacaciones ha sido descontinuada. Utilice el bloqueo de fecha completa (blocked_date) para cada día individual.'
    );
  }

  const validTypes: ScheduleExceptionType[] = ['blocked_date', 'blocked_slot'];
  if (!payload.type || !validTypes.includes(payload.type)) {
    throw new Error(
      `Tipo de excepción no válido. Se esperaba uno de: ${validTypes.join(', ')}.`
    );
  }

  if (!isValidCalendarDate(payload.startDate)) {
    throw new Error(`La fecha de inicio "${payload.startDate}" no es una fecha válida (YYYY-MM-DD).`);
  }

  if (!isValidCalendarDate(payload.endDate)) {
    throw new Error(`La fecha de fin "${payload.endDate}" no es una fecha válida (YYYY-MM-DD).`);
  }

  if (payload.startDate > payload.endDate) {
    throw new Error('La fecha de inicio no puede ser posterior a la fecha de fin.');
  }

  if (payload.type === 'blocked_date') {
    if (payload.startDate !== payload.endDate) {
      throw new Error('Para bloquear una fecha puntual, la fecha de inicio y fin deben ser idénticas.');
    }
  }

  if (payload.type === 'blocked_slot') {
    if (payload.startDate !== payload.endDate) {
      throw new Error('Para bloquear un horario puntual, la fecha de inicio y fin deben coincidir.');
    }
    if (!payload.recurringSlotId || !payload.recurringSlotId.trim()) {
      throw new Error('Se requiere el ID de la regla recurrente (recurringSlotId) para bloquear un horario.');
    }
    if (payload.targetTime) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(payload.targetTime.trim())) {
        throw new Error('La hora del horario debe tener el formato HH:mm.');
      }
    }
  }
}

/**
 * Determina si una fecha dada cae dentro de un período de vacaciones.
 */
export function isDateCoveredByVacation(
  dateStr: string,
  exceptions: TeacherScheduleException[]
): TeacherScheduleException | undefined {
  if (!dateStr || !exceptions || exceptions.length === 0) return undefined;
  return exceptions.find(
    (ex) =>
      ex.type === 'vacation' &&
      dateStr >= ex.startDate &&
      dateStr <= ex.endDate
  );
}

/**
 * Determina si una fecha dada está completamente bloqueada (día bloqueado o vacaciones).
 */
export function isDateBlocked(
  dateStr: string,
  exceptions: TeacherScheduleException[]
): TeacherScheduleException | undefined {
  if (!dateStr || !exceptions || exceptions.length === 0) return undefined;
  return exceptions.find(
    (ex) =>
      (ex.type === 'blocked_date' && ex.startDate === dateStr) ||
      (ex.type === 'vacation' && dateStr >= ex.startDate && dateStr <= ex.endDate)
  );
}

/**
 * Determina si un horario específico de una regla recurrente está bloqueado en una fecha dada.
 */
export function isSlotBlocked(
  dateStr: string,
  recurringSlotId: string,
  startTime: string,
  exceptions: TeacherScheduleException[]
): TeacherScheduleException | undefined {
  if (!dateStr || !exceptions || exceptions.length === 0) return undefined;

  // 1. Si el día entero está bloqueado o en vacaciones, el slot está bloqueado
  const dateBlock = isDateBlocked(dateStr, exceptions);
  if (dateBlock) return dateBlock;

  // 2. Si hay un bloqueo puntual para este slot en esta fecha
  return exceptions.find(
    (ex) =>
      ex.type === 'blocked_slot' &&
      ex.startDate === dateStr &&
      (ex.recurringSlotId === recurringSlotId || (ex.targetTime && ex.targetTime === startTime))
  );
}

/**
 * Verifica si existen clases reservadas activas del profesor en el intervalo especificado.
 * Permite advertir al profesor antes de crear la excepción, garantizando que NUNCA se cancelen
 * ni modifiquen automáticamente.
 */
export async function checkConflictingBookedLessons(
  teacherId: string,
  startDate: string,
  endDate: string,
  targetTime?: string
): Promise<Lesson[]> {
  const path = 'lessons';
  try {
    const q = query(
      collection(db, path),
      where('teacherId', '==', teacherId)
    );
    const snap = await getDocs(q);

    const matchingLessons: Lesson[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const status = data.status || 'scheduled';

      // Ignorar clases canceladas o finalizadas
      if (status === 'cancelled') return;

      if (!data.date) return;
      const lessonDate: Date = data.date.toDate ? data.date.toDate() : new Date(data.date);
      if (isNaN(lessonDate.getTime())) return;

      // Obtener fecha ISO local YYYY-MM-DD
      const year = lessonDate.getFullYear();
      const month = String(lessonDate.getMonth() + 1).padStart(2, '0');
      const day = String(lessonDate.getDate()).padStart(2, '0');
      const lessonDateStr = `${year}-${month}-${day}`;

      // Comprobar si la fecha de la clase cae en [startDate, endDate]
      if (lessonDateStr >= startDate && lessonDateStr <= endDate) {
        // Si se indicó un targetTime específico (bloqueo de horario individual)
        if (targetTime) {
          const hours = String(lessonDate.getHours()).padStart(2, '0');
          const minutes = String(lessonDate.getMinutes()).padStart(2, '0');
          const lessonTimeStr = `${hours}:${minutes}`;
          if (lessonTimeStr !== targetTime) {
            return;
          }
        }

        matchingLessons.push({
          id: docSnap.id,
          ...data,
        } as Lesson);
      }
    });

    if (matchingLessons.length > 0) {
      return await populateLessonUsers(matchingLessons);
    }

    return [];
  } catch (err) {
    console.warn('Error al verificar clases reservadas en el rango:', err);
    return [];
  }
}

/**
 * Obtiene todas las excepciones registradas de un profesor.
 */
export async function getTeacherScheduleExceptions(
  teacherId: string
): Promise<TeacherScheduleException[]> {
  try {
    const q = query(
      collection(db, EXCEPTIONS_COLLECTION),
      where('teacherId', '==', teacherId)
    );
    const snap = await getDocs(q);

    const exceptions: TeacherScheduleException[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      exceptions.push({
        id: docSnap.id,
        teacherId: data.teacherId,
        type: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        recurringSlotId: data.recurringSlotId,
        targetTime: data.targetTime,
        reason: data.reason || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });

    // Ordenar cronológicamente por startDate y luego endDate
    exceptions.sort((a, b) => {
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
      return a.endDate.localeCompare(b.endDate);
    });

    return exceptions;
  } catch (error: any) {
    // Si la regla de seguridad todavía no está desplegada en el servidor Firestore
    if (error?.code === 'permission-denied') {
      const err = new Error(
        'Las reglas de seguridad de Firestore para teacherScheduleExceptions aún no están desplegadas en producción.'
      );
      (err as any).isRulesPending = true;
      throw err;
    }
    handleFirestoreError(error, OperationType.GET, EXCEPTIONS_COLLECTION);
  }
}

/**
 * Crea una nueva excepción de horario (bloqueo de horario, fecha completa o vacaciones).
 */
export async function createScheduleException(
  payload: CreateScheduleExceptionPayload
): Promise<TeacherScheduleException> {
  validateScheduleExceptionPayload(payload);

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== payload.teacherId) {
    throw new Error('No podés crear una excepción para otro profesor.');
  }

  // Prevenir duplicados idénticos
  const existing = await getTeacherScheduleExceptions(payload.teacherId);

  if (payload.type === 'blocked_slot') {
    const isAlreadyBlocked = existing.some(
      (ex) =>
        ex.type === 'blocked_slot' &&
        ex.startDate === payload.startDate &&
        ex.recurringSlotId === payload.recurringSlotId
    );
    if (isAlreadyBlocked) {
      throw new Error('Este horario ya se encuentra bloqueado para esta fecha.');
    }
  } else if (payload.type === 'blocked_date') {
    const isAlreadyBlockedDate = existing.some(
      (ex) => ex.type === 'blocked_date' && ex.startDate === payload.startDate
    );
    if (isAlreadyBlockedDate) {
      throw new Error('Esta fecha ya se encuentra bloqueada.');
    }
  }

  try {
    const docData: Record<string, any> = {
      teacherId: payload.teacherId,
      type: payload.type,
      startDate: payload.startDate,
      endDate: payload.endDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (payload.recurringSlotId) {
      docData.recurringSlotId = payload.recurringSlotId;
    }
    if (payload.targetTime) {
      docData.targetTime = payload.targetTime;
    }
    if (payload.reason && payload.reason.trim()) {
      docData.reason = payload.reason.trim();
    }

    const docRef = await addDoc(collection(db, EXCEPTIONS_COLLECTION), docData);

    return {
      id: docRef.id,
      ...payload,
      createdAt: new Date(),
    };
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      const err = new Error(
        'Permiso denegado por Firestore. Las reglas para teacherScheduleExceptions deben ser desplegadas en Firebase Console.'
      );
      (err as any).isRulesPending = true;
      throw err;
    }
    handleFirestoreError(error, OperationType.CREATE, EXCEPTIONS_COLLECTION);
  }
}

/**
 * Elimina una excepción existente para restablecer la disponibilidad original.
 */
export async function deleteScheduleException(
  exceptionId: string,
  teacherId: string
): Promise<void> {
  if (!exceptionId || !exceptionId.trim()) {
    throw new Error('ID de excepción no proporcionado.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== teacherId) {
    throw new Error('No tenés permisos para eliminar esta excepción.');
  }

  try {
    const docRef = doc(db, EXCEPTIONS_COLLECTION, exceptionId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new Error('La excepción no existe o ya fue eliminada.');
    }

    const data = snap.data();
    if (data.teacherId !== teacherId) {
      throw new Error('No podés eliminar una excepción que no te pertenece.');
    }

    await deleteDoc(docRef);
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      const err = new Error(
        'Permiso denegado por Firestore al eliminar la excepción.'
      );
      (err as any).isRulesPending = true;
      throw err;
    }
    handleFirestoreError(error, OperationType.DELETE, EXCEPTIONS_COLLECTION);
  }
}

/**
 * Obtiene la fecha actual en formato ISO local "YYYY-MM-DD" para la zona horaria
 * oficial de la plataforma: America/Argentina/Buenos_Aires.
 */
export function getBuenosAiresTodayDateStr(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export interface PunctualSlotConflictParams {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  duration: number; // en minutos (30, 45, 60)
  exceptions: TeacherScheduleException[];
  recurringSlots: TeacherRecurringSlot[];
}

export interface PunctualSlotConflictResult {
  hasConflict: boolean;
  conflictType?: 'vacation' | 'blocked_date' | 'blocked_slot';
  errorMessage?: string;
  exception?: TeacherScheduleException;
}

/**
 * Valida si un horario puntual propuesto ("Solo esta fecha") entra en conflicto con
 * las excepciones y vacaciones registradas del profesor.
 *
 * Reglas evaluadas:
 * 1. Si la fecha cae dentro de un período 'vacation', impide la creación:
 *    -> "No podés crear un horario disponible durante tus vacaciones."
 * 2. Si existe un 'blocked_date' para esa fecha, impide la creación:
 *    -> "Esta fecha está bloqueada en tu calendario."
 * 3. Si existe un 'blocked_slot' en esa fecha para una ocurrencia recurrente,
 *    resuelve el intervalo real de la regla recurrente (o targetTime) e impide la creación
 *    únicamente si los intervalos se superponen en formato semiabierto [startA, endA) vs [startB, endB):
 *    (startA < endB && startB < endA).
 *    Los intervalos consecutivos (ej. 16:00-17:00 y 17:00-18:00) NO se superponen y son permitidos.
 *    -> "Este horario coincide con una franja bloqueada para esta fecha."
 */
export function checkPunctualSlotExceptionConflict(
  params: PunctualSlotConflictParams
): PunctualSlotConflictResult {
  const { date, startTime, duration, exceptions, recurringSlots } = params;

  if (!date || !startTime || !duration || !exceptions || exceptions.length === 0) {
    return { hasConflict: false };
  }

  // 1. Comprobar si la fecha está dentro de un período de vacaciones
  const vacationEx = isDateCoveredByVacation(date, exceptions);
  if (vacationEx) {
    return {
      hasConflict: true,
      conflictType: 'vacation',
      errorMessage: 'No podés crear un horario disponible durante tus vacaciones.',
      exception: vacationEx,
    };
  }

  // 2. Comprobar si existe bloqueo de fecha completa (blocked_date)
  const blockedDateEx = exceptions.find(
    (ex) => ex.type === 'blocked_date' && ex.startDate === date
  );
  if (blockedDateEx) {
    return {
      hasConflict: true,
      conflictType: 'blocked_date',
      errorMessage: 'Esta fecha está bloqueada en tu calendario.',
      exception: blockedDateEx,
    };
  }

  // 3. Comprobar si existe un horario específico bloqueado en esa fecha (blocked_slot)
  const blockedSlotsOnDate = exceptions.filter(
    (ex) => ex.type === 'blocked_slot' && ex.startDate === date
  );

  for (const ex of blockedSlotsOnDate) {
    // Resolver la regla recurrente correspondiente a este bloqueo
    const matchingRule = recurringSlots.find((r) => r.id === ex.recurringSlotId);
    const ruleStart = matchingRule ? matchingRule.startTime : ex.targetTime;
    const ruleDuration = matchingRule ? matchingRule.duration : 60;

    if (ruleStart) {
      const overlaps = hasIntervalOverlap(startTime, duration, ruleStart, ruleDuration);
      if (overlaps) {
        return {
          hasConflict: true,
          conflictType: 'blocked_slot',
          errorMessage: 'Este horario coincide con una franja bloqueada para esta fecha.',
          exception: ex,
        };
      }
    }
  }

  return { hasConflict: false };
}

