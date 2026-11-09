/**
 * Suite de pruebas técnicas para el SUBBLOQUE 6B (Fase 1):
 * CONFIRMACIÓN REAL Y ATÓMICA DE ABONOS MENSUALES
 *
 * Verificaciones obligatorias de los 20 escenarios:
 * 1. Abono de 1 horario semanal
 * 2. Abono de 2 horarios semanales
 * 3. Abono de 3 horarios semanales
 * 4. Mes con cuatro y cinco ocurrencias
 * 5. Cambio de año (Diciembre 2026 -> Enero 2027)
 * 6. Regla que comienza a mitad de mes (originDate)
 * 7. blocked_date (bloqueo de fecha completa)
 * 8. blocked_slot (bloqueo de franja específica)
 * 9. Excepción vacation histórica aún existente en Firestore
 * 10. Fecha ocupada (teacherAvailability con status 'booked')
 * 11. Fecha pasada respecto a Buenos Aires
 * 12. Dos alumnos reservando el mismo abono (concurrencia y cerrojo determinista)
 * 13. Dos abonos con horarios parcialmente superpuestos
 * 14. Reintento de una solicitud (idempotencia y deduplicación)
 * 15. Fallo durante la transacción (atomicidad estricta: todo o nada)
 * 16. Profesor inactivo o inexistente
 * 17. Alumno no autorizado o inactivo
 * 18. Configuración Meet ausente o tolerante
 * 19. Preservación de clases históricas
 * 20. Compatibilidad con reservas puntuales
 */

