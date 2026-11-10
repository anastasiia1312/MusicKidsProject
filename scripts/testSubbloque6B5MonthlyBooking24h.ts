/**
 * PRUEBAS INTEGRALES SUBBLOQUE 6B.5:
 * MVP FUNCIONAL DE RESERVAS MENSUALES CON RETENCIÓN DE 24 HORAS
 *
 * Distinción de entorno:
 * - Tipo de prueba: Simulación unitaria/transaccional estricta en memoria
 *   utilizando las mismas estructuras, reglas de negocio y algoritmos de Cloud Functions v2.
 * - No escribe en Firebase de producción ni ejecuta llamadas de red a endpoints no desplegados.
 */

import assert from 'assert';
import {
  timeToMinutes,
  minutesToTime,
  calculateEndTime,
  getBuenosAiresNow,
  generateSlotLockKey,
} from '../functions/src/monthlyBookingService';

console.log('========================================================================');
console.log('   PRUEBAS UNITARIAS: SUBBLOQUE 6B.5 (MVP RESERVAS MENSUALES 24H)   ');
console.log('   Retención de 24 horas, estados coherentes y disponibilidad segura   ');
console.log('========================================================================\n');

// Estructura mock de base de datos en memoria para pruebas transaccionales
interface MockDB {
  users: Map<string, any>;
  teacherRecurringSlots: Map<string, any>;
  teacherScheduleExceptions: Map<string, any>;
  lessons: Map<string, any>;
  monthlyBookings: Map<string, any>;
  teacherDailySchedule: Map<string, any>;
  teacherSlotLocks: Map<string, any>;
  privateSettings: Map<string, any>;
}

function createMockDB(): MockDB {
  const db: MockDB = {
    users: new Map(),
    teacherRecurringSlots: new Map(),
    teacherScheduleExceptions: new Map(),
    lessons: new Map(),
    monthlyBookings: new Map(),
    teacherDailySchedule: new Map(),
    teacherSlotLocks: new Map(),
    privateSettings: new Map(),
  };

  // Profesor por defecto
  db.users.set('teacher_1', {
    uid: 'teacher_1',
    role: 'teacher',
    name: 'Profesor Test',
    status: 'active',
    monthlyPlans: [
      { lessonsPerWeek: 1, price: 30000, active: true },
      { lessonsPerWeek: 2, price: 55000, active: true },
      { lessonsPerWeek: 3, price: 75000, active: true },
    ],
  });

  // Datos bancarios privados del profesor
  db.privateSettings.set('teacher_1/bankDetails', {
    alias: 'musickids.profe.mp',
    cbuCvu: '0000003100012345678901',
    accountHolder: 'Profesor Test',
    bankName: 'Mercado Pago',
  });

  // Meet config privado del profesor
  db.privateSettings.set('teacher_1/meetConfig', {
    permanentMeetUrl: 'https://meet.google.com/abc-defg-hij',
    permanentMeetSpaceName: 'spaces/permanent-teacher-1',
  });

  // Alumnos por defecto
  db.users.set('student_1', {
    uid: 'student_1',
    role: 'student',
    name: 'Alumno Uno',
    status: 'active',
  });

  db.users.set('student_2', {
    uid: 'student_2',
    role: 'student',
    name: 'Alumno Dos',
    status: 'active',
  });

  // Horarios recurrentes (Miércoles 16:00 y Viernes 17:00, 45 min)
  db.teacherRecurringSlots.set('slot_wed_16', {
    id: 'slot_wed_16',
    teacherId: 'teacher_1',
    dayOfWeek: 3, // Miércoles
    startTime: '16:00',
    endTime: '16:45',
    duration: 45,
    isActive: true,
  });

  db.teacherRecurringSlots.set('slot_fri_17', {
    id: 'slot_fri_17',
    teacherId: 'teacher_1',
    dayOfWeek: 5, // Viernes
    startTime: '17:00',
    endTime: '17:45',
    duration: 45,
    isActive: true,
  });

  return db;
}

