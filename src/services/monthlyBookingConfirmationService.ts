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
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './firebase';
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
  authenticatedStudentId: string,
  options?: { skipClientAuthCheck?: boolean }
): Promise<TemporaryMonthlyBookingResult> {
  const currentUser = auth.currentUser;
  if (!options?.skipClientAuthCheck && (!currentUser || !authenticatedStudentId)) {
    return {
      success: false,
      message: 'Debés iniciar sesión como alumno para realizar una reserva.',
      errorCode: 'UNAUTHENTICATED',
    };
  }

  const { teacherId, month, recurringSlotIds, weeklyFrequency, idempotencyKey } = payload;
  const safeMonth = (month || (payload as any).monthKey || '').trim();

  if (!teacherId || !teacherId.trim()) {
    return {
      success: false,
      message: 'Falta identificar al profesor para realizar la reserva.',
      errorCode: 'INVALID_PARAMETERS',
    };
  }

  if (!safeMonth) {
    return {
      success: false,
      message: 'No se seleccionó un mes válido para realizar la reserva temporal.',
      errorCode: 'INVALID_PARAMETERS',
    };
  }

  if (!Array.isArray(recurringSlotIds) || recurringSlotIds.length === 0) {
    return {
      success: false,
      message: 'Debe seleccionar al menos un horario semanal para el abono.',
      errorCode: 'INVALID_PARAMETERS',
    };
  }

  const stableIdempotencyKey =
    idempotencyKey || `mb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const freq = (weeklyFrequency || recurringSlotIds.length) as 1 | 2 | 3;

  try {
    const createBookingFn = httpsCallable<
      {
        teacherId: string;
        month: string;
        recurringSlotIds: string[];
        weeklyFrequency: 1 | 2 | 3;
        idempotencyKey?: string;
      },
      {
        success: boolean;
        bookingId: string;
        status: string;
        totalPrice: number;
        currency: 'ARS';
        totalLessons: number;
        occurrences: any[];
        lessonIds: string[];
        expiresAt: string;
        bankDetails?: {
          alias: string;
          cbuCvu: string;
          accountHolder: string;
          bankName?: string;
        } | null;
        message: string;
      }
    >(functions, 'createMonthlyBooking');

    const response = await createBookingFn({
      teacherId: teacherId.trim(),
      month: safeMonth,
      recurringSlotIds,
      weeklyFrequency: freq,
      idempotencyKey: stableIdempotencyKey,
    });

    const data = response.data;
    const expiresAtDate = new Date(data.expiresAt);

    return {
      success: true,
      bookingId: data.bookingId,
      expiresAt: expiresAtDate,
      expiresAtFormatted: formatExpirationBuenosAires(expiresAtDate),
      totalPrice: data.totalPrice,
      currency: 'ARS',
      totalLessons: data.totalLessons,
      bankDetails: data.bankDetails || null,
      message:
        data.message ||
        'Tu reserva temporal se creó correctamente. Tenés 24 horas para realizar la transferencia.',
    };
  } catch (err: any) {
    console.error('Error al invocar createMonthlyBooking:', err);
    const code = (err?.code || '').replace('functions/', '').toLowerCase();
    const rawMsg = (err?.message || '').toString();

    let friendlyMessage = 'Ocurrió un error al procesar tu reserva temporal. Por favor intentá nuevamente.';
    let errorCode = 'TRANSACTION_ERROR';

    if (code === 'already-exists') {
      errorCode = 'SLOT_LOCKED';
      friendlyMessage =
        'Uno o más de los horarios seleccionados ya se encuentran ocupados o reservados por otro alumno. Por favor elegí otro horario.';
    } else if (code === 'unauthenticated') {
      errorCode = 'UNAUTHENTICATED';
      friendlyMessage = 'Debés iniciar sesión en MusicKids para realizar una reserva.';
    } else if (code === 'permission-denied') {
      errorCode = 'PERMISSION_DENIED';
      friendlyMessage = 'Solo alumnos registrados pueden realizar reservas mensuales.';
    } else if (code === 'failed-precondition') {
      errorCode = 'FAILED_PRECONDITION';
      if (rawMsg.includes('tarifa')) {
        friendlyMessage = 'El profesor aún no tiene configurada la tarifa fija para esta frecuencia semanal.';
      } else if (rawMsg.includes('bloqueada') || rawMsg.includes('bloqueado')) {
        friendlyMessage = 'Una de las fechas u horarios seleccionados se encuentra bloqueada en el calendario del profesor.';
      } else if (rawMsg.includes('transcurrido') || rawMsg.includes('comenzado')) {
        friendlyMessage = 'No se pueden reservar clases en fechas u horarios que ya han comenzado o transcurrido.';
      } else {
        friendlyMessage = rawMsg && !rawMsg.includes('INTERNAL') ? rawMsg : 'No se cumplen las condiciones para realizar la reserva.';
      }
    } else if (code === 'unavailable') {
      errorCode = 'UNAVAILABLE';
      friendlyMessage = 'No se pudo conectar con el servidor de MusicKids. Verificá tu conexión a internet e intentá nuevamente.';
    } else if (rawMsg && !rawMsg.includes('INTERNAL') && !rawMsg.includes('FirebaseError')) {
      friendlyMessage = rawMsg;
    }

    return {
      success: false,
      errorCode,
      message: friendlyMessage,
    };
  }
}

/**
 * Consulta la disponibilidad pública y sanitizada del profesor para un mes específico
 * Devuelve únicamente franjas ocupadas y fechas bloqueadas (sin datos privados).
 */
export async function getTeacherPublicAvailability(
  teacherId: string,
  month: string
): Promise<{
  occupiedIntervals: Array<{ date: string; startTime: string; endTime: string }>;
  blockedDates: string[];
}> {
  try {
    const getAvailabilityFn = httpsCallable<
      { teacherId: string; month: string },
      {
        teacherId: string;
        month: string;
        occupiedIntervals: Array<{ date: string; startTime: string; endTime: string }>;
        blockedDates: string[];
      }
    >(functions, 'getTeacherPublicAvailability');

    const result = await getAvailabilityFn({ teacherId, month });
    return {
      occupiedIntervals: result.data.occupiedIntervals || [],
      blockedDates: result.data.blockedDates || [],
    };
  } catch (err) {
    console.warn('Error al consultar disponibilidad pública sanitizada:', err);
    return { occupiedIntervals: [], blockedDates: [] };
  }
}

/**
 * Permite al profesor confirmar la recepción del pago de un abono mensual
 */
export async function confirmMonthlyBookingPayment(
  bookingId: string
): Promise<{ success: boolean; message: string }> {
  const confirmPaymentFn = httpsCallable<
    { bookingId: string },
    { success: boolean; bookingId: string; message: string }
  >(functions, 'confirmMonthlyBookingPayment');

  const result = await confirmPaymentFn({ bookingId });
  return result.data;
}

/**
 * Reconstruye abonos mensuales a partir de las clases del profesor.
 * Permite mantener la visibilidad en entornos donde las reglas de 'monthlyBookings'
 * aún no han sido desplegadas en Firebase.
 */
export function reconstructMonthlyBookingsFromLessons(
  teacherId: string,
  lessons: Lesson[]
): MonthlyBooking[] {
  if (!Array.isArray(lessons) || lessons.length === 0) return [];

  const bookingMap = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const bookingId = (lesson as any).monthlyBookingId;
    if (bookingId && typeof bookingId === 'string') {
      if (!bookingMap.has(bookingId)) {
        bookingMap.set(bookingId, []);
      }
      bookingMap.get(bookingId)!.push(lesson);
    }
  }

  const result: MonthlyBooking[] = [];
  for (const [bookingId, groupLessons] of bookingMap.entries()) {
    const first = groupLessons[0];
    const isPending = groupLessons.some(
      (l) => (l as any).paymentStatus === 'pending_confirmation'
    );

    // Derivar mes del primer horario
    let monthStr = '';
    if (typeof (first as any).date === 'string') {
      monthStr = (first as any).date.substring(0, 7);
    } else if (first.date) {
      const d = (first.date as any)?.toDate
        ? (first.date as any).toDate()
        : new Date(first.date as any);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        monthStr = `${y}-${m}`;
      }
    }

    // Mapear ocurrencias
    const occurrences = groupLessons.map((l) => {
      let dateStr = '';
      let startTime = (l as any).startTime || '';
      if (typeof (l as any).date === 'string') {
        dateStr = (l as any).date.substring(0, 10);
      } else if (l.date) {
        const d = (l.date as any)?.toDate
          ? (l.date as any).toDate()
          : new Date(l.date as any);
        if (!isNaN(d.getTime())) {
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
          ).padStart(2, '0')}`;
          if (!startTime) {
            startTime = `${String(d.getHours()).padStart(2, '0')}:${String(
              d.getMinutes()
            ).padStart(2, '0')}`;
          }
        }
      }
      return {
        date: dateStr,
        startTime: startTime || '14:00',
        endTime: '',
        duration: l.duration || 45,
      };
    });

    const weeklyFreq = Math.min(
      3,
      Math.max(1, Math.round(groupLessons.length / 4))
    ) as 1 | 2 | 3;

    result.push({
      id: bookingId,
      teacherId,
      studentId: first.studentId || '',
      studentName: (first as any).studentName || 'Alumno',
      studentEmail: (first as any).studentEmail || '',
      month: monthStr,
      recurringSlotIds: (first as any).recurringSlotIds || [],
      weeklyFrequency: weeklyFreq,
      totalLessons: groupLessons.length,
      lessonIds: groupLessons.map((l) => l.id),
      occurrences,
      status: isPending ? 'pending_payment_confirmation' : 'confirmed',
      totalPrice: (first as any).totalPrice || (first as any).price || 0,
      price: (first as any).price || 0,
      currency: 'ARS',
      createdAt: (first as any).createdAt || first.date || new Date(),
      updatedAt: (first as any).updatedAt || new Date(),
      expiresAt: (first as any).expiresAt || null,
    });
  }

  return result.sort((a, b) => {
    const aTime = a.createdAt?.toDate
      ? a.createdAt.toDate().getTime()
      : a.createdAt
      ? new Date(a.createdAt).getTime()
      : 0;
    const bTime = b.createdAt?.toDate
      ? b.createdAt.toDate().getTime()
      : b.createdAt
      ? new Date(b.createdAt).getTime()
      : 0;
    return bTime - aTime;
  });
}

