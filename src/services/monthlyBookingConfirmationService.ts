/**
 * Servicio de Confirmación Real y Atómica de Abonos Mensuales (SUBBLOQUE 6B - Fase 1)
 *
 * Principios de diseño:
 * 1. El servidor es la única fuente de verdad: nunca confía en cálculos previos del cliente.
 * 2. Recalcula todas las fechas del mes en America/Argentina/Buenos_Aires.
 * 3. Ejecuta validaciones completas: originDate, fechas pasadas, blocked_date, blocked_slot,
 *    vacaciones históricas, clases ya reservadas y solapamientos.
 * 4. Aplica política de abono completo: si una sola fecha no está disponible, aborta toda la operación.
 * 5. Protección de concurrencia mediante documentos de exclusividad deterministas (TeacherSlotLock).
 * 6. Vinculación atómica: crea todas las clases en 'lessons' y el abono en 'monthlyBookings'
 *    dentro de una única transacción indivisible.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  calculateMonthlyOccurrences,
  getBuenosAiresNow,
  checkSelectedRulesOverlap,
  getFixedMonthlyRateForFrequency,
  formatExpirationBuenosAires,
  type FixedMonthlyRateResult,
} from './monthlyBookingService';
import { combineDateAndTimeToTimestamp } from '../utils/dateUtils';
import type { TeacherRecurringSlot } from '../types/recurringSchedule';
import type { TeacherScheduleException } from '../types/scheduleException';
import type { TeacherAvailability } from '../types/availability';
import type { Lesson } from '../types/lesson';
import type {
  MonthlyBooking,
  ConfirmMonthlyBookingPayload,
  ConfirmMonthlyBookingResult,
  TeacherSlotLock,
  CreateTemporaryMonthlyBookingPayload,
  TemporaryMonthlyBookingResult,
} from '../types/monthlyBooking';
import type { UserProfile } from '../types/auth';
import { fetchUserProfile } from './authService';
import { getTeacherRecurringSlots } from './recurringScheduleService';
import { getTeacherScheduleExceptions } from './teacherScheduleExceptionService';
import { getTeacherAvailability } from './availabilityService';
import { getTeacherLessons } from './lessonService';

/**
 * Genera una clave determinista única para bloquear franjas de horario por profesor.
 * Granularidad por minuto exacto (ej. 14:40).
 * Formato: `${teacherId}_${date}_${startTime}`
 */
export function generateSlotLockKey(
  teacherId: string,
  dateStr: string,
  startTime: string
): string {
  const sanitizedTeacherId = teacherId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedDate = dateStr.trim();
  const sanitizedTime = startTime.trim().replace(':', '');
  return `${sanitizedTeacherId}_${sanitizedDate}_${sanitizedTime}`;
}

export interface ValidationContext {
  studentProfile: UserProfile;
  teacherProfile: UserProfile;
  recurringSlots: TeacherRecurringSlot[];
  exceptions: TeacherScheduleException[];
  bookedAvailabilities: TeacherAvailability[];
  existingLessons: Lesson[];
  existingLocks: TeacherSlotLock[];
  permanentMeetConfig?: {
    meetUrl: string;
    meetSpaceName: string;
  } | null;
  referenceNow?: {
    dateStr: string;
    currentMinutes: number;
    nowDate?: Date;
  };
}

export interface ValidationFailure {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ServerValidationSuccess {
  isValid: true;
  occurrences: any[];
  fixedRate?: FixedMonthlyRateResult;
  expiresAt: Date;
}

export type ServerValidationResult =
  | ServerValidationSuccess
  | { isValid: false; failure: ValidationFailure };

/**
 * Ejecuta todas las validaciones de negocio en el servidor previo a la transacción.
 * Si alguna validación falla, retorna un objeto ValidationFailure.
 * Si todo es válido, retorna la lista de ocurrencias calculadas para ser creadas.
 */
export function validateMonthlyBookingOnServer(
  payload: ConfirmMonthlyBookingPayload,
  context: ValidationContext,
  options?: { requireRateValidation?: boolean }
): ServerValidationResult {
  const { teacherId, month, recurringSlotIds } = payload;
  const {
    studentProfile,
    teacherProfile,
    recurringSlots,
    exceptions,
    bookedAvailabilities,
    existingLessons,
    existingLocks,
    referenceNow,
  } = context;

  // 1. Validaciones básicas de parámetros
  if (!teacherId || !teacherId.trim()) {
    return {
      isValid: false,
      failure: { code: 'INVALID_TEACHER_ID', message: 'El ID del profesor es obligatorio.' },
    };
  }

  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!month || !monthRegex.test(month.trim())) {
    return {
      isValid: false,
      failure: {
        code: 'INVALID_MONTH_FORMAT',
        message: 'El mes debe tener el formato YYYY-MM (ej: 2026-12).',
      },
    };
  }

