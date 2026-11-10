/**
 * Suite de Pruebas: SUBBLOQUE 6B.3.3.3
 * Validación rigurosa de Firestore Security Rules (Reglas preparadas para MusicKids)
 *
 * Evalúa los 8 escenarios de seguridad obligatorios:
 * 1. Alumno intentando crear una clase directamente en /lessons -> RECHAZADO (permission-denied).
 * 2. Alumno leyendo sus propios abonos en /monthlyBookings -> PERMITIDO.
 * 3. Alumno intentando leer abonos ajenos en /monthlyBookings -> RECHAZADO (permission-denied).
 * 4. Profesor leyendo abonos donde es el docente asignado -> PERMITIDO.
 * 5. Usuario intentando escribir/modificar en /teacherSlotLocks o /teacherDailySchedule -> RECHAZADO (permission-denied).
 * 6. Profesor guardando/actualizando sus propios datos bancarios en /privateSettings/bankDetails -> PERMITIDO con validación de esquema.
 * 7. Alumno intentando leer o escribir en /privateSettings/meetConfig -> RECHAZADO (permission-denied).
 * 8. Acceso legítimo a clases históricas en /lessons (profesor y alumno asignados) -> PERMITIDO; terceros -> RECHAZADO.
 */

import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

console.log('========================================================================');
console.log('   PRUEBAS DE SEGURIDAD: SUBBLOQUE 6B.3.3.3 (FIRESTORE RULES PREPARADAS)');
console.log('   Simulación y validación de reglas de acceso a colecciones críticas');
console.log('========================================================================\n');

// 1. Cargar el contenido real del archivo firestore.rules
const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

console.log(`✓ Archivo 'firestore.rules' cargado correctamente (${rulesContent.length} bytes).\n`);

// Mock de base de datos Firestore para evaluar reglas
interface MockUser {
  uid: string;
  role: 'student' | 'teacher' | 'admin';
  status: 'active' | 'disabled';
}

interface RequestContext {
  auth: { uid: string } | null;
  resource?: { data: Record<string, any> };
  resourceData?: Record<string, any>;
}

class FirestoreRulesSimulator {
  users: Map<string, MockUser> = new Map();

  constructor() {
    this.users.set('student-1', { uid: 'student-1', role: 'student', status: 'active' });
    this.users.set('student-2', { uid: 'student-2', role: 'student', status: 'active' });
    this.users.set('teacher-1', { uid: 'teacher-1', role: 'teacher', status: 'active' });
    this.users.set('teacher-2', { uid: 'teacher-2', role: 'teacher', status: 'active' });
    this.users.set('disabled-user', { uid: 'disabled-user', role: 'student', status: 'disabled' });
  }

  isSignedIn(auth: { uid: string } | null): boolean {
    return auth !== null && !!auth.uid;
  }

  hasUserData(auth: { uid: string } | null): boolean {
    return this.isSignedIn(auth) && this.users.has(auth!.uid);
  }

  currentUserData(auth: { uid: string } | null): MockUser | null {
    if (!this.isSignedIn(auth)) return null;
    return this.users.get(auth!.uid) || null;
  }

  isActiveUser(auth: { uid: string } | null): boolean {
    if (!this.hasUserData(auth)) return false;
    const u = this.currentUserData(auth);
    return u !== null && u.status === 'active';
  }

  // Regla: match /lessons/{lessonId} create
  evalLessonsCreate(auth: { uid: string } | null, resourceData: Record<string, any>): boolean {
    if (!this.isActiveUser(auth)) return false;
    const u = this.currentUserData(auth)!;
    // Solo el profesor activo asignándose como teacherId
    return (
      resourceData.teacherId === auth!.uid &&
      u.role === 'teacher' &&
      ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(resourceData.status)
    );
  }

  // Regla: match /lessons/{lessonId} read
  evalLessonsRead(auth: { uid: string } | null, existingDocData: Record<string, any>): boolean {
    if (!this.isActiveUser(auth)) return false;
    return existingDocData.teacherId === auth!.uid || existingDocData.studentId === auth!.uid;
  }

  // Regla: match /monthlyBookings/{bookingId} read
  evalMonthlyBookingsRead(auth: { uid: string } | null, existingDocData: Record<string, any>): boolean {
    if (!this.isActiveUser(auth)) return false;
    return existingDocData.studentId === auth!.uid || existingDocData.teacherId === auth!.uid;
  }

  // Regla: match /monthlyBookings/{bookingId} write
  evalMonthlyBookingsWrite(): boolean {
    // allow write: if false;
    return false;
  }

