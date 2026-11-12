/**
 * Test Suite: Validación y Manejo de Errores de Login en MusicKids
 */

import { getAuthErrorMessage } from '../src/services/authService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ APROBÓ: ${msg}`);
}

console.log('--- INICIANDO PRUEBAS DE MANEJO DE ERRORES DE LOGIN ---');

// 1. Correo correcto + contraseña incorrecta
console.log('\n--- Escenario 1: Contraseña incorrecta (auth/wrong-password o auth/invalid-credential) ---');
const errWrongPassword = { code: 'auth/wrong-password', message: 'Firebase: Error (auth/wrong-password).' };
const msgWrongPass = getAuthErrorMessage(errWrongPassword);
assert(
  msgWrongPass === 'El correo electrónico o la contraseña son incorrectos. Verificá tus datos e intentá nuevamente.',
  'Retorna mensaje exacto para contraseña incorrecta'
);

const errInvalidCred = { code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' };
const msgInvalidCred = getAuthErrorMessage(errInvalidCred);
assert(
  msgInvalidCred === 'El correo electrónico o la contraseña son incorrectos. Verificá tus datos e intentá nuevamente.',
  'Retorna mensaje exacto para credenciales inválidas'
);

// 2. Correo incorrecto o no registrado (auth/user-not-found)
console.log('\n--- Escenario 2: Usuario no encontrado (auth/user-not-found) ---');
const errUserNotFound = { code: 'auth/user-not-found', message: 'Firebase: Error (auth/user-not-found).' };
const msgUserNotFound = getAuthErrorMessage(errUserNotFound);
assert(
  msgUserNotFound === 'El correo electrónico o la contraseña son incorrectos. Verificá tus datos e intentá nuevamente.',
  'No revela si el correo está registrado y retorna el mensaje unificado'
);

// 3. Formato de correo inválido (auth/invalid-email)
console.log('\n--- Escenario 3: Formato de correo inválido (auth/invalid-email) ---');
const errInvalidEmail = { code: 'auth/invalid-email', message: 'Firebase: Error (auth/invalid-email).' };
const msgInvalidEmail = getAuthErrorMessage(errInvalidEmail);
assert(
  msgInvalidEmail === 'Ingresá un correo electrónico válido.',
  'Retorna mensaje amigable para formato de correo inválido'
);

// 4. Error de conexión / red (auth/network-request-failed)
console.log('\n--- Escenario 4: Error de red o conexión ---');
const errNetwork = { code: 'auth/network-request-failed', message: 'Firebase: Error (auth/network-request-failed).' };
const msgNetwork = getAuthErrorMessage(errNetwork);
assert(
  msgNetwork === 'No se pudo conectar con el servidor. Revisá tu conexión a Internet e intentá nuevamente.',
  'Retorna mensaje apropiado de problema de conexión'
);

// 5. Demasiados intentos fallidos (auth/too-many-requests)
console.log('\n--- Escenario 5: Demasiados intentos fallidos (auth/too-many-requests) ---');
const errRateLimit = { code: 'auth/too-many-requests', message: 'Firebase: Error (auth/too-many-requests).' };
const msgRateLimit = getAuthErrorMessage(errRateLimit);
assert(
  msgRateLimit.includes('intentos fallidos') && msgRateLimit.includes('minutos'),
  'Retorna mensaje de espera ante exceso de intentos'
);

// 6. Simulación de validación previa de campos vacíos en Login
console.log('\n--- Escenario 6: Validación de campos vacíos en cliente (sin invocar Firebase) ---');
function validateEmptyInputs(emailInput: string, passwordInput: string): { isValid: boolean; error?: string } {
  const trimmedEmail = emailInput.trim();
  if (!trimmedEmail && !passwordInput) {
    return { isValid: false, error: 'Por favor, ingresá tu correo electrónico y contraseña.' };
  }
  if (!trimmedEmail) {
    return { isValid: false, error: 'Por favor, ingresá tu correo electrónico.' };
  }
  if (!passwordInput) {
    return { isValid: false, error: 'Por favor, ingresá tu contraseña.' };
  }
  return { isValid: true };
}

assert(!validateEmptyInputs('', '').isValid, 'Rechaza ambos campos vacíos');
assert(!validateEmptyInputs('   ', '123456').isValid, 'Rechaza email solo con espacios');
assert(!validateEmptyInputs('usuario@test.com', '').isValid, 'Rechaza contraseña vacía');
assert(validateEmptyInputs('usuario@test.com', '123456').isValid, 'Acepta campos completos');

// 7. Simulación de redirecciones según rol
console.log('\n--- Escenario 7: Redirección según rol ---');
function getTargetRoute(role?: string): string {
  if (role === 'teacher') return '/teacher/dashboard';
  if (role === 'student') return '/student/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/select-role';
}

assert(getTargetRoute('teacher') === '/teacher/dashboard', 'Profesor redirige a /teacher/dashboard');
assert(getTargetRoute('student') === '/student/dashboard', 'Alumno redirige a /student/dashboard');
assert(getTargetRoute('admin') === '/admin/dashboard', 'Administrador redirige a /admin/dashboard');
assert(getTargetRoute(undefined) === '/select-role', 'Sin rol redirige a /select-role');

console.log('\n🎉 TODAS LAS PRUEBAS DE LOGIN Y ERRORES PASARON CON 100% DE ÉXITO.');