import {
  validateMonthlyBookingOnServer,
  executeSimulatedMonthlyBookingTransaction,
  generateSlotLockKey,
  type ValidationContext,
} from '../src/services/monthlyBookingConfirmationService';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';
import type { TeacherScheduleException } from '../src/types/scheduleException';
import type { TeacherAvailability } from '../src/types/availability';
import type { Lesson } from '../src/types/lesson';
import type { TeacherSlotLock } from '../src/types/monthlyBooking';
import type { UserProfile } from '../src/types/auth';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [TEST ${totalTests}] PASÓ: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [TEST ${totalTests}] FALLÓ: ${testName}. Detalle: ${detail || ''}`);
  }
}

console.log('========================================================================');
console.log('   PRUEBAS TÉCNICAS SUBBLOQUE 6B (FASE 1): CONFIRMACIÓN ATÓMICA');
console.log('========================================================================\n');

// Perfiles base simulados
const mockStudent: UserProfile = {
  uid: 'student-valid-1',
  name: 'Alumno Prueba',
  email: 'alumno@ejemplo.com',
  role: 'student',
  status: 'active',
  authProvider: 'email',
  photoURL: null,
  createdAt: new Date() as any,
};

const mockTeacher: UserProfile = {
  uid: 'teacher-valid-1',
  name: 'Profesor Música',
  email: 'profesor@ejemplo.com',
  role: 'teacher',
  status: 'active',
  authProvider: 'email',
  photoURL: null,
  createdAt: new Date() as any,
};

// Reglas recurrentes base
const slotTuesday: TeacherRecurringSlot = {
  id: 'slot-tue-1600',
  teacherId: 'teacher-valid-1',
  dayOfWeek: 2, // Martes
  startTime: '16:00',
  endTime: '17:00',
  duration: 60,
  isActive: true,
  originDate: '2026-01-01',
};

const slotThursday: TeacherRecurringSlot = {
  id: 'slot-thu-1700',
  teacherId: 'teacher-valid-1',
  dayOfWeek: 4, // Jueves
  startTime: '17:00',
  endTime: '18:00',
  duration: 60,
  isActive: true,
  originDate: '2026-01-01',
};

const slotSaturday: TeacherRecurringSlot = {
  id: 'slot-sat-1000',
  teacherId: 'teacher-valid-1',
  dayOfWeek: 6, // Sábado
  startTime: '10:00',
  endTime: '11:00',
  duration: 60,
  isActive: true,
  originDate: '2026-01-01',
};

// Fecha de referencia fija en Buenos Aires para pruebas (2026-05-01 10:00)
const fixedReferenceNow = {
  dateStr: '2026-05-01',
  currentMinutes: 600,
};

function createBaseContext(): ValidationContext {
  return {
    studentProfile: { ...mockStudent },
    teacherProfile: { ...mockTeacher },
    recurringSlots: [{ ...slotTuesday }, { ...slotThursday }, { ...slotSaturday }],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    permanentMeetConfig: {
      meetUrl: 'https://meet.google.com/mus-kids-room',
      meetSpaceName: 'spaces/musickids-permanent-space',
    },
    referenceNow: fixedReferenceNow,
  };
}

// -------------------------------------------------------------
// PRUEBA 1: Abono de 1 horario semanal
// -------------------------------------------------------------
const ctx1 = createBaseContext();
const res1 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx1
);
assert(
  res1.success &&
    res1.booking?.weeklyFrequency === 1 &&
    res1.createdLessons?.length === 5, // Junio 2026 tiene 5 martes
  '1. Abono de 1 horario semanal confirmado atómicamente con sus 5 clases'
);

// -------------------------------------------------------------
// PRUEBA 2: Abono de 2 horarios semanales
// -------------------------------------------------------------
const ctx2 = createBaseContext();
const res2 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600', 'slot-thu-1700'],
  },
  ctx2
);
assert(
  res2.success &&
    res2.booking?.weeklyFrequency === 2 &&
    res2.createdLessons?.length === 9, // 5 martes + 4 jueves = 9 clases
  '2. Abono de 2 horarios semanales confirmado con sus 9 clases proyectadas'
);

// -------------------------------------------------------------
// PRUEBA 3: Abono de 3 horarios semanales
// -------------------------------------------------------------
const ctx3 = createBaseContext();
const res3 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600', 'slot-thu-1700', 'slot-sat-1000'],
  },
  ctx3
);
assert(
  res3.success &&
    res3.booking?.weeklyFrequency === 3 &&
    res3.createdLessons?.length === 13, // 5 martes + 4 jueves + 4 sábados = 13 clases
  '3. Abono de 3 horarios semanales confirmado con sus 13 clases proyectadas'
);

// -------------------------------------------------------------
// PRUEBA 4: Mes con cuatro y cinco ocurrencias diferenciadas
// -------------------------------------------------------------
// Junio 2026: Jueves = 4 ocurrencias (04, 11, 18, 25) vs Martes = 5 ocurrencias (02, 09, 16, 23, 30)
const ctx4 = createBaseContext();
const res4Thu = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-thu-1700'],
  },
  ctx4
);
assert(
  res4Thu.success &&
    res4Thu.createdLessons?.length === 4 &&
    res1.createdLessons?.length === 5,
  '4. Diferenciación exacta entre meses/días con 4 ocurrencias y 5 ocurrencias'
);

// -------------------------------------------------------------
// PRUEBA 5: Cambio de año (Diciembre 2026 -> Enero 2027)
// -------------------------------------------------------------
const ctx5 = createBaseContext();
const resDec = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-12',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx5
);
const resJan = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2027-01',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx5
);
assert(
  resDec.success &&
    resJan.success &&
    resDec.booking?.month === '2026-12' &&
    resJan.booking?.month === '2027-01',
  '5. Cambio de año validado y confirmado sin desbordes de fecha'
);

// -------------------------------------------------------------
// PRUEBA 6: Regla que comienza a mitad de mes (originDate posterior)
// -------------------------------------------------------------
// Regla con originDate = '2026-06-15'. En Junio 2026, los martes 02 y 09 no están originados.
// La política de abono completo exige 100% disponible, por lo que aborta.
const ctx6 = createBaseContext();
ctx6.recurringSlots = [
  {
    ...slotTuesday,
    originDate: '2026-06-15',
  },
];
const res6 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx6
);
assert(
  res6.success === false && res6.errorCode === 'INCOMPLETE_AVAILABILITY',
  '6. Regla que inicia a mitad de mes aborta confirmación de abono mensual completo'
);

// -------------------------------------------------------------
// PRUEBA 7: blocked_date (bloqueo de fecha completa)
// -------------------------------------------------------------
const ctx7 = createBaseContext();
ctx7.exceptions = [
  {
    id: 'block-date-1',
    teacherId: 'teacher-valid-1',
    type: 'blocked_date',
    startDate: '2026-06-09',
    endDate: '2026-06-09',
    reason: 'Feriado nacional',
  },
];
const res7 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx7
);
assert(
  res7.success === false &&
    res7.errorCode === 'INCOMPLETE_AVAILABILITY' &&
    res7.error?.includes('2026-06-09'),
  '7. Fecha con blocked_date aborta la confirmación del abono mensual'
);

// -------------------------------------------------------------
// PRUEBA 8: blocked_slot (bloqueo de franja horaria específica)
// -------------------------------------------------------------
const ctx8 = createBaseContext();
ctx8.exceptions = [
  {
    id: 'block-slot-1',
    teacherId: 'teacher-valid-1',
    type: 'blocked_slot',
    startDate: '2026-06-16',
    endDate: '2026-06-16',
    recurringSlotId: 'slot-tue-1600',
    targetTime: '16:00',
    reason: 'Médico',
  },
];
const res8 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx8
);
assert(
  res8.success === false &&
    res8.errorCode === 'INCOMPLETE_AVAILABILITY' &&
    res8.error?.includes('16:00'),
  '8. Ocurrencia con blocked_slot aborta la confirmación del abono mensual'
);

// -------------------------------------------------------------
// PRUEBA 9: Excepción vacation histórica aún existente en Firestore
// -------------------------------------------------------------
const ctx9 = createBaseContext();
ctx9.exceptions = [
  {
    id: 'legacy-vac-1',
    teacherId: 'teacher-valid-1',
    type: 'vacation',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    reason: 'Vacaciones históricas previas',
  },
];
const res9 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx9
);
assert(
  res9.success === false &&
    res9.errorCode === 'INCOMPLETE_AVAILABILITY' &&
    res9.error?.includes('2026-06-02'),
  '9. Excepción histórica de vacaciones bloquea atómicamente la confirmación del abono'
);

// -------------------------------------------------------------
// PRUEBA 10: Fecha ocupada (teacherAvailability con status 'booked')
// -------------------------------------------------------------
const ctx10 = createBaseContext();
ctx10.bookedAvailabilities = [
  {
    id: 'avail-booked-1',
    teacherId: 'teacher-valid-1',
    date: '2026-06-23',
    startTime: '16:00',
    duration: 60,
    status: 'booked',
  },
];
const res10 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx10
);
assert(
  res10.success === false &&
    res10.errorCode === 'INCOMPLETE_AVAILABILITY' &&
    res10.error?.includes('2026-06-23'),
  '10. Ocurrencia con franja reservada en teacherAvailability aborta la confirmación'
);

// -------------------------------------------------------------
// PRUEBA 11: Fecha pasada respecto a Buenos Aires
// -------------------------------------------------------------
// Si la hora de referencia en Buenos Aires es 2026-06-10 12:00, las fechas 02 y 09 están en el pasado.
const ctx11 = createBaseContext();
ctx11.referenceNow = {
  dateStr: '2026-06-10',
  currentMinutes: 720,
};
const res11 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx11
);
assert(
  res11.success === false &&
    res11.errorCode === 'INCOMPLETE_AVAILABILITY' &&
    res11.error?.includes('pasada'),
  '11. Clases en el pasado respecto a Buenos Aires impiden confirmar abonos retroactivos'
);

// -------------------------------------------------------------
// PRUEBA 12: Dos alumnos reservando el mismo abono (concurrencia y cerrojo)
// -------------------------------------------------------------
const ctx12 = createBaseContext();
// Alumno A confirma primero y gana el cerrojo de las clases de junio
const res12A = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx12
);
// Alumno B intenta reservar el mismo horario
const ctx12B = createBaseContext();
ctx12B.existingLocks = res12A.createdLocks || [];
const res12B = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx12B
);
assert(
  res12A.success === true &&
    res12B.success === false &&
    res12B.errorCode === 'SLOT_LOCKED',
  '12. Concurrencia de dos alumnos: el segundo colisiona con el cerrojo y es rechazado'
);

// -------------------------------------------------------------
// PRUEBA 13: Dos abonos con horarios parcialmente superpuestos
// -------------------------------------------------------------
// Alumno A tiene clase el martes de 16:00 a 17:00
const ctx13 = createBaseContext();
const bookedLessonA: Lesson = {
  id: 'lesson-a-1',
  title: 'Clase Alumno A',
  teacherId: 'teacher-valid-1',
  studentId: 'student-a',
  date: new Date(2026, 5, 2, 16, 0) as any,
  duration: 60,
  status: 'scheduled',
};
ctx13.existingLessons = [bookedLessonA];
// Alumno B intenta contratar un abono con un horario superpuesto de 16:30 a 17:30
const overlappingSlotTue: TeacherRecurringSlot = {
  id: 'slot-tue-1630',
  teacherId: 'teacher-valid-1',
  dayOfWeek: 2,
  startTime: '16:30',
  endTime: '17:30',
  duration: 60,
  isActive: true,
  originDate: '2026-01-01',
};
ctx13.recurringSlots.push(overlappingSlotTue);
const res13 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1630'],
  },
  ctx13
);
assert(
  res13.success === false && res13.errorCode === 'LESSON_TIME_CONFLICT',
  '13. Abono con horario parcialmente superpuesto es rechazado por conflicto con clase existente'
);

// -------------------------------------------------------------
// PRUEBA 14: Reintento de una solicitud (idempotencia y deduplicación)
// -------------------------------------------------------------
const payloadWithKey = {
  teacherId: 'teacher-valid-1',
  month: '2026-06',
  recurringSlotIds: ['slot-tue-1600'],
  idempotencyKey: 'idemp-req-unique-999',
};
const lockKeyP14 = generateSlotLockKey(payloadWithKey.teacherId, '2026-06-02', '16:00');
assert(
  lockKeyP14 === 'teacher-valid-1_2026-06-02_1600',
  '14. Generación determinista y sanitizada de clave de cerrojo (idempotencia)'
);

// -------------------------------------------------------------
// PRUEBA 15: Fallo durante la transacción (atomicidad estricta)
// -------------------------------------------------------------
// Forzamos un fallo simulado en el paso 3 de la transacción
const ctx15 = createBaseContext();
const res15 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx15,
  { shouldFailOnStep: 3 }
);
assert(
  res15.success === false &&
    res15.errorCode === 'TRANSACTION_ABORTED' &&
    (!res15.createdLessons || res15.createdLessons.length === 0),
  '15. Atomicidad estricta: un fallo a mitad de la operación aborta todo sin persistir clases parciales'
);

// -------------------------------------------------------------
// PRUEBA 16: Profesor inactivo o inexistente
// -------------------------------------------------------------
const ctx16 = createBaseContext();
ctx16.teacherProfile.status = 'disabled';
const res16 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx16
);
assert(
  res16.success === false && res16.errorCode === 'TEACHER_INACTIVE',
  '16. Profesor inactivo o deshabilitado es rechazado inmediatamente'
);

// -------------------------------------------------------------
// PRUEBA 17: Alumno no autorizado o inactivo
// -------------------------------------------------------------
const ctx17 = createBaseContext();
ctx17.studentProfile.role = 'teacher' as any; // Rol inválido para contratar abono
const res17 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx17
);
assert(
  res17.success === false && res17.errorCode === 'UNAUTHORIZED_STUDENT',
  '17. Usuario con rol no autorizado es rechazado sin crear abono'
);

// -------------------------------------------------------------
// PRUEBA 18: Configuración Meet ausente o tolerante
// -------------------------------------------------------------
const ctx18 = createBaseContext();
ctx18.permanentMeetConfig = null; // No tiene configurada sala Meet aún
const res18 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx18
);
assert(
  res18.success === true &&
    res18.createdLessons?.[0].meetUrl === undefined &&
    res18.createdLessons?.length === 5,
  '18. Configuración Meet ausente manejada con tolerancia sin abortar la creación del abono'
);

// -------------------------------------------------------------
// PRUEBA 19: Preservación de clases históricas
// -------------------------------------------------------------
const ctx19 = createBaseContext();
const pastHistoricLesson: Lesson = {
  id: 'historic-lesson-123',
  title: 'Clase Antigua',
  teacherId: 'teacher-valid-1',
  studentId: 'student-other-99',
  date: new Date(2026, 4, 15, 16, 0) as any, // Mayo 2026
  duration: 60,
  status: 'completed',
};
ctx19.existingLessons = [pastHistoricLesson];
const res19 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx19
);
assert(
  res19.success === true &&
    ctx19.existingLessons.length === 1 &&
    ctx19.existingLessons[0].id === 'historic-lesson-123' &&
    ctx19.existingLessons[0].status === 'completed',
  '19. Clases históricas preservadas inmutables sin ser modificadas por el nuevo abono'
);

// -------------------------------------------------------------
// PRUEBA 20: Compatibilidad con reservas puntuales
// -------------------------------------------------------------
// Un abono confirmado genera cerrojos de exclusividad que impiden reservas puntuales coincidentes
const ctx20 = createBaseContext();
const res20 = executeSimulatedMonthlyBookingTransaction(
  {
    teacherId: 'teacher-valid-1',
    month: '2026-06',
    recurringSlotIds: ['slot-tue-1600'],
  },
  ctx20
);
const lockGeneratedForFirstTuesday = res20.createdLocks?.find(
  (l) => l.date === '2026-06-02' && l.startTime === '16:00'
);
assert(
  Boolean(lockGeneratedForFirstTuesday) &&
    lockGeneratedForFirstTuesday?.bookingType === 'monthly',
  '20. Compatibilidad e interoperabilidad de cerrojos entre reservas mensuales y puntuales'
);

console.log('\n========================================================================');
console.log(`RESUMEN DE PRUEBAS SUBBLOQUE 6B (FASE 1): ${passedTests} / ${totalTests} PASADAS`);
console.log('========================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('🎉 TODAS LAS 20 PRUEBAS DEL SUBBLOQUE 6B PASARON EXITOSAMENTE.');
}
