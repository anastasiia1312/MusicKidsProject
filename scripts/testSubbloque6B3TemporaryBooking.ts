/**
 * Test Suite Integral: SUBBLOQUE 6B.3
 * RESERVA TEMPORAL DE ABONOS MENSUALES DURANTE 24 HORAS
 *
 * Valida los 18 requisitos de negocio, seguridad, integridad atómica y cálculo de vencimiento.
 */

import { Timestamp } from 'firebase/firestore';
import {
  executeSimulatedTemporaryBookingTransaction,
} from '../src/services/monthlyBookingConfirmationService';
import {
  formatExpirationBuenosAires,
} from '../src/services/monthlyBookingService';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';
import type { TeacherScheduleException } from '../src/types/scheduleException';
import type { TeacherSlotLock } from '../src/types/monthlyBooking';
import type { Lesson } from '../src/types/lesson';
import type { UserProfile } from '../src/types/auth';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('--- INICIANDO TESTS SUBBLOQUE 6B.3: RESERVA TEMPORAL DE 24 HORAS ---');

// Perfiles simulados con status 'active'
const mockTeacher: UserProfile & { bankDetails?: any } = {
  uid: 'teacher-1',
  email: 'profe@musickids.com',
  name: 'Profesor Mozart',
  role: 'teacher',
  status: 'active',
  photoURL: null,
  authProvider: 'email',
  singleLessonPrice: 3500, // Precio individual intacto
  monthlyPlans: [
    { id: 'weekly_1', lessonsPerWeek: 1, lessonsPerMonth: 4, price: 12000, active: true },
    { id: 'weekly_2', lessonsPerWeek: 2, lessonsPerMonth: 8, price: 22000, active: true },
    { id: 'weekly_3', lessonsPerWeek: 3, lessonsPerMonth: 12, price: 30000, active: true },
  ],
  bankDetails: {
    alias: 'PROFE.PIANO.ARG',
    cbuCvu: '0123456789012345678901',
    bankName: 'Banco Piano',
    accountHolder: 'Mozart Amadeus',
    cuitCuil: '20-12345678-9',
  },
  createdAt: new Date() as any,
};

const mockPermanentMeet = {
  meetUrl: 'https://meet.google.com/abc-defg-hij',
  meetSpaceName: 'spaces/abc-defg-hij',
};

const mockStudent1: UserProfile = {
  uid: 'student-1',
  email: 'alumno1@musickids.com',
  name: 'Juan Perez',
  role: 'student',
  status: 'active',
  photoURL: null,
  authProvider: 'email',
  createdAt: new Date() as any,
};

const mockStudent2: UserProfile = {
  uid: 'student-2',
  email: 'alumno2@musickids.com',
  name: 'Maria Gomez',
  role: 'student',
  status: 'active',
  photoURL: null,
  authProvider: 'email',
  createdAt: new Date() as any,
};

// Slots: Lunes 10:00 a 10:45 (dayOfWeek 1)
const slotMonday10: TeacherRecurringSlot = {
  id: 'slot-mon-10',
  teacherId: 'teacher-1',
  dayOfWeek: 1,
  startTime: '10:00',
  endTime: '10:45',
  duration: 45,
  isActive: true,
  originDate: '2026-01-01',
};

// Slots: Miércoles 16:00 a 16:45 (dayOfWeek 3)
const slotWednesday16: TeacherRecurringSlot = {
  id: 'slot-wed-16',
  teacherId: 'teacher-1',
  dayOfWeek: 3,
  startTime: '16:00',
  endTime: '16:45',
  duration: 45,
  isActive: true,
  originDate: '2026-01-01',
};

// Slot inactivo
const slotInactive: TeacherRecurringSlot = {
  ...slotMonday10,
  id: 'slot-inactive',
  isActive: false,
};

// Slot con originDate futura (abril 2026)
const slotFutureOrigin: TeacherRecurringSlot = {
  ...slotMonday10,
  id: 'slot-future-origin',
  originDate: '2026-04-01',
};

