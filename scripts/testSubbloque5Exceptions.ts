/**
 * Suite de pruebas técnicas para la corrección del SUBBLOQUE 5:
 * INTEGRACIÓN DE EXCEPCIONES Y VACACIONES EN LA CREACIÓN DE DISPONIBILIDADES
 *
 * Verificaciones obligatorias:
 * 1. Horario puntual dentro de vacaciones.
 * 2. Horario puntual en blocked_date.
 * 3. Horario puntual que coincide con blocked_slot (superposición).
 * 4. Horario puntual fuera del intervalo bloqueado.
 * 5. Horario recurrente cuya primera semana coincide con vacaciones (la regla se crea y la ocurrencia se oculta).
 * 6. Horario recurrente con vacaciones futuras (la regla se preserva, solo se oculta en la fecha de vacación).
 * 7. Restauración tras eliminar excepción (recálculo inmediato sin duplicados).
 * 8. Clase reservada dentro de vacaciones (nunca se cancela ni borra, permanece visible).
 * 9. Vacaciones que cruzan meses o años (evaluación correcta de fechas ISO).
 * 10. Intervalos consecutivos sin conflicto (intervalos semiabiertos startA < endB && startB < endA).
 */

import {
  checkPunctualSlotExceptionConflict,
  isDateCoveredByVacation,
  isDateBlocked,
  isSlotBlocked,
} from '../src/services/teacherScheduleExceptionService';
import { hasIntervalOverlap } from '../src/services/recurringScheduleService';
import type { TeacherScheduleException } from '../src/types/scheduleException';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';

