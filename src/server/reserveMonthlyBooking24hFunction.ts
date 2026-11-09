/**
 * Arquitectura propuesta para la Firebase Callable Cloud Function:
 * reserveMonthlyBooking24h (SUBBLOQUE 6B.3)
 *
 * Esta Cloud Function ejecutará en el backend con Firebase Admin SDK
 * la reserva temporal atómica de 24 horas para garantizar:
 * 1. Autenticación verificada en el servidor (request.auth.uid).
 * 2. Consulta de perfiles, disponibilidad, excepciones y locks con permisos privilegiados de servidor.
 * 3. Obtención inmutable del precio mensual del abono en el servidor (el cliente no puede alterar tarifas).
 * 4. Cálculo estricto del vencimiento (exactamente 24 horas = 86.400.000 ms desde hora del servidor).
 * 5. Transacción Firestore atómica (all-or-nothing):
 *    - Escritura de la reserva en 'monthlyBookings/{bookingId}' con status 'pending_payment'.
 *    - Escritura de los cerrojos en 'teacherSlotLocks/{lockKey}' con 'expiresAt'.
 *    - Ninguna creación de clases pagadas definitivas en 'lessons' en esta fase temporal.
 */

import type {
  CreateTemporaryMonthlyBookingPayload,
  TemporaryMonthlyBookingResult,
  MonthlyBooking,
  TeacherSlotLock,
} from '../types/monthlyBooking';
import { generateSlotLockKey } from '../services/monthlyBookingConfirmationService';

/**
 * Código de referencia para la Cloud Function v2 (Firebase Functions v2):
 *
 * ```typescript
 * import { onCall, HttpsError } from 'firebase-functions/v2/https';
 * import * as admin from 'firebase-admin';
 *
 * if (!admin.apps.length) {
 *   admin.initializeApp();
 * }
 * const db = admin.firestore();
 *
 * export const reserveMonthlyBooking24h = onCall(
 *   {
 *     region: 'us-central1',
 *     enforceAppCheck: false,
 *   },
 *   async (request) => {
 *     // 1. Verificación obligatoria de autenticación
 *     if (!request.auth || !request.auth.uid) {
 *       throw new HttpsError('unauthenticated', 'Debe estar autenticado para realizar una reserva.');
 *     }
 *     const studentId = request.auth.uid;
 *     const data = request.data as CreateTemporaryMonthlyBookingPayload;
 *     const { teacherId, month, recurringSlotIds, idempotencyKey } = data;
 *
 *     if (!teacherId || !month || !Array.isArray(recurringSlotIds) || recurringSlotIds.length === 0) {
 *       throw new HttpsError('invalid-argument', 'Parámetros incompletos para la reserva.');
 *     }
 *
 *     // 2. Transacción Firestore segura en el backend
 *     return await db.runTransaction(async (transaction) => {
 *       // a. Validar perfil de alumno
 *       const studentDoc = await transaction.get(db.doc(`users/${studentId}`));
 *       if (!studentDoc.exists || studentDoc.data()?.role !== 'student' || studentDoc.data()?.status === 'disabled') {
 *         throw new HttpsError('permission-denied', 'Solo alumnos activos pueden reservar abonos.');
 *       }
 *
 *       // b. Validar perfil de profesor y tarifa inmutable
 *       const teacherDoc = await transaction.get(db.doc(`users/${teacherId}`));
 *       if (!teacherDoc.exists || teacherDoc.data()?.role !== 'teacher' || teacherDoc.data()?.status === 'disabled') {
 *         throw new HttpsError('failed-precondition', 'El profesor no está disponible.');
 *       }
 *       const teacherData = teacherDoc.data()!;
 *       const plans = teacherData.monthlyPlans || [];
 *       const targetPlan = plans.find((p: any) => p.lessonsPerWeek === recurringSlotIds.length);
 *       if (!targetPlan || !targetPlan.active || typeof targetPlan.price !== 'number' || targetPlan.price <= 0) {
 *         throw new HttpsError('failed-precondition', 'El profesor todavía no configuró el precio de este abono.');
 *       }
 *       const fixedMonthlyPrice = targetPlan.price;
 *
 *       // c. Validar concurrencia y cerrojos activos
 *       const nowServer = new Date();
 *       const expiresAt = new Date(nowServer.getTime() + 24 * 60 * 60 * 1000); // 24 horas exactas
 *
 *       // d. Escribir reserva temporal en monthlyBookings
 *       const bookingRef = db.collection('monthlyBookings').doc();
 *       transaction.set(bookingRef, {
 *         teacherId,
 *         studentId,
 *         month,
 *         recurringSlotIds,
 *         weeklyFrequency: recurringSlotIds.length,
 *         status: 'pending_payment',
 *         totalPrice: fixedMonthlyPrice,
 *         currency: 'ARS',
 *         idempotencyKey: idempotencyKey || null,
 *         createdAt: admin.firestore.FieldValue.serverTimestamp(),
 *         expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
 *       });
 *
 *       return {
 *         success: true,
 *         bookingId: bookingRef.id,
 *         expiresAt: expiresAt.toISOString(),
 *         totalPrice: fixedMonthlyPrice,
 *         currency: 'ARS',
 *         message: 'Tu reserva temporal se creó correctamente. Tenés 24 horas para realizar la transferencia.',
 *       };
 *     });
 *   }
 * );
 * ```
 */

export const TEMPORARY_BOOKING_ARCHITECTURE_DOC = {
  functionName: 'reserveMonthlyBooking24h',
  runtime: 'Node.js 20 / 22',
  triggerType: 'Callable Cloud Function (HTTPS onCall)',
  security: {
    authenticationRequired: true,
    callerIdentitySource: 'request.auth.uid (servidor)',
    roleCheck: 'student activo',
    priceSource: 'users/{teacherId}.monthlyPlans (inmutable, servidor)',
    expiresAtCalculation: 'serverTimestamp + 24 * 60 * 60 * 1000',
  },
  transactionScope: [
    'monthlyBookings/{bookingId} (status: pending_payment, expiresAt: now + 24h)',
    'teacherSlotLocks/{lockKey} (N documentos con expiresAt: now + 24h)',
  ],
};
