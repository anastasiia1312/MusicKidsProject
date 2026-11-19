/**
 * Lógica transaccional y de validación en servidor para abonos mensuales
 * SUBBLOQUE 6B.3.3: Creación atómica de reservas mensuales
 */

import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  CreateMonthlyBookingPayload,
  CreateMonthlyBookingResponse,
  ProjectedClassOccurrence,
  DailyIntervalSlot,
  ConfirmMonthlyBookingPaymentPayload,
  ConfirmMonthlyBookingPaymentResponse,
  GetTeacherPublicAvailabilityResponse,
  SanitizedOccupiedInterval,
  ExpireMonthlyBookingsResponse,
  ProvisionMonthlyBookingMeetPayload,
  ProvisionMonthlyBookingMeetResponse,
} from './types';

const MONTH_NAMES_SPANISH = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DAY_NAMES_SPANISH = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calculateEndTime(startTime: string, durationMinutes: number = 45): string {
  const startMins = timeToMinutes(startTime);
  const endMins = startMins + durationMinutes;
  return minutesToTime(endMins);
}

export function formatSpanishDate(year: number, month1Indexed: number, day: number): string {
  const d = new Date(year, month1Indexed - 1, day, 12, 0, 0);
  const dayName = DAY_NAMES_SPANISH[d.getDay()];
  const monthName = MONTH_NAMES_SPANISH[month1Indexed - 1].toLowerCase();
  return `${dayName} ${day} de ${monthName} de ${year}`;
}

/**
 * Retorna la fecha actual en formato 'YYYY-MM-DD' y minutos transcurridos
 * en la zona horaria oficial de Argentina (America/Argentina/Buenos_Aires).
 */
export function getBuenosAiresNow(): { dateStr: string; minutesNow: number; now: Date } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  let y = '';
  let m = '';
  let d = '';
  let h = '00';
  let min = '00';

  for (const p of parts) {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
    if (p.type === 'hour') h = p.value;
    if (p.type === 'minute') min = p.value;
  }

  const dateStr = `${y}-${m}-${d}`;
  const minutesNow = parseInt(h, 10) * 60 + parseInt(min, 10);
  return { dateStr, minutesNow, now };
}

/**
 * Genera clave determinística para teacherSlotLocks
 */
export function generateSlotLockKey(teacherId: string, dateStr: string, startTime: string): string {
  const sanitizedTeacherId = teacherId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedDate = dateStr.trim();
  const sanitizedTime = startTime.trim().replace(':', '');
  return `${sanitizedTeacherId}_${sanitizedDate}_${sanitizedTime}`;
}

/**
 * Ejecuta la transacción atómica de creación de abono mensual en Firestore
 * mediante Firebase Admin SDK.
 */