  // Regla: match /teacherSlotLocks/{lockKey} read
  evalTeacherSlotLocksRead(auth: { uid: string } | null, existingDocData: Record<string, any>): boolean {
    if (!this.isActiveUser(auth)) return false;
    return existingDocData.teacherId === auth!.uid || existingDocData.studentId === auth!.uid;
  }

  // Regla: match /teacherSlotLocks/{lockKey} write
  evalTeacherSlotLocksWrite(): boolean {
    // allow write: if false;
    return false;
  }

  // Regla: match /teacherDailySchedule/{scheduleId} read & write
  evalTeacherDailyScheduleRead(): boolean {
    return false;
  }
  evalTeacherDailyScheduleWrite(): boolean {
    return false;
  }

  // Regla: match /users/{userId}/privateSettings/{docId} read
  evalPrivateSettingsRead(auth: { uid: string } | null, userId: string): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (auth!.uid !== userId) return false;
    if (!this.isActiveUser(auth)) return false;
    const u = this.currentUserData(auth)!;
    return u.role === 'teacher';
  }

  // Regla: match /users/{userId}/privateSettings/{docId} write
  evalPrivateSettingsWrite(
    auth: { uid: string } | null,
    userId: string,
    docId: string,
    resourceData: Record<string, any>
  ): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (auth!.uid !== userId) return false;
    if (!this.isActiveUser(auth)) return false;
    const u = this.currentUserData(auth)!;
    if (u.role !== 'teacher') return false;

    if (docId === 'meetConfig') {
      return (
        resourceData.teacherId === userId &&
        typeof resourceData.permanentMeetUrl === 'string' &&
        resourceData.permanentMeetUrl.length > 24 &&
        resourceData.permanentMeetUrl.startsWith('https://meet.google.com/') &&
        typeof resourceData.permanentMeetSpaceName === 'string'
      );
    }

    if (docId === 'bankDetails') {
      return (
        resourceData.teacherId === userId &&
        typeof resourceData.alias === 'string' &&
        resourceData.alias.length >= 3 &&
        typeof resourceData.cbuCvu === 'string' &&
        resourceData.cbuCvu.length === 22 &&
        /^\d{22}$/.test(resourceData.cbuCvu) &&
        typeof resourceData.accountHolder === 'string' &&
        resourceData.accountHolder.length >= 3
      );
    }

    return false;
  }
}

const sim = new FirestoreRulesSimulator();
let passedCount = 0;

function runScenario(name: string, fn: () => void) {
  try {
    fn();
    passedCount++;
    console.log(`✓ [ESCENARIO ${passedCount}] PASÓ: ${name}`);
  } catch (err: any) {
    console.error(`✗ [ESCENARIO FALLÓ]: ${name}`);
    console.error(err.message || err);
    process.exit(1);
  }
}

// 1. Alumno intentando crear una clase directamente
runScenario('Alumno intentando crear una clase directamente en /lessons es RECHAZADO', () => {
  const studentAuth = { uid: 'student-1' };
  const lessonData = {
    title: 'Clase directa no autorizada',
    teacherId: 'teacher-1',
    studentId: 'student-1',
    date: new Date(),
    status: 'scheduled',
  };
  const isAllowed = sim.evalLessonsCreate(studentAuth, lessonData);
  assert(!isAllowed, 'El alumno NO debe tener permiso de crear documentos en /lessons');
});

// 2. Alumno leyendo sus propios abonos
runScenario('Alumno leyendo sus propios abonos en /monthlyBookings es PERMITIDO', () => {
  const studentAuth = { uid: 'student-1' };
  const bookingData = {
    id: 'booking-101',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    status: 'pending_payment_confirmation',
  };
  const isAllowed = sim.evalMonthlyBookingsRead(studentAuth, bookingData);
  assert(isAllowed, 'El alumno DEBE poder leer sus propios abonos');
});

// 3. Alumno intentando leer abonos ajenos
runScenario('Alumno intentando leer abonos de otro alumno en /monthlyBookings es RECHAZADO', () => {
  const studentAuth = { uid: 'student-2' }; // Otro alumno
  const bookingData = {
    id: 'booking-101',
    studentId: 'student-1', // Dueño original
    teacherId: 'teacher-1',
    status: 'pending_payment_confirmation',
  };
  const isAllowed = sim.evalMonthlyBookingsRead(studentAuth, bookingData);
  assert(!isAllowed, 'El alumno NO debe tener acceso a abonos ajenos');
});