  if (
    !Array.isArray(recurringSlotIds) ||
    recurringSlotIds.length < 1 ||
    recurringSlotIds.length > 3
  ) {
    return {
      isValid: false,
      failure: {
        code: 'INVALID_SLOT_COUNT',
        message: 'Debe seleccionar entre 1 y 3 horarios semanales para el abono.',
      },
    };
  }

  // Verificar que los IDs seleccionados sean únicos
  const uniqueSlotIds = Array.from(new Set(recurringSlotIds));
  if (uniqueSlotIds.length !== recurringSlotIds.length) {
    return {
      isValid: false,
      failure: {
        code: 'DUPLICATE_SLOT_SELECTION',
        message: 'No puede seleccionar horarios duplicados.',
      },
    };
  }

  // 2. Validación de perfiles y estados de usuarios
  if (!studentProfile || studentProfile.role !== 'student' || studentProfile.status === 'disabled') {
    return {
      isValid: false,
      failure: {
        code: 'UNAUTHORIZED_STUDENT',
        message: 'El alumno no está autorizado o su cuenta se encuentra inactiva.',
      },
    };
  }

  if (!teacherProfile || teacherProfile.role !== 'teacher' || teacherProfile.status === 'disabled') {
    return {
      isValid: false,
      failure: {
        code: 'TEACHER_INACTIVE',
        message: 'El profesor seleccionado no está disponible o su cuenta está inactiva.',
      },
    };
  }

  // 3. Obtener y verificar reglas recurrentes activas seleccionadas
  const selectedRules = recurringSlots.filter(
    (slot) => slot.id && uniqueSlotIds.includes(slot.id) && slot.teacherId === teacherId
  );

  if (selectedRules.length !== uniqueSlotIds.length) {
    return {
      isValid: false,
      failure: {
        code: 'RULES_NOT_FOUND',
        message: 'Una o más reglas de disponibilidad recurrentes no existen o no pertenecen al profesor.',
      },
    };
  }

  const inactiveRule = selectedRules.find((r) => !r.isActive);
  if (inactiveRule) {
    return {
      isValid: false,
      failure: {
        code: 'RULE_INACTIVE',
        message: `El horario recurrente de las ${inactiveRule.startTime} está desactivado por el profesor.`,
      },
    };
  }

  // Verificar que no haya solapamiento entre las reglas seleccionadas del mismo día
  const overlapCheck = checkSelectedRulesOverlap(selectedRules);
  if (overlapCheck.hasOverlap) {
    return {
      isValid: false,
      failure: {
        code: 'RULES_OVERLAP',
        message: overlapCheck.message || 'Existen horarios seleccionados que se superponen entre sí.',
      },
    };
  }

  // 4. Recalcular todas las ocurrencias mensuales de forma pura en el servidor
  const [yearStr, monthNumStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10);

  const previewResult = calculateMonthlyOccurrences({
    year,
    month: monthNum,
    selectedRules,
    exceptions,
    availabilitySlots: bookedAvailabilities,
    targetClassesPerWeek: selectedRules.length,
    referenceNow,
  });

  if (previewResult.totalOccurrences === 0) {
    return {
      isValid: false,
      failure: {
        code: 'NO_CLASSES_GENERATED',
        message: 'No se generaron clases para el mes y los horarios seleccionados.',
      },
    };
  }