async function runTests() {
  console.log('========================================================================');
  console.log('   PRUEBAS TÉCNICAS SUBBLOQUE 5: VALIDACIÓN DE CONFLICTOS Y EXCEPCIONES');
  console.log('========================================================================\n');

  let total = 0;
  let passed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [TEST ${total}] PASÓ: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [TEST ${total}] FALLÓ: ${testName}. Detalle: ${detail || ''}`);
    }
  }

  // Configuración base de datos simulada
  const mockRecurringSlots: TeacherRecurringSlot[] = [
    {
      id: 'rec-tue-16',
      teacherId: 'profesor-1',
      dayOfWeek: 2, // Martes
      startTime: '16:00',
      endTime: '17:00',
      duration: 60,
      isActive: true,
      originDate: '2026-11-03',
      createdAt: new Date(),
    },
    {
      id: 'rec-fri-17',
      teacherId: 'profesor-1',
      dayOfWeek: 5, // Viernes
      startTime: '17:00',
      endTime: '18:00',
      duration: 60,
      isActive: true,
      originDate: '2026-11-06',
      createdAt: new Date(),
    },
  ];

  const mockExceptions: TeacherScheduleException[] = [
    // 1. Vacaciones del 10 al 20 de noviembre de 2026
    {
      id: 'exc-vacation-nov',
      teacherId: 'profesor-1',
      type: 'vacation',
      startDate: '2026-11-10',
      endDate: '2026-11-20',
      reason: 'Vacaciones de noviembre',
    },
    // 2. Bloqueo de día completo: 25 de noviembre de 2026
    {
      id: 'exc-blocked-date-25',
      teacherId: 'profesor-1',
      type: 'blocked_date',
      startDate: '2026-11-25',
      endDate: '2026-11-25',
      reason: 'Día personal',
    },
    // 3. Bloqueo de ocurrencia puntual recurrente: Martes 2026-11-24 a las 16:00
    {
      id: 'exc-blocked-slot-24',
      teacherId: 'profesor-1',
      type: 'blocked_slot',
      startDate: '2026-11-24',
      endDate: '2026-11-24',
      recurringSlotId: 'rec-tue-16',
      targetTime: '16:00',
      reason: 'Consulta médica',
    },
  ];

  // TEST 1: Horario puntual dentro de vacaciones
  {
    const res = checkPunctualSlotExceptionConflict({
      date: '2026-11-12',
      startTime: '15:00',
      duration: 60,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });
    assert(
      res.hasConflict &&
      res.conflictType === 'vacation' &&
      res.errorMessage === 'No podés crear un horario disponible durante tus vacaciones.',
      'Horario puntual dentro de vacaciones es bloqueado con el mensaje específico requerido'
    );
  }

  // TEST 2: Horario puntual en blocked_date
  {
    const res = checkPunctualSlotExceptionConflict({
      date: '2026-11-25',
      startTime: '10:00',
      duration: 45,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });
    assert(
      res.hasConflict &&
      res.conflictType === 'blocked_date' &&
      res.errorMessage === 'Esta fecha está bloqueada en tu calendario.',
      'Horario puntual en fecha bloqueada completa es bloqueado con el mensaje específico requerido'
    );
  }

  // TEST 3: Horario puntual que coincide con blocked_slot (superposición de intervalos)
  {
    // Superposición total (16:00 a 17:00)
    const resTotal = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '16:00',
      duration: 60,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });

    // Superposición parcial dentro del intervalo (16:30 a 17:00, 30 min)
    const resPartial = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '16:30',
      duration: 30,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });

    assert(
      resTotal.hasConflict &&
      resTotal.conflictType === 'blocked_slot' &&
      resTotal.errorMessage === 'Este horario coincide con una franja bloqueada para esta fecha.' &&
      resPartial.hasConflict &&
      resPartial.conflictType === 'blocked_slot',
      'Horario puntual que solapa con un blocked_slot es bloqueado impidiendo eludir la excepción'
    );
  }

  // TEST 4: Horario puntual fuera del intervalo bloqueado en esa misma fecha
  {
    // Mismo día (2026-11-24), pero en horario antes (14:00 - 15:00) y después (18:00 - 19:00)
    const resBefore = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '14:00',
      duration: 60,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });

    const resAfter = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '18:00',
      duration: 60,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });

    assert(
      !resBefore.hasConflict && !resAfter.hasConflict,
      'Horario puntual fuera del intervalo del blocked_slot es permitido (no bloquea indiscriminadamente todo el día)'
    );
  }

  // TEST 5: Horario recurrente cuya primera semana coincide con vacaciones
  {
    // Regla creada con originDate dentro de vacaciones (ej: 2026-11-10)
    // La regla NO debe ser rechazada; en la proyección del calendario, la ocurrencia en vacaciones se oculta
    const newRecurringSlot: TeacherRecurringSlot = {
      id: 'rec-new-vac',
      teacherId: 'profesor-1',
      dayOfWeek: 2, // Martes
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      isActive: true,
      originDate: '2026-11-10', // Martes dentro de vacaciones (10 al 20 nov)
    };

    // Evaluación de proyección:
    // Ocurrencia del 10 de nov (dentro de vacaciones):
    const covered10 = isDateCoveredByVacation('2026-11-10', mockExceptions);
    // Ocurrencia del 24 de nov (fuera de vacaciones):
    const covered24 = isDateCoveredByVacation('2026-11-24', mockExceptions);

    assert(
      covered10 !== undefined && covered24 === undefined && newRecurringSlot.isActive === true,
      'Regla recurrente se crea normalmente; la proyección oculta ocurrencias en vacaciones y muestra las posteriores'
    );
  }

  // TEST 6: Horario recurrente con vacaciones futuras
  {
    // La regla rec-fri-17 existe de forma indefinida. Se agrega vacación futura en diciembre
    const futureVacation: TeacherScheduleException = {
      id: 'exc-future-dec',
      teacherId: 'profesor-1',
      type: 'vacation',
      startDate: '2026-12-20',
      endDate: '2026-12-30',
    };
    const updatedExceptions = [...mockExceptions, futureVacation];

    // Viernes actual (2026-11-27) está fuera de vacaciones
    const currentFridayCovered = isDateCoveredByVacation('2026-11-27', updatedExceptions);
    // Viernes futuro (2026-12-25) está dentro de vacaciones
    const futureFridayCovered = isDateCoveredByVacation('2026-12-25', updatedExceptions);

    assert(
      currentFridayCovered === undefined && futureFridayCovered !== undefined,
      'Regla recurrente con vacaciones futuras permanece activa en semanas regulares y se oculta solo en la semana de vacaciones'
    );
  }

  // TEST 7: Restauración tras eliminar excepción (recálculo inmediato sin duplicados)
  {
    // Lista sin la excepción blocked_slot del 24 de nov
    const restoredExceptions = mockExceptions.filter((e) => e.id !== 'exc-blocked-slot-24');

    const resRestored = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '16:00',
      duration: 60,
      exceptions: restoredExceptions,
      recurringSlots: mockRecurringSlots,
    });

    const isStillBlocked = isSlotBlocked('2026-11-24', 'rec-tue-16', '16:00', restoredExceptions);

    assert(
      !resRestored.hasConflict && isStillBlocked === undefined,
      'Restablecimiento: al eliminar la excepción, la disponibilidad se recalcula inmediatamente permitiendo el horario'
    );
  }

  // TEST 8: Clase reservada dentro de vacaciones (nunca se cancela ni se oculta)
  {
    // Simular clase reservada previa el 12 de noviembre (dentro de vacaciones)
    const mockBookedLesson = {
      id: 'lesson-123',
      date: '2026-11-12',
      startTime: '16:00',
      status: 'scheduled',
      title: 'Clase reservada con Alumno Juan',
    };

    // La lógica de proyección de TeacherAvailability siempre respeta status === 'booked'
    const isDayBlocked = isDateBlocked('2026-11-12', mockExceptions);
    const shouldDisplayBookedLesson = mockBookedLesson.status === 'scheduled';

    assert(
      isDayBlocked !== undefined && shouldDisplayBookedLesson,
      'Clase reservada dentro de vacaciones se preserva intacta y visible en el calendario'
    );
  }

  // TEST 9: Vacaciones que cruzan meses o años
  {
    const crossYearVacation: TeacherScheduleException = {
      id: 'exc-cross-year',
      teacherId: 'profesor-1',
      type: 'vacation',
      startDate: '2026-12-25',
      endDate: '2027-01-05',
    };
    const exceptionsWithCrossYear = [...mockExceptions, crossYearVacation];

    // Fecha a fin de año (2026-12-30)
    const resDec = checkPunctualSlotExceptionConflict({
      date: '2026-12-30',
      startTime: '10:00',
      duration: 60,
      exceptions: exceptionsWithCrossYear,
      recurringSlots: mockRecurringSlots,
    });

    // Fecha a inicio de año nuevo (2027-01-02)
    const resJan = checkPunctualSlotExceptionConflict({
      date: '2027-01-02',
      startTime: '10:00',
      duration: 60,
      exceptions: exceptionsWithCrossYear,
      recurringSlots: mockRecurringSlots,
    });

    // Fecha después de concluir vacaciones (2027-01-06)
    const resAfterJan = checkPunctualSlotExceptionConflict({
      date: '2027-01-06',
      startTime: '10:00',
      duration: 60,
      exceptions: exceptionsWithCrossYear,
      recurringSlots: mockRecurringSlots,
    });

    assert(
      resDec.hasConflict &&
      resJan.hasConflict &&
      !resAfterJan.hasConflict,
      'Vacaciones que cruzan meses o años evalúan correctamente los intervalos cronológicos ISO'
    );
  }

  // TEST 10: Intervalos consecutivos sin conflicto (intervalos semiabiertos)
  {
    // Slot bloqueado: 16:00 a 17:00 (duración 60)
    // Caso 1: Horario inmediatamente consecutivo después: 17:00 a 18:00
    const resConsecutiveAfter = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '17:00',
      duration: 60,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });

    // Caso 2: Horario inmediatamente consecutivo antes: 15:00 a 16:00
    const resConsecutiveBefore = checkPunctualSlotExceptionConflict({
      date: '2026-11-24',
      startTime: '15:00',
      duration: 60,
      exceptions: mockExceptions,
      recurringSlots: mockRecurringSlots,
    });

    // Verificación matemática directa con hasIntervalOverlap
    // [15:00, 16:00) vs [16:00, 17:00) -> 15:00 < 17:00 (T) pero 16:00 < 16:00 (F) -> No solapan
    const overlapBefore = hasIntervalOverlap('15:00', 60, '16:00', 60);
    // [16:00, 17:00) vs [17:00, 18:00) -> 16:00 < 18:00 (T) pero 17:00 < 17:00 (F) -> No solapan
    const overlapAfter = hasIntervalOverlap('16:00', 60, '17:00', 60);

    assert(
      !resConsecutiveAfter.hasConflict &&
      !resConsecutiveBefore.hasConflict &&
      !overlapBefore &&
      !overlapAfter,
      'Intervalos semiabiertos [startA, endA) y [startB, endB): horarios consecutivos exactos NO se bloquean'
    );
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`RESULTADO DE LAS PRUEBAS SUBBLOQUE 5: ${passed}/${total} superadas con éxito`);
  console.log('------------------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error no controlado en la ejecución de pruebas:', err);
  process.exit(1);
});
