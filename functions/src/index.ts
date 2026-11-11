/**
 * Cloud Functions v2 - MusicKids Backend
 * Subbloque 6B.3.1: Infraestructura y verificación
 * Subbloque 6B.3.3: Creación atómica de reservas mensuales
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type {
  CreateMonthlyBookingPayload,
  CreateMonthlyBookingResponse,
  CreateManualLessonPayload,
  CreateManualLessonResponse,
  ConfirmMonthlyBookingPaymentPayload,
  ConfirmMonthlyBookingPaymentResponse,
  GetTeacherPublicAvailabilityPayload,
  GetTeacherPublicAvailabilityResponse,
  ExpireMonthlyBookingsPayload,
  ExpireMonthlyBookingsResponse,
} from './types';
import {
  createMonthlyBookingTransaction,
  confirmMonthlyBookingPaymentTransaction,
  getTeacherPublicAvailabilityHelper,
  expireMonthlyBookingsBatch,
} from './monthlyBookingService';
import { createManualLessonTransaction } from './manualLessonService';

// Inicializar Firebase Admin SDK si no fue inicializado previamente
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

/**
 * Función Callable mínima de prueba para verificar conectividad y autenticación
 * en Firebase Cloud Functions v2 sin efectos secundarios ni acceso a datos sensibles.
 */
export const healthCheckMusicKids = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    // 1. Verificación estricta de autenticación del llamador
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debe estar autenticado en MusicKids para acceder a este servicio.'
      );
    }

    // 2. Respuesta segura sin datos bancarios ni operaciones de base de datos
    return {
      status: 'ok',
      service: 'MusicKids Cloud Functions v2',
      timestamp: new Date().toISOString(),
      authenticated: true,
      uid: request.auth.uid,
      message: 'Servicio operativo y listo para futuras transacciones de abonos mensuales.',
    };
  }
);

/**
 * Cloud Function v2: Creación atómica de reservas mensuales (SUBBLOQUE 6B.3.3)
 *
 * Características de seguridad y consistencia:
 * - Autenticación verificada en servidor (request.auth.uid).
 * - Protección contra suplantación (data.studentId !== request.auth.uid).
 * - Validación inmutable de tarifas y horarios en el servidor.
 * - Validación estricta "todo o nada" sobre todas las ocurrencias del mes.
 * - Concurrencia serializada mediante teacherDailySchedule y teacherSlotLocks.
 * - Creación simultánea del abono y de las lecciones vinculadas.
 * - Estado inicial: 'pending_payment_confirmation'.
 */
export const createMonthlyBooking = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request): Promise<CreateMonthlyBookingResponse> => {
    // 1. Verificación obligatoria de autenticación
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debe iniciar sesión como alumno para solicitar una reserva mensual.'
      );
    }

    const authenticatedStudentId = request.auth.uid;
    const data = request.data as CreateMonthlyBookingPayload;

    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Los datos de la reserva son requeridos.');
    }

    // 2. Comprobación de identidad: Un alumno no puede reservar a nombre de otro
    if (data.studentId && data.studentId.trim() !== authenticatedStudentId) {
      throw new HttpsError(
        'permission-denied',
        'No tiene autorización para crear reservas en nombre de otro usuario.'
      );
    }

    // 3. Ejecutar transacción atómica en Firestore con Admin SDK
    return await createMonthlyBookingTransaction(db, authenticatedStudentId, data);
  }
);

/**
 * Cloud Function v2: Creación transaccional de clases individuales manuales por el profesor
 * SUBBLOQUE 6B.3.3.4.A: Unificación de reservas manuales y mensuales
 *
 * Características de seguridad y consistencia:
 * - Autenticación verificada en servidor (request.auth.uid).
 * - Verificación de rol docente activo (role === 'teacher' && status !== 'disabled').
 * - Utilización obligatoria de request.auth.uid como teacherId (imposible suplantar).
 * - Verificación de alumno existente y activo (role === 'student' && status !== 'disabled').
 * - Validación estricta de fecha, hora y duración (45 minutos para clases nuevas).
 * - Control de excepciones de calendario del profesor (asueto, vacaciones, bloqueos).
 * - Detección transaccional de colisiones contra el coordinador 'teacherDailySchedule'.
 * - Serialización atómica con reservas mensuales y otras clases manuales.
 * - Soporte de idempotencia (idempotencyKey).
 */
