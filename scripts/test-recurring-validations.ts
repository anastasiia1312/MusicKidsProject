import {
  timeToMinutes,
  minutesToTime,
  calculateEndTime,
  getLocalDateDayOfWeek,
  hasIntervalOverlap,
  validateRecurringSlotData,
} from '../src/services/recurringScheduleService';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';

// Simulated checkRecurringSlotOverlap logic (pure function mirror of service logic)
function simulateCheckRecurringSlotOverlap(
  existingSlots: TeacherRecurringSlot[],
  teacherId: string,
  dayOfWeek: number,
  startTime: string,
  duration: number,
  excludeSlotId?: string
): { hasOverlap: boolean; isDuplicate: boolean; conflictingSlot?: TeacherRecurringSlot } {
  for (const slot of existingSlots) {
    if (excludeSlotId && slot.id === excludeSlotId) continue;
    if (slot.teacherId !== teacherId) continue;
    if (slot.dayOfWeek !== dayOfWeek) continue;
    if (!slot.isActive) continue;

    // Verificación de duplicado exacto
    if (slot.startTime === startTime && slot.duration === duration) {
      return { hasOverlap: true, isDuplicate: true, conflictingSlot: slot };
    }

    // Verificación de solapamiento de intervalos
    if (hasIntervalOverlap(startTime, duration, slot.startTime, slot.duration)) {
      return { hasOverlap: true, isDuplicate: false, conflictingSlot: slot };
    }
  }

  return { hasOverlap: false, isDuplicate: false };
}

// Mock auth.currentUser for validateRecurringSlotData
// We will test both with auth matching and with mismatched auth
const mockTeacherId = 'teacher_pro_123';

// Setup global or mock for auth.currentUser
import { auth } from '../src/services/firebase';
Object.defineProperty(auth, 'currentUser', {
  configurable: true,
  get: () => ({ uid: mockTeacherId }),
});

interface TestCaseResult {
  id: number;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: any;
}

const results: TestCaseResult[] = [];

console.log('=== INICIANDO BATERÍA DE PRUEBAS TÉCNICAS: SUBBLOQUE 1 ===\n');

