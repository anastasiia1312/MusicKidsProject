/**
 * Suite de pruebas técnicas para la simplificación de MusicKids:
 * ELIMINACIÓN DE LA FUNCIONALIDAD VACACIONES Y CONSERVACIÓN DE BLOQUEOS
 *
 * Verificaciones obligatorias:
 * 1. Rechazo a la creación de nuevas excepciones tipo 'vacation'.
 * 2. Creación y validación correcta de excepciones 'blocked_date'.
 * 3. Creación y validación correcta de excepciones 'blocked_slot'.
 * 4. Lectura y preservación de bloqueo ante documentos antiguos tipo 'vacation'.
 * 5. Evaluación de conflicto de horario puntual frente a 'blocked_date'.
 * 6. Evaluación de conflicto de horario puntual frente a 'blocked_slot'.
 * 7. Preservación del bloqueo de vacaciones antiguas en la vista previa mensual.
 * 8. Bloqueo de fechas completas ('blocked_date') en la vista previa mensual.
 * 9. Bloqueo de franjas específicas ('blocked_slot') en la vista previa mensual.
 * 10. Clases reservadas marcadas como 'occupied' y preservadas intactas.
 */

import {
  validateScheduleExceptionPayload,
  isDateCoveredByVacation,
  isDateBlocked,
  isSlotBlocked,
  checkPunctualSlotExceptionConflict,
} from '../src/services/teacherScheduleExceptionService';
import {
  calculateMonthlyOccurrences,
  getBuenosAiresNow,
} from '../src/services/monthlyBookingService';
import type { TeacherScheduleException, CreateScheduleExceptionPayload } from '../src/types/scheduleException';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';
import type { TeacherAvailability } from '../src/types/availability';

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
console.log('  PRUEBAS TÉCNICAS: SIMPLIFICACIÓN Y RETIRO DE VACACIONES EN MUSICKIDS  ');
console.log('========================================================================\n');

// -------------------------------------------------------------
// PRUEBA 1: Rechazo estricto al crear nuevas excepciones tipo 'vacation'
// -------------------------------------------------------------
let vacationCreationRejected = false;
let rejectionMessage = '';
try {
  const invalidVacationPayload: CreateScheduleExceptionPayload = {
    teacherId: 'teacher-test-1',
    type: 'vacation' as any,
    startDate: '2026-07-01',
    endDate: '2026-07-15',
    reason: 'Vacaciones de invierno',
  };
  validateScheduleExceptionPayload(invalidVacationPayload);
} catch (err: any) {
  vacationCreationRejected = true;
  rejectionMessage = err?.message || '';
}
assert(
  vacationCreationRejected && rejectionMessage.includes('descontinuada'),
  '1. Rechazo estricto a la creación de nuevas excepciones tipo vacation',
  rejectionMessage
);

// -------------------------------------------------------------
// PRUEBA 2: Validación exitosa de 'blocked_date'
// -------------------------------------------------------------
let blockedDateValid = false;
try {
  const validBlockedDate: CreateScheduleExceptionPayload = {
    teacherId: 'teacher-test-1',
    type: 'blocked_date',
    startDate: '2026-06-10',
    endDate: '2026-06-10',
    reason: 'Día no disponible por capacitación',
  };
  validateScheduleExceptionPayload(validBlockedDate);
  blockedDateValid = true;
} catch (err: any) {
  blockedDateValid = false;
}
assert(
  blockedDateValid,
  '2. Validación exitosa para crear excepciones de tipo blocked_date'
);

// -------------------------------------------------------------
// PRUEBA 3: Validación exitosa de 'blocked_slot'
// -------------------------------------------------------------
let blockedSlotValid = false;
try {
  const validBlockedSlot: CreateScheduleExceptionPayload = {
    teacherId: 'teacher-test-1',
    type: 'blocked_slot',
    startDate: '2026-06-16',
    endDate: '2026-06-16',
    recurringSlotId: 'slot-rec-123',
    targetTime: '16:00',
    reason: 'Compromiso puntual en este horario',
  };
  validateScheduleExceptionPayload(validBlockedSlot);
  blockedSlotValid = true;
} catch (err: any) {
  blockedSlotValid = false;
}
assert(
  blockedSlotValid,
  '3. Validación exitosa para crear excepciones de tipo blocked_slot'
);