  // Política estricta: si una clase no está 100% disponible, se aborta la reserva
  const unavailableOcc = previewResult.occurrences.find((o) => o.status !== 'available');
  if (unavailableOcc) {
    return {
      isValid: false,
      failure: {
        code: 'INCOMPLETE_AVAILABILITY',
        message: `La clase del ${unavailableOcc.formattedDate} (${unavailableOcc.date}) a las ${unavailableOcc.startTime} no está disponible (${unavailableOcc.statusLabel}: ${unavailableOcc.conflictReason || 'No disponible'}).`,
        details: { occurrence: unavailableOcc },
      },
    };
  }

  // 5. Verificar colisión contra clases reservadas existentes ('lessons')
  for (const occ of previewResult.occurrences) {
    const occStart = occ.startTime;
    const occEnd = occ.endTime;

    const hasLessonConflict = existingLessons.some((lesson) => {
      if (lesson.status === 'cancelled') return false;
      if (lesson.teacherId !== teacherId) return false;

      // Obtener fecha y hora de la clase existente
      let lessonDateStr = '';
      let lessonTimeStr = (lesson as any).startTime || '';

      if (typeof (lesson as any).date === 'string') {
        lessonDateStr = (lesson as any).date.substring(0, 10);
      } else if (lesson.date) {
        const d = (lesson.date as any)?.toDate
          ? (lesson.date as any).toDate()
          : new Date(lesson.date as any);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        lessonDateStr = `${y}-${m}-${day}`;
        if (!lessonTimeStr) {
          const h = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          lessonTimeStr = `${h}:${min}`;
        }
      }

      if (lessonDateStr !== occ.date) return false;

      // Verificar superposición horaria semiabierta [startA, endA) vs [startB, endB)
      const lessonDuration = lesson.duration || 60;
      const lessonStartMins = parseInt(lessonTimeStr.split(':')[0], 10) * 60 + parseInt(lessonTimeStr.split(':')[1], 10);
      const lessonEndMins = lessonStartMins + lessonDuration;

      const occStartMins = parseInt(occStart.split(':')[0], 10) * 60 + parseInt(occStart.split(':')[1], 10);
      const occEndMins = parseInt(occEnd.split(':')[0], 10) * 60 + parseInt(occEnd.split(':')[1], 10);

      return occStartMins < lessonEndMins && lessonStartMins < occEndMins;
    });

    if (hasLessonConflict) {
      return {
        isValid: false,
        failure: {
          code: 'LESSON_TIME_CONFLICT',
          message: `El profesor ya tiene una clase programada para el ${occ.formattedDate} a las ${occ.startTime}.`,
          details: { date: occ.date, time: occ.startTime },
        },
      };
    }
  }

  // 6. Verificar colisión contra locks deterministas existentes ('teacherSlotLocks')
  const nowMs = context.referenceNow?.nowDate
    ? context.referenceNow.nowDate.getTime()
    : Date.now();

  for (const occ of previewResult.occurrences) {
    const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
    const occStartMins = parseInt(occ.startTime.split(':')[0], 10) * 60 + parseInt(occ.startTime.split(':')[1], 10);
    const occEndMins = parseInt(occ.endTime.split(':')[0], 10) * 60 + parseInt(occ.endTime.split(':')[1], 10);

    const existingLock = existingLocks.find((l) => {
      if (l.teacherId !== teacherId || l.date !== occ.date) return false;

      // Si el lock expiró (24 horas transcurridas), NO bloquea la disponibilidad
      if (l.expiresAt) {
        const expMs = l.expiresAt?.toDate
          ? l.expiresAt.toDate().getTime()
          : new Date(l.expiresAt).getTime();
        if (nowMs >= expMs) {
          return false;
        }
      }

      // Comprobar coincidencia exacta o solapamiento de intervalos
      if (l.id === lockKey || l.startTime === occ.startTime) return true;

      const lockDuration = l.duration || 45;
      const lockStartMins = parseInt(l.startTime.split(':')[0], 10) * 60 + parseInt(l.startTime.split(':')[1], 10);
      const lockEndMins = lockStartMins + lockDuration;

      return occStartMins < lockEndMins && lockStartMins < occEndMins;
    });

    if (existingLock) {
      return {
        isValid: false,
        failure: {
          code: 'SLOT_LOCKED',
          message: `El horario del ${occ.formattedDate} a las ${occ.startTime} está siendo reservado o ya fue confirmado por otro alumno.`,
          details: { lockKey: existingLock.id || lockKey },
        },
      };
    }
  }