export const createManualLesson = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request): Promise<CreateManualLessonResponse> => {
    // 1. Verificación obligatoria de autenticación
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debe iniciar sesión como profesor para crear una clase.'
      );
    }

    const authenticatedTeacherId = request.auth.uid;
    const data = request.data as CreateManualLessonPayload;

    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Los datos de la clase son requeridos.');
    }

    // 2. Ejecutar transacción atómica en Firestore con Admin SDK
    return await createManualLessonTransaction(db, authenticatedTeacherId, data);
  }
);

/**
 * Cloud Function v2: Confirmación de pago de abono mensual por el profesor (SUBBLOQUE 6B.5)
 *
 * Características:
 * - Autenticación estricta: solo el profesor titular puede confirmar el pago.
 * - Validación de plazo de 24 horas: rechaza abonos expirados.
 * - Transición atómica de estados a 'confirmed'.
 * - Vincula Google Meet oficial de forma permanente para el alumno.
 */
export const confirmMonthlyBookingPayment = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request): Promise<ConfirmMonthlyBookingPaymentResponse> => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debe iniciar sesión como profesor para confirmar pagos de abonos.'
      );
    }

    const authenticatedTeacherId = request.auth.uid;
    const data = request.data as ConfirmMonthlyBookingPaymentPayload;

    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Los datos de la confirmación son requeridos.');
    }

    try {
      return await confirmMonthlyBookingPaymentTransaction(db, authenticatedTeacherId, data);
    } catch (err: any) {
      if (err instanceof HttpsError) {
        throw err;
      }
      console.error('Error al procesar confirmMonthlyBookingPayment:', err);
      throw new HttpsError('internal', err?.message || 'Error interno al confirmar el abono.');
    }
  }
);

/**
 * Cloud Function v2: Consulta pública sanitizada de disponibilidad (SUBBLOQUE 6B.5)
 *
 * Características:
 * - Devuelve franjas ocupadas y fechas bloqueadas para el calendario de selección del alumno.
 * - Cero datos privados expuestos (NO expone studentId, bookingId ni nombres).
 * - Excluye automáticamente reservas de 24 horas que ya hayan expirado.
 * - Resuelve el warning de permisos de teacherSlotLocks.
 */
export const getTeacherPublicAvailability = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request): Promise<GetTeacherPublicAvailabilityResponse> => {
    const data = request.data as GetTeacherPublicAvailabilityPayload;

    if (!data || !data.teacherId || !data.month) {
      throw new HttpsError(
        'invalid-argument',
        'El identificador del profesor y el mes (YYYY-MM) son obligatorios.'
      );
    }

    return await getTeacherPublicAvailabilityHelper(db, data.teacherId, data.month);
  }
);

/**
 * Cloud Function v2 Programada (Scheduler): Expiración automática de abonos mensuales
 * Ejecución cada 5 minutos en zona horaria America/Argentina/Buenos_Aires.
 *
 * Características:
 * - Detecta abonos en 'pending_payment_confirmation' o 'pending_payment' con expiresAt <= now.
 * - Idempotente: libera los horarios y pasa el abono y sus lecciones a 'expired'.
 * - No afecta abonos confirmados ni reservas canceladas.
 * - Concurrencia segura: serialización atómica en Firestore.
 */
export const expirePendingMonthlyBookingsScheduled = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'us-central1',
  },
  async () => {
    try {
      const result = await expireMonthlyBookingsBatch(db);
      if (result.expiredCount > 0) {
        console.log(`[Scheduler] Expiración automática: ${result.expiredCount} abono(s) expirado(s).`);
      }
    } catch (err) {
      console.error('[Scheduler] Error en expiración automática de abonos:', err);
    }
  }
);

/**
 * Cloud Function v2 Callable: Expiración manual/bajo demanda de abonos mensuales
 * Permite ejecutar la expiración inmediata de un abono vencido específico o de todos los pendientes.
 */
export const expirePendingMonthlyBookingsCallable = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request): Promise<ExpireMonthlyBookingsResponse> => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debe estar autenticado en MusicKids para ejecutar este servicio.'
      );
    }

    const data = (request.data || {}) as ExpireMonthlyBookingsPayload;
    try {
      return await expireMonthlyBookingsBatch(db, data.bookingId);
    } catch (err: any) {
      console.error('Error al ejecutar expirePendingMonthlyBookingsCallable:', err);
      throw new HttpsError('internal', err?.message || 'Error al procesar la expiración del abono.');
    }
  }
);

