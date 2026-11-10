/**
 * Test Suite para BLOQUE 7: Estadísticas del Profesor
 * Verifica reglas críticas:
 * 1. Un abono de $65.000 ARS con 4 clases genera exactamente $65.000 ARS de ingresos (no $260.000).
 * 2. Las transferencias pendientes no se suman a los ingresos confirmados.
 * 3. Las clases realizadas solo consideran status === 'completed'.
 * 4. La deduplicación de alumnos activos funciona correctamente.
 * 5. Tasa de ocupación basada en slots recurrentes activos.
 * 6. Tasa de asistencia indica explícitamente "Datos no disponibles".
 */

import {
  calculateTeacherStats,
  calculatePeriodRanges,
  type TeacherStatsRawData,
} from '../src/services/teacherStatsService';
import type { Lesson } from '../src/types/lesson';
import type { MonthlyBooking } from '../src/types/monthlyBooking';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ APROBÓ: ${msg}`);
}

console.log('--- INICIANDO PRUEBAS UNITARIAS DE BLOQUE 7: ESTADÍSTICAS ---');

const refDate = new Date(2026, 10, 15, 12, 0, 0); // 15 de Noviembre 2026

// Mock Data
const mockTeacherId = 'teacher_pro_1';

const mockRecurringSlots: TeacherRecurringSlot[] = [
  {
    id: 'slot_1',
    teacherId: mockTeacherId,
    dayOfWeek: 1, // Lunes
    startTime: '16:00',
    endTime: '16:45',
    duration: 45,
    isActive: true,
    originDate: '2026-11-01',
  },
  {
    id: 'slot_2',
    teacherId: mockTeacherId,
    dayOfWeek: 3, // Miércoles
    startTime: '17:00',
    endTime: '17:45',
    duration: 45,
    isActive: true,
    originDate: '2026-11-01',
  },
];

// Abono 1: Confirmado en Noviembre 2026, 4 clases, $65.000 ARS
const bookingConfirmedNov: MonthlyBooking = {
  id: 'mb_nov_1',
  teacherId: mockTeacherId,
  studentId: 'student_juan',
  studentName: 'Juan Pérez',
  month: '2026-11',
  weeklyFrequency: 1,
  totalLessons: 4,
  totalPrice: 65000,
  price: 65000,
  currency: 'ARS',
  status: 'confirmed',
  confirmedAt: new Date(2026, 10, 2, 10, 0, 0),
  createdAt: new Date(2026, 10, 1, 10, 0, 0),
  updatedAt: new Date(2026, 10, 2, 10, 0, 0),
  recurringSlotIds: ['slot_1'],
};

// Abono 2: PENDIENTE de pago en Noviembre 2026, 4 clases, $65.000 ARS (NO debe sumarse a ingresos)
const bookingPendingNov: MonthlyBooking = {
  id: 'mb_nov_2',
  teacherId: mockTeacherId,
  studentId: 'student_lucia',
  studentName: 'Lucía Gómez',
  month: '2026-11',
  weeklyFrequency: 1,
  totalLessons: 4,
  totalPrice: 65000,
  price: 65000,
  currency: 'ARS',
  status: 'pending_payment_confirmation',
  createdAt: new Date(2026, 10, 5, 10, 0, 0),
  updatedAt: new Date(2026, 10, 5, 10, 0, 0),
  recurringSlotIds: ['slot_2'],
};

// Abono 3: Confirmado en Octubre 2026 (mes anterior), $65.000 ARS
const bookingConfirmedOct: MonthlyBooking = {
  id: 'mb_oct_1',
  teacherId: mockTeacherId,
  studentId: 'student_juan',
  studentName: 'Juan Pérez',
  month: '2026-10',
  weeklyFrequency: 1,
  totalLessons: 4,
  totalPrice: 65000,
  price: 65000,
  currency: 'ARS',
  status: 'confirmed',
  confirmedAt: new Date(2026, 9, 2, 10, 0, 0),
  createdAt: new Date(2026, 9, 1, 10, 0, 0),
  updatedAt: new Date(2026, 9, 2, 10, 0, 0),
  recurringSlotIds: ['slot_1'],
};

// Clases asociadas
const mockLessons: Lesson[] = [
  // 2 clases completadas para Juan en Noviembre
  {
    id: 'less_nov_1',
    title: 'Clase de Piano',
    teacherId: mockTeacherId,
    studentId: 'student_juan',
    date: new Date(2026, 10, 2, 16, 0, 0) as any,
    duration: 45,
    status: 'completed',
    monthlyBookingId: 'mb_nov_1',
  },
  {
    id: 'less_nov_2',
    title: 'Clase de Piano',
    teacherId: mockTeacherId,
    studentId: 'student_juan',
    date: new Date(2026, 10, 9, 16, 0, 0) as any,
    duration: 45,
    status: 'completed',
    monthlyBookingId: 'mb_nov_1',
  },
  // 1 clase programada futura para Juan en Noviembre
  {
    id: 'less_nov_3',
    title: 'Clase de Piano',
    teacherId: mockTeacherId,
    studentId: 'student_juan',
    date: new Date(2026, 10, 16, 16, 0, 0) as any,
    duration: 45,
    status: 'scheduled',
    monthlyBookingId: 'mb_nov_1',
  },
  // 1 clase programada para otro alumno (Mateo) manual
  {
    id: 'less_nov_4',
    title: 'Clase de Guitarra',
    teacherId: mockTeacherId,
    studentId: 'student_mateo',
    date: new Date(2026, 10, 18, 17, 0, 0) as any,
    duration: 45,
    status: 'scheduled',
  },
  // 1 clase cancelada para Sofía
  {
    id: 'less_nov_5',
    title: 'Clase de Canto',
    teacherId: mockTeacherId,
    studentId: 'student_sofia',
    date: new Date(2026, 10, 20, 15, 0, 0) as any,
    duration: 45,
    status: 'cancelled',
  },
  // 1 clase completada en Octubre (mes anterior)
  {
    id: 'less_oct_1',
    title: 'Clase de Piano',
    teacherId: mockTeacherId,
    studentId: 'student_juan',
    date: new Date(2026, 9, 15, 16, 0, 0) as any,
    duration: 45,
    status: 'completed',
    monthlyBookingId: 'mb_oct_1',
  },
];

const rawData: TeacherStatsRawData = {
  lessons: mockLessons,
  monthlyBookings: [bookingConfirmedNov, bookingPendingNov, bookingConfirmedOct],
  recurringSlots: mockRecurringSlots,
  students: [],
};

// PRUEBA 1: Cálculo de período actual (este mes: Noviembre 2026)
const statsThisMonth = calculateTeacherStats(rawData, 'this_month', undefined, undefined, refDate);

assert(
  statsThisMonth.summary.confirmedIncomeARS === 65000,
  `Ingresos confirmados deben ser exactamente $65.000 ARS (obtenido: ${statsThisMonth.summary.confirmedIncomeARS})`
);

assert(
  statsThisMonth.summary.completedLessonsCount === 2,
  `Clases realizadas deben ser exactamente 2 (obtenido: ${statsThisMonth.summary.completedLessonsCount})`
);

assert(
  statsThisMonth.summary.scheduledLessonsCount === 2,
  `Clases programadas deben ser exactamente 2 (obtenido: ${statsThisMonth.summary.scheduledLessonsCount})`
);

// Juan y Mateo (Sofía solo tiene clase cancelada, pero verifiquemos alumnos activos)
// Juan tiene clases no canceladas y abono confirmado; Mateo tiene clase scheduled; Sofía tiene clase cancelada
assert(
  statsThisMonth.summary.activeStudentsCount === 2,
  `Alumnos activos únicos deben ser 2 (Juan y Mateo) sin duplicar ni incluir cancelados puros (obtenido: ${statsThisMonth.summary.activeStudentsCount})`
);

// PRUEBA 2: Distribución de clases
assert(
  statsThisMonth.classDistribution.total === 5,
  `Total de clases en el mes debe ser 5 (obtenido: ${statsThisMonth.classDistribution.total})`
);
assert(
  statsThisMonth.classDistribution.cancelled === 1,
  `Clases canceladas debe ser 1 (obtenido: ${statsThisMonth.classDistribution.cancelled})`
);
assert(
  statsThisMonth.classDistribution.completed === 2,
  `Clases completadas debe ser 2 (obtenido: ${statsThisMonth.classDistribution.completed})`
);

// PRUEBA 3: Indicadores de Desempeño
assert(
  statsThisMonth.performance.avgLessonsPerStudent === 2, // (2 realizadas + 2 programadas) / 2 alumnos = 2.0
  `Promedio de clases por alumno debe ser 2.0 (obtenido: ${statsThisMonth.performance.avgLessonsPerStudent})`
);

assert(
  statsThisMonth.performance.occupancyRatePercent !== null && statsThisMonth.performance.occupancyRatePercent > 0,
  `Tasa de ocupación debe ser un porcentaje válido mayor a 0 (obtenido: ${statsThisMonth.performance.occupancyRatePercent}%)`
);

assert(
  statsThisMonth.performance.attendanceRateNote.includes('Datos no disponibles'),
  `Tasa de asistencia debe indicar que los datos no están disponibles sin inventar porcentajes falsos`
);

// PRUEBA 4: Comparación con período anterior (Octubre 2026 vs Noviembre 2026)
assert(
  statsThisMonth.summary.confirmedIncomeDeltaPercent === 0, // 65000 vs 65000 = 0%
  `Variación de ingresos vs mes anterior debe ser 0% (obtenido: ${statsThisMonth.summary.confirmedIncomeDeltaPercent}%)`
);

// PRUEBA 5: Filtro "Últimos 3 meses"
const statsLast3Months = calculateTeacherStats(rawData, 'last_3_months', undefined, undefined, refDate);
assert(
  statsLast3Months.summary.confirmedIncomeARS === 130000, // Octubre (65000) + Noviembre (65000)
  `Ingresos últimos 3 meses debe ser $130.000 ARS (obtenido: ${statsLast3Months.summary.confirmedIncomeARS})`
);

console.log('🎉 TODAS LAS PRUEBAS DE ESTADÍSTICAS DEL PROFESOR PASARON CON ÉXITO.');
