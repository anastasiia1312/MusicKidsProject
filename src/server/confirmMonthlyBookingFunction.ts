/**
 * Arquitectura propuesta para la Firebase Callable Cloud Function:
 * confirmMonthlyBooking (SUBBLOQUE 6B)
 *
 * Esta plantilla define la Cloud Function que se desplegará en el entorno de backend
 * (Firebase Cloud Functions v2) una vez configurada la infraestructura correspondiente.
 *
 * Características clave de seguridad:
 * 1. Autenticación obligatoria mediante Firebase Auth context (request.auth.uid).
 * 2. Validación de roles en el servidor: solo alumnos activos pueden reservar.
 * 3. Lectura protegida de la sala permanente de Google Meet con Firebase Admin SDK
 *    desde 'users/{teacherId}/privateSettings/meetConfig' sin exponerla al cliente.
 * 4. Ejecución de la transacción atómica Firestore con cerrojos deterministas (TeacherSlotLock).
 * 5. Rechazo inmediato ante cualquier conflicto, fecha bloqueada o solapamiento.
 */

import type {
  ConfirmMonthlyBookingPayload,
  ConfirmMonthlyBookingResult,
  MonthlyBooking,
  TeacherSlotLock,
} from '../types/monthlyBooking';
import { generateSlotLockKey } from '../services/monthlyBookingConfirmationService';

/**
 * Código de referencia para la Cloud Function v2:
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
 * export const confirmMonthlyBooking = onCall(
 *   {
 *     region: 'us-central1',
 *     enforceAppCheck: false, // Ajustable según políticas de App Check
 *   },
 *   async (request) => {
 *     // 1. Verificación de autenticación
 *     if (!request.auth || !request.auth.uid) {
 *       throw new HttpsError('unauthenticated', 'Debe estar autenticado para reservar un abono.');
 *     }
 *     const studentId = request.auth.uid;
 *
 *     // 2. Validación de entrada
 *     const data = request.data as ConfirmMonthlyBookingPayload;
 *     const { teacherId, month, recurringSlotIds } = data;
 *
 *     if (!teacherId || !month || !Array.isArray(recurringSlotIds) || recurringSlotIds.length === 0) {
 *       throw new HttpsError('invalid-argument', 'Parámetros incompletos para confirmar el abono.');
 *     }
 *
 *     if (recurringSlotIds.length > 3) {
 *       throw new HttpsError('invalid-argument', 'Máximo 3 horarios semanales por abono.');
 *     }
 *
 *     // 3. Ejecutar transacción atómica en Firestore con Admin SDK
 *     try {
 *       const result = await db.runTransaction(async (transaction) => {
 *         // a. Verificar perfil de alumno
 *         const studentSnap = await transaction.get(db.doc(`users/${studentId}`));
 *         if (!studentSnap.exists || studentSnap.data()?.role !== 'student' || studentSnap.data()?.status === 'disabled') {
 *           throw new HttpsError('permission-denied', 'El alumno no está habilitado para contratar abonos.');
 *         }
 *
 *         // b. Verificar perfil de profesor
 *         const teacherSnap = await transaction.get(db.doc(`users/${teacherId}`));
 *         if (!teacherSnap.exists || teacherSnap.data()?.role !== 'teacher' || teacherSnap.data()?.status === 'disabled') {
 *           throw new HttpsError('failed-precondition', 'El profesor seleccionado no está disponible.');
 *         }
 *         const teacherData = teacherSnap.data()!;
 *
 *         // c. Leer configuración de sala permanente de Google Meet
 *         const meetConfigSnap = await transaction.get(db.doc(`users/${teacherId}/privateSettings/meetConfig`));
 *         let meetUrl: string | undefined = undefined;
 *         let meetSpaceName: string | undefined = undefined;
 *         if (meetConfigSnap.exists) {
 *           meetUrl = meetConfigSnap.data()?.permanentMeetUrl;
 *           meetSpaceName = meetConfigSnap.data()?.permanentMeetSpaceName;
 *         }
 *
 *         // d. Validar reglas recurrentes y recalcular ocurrencias del mes
 *         // (Utiliza el motor de cálculo de fechas de Buenos Aires)
 *         // ...
 *
 *         // e. Verificar disponibilidad, blocked_date, blocked_slot y slot locks
 *         // ...
 *
 *         // f. Escribir lecciones, lock deterministas y el abono mensual en una sola operación
 *         // ...
 *         return {
 *           success: true,
 *           bookingId: '...',
 *           lessonIds: [],
 *           totalLessons: 0,
 *           message: 'Abono confirmado exitosamente.',
 *         };
 *       });
 *
 *       return result;
 *     } catch (err: any) {
 *       if (err instanceof HttpsError) throw err;
 *       throw new HttpsError('internal', err?.message || 'Error interno al procesar el abono.');
 *     }
 *   }
 * );
 * ```
 */

export const CLOUD_FUNCTION_ARCHITECTURE_DOC = {
  functionName: 'confirmMonthlyBooking',
  runtime: 'Node.js 20 / 22',
  triggerType: 'Callable Cloud Function (HTTPS onCall)',
  security: {
    authenticationRequired: true,
    callerIdentitySource: 'request.auth.uid (servidor)',
    roleCheck: 'student activo',
    meetConfigAccess: 'Firebase Admin SDK (bypasses client rules sin exponer credenciales)',
  },
  transactionScope: [
    'monthlyBookings/{bookingId}',
    'lessons/{lessonId} (N documentos)',
    'teacherSlotLocks/{lockKey} (N documentos de concurrencia)',
    'teacherAvailability/{availabilityId} (actualización de franjas puntuales coincidentes)',
  ],
};