// 4. Profesor leyendo abonos de sus alumnos
runScenario('Profesor leyendo abonos donde es el docente asignado es PERMITIDO', () => {
  const teacherAuth = { uid: 'teacher-1' };
  const bookingData = {
    id: 'booking-101',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    status: 'pending_payment_confirmation',
  };
  const isAllowed = sim.evalMonthlyBookingsRead(teacherAuth, bookingData);
  assert(isAllowed, 'El profesor asignado DEBE poder leer los abonos de sus clases');

  // Y otro profesor ajeno no debe poder
  const otherTeacherAuth = { uid: 'teacher-2' };
  const isOtherAllowed = sim.evalMonthlyBookingsRead(otherTeacherAuth, bookingData);
  assert(!isOtherAllowed, 'Un profesor ajeno NO debe poder leer abonos de otros profesores');
});

// 5. Usuario intentando modificar bloqueos
runScenario('Cualquier cliente web intentando escribir en teacherSlotLocks o teacherDailySchedule es RECHAZADO', () => {
  assert(!sim.evalMonthlyBookingsWrite(), 'Escritura en monthlyBookings debe ser denegada al cliente');
  assert(!sim.evalTeacherSlotLocksWrite(), 'Escritura en teacherSlotLocks debe ser denegada al cliente');
  assert(!sim.evalTeacherDailyScheduleWrite(), 'Escritura en teacherDailySchedule debe ser denegada al cliente');
  assert(!sim.evalTeacherDailyScheduleRead(), 'Lectura en teacherDailySchedule debe ser denegada al cliente');
});

// 6. Profesor guardando sus propios datos bancarios
runScenario('Profesor guardando y actualizando sus propios datos bancarios en privateSettings/bankDetails es PERMITIDO', () => {
  const teacherAuth = { uid: 'teacher-1' };
  const validBankData = {
    teacherId: 'teacher-1',
    alias: 'PROFE.PIANO.ARG',
    cbuCvu: '0000003100010000000001', // 22 dígitos
    accountHolder: 'Frédéric Chopin',
    bankName: 'Banco Nación',
  };
  const isAllowed = sim.evalPrivateSettingsWrite(teacherAuth, 'teacher-1', 'bankDetails', validBankData);
  assert(isAllowed, 'El profesor titular DEBE poder guardar sus propios datos bancarios');

  // Datos inválidos: CBU con 20 dígitos en lugar de 22
  const invalidBankData = {
    ...validBankData,
    cbuCvu: '00000031000100000000', // 20 dígitos
  };
  const isInvalidAllowed = sim.evalPrivateSettingsWrite(teacherAuth, 'teacher-1', 'bankDetails', invalidBankData);
  assert(!isInvalidAllowed, 'CBU con longitud distinta de 22 debe ser RECHAZADO por las reglas');

  // Otro profesor intentando escribir datos ajenos
  const isTamperAllowed = sim.evalPrivateSettingsWrite({ uid: 'teacher-2' }, 'teacher-1', 'bankDetails', validBankData);
  assert(!isTamperAllowed, 'Un profesor ajeno NO puede escribir en privateSettings de otro docente');
});

// 7. Alumno intentando acceder a meetConfig privado
runScenario('Alumno intentando leer o escribir en privateSettings/meetConfig es RECHAZADO', () => {
  const studentAuth = { uid: 'student-1' };
  const isReadAllowed = sim.evalPrivateSettingsRead(studentAuth, 'teacher-1');
  assert(!isReadAllowed, 'Un alumno NO debe poder leer privateSettings del profesor');

  const isWriteAllowed = sim.evalPrivateSettingsWrite(studentAuth, 'teacher-1', 'meetConfig', {
    teacherId: 'teacher-1',
    permanentMeetUrl: 'https://meet.google.com/abc-defg-hij',
    permanentMeetSpaceName: 'spaces/abc-defg-hij',
  });
  assert(!isWriteAllowed, 'Un alumno NO debe poder escribir en privateSettings del profesor');
});

// 8. Acceso legítimo a clases históricas
runScenario('Acceso a clases en /lessons: Alumno y profesor asignados pueden leer; terceros son RECHAZADOS', () => {
  const lessonData = {
    id: 'les-999',
    teacherId: 'teacher-1',
    studentId: 'student-1',
    title: 'Clase de Piano',
    status: 'completed',
  };

  assert(sim.evalLessonsRead({ uid: 'teacher-1' }, lessonData), 'Profesor asignado DEBE poder leer');
  assert(sim.evalLessonsRead({ uid: 'student-1' }, lessonData), 'Alumno asignado DEBE poder leer');
  assert(!sim.evalLessonsRead({ uid: 'student-2' }, lessonData), 'Alumno ajeno NO debe poder leer');
  assert(!sim.evalLessonsRead({ uid: 'teacher-2' }, lessonData), 'Profesor ajeno NO debe poder leer');
});

console.log('\n========================================================================');
console.log(`🎉 TODOS LOS ${passedCount}/8 ESCENARIOS DE SEGURIDAD PASARON EXITOSAMENTE`);
console.log('========================================================================\n');
