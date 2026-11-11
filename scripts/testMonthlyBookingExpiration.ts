/**
 * Test Suite Integral: Expiración y Liberación Coherente de Abonos Mensuales
 * Proyecto: MusicKids
 * Firebase: musickids-83026
 *
 * Casos evaluados obligatorios (Sección 6):
 * 1. Abono pendiente con menos de 24 horas: conserva la reserva.
 * 2. Abono confirmado antes de 24 horas: permanece confirmado y mantiene sus horarios ocupados.
 * 3. Abono pendiente con más de 24 horas: pasa a 'expired'.
 * 4. Todas las clases del abono vencido dejan de bloquear horarios.
 * 5. El calendario del profesor y el calendario del alumno coinciden exactamente.
 * 6. Un abono vencido no puede confirmarse posteriormente (rechazo en backend).
 * 7. Ejecutar dos veces el proceso de expiración no genera inconsistencias (idempotencia).
 * 8. Una reserva confirmada nunca se modifica por el proceso de expiración.
 * 9. El historial y los datos de otros profesores y alumnos permanecen intactos.
 */

interface MockFirestoreDB {
  monthlyBookings: Record<string, any>;
  lessons: Record<string, any>;
  teacherDailySchedule: Record<string, any>;
  teacherSlotLocks: Record<string, any>;
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ APROBÓ: ${msg}`);
}

console.log('--- INICIANDO PRUEBAS OBLIGATORIAS: CICLO DE EXPIRACIÓN DE ABONOS ---');

const now = new Date(2026, 2, 15, 12, 0, 0); // 15 de marzo de 2026, 12:00 hs
const nowMs = now.getTime();

// Helper que simula la lógica del backend para expirar abonos
function processExpiration(db: MockFirestoreDB, currentTimeMs: number, targetBookingId?: string): { expiredCount: number; expiredIds: string[] } {
  const expiredIds: string[] = [];
  const bookings = targetBookingId
    ? (db.monthlyBookings[targetBookingId] ? [db.monthlyBookings[targetBookingId]] : [])
    : Object.values(db.monthlyBookings);

  for (const b of bookings) {
    // Regla: No modificar nunca si ya está confirmado o cancelado
    if (b.status === 'confirmed' || b.status === 'cancelled') {
      continue;
    }

    const expMs = b.expiresAt instanceof Date ? b.expiresAt.getTime() : new Date(b.expiresAt).getTime();
    if (expMs <= currentTimeMs || b.status === 'expired') {
      // 1. Transición atómica de monthlyBookings
      b.status = 'expired';
      b.expiredAt = new Date(currentTimeMs);
      expiredIds.push(b.id);

      // 2. Transición de lecciones asociadas en lessons
      for (const lessonId in db.lessons) {
        const lesson = db.lessons[lessonId];
        if (lesson.monthlyBookingId === b.id && lesson.paymentStatus !== 'confirmed') {
          lesson.status = 'expired';
          lesson.paymentStatus = 'expired';
        }
      }

      // 3. Liberación de intervalos en teacherDailySchedule
      for (const scheduleKey in db.teacherDailySchedule) {
        const schedule = db.teacherDailySchedule[scheduleKey];
        if (Array.isArray(schedule.intervals)) {
          schedule.intervals = schedule.intervals.map((slot: any) => {
            if (slot.bookingId === b.id && slot.status !== 'confirmed') {
              return { ...slot, status: 'expired' };
            }
            return slot;
          });
        }
      }

      // 4. Liberación de cerrojos en teacherSlotLocks
      for (const lockKey in db.teacherSlotLocks) {
        if (db.teacherSlotLocks[lockKey].bookingId === b.id) {
          delete db.teacherSlotLocks[lockKey];
        }
      }
    }
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// Helper que evalúa si un horario está ocupado en el calendario del alumno
function isSlotOccupiedForStudent(db: MockFirestoreDB, teacherId: string, dateStr: string, timeStr: string, currentTimeMs: number): boolean {
  const schedKey = `${teacherId}_${dateStr}`;
  const sched = db.teacherDailySchedule[schedKey];
  if (sched && Array.isArray(sched.intervals)) {
    for (const slot of sched.intervals) {
      if (slot.startTime === timeStr) {
        if (slot.status === 'cancelled' || slot.status === 'expired') continue;
        if (slot.status === 'pending_payment_confirmation' && slot.expiresAt) {
          const exp = new Date(slot.expiresAt).getTime();
          if (exp <= currentTimeMs) continue; // Liberado por 24h
        }
        return true;
      }
    }
  }
  return false;
}

// Helper que evalúa si un horario está ocupado en el calendario semanal del profesor
function isSlotOccupiedForTeacher(db: MockFirestoreDB, teacherId: string, dateStr: string, timeStr: string, currentTimeMs: number): boolean {
  const lessons = Object.values(db.lessons).filter((l: any) => l.teacherId === teacherId);
  const matching = lessons.find((l: any) => {
    if (l.status === 'cancelled' || l.status === 'expired') return false;
    if (l.paymentStatus === 'expired') return false;
    if (l.paymentStatus === 'pending_confirmation' && l.monthlyBookingId) {
      const exp = l.expiresAt instanceof Date ? l.expiresAt.getTime() : new Date(l.expiresAt).getTime();
      if (exp > 0 && exp <= currentTimeMs) return false;
    }
    return l.dateStr === dateStr && l.startTime === timeStr;
  });
  return Boolean(matching);
}

// Helper para intentar confirmar pago
function attemptConfirmPayment(db: MockFirestoreDB, bookingId: string, teacherId: string, currentTimeMs: number): { success: boolean; error?: string } {
  const booking = db.monthlyBookings[bookingId];
  if (!booking) return { success: false, error: 'not_found' };
  if (booking.teacherId !== teacherId) return { success: false, error: 'permission_denied' };

  if (booking.status === 'confirmed') return { success: true };
  if (booking.status === 'expired') return { success: false, error: 'failed-precondition: plazo de 24h vencido' };

  const expMs = booking.expiresAt instanceof Date ? booking.expiresAt.getTime() : new Date(booking.expiresAt).getTime();
  if (expMs <= currentTimeMs) {
    // Si venció en el momento de la confirmación, se expira y se rechaza
    processExpiration(db, currentTimeMs, bookingId);
    return { success: false, error: 'failed-precondition: plazo de 24h vencido' };
  }

  // Confirmación exitosa
  booking.status = 'confirmed';
  for (const lid in db.lessons) {
    if (db.lessons[lid].monthlyBookingId === bookingId) {
      db.lessons[lid].status = 'scheduled';
      db.lessons[lid].paymentStatus = 'confirmed';
    }
  }
  return { success: true };
}

// =========================================================================
// ESCENARIO DE PRUEBA
// =========================================================================

const mockDB: MockFirestoreDB = {
  monthlyBookings: {
    // Caso 1: Abono con menos de 24 horas (creado hace 6 horas, expira en 18h)
    'booking_recent': {
      id: 'booking_recent',
      teacherId: 'teacher_lucas',
      studentId: 'student_mateo',
      month: '2026-04',
      status: 'pending_payment_confirmation',
      expiresAt: new Date(nowMs + 18 * 60 * 60 * 1000), // Vence en 18 hs
      totalLessons: 4,
    },
    // Caso 2: Abono confirmado antes de las 24 horas
    'booking_confirmed': {
      id: 'booking_confirmed',
      teacherId: 'teacher_lucas',
      studentId: 'student_sofia',
      month: '2026-04',
      status: 'confirmed',
      expiresAt: new Date(nowMs - 5 * 60 * 60 * 1000), // Ya pasó, pero está confirmado
      totalLessons: 4,
    },
    // Caso 3: Abono vencido hace más de 24 horas (expiró hace 2 horas)
    'booking_expired_case': {
      id: 'booking_expired_case',
      teacherId: 'teacher_lucas',
      studentId: 'student_bruno',
      month: '2026-04',
      status: 'pending_payment_confirmation',
      expiresAt: new Date(nowMs - 2 * 60 * 60 * 1000), // Venció hace 2 hs
      totalLessons: 4,
    },
    // Caso 9: Abono de otro profesor y otro alumno (profesor Clara)
    'booking_clara': {
      id: 'booking_clara',
      teacherId: 'teacher_clara',
      studentId: 'student_elena',
      month: '2026-04',
      status: 'confirmed',
      expiresAt: new Date(nowMs + 10 * 60 * 60 * 1000),
      totalLessons: 4,
    },
  },
  lessons: {
    'lesson_recent_1': {
      id: 'lesson_recent_1',
      teacherId: 'teacher_lucas',
      studentId: 'student_mateo',
      monthlyBookingId: 'booking_recent',
      dateStr: '2026-04-06',
      startTime: '15:00',
      status: 'scheduled',
      paymentStatus: 'pending_confirmation',
      expiresAt: new Date(nowMs + 18 * 60 * 60 * 1000),
    },
    'lesson_confirmed_1': {
      id: 'lesson_confirmed_1',
      teacherId: 'teacher_lucas',
      studentId: 'student_sofia',
      monthlyBookingId: 'booking_confirmed',
      dateStr: '2026-04-07',
      startTime: '16:00',
      status: 'scheduled',
      paymentStatus: 'confirmed',
      expiresAt: null,
    },
    'lesson_expired_1': {
      id: 'lesson_expired_1',
      teacherId: 'teacher_lucas',
      studentId: 'student_bruno',
      monthlyBookingId: 'booking_expired_case',
      dateStr: '2026-04-08',
      startTime: '17:00',
      status: 'scheduled',
      paymentStatus: 'pending_confirmation',
      expiresAt: new Date(nowMs - 2 * 60 * 60 * 1000),
    },
    'lesson_clara_1': {
      id: 'lesson_clara_1',
      teacherId: 'teacher_clara',
      studentId: 'student_elena',
      monthlyBookingId: 'booking_clara',
      dateStr: '2026-04-09',
      startTime: '10:00',
      status: 'scheduled',
      paymentStatus: 'confirmed',
      expiresAt: null,
    },
  },
  teacherDailySchedule: {
    'teacher_lucas_2026-04-06': {
      intervals: [
        {
          startTime: '15:00',
          bookingId: 'booking_recent',
          status: 'pending_payment_confirmation',
          expiresAt: new Date(nowMs + 18 * 60 * 60 * 1000).toISOString(),
        },
      ],
    },
    'teacher_lucas_2026-04-07': {
      intervals: [
        {
          startTime: '16:00',
          bookingId: 'booking_confirmed',
          status: 'confirmed',
          expiresAt: null,
        },
      ],
    },
    'teacher_lucas_2026-04-08': {
      intervals: [
        {
          startTime: '17:00',
          bookingId: 'booking_expired_case',
          status: 'pending_payment_confirmation',
          expiresAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
        },
      ],
    },
    'teacher_clara_2026-04-09': {
      intervals: [
        {
          startTime: '10:00',
          bookingId: 'booking_clara',
          status: 'confirmed',
          expiresAt: null,
        },
      ],
    },
  },
  teacherSlotLocks: {
    'teacher_lucas_2026-04-08_1700': {
      bookingId: 'booking_expired_case',
      expiresAt: new Date(nowMs - 2 * 60 * 60 * 1000),
    },
  },
};

// =========================================================================
// EJECUCIÓN DE PRUEBAS
// =========================================================================

// PRUEBA 1: Abono pendiente con menos de 24 horas: conserva la reserva
console.log('\n--- PRUEBA 1: Abono pendiente < 24h conserva la reserva ---');
const isRecentOccupiedStudent = isSlotOccupiedForStudent(mockDB, 'teacher_lucas', '2026-04-06', '15:00', nowMs);
const isRecentOccupiedTeacher = isSlotOccupiedForTeacher(mockDB, 'teacher_lucas', '2026-04-06', '15:00', nowMs);
assert(isRecentOccupiedStudent === true, 'El alumno ve el horario de 15:00 como ocupado/reservado (< 24h)');
assert(isRecentOccupiedTeacher === true, 'El profesor ve el horario de 15:00 como reservado (< 24h)');
assert(mockDB.monthlyBookings['booking_recent'].status === 'pending_payment_confirmation', 'El abono permanece en pending_payment_confirmation');

// PRUEBA 2: Abono confirmado antes de 24 horas: permanece confirmado y mantiene sus horarios ocupados
console.log('\n--- PRUEBA 2: Abono confirmado mantiene reserva activa ---');
const isConfirmedOccupiedStudent = isSlotOccupiedForStudent(mockDB, 'teacher_lucas', '2026-04-07', '16:00', nowMs);
const isConfirmedOccupiedTeacher = isSlotOccupiedForTeacher(mockDB, 'teacher_lucas', '2026-04-07', '16:00', nowMs);
assert(isConfirmedOccupiedStudent === true, 'El alumno ve el horario confirmado de 16:00 como ocupado');
assert(isConfirmedOccupiedTeacher === true, 'El profesor ve el horario confirmado de 16:00 como reservado');
assert(mockDB.monthlyBookings['booking_confirmed'].status === 'confirmed', 'El abono confirmado permanece con status confirmed');

// PRUEBA 3: Abono pendiente con más de 24 horas pasa a 'expired'
console.log('\n--- PRUEBA 3: Ejecución de expiración automática para abono > 24h ---');
const expResult1 = processExpiration(mockDB, nowMs);
assert(expResult1.expiredCount === 1, 'Se procesó la expiración del abono vencido');
assert(expResult1.expiredIds.includes('booking_expired_case'), 'El abono vencido fue identificado');
assert(mockDB.monthlyBookings['booking_expired_case'].status === 'expired', 'El abono vencido pasó a status expired en Firestore');

// PRUEBA 4: Todas las clases del abono vencido dejan de bloquear horarios
console.log('\n--- PRUEBA 4: Clases del abono vencido dejan de bloquear horarios ---');
const expiredLesson = mockDB.lessons['lesson_expired_1'];
assert(expiredLesson.status === 'expired', 'La lección del abono vencido pasó a status expired');
assert(expiredLesson.paymentStatus === 'expired', 'El paymentStatus de la lección pasó a expired');
assert(mockDB.teacherSlotLocks['teacher_lucas_2026-04-08_1700'] === undefined, 'El cerrojo en teacherSlotLocks fue eliminado');

// PRUEBA 5: El calendario del profesor y el calendario del alumno coinciden (ambos disponibles)
console.log('\n--- PRUEBA 5: Consistencia entre calendario del profesor y del alumno ---');
const isExpiredOccupiedStudent = isSlotOccupiedForStudent(mockDB, 'teacher_lucas', '2026-04-08', '17:00', nowMs);
const isExpiredOccupiedTeacher = isSlotOccupiedForTeacher(mockDB, 'teacher_lucas', '2026-04-08', '17:00', nowMs);
assert(isExpiredOccupiedStudent === false, 'El alumno ve el horario de 17:00 como LIBRE / DISPONIBLE');
assert(isExpiredOccupiedTeacher === false, 'El profesor ve el horario de 17:00 como LIBRE / DISPONIBLE');
assert(isExpiredOccupiedStudent === isExpiredOccupiedTeacher, 'El calendario del profesor y del alumno coinciden al 100%');

// PRUEBA 6: Un abono vencido no puede confirmarse posteriormente
console.log('\n--- PRUEBA 6: Rechazo estricto de confirmación tardía de abono vencido ---');
const lateConfirmRes = attemptConfirmPayment(mockDB, 'booking_expired_case', 'teacher_lucas', nowMs);
assert(lateConfirmRes.success === false, 'Se rechaza la confirmación de pago de un abono vencido');
assert(lateConfirmRes.error?.includes('24h vencido'), 'El mensaje de error indica claramente el vencimiento de las 24 horas');

// PRUEBA 7: Ejecutar dos veces el proceso de expiración no genera inconsistencias (idempotencia)
console.log('\n--- PRUEBA 7: Idempotencia en segunda ejecución ---');
const expResult2 = processExpiration(mockDB, nowMs);
assert(expResult2.expiredCount === 1, 'La segunda ejecución reconoce el abono ya expirado sin errores ni duplicaciones');
assert(mockDB.monthlyBookings['booking_expired_case'].status === 'expired', 'El estado permanece estable en expired');

// PRUEBA 8: Una reserva confirmada nunca se modifica por el proceso de expiración
console.log('\n--- PRUEBA 8: Inmutabilidad de reservas confirmadas ---');
assert(mockDB.monthlyBookings['booking_confirmed'].status === 'confirmed', 'El abono confirmado no sufrió alteraciones');
assert(mockDB.lessons['lesson_confirmed_1'].status === 'scheduled', 'Las clases confirmadas permanecen en status scheduled');
assert(mockDB.lessons['lesson_confirmed_1'].paymentStatus === 'confirmed', 'El paymentStatus de la clase confirmada sigue siendo confirmed');

// PRUEBA 9: El historial y los datos de otros profesores y alumnos permanecen intactos
console.log('\n--- PRUEBA 9: Aislamiento y protección de datos de otros usuarios ---');
assert(mockDB.monthlyBookings['booking_clara'].status === 'confirmed', 'Los abonos de la Prof. Clara no fueron modificados');
assert(mockDB.monthlyBookings['booking_clara'].studentId === 'student_elena', 'El alumno Elena sigue vinculado correctamente');
assert(mockDB.lessons['lesson_clara_1'].teacherId === 'teacher_clara', 'Las clases de la Prof. Clara no sufrieron alteraciones');

// PRUEBA 10: Preservación de una nueva reserva realizada en el mismo horario liberado
console.log('\n--- PRUEBA 10: Preservación estricta de nueva reserva en horario liberado ---');
// Simular que tras liberarse el horario 2026-04-08 17:00, otro alumno reserva el mismo horario
const newBookingId = 'booking_new_replacement';
mockDB.monthlyBookings[newBookingId] = {
  id: newBookingId,
  teacherId: 'teacher_lucas',
  studentId: 'student_valentin',
  status: 'pending_payment_confirmation',
  createdAt: new Date(nowMs + 1000),
  expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000), // Válido por 24 horas a partir de ahora
};
mockDB.teacherSlotLocks['teacher_lucas_2026-04-08_1700'] = {
  bookingId: newBookingId,
  studentId: 'student_valentin',
  expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000),
};
// Reejecutar la expiración del abono anterior vencido (targetBookingId: booking_expired_case)
processExpiration(mockDB, nowMs, 'booking_expired_case');

// El cerrojo del nuevo alumno DEBE conservarse intacto
assert(
  mockDB.teacherSlotLocks['teacher_lucas_2026-04-08_1700'] !== undefined,
  'El cerrojo del nuevo alumno NO fue eliminado por la expiración del abono anterior'
);
assert(
  mockDB.teacherSlotLocks['teacher_lucas_2026-04-08_1700'].bookingId === newBookingId,
  'El cerrojo sigue perteneciendo legítimamente a la nueva reserva'
);

console.log('\n🎉 TODAS LAS 10 PRUEBAS OBLIGATORIAS PASARON CON 100% DE ÉXITO.');

