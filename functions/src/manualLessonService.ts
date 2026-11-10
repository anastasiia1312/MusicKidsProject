/**
 * Lógica transaccional y de validación en servidor para clases manuales del profesor
 * SUBBLOQUE 6B.3.3.4.A: Creación manual transaccional con coordinador teacherDailySchedule
 */

import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  CreateManualLessonPayload,
  CreateManualLessonResponse,
  DailyIntervalSlot,
} from './types';
import {
  timeToMinutes,
  minutesToTime,
  calculateEndTime,
  getBuenosAiresNow,
  generateSlotLockKey,
} from './monthlyBookingService';

/**
 * Valida si una URL de Google Meet tiene formato estructural válido
 */
function isValidMeetUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('https://meet.google.com/') &&
    trimmed.length > 24
  );
}

/**
 * Ejecuta la transacción atómica de creación de clase manual en Firestore
 * garantizando la serialización de horarios mediante el coordinador 'teacherDailySchedule'
 */
export async function createManualLessonTransaction(
  db: admin.firestore.Firestore,
  authenticatedTeacherId: string,
  payload: CreateManualLessonPayload
): Promise<CreateManualLessonResponse> {
  const {
    studentId,
    title,
    date,
    startTime,
    duration,
    idempotencyKey,
  } = payload;

  // 1. Validaciones previas de parámetros y tipos
  if (!authenticatedTeacherId || typeof authenticatedTeacherId !== 'string') {
    throw new HttpsError(
      'unauthenticated',
      'Debe estar autenticado en MusicKids para crear una clase.'
    );
  }

  if (!studentId || typeof studentId !== 'string' || !studentId.trim()) {
    throw new HttpsError('invalid-argument', 'Debe seleccionar un alumno válido.');
  }

  if (studentId.trim() === authenticatedTeacherId) {
    throw new HttpsError('invalid-argument', 'El profesor no puede asignarse una clase a sí mismo.');
  }

  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) {
    throw new HttpsError('invalid-argument', 'El título de la clase es obligatorio.');
  }
  if (trimmedTitle.length > 120) {
    throw new HttpsError('invalid-argument', 'El título de la clase no puede superar los 120 caracteres.');
  }

  // Validación de fecha (YYYY-MM-DD)
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    throw new HttpsError('invalid-argument', 'Formato de fecha inválido. Debe ser YYYY-MM-DD.');
  }
  const cleanDate = date.trim();

  // Validación de hora (HH:mm)
  if (!startTime || typeof startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())) {
    throw new HttpsError('invalid-argument', 'Formato de hora inválido. Debe ser HH:mm (24 horas).');
  }
  const cleanStartTime = startTime.trim();

  // Duración estricta de 45 minutos para todas las clases nuevas
  if (duration !== undefined && duration !== 45) {
    throw new HttpsError(
      'invalid-argument',
      `Todas las clases nuevas deben durar exactamente 45 minutos (se recibió ${duration} min).`
    );
  }
  const lessonDuration = 45;
  const endTime = calculateEndTime(cleanStartTime, lessonDuration);
  const startMinutes = timeToMinutes(cleanStartTime);
  const endMinutes = startMinutes + lessonDuration;

  // 2. Control de tiempo y fecha respecto a Buenos Aires (America/Argentina/Buenos_Aires)
  const { dateStr: todayBsAs, minutesNow: minutesBsAs, now: nowServer } = getBuenosAiresNow();

  if (cleanDate < todayBsAs) {
    throw new HttpsError(
      'failed-precondition',
      `No se pueden programar clases en fechas que ya han transcurrido (${cleanDate}).`
    );
  }

  if (cleanDate === todayBsAs && startMinutes <= minutesBsAs) {
    throw new HttpsError(
      'failed-precondition',
      `La hora seleccionada (${cleanStartTime}) para el día de hoy ya ha comenzado o transcurrido.`
    );
  }

  // 3. Control de Idempotencia
  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    const existingLessonSnap = await db
      .collection('lessons')
      .where('teacherId', '==', authenticatedTeacherId)
      .where('idempotencyKey', '==', idempotencyKey.trim())
      .limit(1)
      .get();

    if (!existingLessonSnap.empty) {
      const existingLessonDoc = existingLessonSnap.docs[0];
      const existingData = existingLessonDoc.data();
      let formattedDateStr = cleanDate;
      let existingStartStr = cleanStartTime;

      if (existingData.date?.toDate) {
        const d = existingData.date.toDate();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        formattedDateStr = `${y}-${m}-${day}`;
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        existingStartStr = `${h}:${min}`;
      }

      // Validar si los parámetros de la solicitud coinciden exactamente con los de la clase existente
      const matchesStudent = existingData.studentId === studentId.trim();
      const matchesDate = formattedDateStr === cleanDate;
      const matchesTime = existingStartStr === cleanStartTime;

      if (!matchesStudent || !matchesDate || !matchesTime) {
        throw new HttpsError(
          'already-exists',
          `La clave de idempotencia '${idempotencyKey.trim()}' ya fue utilizada previamente con parámetros distintos (Alumno: ${existingData.studentId}, Fecha: ${formattedDateStr}, Hora: ${existingStartStr}). No se puede reutilizar la misma clave para una solicitud diferente.`
        );
      }

      return {
        success: true,
        lessonId: existingLessonDoc.id,
        title: existingData.title || trimmedTitle,
        teacherId: authenticatedTeacherId,
        studentId: existingData.studentId,
        date: formattedDateStr,
        startTime: existingStartStr,
        endTime: calculateEndTime(existingStartStr, 45),
        duration: 45,
        status: existingData.status || 'scheduled',
        meetUrl: existingData.meetUrl || '',
        meetSpaceName: existingData.meetSpaceName || null,
        message: 'Clase recuperada por clave de idempotencia existente.',
      };
    }
  }

  // 4. Verificación de perfiles de usuario
  const teacherDoc = await db.doc(`users/${authenticatedTeacherId}`).get();
  if (!teacherDoc.exists) {
    throw new HttpsError('permission-denied', 'El perfil del profesor no fue encontrado.');
  }
  const teacherData = teacherDoc.data()!;
  if (teacherData.role !== 'teacher' || teacherData.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Solo profesores activos pueden programar clases.');
  }

  const studentDoc = await db.doc(`users/${studentId.trim()}`).get();
  if (!studentDoc.exists) {
    throw new HttpsError('failed-precondition', 'El alumno seleccionado no existe.');
  }
  const studentData = studentDoc.data()!;
  if (studentData.role !== 'student' || studentData.status === 'disabled') {
    throw new HttpsError('failed-precondition', 'El alumno seleccionado no está activo o disponible.');
  }

  // 5. Verificación de excepciones del profesor (teacherScheduleExceptions)
  const exceptionsSnap = await db
    .collection('teacherScheduleExceptions')
    .where('teacherId', '==', authenticatedTeacherId)
    .get();

  const exceptions = exceptionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  for (const ex of exceptions) {
    if (ex.type === 'blocked_date' || ex.type === 'vacation') {
      if (ex.startDate <= cleanDate && cleanDate <= ex.endDate) {
        throw new HttpsError(
          'failed-precondition',
          `La fecha ${cleanDate} está bloqueada en tu calendario (${ex.reason || 'No disponible'}).`
        );
      }
    } else if (ex.type === 'blocked_slot') {
      if (ex.startDate <= cleanDate && cleanDate <= ex.endDate) {
        if (!ex.targetTime || ex.targetTime === cleanStartTime) {
          throw new HttpsError(
            'failed-precondition',
            `El horario de las ${cleanStartTime} está bloqueado puntualmente en tu calendario.`
          );
        }
      }
    }
  }

  // 6. Verificación de clases manuales o históricas existentes en 'lessons'
  const lessonsSnap = await db
    .collection('lessons')
    .where('teacherId', '==', authenticatedTeacherId)
    .get();

  const activeLessons = lessonsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .filter((l) => l.status !== 'cancelled');

  for (const lesson of activeLessons) {
    let lessonDateStr = '';
    let lessonTimeStr = lesson.startTime || '';

    if (typeof lesson.date === 'string') {
      lessonDateStr = lesson.date.substring(0, 10);
    } else if (lesson.date?.toDate) {
      const d = lesson.date.toDate();
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

    if (lessonDateStr === cleanDate && lessonTimeStr) {
      const durationNum = lesson.duration || 45;
      const lStart = timeToMinutes(lessonTimeStr);
      const lEnd = lStart + durationNum;

      if (startMinutes < lEnd && lStart < endMinutes) {
        throw new HttpsError(
          'already-exists',
          `Ya existe una clase programada (${lesson.title || 'Clase'}) el ${cleanDate} de ${lessonTimeStr} a las ${minutesToTime(lEnd)}.`
        );
      }
    }
  }

  // 7. Resolución obligatoria y exclusiva de la sala permanente de Google Meet
  // REGLA ESTRICTA (Subbloque 6B.3.3.4.A.1):
  // El enlace se obtiene EXCLUSIVAMENTE desde users/{teacherId}/privateSettings/meetConfig.
  // No se aceptan enlaces ni nombres de espacio inyectados desde el navegador/payload.
  // Si el docente no tiene sala permanente configurada y válida, se rechaza con 'failed-precondition'.
  const meetConfigSnap = await db
    .doc(`users/${authenticatedTeacherId}/privateSettings/meetConfig`)
    .get();

  if (!meetConfigSnap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'El profesor no tiene configurada una sala permanente de Google Meet en su perfil (users/{teacherId}/privateSettings/meetConfig). Debe autorizar y configurar su sala en la plataforma antes de programar clases.'
    );
  }

  const meetData = meetConfigSnap.data();
  if (!meetData || !isValidMeetUrl(meetData.permanentMeetUrl)) {
    throw new HttpsError(
      'failed-precondition',
      'La configuración de Google Meet del profesor no contiene un enlace permanente válido. Debe verificar su sala en la plataforma.'
    );
  }

  const resolvedMeetUrl: string = meetData.permanentMeetUrl;
  const resolvedMeetSpaceName: string | null =
    typeof meetData.permanentMeetSpaceName === 'string'
      ? meetData.permanentMeetSpaceName
      : null;

  // 8. EJECUCIÓN TRANSACCIONAL ATÓMICA CON SERIALIZACIÓN POR teacherDailySchedule
  const lessonRef = db.collection('lessons').doc();
  const lessonId = lessonRef.id;
  const scheduleRef = db.doc(`teacherDailySchedule/${authenticatedTeacherId}_${cleanDate}`);

  return await db.runTransaction(async (transaction) => {
    // a. Lectura previa obligatoria dentro de la transacción
    const scheduleSnap = await transaction.get(scheduleRef);
    const existingIntervals: DailyIntervalSlot[] = scheduleSnap.exists
      ? scheduleSnap.data()?.intervals || []
      : [];

    // b. Filtrar intervalos activos (no cancelados ni expirados)
    const activeIntervals = existingIntervals.filter((slot) => {
      if (slot.status === 'cancelled' || slot.status === 'expired') return false;
      if (
        slot.status === 'pending_payment_confirmation' &&
        slot.expiresAt &&
        new Date(slot.expiresAt).getTime() <= nowServer.getTime()
      ) {
        return false;
      }
      return true;
    });

    // c. Comprobar que el horario no colisione con ningún intervalo ocupado
    for (const existing of activeIntervals) {
      if (startMinutes < existing.endMinutes && existing.startMinutes < endMinutes) {
        throw new HttpsError(
          'already-exists',
          `El horario del ${cleanDate} de ${cleanStartTime} a ${endTime} ya se encuentra reservado por otra clase o abono mensual pendiente de pago.`
        );
      }
    }

    // d. Agregar el nuevo intervalo manual ocupado
    activeIntervals.push({
      startTime: cleanStartTime,
      endTime,
      startMinutes,
      endMinutes,
      bookingId: lessonId,
      lessonId,
      studentId: studentId.trim(),
      status: 'scheduled',
      expiresAt: null,
    });

    // e. Actualizar el documento coordinador teacherDailySchedule
    transaction.set(
      scheduleRef,
      {
        teacherId: authenticatedTeacherId,
        date: cleanDate,
        intervals: activeIntervals,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // f. Crear la clase en la colección 'lessons'
    const [y, m, d] = cleanDate.split('-').map((v) => parseInt(v, 10));
    const [h, min] = cleanStartTime.split(':').map((v) => parseInt(v, 10));
    const classDateUtc = new Date(Date.UTC(y, m - 1, d, h + 3, min, 0)); // Compensación UTC-3 (Buenos Aires)

    const lessonData = {
      id: lessonId,
      title: trimmedTitle,
      teacherId: authenticatedTeacherId,
      studentId: studentId.trim(),
      date: admin.firestore.Timestamp.fromDate(classDateUtc),
      duration: 45,
      status: 'scheduled',
      meetUrl: resolvedMeetUrl || null,
      meetSpaceName: resolvedMeetSpaceName || null,
      idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
      bookingType: 'manual',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.set(lessonRef, lessonData);

    // g. Registrar cerrojo determinista en teacherSlotLocks para compatibilidad
    const lockKey = generateSlotLockKey(authenticatedTeacherId, cleanDate, cleanStartTime);
    const lockRef = db.doc(`teacherSlotLocks/${lockKey}`);
    transaction.set(lockRef, {
      id: lockKey,
      teacherId: authenticatedTeacherId,
      date: cleanDate,
      startTime: cleanStartTime,
      endTime,
      duration: 45,
      bookingType: 'manual',
      bookingId: lessonId,
      studentId: studentId.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null,
    });

    return {
      success: true,
      lessonId,
      title: trimmedTitle,
      teacherId: authenticatedTeacherId,
      studentId: studentId.trim(),
      date: cleanDate,
      startTime: cleanStartTime,
      endTime,
      duration: 45,
      status: 'scheduled',
      meetUrl: resolvedMeetUrl,
      meetSpaceName: resolvedMeetSpaceName || null,
      message: 'Clase manual creada exitosamente con horario coordinado en la agenda.',
    };
  });
}