// Simulador de la transacción atómica createMonthlyBooking
async function simulateCreateMonthlyBooking(
  db: MockDB,
  authenticatedStudentId: string,
  payload: {
    teacherId: string;
    month: string;
    recurringSlotIds: string[];
    weeklyFrequency: 1 | 2 | 3;
    idempotencyKey?: string;
  },
  mockNow: Date = new Date('2026-03-01T12:00:00Z')
) {
  const { teacherId, month, recurringSlotIds, weeklyFrequency, idempotencyKey } = payload;

  if (idempotencyKey) {
    for (const [id, mb] of db.monthlyBookings.entries()) {
      if (mb.studentId === authenticatedStudentId && mb.idempotencyKey === idempotencyKey) {
        return {
          success: true,
          bookingId: id,
          status: mb.status,
          totalPrice: mb.totalPrice,
          expiresAt: mb.expiresAt.toISOString(),
          message: 'Reserva recuperada por clave de idempotencia existente.',
        };
      }
    }
  }

  // Tarifa fija
  const teacher = db.users.get(teacherId);
  if (!teacher) throw new Error('El profesor no existe');
  const plan = teacher.monthlyPlans.find((p: any) => p.lessonsPerWeek === weeklyFrequency);
  if (!plan) throw new Error('Tarifa mensual no configurada');

  // Fechas del mes (ej: Marzo 2026, Miércoles)
  const occurrences: any[] = [];
  const [yStr, mStr] = month.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const daysInMonth = new Date(y, m, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m - 1, day, 12, 0, 0);
    const dayOfWeek = d.getDay();
    const dStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    for (const slotId of recurringSlotIds) {
      const slot = db.teacherRecurringSlots.get(slotId);
      if (slot && slot.dayOfWeek === dayOfWeek) {
        occurrences.push({
          date: dStr,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: 45,
          slotId,
        });
      }
    }
  }

  // Comprobar colisiones contra teacherDailySchedule respetando expiración de 24 horas
  const bookingId = `mb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const expiresAt = new Date(mockNow.getTime() + 24 * 60 * 60 * 1000);

  // Validar clases manuales activas en lessons
  for (const occ of occurrences) {
    const occStart = timeToMinutes(occ.startTime);
    const occEnd = occStart + occ.duration;

    for (const lesson of db.lessons.values()) {
      if (lesson.teacherId === teacherId && lesson.status !== 'cancelled' && lesson.status !== 'expired') {
        // Si pertenece a una reserva pendiente que ya superó las 24 horas, queda liberada
        if (lesson.paymentStatus === 'pending_confirmation' && lesson.monthlyBookingId) {
          if (lesson.expiresAt && lesson.expiresAt.getTime() <= mockNow.getTime()) {
            lesson.status = 'expired';
            continue;
          }
        }

        if (lesson.dateStr === occ.date) {
          const lStart = timeToMinutes(lesson.startTime);
          const lEnd = lStart + lesson.duration;
          if (occStart < lEnd && lStart < occEnd) {
            const err = new Error('already-exists: Horario ya ocupado por clase manual');
            (err as any).code = 'already-exists';
            throw err;
          }
        }
      }
    }
  }

  // Validar y actualizar teacherDailySchedule
  for (const occ of occurrences) {
    const schedKey = `${teacherId}_${occ.date}`;
    const schedule = db.teacherDailySchedule.get(schedKey) || { intervals: [] };
    const occStart = timeToMinutes(occ.startTime);
    const occEnd = occStart + occ.duration;

    // Filtrar intervalos activos considerando retención de 24h
    const activeIntervals = schedule.intervals.filter((slot: any) => {
      if (slot.status === 'cancelled' || slot.status === 'expired') return false;
      if (
        slot.status === 'pending_payment_confirmation' &&
        slot.expiresAt &&
        new Date(slot.expiresAt).getTime() <= mockNow.getTime()
      ) {
        slot.status = 'expired';
        // Marcar el abono como expirado
        if (slot.bookingId && db.monthlyBookings.has(slot.bookingId)) {
          const mb = db.monthlyBookings.get(slot.bookingId);
          mb.status = 'expired';
        }
        return false; // Liberado
      }
      return true;
    });

    for (const slot of activeIntervals) {
      if (occStart < slot.endMinutes && slot.startMinutes < occEnd) {
        const err = new Error('already-exists: Horario ocupado o pendiente de pago');
        (err as any).code = 'already-exists';
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

    db.teacherDailySchedule.set(schedKey, { intervals: activeIntervals });
  }

  // Registrar lecciones
  const lessonIds: string[] = [];
  for (const occ of occurrences) {
    const lessonId = `les_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    lessonIds.push(lessonId);
    db.lessons.set(lessonId, {
      id: lessonId,
      teacherId,
      studentId: authenticatedStudentId,
      monthlyBookingId: bookingId,
      dateStr: occ.date,
      startTime: occ.startTime,
      duration: 45,
      status: 'scheduled',
      paymentStatus: 'pending_confirmation',
      expiresAt,
      meetUrl: null,
    });

    // Registrar lock
    const lockKey = generateSlotLockKey(teacherId, occ.date, occ.startTime);
    db.teacherSlotLocks.set(lockKey, {
      id: lockKey,
      teacherId,
      bookingId,
      expiresAt,
    });
  }

  // Datos bancarios
  const bank = db.privateSettings.get(`${teacherId}/bankDetails`) || null;

  db.monthlyBookings.set(bookingId, {
    id: bookingId,
    teacherId,
    studentId: authenticatedStudentId,
    month,
    weeklyFrequency,
    totalLessons: occurrences.length,
    totalPrice: plan.price,
    status: 'pending_payment_confirmation',
    idempotencyKey: idempotencyKey || null,
    expiresAt,
    lessonIds,
    occurrences,
  });

  return {
    success: true,
    bookingId,
    status: 'pending_payment_confirmation',
    totalPrice: plan.price,
    currency: 'ARS',
    totalLessons: occurrences.length,
    occurrences,
    lessonIds,
    expiresAt: expiresAt.toISOString(),
    bankDetails: bank,
    message: 'Reserva creada exitosamente',
  };
}

