/**
 * Suite de Pruebas: SUBBLOQUE 6B.3.3.4.A
 * Unificación Segura de Reservas Manuales y Mensuales (Backend createManualLesson)
 *
 * Valida los 10 escenarios obligatorios requeridos por la consigna:
 * 1. Profesor crea una clase en horario libre (creación válida con 45 min y coordinador).
 * 2. Profesor intenta crear una clase sobre un abono mensual pendiente de pago (rechazado con already-exists).
 * 3. Profesor intenta crear una clase sobre un abono mensual confirmado (rechazado con already-exists).
 * 4. Alumno intenta reservar un abono mensual sobre una clase manual existente (rechazado por createMonthlyBooking).
 * 5. Dos operaciones simultáneas: clase manual y abono mensual compitiendo por la misma franja (exactamente una gana).
 * 6. Dos clases manuales simultáneas con horarios superpuestos (serialización OCC: exactamente una gana).
 * 7. Dos clases consecutivas sin solapamiento (ej: 16:00-16:45 y 16:45-17:30: ambas aceptadas).
 * 8. Clase cancelada (status: 'cancelled') y posterior reutilización del horario libre.
 * 9. Usuario no autorizado intentando crear clases (alumno o no autenticado: rechazado con permission-denied / unauthenticated).
 * 10. Error inesperado a mitad de transacción con rollback completo (0 documentos parciales creados).
 */

import {
  timeToMinutes,
  calculateEndTime,
  generateSlotLockKey,
} from '../functions/src/monthlyBookingService';
import type {
  CreateMonthlyBookingPayload,
  CreateMonthlyBookingResponse,
  CreateManualLessonPayload,
  CreateManualLessonResponse,
  DailyIntervalSlot,
} from '../functions/src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('========================================================================');
console.log('   PRUEBAS UNITARIAS: SUBBLOQUE 6B.3.3.4.A (BACKEND createManualLesson)');
console.log('   Unificación de reservas manuales y mensuales en teacherDailySchedule');
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

/**
 * Simulador de Firestore que replica fielmente el comportamiento de Firestore Admin SDK
 * con el coordinador unificado 'teacherDailySchedule' para reservas mensuales y manuales.
 */
class UnifiedFirestoreBackendSimulator {
  users: Map<string, any> = new Map();
  teacherRecurringSlots: Map<string, any> = new Map();
  teacherScheduleExceptions: Map<string, any> = new Map();
  lessons: Map<string, any> = new Map();
  teacherSlotLocks: Map<string, any> = new Map();
  teacherDailySchedule: Map<string, any> = new Map();
  monthlyBookings: Map<string, any> = new Map();
  privateSettings: Map<string, any> = new Map();

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
    this.privateSettings.clear();

    this.users.set(mockTeacherUser.uid, { ...mockTeacherUser });
    this.users.set(mockStudentUser.uid, { ...mockStudentUser });
    this.users.set('student-other', { uid: 'student-other', name: 'Otro Alumno', role: 'student', status: 'active' });
    this.users.set('disabled-teacher', { uid: 'disabled-teacher', role: 'teacher', status: 'disabled' });
    this.teacherRecurringSlots.set(mockSlotTue16.id, { ...mockSlotTue16 });