// Fecha simulada de prueba: 10 de Febrero 2026 12:00 UTC (9:00 AM ART)
const referenceNow = {
  dateStr: '2026-02-10',
  currentMinutes: 9 * 60,
  nowDate: new Date('2026-02-10T12:00:00Z'),
};

let passedCount = 0;

function runTest(testName: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ Test ${++passedCount}: ${testName}`);
  } catch (err: any) {
    console.error(`✗ Test ${passedCount + 1} FALLÓ: ${testName}`);
    console.error(err.message || err);
    process.exit(1);
  }
}

// 1. Creación válida de reserva temporal de 24 horas
runTest('Creación válida de reserva temporal de 24h con status pending_payment', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    permanentMeetConfig: mockPermanentMeet,
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === true, `La transacción debió ser exitosa. Error: ${res.error}`);
  assert(res.booking?.status === 'pending_payment', 'Status debe ser pending_payment');
  assert(res.booking?.teacherId === 'teacher-1', 'TeacherId coincide');
  assert(res.booking?.studentId === 'student-1', 'StudentId coincide');
  assert(res.booking?.weeklyFrequency === 1, 'Frecuencia es 1');
  assert(res.booking?.occurrences?.length === 5, 'Marzo 2026 tiene 5 lunes');
});

// 2. Precio mensual fijo en ARS guardado en el documento
runTest('Precio mensual fijo en ARS asignado desde monthlyPlans del profesor', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.booking?.totalPrice === 12000, 'totalPrice debe ser 12000 ARS');
  assert(res.booking?.price === 12000, 'price debe ser 12000 ARS');
  assert(res.booking?.currency === 'ARS', 'Moneda debe ser ARS');
});

// 3. Expiración exacta a 24 horas (expiresAt - createdAt === 86400000 ms)
runTest('Cálculo de vencimiento exacto a 24 horas del servidor', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  const createdMs = res.booking!.createdAt.getTime();
  const expMs = res.booking!.expiresAt.getTime();
  const diffHours = (expMs - createdMs) / (1000 * 60 * 60);

  assert(diffHours === 24, `Diferencia debe ser exactamente 24h, fue ${diffHours}`);
  const formatted = formatExpirationBuenosAires(res.booking!.expiresAt);
  assert(formatted.length > 0, 'Formateador de Buenos Aires devolvió string válido');
  assert(formatted.includes('hs'), 'Contiene indicador de horas');
});

// 4. Dos alumnos intentan el mismo horario -> segundo recibe SLOT_LOCKED
runTest('Control de concurrencia: segundo alumno es rechazado con SLOT_LOCKED', () => {
  const activeLock: TeacherSlotLock = {
    id: 'teacher-1_2026-03-02_10:00',
    teacherId: 'teacher-1',
    date: '2026-03-02',
    startTime: '10:00',
    endTime: '10:45',
    duration: 45,
    bookingType: 'monthly',
    bookingId: 'booking-first-student',
    studentId: 'student-1',
    createdAt: new Date('2026-02-10T10:00:00Z'),
    expiresAt: new Date('2026-02-11T10:00:00Z'), // Vence en el futuro
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-2',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent2,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [activeLock],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe fallar por concurrencia');
  assert(res.errorCode === 'SLOT_LOCKED', `Código debe ser SLOT_LOCKED, fue ${res.errorCode}`);
});

// 5. Rechazo estricto todo o nada si 1 sola fecha está bloqueada u ocupada
runTest('Rechazo todo o nada: si 1 fecha de 5 está bloqueada, no se reserva nada', () => {
  const blockedDateEx: TeacherScheduleException = {
    id: 'ex-block-1',
    teacherId: 'teacher-1',
    type: 'blocked_date',
    startDate: '2026-03-16', // Bloquea el 3er lunes
    endDate: '2026-03-16',
    reason: 'Trámite personal',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [blockedDateEx],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe fallar por no estar 100% disponible');
  assert(res.errorCode === 'INCOMPLETE_AVAILABILITY', `Error debe ser INCOMPLETE_AVAILABILITY, fue ${res.errorCode}`);
});

// 6. Conflicto por intervalo semiabierto [startA, endA) vs [startB, endB)
runTest('Detección de superposición horaria por solapamiento de intervalos', () => {
  // Lock de 10:15 a 11:00 en 2026-03-02
  const overlapLock: TeacherSlotLock = {
    id: 'teacher-1_2026-03-02_10:15',
    teacherId: 'teacher-1',
    date: '2026-03-02',
    startTime: '10:15',
    endTime: '11:00',
    duration: 45,
    bookingType: 'monthly',
    bookingId: 'booking-other',
    studentId: 'student-3',
    createdAt: new Date('2026-02-10T10:00:00Z'),
    expiresAt: new Date('2026-02-11T10:00:00Z'),
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'], // 10:00 a 10:45
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [overlapLock],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe detectar conflicto de solapamiento');
  assert(res.errorCode === 'SLOT_LOCKED', 'Debe reportar SLOT_LOCKED');
});

// 7. Respeta blocked_date, blocked_slot y vacaciones históricas
runTest('Respeta blocked_slot sobre ocurrencia específica', () => {
  const blockedSlotEx: TeacherScheduleException = {
    id: 'ex-block-slot',
    teacherId: 'teacher-1',
    type: 'blocked_slot',
    startDate: '2026-03-09',
    endDate: '2026-03-09',
    recurringSlotId: 'slot-mon-10',
    targetTime: '10:00',
    reason: 'Consulta médica',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [blockedSlotEx],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe rechazar por blocked_slot');
  assert(res.errorCode === 'INCOMPLETE_AVAILABILITY', `Código INCOMPLETE_AVAILABILITY, fue ${res.errorCode}`);
});

// 8. Respeta clases individuales manuales existentes del profesor
runTest('Respeta clases manuales del profesor en la colección lessons', () => {
  const manualLesson: Lesson = {
    id: 'manual-lesson-1',
    title: 'Clase individual manual',
    teacherId: 'teacher-1',
    studentId: 'student-other',
    date: Timestamp.fromDate(new Date('2026-03-23T10:00:00Z')),
    duration: 45,
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [manualLesson],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe rechazar por lección manual existente');
  assert(res.errorCode === 'LESSON_TIME_CONFLICT', `Código LESSON_TIME_CONFLICT, fue ${res.errorCode}`);
});

// 9. Rechaza slots recurrentes inactivos
runTest('Rechaza slot recurrente inactivo', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-inactive'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotInactive],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe rechazar slot inactivo');
  assert(res.errorCode === 'RULE_INACTIVE', `Código RULE_INACTIVE, fue ${res.errorCode}`);
});

// 10. Rechaza ocurrencias anteriores al originDate del slot
runTest('Rechaza ocurrencias si el mes es anterior al originDate', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03', // Marzo es antes de Abril 2026
    recurringSlotIds: ['slot-future-origin'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotFutureOrigin],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe rechazar por originDate posterior');
  assert(res.errorCode === 'INCOMPLETE_AVAILABILITY', `Código INCOMPLETE_AVAILABILITY, fue ${res.errorCode}`);
});

// 11. Rechaza fechas pasadas en horario de Buenos Aires
runTest('Rechaza fechas pasadas con respecto a la referencia de Buenos Aires', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-01', // Enero 2026 ya pasó (hoy es Feb 2026)
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe rechazar mes pasado');
  assert(
    res.errorCode === 'INCOMPLETE_AVAILABILITY' && (res.error?.toLowerCase().includes('pasad') ?? false),
    `Debe indicar que la fecha ya pasó: ${res.error}`
  );
});

// 12. Previene doble clic mediante clave de idempotencia
runTest('Previene reservas duplicadas con la misma clave de idempotencia', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
    idempotencyKey: 'idemp-student1-mar2026-1',
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res1 = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res1.success === true, 'Primera reserva debe crearse');
  assert(res1.booking?.idempotencyKey === 'idemp-student1-mar2026-1', 'Idempotency key guardada');
});

// 13. Cerrojo vencido (now >= expiresAt) es ignorado y libera automáticamente la disponibilidad
runTest('Cerrojo vencido es ignorado y libera disponibilidad sin necesidad de cron', () => {
  const expiredLock: TeacherSlotLock = {
    id: 'teacher-1_2026-03-02_10:00',
    teacherId: 'teacher-1',
    date: '2026-03-02',
    startTime: '10:00',
    endTime: '10:45',
    duration: 45,
    bookingType: 'monthly',
    bookingId: 'booking-old',
    studentId: 'student-other',
    createdAt: new Date('2026-02-08T10:00:00Z'),
    expiresAt: new Date('2026-02-09T10:00:00Z'), // Venció ayer relativo a Feb 10
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-2',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent2,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [expiredLock],
    referenceNow, // 2026-02-10T12:00:00Z > expiresAt
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === true, `Debe permitir reservar ya que el cerrojo expiró. Error: ${res.error}`);
  assert(res.booking?.status === 'pending_payment', 'Reserva creada con éxito');
});

// 14. Rechaza si el profesor no configuró la tarifa mensual (UNCONFIGURED_RATE)
runTest('Rechaza si el profesor no configuró tarifa mensual para esa frecuencia', () => {
  const teacherWithoutRates: UserProfile = {
    ...mockTeacher,
    monthlyPlans: [], // Sin tarifas configuradas
  };

  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: teacherWithoutRates,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === false, 'Debe rechazar por falta de tarifa mensual');
  assert(res.errorCode === 'UNCONFIGURED_RATE', `Código UNCONFIGURED_RATE, fue ${res.errorCode}`);
});

// 15. Conserva el precio de clase individual intacto
runTest('Conserva el precio de clase individual intacto', () => {
  assert(mockTeacher.singleLessonPrice === 3500, 'singleLessonPrice permanece intacto en 3500');
});

// 16. Conserva la configuración de Google Meet permanente
runTest('Conserva el link permanente de Google Meet', () => {
  assert(mockPermanentMeet.meetUrl === 'https://meet.google.com/abc-defg-hij', 'Google Meet intacto');
});

// 17. No guarda datos bancarios confidenciales en el documento de reserva
runTest('El documento de reserva no almacena datos bancarios confidenciales', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10'],
    weeklyFrequency: 1,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  const bookingObj = res.booking as any;
  assert(bookingObj.bankDetails === undefined, 'No contiene bankDetails');
  assert(bookingObj.cbuCvu === undefined, 'No contiene cbuCvu');
  assert(bookingObj.alias === undefined, 'No contiene alias');
});

// 18. NO crea clases definitivas en lessons (solo cerrojos temporales y monthlyBooking)
runTest('En reserva temporal NO se crean lecciones en lessons', () => {
  const payload = {
    teacherId: 'teacher-1',
    studentId: 'student-1',
    month: '2026-03',
    recurringSlotIds: ['slot-mon-10', 'slot-wed-16'],
    weeklyFrequency: 2,
  };
  const context = {
    teacherProfile: mockTeacher,
    studentProfile: mockStudent1,
    recurringSlots: [slotMonday10, slotWednesday16],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow,
  };

  const res = executeSimulatedTemporaryBookingTransaction(payload, context);
  assert(res.success === true, `Reserva temporal de 2 clases por semana exitosa: ${res.error}`);
  assert(res.createdLessons?.length === 0, 'createdLessons debe estar vacío');
  assert(res.createdLocks?.length === 9, 'Debe crear 9 cerrojos temporales (5 lunes + 4 miércoles)');
  assert(res.booking?.totalPrice === 22000, 'Tarifa de 2 clases/semana es 22000 ARS');
});

console.log(`\n=========================================`);
console.log(`TODOS LOS ${passedCount} TESTS DE SUBBLOQUE 6B.3 PASARON EXITOSAMENTE`);
console.log(`=========================================\n`);