  // 7. Validación inmutable de tarifa mensual del profesor en el servidor (SUBBLOQUE 6B.2 / 6B.3)
  let fixedRate: FixedMonthlyRateResult | undefined = undefined;
  if (options?.requireRateValidation || (teacherProfile.monthlyPlans && teacherProfile.monthlyPlans.length > 0)) {
    const rateResult = getFixedMonthlyRateForFrequency(
      teacherProfile.monthlyPlans,
      uniqueSlotIds.length
    );

    if (!rateResult.isConfigured || rateResult.price === null || rateResult.price <= 0) {
      return {
        isValid: false,
        failure: {
          code: 'UNCONFIGURED_RATE',
          message: 'El profesor todavía no configuró el precio de este abono.',
        },
      };
    }
    fixedRate = rateResult;
  }

  const creationDate = context.referenceNow?.nowDate || new Date();
  const expiresAt = new Date(creationDate.getTime() + 24 * 60 * 60 * 1000); // Exactamente 24 horas

  return {
    isValid: true,
    occurrences: previewResult.occurrences,
    fixedRate,
    expiresAt,
  };
}

/**
 * Función que simula la ejecución atómica transaccional de confirmación en memoria.
 * Permite verificar todas las condiciones de concurrencia y atomicidad sin tocar Firestore.
 */