// -------------------------------------------------------------
// PRUEBA 4: Documentos antiguos tipo 'vacation' siguen siendo leídos y aplicados
// -------------------------------------------------------------
const legacyVacation: TeacherScheduleException = {
  id: 'legacy-vac-1',
  teacherId: 'teacher-test-1',
  type: 'vacation',
  startDate: '2026-06-01',
  endDate: '2026-06-05',
  reason: 'Receso previo en Firestore',
};
const coveredInLegacy = isDateCoveredByVacation('2026-06-03', [legacyVacation]);
const notCoveredLegacy = isDateCoveredByVacation('2026-06-10', [legacyVacation]);
const blockedByLegacy = isDateBlocked('2026-06-03', [legacyVacation]);
assert(
  Boolean(coveredInLegacy) && !notCoveredLegacy && Boolean(blockedByLegacy),
  '4. Documentos antiguos tipo vacation siguen siendo leídos y bloquean fechas activamente'
);

// -------------------------------------------------------------
// PRUEBA 5: Conflicto de horario puntual frente a 'blocked_date'
// -------------------------------------------------------------
const blockedDateException: TeacherScheduleException = {
  id: 'ex-blocked-date-1',
  teacherId: 'teacher-test-1',
  type: 'blocked_date',
  startDate: '2026-06-10',
  endDate: '2026-06-10',
  reason: 'Feriado puente',
};
const conflictDate = checkPunctualSlotExceptionConflict({
  date: '2026-06-10',
  startTime: '15:00',
  duration: 60,
  exceptions: [blockedDateException],
  recurringSlots: [],
});
const noConflictDate = checkPunctualSlotExceptionConflict({
  date: '2026-06-11',
  startTime: '15:00',
  duration: 60,
  exceptions: [blockedDateException],
  recurringSlots: [],
});
assert(
  conflictDate.hasConflict && conflictDate.conflictType === 'blocked_date' && !noConflictDate.hasConflict,
  '5. Horario puntual en blocked_date es rechazado correctamente'
);

// -------------------------------------------------------------
// PRUEBA 6: Conflicto de horario puntual frente a 'blocked_slot'
// -------------------------------------------------------------
const recurringRule: TeacherRecurringSlot = {
  id: 'rule-tue-1600',
  teacherId: 'teacher-test-1',
  dayOfWeek: 2, // Martes
  startTime: '16:00',
  endTime: '17:00',
  duration: 60,
  originDate: '2026-01-01',
  isActive: true,
};
const blockedSlotException: TeacherScheduleException = {
  id: 'ex-blocked-slot-1',
  teacherId: 'teacher-test-1',
  type: 'blocked_slot',
  startDate: '2026-06-16',
  endDate: '2026-06-16',
  recurringSlotId: 'rule-tue-1600',
  targetTime: '16:00',
  reason: 'Médico',
};
// Solapado: 16:30 a 17:30
const conflictSlot = checkPunctualSlotExceptionConflict({
  date: '2026-06-16',
  startTime: '16:30',
  duration: 60,
  exceptions: [blockedSlotException],
  recurringSlots: [recurringRule],
});
// No solapado (consecutivo): 17:00 a 18:00
const noConflictConsecutive = checkPunctualSlotExceptionConflict({
  date: '2026-06-16',
  startTime: '17:00',
  duration: 60,
  exceptions: [blockedSlotException],
  recurringSlots: [recurringRule],
});
assert(
  conflictSlot.hasConflict && conflictSlot.conflictType === 'blocked_slot' && !noConflictConsecutive.hasConflict,
  '6. Horario puntual frente a blocked_slot detecta superposiciones semiabiertas'
);

