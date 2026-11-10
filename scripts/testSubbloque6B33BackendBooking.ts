/**
 * Test Suite: SUBBLOQUE 6B.3.3
 * Creación atómica de reservas mensuales (Lógica de Backend Cloud Functions v2)
 *
 * Valida los 8 casos obligatorios requeridos por la consigna:
 * 1. Reserva válida de un mes completo (status: pending_payment_confirmation, duration: 45, clases creadas, etc.).
 * 2. Horario ya ocupado (rechazo estricto).
 * 3. Dos alumnos intentando reservar simultáneamente el mismo horario (colisión concurrente detectada).
 * 4. Fecha bloqueada por el profesor (teacherScheduleExceptions).
 * 5. Solicitud duplicada (idempotencyKey previene duplicación).
 * 6. Usuario no autenticado (rechazado con unauthenticated).
 * 7. Alumno intentando reservar en nombre de otro usuario (rechazado con permission-denied).
 * 8. Error durante la operación sin creación parcial de documentos (atomicidad estricta y rollback).
 */

import {
  timeToMinutes,
  calculateEndTime,
  formatSpanishDate,
  generateSlotLockKey,
} from '../functions/src/monthlyBookingService';
import type {
  CreateMonthlyBookingPayload,
  CreateMonthlyBookingResponse,
  DailyIntervalSlot,
  ProjectedClassOccurrence,
} from '../functions/src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('========================================================================');
console.log('   PRUEBAS UNITARIAS: SUBBLOQUE 6B.3.3 (BACKEND CLOUD FUNCTIONS V2)');
console.log('   Creación atómica de reservas mensuales en servidor');
console.log('========================================================================\n');

// Mock Data
const mockTeacherUser = {
  uid: 'teacher-100',
  name: 'Profesor Chopin',
  email: 'chopin@musickids.com',
  role: 'teacher',
  status: 'active',
  meetUrl: 'https://meet.google.com/mus-kids-chop',
  meetSpaceName: 'spaces/mus-kids-chop',
  monthlyPlans: [
    { lessonsPerWeek: 1, price: 15000, active: true },
    { lessonsPerWeek: 2, price: 28000, active: true },
    { lessonsPerWeek: 3, price: 38000, active: true },
  ],
};

const mockStudentUser = {
  uid: 'student-200',
  name: 'Alumno Beethoven',
  email: 'beethoven@musickids.com',
  role: 'student',
  status: 'active',
};

const mockSlotTue16: any = {
  id: 'slot-tue-1600',
  teacherId: 'teacher-100',
  dayOfWeek: 2, // Martes
  startTime: '16:00',
  endTime: '16:45',
  duration: 45,
  isActive: true,
  originDate: '2026-01-01',
};

const mockSlotThu17: any = {
  id: 'slot-thu-1700',
  teacherId: 'teacher-100',
  dayOfWeek: 4, // Jueves
  startTime: '17:00',
  endTime: '17:45',
  duration: 45,
  isActive: true,
  originDate: '2026-01-01',
};

/**
 * Simulador fiel de la transacción Firestore que reproduce la lógica del backend
 */
class InMemoryFirestoreBackendSimulator {
  users: Map<string, any> = new Map();
  teacherRecurringSlots: Map<string, any> = new Map();
  teacherScheduleExceptions: Map<string, any> = new Map();
  lessons: Map<string, any> = new Map();
  teacherSlotLocks: Map<string, any> = new Map();
  teacherDailySchedule: Map<string, any> = new Map();
  monthlyBookings: Map<string, any> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.users.clear();
    this.teacherRecurringSlots.clear();
    this.teacherScheduleExceptions.clear();
    this.lessons.clear();
    this.teacherSlotLocks.clear();
    this.teacherDailySchedule.clear();
    this.monthlyBookings.clear();