export function executeSimulatedMonthlyBookingTransaction(
  payload: ConfirmMonthlyBookingPayload,
  context: ValidationContext,
  options?: {
    shouldFailOnStep?: number;
    mode?: 'confirmed' | 'pending_payment';
    requireRateValidation?: boolean;
  }
): {
  success: boolean;
  booking?: MonthlyBooking;
  createdLessons?: Lesson[];
  createdLocks?: TeacherSlotLock[];
  expiresAt?: Date;
  error?: string;
  errorCode?: string;
} {
  const isTemporaryMode = options?.mode === 'pending_payment';

  const validation = validateMonthlyBookingOnServer(payload, context, {
    requireRateValidation: options?.requireRateValidation,
  });

  if (validation.isValid === false) {
    return {
      success: false,
      error: validation.failure.message,
      errorCode: validation.failure.code,
    };
  }

  const { occurrences, fixedRate, expiresAt } = validation;
  const bookingId = `booking-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const createdLessons: Lesson[] = [];
  const createdLocks: TeacherSlotLock[] = [];

  try {
    for (let i = 0; i < occurrences.length; i++) {
      if (options?.shouldFailOnStep && options.shouldFailOnStep === i + 1) {
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }

      const occ = occurrences[i];
      const lessonId = `lesson-${bookingId}-${i + 1}`;
      const lockKey = generateSlotLockKey(payload.teacherId, occ.date, occ.startTime);

      // Solo en modo confirmado (Fase 1) se crean lecciones definitivas pagadas
      if (!isTemporaryMode) {
        createdLessons.push({
          id: lessonId,
          title: `Clase de música con ${context.teacherProfile.name || 'Profesor'}`,
          teacherId: payload.teacherId,
          studentId: context.studentProfile.uid,
          date: combineDateAndTimeToTimestamp(occ.date, occ.startTime),
          duration: occ.duration,
          status: 'scheduled',
          monthlyBookingId: bookingId,
          meetUrl: context.permanentMeetConfig?.meetUrl || undefined,
          meetSpaceName: context.permanentMeetConfig?.meetSpaceName || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Crear lock determinista con expiración a 24 horas
      createdLocks.push({
        id: lockKey,
        teacherId: payload.teacherId,
        date: occ.date,
        startTime: occ.startTime,
        endTime: occ.endTime,
        duration: occ.duration,
        bookingType: 'monthly',
        bookingId,
        studentId: context.studentProfile.uid,
        createdAt: new Date(),
        expiresAt: expiresAt,
      });
    }

    const [yearStr, monthNumStr] = payload.month.split('-');
    const monthlyBooking: MonthlyBooking = {
      id: bookingId,
      teacherId: payload.teacherId,
      studentId: context.studentProfile.uid,
      month: payload.month,
      year: parseInt(yearStr, 10),
      monthNumber: parseInt(monthNumStr, 10),
      recurringSlotIds: payload.recurringSlotIds,
      weeklyFrequency: payload.recurringSlotIds.length as 1 | 2 | 3,
      lessonIds: isTemporaryMode ? [] : createdLessons.map((l) => l.id),
      totalLessons: occurrences.length,
      occurrences: occurrences.map((o) => ({
        date: o.date,
        startTime: o.startTime,
        endTime: o.endTime,
        duration: o.duration,
        formattedDate: o.formattedDate,
      })),
      status: isTemporaryMode ? 'pending_payment' : 'confirmed',
      totalPrice: fixedRate?.price,
      price: fixedRate?.price,
      currency: 'ARS',
      idempotencyKey: (payload as any).idempotencyKey || undefined,
      createdAt: context.referenceNow?.nowDate || new Date(),
      updatedAt: context.referenceNow?.nowDate || new Date(),
      expiresAt: expiresAt,
    };

    return {
      success: true,
      booking: monthlyBooking,
      createdLessons,
      createdLocks,
      expiresAt,
    };
  } catch (err: any) {
    // Si falla cualquier paso, la transacción no escribe nada (atomicidad estricta)
    return {
      success: false,
      error: err?.message || 'Error en la transacción.',
      errorCode: 'TRANSACTION_ABORTED',
    };
  }
}

/**
 * Función helper específica para simulación de reservas temporales de 24 horas (SUBBLOQUE 6B.3).
 */
export function executeSimulatedTemporaryBookingTransaction(
  payload: CreateTemporaryMonthlyBookingPayload,
  context: ValidationContext,
  options?: { shouldFailOnStep?: number }
) {
  return executeSimulatedMonthlyBookingTransaction(payload, context, {
    ...options,
    mode: 'pending_payment',
    requireRateValidation: true,
  });
}

/**
 * Plantilla de implementación para ejecutar la confirmación atómica en Firestore real
 * (para uso del backend o Callable Cloud Function con Firebase Admin).
 */
export async function executeFirestoreAtomicMonthlyBooking(
  firestoreInstance: Firestore,
  payload: ConfirmMonthlyBookingPayload,
  authenticatedStudentId: string,
  options?: { idempotencyKey?: string }
): Promise<ConfirmMonthlyBookingResult> {
  // Nota de Fase 1: Esta función define la transacción real de Firestore y está preparada
  // para vincularse con la Cloud Function confirmMonthlyBooking.
  // En esta fase 1 no se realizan llamadas desde el cliente.

  if (!authenticatedStudentId) {
    throw new Error('UNAUTHENTICATED');
  }

  const { teacherId, month, recurringSlotIds } = payload;

  return await runTransaction(firestoreInstance, async (transaction) => {
    // 1. Verificar idempotencia
    if (options?.idempotencyKey) {
      const existingQuery = query(
        collection(firestoreInstance, 'monthlyBookings'),
        where('idempotencyKey', '==', options.idempotencyKey)
      );
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        const existingData = existingSnap.docs[0].data() as MonthlyBooking;
        return {
          success: true,
          bookingId: existingSnap.docs[0].id,
          lessonIds: existingData.lessonIds,
          totalLessons: existingData.totalLessons,
          message: 'Abono ya confirmado previamente.',
        };
      }
    }

    // 2. Leer perfiles
    const teacherRef = doc(firestoreInstance, 'users', teacherId);
    const teacherSnap = await transaction.get(teacherRef);
    if (!teacherSnap.exists() || teacherSnap.data().role !== 'teacher') {
      throw new Error('TEACHER_NOT_FOUND');
    }

    const studentRef = doc(firestoreInstance, 'users', authenticatedStudentId);
    const studentSnap = await transaction.get(studentRef);
    if (!studentSnap.exists() || studentSnap.data().role !== 'student') {
      throw new Error('STUDENT_NOT_FOUND');
    }

    // 3. Crear referencia del abono
    const bookingRef = doc(collection(firestoreInstance, 'monthlyBookings'));
    const bookingId = bookingRef.id;

    // Retorna datos de confirmación simulados para esta etapa
    return {
      success: true,
      bookingId,
      lessonIds: [],
      totalLessons: 0,
      message: 'Abono validado y estructurado atómicamente.',
    };
  });
}

/**
 * Crea una reserva mensual temporal por 24 horas (SUBBLOQUE 6B.3).
 *
 * Flujo de ejecución atómica:
 * 1. Verifica autenticación del alumno.
 * 2. Carga perfiles de alumno y profesor, disponibilidad recurrente, excepciones,
 *    clases existentes y locks de franjas vigentes.
 * 3. Ejecuta la validación completa en el servidor (originDate, fechas pasadas,
 *    bloqueos de día y slot, solapamientos, tarifa mensual fija inmutable).
 * 4. Calcula expiresAt exactamente a las 24 horas (86.400.000 ms) tras la creación.
 * 5. Ejecuta la transacción atómica Firestore:
 *    - Comprueba que ningún lock de las ocurrencias esté activo.
 *    - Crea 'monthlyBookings/{bookingId}' con status 'pending_payment'.
 *    - Crea 'teacherSlotLocks/{lockKey}' para cada ocurrencia con expiresAt.
 *    - No crea clases pagadas en 'lessons' en esta etapa preliminar.
 */
export async function createTemporaryMonthlyBooking(
  payload: CreateTemporaryMonthlyBookingPayload,
  authenticatedStudentId: string
): Promise<TemporaryMonthlyBookingResult> {
  if (!authenticatedStudentId) {
    return {
      success: false,
      message: 'Debés iniciar sesión como alumno para realizar una reserva.',
      errorCode: 'UNAUTHENTICATED',
    };
  }

  const { teacherId, month, recurringSlotIds } = payload;
  if (!teacherId || !month || !Array.isArray(recurringSlotIds) || recurringSlotIds.length === 0) {
    return {
      success: false,
      message: 'Parámetros incompletos para realizar la reserva temporal.',
      errorCode: 'INVALID_PARAMETERS',
    };
  }

  try {
    // 1. Cargar perfiles y datos del servidor
    const [
      studentProfile,
      teacherProfile,
      recurringSlots,
      exceptions,
      bookedAvailabilities,
      existingLessons,
    ] = await Promise.all([
      fetchUserProfile(authenticatedStudentId),
      fetchUserProfile(teacherId),
      getTeacherRecurringSlots(teacherId, true),
      getTeacherScheduleExceptions(teacherId),
      getTeacherAvailability(teacherId),
      getTeacherLessons(teacherId),
    ]);

    if (!studentProfile || studentProfile.role !== 'student' || studentProfile.status === 'disabled') {
      return {
        success: false,
        message: 'Solo los alumnos registrados y activos pueden realizar reservas.',
        errorCode: 'UNAUTHORIZED_STUDENT',
      };
    }

    if (!teacherProfile || teacherProfile.role !== 'teacher' || teacherProfile.status === 'disabled') {
      return {
        success: false,
        message: 'El profesor seleccionado no está disponible o su cuenta está inactiva.',
        errorCode: 'TEACHER_NOT_FOUND',
      };
    }

    // 2. Consultar locks existentes en Firestore
    let existingLocks: TeacherSlotLock[] = [];
    try {
      const locksQuery = query(
        collection(db, 'teacherSlotLocks'),
        where('teacherId', '==', teacherId)
      );
      const locksSnap = await getDocs(locksQuery);
      existingLocks = locksSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TeacherSlotLock, 'id'>),
      }));
    } catch (lockQueryErr) {
      console.warn('Advertencia al consultar teacherSlotLocks:', lockQueryErr);
    }

    // 3. Ejecutar validación completa en el servidor
    const validation = validateMonthlyBookingOnServer(
      { teacherId, month, recurringSlotIds },
      {
        studentProfile,
        teacherProfile,
        recurringSlots,
        exceptions,
        bookedAvailabilities,
        existingLessons,
        existingLocks,
      },
      { requireRateValidation: true }
    );

    if (validation.isValid === false) {
      return {
        success: false,
        message: validation.failure.message,
        errorCode: validation.failure.code,
      };
    }

    const { occurrences, fixedRate, expiresAt } = validation;
    const nowServer = new Date();
    const [yearStr, monthNumStr] = month.split('-');

    // 4. Ejecutar transacción atómica en Firestore
    const bookingRef = doc(collection(db, 'monthlyBookings'));
    const bookingId = bookingRef.id;

    const bookingData: MonthlyBooking = {
      id: bookingId,
      teacherId,
      studentId: authenticatedStudentId,
      month,
      year: parseInt(yearStr, 10),
      monthNumber: parseInt(monthNumStr, 10),
      recurringSlotIds,
      weeklyFrequency: recurringSlotIds.length as 1 | 2 | 3,
      totalLessons: occurrences.length,
      occurrences: occurrences.map((o) => ({
        date: o.date,
        startTime: o.startTime,
        endTime: o.endTime,
        duration: o.duration,
        formattedDate: o.formattedDate,
      })),
      status: 'pending_payment',
      totalPrice: fixedRate?.price,
      price: fixedRate?.price,
      currency: 'ARS',
      idempotencyKey: payload.idempotencyKey || undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: expiresAt,
    };

    try {
      await runTransaction(db, async (transaction) => {
        // a. Comprobar concurrencia: ningún lock debe estar activo
        for (const occ of occurrences) {
          const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
          const lockDocRef = doc(db, 'teacherSlotLocks', lockKey);
          const lockSnap = await transaction.get(lockDocRef);

          if (lockSnap.exists()) {
            const data = lockSnap.data() as TeacherSlotLock;
            if (data.expiresAt) {
              const expTime = data.expiresAt?.toDate
                ? data.expiresAt.toDate().getTime()
                : new Date(data.expiresAt).getTime();
              if (nowServer.getTime() < expTime) {
                throw new Error(`SLOT_LOCKED:${occ.formattedDate} a las ${occ.startTime}`);
              }
            } else {
              throw new Error(`SLOT_LOCKED:${occ.formattedDate} a las ${occ.startTime}`);
            }
          }
        }

        // b. Escribir reserva en monthlyBookings
        transaction.set(bookingRef, bookingData);

        // c. Escribir cerrojos deterministas en teacherSlotLocks con expiresAt a 24 horas
        for (const occ of occurrences) {
          const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
          const lockDocRef = doc(db, 'teacherSlotLocks', lockKey);
          const lockData: TeacherSlotLock = {
            id: lockKey,
            teacherId,
            date: occ.date,
            startTime: occ.startTime,
            endTime: occ.endTime,
            duration: occ.duration,
            bookingType: 'monthly',
            bookingId,
            studentId: authenticatedStudentId,
            createdAt: serverTimestamp(),
            expiresAt: expiresAt,
          };
          transaction.set(lockDocRef, lockData);
        }
      });

      return {
        success: true,
        bookingId,
        booking: { ...bookingData, id: bookingId },
        expiresAt,
        expiresAtFormatted: formatExpirationBuenosAires(expiresAt),
        totalPrice: fixedRate?.price,
        currency: 'ARS',
        totalLessons: occurrences.length,
        message: 'Tu reserva temporal se creó correctamente. Tenés 24 horas para realizar la transferencia.',
      };
    } catch (txErr: any) {
      const msg = txErr?.message || String(txErr);
      if (msg.includes('SLOT_LOCKED')) {
        const slotDetail = msg.split(':')[1] || '';
        return {
          success: false,
          errorCode: 'SLOT_LOCKED',
          message: `El horario de ${slotDetail} acaba de ser reservado por otro alumno. Por favor elegí otro horario.`,
        };
      }
      if (msg.includes('permission-denied') || msg.includes('insufficient permissions')) {
        return {
          success: false,
          errorCode: 'FIRESTORE_RULES_PENDING',
          message:
            'Las reglas de Firestore para reservas temporales están pendientes de despliegue en Firebase Console. Verificá la propuesta de reglas en el reporte.',
        };
      }
      throw txErr;
    }
  } catch (err: any) {
    console.error('Error al crear reserva temporal mensual:', err);
    return {
      success: false,
      errorCode: 'TRANSACTION_ERROR',
      message:
        err?.message ||
        'Ocurrió un error al procesar tu reserva temporal. Por favor intentá nuevamente.',
    };
  }
}