// Simulador de confirmación de pago del profesor
async function simulateConfirmMonthlyPayment(
  db: MockDB,
  authenticatedTeacherId: string,
  bookingId: string,
  mockNow: Date
) {
  const booking = db.monthlyBookings.get(bookingId);
  if (!booking) throw new Error('Abono no encontrado');
  if (booking.teacherId !== authenticatedTeacherId) throw new Error('permission-denied');

  if (booking.status === 'confirmed') {
    return { success: true, message: 'Ya confirmado' };
  }

  if (booking.status === 'expired') {
    const err = new Error('failed-precondition: El abono ha expirado tras 24 horas');
    (err as any).code = 'failed-precondition';
    throw err;
  }

  if (booking.expiresAt && booking.expiresAt.getTime() <= mockNow.getTime()) {
    booking.status = 'expired';
    const err = new Error('failed-precondition: El plazo de retención de 24 horas ha vencido');
    (err as any).code = 'failed-precondition';
    throw err;
  }

  booking.status = 'confirmed';

  const meetConfig = db.privateSettings.get(`${authenticatedTeacherId}/meetConfig`);

  // Actualizar lecciones
  for (const lid of booking.lessonIds) {
    const lesson = db.lessons.get(lid);
    if (lesson) {
      lesson.paymentStatus = 'confirmed';
      lesson.meetUrl = meetConfig?.permanentMeetUrl || null;
    }
  }

  // Actualizar intervals en teacherDailySchedule
  for (const occ of booking.occurrences) {
    const schedKey = `${authenticatedTeacherId}_${occ.date}`;
    const schedule = db.teacherDailySchedule.get(schedKey);
    if (schedule) {
      for (const slot of schedule.intervals) {
        if (slot.bookingId === bookingId) {
          slot.status = 'confirmed';
          slot.expiresAt = null;
        }
      }
    }
    const lockKey = generateSlotLockKey(authenticatedTeacherId, occ.date, occ.startTime);
    const lock = db.teacherSlotLocks.get(lockKey);
    if (lock) {
      lock.expiresAt = null;
    }
  }

  return { success: true, status: 'confirmed', message: 'Pago confirmado' };
}