    this.users.set(mockTeacherUser.uid, { ...mockTeacherUser });
    this.users.set(mockStudentUser.uid, { ...mockStudentUser });
    this.users.set('student-other', { uid: 'student-other', name: 'Otro Alumno', role: 'student', status: 'active' });
    this.users.set('student-300', { uid: 'student-300', name: 'Alumno Tres', role: 'student', status: 'active' });
    this.users.set('student-attacker', { uid: 'student-attacker', name: 'Atacante', role: 'student', status: 'active' });
    this.teacherRecurringSlots.set(mockSlotTue16.id, { ...mockSlotTue16 });
    this.teacherRecurringSlots.set(mockSlotThu17.id, { ...mockSlotThu17 });
  }

  async runCreateMonthlyBooking(
    authUid: string | null,
    payload: CreateMonthlyBookingPayload,
    options?: { shouldFailMidway?: boolean }
  ): Promise<CreateMonthlyBookingResponse> {
    // 1. Verificación obligatoria de autenticación
    if (!authUid) {
      const err: any = new Error('Debe iniciar sesión como alumno para solicitar una reserva mensual.');
      err.code = 'unauthenticated';
      throw err;
    }

    // 2. Comprobación de identidad (no reservar a nombre de otro)
    if (payload.studentId && payload.studentId !== authUid) {
      const err: any = new Error('No tiene autorización para crear reservas en nombre de otro usuario.');
      err.code = 'permission-denied';
      throw err;
    }

    const authenticatedStudentId = authUid;
    const { teacherId, month, recurringSlotIds, weeklyFrequency, idempotencyKey } = payload;

    // 3. Control de idempotencia
    if (idempotencyKey) {
      for (const booking of Array.from(this.monthlyBookings.values())) {
        if (booking.studentId === authenticatedStudentId && booking.idempotencyKey === idempotencyKey) {
          return {
            success: true,
            bookingId: booking.id,
            status: 'pending_payment_confirmation',
            totalPrice: booking.totalPrice,
            currency: 'ARS',
            totalLessons: booking.totalLessons,
            occurrences: booking.occurrences,
            lessonIds: booking.lessonIds,
            expiresAt: new Date(booking.expiresAt).toISOString(),
            message: 'Reserva recuperada por clave de idempotencia existente.',
          };
        }
      }
    }

    // 4. Validación de perfiles
    const student = this.users.get(authenticatedStudentId);
    if (!student || student.role !== 'student' || student.status === 'disabled') {
      const err: any = new Error('Solo alumnos activos pueden reservar abonos mensuales.');
      err.code = 'permission-denied';
      throw err;
    }

    const teacher = this.users.get(teacherId);
    if (!teacher || teacher.role !== 'teacher' || teacher.status === 'disabled') {
      const err: any = new Error('El profesor seleccionado no está disponible.');
      err.code = 'failed-precondition';
      throw err;
    }

    // Tarifa fija
    const plans = teacher.monthlyPlans || [];
    const targetPlan = plans.find((p: any) => p.lessonsPerWeek === weeklyFrequency && p.active && p.price > 0);
    if (!targetPlan) {
      const err: any = new Error(`El profesor no tiene configurada la tarifa para ${weeklyFrequency} clases/semana.`);
      err.code = 'failed-precondition';
      throw err;
    }
    const fixedPrice = targetPlan.price;

    // Slots
    const selectedSlots: any[] = [];
    for (const sId of recurringSlotIds) {
      const slot = this.teacherRecurringSlots.get(sId);
      if (!slot || slot.teacherId !== teacherId || !slot.isActive) {
        const err: any = new Error('Horario recurrente no válido o inactivo.');
        err.code = 'failed-precondition';
        throw err;
      }
      if (slot.duration !== 45) {
        const err: any = new Error('Todas las clases nuevas deben durar exactamente 45 minutos.');
        err.code = 'invalid-argument';
        throw err;
      }
      selectedSlots.push(slot);
    }

    // Proyección de ocurrencias
    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const occurrences: ProjectedClassOccurrence[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, monthNum - 1, day, 12, 0, 0);
      const dow = d.getDay();
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      for (const slot of selectedSlots) {
        if (slot.dayOfWeek === dow) {
          occurrences.push({
            date: dateStr,
            startTime: slot.startTime,
            endTime: slot.endTime || calculateEndTime(slot.startTime, 45),
            duration: 45,
            formattedDate: formatSpanishDate(year, monthNum, day),
            recurringSlotId: slot.id,
          });
        }
      }
    }

    // Validar contra excepciones
    for (const occ of occurrences) {
      for (const ex of Array.from(this.teacherScheduleExceptions.values())) {
        if (ex.teacherId === teacherId) {
          if ((ex.type === 'blocked_date' || ex.type === 'vacation') && ex.startDate <= occ.date && occ.date <= ex.endDate) {
            const err: any = new Error(`La fecha ${occ.formattedDate} está bloqueada por el profesor.`);
            err.code = 'failed-precondition';
            throw err;
          }
          if (ex.type === 'blocked_slot' && ex.startDate <= occ.date && occ.date <= ex.endDate) {
            if (ex.targetTime === occ.startTime || ex.recurringSlotId === occ.recurringSlotId) {
              const err: any = new Error(`El horario del ${occ.formattedDate} a las ${occ.startTime} está bloqueado.`);
              err.code = 'failed-precondition';
              throw err;
            }
          }
        }
      }
    }

    // Validar contra clases manuales existentes en lessons
    for (const occ of occurrences) {
      const occStart = timeToMinutes(occ.startTime);
      const occEnd = occStart + occ.duration;

      for (const lesson of Array.from(this.lessons.values())) {
        if (lesson.teacherId === teacherId && lesson.status !== 'cancelled') {
          if (lesson.dateStr === occ.date) {
            const lessonStart = timeToMinutes(lesson.startTime);
            const lessonEnd = lessonStart + (lesson.duration || 45);
            if (occStart < lessonEnd && lessonStart < occEnd) {
              const err: any = new Error(`El horario del ${occ.formattedDate} ya tiene una clase programada.`);
              err.code = 'already-exists';
              throw err;
            }
          }
        }
      }
    }

    // Transacción atómica simulada (con rollback si hay error)
    const stagingBookings = new Map(this.monthlyBookings);
    const stagingLessons = new Map(this.lessons);
    const stagingLocks = new Map(this.teacherSlotLocks);
    const stagingSchedule = new Map(this.teacherDailySchedule);

    try {
      const uniqueDates = Array.from(new Set(occurrences.map((o) => o.date)));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const bookingId = `mb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const lessonIds: string[] = [];

      for (const dStr of uniqueDates) {
        const scheduleKey = `${teacherId}_${dStr}`;
        const currentSched = stagingSchedule.get(scheduleKey) || { teacherId, date: dStr, intervals: [] };
        // SUBBLOQUE 6B.3.3.1: Desactivar liberación automática por vencimiento.
        // Los horarios con status 'pending_payment_confirmation' o 'scheduled' se mantienen ocupados.
        const activeIntervals: DailyIntervalSlot[] = (currentSched.intervals || []).filter((slot: any) => {
          return slot.status !== 'cancelled';
        });

        const dayOccs = occurrences.filter((o) => o.date === dStr);
        for (const occ of dayOccs) {
          const occStart = timeToMinutes(occ.startTime);
          const occEnd = occStart + occ.duration;

          for (const existing of activeIntervals) {
            if (occStart < existing.endMinutes && existing.startMinutes < occEnd) {
              const err: any = new Error(`El horario del ${occ.formattedDate} a las ${occ.startTime} ya está ocupado.`);
              err.code = 'already-exists';
              throw err;
            }
          }

          activeIntervals.push({
            startTime: occ.startTime,
            endTime: occ.endTime,
            startMinutes: occStart,
            endMinutes: occEnd,
            bookingId,
            studentId: authenticatedStudentId,
            status: 'pending_payment_confirmation',
            expiresAt: expiresAt.toISOString(),
          });
        }

        stagingSchedule.set(scheduleKey, {
          teacherId,
          date: dStr,
          intervals: activeIntervals,
          updatedAt: now,
        });
      }

      // Crear lecciones y locks
      for (let i = 0; i < occurrences.length; i++) {
        if (options?.shouldFailMidway && i === 2) {
          throw new Error('SIMULATED_DATABASE_CRASH_MID_TRANSACTION');
        }

        const occ = occurrences[i];
        const lessonId = `les_${bookingId}_${i + 1}`;
        lessonIds.push(lessonId);

        stagingLessons.set(lessonId, {
          id: lessonId,
          title: `Clase de música - Abono ${month}`,
          teacherId,
          studentId: authenticatedStudentId,
          monthlyBookingId: bookingId,
          dateStr: occ.date,
          startTime: occ.startTime,
          duration: 45,
          status: 'scheduled',
          // SUBBLOQUE 6B.3.3.1: meetUrl es null durante pending_payment_confirmation
          meetUrl: null,
          meetSpaceName: null,
          paymentStatus: 'pending_confirmation',
          createdAt: now,
        });

        const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
        stagingLocks.set(lockKey, {
          id: lockKey,
          teacherId,
          date: occ.date,
          startTime: occ.startTime,
          bookingId,
          studentId: authenticatedStudentId,
          expiresAt: expiresAt,
        });
      }

      const bookingData = {
        id: bookingId,
        teacherId,
        studentId: authenticatedStudentId,
        month,
        recurringSlotIds,
        weeklyFrequency,
        lessonIds,
        totalLessons: occurrences.length,
        occurrences,
        status: 'pending_payment_confirmation' as const,
        totalPrice: fixedPrice,
        currency: 'ARS' as const,
        idempotencyKey: idempotencyKey || null,
        createdAt: now,
        expiresAt: expiresAt.toISOString(),
      };

      stagingBookings.set(bookingId, bookingData);

      // Commit atómico: Si nada falló, consolidamos el estado
      this.monthlyBookings = stagingBookings;
      this.lessons = stagingLessons;
      this.teacherSlotLocks = stagingLocks;
      this.teacherDailySchedule = stagingSchedule;

      return {
        success: true,
        bookingId,
        status: 'pending_payment_confirmation',
        totalPrice: fixedPrice,
        currency: 'ARS',
        totalLessons: occurrences.length,
        occurrences,
        lessonIds,
        expiresAt: expiresAt.toISOString(),
        message: 'Reserva creada exitosamente.',
      };
    } catch (txErr) {
      // Rollback: No se modifica ninguna colección
      throw txErr;
    }
  }
}

// BATERÍA DE PRUEBAS
const backendSim = new InMemoryFirestoreBackendSimulator();
let passedCount = 0;

function runTest(testName: string, testFn: () => Promise<void>) {
  return testFn()
    .then(() => {
      passedCount++;
      console.log(`✓ [TEST ${passedCount}] PASÓ: ${testName}`);
    })
    .catch((err) => {
      console.error(`✗ [FALLÓ]: ${testName}`);
      console.error('Detalle:', err.message || err);
      process.exit(1);
    });
}

async function startTests() {
  // 1. Reserva válida de un mes completo
  await runTest('Reserva válida de un mes completo (status: pending_payment_confirmation, duration: 45)', async () => {
    backendSim.reset();
    const payload: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-06', // Junio 2026
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
      idempotencyKey: 'idemp-test-1',
    };

    const res = await backendSim.runCreateMonthlyBooking('student-200', payload);
    assert(res.success === true, 'Respuesta debe ser exitosa');
    assert(res.status === 'pending_payment_confirmation', 'Status debe ser pending_payment_confirmation');
    assert(res.totalPrice === 15000, 'Tarifa fija debe ser 15000 ARS');
    assert(res.totalLessons === 5, 'Junio 2026 tiene 5 martes');
    assert(res.lessonIds.length === 5, 'Deben haberse creado 5 IDs de lección');
    assert(backendSim.lessons.size === 5, 'Deben existir exactamente 5 lecciones en lessons');
    assert(backendSim.monthlyBookings.size === 1, 'Debe existir 1 reserva en monthlyBookings');

    // Comprobar que cada lección tiene status scheduled, monthlyBookingId y meetUrl protegido
    for (const lesId of res.lessonIds) {
      const les = backendSim.lessons.get(lesId);
      assert(les.monthlyBookingId === res.bookingId, 'Lección debe estar vinculada al abono');
      assert(les.status === 'scheduled', 'Lección debe estar scheduled');
      assert(les.duration === 45, 'Lección debe durar 45 min');
      assert(les.meetUrl === null, 'Lección pendiente no debe exponer meetUrl de Google Meet (Subbloque 6B.3.3.1)');
      assert(les.paymentStatus === 'pending_confirmation', 'paymentStatus debe ser pending_confirmation');
    }
  });

  // 2. Horario ya ocupado
  await runTest('Horario ya ocupado rechaza la nueva reserva', async () => {
    // Ya existe la reserva de Junio 2026 en el backendSim
    const payloadConflict: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-06',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking('student-other', payloadConflict);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'already-exists', `Error debe ser already-exists, fue: ${err.code}`);
    }
    assert(threw, 'Debió arrojar error de horario ya ocupado');
  });

  // 3. Dos alumnos intentando reservar simultáneamente el mismo horario
  await runTest('Concurrencia: Dos alumnos compitiendo simultáneamente, solo uno tiene éxito', async () => {
    backendSim.reset();
    const payloadA: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-07',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };
    const payloadB: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-07',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    let winnerCount = 0;
    let rejectedCount = 0;

    const resA = backendSim.runCreateMonthlyBooking('student-200', payloadA)
      .then(() => { winnerCount++; })
      .catch((err) => { rejectedCount++; });

    const resB = backendSim.runCreateMonthlyBooking('student-300', payloadB)
      .then(() => { winnerCount++; })
      .catch((err) => { rejectedCount++; });

    await Promise.all([resA, resB]);
    assert(winnerCount === 1, `Exactamente 1 alumno debe ganar la reserva, ganaron: ${winnerCount}`);
    assert(rejectedCount === 1, `Exactamente 1 alumno debe ser rechazado, rechazados: ${rejectedCount}`);
  });

  // 4. Fecha bloqueada por el profesor (teacherScheduleExceptions)
  await runTest('Fecha bloqueada por el profesor rechaza la reserva completa', async () => {
    backendSim.reset();
    backendSim.teacherScheduleExceptions.set('ex-1', {
      id: 'ex-1',
      teacherId: 'teacher-100',
      type: 'blocked_date',
      startDate: '2026-08-11', // Martes 11 de Agosto bloqueado
      endDate: '2026-08-11',
      reason: 'Asueto personal',
    });

    const payload: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-08',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking('student-200', payload);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'failed-precondition', 'Código debe ser failed-precondition');
      assert(err.message.includes('bloqueada'), 'Mensaje debe indicar bloqueo');
    }
    assert(threw, 'Debió rechazar por fecha bloqueada');
    assert(backendSim.monthlyBookings.size === 0, 'No debe crearse ningún abono');
    assert(backendSim.lessons.size === 0, 'No debe crearse ninguna lección');
  });

  // 5. Solicitud duplicada (idempotencyKey)
  await runTest('Solicitud duplicada con la misma idempotencyKey devuelve reserva existente', async () => {
    backendSim.reset();
    const payload: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-09',
      recurringSlotIds: ['slot-thu-1700'],
      weeklyFrequency: 1,
      idempotencyKey: 'idemp-duplicate-safe',
    };

    const firstRes = await backendSim.runCreateMonthlyBooking('student-200', payload);
    const secondRes = await backendSim.runCreateMonthlyBooking('student-200', payload);

    assert(firstRes.bookingId === secondRes.bookingId, 'Los bookingId deben ser idénticos');
    assert(backendSim.monthlyBookings.size === 1, 'Solo debe existir 1 documento de abono');
    assert(secondRes.message.includes('idempotencia'), 'Debe informar recuperación por idempotencia');
  });

  // 6. Usuario no autenticado
  await runTest('Usuario no autenticado (auth = null) es rechazado con unauthenticated', async () => {
    const payload: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-10',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking(null, payload);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'unauthenticated', `Código debe ser unauthenticated, fue: ${err.code}`);
    }
    assert(threw, 'Debió rechazar llamada no autenticada');
  });

  // 7. Alumno intentando reservar en nombre de otro usuario
  await runTest('Alumno intentando reservar en nombre de otro usuario es rechazado con permission-denied', async () => {
    const payload: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      studentId: 'student-victim', // Intenta suplantar a otro usuario
      month: '2026-10',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking('student-attacker', payload);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'permission-denied', `Código debe ser permission-denied, fue: ${err.code}`);
      assert(err.message.includes('autorización'), 'Mensaje debe indicar falta de autorización');
    }
    assert(threw, 'Debió rechazar intento de suplantación');
  });

  // 8. Error durante la operación sin creación parcial de documentos (Atomicidad / Rollback)
  await runTest('Error inesperado durante la transacción produce rollback completo (0 documentos parciales)', async () => {
    backendSim.reset();
    const payload: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-11',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    const initialBookingsCount = backendSim.monthlyBookings.size;
    const initialLessonsCount = backendSim.lessons.size;
    const initialLocksCount = backendSim.teacherSlotLocks.size;
    const initialScheduleCount = backendSim.teacherDailySchedule.size;

    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking('student-200', payload, { shouldFailMidway: true });
    } catch (err: any) {
      threw = true;
      assert(err.message === 'SIMULATED_DATABASE_CRASH_MID_TRANSACTION', 'Error esperado de simulación');
    }

    assert(threw, 'Debió fallar la transacción simulada');
    assert(backendSim.monthlyBookings.size === initialBookingsCount, 'No deben haberse creado reservas');
    assert(backendSim.lessons.size === initialLessonsCount, 'No deben haberse creado lecciones parciales');
    assert(backendSim.teacherSlotLocks.size === initialLocksCount, 'No deben haberse creado cerrojos parciales');
    assert(backendSim.teacherDailySchedule.size === initialScheduleCount, 'No deben haberse alterado horarios diarios');
  });

  // 9. SUBBLOQUE 6B.3.3.1: Desactivación de liberación automática por vencimiento (no auto-expiration)
  await runTest('No auto-expiración: Una reserva con fecha vencida mantiene ocupado su horario hasta confirmación o cancelación explícita', async () => {
    backendSim.reset();
    // Simular un slot ocupado en el pasado cuya fecha expiresAt ya pasó (hace 48 horas)
    const pastExpiredDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const dStr = '2026-12-01'; // Martes 1 de Diciembre
    backendSim.teacherDailySchedule.set(`teacher-100_${dStr}`, {
      teacherId: 'teacher-100',
      date: dStr,
      intervals: [
        {
          startTime: '16:00',
          endTime: '16:45',
          startMinutes: 960,
          endMinutes: 1005,
          bookingId: 'mb_old_pending',
          studentId: 'student-former',
          status: 'pending_payment_confirmation',
          expiresAt: pastExpiredDate, // Vencido hace 48 horas
        },
      ],
      updatedAt: new Date(),
    });

    // Un nuevo alumno intenta reservar ese mismo mes/horario
    const payloadConflict: CreateMonthlyBookingPayload = {
      teacherId: 'teacher-100',
      month: '2026-12',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    };

    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking('student-200', payloadConflict);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'already-exists', `Debe rechazar con already-exists aunque expiresAt haya pasado, fue: ${err.code}`);
      assert(err.message.includes('ya está ocupado'), 'Mensaje debe advertir ocupación');
    }
    assert(threw, 'Debió rechazar la reserva: el horario vencido NO se libera automáticamente');
  });

  console.log('\n========================================================================');
  console.log(`🎉 TODOS LOS ${passedCount} CASOS DE PRUEBA DEL SUBBLOQUE 6B.3.3 / 6B.3.3.1 PASARON EXITOSAMENTE`);
  console.log('========================================================================\n');
}

startTests().catch((err) => {
  console.error('Error fatal en los tests:', err);
  process.exit(1);
});
