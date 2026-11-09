import { validateBankDetails } from '../src/services/teacherBankDetailsService';
import type { TeacherBankDetails, SaveTeacherBankDetailsPayload } from '../src/types/bankDetails';

console.log('========================================================================');
console.log('   PRUEBAS TÉCNICAS SUBBLOQUE 6B.1: DATOS BANCARIOS DEL PROFESOR');
console.log('========================================================================');

// Test 1: Validación exitosa con todos los campos
const valid1 = validateBankDetails({
  alias: 'musica.pedro.piano',
  cbuCvu: '0170001540000012345678', // 22 dígitos exactos
  accountHolder: 'Pedro Morales',
  bankName: 'Banco BBVA',
});

if (!valid1.isValid || !valid1.cleanData) {
  console.error('❌ [TEST 1] FALLÓ: Datos válidos completos rechazados:', valid1.errorMessage);
  process.exit(1);
}
if (valid1.cleanData.cbuCvu.length !== 22) {
  console.error('❌ [TEST 1] FALLÓ: La longitud del CBU/CVU no es 22.');
  process.exit(1);
}
console.log('✅ [TEST 1] PASÓ: Configuración completa válida aceptada correctamente.');

// Test 2: Validación exitosa sin banco opcional (banco en blanco)
const valid2 = validateBankDetails({
  alias: '  profe.musica.ar  ',
  cbuCvu: '0000003100012345678901', // Con ceros iniciales
  accountHolder: '  María Elena Walsh  ',
  bankName: '   ',
});

if (!valid2.isValid || !valid2.cleanData) {
  console.error('❌ [TEST 2] FALLÓ: Datos válidos con banco opcional vacío rechazados:', valid2.errorMessage);
  process.exit(1);
}
if (valid2.cleanData.alias !== 'profe.musica.ar') {
  console.error('❌ [TEST 2] FALLÓ: El alias no fue sanitizado con trim.');
  process.exit(1);
}
if (valid2.cleanData.accountHolder !== 'María Elena Walsh') {
  console.error('❌ [TEST 2] FALLÓ: El titular no fue sanitizado con trim.');
  process.exit(1);
}
if (valid2.cleanData.bankName !== '') {
  console.error('❌ [TEST 2] FALLÓ: El banco vacío debería ser string vacío.');
  process.exit(1);
}
console.log('✅ [TEST 2] PASÓ: Banco opcional y sanitización de espacios con trim.');

// Test 3: Rechazo de Alias vacío
const invalidAlias = validateBankDetails({
  alias: '   ',
  cbuCvu: '0170001540000012345678',
  accountHolder: 'Pedro Morales',
});

if (invalidAlias.isValid) {
  console.error('❌ [TEST 3] FALLÓ: Debería rechazar Alias vacío.');
  process.exit(1);
}
console.log('✅ [TEST 3] PASÓ: Alias vacío rechazado.');

// Test 4: Rechazo de CBU/CVU con menos de 22 dígitos (21 dígitos)
const invalidCbuShort = validateBankDetails({
  alias: 'musica.pedro',
  cbuCvu: '017000154000001234567', // 21 dígitos
  accountHolder: 'Pedro Morales',
});

if (invalidCbuShort.isValid) {
  console.error('❌ [TEST 4] FALLÓ: Debería rechazar CBU menor a 22 dígitos.');
  process.exit(1);
}
console.log('✅ [TEST 4] PASÓ: CBU/CVU de 21 dígitos rechazado.');

// Test 5: Rechazo de CBU/CVU con más de 22 dígitos (23 dígitos)
const invalidCbuLong = validateBankDetails({
  alias: 'musica.pedro',
  cbuCvu: '01700015400000123456789', // 23 dígitos
  accountHolder: 'Pedro Morales',
});

if (invalidCbuLong.isValid) {
  console.error('❌ [TEST 5] FALLÓ: Debería rechazar CBU mayor a 22 dígitos.');
  process.exit(1);
}
console.log('✅ [TEST 5] PASÓ: CBU/CVU de 23 dígitos rechazado.');

// Test 6: Rechazo de CBU/CVU con caracteres alfabéticos o símbolos
const invalidCbuLetters = validateBankDetails({
  alias: 'musica.pedro',
  cbuCvu: '017000154000001234567A', // Letra 'A'
  accountHolder: 'Pedro Morales',
});

if (invalidCbuLetters.isValid) {
  console.error('❌ [TEST 6] FALLÓ: Debería rechazar CBU con caracteres no numéricos.');
  process.exit(1);
}
console.log('✅ [TEST 6] PASÓ: CBU/CVU con caracteres no numéricos rechazado.');

// Test 7: Rechazo de Titular de cuenta vacío
const invalidHolder = validateBankDetails({
  alias: 'musica.pedro',
  cbuCvu: '0170001540000012345678',
  accountHolder: '   ',
});

if (invalidHolder.isValid) {
  console.error('❌ [TEST 7] FALLÓ: Debería rechazar titular de cuenta vacío.');
  process.exit(1);
}
console.log('✅ [TEST 7] PASÓ: Titular de cuenta vacío rechazado.');

// Test 8: Estructura del modelo de datos bancarios
const mockBankDoc: TeacherBankDetails = {
  teacherId: 'teacher-123',
  alias: 'piano.musica.ar',
  cbuCvu: '0000003100012345678901',
  accountHolder: 'Pedro Morales',
  bankName: 'Mercado Pago',
  createdAt: '2026-11-06T12:00:00Z',
  updatedAt: '2026-11-06T12:30:00Z',
};

if (mockBankDoc.teacherId !== 'teacher-123' || mockBankDoc.cbuCvu.length !== 22) {
  console.error('❌ [TEST 8] FALLÓ: Estructura de modelo no conforme.');
  process.exit(1);
}
console.log('✅ [TEST 8] PASÓ: Modelo de datos TeacherBankDetails verificado.');

console.log('========================================================================');
console.log('🎉 TODAS LAS 8 PRUEBAS DEL SUBBLOQUE 6B.1 PASARON EXITOSAMENTE.');
console.log('========================================================================');
