import { createTeacherAvailability } from '../src/services/availabilityService';
import { bookTeacherSlot } from '../src/services/lessonService';

console.log('========================================================================');
console.log('   PRUEBAS TÉCNICAS FASE B: DESACTIVACIÓN DE DISPONIBILIDAD PUNTUAL Y RESERVAS INDIVIDUALES');
console.log('========================================================================');

// Test 1: createTeacherAvailability lanza error de deprecación
let createPassed = false;
try {
  await createTeacherAvailability({
    teacherId: 'teacher-1',
    date: '2026-11-20',
    startTime: '16:00',
    duration: 45,
  });
} catch (err: any) {
  if (err.message && err.message.includes('PUNCTUAL_SLOTS_DEPRECATED')) {
    createPassed = true;
  } else {
    console.error('Error inesperado en createTeacherAvailability:', err);
  }
}

if (!createPassed) {
  console.error('❌ [TEST 1] FALLÓ: createTeacherAvailability no arrojó el error de deprecación esperado.');
  process.exit(1);
}
console.log('✅ [TEST 1] PASÓ: createTeacherAvailability bloqueado firmemente con PUNCTUAL_SLOTS_DEPRECATED.');

// Test 2: bookTeacherSlot lanza error de deprecación
let bookPassed = false;
try {
  await bookTeacherSlot({
    availabilityId: 'avail-1',
    teacherId: 'teacher-1',
    studentId: 'student-1',
    slotDate: '2026-11-20',
    slotStartTime: '16:00',
    duration: 45,
  });
} catch (err: any) {
  if (err.message && err.message.includes('INDIVIDUAL_BOOKINGS_DEPRECATED')) {
    bookPassed = true;
  } else {
    console.error('Error inesperado en bookTeacherSlot:', err);
  }
}

if (!bookPassed) {
  console.error('❌ [TEST 2] FALLÓ: bookTeacherSlot no arrojó el error de deprecación esperado.');
  process.exit(1);
}
console.log('✅ [TEST 2] PASÓ: bookTeacherSlot bloqueado firmemente con INDIVIDUAL_BOOKINGS_DEPRECATED.');

console.log('========================================================================');
console.log('🎉 TODAS LAS PRUEBAS DE LA FASE B PASARON EXITOSAMENTE.');
console.log('========================================================================');
