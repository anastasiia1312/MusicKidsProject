/**
 * Script de verificación técnica:
 * MusicKids — Mostrar únicamente horarios disponibles al reservar clases mensuales
 *
 * Verifica los 10 casos obligatorios:
 * 1. Slot vigente desde diciembre: NO aparece al seleccionar noviembre.
 * 2. Mismo slot aparece en diciembre si todas sus fechas están disponibles.
 * 3. Slot ocupado (clase/reserva confirmada o teacherAvailability booked): NO aparece.
 * 4. Slot con una sola fecha bloqueada (blocked_date, blocked_slot o vacation): NO aparece para reserva mensual completa.
 * 5. Slot con reserva pendiente de pago (retención 24h activa): NO aparece mientras la retención esté activa.
 * 6. Slot liberado tras expiración de reserva (24h vencidas): vuelve a aparecer al refrescar disponibilidad.
 * 7. Slot fuera de vigencia (inactivo, cancelado, originDate posterior o endDate/validUntil previo al fin del mes): NO aparece.
 * 8. Frecuencias de 1, 2 y 3 clases semanales funcionan correctamente y evitan combinaciones superpuestas.
 * 9. Calendario y vista previa no muestran conflictos conocidos para los horarios ofrecidos.
 * 10. El backend sigue validando disponibilidad al confirmar la reserva (sin modificar Cloud Functions).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  filterAvailableRecurringSlotsForMonth,
  calculateMonthlyOccurrences,
  checkSelectedRulesOverlap,
  doesRuleOverlapWithAny,
  getMaxNonOverlappingSlotCount,
} from '../src/services/monthlyBookingService';
import { validateMonthlyBookingOnServer } from '../src/services/monthlyBookingConfirmationService';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';
import type { TeacherScheduleException } from '../src/types/scheduleException';
import type { TeacherAvailability } from '../src/types/availability';
import type { TeacherSlotLock } from '../src/types/monthlyBooking';
import type { UserProfile } from '../src/types/auth';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

console.log('='.repeat(78));
console.log('PRUEBAS DE DISPONIBILIDAD DE HORARIOS PARA ABONOS MENSUALES (ALUMNO)');
console.log('='.repeat(78));

// Referencia fija en Buenos Aires: 15 de octubre de 2026, 10:00 hs
const refOct2026 = {
  dateStr: '2026-10-15',
  currentMinutes: 600,
  nowDate: new Date('2026-10-15T13:00:00.000Z'),
};

// Reglas base de prueba (duración estándar 45 min)
const slotDecStartMonday: TeacherRecurringSlot = {
  id: 'slot-dec-mon-1600',
  teacherId: 'teacher-1',
  dayOfWeek: 1, // Lunes
  startTime: '16:00',
  endTime: '16:45',
  duration: 45,
  isActive: true,
  originDate: '2026-12-01',
};

const slotNovValidWednesday: TeacherRecurringSlot = {
  id: 'slot-nov-wed-1700',
  teacherId: 'teacher-1',
  dayOfWeek: 3, // Miércoles
  startTime: '17:00',
  endTime: '17:45',
  duration: 45,
  isActive: true,
  originDate: '2026-10-01',
};

const slotNovValidFriday: TeacherRecurringSlot = {
  id: 'slot-nov-fri-1800',
  teacherId: 'teacher-1',
  dayOfWeek: 5, // Viernes
  startTime: '18:00',
  endTime: '18:45',
  duration: 45,
  isActive: true,
  originDate: '2026-10-01',
};

const slotNovValidSaturday: TeacherRecurringSlot = {
  id: 'slot-nov-sat-1000',
  teacherId: 'teacher-1',
  dayOfWeek: 6, // Sábado
  startTime: '10:00',
  endTime: '10:45',
  duration: 45,
  isActive: true,
  originDate: '2026-10-01',
};

// =========================================================================
// PRUEBA 1: Slot vigente desde diciembre NO aparece al seleccionar noviembre
// =========================================================================
const availableInNov1 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [slotDecStartMonday],
  exceptions: [],
  availabilitySlots: [],
  activeLocks: [],
  referenceNow: refOct2026,
});

assert(
  availableInNov1.length === 0,
  '1. Slot vigente desde 2026-12-01 NO aparece al seleccionar noviembre 2026',
  `Recibido: ${availableInNov1.length} slots`
);

// =========================================================================
// PRUEBA 2: Mismo slot aparece en diciembre si todas sus fechas están disponibles
// =========================================================================
const availableInDec2 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 12,
  recurringSlots: [slotDecStartMonday],
  exceptions: [],
  availabilitySlots: [],
  activeLocks: [],
  referenceNow: refOct2026,
});

assert(
  availableInDec2.length === 1 && availableInDec2[0].id === 'slot-dec-mon-1600',
  '2. El mismo slot aparece en diciembre 2026 cuando todas sus fechas están disponibles',
  `Recibido: ${availableInDec2.map((s) => s.id).join(', ')}`
);

// =========================================================================
// PRUEBA 3: Slot ocupado NO aparece
// =========================================================================
// En noviembre 2026 los miércoles son: 4, 11, 18, 25.
const bookedAvailabilityNov: TeacherAvailability[] = [
  {
    id: 'avail-booked-wed',
    teacherId: 'teacher-1',
    date: '2026-11-11',
    startTime: '17:00',
    duration: 45,
    status: 'booked',
  },
];

// También probar ocupación proveniente de teacherDailySchedule/lessons sanitizado (sin expiresAt = confirmado)
const confirmedLockNov: TeacherSlotLock[] = [
  {
    id: 'lock-confirmed-fri',
    teacherId: 'teacher-1',
    date: '2026-11-20', // Viernes en Noviembre 2026
    startTime: '18:00',
    endTime: '18:45',
    duration: 45,
    bookingType: 'monthly',
    bookingId: 'booking-confirmed-1',
    studentId: 'other-student',
    createdAt: new Date('2026-10-10T10:00:00Z'),
    expiresAt: null,
  },
];

const availableAfterOccupied3 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [slotNovValidWednesday, slotNovValidFriday, slotNovValidSaturday],
  exceptions: [],
  availabilitySlots: bookedAvailabilityNov,
  activeLocks: confirmedLockNov,
  referenceNow: refOct2026,
});

assert(
  availableAfterOccupied3.length === 1 && availableAfterOccupied3[0].id === 'slot-nov-sat-1000',
  '3. Slots ocupados (teacherAvailability booked o reserva confirmada) NO aparecen; libre sí aparece',
  `Recibido: ${availableAfterOccupied3.map((s) => s.id).join(', ')}`
);

// =========================================================================
// PRUEBA 4: Slot con una sola fecha bloqueada NO aparece para abono mensual completo
// =========================================================================
const exceptionsTest4: TeacherScheduleException[] = [
  {
    id: 'ex-blocked-date',
    teacherId: 'teacher-1',
    type: 'blocked_date',
    startDate: '2026-11-18', // Un único miércoles bloqueado
    endDate: '2026-11-18',
    reason: 'Feriado',
  },
  {
    id: 'ex-blocked-slot',
    teacherId: 'teacher-1',
    type: 'blocked_slot',
    startDate: '2026-11-27', // Un único viernes bloqueado puntualmente
    endDate: '2026-11-27',
    recurringSlotId: 'slot-nov-fri-1800',
    targetTime: '18:00',
    reason: 'Trámite personal',
  },
];

const availableAfterSingleBlock4 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [slotNovValidWednesday, slotNovValidFriday, slotNovValidSaturday],
  exceptions: exceptionsTest4,
  availabilitySlots: [],
  activeLocks: [],
  blockedDates: ['2026-11-21'], // Sábado bloqueado desde disponibilidad pública
  referenceNow: refOct2026,
});

assert(
  availableAfterSingleBlock4.length === 0,
  '4. Slots con una sola fecha bloqueada (blocked_date, blocked_slot o public blockedDates) NO aparecen',
  `Recibido: ${availableAfterSingleBlock4.map((s) => s.id).join(', ')}`
);

// =========================================================================
// PRUEBA 5: Slot con reserva pendiente de pago (24h activa) NO aparece
// =========================================================================
const active24hHold: TeacherSlotLock[] = [
  {
    id: 'lock-pending-wed',
    teacherId: 'teacher-1',
    date: '2026-11-04',
    startTime: '17:00',
    endTime: '17:45',
    duration: 45,
    bookingType: 'monthly',
    bookingId: 'booking-pending-24h',
    studentId: 'student-other',
    createdAt: new Date('2026-10-15T12:00:00.000Z'),
    expiresAt: new Date('2026-10-16T12:00:00.000Z'), // Activo respecto a refOct2026 (2026-10-15T13:00Z)
  },
];

const availableDuringHold5 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [slotNovValidWednesday, slotNovValidFriday],
  exceptions: [],
  availabilitySlots: [],
  activeLocks: active24hHold,
  referenceNow: refOct2026,
});

assert(
  availableDuringHold5.length === 1 && availableDuringHold5[0].id === 'slot-nov-fri-1800',
  '5. Slot con reserva pendiente de pago (retención 24h activa) NO aparece mientras la retención esté activa',
  `Recibido: ${availableDuringHold5.map((s) => s.id).join(', ')}`
);

// =========================================================================
// PRUEBA 6: Slot liberado tras expiración de reserva vuelve a aparecer
// =========================================================================
const refAfter24hExpiry = {
  dateStr: '2026-10-16',
  currentMinutes: 600,
  nowDate: new Date('2026-10-16T13:00:00.000Z'), // 1 hora después de expiresAt (2026-10-16T12:00Z)
};

const availableAfterExpiry6 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [slotNovValidWednesday, slotNovValidFriday],
  exceptions: [],
  availabilitySlots: [],
  activeLocks: active24hHold,
  referenceNow: refAfter24hExpiry,
});

assert(
  availableAfterExpiry6.length === 2 &&
    availableAfterExpiry6.some((s) => s.id === 'slot-nov-wed-1700'),
  '6. Slot liberado tras expirar la reserva de 24 horas vuelve a aparecer al refrescar disponibilidad',
  `Recibido: ${availableAfterExpiry6.map((s) => s.id).join(', ')}`
);

// =========================================================================
// PRUEBA 7: Slots fuera de vigencia NO aparecen
// =========================================================================
const inactiveSlot: TeacherRecurringSlot = {
  ...slotNovValidWednesday,
  id: 'slot-inactive',
  isActive: false,
};
const cancelledStatusSlot: TeacherRecurringSlot = {
  ...slotNovValidWednesday,
  id: 'slot-cancelled',
  isActive: true,
  status: 'cancelled',
};
const midMonthOriginSlot: TeacherRecurringSlot = {
  ...slotNovValidWednesday,
  id: 'slot-mid-origin',
  originDate: '2026-11-15', // Excluye los miércoles 4 y 11 de noviembre
};
const endingBeforeMonthEndsSlot: TeacherRecurringSlot = {
  ...slotNovValidWednesday,
  id: 'slot-ends-early',
  originDate: '2026-10-01',
  endDate: '2026-11-20', // Termina antes del miércoles 25 de noviembre
};
const validUntilEarlySlot: TeacherRecurringSlot = {
  ...slotNovValidFriday,
  id: 'slot-valid-until-early',
  originDate: '2026-10-01',
  validUntil: '2026-11-22', // Termina antes del viernes 27 de noviembre
};

const availableValidityCheck7 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [
    inactiveSlot,
    cancelledStatusSlot,
    midMonthOriginSlot,
    endingBeforeMonthEndsSlot,
    validUntilEarlySlot,
    slotNovValidSaturday, // Único 100% vigente todo noviembre 2026
  ],
  exceptions: [],
  availabilitySlots: [],
  activeLocks: [],
  referenceNow: refOct2026,
});

assert(
  availableValidityCheck7.length === 1 && availableValidityCheck7[0].id === 'slot-nov-sat-1000',
  '7. Slots fuera de vigencia (inactivo, cancelado, originDate tardío o endDate/validUntil temprano) NO aparecen',
  `Recibido: ${availableValidityCheck7.map((s) => s.id).join(', ')}`
);

// =========================================================================
// PRUEBA 8: Frecuencias 1, 2 y 3 clases semanales y prevención de solapamiento
// =========================================================================
const overlappingWedSlot: TeacherRecurringSlot = {
  id: 'slot-nov-wed-1730-overlap',
  teacherId: 'teacher-1',
  dayOfWeek: 3, // Miércoles 17:30-18:15 (se superpone con 17:00-17:45)
  startTime: '17:30',
  endTime: '18:15',
  duration: 45,
  isActive: true,
  originDate: '2026-10-01',
};

const nonOverlappingSameDayWedSlot: TeacherRecurringSlot = {
  id: 'slot-nov-wed-1800-ok',
  teacherId: 'teacher-1',
  dayOfWeek: 3, // Miércoles 18:00-18:45 (NO se superpone con 17:00-17:45)
  startTime: '18:00',
  endTime: '18:45',
  duration: 45,
  isActive: true,
  originDate: '2026-10-01',
};

const poolSlots8 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: [
    slotNovValidWednesday,
    overlappingWedSlot,
    nonOverlappingSameDayWedSlot,
    slotNovValidFriday,
    slotNovValidSaturday,
  ],
  exceptions: [],
  availabilitySlots: [],
  activeLocks: [],
  referenceNow: refOct2026,
});

const maxNonOverlapping = getMaxNonOverlappingSlotCount(poolSlots8);
const overlapsWithWed = doesRuleOverlapWithAny(overlappingWedSlot, [slotNovValidWednesday]);
const nonOverlapWithWed = doesRuleOverlapWithAny(nonOverlappingSameDayWedSlot, [slotNovValidWednesday]);

const freq1Preview = calculateMonthlyOccurrences({
  year: 2026,
  month: 11,
  selectedRules: [slotNovValidWednesday],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: refOct2026,
});

const freq2Preview = calculateMonthlyOccurrences({
  year: 2026,
  month: 11,
  selectedRules: [slotNovValidWednesday, slotNovValidFriday],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 2,
  referenceNow: refOct2026,
});

const freq3Preview = calculateMonthlyOccurrences({
  year: 2026,
  month: 11,
  selectedRules: [slotNovValidWednesday, slotNovValidFriday, slotNovValidSaturday],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 3,
  referenceNow: refOct2026,
});

const overlapCombo = checkSelectedRulesOverlap([slotNovValidWednesday, overlappingWedSlot]);

assert(
  maxNonOverlapping === 4 &&
    overlapsWithWed === true &&
    nonOverlapWithWed === false &&
    overlapCombo.hasOverlap === true &&
    freq1Preview.isFullyAvailable &&
    freq1Preview.totalOccurrences === 4 &&
    freq2Preview.isFullyAvailable &&
    freq2Preview.totalOccurrences === 8 &&
    freq3Preview.isFullyAvailable &&
    freq3Preview.totalOccurrences === 12,
  '8. Frecuencias de 1, 2 y 3 clases semanales funcionan correctamente y bloquean combinaciones superpuestas',
  `max=${maxNonOverlapping}, f1=${freq1Preview.totalOccurrences}, f2=${freq2Preview.totalOccurrences}, f3=${freq3Preview.totalOccurrences}`
);

// =========================================================================
// PRUEBA 9: Calendario y vista previa sin conflictos conocidos para horarios ofrecidos
// =========================================================================
const mixedPool9: TeacherRecurringSlot[] = [
  slotDecStartMonday, // Inválido en nov (originDate diciembre)
  slotNovValidWednesday, // Inválido en nov (bloqueado abajo)
  slotNovValidFriday, // Inválido en nov (ocupado abajo)
  slotNovValidSaturday, // Válido en nov
];

const offeredInNov9 = filterAvailableRecurringSlotsForMonth({
  year: 2026,
  month: 11,
  recurringSlots: mixedPool9,
  exceptions: [
    {
      id: 'ex-9',
      teacherId: 'teacher-1',
      type: 'blocked_date',
      startDate: '2026-11-04',
      endDate: '2026-11-04',
      reason: 'Bloqueo',
    },
  ],
  availabilitySlots: [],
  activeLocks: confirmedLockNov,
  referenceNow: refOct2026,
});

const previewOffered9 = calculateMonthlyOccurrences({
  year: 2026,
  month: 11,
  selectedRules: offeredInNov9,
  exceptions: [
    {
      id: 'ex-9',
      teacherId: 'teacher-1',
      type: 'blocked_date',
      startDate: '2026-11-04',
      endDate: '2026-11-04',
      reason: 'Bloqueo',
    },
  ],
  availabilitySlots: [],
  activeLocks: confirmedLockNov,
  targetClassesPerWeek: offeredInNov9.length,
  referenceNow: refOct2026,
});

assert(
  offeredInNov9.length === 1 &&
    previewOffered9.isFullyAvailable === true &&
    previewOffered9.unavailableCount === 0 &&
    previewOffered9.occurrences.every((o) => o.status === 'available' && !o.conflictReason),
  '9. Calendario y vista previa de horarios ofrecidos no contienen conflictos conocidos',
  `offered=${offeredInNov9.length}, unavailable=${previewOffered9.unavailableCount}`
);

// Verificar también que el componente contiene exactamente el mensaje de estado vacío requerido
const componentSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/student/MonthlyBookingSection.tsx'),
  'utf8'
);
assert(
  componentSource.includes('No hay horarios disponibles para el mes seleccionado') &&
    componentSource.includes('filterAvailableRecurringSlotsForMonth') &&
    componentSource.includes('availableRecurringSlots.map'),
  '9b. MonthlyBookingSection muestra mensaje exacto de estado vacío y renderiza únicamente availableRecurringSlots'
);

// =========================================================================
// PRUEBA 10: El backend sigue validando disponibilidad al confirmar la reserva
// =========================================================================
const mockStudent: UserProfile = {
  uid: 'student-1',
  name: 'Alumno Prueba',
  email: 'alumno@musickids.test',
  role: 'student',
  status: 'active',
};

const mockTeacher: UserProfile = {
  uid: 'teacher-1',
  name: 'Profesor Prueba',
  email: 'profe@musickids.test',
  role: 'teacher',
  status: 'active',
  monthlyPlans: [
    { id: 'weekly_1', lessonsPerWeek: 1, lessonsPerMonth: 4, price: 40000, active: true },
  ],
};

// Validar que el servidor rechaza un abono si se intenta reservar un horario con un conflicto (aunque ocurra en paralelo)
const serverRejectOrigin = validateMonthlyBookingOnServer(
  {
    teacherId: 'teacher-1',
    month: '2026-11',
    recurringSlotIds: ['slot-dec-mon-1600'],
  },
  {
    studentProfile: mockStudent,
    teacherProfile: mockTeacher,
    recurringSlots: [slotDecStartMonday],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: [],
    referenceNow: refOct2026,
  },
  { requireRateValidation: true }
);

const serverRejectLock = validateMonthlyBookingOnServer(
  {
    teacherId: 'teacher-1',
    month: '2026-11',
    recurringSlotIds: ['slot-nov-wed-1700'],
  },
  {
    studentProfile: mockStudent,
    teacherProfile: mockTeacher,
    recurringSlots: [slotNovValidWednesday],
    exceptions: [],
    bookedAvailabilities: [],
    existingLessons: [],
    existingLocks: active24hHold,
    referenceNow: refOct2026,
  },
  { requireRateValidation: true }
);

const backendSource = fs.readFileSync(
  path.resolve(process.cwd(), 'functions/src/monthlyBookingService.ts'),
  'utf8'
);

assert(
  serverRejectOrigin.isValid === false &&
    serverRejectOrigin.failure.code === 'INCOMPLETE_AVAILABILITY' &&
    serverRejectLock.isValid === false &&
    serverRejectLock.failure.code === 'SLOT_LOCKED' &&
    backendSource.includes('createMonthlyBookingTransaction') &&
    backendSource.includes('teacherDailySchedule') &&
    backendSource.includes('already-exists'),
  '10. Las validaciones definitivas de servidor/backend siguen intactas y rechazan horarios no vigentes o bloqueados'
);

console.log('='.repeat(78));
console.log(`RESUMEN: ${passed} pasadas / ${passed + failed} totales (Fallidas: ${failed})`);
console.log('='.repeat(78));

if (failed > 0) {
  process.exit(1);
}