/**
 * Consulta los abonos mensuales del profesor autenticado.
 * 1. Intenta consulta directa a Firestore 'monthlyBookings' con filtro teacherId.
 * 2. Si las reglas aún no fueron desplegadas o devuelven Missing/insufficient permissions,
 *    recupera los abonos de forma segura a través de las clases en 'lessons' del profesor.
 */
export async function getTeacherMonthlyBookings(
  teacherId: string,
  preloadedLessons?: Lesson[]
): Promise<MonthlyBooking[]> {
  if (!teacherId) return [];

  // 1. Intentar consulta directa a Firestore 'monthlyBookings'
  try {
    const q = query(
      collection(db, 'monthlyBookings'),
      where('teacherId', '==', teacherId)
    );
    const snap = await getDocs(q);
    const bookings: MonthlyBooking[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    return bookings.sort((a, b) => {
      const aTime = a.createdAt?.toDate
        ? a.createdAt.toDate().getTime()
        : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;
      const bTime = b.createdAt?.toDate
        ? b.createdAt.toDate().getTime()
        : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;
      return bTime - aTime;
    });
  } catch (err: any) {
    const errStr = String(err?.message || err);
    if (
      errStr.includes('permission-denied') ||
      errStr.includes('insufficient permissions') ||
      errStr.includes('Missing or insufficient')
    ) {
      console.warn(
        'Reglas de lectura directa en monthlyBookings aún no disponibles en Firestore; recuperando abonos desde las clases del profesor.'
      );
    } else {
      console.warn('Advertencia al consultar monthlyBookings:', err);
    }

    // 2. Recuperación/fallback seguro mediante clases de 'lessons'
    if (preloadedLessons && preloadedLessons.length > 0) {
      return reconstructMonthlyBookingsFromLessons(teacherId, preloadedLessons);
    }

    try {
      const lessons = await getTeacherLessons(teacherId);
      return reconstructMonthlyBookingsFromLessons(teacherId, lessons);
    } catch {
      return [];
    }
  }
}