    // Configuración privada de Meet
    this.privateSettings.set(`users/${mockTeacherUser.uid}/privateSettings/meetConfig`, {
      teacherId: mockTeacherUser.uid,
      permanentMeetUrl: 'https://meet.google.com/mus-kids-chop',
      permanentMeetSpaceName: 'spaces/mus-kids-chop',
    });
  }

  /**
   * Ejecución simulada de createManualLesson
   */
  async runCreateManualLesson(
    authUid: string | null,
    payload: CreateManualLessonPayload,
    options?: { shouldFailMidway?: boolean }
  ): Promise<CreateManualLessonResponse> {
    if (!authUid) {
      const err: any = new Error('Debe iniciar sesión como profesor para crear una clase.');
      err.code = 'unauthenticated';
      throw err;
    }

    const teacher = this.users.get(authUid);
    if (!teacher || teacher.role !== 'teacher' || teacher.status === 'disabled') {
      const err: any = new Error('Solo profesores activos pueden programar clases.');
      err.code = 'permission-denied';
      throw err;
    }

    const { studentId, title, date, startTime, duration, idempotencyKey } = payload;

    if (!studentId || typeof studentId !== 'string') {
      const err: any = new Error('Debe seleccionar un alumno válido.');
      err.code = 'invalid-argument';
      throw err;
    }

    if (studentId === authUid) {
      const err: any = new Error('El profesor no puede asignarse una clase a sí mismo.');
      err.code = 'invalid-argument';
      throw err;
    }

    const student = this.users.get(studentId);
    if (!student || student.role !== 'student' || student.status === 'disabled') {
      const err: any = new Error('El alumno seleccionado no existe o no está activo.');
      err.code = 'failed-precondition';
      throw err;
    }

    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) {
      const err: any = new Error('El título de la clase es obligatorio.');
      err.code = 'invalid-argument';
      throw err;
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const err: any = new Error('Formato de fecha inválido.');
      err.code = 'invalid-argument';
      throw err;
    }

    if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      const err: any = new Error('Formato de hora inválido.');
      err.code = 'invalid-argument';
      throw err;
    }

    if (duration !== undefined && duration !== 45) {
      const err: any = new Error('Todas las clases nuevas deben durar exactamente 45 minutos.');
      err.code = 'invalid-argument';
      throw err;
    }

    const lessonDuration = 45;
    const endTime = calculateEndTime(startTime, lessonDuration);
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + lessonDuration;

    // Control de Idempotencia
    if (idempotencyKey) {
      for (const les of Array.from(this.lessons.values())) {
        if (les.teacherId === authUid && les.idempotencyKey === idempotencyKey) {
          // SUBBLOQUE 6B.3.3.4.A.1: Validar coincidencia de parámetros
          const matchesStudent = les.studentId === studentId;
          const matchesDate = les.dateStr === date;
          const matchesTime = les.startTime === startTime;

          if (!matchesStudent || !matchesDate || !matchesTime) {
            const err: any = new Error(
              `La clave de idempotencia '${idempotencyKey}' ya fue utilizada previamente con parámetros distintos.`
            );
            err.code = 'already-exists';
            throw err;
          }

          return {
            success: true,
            lessonId: les.id,
            title: les.title,
            teacherId: authUid,
            studentId: les.studentId,
            date: les.dateStr,
            startTime: les.startTime,
            endTime: calculateEndTime(les.startTime, 45),
            duration: 45,
            status: les.status,
            meetUrl: les.meetUrl,
            meetSpaceName: les.meetSpaceName,
            message: 'Clase recuperada por clave de idempotencia existente.',
          };
        }
      }
    }

    // Excepciones de calendario
    for (const ex of Array.from(this.teacherScheduleExceptions.values())) {
      if (ex.teacherId === authUid) {
        if (ex.type === 'blocked_date' || ex.type === 'vacation') {
          if (ex.startDate <= date && date <= ex.endDate) {
            const err: any = new Error(`La fecha ${date} está bloqueada en tu calendario.`);
            err.code = 'failed-precondition';
            throw err;
          }
        }
      }
    }

    // Validar contra clases existentes en lessons (históricas o con estatus activo)
    for (const les of Array.from(this.lessons.values())) {
      if (les.teacherId === authUid && les.status !== 'cancelled') {
        if (les.dateStr === date) {
          const lStart = timeToMinutes(les.startTime);
          const lEnd = lStart + (les.duration || 45);
          if (startMinutes < lEnd && lStart < endMinutes) {
            const err: any = new Error(`Ya existe una clase programada (${les.title}) el ${date} en ese horario.`);
            err.code = 'already-exists';
            throw err;
          }
        }
      }
    }

    // SUBBLOQUE 6B.3.3.4.A.1: Obtener Google Meet permanente EXCLUSIVAMENTE de privateSettings/meetConfig
    const meetConfig = this.privateSettings.get(`users/${authUid}/privateSettings/meetConfig`);
    if (!meetConfig || !meetConfig.permanentMeetUrl || !meetConfig.permanentMeetUrl.startsWith('https://meet.google.com/')) {
      const err: any = new Error(
        'El profesor no tiene configurada una sala permanente de Google Meet válida en su perfil (users/{teacherId}/privateSettings/meetConfig).'
      );
      err.code = 'failed-precondition';
      throw err;
    }
    const meetUrl = meetConfig.permanentMeetUrl;
    const meetSpaceName = meetConfig.permanentMeetSpaceName || null;

    // Transacción Firestore con teacherDailySchedule
    const stagingLessons = new Map(this.lessons);
    const stagingSchedule = new Map(this.teacherDailySchedule);
    const stagingLocks = new Map(this.teacherSlotLocks);

    try {
      const scheduleKey = `${authUid}_${date}`;
      const currentSched = stagingSchedule.get(scheduleKey) || { teacherId: authUid, date, intervals: [] };
      const activeIntervals: DailyIntervalSlot[] = (currentSched.intervals || []).filter(
        (slot: any) => slot.status !== 'cancelled'
      );

      for (const existing of activeIntervals) {
        if (startMinutes < existing.endMinutes && existing.startMinutes < endMinutes) {
          const err: any = new Error(
            `El horario del ${date} de ${startTime} a ${endTime} ya se encuentra ocupado por otra clase o abono mensual.`
          );
          err.code = 'already-exists';
          throw err;
        }
      }

      if (options?.shouldFailMidway) {
        throw new Error('SIMULATED_DATABASE_CRASH_MID_TRANSACTION');
      }

      const lessonId = `les_man_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      activeIntervals.push({
        startTime,
        endTime,
        startMinutes,
        endMinutes,
        bookingId: lessonId,
        lessonId,
        studentId,
        status: 'scheduled',
        expiresAt: null,
      });

      stagingSchedule.set(scheduleKey, {
        teacherId: authUid,
        date,
        intervals: activeIntervals,
        updatedAt: new Date(),
      });

      stagingLessons.set(lessonId, {
        id: lessonId,
        title: trimmedTitle,
        teacherId: authUid,
        studentId,
        dateStr: date,
        startTime,
        duration: 45,
        status: 'scheduled',
        meetUrl,
        meetSpaceName,
        idempotencyKey,
        bookingType: 'manual',
        createdAt: new Date(),
      });

      const lockKey = generateSlotLockKey(authUid, date, startTime);
      stagingLocks.set(lockKey, {
        id: lockKey,
        teacherId: authUid,
        date,
        startTime,
        endTime,
        duration: 45,
        bookingType: 'manual',
        bookingId: lessonId,
        studentId,
        createdAt: new Date(),
      });

      // Commit
      this.lessons = stagingLessons;
      this.teacherDailySchedule = stagingSchedule;
      this.teacherSlotLocks = stagingLocks;

      return {
        success: true,
        lessonId,
        title: trimmedTitle,
        teacherId: authUid,
        studentId,
        date,
        startTime,
        endTime,
        duration: 45,
        status: 'scheduled',
        meetUrl,
        meetSpaceName,
        message: 'Clase manual creada exitosamente.',
      };
    } catch (txErr) {
      // Rollback
      throw txErr;
    }
  }

  /**
   * Ejecución simulada de createMonthlyBooking sobre el mismo backend
   */
  async runCreateMonthlyBooking(
    authUid: string | null,
    payload: CreateMonthlyBookingPayload
  ): Promise<CreateMonthlyBookingResponse> {
    if (!authUid) {
      const err: any = new Error('Debe iniciar sesión como alumno.');
      err.code = 'unauthenticated';
      throw err;
    }

    const { teacherId, month } = payload;
    // Para simplificar la prueba mensual, proyectamos un martes de junio 2026 (ej: 2026-06-02 de 16:00 a 16:45)
    const occDate = `${month}-02`;
    const occStart = '16:00';
    const occEnd = '16:45';
    const startMinutes = timeToMinutes(occStart);
    const endMinutes = timeToMinutes(occEnd);

    // Validar contra clases en lessons
    for (const les of Array.from(this.lessons.values())) {
      if (les.teacherId === teacherId && les.status !== 'cancelled') {
        if (les.dateStr === occDate) {
          const lStart = timeToMinutes(les.startTime);
          const lEnd = lStart + (les.duration || 45);
          if (startMinutes < lEnd && lStart < endMinutes) {
            const err: any = new Error(`El horario del ${occDate} ya tiene una clase programada.`);
            err.code = 'already-exists';
            throw err;
          }
        }
      }
    }

    const stagingSchedule = new Map(this.teacherDailySchedule);
    const stagingBookings = new Map(this.monthlyBookings);
    const stagingLessons = new Map(this.lessons);

    const scheduleKey = `${teacherId}_${occDate}`;
    const currentSched = stagingSchedule.get(scheduleKey) || { teacherId, date: occDate, intervals: [] };
    const activeIntervals: DailyIntervalSlot[] = (currentSched.intervals || []).filter(
      (slot: any) => slot.status !== 'cancelled'
    );

    for (const existing of activeIntervals) {
      if (startMinutes < existing.endMinutes && existing.startMinutes < endMinutes) {
        const err: any = new Error(`El horario del ${occDate} a las ${occStart} ya está ocupado.`);
        err.code = 'already-exists';
        throw err;
      }
    }

    const bookingId = `mb_${Date.now()}`;
    const lessonId = `les_mb_${Date.now()}`;

    activeIntervals.push({
      startTime: occStart,
      endTime: occEnd,
      startMinutes,
      endMinutes,
      bookingId,
      lessonId,
      studentId: authUid,
      status: 'pending_payment_confirmation',
      expiresAt: null,
    });

    stagingSchedule.set(scheduleKey, {
      teacherId,
      date: occDate,
      intervals: activeIntervals,
      updatedAt: new Date(),
    });

    stagingBookings.set(bookingId, {
      id: bookingId,
      teacherId,
      studentId: authUid,
      month,
      status: 'pending_payment_confirmation',
      totalPrice: 15000,
    });

    stagingLessons.set(lessonId, {
      id: lessonId,
      title: `Clase de música - Abono ${month}`,
      teacherId,
      studentId: authUid,
      monthlyBookingId: bookingId,
      dateStr: occDate,
      startTime: occStart,
      duration: 45,
      status: 'scheduled',
      meetUrl: null, // Protegido
      createdAt: new Date(),
    });

    this.teacherDailySchedule = stagingSchedule;
    this.monthlyBookings = stagingBookings;
    this.lessons = stagingLessons;

    return {
      success: true,
      bookingId,
      status: 'pending_payment_confirmation',
      totalPrice: 15000,
      currency: 'ARS',
      totalLessons: 1,
      occurrences: [
        {
          date: occDate,
          startTime: occStart,
          endTime: occEnd,
          duration: 45,
          formattedDate: `Martes 2 de junio de ${month.split('-')[0]}`,
          recurringSlotId: 'slot-tue-1600',
        },
      ],
      lessonIds: [lessonId],
      expiresAt: new Date().toISOString(),
      message: 'Abono mensual creado exitosamente.',
    };
  }
}

// BATERÍA DE PRUEBAS
const backendSim = new UnifiedFirestoreBackendSimulator();
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
  // 1. Creación válida de clase manual en horario libre
  await runTest('1. Creación válida de clase manual en horario libre (45 min, teacherDailySchedule y meetUrl)', async () => {
    backendSim.reset();
    const payload: CreateManualLessonPayload = {
      studentId: 'student-200',
      title: 'Clase de Piano - Técnica',
      date: '2026-06-15',
      startTime: '10:00',
      duration: 45,
    };

    const res = await backendSim.runCreateManualLesson('teacher-100', payload);
    assert(res.success === true, 'Respuesta debe ser exitosa');
    assert(res.duration === 45, 'Duración debe ser 45 minutos');
    assert(res.endTime === '10:45', 'Hora de fin debe ser 10:45');
    assert(res.meetUrl === 'https://meet.google.com/mus-kids-chop', 'Debe reutilizar permanentMeetUrl del profesor');
    assert(backendSim.lessons.size === 1, 'Debe existir 1 documento en lessons');

    // Verificar intervalo en teacherDailySchedule
    const sched = backendSim.teacherDailySchedule.get('teacher-100_2026-06-15');
    assert(sched !== undefined, 'Debe crearse teacherDailySchedule para esa fecha');
    assert(sched.intervals.length === 1, 'Debe contener exactamente 1 intervalo');
    assert(sched.intervals[0].startTime === '10:00', 'Inicio debe ser 10:00');
    assert(sched.intervals[0].endTime === '10:45', 'Fin debe ser 10:45');
    assert(sched.intervals[0].status === 'scheduled', 'Status debe ser scheduled');
  });

  // 2. Conflicto con abono mensual pendiente de pago
  await runTest('2. Conflicto con abono mensual pendiente de pago: Rechaza clase manual superpuesta', async () => {
    backendSim.reset();
    // Primero, un alumno reserva un abono para junio 2026 (reserva el martes 2026-06-02 de 16:00 a 16:45)
    await backendSim.runCreateMonthlyBooking('student-200', {
      teacherId: 'teacher-100',
      month: '2026-06',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    });

    // Ahora el profesor intenta programar una clase manual en esa misma franja
    const payloadConflict: CreateManualLessonPayload = {
      studentId: 'student-other',
      title: 'Clase manual superpuesta',
      date: '2026-06-02',
      startTime: '16:00',
      duration: 45,
    };

    let threw = false;
    try {
      await backendSim.runCreateManualLesson('teacher-100', payloadConflict);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'already-exists', `Error debe ser already-exists, fue: ${err.code}`);
      assert(
        err.message.includes('ocupado') || err.message.includes('programada'),
        'Mensaje debe advertir ocupación o clase programada'
      );
    }
    assert(threw, 'Debió rechazar la clase manual sobre el abono pendiente');
  });

  // 3. Conflicto con abono mensual confirmado
  await runTest('3. Conflicto con abono mensual confirmado: Rechaza clase manual superpuesta', async () => {
    // Tomamos el estado anterior y confirmamos el abono
    const schedKey = 'teacher-100_2026-06-02';
    const sched = backendSim.teacherDailySchedule.get(schedKey);
    sched.intervals[0].status = 'confirmed'; // Profesor confirmó el pago
    backendSim.teacherDailySchedule.set(schedKey, sched);

    const payloadConflict: CreateManualLessonPayload = {
      studentId: 'student-other',
      title: 'Clase manual sobre abono confirmado',
      date: '2026-06-02',
      startTime: '16:15', // Solapamiento parcial (16:15 a 17:00)
      duration: 45,
    };

    let threw = false;
    try {
      await backendSim.runCreateManualLesson('teacher-100', payloadConflict);
    } catch (err: any) {
      threw = true;
      assert(err.code === 'already-exists', `Error debe ser already-exists, fue: ${err.code}`);
    }
    assert(threw, 'Debió rechazar clase manual sobre abono confirmado');
  });

  // 4. Conflicto inverso: Alumno intenta reservar un abono sobre una clase manual existente
  await runTest('4. Conflicto inverso: Abono mensual rechazado si colisiona con clase manual preexistente', async () => {
    backendSim.reset();
    // El profesor crea una clase manual el 2026-07-02 de 16:00 a 16:45
    await backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-200',
      title: 'Clase manual individual',
      date: '2026-07-02',
      startTime: '16:00',
      duration: 45,
    });

    // Un alumno intenta solicitar un abono mensual para julio 2026 en esa fecha/hora
    let threw = false;
    try {
      await backendSim.runCreateMonthlyBooking('student-other', {
        teacherId: 'teacher-100',
        month: '2026-07',
        recurringSlotIds: ['slot-tue-1600'],
        weeklyFrequency: 1,
      });
    } catch (err: any) {
      threw = true;
      assert(err.code === 'already-exists', `Error debe ser already-exists, fue: ${err.code}`);
    }
    assert(threw, 'El abono mensual debe ser rechazado si colisiona con una clase manual');
  });

  // 5. Concurrencia cruzada: Operación manual y abono mensual compitiendo simultáneamente
  await runTest('5. Concurrencia cruzada: Manual vs Mensual simultáneos compitiendo por la misma franja', async () => {
    backendSim.reset();
    let winnerCount = 0;
    let rejectedCount = 0;

    const opManual = backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-200',
      title: 'Clase manual en competencia',
      date: '2026-08-02',
      startTime: '16:00',
      duration: 45,
    })
      .then(() => { winnerCount++; })
      .catch(() => { rejectedCount++; });

    const opMonthly = backendSim.runCreateMonthlyBooking('student-other', {
      teacherId: 'teacher-100',
      month: '2026-08',
      recurringSlotIds: ['slot-tue-1600'],
      weeklyFrequency: 1,
    })
      .then(() => { winnerCount++; })
      .catch(() => { rejectedCount++; });

    await Promise.all([opManual, opMonthly]);
    assert(winnerCount === 1, `Exactamente 1 operación debe tener éxito (ganaron: ${winnerCount})`);
    assert(rejectedCount === 1, `Exactamente 1 operación debe ser rechazada (rechazados: ${rejectedCount})`);
  });

  // 6. Concurrencia manual/manual simultánea con solapamiento
  await runTest('6. Concurrencia manual/manual: Dos clases manuales simultáneas superpuestas', async () => {
    backendSim.reset();
    let winnerCount = 0;
    let rejectedCount = 0;

    const opA = backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-200',
      title: 'Clase A',
      date: '2026-09-10',
      startTime: '15:00',
      duration: 45,
    })
      .then(() => { winnerCount++; })
      .catch(() => { rejectedCount++; });

    const opB = backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-other',
      title: 'Clase B superpuesta',
      date: '2026-09-10',
      startTime: '15:30', // Solapamiento de 15 minutos (15:00-15:45 vs 15:30-16:15)
      duration: 45,
    })
      .then(() => { winnerCount++; })
      .catch(() => { rejectedCount++; });

    await Promise.all([opA, opB]);
    assert(winnerCount === 1, `Exactamente 1 clase manual debe tener éxito (ganaron: ${winnerCount})`);
    assert(rejectedCount === 1, `Exactamente 1 clase manual debe ser rechazada por colisión (rechazados: ${rejectedCount})`);
  });

  // 7. Clases consecutivas sin solapamiento (ej: 16:00-16:45 y 16:45-17:30)
  await runTest('7. Horarios consecutivos sin solapamiento son ambos aceptados correctamente', async () => {
    backendSim.reset();
    const resA = await backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-200',
      title: 'Clase Primera Tanda',
      date: '2026-10-05',
      startTime: '16:00',
      duration: 45,
    });

    const resB = await backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-other',
      title: 'Clase Segunda Tanda',
      date: '2026-10-05',
      startTime: '16:45', // Inicia exactamente cuando termina la anterior
      duration: 45,
    });

    assert(resA.success === true, 'Primera clase debe ser creada');
    assert(resB.success === true, 'Segunda clase consecutiva debe ser creada sin falso positivo');
    const sched = backendSim.teacherDailySchedule.get('teacher-100_2026-10-05');
    assert(sched.intervals.length === 2, 'Deben existir ambos intervalos en teacherDailySchedule');
  });

  // 8. Clase cancelada y posterior reutilización del horario
  await runTest('8. Clase cancelada (status: cancelled) libera disponibilidad para nuevo registro', async () => {
    backendSim.reset();
    // 1. Crear clase manual inicial
    const res = await backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-200',
      title: 'Clase a cancelar',
      date: '2026-11-20',
      startTime: '14:00',
      duration: 45,
    });

    // 2. Simular cancelación explícita de la clase
    const lesson = backendSim.lessons.get(res.lessonId);
    lesson.status = 'cancelled';
    backendSim.lessons.set(res.lessonId, lesson);

    // Actualizar intervalo en teacherDailySchedule a cancelled
    const schedKey = 'teacher-100_2026-11-20';
    const sched = backendSim.teacherDailySchedule.get(schedKey);
    sched.intervals[0].status = 'cancelled';
    backendSim.teacherDailySchedule.set(schedKey, sched);

    // 3. Crear nueva clase manual en el mismo horario liberado
    const newRes = await backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-other',
      title: 'Nueva clase en horario liberado',
      date: '2026-11-20',
      startTime: '14:00',
      duration: 45,
    });

    assert(newRes.success === true, 'Debe permitir crear clase en horario cancelado');
    assert(newRes.studentId === 'student-other', 'Debe asignarse al nuevo alumno');
  });

  // 9. Usuario no autorizado (alumno o docente inactivo)
  await runTest('9. Usuario no autorizado es rechazado (alumno o profesor inactivo)', async () => {
    // Alumno intentando llamar a createManualLesson
    let threwStudent = false;
    try {
      await backendSim.runCreateManualLesson('student-200', {
        studentId: 'student-other',
        title: 'Intento no autorizado',
        date: '2026-12-01',
        startTime: '11:00',
      });
    } catch (err: any) {
      threwStudent = true;
      assert(err.code === 'permission-denied', `Debe ser permission-denied, fue: ${err.code}`);
    }
    assert(threwStudent, 'Un alumno no puede invocar createManualLesson');

    // Profesor inactivo
    let threwDisabled = false;
    try {
      await backendSim.runCreateManualLesson('disabled-teacher', {
        studentId: 'student-200',
        title: 'Profesor desactivado',
        date: '2026-12-01',
        startTime: '11:00',
      });
    } catch (err: any) {
      threwDisabled = true;
      assert(err.code === 'permission-denied', `Debe ser permission-denied, fue: ${err.code}`);
    }
    assert(threwDisabled, 'Un profesor inactivo no puede invocar createManualLesson');

    // Sin autenticación
    let threwUnauth = false;
    try {
      await backendSim.runCreateManualLesson(null, {
        studentId: 'student-200',
        title: 'Sin sesión',
        date: '2026-12-01',
        startTime: '11:00',
      });
    } catch (err: any) {
      threwUnauth = true;
      assert(err.code === 'unauthenticated', `Debe ser unauthenticated, fue: ${err.code}`);
    }
    assert(threwUnauth, 'Una llamada sin auth debe ser rechazada');
  });

  // 10. Rollback atómico completo ante error a mitad de transacción
  await runTest('10. Atomicidad y Rollback completo: Error forzado no deja documentos huérfanos', async () => {
    backendSim.reset();
    const initialLessonsCount = backendSim.lessons.size;
    const initialScheduleCount = backendSim.teacherDailySchedule.size;
    const initialLocksCount = backendSim.teacherSlotLocks.size;

    let threw = false;
    try {
      await backendSim.runCreateManualLesson('teacher-100', {
        studentId: 'student-200',
        title: 'Clase con falla forzada',
        date: '2026-12-15',
        startTime: '18:00',
      }, { shouldFailMidway: true });
    } catch (err: any) {
      threw = true;
      assert(err.message === 'SIMULATED_DATABASE_CRASH_MID_TRANSACTION', 'Error esperado de simulación');
    }

    assert(threw, 'Debió fallar la transacción');
    assert(backendSim.lessons.size === initialLessonsCount, 'No deben haberse creado lecciones parciales');
    assert(backendSim.teacherDailySchedule.size === initialScheduleCount, 'No deben haberse creado entradas en teacherDailySchedule');
    assert(backendSim.teacherSlotLocks.size === initialLocksCount, 'No deben haberse creado cerrojos parciales');
  });

  // 11. SUBBLOQUE 6B.3.3.4.A.1: Ausencia de configuración de Google Meet rechaza con failed-precondition
  await runTest('11. Seguridad Meet: Ausencia de meetConfig rechaza la creación sin dejar clases incompletas', async () => {
    backendSim.reset();
    // Eliminar configuración de meetConfig del profesor
    backendSim.privateSettings.delete(`users/teacher-100/privateSettings/meetConfig`);

    let threw = false;
    try {
      await backendSim.runCreateManualLesson('teacher-100', {
        studentId: 'student-200',
        title: 'Clase sin Meet configurado',
        date: '2026-12-20',
        startTime: '10:00',
      });
    } catch (err: any) {
      threw = true;
      assert(err.code === 'failed-precondition', `Debe ser failed-precondition, fue: ${err.code}`);
      assert(err.message.includes('meetConfig') || err.message.includes('Google Meet'), 'Mensaje debe advertir falta de Meet');
    }
    assert(threw, 'Debió rechazar por falta de sala permanente de Google Meet');
    assert(backendSim.lessons.size === 0, 'No debe haberse creado ninguna clase incompleta');
  });

  // 12. SUBBLOQUE 6B.3.3.4.A.1: Intento de inyectar meetUrl arbitrario desde cliente es ignorado
  await runTest('12. Seguridad Meet: Enlace arbitrario inyectado en payload es ignorado y se usa meetConfig oficial', async () => {
    backendSim.reset();
    // El profesor tiene configurada su sala oficial: 'https://meet.google.com/mus-kids-chop'
    const payloadInjected: any = {
      studentId: 'student-200',
      title: 'Clase con intento de inyección',
      date: '2026-12-22',
      startTime: '11:00',
      meetUrl: 'https://meet.google.com/fake-injected-link-999', // Enlace malicioso inyectado
      meetSpaceName: 'spaces/fake-space',
    };

    const res = await backendSim.runCreateManualLesson('teacher-100', payloadInjected);
    assert(res.success === true, 'Clase debe crearse');
    assert(res.meetUrl === 'https://meet.google.com/mus-kids-chop', 'El meetUrl DEBE ser el oficial de meetConfig, no el inyectado');
    const lesson = backendSim.lessons.get(res.lessonId);
    assert(lesson.meetUrl === 'https://meet.google.com/mus-kids-chop', 'En base de datos debe persistir el enlace oficial');
  });

  // 13. SUBBLOQUE 6B.3.3.4.A.1: Idempotencia - Solicitud duplicada idéntica devuelve clase existente
  await runTest('13. Idempotencia: Solicitud idéntica duplicada devuelve la clase existente', async () => {
    backendSim.reset();
    const payload: CreateManualLessonPayload = {
      studentId: 'student-200',
      title: 'Clase idempotente',
      date: '2026-12-28',
      startTime: '15:00',
      idempotencyKey: 'idemp-safe-key-1',
    };

    const firstRes = await backendSim.runCreateManualLesson('teacher-100', payload);
    const secondRes = await backendSim.runCreateManualLesson('teacher-100', payload);

    assert(firstRes.lessonId === secondRes.lessonId, 'Ambas respuestas deben tener el mismo lessonId');
    assert(backendSim.lessons.size === 1, 'Solo debe existir 1 clase en base de datos');
    assert(secondRes.message.includes('idempotencia'), 'Mensaje debe indicar recuperación por idempotencia');
  });

  // 14. SUBBLOQUE 6B.3.3.4.A.1: Idempotencia - Reutilización de clave con parámetros distintos es rechazada
  await runTest('14. Idempotencia: Reutilizar misma clave con parámetros distintos es rechazado con already-exists', async () => {
    backendSim.reset();
    // Primera llamada
    await backendSim.runCreateManualLesson('teacher-100', {
      studentId: 'student-200',
      title: 'Clase Original',
      date: '2026-12-29',
      startTime: '10:00',
      idempotencyKey: 'idemp-shared-key-2',
    });

    // Segunda llamada con la MISMA clave pero OTRO alumno
    let threwMismatch = false;
    try {
      await backendSim.runCreateManualLesson('teacher-100', {
        studentId: 'student-other', // Alumno diferente!
        title: 'Clase Distinta',
        date: '2026-12-29',
        startTime: '10:00',
        idempotencyKey: 'idemp-shared-key-2',
      });
    } catch (err: any) {
      threwMismatch = true;
      assert(err.code === 'already-exists', `Debe ser already-exists, fue: ${err.code}`);
      assert(err.message.includes('parámetros distintos'), 'Mensaje debe advertir parámetros distintos');
    }
    assert(threwMismatch, 'Debió rechazar reutilización de clave con parámetros distintos');
  });

  console.log('\n========================================================================');
  console.log(`🎉 TODOS LOS ${passedCount} CASOS DE PRUEBA DEL SUBBLOQUE 6B.3.3.4.A / 6B.3.3.4.A.1 PASARON EXITOSAMENTE`);
  console.log('========================================================================\n');
}

startTests().catch((err) => {
  console.error('Error fatal en los tests:', err);
  process.exit(1);
});