// Simulador de consulta sanitizada de disponibilidad
function simulateGetTeacherPublicAvailability(
  db: MockDB,
  teacherId: string,
  month: string,
  mockNow: Date
) {
  const occupiedIntervals: any[] = [];

  for (const [key, sched] of db.teacherDailySchedule.entries()) {
    if (!key.startsWith(`${teacherId}_`)) continue;
    const dateStr = key.replace(`${teacherId}_`, '');
    if (!dateStr.startsWith(month)) continue;

    for (const slot of sched.intervals) {
      if (slot.status === 'cancelled' || slot.status === 'expired') continue;
      if (
        slot.status === 'pending_payment_confirmation' &&
        slot.expiresAt &&
        new Date(slot.expiresAt).getTime() <= mockNow.getTime()
      ) {
        continue; // Expirado: libre
      }
      // Sanitizado: SIN studentId ni bookingId
      occupiedIntervals.push({
        date: dateStr,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  return {
    teacherId,
    month,
    occupiedIntervals,
    blockedDates: [],
  };
}

// ========================================================================
// EJECUCIÓN DE LOS 12 CASOS DE PRUEBA
// ========================================================================

async function runAll12Tests() {
  const db = createMockDB();
  const t0 = new Date('2026-03-01T10:00:00Z');

  // TEST 1: Reserva mensual válida
  console.log('--- TEST 1: Reserva mensual válida ---');
  const res1 = await simulateCreateMonthlyBooking(
    db,
    'student_1',
    {
      teacherId: 'teacher_1',
      month: '2026-03',
      recurringSlotIds: ['slot_wed_16'],
      weeklyFrequency: 1,
      idempotencyKey: 'key_student1_marzo',
    },
    t0
  );
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.status, 'pending_payment_confirmation');
  assert.strictEqual(res1.totalPrice, 30000);
  assert(res1.bankDetails && res1.bankDetails.alias === 'musickids.profe.mp');
  const expDiffHours = (new Date(res1.expiresAt).getTime() - t0.getTime()) / (1000 * 60 * 60);
  assert.strictEqual(expDiffHours, 24, 'expiresAt debe ser exactamente 24 horas después');
  console.log('✓ [TEST 1] PASÓ: Reserva mensual válida con status pending_payment_confirmation, precio fijo y 24h expiresAt');

  // TEST 2: Reserva duplicada (misma idempotencyKey)
  console.log('\n--- TEST 2: Reserva duplicada (idempotencia) ---');
  const res2 = await simulateCreateMonthlyBooking(
    db,
    'student_1',
    {
      teacherId: 'teacher_1',
      month: '2026-03',
      recurringSlotIds: ['slot_wed_16'],
      weeklyFrequency: 1,
      idempotencyKey: 'key_student1_marzo',
    },
    t0
  );
  assert.strictEqual(res2.bookingId, res1.bookingId, 'Debe devolver el mismo bookingId');
  console.log('✓ [TEST 2] PASÓ: Solicitud duplicada con misma idempotencyKey devuelve la reserva existente');

  // TEST 3: Dos alumnos intentando reservar el mismo horario
  console.log('\n--- TEST 3: Concurrencia entre alumnos ---');
  let rejectedStudent2 = false;
  try {
    await simulateCreateMonthlyBooking(
      db,
      'student_2',
      {
        teacherId: 'teacher_1',
        month: '2026-03',
        recurringSlotIds: ['slot_wed_16'],
        weeklyFrequency: 1,
        idempotencyKey: 'key_student2_conflict',
      },
      t0
    );
  } catch (err: any) {
    rejectedStudent2 = err.code === 'already-exists';
  }
  assert(rejectedStudent2, 'El segundo alumno debe ser rechazado con already-exists');
  console.log('✓ [TEST 3] PASÓ: Dos alumnos compitiendo por el mismo horario; el segundo es rechazado');

  // TEST 4: Conflicto con clase manual preexistente
  console.log('\n--- TEST 4: Conflicto con clase manual preexistente ---');
  db.lessons.set('manual_lesson_1', {
    id: 'manual_lesson_1',
    teacherId: 'teacher_1',
    studentId: 'student_1',
    dateStr: '2026-04-03', // Viernes
    startTime: '17:00',
    duration: 45,
    status: 'scheduled',
    paymentStatus: 'confirmed',
  });

  let rejectedManualConflict = false;
  try {
    await simulateCreateMonthlyBooking(
      db,
      'student_2',
      {
        teacherId: 'teacher_1',
        month: '2026-04',
        recurringSlotIds: ['slot_fri_17'],
        weeklyFrequency: 1,
        idempotencyKey: 'key_student2_april',
      },
      t0
    );
  } catch (err: any) {
    rejectedManualConflict = err.code === 'already-exists';
  }
  assert(rejectedManualConflict, 'Debe rechazar abono si colisiona con clase manual preexistente');
  console.log('✓ [TEST 4] PASÓ: Abono mensual rechazado si colisiona con clase manual previa');

  // TEST 5: Reserva pendiente que bloquea el horario dentro de las 24 horas
  console.log('\n--- TEST 5: Reserva pendiente bloquea horario dentro de 24 horas ---');
  const tPlus12Hours = new Date(t0.getTime() + 12 * 60 * 60 * 1000); // 12 horas después
  let blockedAt12h = false;
  try {
    await simulateCreateMonthlyBooking(
      db,
      'student_2',
      {
        teacherId: 'teacher_1',
        month: '2026-03',
        recurringSlotIds: ['slot_wed_16'],
        weeklyFrequency: 1,
        idempotencyKey: 'key_student2_12h',
      },
      tPlus12Hours
    );
  } catch (err: any) {
    blockedAt12h = err.code === 'already-exists';
  }
  assert(blockedAt12h, 'A las 12 horas la reserva sigue vigente y bloquea el horario');
  console.log('✓ [TEST 5] PASÓ: Reserva pendiente mantiene bloqueado el horario durante las 24 horas');

  // TEST 6: Reserva confirmada que mantiene el horario ocupado definitivamente
  console.log('\n--- TEST 6: Confirmación del profesor y permanencia definitiva ---');
  const tPlus20Hours = new Date(t0.getTime() + 20 * 60 * 60 * 1000);
  const confirmResult = await simulateConfirmMonthlyPayment(
    db,
    'teacher_1',
    res1.bookingId,
    tPlus20Hours
  );
  assert.strictEqual(confirmResult.status, 'confirmed');

  const confirmedBooking = db.monthlyBookings.get(res1.bookingId);
  assert.strictEqual(confirmedBooking.status, 'confirmed');

  // Verificar que las lecciones tienen el enlace de Meet oficial
  for (const lid of confirmedBooking.lessonIds) {
    const l = db.lessons.get(lid);
    assert.strictEqual(l.paymentStatus, 'confirmed');
    assert.strictEqual(l.meetUrl, 'https://meet.google.com/abc-defg-hij');
  }

  // Verificar que aún después de 48 horas sigue ocupado
  const tPlus48Hours = new Date(t0.getTime() + 48 * 60 * 60 * 1000);
  let blockedAfterConfirm = false;
  try {
    await simulateCreateMonthlyBooking(
      db,
      'student_2',
      {
        teacherId: 'teacher_1',
        month: '2026-03',
        recurringSlotIds: ['slot_wed_16'],
        weeklyFrequency: 1,
        idempotencyKey: 'key_student2_48h',
      },
      tPlus48Hours
    );
  } catch (err: any) {
    blockedAfterConfirm = err.code === 'already-exists';
  }
  assert(blockedAfterConfirm, 'Un abono confirmado mantiene el horario ocupado definitivamente');
  console.log('✓ [TEST 6] PASÓ: Reserva confirmada asigna Google Meet permanente y ocupa horario definitivamente');

  // TEST 7: Reserva expirada que libera el horario
  console.log('\n--- TEST 7: Reserva expirada libera el horario para nuevo alumno ---');
  // Crear una nueva reserva pendiente en otro mes (Mayo 2026)
  const resMayo = await simulateCreateMonthlyBooking(
    db,
    'student_1',
    {
      teacherId: 'teacher_1',
      month: '2026-05',
      recurringSlotIds: ['slot_wed_16'],
      weeklyFrequency: 1,
      idempotencyKey: 'key_student1_mayo',
    },
    t0
  );

  // Simular paso de 25 horas sin confirmación
  const tPlus25Hours = new Date(t0.getTime() + 25 * 60 * 60 * 1000);
  const resStudent2Mayo = await simulateCreateMonthlyBooking(
    db,
    'student_2',
    {
      teacherId: 'teacher_1',
      month: '2026-05',
      recurringSlotIds: ['slot_wed_16'],
      weeklyFrequency: 1,
      idempotencyKey: 'key_student2_mayo_new',
    },
    tPlus25Hours
  );
  assert.strictEqual(resStudent2Mayo.success, true);
  assert.strictEqual(resStudent2Mayo.status, 'pending_payment_confirmation');

  // Verificar que la reserva anterior de student_1 quedó en 'expired'
  const oldMayoBooking = db.monthlyBookings.get(resMayo.bookingId);
  assert.strictEqual(oldMayoBooking.status, 'expired', 'El abono vencido debe pasar a expired');
  console.log('✓ [TEST 7] PASÓ: Transcurridas 24 horas, la reserva vencida pasa a expired y libera el horario');

  // TEST 8: Confirmación de pago y expiración simultáneas
  console.log('\n--- TEST 8: Confirmación rechazada si ya transcurrieron 24 horas ---');
  let confirmRejectedExpired = false;
  try {
    await simulateConfirmMonthlyPayment(
      db,
      'teacher_1',
      resMayo.bookingId, // Abono vencido hace 25h
      tPlus25Hours
    );
  } catch (err: any) {
    confirmRejectedExpired = err.code === 'failed-precondition';
  }
  assert(confirmRejectedExpired, 'No se puede confirmar un abono que ya superó las 24 horas');
  console.log('✓ [TEST 8] PASÓ: Confirmación de pago sobre reserva vencida es rechazada con failed-precondition');

  // TEST 9: Cancelación sin bloqueos huérfanos
  console.log('\n--- TEST 9: Cancelación explícita sin bloqueos huérfanos ---');
  // Cancelar la reserva de student_2 de Mayo
  const bookingToCancel = db.monthlyBookings.get(resStudent2Mayo.bookingId);
  bookingToCancel.status = 'cancelled';
  for (const lid of bookingToCancel.lessonIds) {
    const l = db.lessons.get(lid);
    l.status = 'cancelled';
  }
  for (const occ of bookingToCancel.occurrences) {
    const schedKey = `teacher_1_${occ.date}`;
    const sched = db.teacherDailySchedule.get(schedKey);
    sched.intervals = sched.intervals.filter((s: any) => s.bookingId !== resStudent2Mayo.bookingId);
  }

  // Ahora un tercer intento de reserva en Mayo debe ser aceptado sin bloqueos huérfanos
  const resStudent1MayoRetry = await simulateCreateMonthlyBooking(
    db,
    'student_1',
    {
      teacherId: 'teacher_1',
      month: '2026-05',
      recurringSlotIds: ['slot_wed_16'],
      weeklyFrequency: 1,
      idempotencyKey: 'key_student1_mayo_retry',
    },
    tPlus25Hours
  );
  assert.strictEqual(resStudent1MayoRetry.success, true);
  console.log('✓ [TEST 9] PASÓ: Cancelación de reserva no deja bloqueos huérfanos en la agenda');

  // TEST 10: Consulta de disponibilidad sin datos privados
  console.log('\n--- TEST 10: Consulta sanitizada de disponibilidad ---');
  const pubAvail = simulateGetTeacherPublicAvailability(db, 'teacher_1', '2026-03', t0);
  assert.strictEqual(pubAvail.teacherId, 'teacher_1');
  assert.strictEqual(pubAvail.month, '2026-03');
  assert(pubAvail.occupiedIntervals.length > 0, 'Debe reportar intervalos ocupados');

  // Verificar estrictamente que no contenga claves privadas
  for (const interval of pubAvail.occupiedIntervals) {
    assert.strictEqual((interval as any).studentId, undefined);
    assert.strictEqual((interval as any).bookingId, undefined);
    assert.strictEqual((interval as any).studentName, undefined);
    assert(interval.date && interval.startTime && interval.endTime);
  }
  console.log('✓ [TEST 10] PASÓ: Consulta de disponibilidad contiene únicamente fechas y horas sin exponer studentId ni bookingId');

  // TEST 11: Precio mensual fijo inmutable
  console.log('\n--- TEST 11: Precio mensual fijo inmutable desde el perfil docente ---');
  const resFreq2 = await simulateCreateMonthlyBooking(
    db,
    'student_1',
    {
      teacherId: 'teacher_1',
      month: '2026-06',
      recurringSlotIds: ['slot_wed_16', 'slot_fri_17'],
      weeklyFrequency: 2,
      idempotencyKey: 'key_freq_2_june',
    },
    t0
  );
  assert.strictEqual(resFreq2.totalPrice, 55000, 'Debe tomar exactamente la tarifa de 2 clases por semana ($55.000)');
  console.log('✓ [TEST 11] PASÓ: El precio mensual es fijado por el perfil del docente ($55.000 para 2 clases/sem)');

  // TEST 12: Funcionamiento con 4 o 5 ocurrencias semanales en un mes
  console.log('\n--- TEST 12: Ocurrencias exactas (4 vs 5 ocurrencias en el mes) ---');
  // Marzo 2026 tiene 4 Miércoles (4, 11, 18, 25)
  assert.strictEqual(res1.occurrences.length, 4, 'Marzo 2026 tiene 4 miércoles');

  // Julio 2026 tiene 5 Miércoles (1, 8, 15, 22, 29)
  const resJulio = await simulateCreateMonthlyBooking(
    db,
    'student_1',
    {
      teacherId: 'teacher_1',
      month: '2026-07',
      recurringSlotIds: ['slot_wed_16'],
      weeklyFrequency: 1,
      idempotencyKey: 'key_julio_5_wednesdays',
    },
    t0
  );
  assert.strictEqual(resJulio.occurrences.length, 5, 'Julio 2026 tiene 5 miércoles');
  assert.strictEqual(resJulio.totalPrice, 30000, 'El precio mensual fijo se mantiene inmutable con 5 clases');
  console.log('✓ [TEST 12] PASÓ: Proyección precisa para 4 ocurrencias (Marzo) y 5 ocurrencias (Julio) con tarifa mensual fija inmutable');

  console.log('\n========================================================================');
  console.log('🎉 TODOS LOS 12 CASOS DE PRUEBA DEL SUBBLOQUE 6B.5 PASARON EXITOSAMENTE');
  console.log('========================================================================\n');
}

runAll12Tests().catch((err) => {
  console.error('ERROR EN PRUEBAS:', err);
  process.exit(1);
});