// -------------------------------------------------------------
// PRUEBA 7: Vista previa mensual respeta vacaciones históricas
// -------------------------------------------------------------
const mockSlotTue: TeacherRecurringSlot = {
  id: 'rule-tue-1600',
  teacherId: 'teacher-test-1',
  dayOfWeek: 2, // Martes
  startTime: '16:00',
  endTime: '17:00',
  duration: 60,
  originDate: '2026-01-01',
  isActive: true,
};
const previewWithLegacyVac = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockSlotTue],
  exceptions: [legacyVacation], // 2026-06-01 al 2026-06-05 (cubre martes 2026-06-02)
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-05-01', currentMinutes: 600 },
});
const occLegacyVac = previewWithLegacyVac.occurrences.find((o) => o.date === '2026-06-02');
assert(
  occLegacyVac?.status === 'vacation' &&
    occLegacyVac.conflictReason?.includes('Período no disponible') &&
    previewWithLegacyVac.isFullyAvailable === false,
  '7. Vista previa mensual marca correctamente ocurrencia bajo vacación histórica como no disponible'
);

// -------------------------------------------------------------
// PRUEBA 8: Vista previa mensual respeta 'blocked_date'
// -------------------------------------------------------------
const previewWithBlockedDate = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockSlotTue],
  exceptions: [blockedDateException], // 2026-06-10 (miércoles, no afecta martes) + agregamos 2026-06-09
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-05-01', currentMinutes: 600 },
});
const blockedTue: TeacherScheduleException = {
  id: 'block-tue-9',
  teacherId: 'teacher-test-1',
  type: 'blocked_date',
  startDate: '2026-06-09',
  endDate: '2026-06-09',
};
const previewBlockedTue = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockSlotTue],
  exceptions: [blockedTue],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-05-01', currentMinutes: 600 },
});
const occBlockedDate = previewBlockedTue.occurrences.find((o) => o.date === '2026-06-09');
assert(
  occBlockedDate?.status === 'blocked_date' && previewBlockedTue.isFullyAvailable === false,
  '8. Vista previa mensual respeta blocked_date marcando el estado correspondiente'
);

// -------------------------------------------------------------
// PRUEBA 9: Vista previa mensual respeta 'blocked_slot'
// -------------------------------------------------------------
const previewWithBlockedSlot = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockSlotTue],
  exceptions: [blockedSlotException], // Martes 2026-06-16 slot 16:00
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-05-01', currentMinutes: 600 },
});
const occBlockedSlot = previewWithBlockedSlot.occurrences.find((o) => o.date === '2026-06-16');
assert(
  occBlockedSlot?.status === 'blocked_slot' && previewWithBlockedSlot.isFullyAvailable === false,
  '9. Vista previa mensual respeta blocked_slot para la ocurrencia exacta'
);

// -------------------------------------------------------------
// PRUEBA 10: Clases reservadas (status == 'booked') se preservan y marcan 'occupied'
// -------------------------------------------------------------
const bookedSlotAvail: TeacherAvailability = {
  id: 'avail-booked-tue-23',
  teacherId: 'teacher-test-1',
  date: '2026-06-23',
  startTime: '16:00',
  duration: 60,
  status: 'booked',
  lessonId: 'lesson-active-99',
};
const previewWithBooked = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockSlotTue],
  exceptions: [],
  availabilitySlots: [bookedSlotAvail],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-05-01', currentMinutes: 600 },
});
const occBooked = previewWithBooked.occurrences.find((o) => o.date === '2026-06-23');
assert(
  occBooked?.status === 'occupied' &&
    occBooked.conflictReason?.includes('reservado') &&
    previewWithBooked.isFullyAvailable === false,
  '10. Clases reservadas permanecen intactas y marcan la ocurrencia como occupied'
);

console.log('\n========================================================================');
console.log(`RESUMEN DE PRUEBAS DE SIMPLIFICACIÓN: ${passedTests} / ${totalTests} PASADAS`);
console.log('========================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('🎉 TODAS LAS PRUEBAS DE SIMPLIFICACIÓN PASARON EXITOSAMENTE.');
}