// Caso 1: Crear un horario válido: martes a las 16:00, duración 60 minutos
try {
  const payload = {
    teacherId: mockTeacherId,
    dayOfWeek: 2, // Martes
    startTime: '16:00',
    duration: 60 as const,
    originDate: '2026-03-03', // 3 de marzo de 2026 es martes
  };
  validateRecurringSlotData(payload);
  const endTime = calculateEndTime(payload.startTime, payload.duration);
  const passed = endTime === '17:00';
  results.push({
    id: 1,
    name: 'Horario válido: Martes 16:00 (60 min)',
    expected: 'Válido, endTime = 17:00',
    actual: `Válido, endTime = ${endTime}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 1,
    name: 'Horario válido: Martes 16:00 (60 min)',
    expected: 'Válido, endTime = 17:00',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 2: Rechazar un horario duplicado: martes a las 16:00
try {
  const existingSlots: TeacherRecurringSlot[] = [
    {
      id: 'slot-1',
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      endTime: '17:00',
      duration: 60,
      isActive: true,
      originDate: '2026-03-03',
    },
  ];
  const check = simulateCheckRecurringSlotOverlap(existingSlots, mockTeacherId, 2, '16:00', 60);
  const passed = check.isDuplicate && check.hasOverlap;
  results.push({
    id: 2,
    name: 'Rechazar horario duplicado: Martes 16:00 (60 min)',
    expected: 'isDuplicate: true, hasOverlap: true',
    actual: `isDuplicate: ${check.isDuplicate}, hasOverlap: ${check.hasOverlap}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 2,
    name: 'Rechazar horario duplicado: Martes 16:00 (60 min)',
    expected: 'isDuplicate: true',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 3: Rechazar un horario solapado: martes a las 16:30, duración 30 minutos
try {
  const existingSlots: TeacherRecurringSlot[] = [
    {
      id: 'slot-1',
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      endTime: '17:00',
      duration: 60,
      isActive: true,
      originDate: '2026-03-03',
    },
  ];
  const check = simulateCheckRecurringSlotOverlap(existingSlots, mockTeacherId, 2, '16:30', 30);
  const passed = !check.isDuplicate && check.hasOverlap;
  results.push({
    id: 3,
    name: 'Rechazar horario solapado: Martes 16:30 (30 min con 16:00-17:00)',
    expected: 'hasOverlap: true, isDuplicate: false',
    actual: `hasOverlap: ${check.hasOverlap}, isDuplicate: ${check.isDuplicate}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 3,
    name: 'Rechazar horario solapado: Martes 16:30 (30 min)',
    expected: 'hasOverlap: true',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 4: Permitir un horario consecutivo: martes a las 17:00 (60 min)
try {
  const existingSlots: TeacherRecurringSlot[] = [
    {
      id: 'slot-1',
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      endTime: '17:00',
      duration: 60,
      isActive: true,
      originDate: '2026-03-03',
    },
  ];
  const overlapDirect = hasIntervalOverlap('16:00', 60, '17:00', 60);
  const check = simulateCheckRecurringSlotOverlap(existingSlots, mockTeacherId, 2, '17:00', 60);
  const passed = !overlapDirect && !check.hasOverlap;
  results.push({
    id: 4,
    name: 'Permitir horario consecutivo: Martes 17:00 justo tras 16:00-17:00',
    expected: 'hasOverlap: false (consecutivo permitido)',
    actual: `hasOverlap: ${check.hasOverlap}, overlapDirect: ${overlapDirect}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 4,
    name: 'Permitir horario consecutivo: Martes 17:00',
    expected: 'hasOverlap: false',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 5: Rechazar horas inválidas como 25:00 o 16:75
try {
  let err25Caught = false;
  let err75Caught = false;

  try {
    validateRecurringSlotData({
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '25:00',
      duration: 60,
      originDate: '2026-03-03',
    });
  } catch (e: any) {
    if (e.message.includes('formato HH:mm válido')) err25Caught = true;
  }

  try {
    validateRecurringSlotData({
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:75',
      duration: 60,
      originDate: '2026-03-03',
    });
  } catch (e: any) {
    if (e.message.includes('formato HH:mm válido')) err75Caught = true;
  }

  const passed = err25Caught && err75Caught;
  results.push({
    id: 5,
    name: 'Rechazar horas inválidas (25:00 y 16:75)',
    expected: 'Ambos rechazados por formato regex HH:mm',
    actual: `25:00 rechazado: ${err25Caught}, 16:75 rechazado: ${err75Caught}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 5,
    name: 'Rechazar horas inválidas (25:00 y 16:75)',
    expected: 'Ambos rechazados',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 6: Rechazar duraciones diferentes de 30, 45 y 60 minutos (ej: 15 y 90)
try {
  let err15Caught = false;
  let err90Caught = false;

  try {
    validateRecurringSlotData({
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      duration: 15 as any,
      originDate: '2026-03-03',
    });
  } catch (e: any) {
    if (e.message.includes('debe ser de 30, 45 o 60 minutos')) err15Caught = true;
  }

  try {
    validateRecurringSlotData({
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      duration: 90 as any,
      originDate: '2026-03-03',
    });
  } catch (e: any) {
    if (e.message.includes('debe ser de 30, 45 o 60 minutos')) err90Caught = true;
  }

  const passed = err15Caught && err90Caught;
  results.push({
    id: 6,
    name: 'Rechazar duraciones no permitidas (15 min y 90 min)',
    expected: 'Ambos rechazados por no pertenecer a [30, 45, 60]',
    actual: `15m rechazado: ${err15Caught}, 90m rechazado: ${err90Caught}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 6,
    name: 'Rechazar duraciones no permitidas',
    expected: 'Ambos rechazados',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 7: Rechazar un dayOfWeek que no corresponda a originDate
try {
  let mismatchCaught = false;
  try {
    // 2026-03-03 es Martes (dayOfWeek: 2). Enviamos dayOfWeek: 1 (Lunes).
    validateRecurringSlotData({
      teacherId: mockTeacherId,
      dayOfWeek: 1, // Lunes
      startTime: '16:00',
      duration: 60,
      originDate: '2026-03-03', // Martes
    });
  } catch (e: any) {
    if (e.message.includes('no coincide con el día de la fecha de origen')) {
      mismatchCaught = true;
    }
  }

  results.push({
    id: 7,
    name: 'Rechazar dayOfWeek incoherente con originDate (dayOfWeek: 1 vs 2026-03-03 Martes)',
    expected: 'Rechazado por incoherencia',
    actual: `Incoherencia detectada: ${mismatchCaught}`,
    passed: mismatchCaught,
  });
} catch (err: any) {
  results.push({
    id: 7,
    name: 'Rechazar dayOfWeek incoherente',
    expected: 'Rechazado',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 8: Verificar que un horario desactivado no impida crear otro en el mismo intervalo
try {
  const existingSlots: TeacherRecurringSlot[] = [
    {
      id: 'slot-inactive-1',
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      endTime: '17:00',
      duration: 60,
      isActive: false, // Desactivado
      originDate: '2026-03-03',
    },
  ];

  const check = simulateCheckRecurringSlotOverlap(existingSlots, mockTeacherId, 2, '16:00', 60);
  const passed = !check.hasOverlap && !check.isDuplicate;

  results.push({
    id: 8,
    name: 'Horario desactivado (isActive: false) no bloquea nuevo horario en el mismo intervalo',
    expected: 'hasOverlap: false, isDuplicate: false',
    actual: `hasOverlap: ${check.hasOverlap}, isDuplicate: ${check.isDuplicate}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 8,
    name: 'Horario desactivado no bloquea',
    expected: 'hasOverlap: false',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 9: Verificar que actualizar un horario no provoque conflictos consigo mismo
try {
  const existingSlots: TeacherRecurringSlot[] = [
    {
      id: 'slot-self-123',
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '16:00',
      endTime: '17:00',
      duration: 60,
      isActive: true,
      originDate: '2026-03-03',
    },
    {
      id: 'slot-other-456',
      teacherId: mockTeacherId,
      dayOfWeek: 2,
      startTime: '18:00',
      endTime: '19:00',
      duration: 60,
      isActive: true,
      originDate: '2026-03-03',
    },
  ];

  // Actualizar slot-self-123 conservando 16:00 (debe excluirse a sí mismo y no fallar)
  const checkSelf = simulateCheckRecurringSlotOverlap(
    existingSlots,
    mockTeacherId,
    2,
    '16:00',
    60,
    'slot-self-123'
  );

  // Actualizar slot-self-123 para solaparse con slot-other-456 (a las 18:30)
  const checkConflict = simulateCheckRecurringSlotOverlap(
    existingSlots,
    mockTeacherId,
    2,
    '18:30',
    30,
    'slot-self-123'
  );

  const passed = !checkSelf.hasOverlap && checkConflict.hasOverlap;
  results.push({
    id: 9,
    name: 'Actualización excluye el ID propio pero detecta conflictos con terceros',
    expected: 'checkSelf.hasOverlap: false, checkConflict.hasOverlap: true',
    actual: `checkSelf.hasOverlap: ${checkSelf.hasOverlap}, checkConflict.hasOverlap: ${checkConflict.hasOverlap}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 9,
    name: 'Actualización no provoca conflicto consigo mismo',
    expected: 'Pasa sin conflicto propio',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

// Caso 10: Validar casos de borde relacionados con zona horaria (ej: America/Argentina/Buenos_Aires UTC-3)
try {
  // En UTC-3, hacer new Date("2026-03-03T00:00:00Z").getDay() daría 1 (Lunes 21:00 hs).
  // getLocalDateDayOfWeek("2026-03-03") DEBE devolver 2 (Martes), porque se descompone localmente.
  const dayCalculated = getLocalDateDayOfWeek('2026-03-03');
  const isTuesday = dayCalculated === 2;

  // Detección de fecha inválida (ej: 30 de febrero)
  let feb30Rejected = false;
  try {
    getLocalDateDayOfWeek('2026-02-30');
  } catch (e: any) {
    if (e.message.includes('no es una fecha de calendario válida')) {
      feb30Rejected = true;
    }
  }

  // Detección de medianoche / final de día (ej: 23:30 con duración 60 finaliza a las 00:30, debe rechazarse)
  let pastMidnightRejected = false;
  try {
    calculateEndTime('23:30', 60);
  } catch (e: any) {
    if (e.message.includes('medianoche')) {
      pastMidnightRejected = true;
    }
  }

  const passed = isTuesday && feb30Rejected && pastMidnightRejected;
  results.push({
    id: 10,
    name: 'Zona horaria e invariabilidad de fecha calendario (UTC vs Local, Feb 30, desborde medianoche)',
    expected: 'dayOfWeek: 2 para 2026-03-03, Feb 30 rechazado, 23:30+60m rechazado',
    actual: `dayOfWeek: ${dayCalculated}, feb30Rechazado: ${feb30Rejected}, medianocheRechazado: ${pastMidnightRejected}`,
    passed,
  });
} catch (err: any) {
  results.push({
    id: 10,
    name: 'Casos de borde zona horaria y calendario',
    expected: 'Todos los casos controlados',
    actual: `Error: ${err.message}`,
    passed: false,
  });
}

console.log('RESULTADOS DE LAS 10 PRUEBAS:\n');
let allPassed = true;
results.forEach((r) => {
  const icon = r.passed ? '✓ PASÓ' : '✗ FALLÓ';
  console.log(`[${icon}] Caso ${r.id}: ${r.name}`);
  console.log(`       Esperado: ${r.expected}`);
  console.log(`       Obtenido: ${r.actual}\n`);
  if (!r.passed) allPassed = false;
});

console.log(`ESTADO GENERAL: ${allPassed ? '10/10 PRUEBAS EXITOSAS' : 'FALLOS DETECTADOS'}`);
process.exit(allPassed ? 0 : 1);
