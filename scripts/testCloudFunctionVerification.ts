/**
 * Test de Verificación Real: SUBBLOQUE 6B.3.2
 * Verificación de la Cloud Function 'healthCheckMusicKids' desplegada en Firebase.
 */

import { auth, functions } from '../src/services/firebase';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

async function runVerification() {
  console.log('========================================================================');
  console.log('   VERIFICACIÓN EN TIEMPO REAL: CLOUD FUNCTION healthCheckMusicKids');
  console.log('   Proyecto: musickids-83026 | Región: us-central1');
  console.log('========================================================================\n');

  let passedTests = 0;

  // 1. Test Sin Autenticación
  console.log('--- TEST 1: Invocación de healthCheckMusicKids SIN autenticación ---');
  try {
    await signOut(auth);
    const callable = httpsCallable(functions, 'healthCheckMusicKids');
    await callable();
    throw new Error('FALLO: La función debió rechazar la solicitud sin autenticación.');
  } catch (err: any) {
    assert(
      err.code === 'functions/unauthenticated',
      `El código de error debe ser functions/unauthenticated, fue: ${err.code}`
    );
    assert(
      err.message.includes('autenticado'),
      `El mensaje de error debe indicar requerimiento de autenticación, fue: ${err.message}`
    );
    console.log('✓ [TEST 1 PASÓ]: Rechazado correctamente con código:', err.code);
    console.log('  Mensaje recibido del servidor:', err.message);
    passedTests++;
  }

  // 2. Test Con Autenticación
  console.log('\n--- TEST 2: Invocación de healthCheckMusicKids CON autenticación real ---');
  const tempEmail = `cf_verify_${Date.now()}@musickids.test`;
  const tempPass = 'SecureTest123!#';
  let tempUser: any = null;

  try {
    const cred = await createUserWithEmailAndPassword(auth, tempEmail, tempPass);
    tempUser = cred.user;
    console.log('✓ Sesión autenticada creada en Firebase Auth. UID:', tempUser.uid);

    const callable = httpsCallable(functions, 'healthCheckMusicKids');
    const response = await callable();
    const data = response.data as any;

    console.log('✓ Respuesta recibida de Google Cloud Run / Cloud Functions v2:');
    console.log(JSON.stringify(data, null, 2));

    assert(data.status === 'ok', `status debe ser 'ok', recibido: ${data.status}`);
    assert(data.authenticated === true, `authenticated debe ser true, recibido: ${data.authenticated}`);
    assert(data.uid === tempUser.uid, `uid debe coincidir con el usuario autenticado: ${data.uid} vs ${tempUser.uid}`);
    assert(
      data.service === 'MusicKids Cloud Functions v2',
      `service debe ser 'MusicKids Cloud Functions v2', recibido: ${data.service}`
    );

    console.log('✓ [TEST 2 PASÓ]: status: "ok", authenticated: true, UID validado.');
    passedTests++;
  } finally {
    if (tempUser) {
      await deleteUser(tempUser);
      console.log('✓ Limpieza: Usuario efímero eliminado de Firebase Auth sin dejar registros huérfanos.');
    }
  }

  console.log('\n========================================================================');
  console.log(`🎉 RESULTADO: ${passedTests}/2 PRUEBAS EN PRODUCCIÓN PASARON EXITOSAMENTE`);
  console.log('========================================================================\n');
}

runVerification().catch((err) => {
  console.error('Error fatal durante la verificación:', err);
  process.exit(1);
});
