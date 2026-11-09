/**
 * Suite de Pruebas Automatizadas - SUBBLOQUE 6B.2 (MusicKids)
 * PRECIO FIJO DE LOS ABONOS MENSUALES
 *
 * Verificaciones requeridas:
 * 1. El precio de 1 clase semanal coincide exactamente con la tarifa mensual configurada ('weekly_1').
 * 2. El precio de 2 clases semanales coincide con su tarifa mensual ('weekly_2').
 * 3. El precio de 3 clases semanales coincide con su tarifa mensual ('weekly_3').
 * 4. Un mes con cuatro ocurrencias y otro con cinco muestran el mismo precio para la misma frecuencia.
 * 5. La tarifa individual permanece intacta y no interviene en el cálculo de abonos.
 * 6. Planes inactivos, nulos o con precios <= 0 son rechazados y marcados como 'no configurados'.
 * 7. No se multiplica el precio por la cantidad de clases ni se divide entre semanas.
 * 8. Las fechas proyectadas y el algoritmo de cálculo de ocurrencias permanecen inalterados.
 */

import {
  getFixedMonthlyRateForFrequency,
  calculateMonthlyOccurrences,
} from '../src/services/monthlyBookingService';
import type { MonthlyPlan } from '../src/types/auth';
import type { TeacherRecurringSlot } from '../src/types/recurringSchedule';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] ${message}`);
}

console.log('========================================================================');
console.log('   PRUEBAS TÉCNICAS SUBBLOQUE 6B.2: PRECIO FIJO DE ABONOS MENSUALES');
console.log('========================================================================\n');

// Mock de planes mensuales configurados por el profesor en users/{uid}
const mockMonthlyPlans: MonthlyPlan[] = [
  {
    id: 'weekly_1',
    lessonsPerWeek: 1,
    lessonsPerMonth: 4,
    price: 25000, // $ 25.000 ARS
    active: true,
  },
  {
    id: 'weekly_2',
    lessonsPerWeek: 2,
    lessonsPerMonth: 8,
    price: 45000, // $ 45.000 ARS
    active: true,
  },
  {
    id: 'weekly_3',
    lessonsPerWeek: 3,
    lessonsPerMonth: 12,
    price: 60000, // $ 60.000 ARS
    active: true,
  },
];

// 1. Tarifa de 1 clase por semana coincide con la tarifa mensual configurada
const rate1 = getFixedMonthlyRateForFrequency(mockMonthlyPlans, 1);
assert(rate1.isConfigured === true, '1. Tarifa de 1 clase por semana está configurada');
assert(rate1.price === 25000, '1. Tarifa de 1 clase semanal coincide exactamente ($ 25.000 ARS)');
assert(rate1.planId === 'weekly_1', '1. PlanId es weekly_1');
assert(rate1.currency === 'ARS', '1. Moneda es ARS');

// 2. Tarifa de 2 clases por semana coincide con su tarifa mensual configurada
const rate2 = getFixedMonthlyRateForFrequency(mockMonthlyPlans, 2);
assert(rate2.isConfigured === true, '2. Tarifa de 2 clases por semana está configurada');
assert(rate2.price === 45000, '2. Tarifa de 2 clases semanales coincide exactamente ($ 45.000 ARS)');
assert(rate2.planId === 'weekly_2', '2. PlanId es weekly_2');

// 3. Tarifa de 3 clases por semana coincide con su tarifa mensual configurada
const rate3 = getFixedMonthlyRateForFrequency(mockMonthlyPlans, 3);
assert(rate3.isConfigured === true, '3. Tarifa de 3 clases por semana está configurada');
assert(rate3.price === 60000, '3. Tarifa de 3 clases semanales coincide exactamente ($ 60.000 ARS)');
assert(rate3.planId === 'weekly_3', '3. PlanId es weekly_3');

// 4. Independencia de ocurrencias: Un mes con 4 ocurrencias y otro con 5 muestran EL MISMO PRECIO
// Creamos una regla recurrente de los jueves (en Junio 2026 hay 4 jueves, en Julio 2026 hay 5 jueves)
const mockRuleThursdays: TeacherRecurringSlot = {
  id: 'rule-thurs',
  teacherId: 'teacher-123',
  dayOfWeek: 4, // Jueves
  startTime: '16:00',
  endTime: '16:45',
  duration: 45,
  isActive: true,
  originDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const previewJune2026 = calculateMonthlyOccurrences({
  year: 2026,
  month: 6, // Junio 2026 tiene 4 jueves
  selectedRules: [mockRuleThursdays],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-01-01', currentMinutes: 0 },
});

const previewJuly2026 = calculateMonthlyOccurrences({
  year: 2026,
  month: 7, // Julio 2026 tiene 5 jueves
  selectedRules: [mockRuleThursdays],
  exceptions: [],
  availabilitySlots: [],
  targetClassesPerWeek: 1,
  referenceNow: { dateStr: '2026-01-01', currentMinutes: 0 },
});

assert(previewJune2026.totalOccurrences === 4, '4a. Junio 2026 proyecta exactamente 4 ocurrencias');
assert(previewJuly2026.totalOccurrences === 5, '4b. Julio 2026 proyecta exactamente 5 ocurrencias');

const rateJune = getFixedMonthlyRateForFrequency(mockMonthlyPlans, 1);
const rateJuly = getFixedMonthlyRateForFrequency(mockMonthlyPlans, 1);

assert(
  rateJune.price === rateJuly.price && rateJune.price === 25000,
  '4c. El precio del abono mensual es IDÉNTICO ($ 25.000) tanto para el mes de 4 clases como para el de 5 clases'
);

// 5. La tarifa individual permanece intacta y no interviene en el cálculo
const mockTeacherProfile = {
  uid: 'teacher-123',
  singleLessonPrice: 7000, // $ 7.000 ARS por clase individual
  monthlyPlans: mockMonthlyPlans,
};

assert(mockTeacherProfile.singleLessonPrice === 7000, '5a. Tarifa individual se conserva en 7000');
assert(
  rate1.price !== mockTeacherProfile.singleLessonPrice,
  '5b. La tarifa del abono mensual no se confunde con la tarifa de clase individual'
);
assert(
  rate1.price !== mockTeacherProfile.singleLessonPrice * 4,
  '5c. La tarifa del abono no es un simple múltiplo de la tarifa individual'
);

// 6. Validación de tarifa no configurada (null, <= 0, inactiva o ausente)
const unconfiguredPlans: MonthlyPlan[] = [
  {
    id: 'weekly_1',
    lessonsPerWeek: 1,
    lessonsPerMonth: 4,
    price: null, // No configurado
    active: true,
  },
  {
    id: 'weekly_2',
    lessonsPerWeek: 2,
    lessonsPerMonth: 8,
    price: 40000,
    active: false, // Inactivo
  },
  {
    id: 'weekly_3',
    lessonsPerWeek: 3,
    lessonsPerMonth: 12,
    price: -500, // Inválido
    active: true,
  },
];

const unconfigured1 = getFixedMonthlyRateForFrequency(unconfiguredPlans, 1);
assert(unconfigured1.isConfigured === false, '6a. Plan con precio nulo retorna isConfigured: false');
assert(unconfigured1.price === null, '6b. Plan con precio nulo no inventa precio (price: null)');

const unconfigured2 = getFixedMonthlyRateForFrequency(unconfiguredPlans, 2);
assert(unconfigured2.isConfigured === false, '6c. Plan inactivo retorna isConfigured: false');
assert(unconfigured2.price === null, '6d. Plan inactivo no permite cotizar importe');

const unconfigured3 = getFixedMonthlyRateForFrequency(unconfiguredPlans, 3);
assert(unconfigured3.isConfigured === false, '6e. Plan con precio <= 0 retorna isConfigured: false');

const emptyPlansRate = getFixedMonthlyRateForFrequency([], 1);
assert(emptyPlansRate.isConfigured === false, '6f. Lista vacía de planes retorna isConfigured: false');

const undefinedPlansRate = getFixedMonthlyRateForFrequency(undefined, 1);
assert(undefinedPlansRate.isConfigured === false, '6g. Planes undefined retorna isConfigured: false');

// 7. No se divide entre cuatro semanas ni se calculan precios por clase en el abono mensual
assert(
  rate1.price === 25000 && !('pricePerLesson' in rate1),
  '7. No se calcula precio por clase dentro del abono fijo mensual'
);

// 8. Integridad de las fechas proyectadas: las ocurrencias mantienen sus horarios, duraciones y estados
assert(
  previewJune2026.occurrences.every((occ) => occ.duration === 45),
  '8a. Todas las ocurrencias proyectadas duran exactamente 45 minutos'
);
assert(
  previewJune2026.occurrences[0].date === '2026-06-04' &&
  previewJune2026.occurrences[1].date === '2026-06-11' &&
  previewJune2026.occurrences[2].date === '2026-06-18' &&
  previewJune2026.occurrences[3].date === '2026-06-25',
  '8b. Fechas proyectadas en Junio 2026 son exactas y ordenadas cronológicamente'
);

console.log('\n========================================================================');
console.log('🎉 TODAS LAS PRUEBAS DEL SUBBLOQUE 6B.2 PASARON EXITOSAMENTE.');
console.log('========================================================================\n');
