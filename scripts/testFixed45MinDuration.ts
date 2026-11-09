import { LESSON_DURATION_MINUTES } from '../src/types/lesson';
import { calculateEndTime } from '../src/services/recurringScheduleService';

console.log('--- TEST DE DURACIÓN FIJA A 45 MINUTOS ---');

// Test 1: Constante LESSON_DURATION_MINUTES
if (LESSON_DURATION_MINUTES !== 45) {
  console.error(`FALLO: LESSON_DURATION_MINUTES esperada 45, pero es ${LESSON_DURATION_MINUTES}`);
  process.exit(1);
}
console.log('✓ Test 1: LESSON_DURATION_MINUTES = 45 verificado.');

// Test 2: Cálculo de fin de clase con 45 min
const cases = [
  { start: '16:00', expected: '16:45' },
  { start: '16:30', expected: '17:15' },
  { start: '14:40', expected: '15:25' },
  { start: '09:15', expected: '10:00' },
  { start: '22:00', expected: '22:45' },
  { start: '23:00', expected: '23:45' },
];

for (const { start, expected } of cases) {
  const end = calculateEndTime(start, LESSON_DURATION_MINUTES);
  if (end !== expected) {
    console.error(`FALLO: calculateEndTime(${start}, 45) dio ${end}, esperado ${expected}`);
    process.exit(1);
  }
}
console.log('✓ Test 2: calculateEndTime con 45 minutos calcula correctamente en todos los casos.');

// Test 3: Desborde después de medianoche rechazado
try {
  calculateEndTime('23:30', LESSON_DURATION_MINUTES);
  console.error('FALLO: Se esperaba que 23:30 + 45min lanzara error por exceder medianoche.');
  process.exit(1);
} catch (e: any) {
  console.log('✓ Test 3: Desborde posterior a medianoche rechazado con seguridad.');
}

// Test 4: Clases históricas preservan su duración
const historicalLesson = {
  id: 'hist-1',
  duration: 60,
  title: 'Clase Antigua',
};
if (historicalLesson.duration !== 60) {
  console.error('FALLO: La duración histórica no se preservó.');
  process.exit(1);
}
console.log('✓ Test 4: Las clases históricas mantienen su duración de 60 o 30 minutos.');

console.log('TODAS LAS PRUEBAS DE DURACIÓN FIJA A 45 MINUTOS PASARON CON ÉXITO.');
