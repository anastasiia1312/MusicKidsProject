/**
 * Script de validación técnica para SUBBLOQUE 6A:
 * SELECCIÓN Y VISTA PREVIA DE RESERVAS MENSUALES
 *
 * Prueba las 16 condiciones requeridas:
 * 1. Mes con 4 semanas/ocurrencias
 * 2. Mes con 5 semanas/ocurrencias
 * 3. Transición de mes y año (Diciembre -> Enero)
 * 4. Febrero en año bisiesto vs no bisiesto
 * 5. originDate a mitad de mes (not_originated para anteriores)
 * 6. Reglas recurrentes inactivas (filtrado)
 * 7. Vacaciones de varios días (status 'vacation')
 * 8. Bloqueo de fecha completa (status 'blocked_date')
 * 9. Bloqueo de horario específico (status 'blocked_slot')
 * 10. Ocurrencia ya reservada/ocupada (status 'occupied')
 * 11. Solapamiento entre reglas seleccionadas el mismo día
 * 12. Ocurrencias en el pasado respecto a Buenos Aires (status 'past')
 * 13. Proyección con combinaciones de 1, 2 y 3 frecuencias semanales
 * 14. Manejo robusto de datos vacíos o inexistentes
 * 15. Interpretación estricta de huso horario America/Argentina/Buenos_Aires
 * 16. Validación de la política de abono completo (isFullyAvailable)
 */

import {
  getDaysInMonth,
  getBuenosAiresNow,
  calculateMonthlyOccurrences,
  checkSelectedRulesOverlap,
} from '../src/services/monthlyBookingService';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';
import type { TeacherScheduleException } from '../src/types/scheduleException';
import type { TeacherAvailability } from '../src/types/availability';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

console.log('='.repeat(70));
console.log('INICIANDO PRUEBAS TÉCNICAS: SUBBLOQUE 6A (MusicKids)');
console.log('='.repeat(70));