export async function createMonthlyBookingTransaction(
  db: admin.firestore.Firestore,
  authenticatedStudentId: string,
  payload: CreateMonthlyBookingPayload
): Promise<CreateMonthlyBookingResponse> {
  const { teacherId, month, recurringSlotIds, weeklyFrequency, idempotencyKey } = payload;

  // 1. Validaciones básicas de parámetros
  if (!teacherId || typeof teacherId !== 'string' || !teacherId.trim()) {
    throw new HttpsError('invalid-argument', 'El identificador del profesor es obligatorio.');
  }

  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!month || !monthRegex.test(month.trim())) {
    throw new HttpsError('invalid-argument', 'El mes debe tener el formato YYYY-MM (ej: 2026-03).');
  }

  if (!Array.isArray(recurringSlotIds) || recurringSlotIds.length < 1 || recurringSlotIds.length > 3) {
    throw new HttpsError('invalid-argument', 'Debe seleccionar entre 1 y 3 horarios semanales.');
  }

  if (recurringSlotIds.length !== weeklyFrequency) {
    throw new HttpsError(
      'invalid-argument',
      `La cantidad de horarios seleccionados (${recurringSlotIds.length}) debe coincidir con la frecuencia semanal (${weeklyFrequency}).`
    );
  }

  const uniqueSlotIds = Array.from(new Set(recurringSlotIds));
  if (uniqueSlotIds.length !== recurringSlotIds.length) {
    throw new HttpsError('invalid-argument', 'No puede seleccionar horarios recurrentes duplicados.');
  }

  // 2. Control de idempotencia previo
  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    const existingSnap = await db
      .collection('monthlyBookings')
      .where('studentId', '==', authenticatedStudentId)
      .where('idempotencyKey', '==', idempotencyKey.trim())
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingData = existingSnap.docs[0].data();
      return {
        success: true,
        bookingId: existingSnap.docs[0].id,
        status: 'pending_payment_confirmation',
        totalPrice: existingData.totalPrice || existingData.price || 0,
        currency: 'ARS',
        totalLessons: existingData.totalLessons || 0,
        occurrences: existingData.occurrences || [],
        lessonIds: existingData.lessonIds || [],
        expiresAt: existingData.expiresAt?.toDate
          ? existingData.expiresAt.toDate().toISOString()
          : new Date(existingData.expiresAt).toISOString(),
        message: 'Reserva recuperada por clave de idempotencia existente.',
      };
    }
  }

  // 3. Consultas previas en servidor para perfiles y reglas
  const studentDoc = await db.doc(`users/${authenticatedStudentId}`).get();
  if (!studentDoc.exists) {
    throw new HttpsError('permission-denied', 'El perfil del alumno no fue encontrado.');
  }
  const studentData = studentDoc.data()!;
  if (studentData.role !== 'student' || studentData.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Solo alumnos activos pueden reservar abonos mensuales.');
  }
  const resolvedStudentName = studentData.name || studentData.displayName || 'Alumno';
  const resolvedStudentEmail = studentData.email || '';

  const teacherDoc = await db.doc(`users/${teacherId}`).get();
  if (!teacherDoc.exists) {
    throw new HttpsError('failed-precondition', 'El profesor seleccionado no existe.');
  }
  const teacherData = teacherDoc.data()!;
  if (teacherData.role !== 'teacher' || teacherData.status === 'disabled') {
    throw new HttpsError('failed-precondition', 'El profesor seleccionado no está disponible.');
  }

  // Tarifa fija mensual inmutable
  const monthlyPlans = Array.isArray(teacherData.monthlyPlans) ? teacherData.monthlyPlans : [];
  const targetPlan = monthlyPlans.find(
    (p: any) =>
      p &&
      (p.lessonsPerWeek === weeklyFrequency || p.classesPerWeek === weeklyFrequency) &&
      p.active === true &&
      typeof p.price === 'number' &&
      p.price > 0
  );

  if (!targetPlan) {
    throw new HttpsError(
      'failed-precondition',
      `El profesor no tiene configurada la tarifa fija para la frecuencia de ${weeklyFrequency} clases por semana.`
    );
  }
  const fixedMonthlyPrice: number = targetPlan.price;

  // Consultar las reglas recurrentes seleccionadas
  const slotDocs = await Promise.all(
    uniqueSlotIds.map((id) => db.doc(`teacherRecurringSlots/${id}`).get())
  );

  const selectedSlots: any[] = [];
  for (let i = 0; i < slotDocs.length; i++) {
    const sDoc = slotDocs[i];
    if (!sDoc.exists) {
      throw new HttpsError(
        'not-found',
        `El horario recurrente con ID '${uniqueSlotIds[i]}' no existe.`
      );
    }
    const slot = { id: sDoc.id, ...sDoc.data() } as any;
    if (slot.teacherId !== teacherId) {
      throw new HttpsError(
        'failed-precondition',
        'El horario recurrente seleccionado no pertenece al profesor indicado.'
      );
    }
    if (slot.isActive === false) {
      throw new HttpsError(
        'failed-precondition',
        'Uno o más de los horarios recurrentes seleccionados están pausados o inactivos.'
      );
    }
    if (slot.duration !== 45) {
      throw new HttpsError(
        'invalid-argument',
        `Todas las clases nuevas deben durar exactamente 45 minutos (el horario tiene ${slot.duration} min).`
      );
    }
    selectedSlots.push(slot);
  }

  // Verificar que los horarios seleccionados no se superpongan entre sí en el mismo día
  for (let i = 0; i < selectedSlots.length; i++) {
    for (let j = i + 1; j < selectedSlots.length; j++) {
      const a = selectedSlots[i];
      const b = selectedSlots[j];
      if (a.dayOfWeek === b.dayOfWeek) {
        const aStart = timeToMinutes(a.startTime);
        const aEnd = aStart + (a.duration || 45);
        const bStart = timeToMinutes(b.startTime);
        const bEnd = bStart + (b.duration || 45);
        if (aStart < bEnd && bStart < aEnd) {
          throw new HttpsError(
            'invalid-argument',
            `Los horarios seleccionados para el día ${DAY_NAMES_SPANISH[a.dayOfWeek]} se superponen entre sí.`
          );
        }
      }
    }
  }

  // 4. Proyección de ocurrencias para el mes seleccionado
  const [yearStr, monthNumStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const occurrences: ProjectedClassOccurrence[] = [];
  const { dateStr: todayBsAs, minutesNow: minutesBsAs, now: nowServer } = getBuenosAiresNow();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthNum - 1, day, 12, 0, 0);
    const dayOfWeek = d.getDay();
    const dateFormattedStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    for (const slot of selectedSlots) {
      if (slot.dayOfWeek === dayOfWeek) {
        // Validar originDate
        if (slot.originDate && dateFormattedStr < slot.originDate) {
          continue; // No vigente aún
        }

        // Validar no estar en el pasado respecto a Buenos Aires
        if (dateFormattedStr < todayBsAs) {
          throw new HttpsError(
            'failed-precondition',
            `No se pueden reservar abonos en meses o fechas que ya han transcurrido (${dateFormattedStr}).`
          );
        }
        if (dateFormattedStr === todayBsAs) {
          const slotStartMins = timeToMinutes(slot.startTime);
          if (slotStartMins <= minutesBsAs) {
            throw new HttpsError(
              'failed-precondition',
              `La clase del día de hoy a las ${slot.startTime} ya ha comenzado o transcurrido.`
            );
          }
        }

        occurrences.push({
          date: dateFormattedStr,
          startTime: slot.startTime,
          endTime: slot.endTime || calculateEndTime(slot.startTime, 45),
          duration: 45,
          formattedDate: formatSpanishDate(year, monthNum, day),
          recurringSlotId: slot.id,
        });
      }
    }
  }

  // Ordenar cronológicamente las ocurrencias
  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  if (occurrences.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No se generaron clases para el mes y los horarios seleccionados.'
    );
  }

  // 5. Consultar excepciones de disponibilidad del profesor
  const exceptionsSnap = await db
    .collection('teacherScheduleExceptions')
    .where('teacherId', '==', teacherId)
    .get();

  const exceptions = exceptionsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as any[];

  for (const occ of occurrences) {
    for (const ex of exceptions) {
      if (ex.type === 'blocked_date' || ex.type === 'vacation') {
        if (ex.startDate <= occ.date && occ.date <= ex.endDate) {
          throw new HttpsError(
            'failed-precondition',
            `La fecha ${occ.formattedDate} está bloqueada por el profesor (${ex.reason || 'No disponible'}).`
          );
        }
      } else if (ex.type === 'blocked_slot') {
        if (ex.startDate <= occ.date && occ.date <= ex.endDate) {
          const matchTime = ex.targetTime ? ex.targetTime === occ.startTime : true;
          const matchSlot = ex.recurringSlotId ? ex.recurringSlotId === occ.recurringSlotId : true;
          if (matchTime && matchSlot) {
            throw new HttpsError(
              'failed-precondition',
              `La clase del ${occ.formattedDate} a las ${occ.startTime} está bloqueada por el profesor (${ex.reason || 'Bloqueo puntual'}).`
            );
          }
        }
      }
    }
  }

  // 6. Consultar clases manuales existentes en 'lessons'
  const lessonsSnap = await db
    .collection('lessons')
    .where('teacherId', '==', teacherId)
    .get();

  const activeLessons = lessonsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .filter((l) => {
      if (l.status === 'cancelled' || l.status === 'expired') return false;
      // SUBBLOQUE 6B.5: Si pertenece a una reserva pendiente que ya superó las 24 horas, no bloquea
      if (l.paymentStatus === 'pending_confirmation' && l.monthlyBookingId) {
        if (l.expiresAt?.toDate && l.expiresAt.toDate().getTime() <= nowServer.getTime()) {
          return false;
        }
      }
      return true;
    });

  for (const occ of occurrences) {
    const occStart = timeToMinutes(occ.startTime);
    const occEnd = occStart + occ.duration;

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

      if (lessonDateStr === occ.date && lessonTimeStr) {
        const lessonDuration = lesson.duration || 45;
        const lessonStart = timeToMinutes(lessonTimeStr);
        const lessonEnd = lessonStart + lessonDuration;

        if (occStart < lessonEnd && lessonStart < occEnd) {
          throw new HttpsError(
            'already-exists',
            `El horario del ${occ.formattedDate} a las ${occ.startTime} ya tiene una clase programada.`
          );
        }
      }
    }
  }

  // 6.b. Consultar datos bancarios del profesor para proporcionarlos de forma segura al alumno autenticado
  let teacherBankDetails: {
    alias: string;
    cbuCvu: string;
    accountHolder: string;
    bankName?: string;
  } | null = null;

  try {
    const bankDoc = await db.doc(`users/${teacherId}/privateSettings/bankDetails`).get();
    if (bankDoc.exists) {
      const bData = bankDoc.data();
      if (bData && (bData.alias || bData.cbuCvu)) {
        teacherBankDetails = {
          alias: bData.alias || '',
          cbuCvu: bData.cbuCvu || '',
          accountHolder: bData.accountHolder || '',
          bankName: bData.bankName || '',
        };
      }
    }
  } catch (err) {
    console.warn('Advertencia al consultar datos bancarios del profesor:', err);
  }

  // 7. EJECUCIÓN TRANSACCIONAL ATÓMICA CON SERIALIZACIÓN POR teacherDailySchedule
  const bookingRef = db.collection('monthlyBookings').doc();
  const bookingId = bookingRef.id;
  const lessonIds: string[] = [];

  // Expiración calculada en servidor a exactamente 24 horas (86.400.000 ms)
  const expiresAtDate = new Date(nowServer.getTime() + 24 * 60 * 60 * 1000);
  const expiresAtTimestamp = admin.firestore.Timestamp.fromDate(expiresAtDate);

  const monthLabel = `${MONTH_NAMES_SPANISH[monthNum - 1]} ${year}`;

  return await db.runTransaction(async (transaction) => {
    // a. Obtener fechas únicas involucradas
    const uniqueDates = Array.from(new Set(occurrences.map((o) => o.date)));

    // b. Adquirir bloqueos pesimistas sobre el documento de control diario 'teacherDailySchedule'
    const dailyScheduleDocs: Record<string, { ref: admin.firestore.DocumentReference; data?: any }> = {};

    for (const dStr of uniqueDates) {
      const scheduleRef = db.doc(`teacherDailySchedule/${teacherId}_${dStr}`);
      const scheduleSnap = await transaction.get(scheduleRef);
      dailyScheduleDocs[dStr] = {
        ref: scheduleRef,
        data: scheduleSnap.exists ? scheduleSnap.data() : null,
      };
    }

    // c. Verificar que ningún intervalo de teacherDailySchedule colisione
    const updatedDailyIntervals: Record<string, DailyIntervalSlot[]> = {};
    const expiredBookingIdsToClean = new Set<string>();

    for (const dStr of uniqueDates) {
      const currentDoc = dailyScheduleDocs[dStr];
      const existingIntervals: DailyIntervalSlot[] = currentDoc.data?.intervals || [];

      // SUBBLOQUE 6B.5: Retención de 24 horas y expiración coherente.
      // Si un intervalo con 'pending_payment_confirmation' superó las 24 horas sin confirmación,
      // su estado pasa a 'expired' y queda liberado para nuevos alumnos.
      const activeIntervals: DailyIntervalSlot[] = [];

      for (const slot of existingIntervals) {
        if (slot.status === 'cancelled' || slot.status === 'expired') {
          continue;
        }

        if (
          slot.status === 'pending_payment_confirmation' &&
          slot.expiresAt &&
          new Date(slot.expiresAt).getTime() <= nowServer.getTime()
        ) {
          slot.status = 'expired';
          if (slot.bookingId) {
            expiredBookingIdsToClean.add(slot.bookingId);
          }
          continue; // Liberado: no colisiona con la nueva reserva
        }

        activeIntervals.push(slot);
      }

      // Validar cada ocurrencia de ese día contra los intervalos activos
      const dayOccurrences = occurrences.filter((o) => o.date === dStr);

      for (const occ of dayOccurrences) {
        const occStart = timeToMinutes(occ.startTime);
        const occEnd = occStart + occ.duration;

        for (const existing of activeIntervals) {
          if (occStart < existing.endMinutes && existing.startMinutes < occEnd) {
            throw new HttpsError(
              'already-exists',
              `El horario del ${occ.formattedDate} de ${occ.startTime} a ${occ.endTime} ya se encuentra reservado o pendiente de pago por otro alumno.`
            );
          }
        }

        // Agregar el nuevo intervalo pendiente
        activeIntervals.push({
          startTime: occ.startTime,
          endTime: occ.endTime,
          startMinutes: occStart,
          endMinutes: occEnd,
          bookingId,
          studentId: authenticatedStudentId,
          status: 'pending_payment_confirmation',
          expiresAt: expiresAtDate.toISOString(),
        });
      }

      updatedDailyIntervals[dStr] = activeIntervals;
    }

    // Marcar en 'monthlyBookings' los abonos cuyos intervalos expiraron
    for (const expId of expiredBookingIdsToClean) {
      const expBookingRef = db.doc(`monthlyBookings/${expId}`);
      transaction.set(
        expBookingRef,
        {
          status: 'expired',
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // d. Crear las lecciones asociadas en 'lessons'
    for (let i = 0; i < occurrences.length; i++) {
      const occ = occurrences[i];
      const lessonRef = db.collection('lessons').doc();
      const lessonId = lessonRef.id;
      lessonIds.push(lessonId);

      // Calcular timestamp exacto para el campo 'date' de Lesson
      const [y, m, d] = occ.date.split('-').map((v) => parseInt(v, 10));
      const [h, min] = occ.startTime.split(':').map((v) => parseInt(v, 10));
      const classDateUtc = new Date(Date.UTC(y, m - 1, d, h + 3, min, 0)); // Compensación UTC-3

      const lessonData = {
        id: lessonId,
        title: `Clase de música - Abono ${monthLabel}`,
        teacherId,
        studentId: authenticatedStudentId,
        studentName: resolvedStudentName,
        studentEmail: resolvedStudentEmail,
        monthlyBookingId: bookingId,
        date: admin.firestore.Timestamp.fromDate(classDateUtc),
        duration: 45,
        status: 'scheduled',
        meetUrl: null,
        meetSpaceName: null,
        paymentStatus: 'pending_confirmation',
        expiresAt: expiresAtTimestamp,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.set(lessonRef, lessonData);

      // Registrar también el cerrojo granular en teacherSlotLocks para compatibilidad
      const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
      const lockRef = db.doc(`teacherSlotLocks/${lockKey}`);
      transaction.set(lockRef, {
        id: lockKey,
        teacherId,
        date: occ.date,
        startTime: occ.startTime,
        endTime: occ.endTime,
        duration: 45,
        bookingType: 'monthly',
        bookingId,
        studentId: authenticatedStudentId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAtTimestamp,
      });
    }

    // e. Actualizar los documentos coordinadores de teacherDailySchedule
    for (const dStr of uniqueDates) {
      const scheduleRef = dailyScheduleDocs[dStr].ref;
      transaction.set(
        scheduleRef,
        {
          teacherId,
          date: dStr,
          intervals: updatedDailyIntervals[dStr],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // f. Crear el abono mensual en 'monthlyBookings' con status 'pending_payment_confirmation'
    const bookingData = {
      id: bookingId,
      teacherId,
      studentId: authenticatedStudentId,
      studentName: resolvedStudentName,
      studentEmail: resolvedStudentEmail,
      month,
      year,
      monthNumber: monthNum,
      recurringSlotIds,
      weeklyFrequency,
      lessonIds,
      totalLessons: occurrences.length,
      occurrences,
      status: 'pending_payment_confirmation',
      totalPrice: fixedMonthlyPrice,
      price: fixedMonthlyPrice,
      currency: 'ARS',
      idempotencyKey: idempotencyKey || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAtTimestamp,
    };

    transaction.set(bookingRef, bookingData);

    return {
      success: true,
      bookingId,
      status: 'pending_payment_confirmation',
      totalPrice: fixedMonthlyPrice,
      currency: 'ARS',
      totalLessons: occurrences.length,
      occurrences,
      lessonIds,
      expiresAt: expiresAtDate.toISOString(),
      bankDetails: teacherBankDetails,
      message:
        'Reserva mensual creada correctamente con estado pendiente de confirmación de pago. Los horarios quedan reservados por 24 horas a la espera de la transferencia bancaria.',
    };
  });
}

const MEET_URL_REGEX =
  /^https:\/\/meet\.google\.com\/[a-zA-Z0-9]{2,}(?:-[a-zA-Z0-9]+)+(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

/**
 * Valida si una URL de Google Meet tiene un formato estructural válido.
 */
export function isValidMeetUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return MEET_URL_REGEX.test(trimmed);
}

/**
 * SUBBLOQUE 6B.5: Confirmación de pago del abono mensual por el profesor
 * Realiza la transición atómica:
 * - monthlyBookings: 'pending_payment_confirmation' -> 'confirmed'
 * - lessons: paymentStatus 'pending_confirmation' -> 'confirmed'
 * - teacherDailySchedule: intervalos 'pending_payment_confirmation' -> 'confirmed' (sin expiresAt)
 * - teacherSlotLocks: expiresAt -> null
 *
 * Etapa 2 Google Meet: La confirmación del pago NO consulta ni copia salas permanentes
 * heredadas (ni privateSettings/meetConfig ni users/{teacherId}). Cada abono confirmado
 * provisiona su propia sala única de Google Meet en una operación separada mediante
 * `provisionMonthlyBookingMeetService`.
 */
export async function confirmMonthlyBookingPaymentTransaction(
  db: admin.firestore.Firestore,
  authenticatedTeacherId: string,
  payload: ConfirmMonthlyBookingPaymentPayload
): Promise<ConfirmMonthlyBookingPaymentResponse> {
  const { bookingId } = payload;
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'El identificador del abono es obligatorio.');
  }

  const { now: nowServer } = getBuenosAiresNow();
  const bookingRef = db.doc(`monthlyBookings/${bookingId.trim()}`);

  // Consultar lecciones vinculadas por bookingId para asegurar consistencia
  let linkedLessonsSnap: admin.firestore.QuerySnapshot | null = null;
  try {
    linkedLessonsSnap = await db
      .collection('lessons')
      .where('monthlyBookingId', '==', bookingId.trim())
      .get();
  } catch (err) {
    console.warn('Aviso al consultar lecciones vinculadas:', err);
  }

  // Verificación previa de expiración y persistencia atómica si ya vencieron las 24h
  const preBookingSnap = await bookingRef.get().catch(() => null);
  if (preBookingSnap && preBookingSnap.exists) {
    const bData = preBookingSnap.data()!;
    let isExpired = bData.status === 'expired';
    if (!isExpired && bData.expiresAt && bData.status !== 'confirmed') {
      const expMs = bData.expiresAt.toDate
        ? bData.expiresAt.toDate().getTime()
        : new Date(bData.expiresAt).getTime();
      if (!isNaN(expMs) && expMs <= nowServer.getTime()) {
        isExpired = true;
      }
    }
    if (isExpired && bData.status !== 'confirmed') {
      await expireSingleBookingDocument(db, bookingId.trim());
      throw new HttpsError(
        'failed-precondition',
        'El plazo de retención de 24 horas ha vencido. El abono se encuentra expirado y los horarios han sido liberados.'
      );
    }
  }

  return await db.runTransaction(async (transaction) => {
    // ==========================================
    // 1. TODAS LAS LECTURAS (READS) PRIMERO
    // ==========================================
    const bookingSnap = await transaction.get(bookingRef);
    let bookingData: any = null;

    if (bookingSnap.exists) {
      bookingData = bookingSnap.data()!;
    } else if (linkedLessonsSnap && !linkedLessonsSnap.empty) {
      // Reconstruir bookingData desde lecciones si el documento en monthlyBookings aún no existía
      const firstLesson = linkedLessonsSnap.docs[0].data();
      if (firstLesson.teacherId !== authenticatedTeacherId) {
        throw new HttpsError(
          'permission-denied',
          'No tiene autorización para confirmar pagos de este abono.'
        );
      }
      bookingData = {
        id: bookingId,
        teacherId: authenticatedTeacherId,
        studentId: firstLesson.studentId || '',
        studentName: firstLesson.studentName || 'Alumno',
        studentEmail: firstLesson.studentEmail || '',
        status: firstLesson.paymentStatus === 'confirmed' ? 'confirmed' : 'pending_payment_confirmation',
        lessonIds: linkedLessonsSnap.docs.map((d) => d.id),
        occurrences: linkedLessonsSnap.docs.map((d) => {
          const lData = d.data();
          let dStr = '';
          if (typeof lData.date === 'string') dStr = lData.date.substring(0, 10);
          else if (lData.date?.toDate) {
            const dt = lData.date.toDate();
            dStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
              dt.getDate()
            ).padStart(2, '0')}`;
          }
          return {
            date: dStr,
            startTime: lData.startTime || '14:00',
            duration: lData.duration || 45,
          };
        }),
        expiresAt: firstLesson.expiresAt || null,
        totalLessons: linkedLessonsSnap.size,
      };
    } else {
      throw new HttpsError('not-found', 'El abono mensual indicado no existe.');
    }

    if (bookingData.teacherId !== authenticatedTeacherId) {
      throw new HttpsError(
        'permission-denied',
        'No tiene autorización para confirmar pagos de este abono.'
      );
    }

    if (bookingData.status === 'confirmed') {
      return {
        success: true,
        bookingId,
        status: 'confirmed',
        totalLessons: bookingData.totalLessons || 0,
        confirmedLessonsCount: (bookingData.lessonIds || []).length,
        message: 'El abono mensual ya había sido confirmado previamente.',
      };
    }

    if (bookingData.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'El abono mensual fue cancelado previamente.');
    }

    if (bookingData.status === 'expired') {
      throw new HttpsError(
        'failed-precondition',
        'El abono mensual ya ha expirado tras superar las 24 horas sin confirmación.'
      );
    }

    // Verificar si ya transcurrieron las 24 horas
    if (bookingData.expiresAt) {
      const expMs = bookingData.expiresAt.toDate
        ? bookingData.expiresAt.toDate().getTime()
        : new Date(bookingData.expiresAt).getTime();
      if (!isNaN(expMs) && expMs <= nowServer.getTime()) {
        throw new HttpsError(
          'failed-precondition',
          'El plazo de retención de 24 horas ha vencido. El abono se encuentra expirado y los horarios han sido liberados.'
        );
      }
    }

    const occurrences = Array.isArray(bookingData.occurrences) ? bookingData.occurrences : [];
    const uniqueDates = Array.from(new Set(occurrences.map((o: any) => o.date).filter(Boolean))) as string[];

    // Lectura de TODOS los documentos diarios ANTES de iniciar cualquier escritura
    const schedDocs: Record<
      string,
      { ref: admin.firestore.DocumentReference; intervals: DailyIntervalSlot[] }
    > = {};
    for (const dStr of uniqueDates) {
      const schedRef = db.doc(`teacherDailySchedule/${authenticatedTeacherId}_${dStr}`);
      const schedSnap = await transaction.get(schedRef);
      schedDocs[dStr] = {
        ref: schedRef,
        intervals: schedSnap.exists ? (schedSnap.data()?.intervals || []) : [],
      };
    }

    // ==========================================
    // 2. TODAS LAS ESCRITURAS (WRITES) DESPUÉS
    // ==========================================
    const bookingUpdates: any = {
      status: 'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    transaction.set(bookingRef, bookingUpdates, { merge: true });

    const lessonIds: string[] = Array.from(
      new Set([
        ...(Array.isArray(bookingData.lessonIds) ? bookingData.lessonIds : []),
        ...(linkedLessonsSnap ? linkedLessonsSnap.docs.map((d) => d.id) : []),
      ])
    );

    for (const lid of lessonIds) {
      const lRef = db.doc(`lessons/${lid}`);
      const lessonUpdates: any = {
        paymentStatus: 'confirmed',
        status: 'scheduled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(lRef, lessonUpdates, { merge: true });
    }

    for (const dStr of uniqueDates) {
      const sched = schedDocs[dStr];
      const updated = sched.intervals.map((slot) => {
        if (slot.bookingId === bookingId) {
          return {
            ...slot,
            status: 'confirmed' as const,
            expiresAt: null,
          };
        }
        return slot;
      });
      transaction.set(
        sched.ref,
        {
          intervals: updated,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    for (const occ of occurrences) {
      if (occ.date && occ.startTime) {
        const lockKey = generateSlotLockKey(authenticatedTeacherId, occ.date, occ.startTime);
        const lockRef = db.doc(`teacherSlotLocks/${lockKey}`);
        transaction.set(
          lockRef,
          {
            expiresAt: null,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    return {
      success: true,
      bookingId,
      status: 'confirmed',
      totalLessons: bookingData.totalLessons || occurrences.length,
      confirmedLessonsCount: lessonIds.length,
      message:
        'Pago confirmado exitosamente. Los horarios han quedado reservados definitivamente y las clases se encuentran habilitadas.',
    };
  });
}

export interface MeetSpaceCreationResult {
  meetUrl: string;
  meetSpaceName: string;
}

export class MeetApiCallError extends Error {
  public readonly classification: 'definitive_failure' | 'uncertain';
  public readonly httpStatus?: number;

  constructor(
    message: string,
    classification: 'definitive_failure' | 'uncertain',
    httpStatus?: number
  ) {
    super(message);
    this.name = 'MeetApiCallError';
    this.classification = classification;
    this.httpStatus = httpStatus;
  }
}

export interface ProvisionMonthlyBookingMeetDeps {
  createMeetSpaceFn?: (accessToken: string) => Promise<MeetSpaceCreationResult>;
  nowMsFn?: () => number;
  lockTtlMs?: number;
}

const DEFAULT_MEET_LOCK_TTL_MS = 60 * 1000;
const MEET_API_TIMEOUT_MS = 15 * 1000;

/**
 * Invoca Google Meet REST API v2 para crear un espacio nuevo (OUTSIDE Firestore transaction).
 * Distingue fallos determinísticos previos (4xx/429) de respuestas inciertas (timeout, red, 5xx, JSON inválido).
 */
export async function createGoogleMeetSpaceV2(
  accessToken: string
): Promise<MeetSpaceCreationResult> {
  let response: Response;
  try {
    response = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(MEET_API_TIMEOUT_MS),
    });
  } catch (networkErr: any) {
    const isTimeout =
      networkErr?.name === 'AbortError' || networkErr?.name === 'TimeoutError';
    throw new MeetApiCallError(
      isTimeout
        ? 'Tiempo de espera agotado al crear la sala en Google Meet API.'
        : 'Error de red durante la solicitud a Google Meet API.',
      'uncertain'
    );
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 429) {
      throw new MeetApiCallError(
        `Google Meet API rechazó la solicitud (HTTP ${status}).`,
        'definitive_failure',
        status
      );
    }
    throw new MeetApiCallError(
      `Google Meet API respondió con error de servidor incierto (HTTP ${status}).`,
      'uncertain',
      status
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new MeetApiCallError(
      'La respuesta de Google Meet API no pudo parsearse como JSON válido.',
      'uncertain',
      response.status
    );
  }

  const meetingUri = typeof data?.meetingUri === 'string' ? data.meetingUri.trim() : '';
  const spaceName = typeof data?.name === 'string' ? data.name.trim() : '';

  if (!isValidMeetUrl(meetingUri)) {
    throw new MeetApiCallError(
      'La respuesta HTTP 200 de Google Meet API no incluyó una URL de reunión válida.',
      'uncertain',
      response.status
    );
  }

  return {
    meetUrl: meetingUri,
    meetSpaceName: spaceName,
  };
}

/**
 * ETAPA 2 GOOGLE MEET:
 * Provisión idempotente de sala única de Google Meet para un abono mensual confirmado.
 *
 * Garantías arquitectónicas:
 * 1. Verifica autenticación, pertenencia del profesor, estado 'confirmed' e idempotencia por bookingId.
 * 2. Protección de concurrencia persistente en Firestore (meetProvisioningStatus + lock con TTL).
 * 3. NUNCA invoca Google Meet API dentro de una transacción de Firestore.
 * 4. Si Google Meet API devuelve estado incierto (timeout, red, 5xx, respuesta ambigua),
 *    persiste meetProvisioningStatus='uncertain' para impedir reintentos automáticos ciegos que creen salas duplicadas.
 * 5. Escribe meetUrl y meetSpaceName únicamente en monthlyBookings/{bookingId} y sus lessons vinculadas,
 *    sin alterar pagos, fechas, horarios ni reservas.
 */
export async function provisionMonthlyBookingMeetService(
  db: admin.firestore.Firestore,
  authenticatedTeacherId: string,
  payload: ProvisionMonthlyBookingMeetPayload,
  deps?: ProvisionMonthlyBookingMeetDeps
): Promise<ProvisionMonthlyBookingMeetResponse> {
  if (!authenticatedTeacherId || typeof authenticatedTeacherId !== 'string') {
    throw new HttpsError(
      'unauthenticated',
      'Debe iniciar sesión como profesor para provisionar salas de Google Meet.'
    );
  }

  const sanitizedBookingId =
    payload && typeof payload.bookingId === 'string' ? payload.bookingId.trim() : '';
  if (!sanitizedBookingId) {
    throw new HttpsError('invalid-argument', 'El identificador del abono es obligatorio.');
  }

  const cleanToken =
    payload && typeof payload.meetAccessToken === 'string' ? payload.meetAccessToken.trim() : '';
  const nowMsFn = deps?.nowMsFn ?? (() => Date.now());
  const lockTtlMs = deps?.lockTtlMs ?? DEFAULT_MEET_LOCK_TTL_MS;
  const createMeetSpaceFn = deps?.createMeetSpaceFn ?? createGoogleMeetSpaceV2;

  const bookingRef = db.doc(`monthlyBookings/${sanitizedBookingId}`);
  const lockOwnerToken = randomUUID();

  // Consultar lecciones vinculadas por query fuera de la transacción de bloqueo
  const linkedLessonsSnap = await db
    .collection('lessons')
    .where('monthlyBookingId', '==', sanitizedBookingId)
    .get();

  // =========================================================================
  // TRANSACCIÓN 1: Verificaciones + Idempotencia + Adquisición de Lock
  // =========================================================================
  const tx1Result = await db.runTransaction(async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError('not-found', 'El abono mensual indicado no existe.');
    }

    const bookingData = bookingSnap.data()!;
    if (bookingData.teacherId !== authenticatedTeacherId) {
      throw new HttpsError(
        'permission-denied',
        'No tiene autorización para gestionar la sala Google Meet de este abono.'
      );
    }

    if (bookingData.status !== 'confirmed') {
      throw new HttpsError(
        'failed-precondition',
        'Solo se puede generar una sala de Google Meet para abonos con pago confirmado.'
      );
    }

    const lessonIdsFromBooking: string[] = Array.isArray(bookingData.lessonIds)
      ? bookingData.lessonIds.filter((id: any) => typeof id === 'string' && id.trim() !== '')
      : [];

    // Idempotencia por bookingId: si el abono ya posee meetUrl válida, no volver a llamar a Google Meet API
    if (isValidMeetUrl(bookingData.meetUrl)) {
      return {
        mode: 'already_provisioned' as const,
        existingMeetUrl: bookingData.meetUrl.trim(),
        existingMeetSpaceName:
          typeof bookingData.meetSpaceName === 'string' && bookingData.meetSpaceName.trim()
            ? bookingData.meetSpaceName.trim()
            : null,
        existingProvisioningStatus: bookingData.meetProvisioningStatus || null,
        lessonIdsFromBooking,
      };
    }

    // Protección ante respuestas inciertas previas: NO reintentar creación ciega de otra sala
    if (bookingData.meetProvisioningStatus === 'uncertain') {
      throw new HttpsError(
        'failed-precondition',
        'La creación anterior de Google Meet para este abono quedó en estado incierto (posible timeout o error de red). Para evitar salas duplicadas, el reintento automático está bloqueado.'
      );
    }

    // Protección de concurrencia persistente
    const nowMs = nowMsFn();
    const lockExpMs =
      typeof bookingData.meetLockExpiresAt === 'number' ? bookingData.meetLockExpiresAt : 0;
    if (bookingData.meetProvisioningStatus === 'creating' && lockExpMs > nowMs) {
      throw new HttpsError(
        'aborted',
        'Ya hay una solicitud en curso generando la sala de Google Meet para este abono. Esperá unos segundos y verificá nuevamente.'
      );
    }

    if (!cleanToken) {
      throw new HttpsError(
        'invalid-argument',
        'Se requiere autorización OAuth de Google Meet (meetAccessToken) para generar la sala.'
      );
    }

    transaction.set(
      bookingRef,
      {
        meetProvisioningStatus: 'creating',
        meetLockOwnerToken: lockOwnerToken,
        meetLockExpiresAt: nowMs + lockTtlMs,
        meetProvisioningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meetLastError: null,
      },
      { merge: true }
    );

    return {
      mode: 'create_required' as const,
      lessonIdsFromBooking,
    };
  });

  // =========================================================================
  // RAMA IDEMPOTENTE: Abono ya tenía meetUrl -> curar lecciones faltantes
  // =========================================================================
  if (tx1Result.mode === 'already_provisioned') {
    const allLessonIds = Array.from(
      new Set([
        ...tx1Result.lessonIdsFromBooking,
        ...linkedLessonsSnap.docs.map((d) => d.id),
      ])
    );

    const updatedLessonsCount = await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      const lessonRefs = allLessonIds.map((lid) => db.doc(`lessons/${lid}`));
      const lessonSnaps = await Promise.all(lessonRefs.map((ref) => transaction.get(ref)));

      let healedCount = 0;
      if (bookingSnap.exists && bookingSnap.data()?.meetProvisioningStatus !== 'ready') {
        transaction.set(
          bookingRef,
          {
            meetProvisioningStatus: 'ready',
            meetLockOwnerToken: null,
            meetLockExpiresAt: null,
            meetLastError: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      for (let i = 0; i < lessonRefs.length; i++) {
        const lSnap = lessonSnaps[i];
        if (!lSnap.exists) continue;
        const lData = lSnap.data()!;
        if (lData.status === 'cancelled' || lData.status === 'expired') continue;

        const needsUrlSync =
          lData.meetUrl !== tx1Result.existingMeetUrl ||
          (tx1Result.existingMeetSpaceName !== null &&
            lData.meetSpaceName !== tx1Result.existingMeetSpaceName);

        if (needsUrlSync) {
          transaction.set(
            lessonRefs[i],
            {
              meetUrl: tx1Result.existingMeetUrl,
              meetSpaceName: tx1Result.existingMeetSpaceName,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          healedCount++;
        }
      }

      return healedCount;
    });

    return {
      success: true,
      bookingId: sanitizedBookingId,
      meetUrl: tx1Result.existingMeetUrl,
      meetSpaceName: tx1Result.existingMeetSpaceName,
      updatedLessonsCount,
      alreadyProvisioned: true,
      message:
        updatedLessonsCount > 0
          ? 'El abono ya tenía una sala Google Meet asignada; se completó su sincronización en las clases faltantes.'
          : 'El abono ya cuenta con su sala única de Google Meet asignada.',
    };
  }

  // =========================================================================
  // LLAMADA EXTERNA A GOOGLE MEET REST API v2 (SIEMPRE FUERA DE TRANSACCIÓN)
  // =========================================================================
  let createdSpace: MeetSpaceCreationResult;
  try {
    createdSpace = await createMeetSpaceFn(cleanToken);
    if (!createdSpace || !isValidMeetUrl(createdSpace.meetUrl)) {
      throw new MeetApiCallError(
        'La creación de Google Meet devolvió una URL inválida o vacía.',
        'uncertain'
      );
    }
  } catch (apiErr: any) {
    const classification: 'definitive_failure' | 'uncertain' =
      apiErr instanceof MeetApiCallError
        ? apiErr.classification
        : apiErr?.classification === 'definitive_failure'
        ? 'definitive_failure'
        : 'uncertain';

    const httpStatus = apiErr?.httpStatus;
    const safeErrorMessage = String(apiErr?.message || 'Error al comunicarse con Google Meet API')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .slice(0, 300);

    // Liberar o marcar estado incierto verificando propiedad del lock
    try {
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(bookingRef);
        if (!snap.exists) return;
        const data = snap.data()!;
        if (data.meetLockOwnerToken !== lockOwnerToken) return;
        if (isValidMeetUrl(data.meetUrl)) return;

        transaction.set(
          bookingRef,
          {
            meetProvisioningStatus: classification === 'uncertain' ? 'uncertain' : 'failed',
            meetLockOwnerToken: null,
            meetLockExpiresAt: null,
            meetLastError: safeErrorMessage,
            meetProvisioningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (cleanupErr) {
      console.error('Error al actualizar estado de lock Meet tras fallo:', cleanupErr);
    }

    if (classification === 'uncertain') {
      throw new HttpsError(
        'deadline-exceeded',
        'No se pudo confirmar si Google Meet creó la sala debido a un timeout o error incierto. Para evitar salas duplicadas, no se reintentará automáticamente.'
      );
    }

    if (httpStatus === 401 || httpStatus === 403) {
      throw new HttpsError(
        'unauthenticated',
        'La autorización OAuth de Google Meet venció o no tiene permisos suficientes. Autorizá nuevamente con tu cuenta de Google.'
      );
    }

    if (httpStatus === 400) {
      throw new HttpsError('invalid-argument', safeErrorMessage);
    }

    throw new HttpsError(
      'unavailable',
      'Google Meet API no pudo crear la sala en este momento. Podés reintentar nuevamente.'
    );
  }

  const finalMeetUrl = createdSpace.meetUrl.trim();
  const finalMeetSpaceName =
    typeof createdSpace.meetSpaceName === 'string' && createdSpace.meetSpaceName.trim()
      ? createdSpace.meetSpaceName.trim()
      : null;

  // =========================================================================
  // TRANSACCIÓN 2: Persistencia atómica en booking + todas sus lessons
  // (SIN modificar campos de pago, fechas, horarios ni reservas)
  // =========================================================================
  const allLessonIds = Array.from(
    new Set([
      ...tx1Result.lessonIdsFromBooking,
      ...linkedLessonsSnap.docs.map((d) => d.id),
    ])
  );

  try {
    const updatedLessonsCount = await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError('not-found', 'El abono mensual dejó de existir.');
      }

      const bookingData = bookingSnap.data()!;
      if (bookingData.status !== 'confirmed') {
        throw new HttpsError(
          'failed-precondition',
          'El estado del abono dejó de estar confirmado.'
        );
      }

      const lessonRefs = allLessonIds.map((lid) => db.doc(`lessons/${lid}`));
      const lessonSnaps = await Promise.all(lessonRefs.map((ref) => transaction.get(ref)));

      transaction.set(
        bookingRef,
        {
          meetUrl: finalMeetUrl,
          meetSpaceName: finalMeetSpaceName,
          meetProvisioningStatus: 'ready',
          meetLockOwnerToken: null,
          meetLockExpiresAt: null,
          meetLastError: null,
          meetProvisionedAt: admin.firestore.FieldValue.serverTimestamp(),
          meetProvisioningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      let count = 0;
      for (let i = 0; i < lessonRefs.length; i++) {
        const lSnap = lessonSnaps[i];
        if (!lSnap.exists) continue;
        const lData = lSnap.data()!;
        if (lData.status === 'cancelled' || lData.status === 'expired') continue;

        transaction.set(
          lessonRefs[i],
          {
            meetUrl: finalMeetUrl,
            meetSpaceName: finalMeetSpaceName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        count++;
      }

      return count;
    });

    return {
      success: true,
      bookingId: sanitizedBookingId,
      meetUrl: finalMeetUrl,
      meetSpaceName: finalMeetSpaceName,
      updatedLessonsCount,
      alreadyProvisioned: false,
      message: `Sala única de Google Meet creada y asignada a ${updatedLessonsCount} clase(s) del abono.`,
    };
  } catch (persistErr: any) {
    if (persistErr instanceof HttpsError) {
      throw persistErr;
    }

    // Resiliencia ante fallo parcial tras creación exitosa de la sala:
    // conservar meetUrl en monthlyBookings/{bookingId} para que el reintento propague a lessons sin recrear sala.
    try {
      await bookingRef.set(
        {
          meetUrl: finalMeetUrl,
          meetSpaceName: finalMeetSpaceName,
          meetProvisioningStatus: 'ready',
          meetLockOwnerToken: null,
          meetLockExpiresAt: null,
          meetLastError: 'partial_lesson_sync',
          meetProvisionedAt: admin.firestore.FieldValue.serverTimestamp(),
          meetProvisioningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (recoveryErr) {
      console.error('Error al resguardar meetUrl tras fallo parcial de sincronización:', recoveryErr);
    }

    throw new HttpsError(
      'internal',
      'La sala Google Meet se creó, pero ocurrió un error parcial al asignarla a las clases. Reintentá la sincronización para propagar la misma sala.'
    );
  }
}

/**
 * SUBBLOQUE 6B.5: Consulta pública sanitizada de disponibilidad del profesor
 * Devuelve únicamente los intervalos ocupados y fechas bloqueadas SIN studentId, SIN bookingId
 * ni datos privados, resolviendo el warning de permisos de teacherSlotLocks.
 */
export async function getTeacherPublicAvailabilityHelper(
  db: admin.firestore.Firestore,
  teacherId: string,
  month: string
): Promise<GetTeacherPublicAvailabilityResponse> {
  const sanitizedTeacherId = teacherId.trim();
  const sanitizedMonth = month.trim();

  const { now: nowServer } = getBuenosAiresNow();
  const [yearStr, monthNumStr] = sanitizedMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // 1. Excepciones de calendario
  const exceptionsSnap = await db
    .collection('teacherScheduleExceptions')
    .where('teacherId', '==', sanitizedTeacherId)
    .get();

  const blockedDates: string[] = [];

  exceptionsSnap.docs.forEach((docSnap) => {
    const ex = docSnap.data();
    if (ex.type === 'blocked_date' || ex.type === 'vacation') {
      for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (ex.startDate <= dStr && dStr <= ex.endDate) {
          if (!blockedDates.includes(dStr)) blockedDates.push(dStr);
        }
      }
    }
  });

  // 2. Consultar teacherDailySchedule para cada día del mes
  const occupiedIntervals: SanitizedOccupiedInterval[] = [];

  const datePromises = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const schedRef = db.doc(`teacherDailySchedule/${sanitizedTeacherId}_${dStr}`);
    datePromises.push(schedRef.get().then((snap) => ({ date: dStr, snap })));
  }

  const results = await Promise.all(datePromises);

  for (const { date: dStr, snap } of results) {
    if (!snap.exists) continue;
    const intervals: DailyIntervalSlot[] = snap.data()?.intervals || [];

    for (const slot of intervals) {
      if (slot.status === 'cancelled' || slot.status === 'expired') {
        continue;
      }

      // Si es un abono pendiente que ya superó las 24 horas, queda liberado
      if (
        slot.status === 'pending_payment_confirmation' &&
        slot.expiresAt &&
        new Date(slot.expiresAt).getTime() <= nowServer.getTime()
      ) {
        continue;
      }

      occupiedIntervals.push({
        date: dStr,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  // 3. Consultar clases individuales en 'lessons'
  const lessonsSnap = await db
    .collection('lessons')
    .where('teacherId', '==', sanitizedTeacherId)
    .get();

  for (const docSnap of lessonsSnap.docs) {
    const l = docSnap.data();
    if (l.status === 'cancelled' || l.status === 'expired') continue;

    if (l.paymentStatus === 'pending_confirmation' && l.monthlyBookingId) {
      if (l.expiresAt?.toDate && l.expiresAt.toDate().getTime() <= nowServer.getTime()) {
        continue;
      }
    }

    let lDateStr = '';
    let lTimeStr = l.startTime || '';
    if (typeof l.date === 'string') {
      lDateStr = l.date.substring(0, 10);
    } else if (l.date?.toDate) {
      const d = l.date.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      lDateStr = `${y}-${m}-${day}`;
      if (!lTimeStr) {
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        lTimeStr = `${h}:${min}`;
      }
    }

    if (lDateStr.startsWith(sanitizedMonth) && lTimeStr) {
      const duration = l.duration || 45;
      const endTime = calculateEndTime(lTimeStr, duration);

      const alreadyReported = occupiedIntervals.some(
        (o) => o.date === lDateStr && o.startTime === lTimeStr
      );
      if (!alreadyReported) {
        occupiedIntervals.push({
          date: lDateStr,
          startTime: lTimeStr,
          endTime,
        });
      }
    }
  }

  return {
    teacherId: sanitizedTeacherId,
    month: sanitizedMonth,
    occupiedIntervals,
    blockedDates,
  };
}

/**
 * Realiza la expiración atómica e idempotente de un abono mensual específico
 * y libera todos sus horarios en lessons, teacherDailySchedule y teacherSlotLocks.
 */
export async function expireSingleBookingDocument(
  db: admin.firestore.Firestore,
  bookingId: string
): Promise<{ success: boolean; reason?: string; bookingId: string }> {
  const sanitizedBookingId = bookingId.trim();
  const bookingRef = db.doc(`monthlyBookings/${sanitizedBookingId}`);

  // Consultar lecciones vinculadas
  const linkedLessonsSnap = await db
    .collection('lessons')
    .where('monthlyBookingId', '==', sanitizedBookingId)
    .get();

  return await db.runTransaction(async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists && linkedLessonsSnap.empty) {
      return { success: false, reason: 'not_found', bookingId: sanitizedBookingId };
    }

    const bookingData = bookingSnap.exists ? bookingSnap.data()! : null;

    // Regla de seguridad crítica: NUNCA expirar un abono ya confirmado
    if (bookingData?.status === 'confirmed') {
      return { success: false, reason: 'already_confirmed', bookingId: sanitizedBookingId };
    }

    const teacherId = bookingData?.teacherId || (linkedLessonsSnap.docs[0]?.data()?.teacherId ?? '');
    const occurrences: ProjectedClassOccurrence[] = bookingData?.occurrences || [];
    const uniqueDates = Array.from(
      new Set([
        ...occurrences.map((o: any) => o.date).filter(Boolean),
        ...linkedLessonsSnap.docs.map((d) => {
          const lData = d.data();
          if (typeof lData.date === 'string') return lData.date.substring(0, 10);
          if (lData.date?.toDate) {
            const dt = lData.date.toDate();
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
              dt.getDate()
            ).padStart(2, '0')}`;
          }
          return '';
        }).filter(Boolean),
      ])
    );

    // 1. Lecturas previas
    // a. Lectura de teacherDailySchedule
    const schedDocs: Record<
      string,
      { ref: admin.firestore.DocumentReference; intervals: DailyIntervalSlot[] }
    > = {};
    if (teacherId) {
      for (const dStr of uniqueDates) {
        const schedRef = db.doc(`teacherDailySchedule/${teacherId}_${dStr}`);
        const schedSnap = await transaction.get(schedRef);
        schedDocs[dStr] = {
          ref: schedRef,
          intervals: schedSnap.exists ? (schedSnap.data()?.intervals || []) : [],
        };
      }
    }

    // b. Lecturas previas de teacherSlotLocks (estricto Firestore: todas las lecturas ANTES de escrituras)
    const slotLockSnaps: {
      ref: admin.firestore.DocumentReference;
      snap: admin.firestore.DocumentSnapshot;
    }[] = [];
    if (teacherId) {
      for (const occ of occurrences) {
        if (occ.date && occ.startTime) {
          const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
          const lockRef = db.doc(`teacherSlotLocks/${lockKey}`);
          const lockSnap = await transaction.get(lockRef);
          slotLockSnaps.push({ ref: lockRef, snap: lockSnap });
        }
      }
    }

    // 2. Escrituras
    // a. Marcar el abono como expired en monthlyBookings
    if (bookingSnap.exists) {
      transaction.set(
        bookingRef,
        {
          status: 'expired',
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // b. Marcar todas las lecciones del abono como expired para que no bloqueen horarios ni aparezcan como pendientes
    for (const lDoc of linkedLessonsSnap.docs) {
      const lData = lDoc.data();
      if (lData.paymentStatus !== 'confirmed') {
        transaction.set(
          lDoc.ref,
          {
            status: 'expired',
            paymentStatus: 'expired',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    // c. Actualizar los intervalos de teacherDailySchedule a expired
    if (teacherId) {
      for (const dStr of uniqueDates) {
        const sched = schedDocs[dStr];
        if (!sched) continue;
        const updated = sched.intervals.map((slot) => {
          if (slot.bookingId === sanitizedBookingId && slot.status !== 'confirmed') {
            return {
              ...slot,
              status: 'expired' as const,
            };
          }
          return slot;
        });
        transaction.set(
          sched.ref,
          {
            intervals: updated,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    // d. Liberar los cerrojos de teacherSlotLocks SOLO SI pertenecen a este abono
    // Si otro alumno reservó el horario tras expirar, su nuevo cerrojo se preserva intacto.
    for (const { ref: lockRef, snap: lockSnap } of slotLockSnaps) {
      if (lockSnap.exists) {
        const lockData = lockSnap.data();
        if (lockData && lockData.bookingId === sanitizedBookingId) {
          transaction.delete(lockRef);
        }
      }
    }

    return { success: true, bookingId: sanitizedBookingId };
  });
}

/**
 * Procesa la expiración automática de abonos mensuales pendientes de pago
 * que hayan superado las 24 horas.
 *
 * Características:
 * - Idempotente: puede ejecutarse repetidamente sin efectos secundarios.
 * - Concurrencia segura: cada abono se procesa en una transacción independiente.
 * - Preserva confirmados: nunca toca abonos o lecciones confirmadas.
 */
export async function expireMonthlyBookingsBatch(
  db: admin.firestore.Firestore,
  targetBookingId?: string
): Promise<ExpireMonthlyBookingsResponse> {
  const { now: nowServer } = getBuenosAiresNow();
  const nowMs = nowServer.getTime();

  let candidateBookings: { id: string; expiresAt?: any; status: string }[] = [];

  if (targetBookingId && typeof targetBookingId === 'string' && targetBookingId.trim()) {
    const docSnap = await db.doc(`monthlyBookings/${targetBookingId.trim()}`).get();
    if (docSnap.exists) {
      candidateBookings.push({ id: docSnap.id, ...docSnap.data() } as any);
    }
  } else {
    // Consultar todos los abonos en estado pendiente
    const q1 = await db
      .collection('monthlyBookings')
      .where('status', 'in', [
        'pending_payment_confirmation',
        'pending_payment',
        'pending_confirmation',
        'pending',
      ])
      .get();

    candidateBookings = q1.docs.map((d) => ({ id: d.id, ...d.data() } as any));
  }

  const expiredBookingIds: string[] = [];

  for (const b of candidateBookings) {
    if (b.status === 'confirmed' || b.status === 'cancelled') {
      continue;
    }

    let isExpired = false;
    if (b.expiresAt) {
      const expMs = b.expiresAt?.toDate
        ? b.expiresAt.toDate().getTime()
        : new Date(b.expiresAt).getTime();
      if (!isNaN(expMs) && expMs <= nowMs) {
        isExpired = true;
      }
    }

    if (isExpired || b.status === 'expired') {
      try {
        const res = await expireSingleBookingDocument(db, b.id);
        if (res.success) {
          expiredBookingIds.push(b.id);
        }
      } catch (err) {
        console.error(`Error al expirar abono ${b.id}:`, err);
      }
    }
  }

  return {
    success: true,
    totalChecked: candidateBookings.length,
    expiredCount: expiredBookingIds.length,
    expiredBookingIds,
    message: `Proceso de expiración completado. ${expiredBookingIds.length} abono(s) expirado(s) y horarios liberados.`,
  };
}

