/**
 * Lógica transaccional y de validación en servidor para abonos mensuales
 * SUBBLOQUE 6B.3.3: Creación atómica de reservas mensuales
 */

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

/**
 * Valida si una URL de Google Meet tiene un formato estructural válido.
 */
function isValidMeetUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('https://meet.google.com/') && trimmed.length > 24;
}

/**
 * SUBBLOQUE 6B.5: Confirmación de pago del abono mensual por el profesor
 * Realiza la transición atómica:
 * - monthlyBookings: 'pending_payment_confirmation' -> 'confirmed'
 * - lessons: paymentStatus 'pending_confirmation' -> 'confirmed', vinculando Google Meet permanente
 * - teacherDailySchedule: intervalos 'pending_payment_confirmation' -> 'confirmed' (sin expiresAt)
 * - teacherSlotLocks: expiresAt -> null
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

  // Consultar configuración de Google Meet del profesor
  let resolvedMeetUrl: string | null = null;
  let resolvedMeetSpaceName: string | null = null;
  try {
    const meetConfigSnap = await db
      .doc(`users/${authenticatedTeacherId}/privateSettings/meetConfig`)
      .get();
    if (meetConfigSnap.exists) {
      const md = meetConfigSnap.data();
      if (md && isValidMeetUrl(md.permanentMeetUrl)) {
        resolvedMeetUrl = md.permanentMeetUrl;
        resolvedMeetSpaceName = md.permanentMeetSpaceName || null;
      }
    }
  } catch (err) {
    console.warn('Advertencia al consultar meetConfig para confirmación:', err);
  }

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
    transaction.set(
      bookingRef,
      {
        ...bookingData,
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const lessonIds: string[] = Array.from(
      new Set([
        ...(Array.isArray(bookingData.lessonIds) ? bookingData.lessonIds : []),
        ...(linkedLessonsSnap ? linkedLessonsSnap.docs.map((d) => d.id) : []),
      ])
    );

    for (const lid of lessonIds) {
      const lRef = db.doc(`lessons/${lid}`);
      transaction.set(
        lRef,
        {
          paymentStatus: 'confirmed',
          status: 'scheduled',
          meetUrl: resolvedMeetUrl || null,
          meetSpaceName: resolvedMeetSpaceName || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
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