// Base mock teacher slot (Martes 16:00 - 17:00, 60 min)
const mockTuesdaySlot: TeacherRecurringSlot = {
  id: 'slot-tue-1600',
  teacherId: 'teacher-123',
  dayOfWeek: 2, // Martes
  startTime: '16:00',
  duration: 60,
  endTime: '17:00',
  originDate: '2026-01-01',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Base mock teacher slot (Jueves 17:00 - 18:00, 60 min)
const mockThursdaySlot: TeacherRecurringSlot = {
  id: 'slot-thu-1700',
  teacherId: 'teacher-123',
  dayOfWeek: 4, // Jueves
  startTime: '17:00',
  duration: 60,
  endTime: '18:00',
  originDate: '2026-01-01',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Base mock teacher slot (Sábado 10:00 - 11:00, 60 min)
const mockSaturdaySlot: TeacherRecurringSlot = {
  id: 'slot-sat-1000',
  teacherId: 'teacher-123',
  dayOfWeek: 6, // Sábado
  startTime: '10:00',
  duration: 60,
  endTime: '11:00',
  originDate: '2026-01-01',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Simulated fixed reference time for testing (Buenos Aires: 2026-05-01 10:00 = 600 min)
const simulatedReferenceTime = {
  dateStr: '2026-05-01',
  currentMinutes: 600,
};

// -------------------------------------------------------------
// PRUEBA 1: Mes con 4 semanas / 4 ocurrencias de un día
// -------------------------------------------------------------
// En Junio 2026:
// Días jueves: 4, 11, 18, 25 (4 jueves).
const resP1 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockThursdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
assert(
  resP1.occurrences.length === 4 &&
    resP1.occurrences.map((o) => o.date).join(',') ===
      '2026-06-04,2026-06-11,2026-06-18,2026-06-25',
  '1. Mes con 4 ocurrencias (Junio 2026 para Jueves = 4 clases)'
);

// -------------------------------------------------------------
// PRUEBA 2: Mes con 5 semanas / 5 ocurrencias de un día
// -------------------------------------------------------------
// En Junio 2026 hay 5 martes: 2, 9, 16, 23, 30.
const resP2 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
assert(
  resP2.occurrences.length === 5 &&
    resP2.occurrences.map((o) => o.date).join(',') ===
      '2026-06-02,2026-06-09,2026-06-16,2026-06-23,2026-06-30',
  '2. Mes con 5 ocurrencias (Junio 2026 para Martes = 5 clases)'
);

// -------------------------------------------------------------
// PRUEBA 3: Transición de fin de año (Diciembre 2026 -> Enero 2027)
// -------------------------------------------------------------
const resDec = calculateMonthlyOccurrences({
  year: 2026,
  month: 12,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const resJan = calculateMonthlyOccurrences({
  year: 2027,
  month: 1,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const decDates = resDec.occurrences.map((o) => o.date);
const janDates = resJan.occurrences.map((o) => o.date);
assert(
  decDates.every((d) => d.startsWith('2026-12-')) &&
    janDates.every((d) => d.startsWith('2027-01-')) &&
    janDates.length === 4, // Jan 2027 has Tuesdays: 5, 12, 19, 26
  '3. Transición de año correcta (Diciembre 2026 y Enero 2027)'
);

// -------------------------------------------------------------
// PRUEBA 4: Febrero en año bisiesto vs no bisiesto
// -------------------------------------------------------------
const feb2024Days = getDaysInMonth(2024, 2);
const feb2026Days = getDaysInMonth(2026, 2);
const feb2028Days = getDaysInMonth(2028, 2);
assert(
  feb2024Days === 29 && feb2026Days === 28 && feb2028Days === 29,
  '4. Cálculo de días en febrero (Bisiestos 2024/2028 = 29, Común 2026 = 28)'
);

// -------------------------------------------------------------
// PRUEBA 5: originDate a mitad de mes
// -------------------------------------------------------------
// Martes con originDate = '2026-06-15'.
// Junio 2026 martes: 02, 09, 16, 23, 30.
// 02 y 09 deben ser 'not_originated'.
// 16, 23 y 30 deben ser 'available'.
const lateOriginSlot: TeacherRecurringSlot = {
  ...mockTuesdaySlot,
  originDate: '2026-06-15',
};
const resP5 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [lateOriginSlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const notOriginated = resP5.occurrences.filter((o) => o.status === 'not_originated');
const availableAfterOrigin = resP5.occurrences.filter((o) => o.status === 'available');
assert(
  notOriginated.length === 2 &&
    notOriginated[0].date === '2026-06-02' &&
    notOriginated[1].date === '2026-06-09' &&
    availableAfterOrigin.length === 3 &&
    availableAfterOrigin[0].date === '2026-06-16',
  '5. originDate a mitad de mes (ocurrencias previas not_originated, posteriores available)'
);

// -------------------------------------------------------------
// PRUEBA 6: Reglas recurrentes inactivas (filtrado)
// -------------------------------------------------------------
const inactiveSlot: TeacherRecurringSlot = {
  ...mockTuesdaySlot,
  id: 'inactive-slot',
  isActive: false,
};
const resP6 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [inactiveSlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
assert(
  resP6.occurrences.length === 0,
  '6. Reglas recurrentes inactivas descartadas de la proyección'
);

// -------------------------------------------------------------
// PRUEBA 7: Vacaciones de varios días (status 'vacation')
// -------------------------------------------------------------
// Vacaciones del 2026-06-08 al 2026-06-20
// En Junio 2026 martes: 02 (ok), 09 (vacation), 16 (vacation), 23 (ok), 30 (ok)
const vacationException: TeacherScheduleException = {
  id: 'vac-1',
  teacherId: 'teacher-123',
  type: 'vacation',
  startDate: '2026-06-08',
  endDate: '2026-06-20',
  reason: 'Vacaciones de invierno',
};
const resP7 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [vacationException],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const vacOccs = resP7.occurrences.filter((o) => o.status === 'vacation');
assert(
  vacOccs.length === 2 &&
    vacOccs[0].date === '2026-06-09' &&
    vacOccs[1].date === '2026-06-16' &&
    vacOccs[0].conflictReason?.includes('Vacaciones'),
  '7. Vacaciones de varios días marcan ocurrencias dentro del rango como vacation'
);

// -------------------------------------------------------------
// PRUEBA 8: Bloqueo de fecha completa (status 'blocked_date')
// -------------------------------------------------------------
// Bloqueo del día 2026-06-23
const blockedDateException: TeacherScheduleException = {
  id: 'block-date-1',
  teacherId: 'teacher-123',
  type: 'blocked_date',
  startDate: '2026-06-23',
  endDate: '2026-06-23',
  reason: 'Feriado o asunto personal',
};
const resP8 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [blockedDateException],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const blockedDateOcc = resP8.occurrences.find((o) => o.date === '2026-06-23');
assert(
  blockedDateOcc?.status === 'blocked_date' &&
    blockedDateOcc?.conflictReason?.includes('bloqueada'),
  '8. Bloqueo de fecha completa marca ocurrencia como blocked_date'
);

// -------------------------------------------------------------
// PRUEBA 9: Bloqueo de horario específico (status 'blocked_slot')
// -------------------------------------------------------------
const blockedSlotException: TeacherScheduleException = {
  id: 'block-slot-1',
  teacherId: 'teacher-123',
  type: 'blocked_slot',
  startDate: '2026-06-30',
  endDate: '2026-06-30',
  recurringSlotId: 'slot-tue-1600',
  reason: 'Capacitación docente',
};
const resP9 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [blockedSlotException],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const blockedSlotOcc = resP9.occurrences.find((o) => o.date === '2026-06-30');
assert(
  blockedSlotOcc?.status === 'blocked_slot' &&
    blockedSlotOcc?.conflictReason?.includes('pausado'),
  '9. Bloqueo de horario específico (blocked_slot) marca ocurrencia correcta'
);

// -------------------------------------------------------------
// PRUEBA 10: Ocurrencia ya reservada / ocupada (status 'occupied')
// -------------------------------------------------------------
// teacherAvailability con status 'booked' en 2026-06-02 16:00
const bookedAvailability: TeacherAvailability = {
  id: 'avail-booked-1',
  teacherId: 'teacher-123',
  date: '2026-06-02',
  startTime: '16:00',
  duration: 60,
  status: 'booked',
};
const resP10 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [bookedAvailability],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
const bookedOcc = resP10.occurrences.find((o) => o.date === '2026-06-02');
assert(
  bookedOcc?.status === 'occupied' &&
    bookedOcc?.conflictReason?.includes('reservado'),
  '10. Ocurrencia reservada en teacherAvailability marcada como occupied'
);

// -------------------------------------------------------------
// PRUEBA 11: Solapamiento entre reglas seleccionadas el mismo día
// -------------------------------------------------------------
// Martes 16:00 - 17:00 vs Martes 16:30 - 17:30
const overlappingSlot: TeacherRecurringSlot = {
  id: 'slot-tue-overlap',
  teacherId: 'teacher-123',
  dayOfWeek: 2,
  startTime: '16:30',
  duration: 60,
  endTime: '17:30',
  originDate: '2026-01-01',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const overlapResult1 = checkSelectedRulesOverlap([mockTuesdaySlot, overlappingSlot]);
const overlapResult2 = checkSelectedRulesOverlap([mockTuesdaySlot, mockThursdaySlot]);
assert(
  overlapResult1.hasOverlap === true &&
    overlapResult1.message?.includes('16:00') &&
    overlapResult2.hasOverlap === false,
  '11. Detección de solapamiento entre reglas recurrentes seleccionadas'
);

// -------------------------------------------------------------
// PRUEBA 12: Ocurrencias en el pasado respecto a Buenos Aires
// -------------------------------------------------------------
// Si el tiempo de referencia en Buenos Aires es 2026-06-10 12:00:
// 2026-06-02 y 2026-06-09 deben marcarse como 'past'.
const midJuneReference = {
  dateStr: '2026-06-10',
  currentMinutes: 720,
};
const resP12 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: midJuneReference,
});
const pastOccs = resP12.occurrences.filter((o) => o.status === 'past');
const futureOccs = resP12.occurrences.filter((o) => o.status === 'available');
assert(
  pastOccs.length === 2 &&
    pastOccs[0].date === '2026-06-02' &&
    pastOccs[1].date === '2026-06-09' &&
    futureOccs.length === 3 &&
    futureOccs[0].date === '2026-06-16',
  '12. Ocurrencias pasadas marcadas correctamente como past'
);

// -------------------------------------------------------------
// PRUEBA 13: Selección de 1, 2 y 3 frecuencias semanales
// -------------------------------------------------------------
// 1 clase/sem: Martes (5 clases en Junio 2026)
const resFreq1 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
// 2 clases/sem: Martes (5) + Jueves (4) = 9 clases
const resFreq2 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot, mockThursdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 2,
  referenceNow: simulatedReferenceTime,
});
// 3 clases/sem: Martes (5) + Jueves (4) + Sábado (4) = 13 clases
const resFreq3 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot, mockThursdaySlot, mockSaturdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 3,
  referenceNow: simulatedReferenceTime,
});
assert(
  resFreq1.totalOccurrences === 5 &&
    resFreq2.totalOccurrences === 9 &&
    resFreq3.totalOccurrences === 13 &&
    // Verificar orden cronológico estricto
    resFreq3.occurrences.every(
      (occ, idx, arr) =>
        idx === 0 ||
        occ.date > arr[idx - 1].date ||
        (occ.date === arr[idx - 1].date && occ.startTime >= arr[idx - 1].startTime)
    ),
  '13. Proyección precisa y ordenada cronológicamente para 1, 2 y 3 horarios semanales'
);

// -------------------------------------------------------------
// PRUEBA 14: Manejo robusto de datos vacíos o inexistentes
// -------------------------------------------------------------
const resP14 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
assert(
  resP14.totalOccurrences === 0 &&
    resP14.availableCount === 0 &&
    resP14.unavailableCount === 0 &&
    resP14.isFullyAvailable === false,
  '14. Manejo seguro y consistente ante listas vacías sin errores ni excepciones'
);

// -------------------------------------------------------------
// PRUEBA 15: Interpretación estricta de huso horario America/Argentina/Buenos_Aires
// -------------------------------------------------------------
const baNow = getBuenosAiresNow();
const dateParts = baNow.dateStr.split('-');
const timeParts = baNow.timeStr.split(':');
assert(
  dateParts.length === 3 &&
    dateParts[0].length === 4 &&
    dateParts[1].length === 2 &&
    dateParts[2].length === 2 &&
    timeParts.length === 2 &&
    Number(timeParts[0]) >= 0 &&
    Number(timeParts[0]) <= 23 &&
    Number(timeParts[1]) >= 0 &&
    Number(timeParts[1]) <= 59,
  `15. Formato de fecha/hora de Buenos Aires válido (${baNow.dateStr} ${baNow.timeStr})`
);

// -------------------------------------------------------------
// PRUEBA 16: Validación de política de abono completo (isFullyAvailable)
// -------------------------------------------------------------
// Caso A: Todas disponibles -> isFullyAvailable = true
const resP16A = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
// Caso B: 1 ocupada -> isFullyAvailable = false
const resP16B = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [],
  availabilitySlots: [bookedAvailability],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
// Caso C: 1 en vacaciones -> isFullyAvailable = false
const resP16C = calculateMonthlyOccurrences({
  year: 2026,
  month: 6,
  selectedRules: [mockTuesdaySlot],
  exceptions: [vacationException],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: simulatedReferenceTime,
});
assert(
  resP16A.isFullyAvailable === true &&
    resP16A.availableCount === 5 &&
    resP16B.isFullyAvailable === false &&
    resP16B.availableCount === 4 &&
    resP16C.isFullyAvailable === false &&
    resP16C.availableCount === 3,
  '16. Política de abono completo (100% disponibilidad requerida para isFullyAvailable)'
);

console.log('='.repeat(70));
console.log(`RESUMEN DE PRUEBAS SUBBLOQUE 6A:`);
console.log(`Total pasadas: ${passed} / ${passed + failed}`);
console.log(`Total fallidas: ${failed}`);
console.log('='.repeat(70));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODAS LAS 16 PRUEBAS DEL SUBBLOQUE 6A PASARON SATISFACTORIAMENTE.');
}
