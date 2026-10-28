/**
 * Test suite para validar la lógica formal de las reglas de seguridad de Firestore (firestore.rules)
 * Simula el motor de evaluación de Firestore para los 8 escenarios del Subbloque 4.3.
 */

interface RequestAuth {
  uid: string;
  token?: Record<string, any>;
}

interface FirestoreState {
  users: Record<string, any>;
  teacherAvailability: Record<string, any>;
  lessons: Record<string, any>;
}

interface RuleContext {
  auth: RequestAuth | null;
  state: FirestoreState;
}

class FirestoreRulesSimulator {
  private state: FirestoreState;

  constructor(initialState: FirestoreState) {
    this.state = JSON.parse(JSON.stringify(initialState));
  }

  // Helpers de firestore.rules
  private isSignedIn(auth: RequestAuth | null): boolean {
    return auth !== null;
  }

  private hasUserData(auth: RequestAuth | null): boolean {
    if (!this.isSignedIn(auth)) return false;
    return !!this.state.users[auth!.uid];
  }

  private currentUserData(auth: RequestAuth | null): any {
    if (!this.hasUserData(auth)) return null;
    return this.state.users[auth!.uid];
  }

  private isActiveUser(auth: RequestAuth | null): boolean {
    if (!this.hasUserData(auth)) return false;
    const user = this.currentUserData(auth);
    const status = user.status ?? 'active';
    return status === 'active';
  }

  private isActiveAdmin(auth: RequestAuth | null): boolean {
    if (!this.isActiveUser(auth)) return false;
    const user = this.currentUserData(auth);
    return (user.role ?? '') === 'admin';
  }

  // Helper para diff().affectedKeys()
  private getAffectedKeys(existingData: Record<string, any>, incomingData: Record<string, any>): string[] {
    const keys = new Set([...Object.keys(existingData), ...Object.keys(incomingData)]);
    const affected: string[] = [];
    for (const key of keys) {
      if (JSON.stringify(existingData[key]) !== JSON.stringify(incomingData[key])) {
        affected.push(key);
      }
    }
    return affected;
  }

  // Reglas de users/{userId}
  public canReadUser(auth: RequestAuth | null, targetUserId: string): boolean {
    if (!this.isSignedIn(auth)) return false;
    return auth!.uid === targetUserId || this.isActiveUser(auth);
  }

  public canCreateUser(auth: RequestAuth | null, targetUserId: string, incomingData: any): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (auth!.uid !== targetUserId) return false;
    if (incomingData.uid !== targetUserId) return false;
    if (!['student', 'teacher'].includes(incomingData.role)) return false;
    const status = incomingData.status ?? 'active';
    if (status !== 'active') return false;
    return true;
  }

  public canUpdateUser(auth: RequestAuth | null, targetUserId: string, incomingData: any): boolean {
    if (!this.isSignedIn(auth)) return false;
    const existingData = this.state.users[targetUserId];
    if (!existingData) return false;

    // Vía 1: Actualización propia por usuario activo
    const via1 =
      this.isActiveUser(auth) &&
      auth!.uid === targetUserId &&
      incomingData.uid === targetUserId &&
      (incomingData.role ?? '') === (existingData.role ?? '') &&
      (incomingData.status ?? 'active') === (existingData.status ?? 'active');

    if (via1) return true;

    // Vía 2: Activación/Desactivación por un administrador activo
    const affectedKeys = this.getAffectedKeys(existingData, incomingData);
    const hasOnlyStatus = affectedKeys.every((k) => k === 'status');
    const validStatus = ['active', 'disabled'].includes(incomingData.status);

    const via2 =
      this.isActiveAdmin(auth) &&
      auth!.uid !== targetUserId &&
      hasOnlyStatus &&
      validStatus;

    return via2;
  }

  public canDeleteUser(): boolean {
    return false; // allow delete: if false;
  }

  // Reglas de teacherAvailability/{availabilityId}
  public canReadAvailability(auth: RequestAuth | null): boolean {
    return this.isActiveUser(auth);
  }

  public canCreateAvailability(auth: RequestAuth | null, incomingData: any): boolean {
    if (!this.isActiveUser(auth)) return false;
    if (incomingData.teacherId !== auth!.uid) return false;
    const current = this.currentUserData(auth);
    if ((current.role ?? '') !== 'teacher') return false;
    return ['available', 'booked'].includes(incomingData.status);
  }

  public canUpdateAvailability(auth: RequestAuth | null, existingData: any, incomingData: any): boolean {
    if (!this.isActiveUser(auth)) return false;
    if (existingData.teacherId !== auth!.uid) return false;
    if (incomingData.teacherId !== auth!.uid) return false;
    return true;
  }

  public canDeleteAvailability(auth: RequestAuth | null, existingData: any): boolean {
    return this.isActiveUser(auth) && existingData.teacherId === auth!.uid;
  }

  // Reglas de lessons/{lessonId}
  public canReadLesson(auth: RequestAuth | null, lessonData: any): boolean {
    if (!this.isActiveUser(auth)) return false;
    return lessonData.teacherId === auth!.uid || lessonData.studentId === auth!.uid;
  }

  public canCreateLesson(auth: RequestAuth | null, incomingData: any): boolean {
    if (!this.isActiveUser(auth)) return false;
    if (incomingData.teacherId !== auth!.uid) return false;
    const current = this.currentUserData(auth);
    if ((current.role ?? '') !== 'teacher') return false;
    return ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(incomingData.status);
  }
}

// ======================= EJECUCIÓN DE LAS PRUEBAS =======================
const mockState: FirestoreState = {
  users: {
    'admin-1': { uid: 'admin-1', name: 'Admin Principal', role: 'admin', status: 'active' },
    'teacher-1': { uid: 'teacher-1', name: 'Profesor Activo', role: 'teacher', status: 'active' },
    'student-1': { uid: 'student-1', name: 'Alumno Activo', role: 'student', status: 'active' },
    'disabled-student': { uid: 'disabled-student', name: 'Alumno Desactivado', role: 'student', status: 'disabled' },
    'legacy-teacher': { uid: 'legacy-teacher', name: 'Profesor Sin Status', role: 'teacher' }, // No status -> activo por compatibilidad
  },
  teacherAvailability: {
    'avail-1': { id: 'avail-1', teacherId: 'teacher-1', date: '2026-10-20', startTime: '10:00', duration: 45, status: 'available' },
  },
  lessons: {
    'lesson-1': { id: 'lesson-1', teacherId: 'teacher-1', studentId: 'student-1', status: 'scheduled' },
  },
};

const simulator = new FirestoreRulesSimulator(mockState);
const results: { name: string; passed: boolean; details: string }[] = [];

function assertTest(name: string, condition: boolean, details: string) {
  results.push({ name, passed: condition, details });
}

// 1. Administrador activo desactiva a un alumno
const canAdminDeactivateStudent = simulator.canUpdateUser(
  { uid: 'admin-1' },
  'student-1',
  { ...mockState.users['student-1'], status: 'disabled' }
);
assertTest('1. Administrador activo desactiva a un alumno', canAdminDeactivateStudent === true, 'Admin puede actualizar status a disabled');

// 2. Administrador activo reactiva a un alumno
const canAdminReactivateStudent = simulator.canUpdateUser(
  { uid: 'admin-1' },
  'disabled-student',
  { ...mockState.users['disabled-student'], status: 'active' }
);
assertTest('2. Administrador activo reactiva a un alumno', canAdminReactivateStudent === true, 'Admin puede actualizar status a active');

// 3. Administrador intenta desactivarse a sí mismo
const canAdminDeactivateSelf = simulator.canUpdateUser(
  { uid: 'admin-1' },
  'admin-1',
  { ...mockState.users['admin-1'], status: 'disabled' }
);
assertTest('3. Administrador intenta desactivarse a sí mismo', canAdminDeactivateSelf === false, 'Auto-desactivación denegada estrictamente');

// 4. Profesor intenta modificar su propio status
const canTeacherChangeOwnStatus = simulator.canUpdateUser(
  { uid: 'teacher-1' },
  'teacher-1',
  { ...mockState.users['teacher-1'], status: 'disabled' }
);
assertTest('4. Profesor intenta modificar su propio status', canTeacherChangeOwnStatus === false, 'Modificación propia de status denegada');

// 5. Alumno intenta asignarse el rol admin
const canStudentEscalateToAdminOnUpdate = simulator.canUpdateUser(
  { uid: 'student-1' },
  'student-1',
  { ...mockState.users['student-1'], role: 'admin' }
);
const canStudentEscalateToAdminOnCreate = simulator.canCreateUser(
  { uid: 'attacker-uid' },
  'attacker-uid',
  { uid: 'attacker-uid', name: 'Atacante', email: 'a@a.com', role: 'admin', status: 'active' }
);
assertTest('5. Alumno intenta asignarse el rol admin', canStudentEscalateToAdminOnUpdate === false && canStudentEscalateToAdminOnCreate === false, 'Escalada de rol prohibida en create y update');

// 6. Usuario desactivado intenta consultar clases
const canDisabledUserReadLesson = simulator.canReadLesson(
  { uid: 'disabled-student' },
  mockState.lessons['lesson-1']
);
assertTest('6. Usuario desactivado intenta consultar clases', canDisabledUserReadLesson === false, 'isActiveUser() bloquea lectura de clases para desactivados');

// 7. Usuario nuevo crea su perfil después de autenticarse con Google
const canNewUserCreateProfile = simulator.canCreateUser(
  { uid: 'new-google-user' },
  'new-google-user',
  { uid: 'new-google-user', name: 'Nuevo Alumno', email: 'nuevo@gmail.com', role: 'student', status: 'active' }
);
assertTest('7. Usuario nuevo crea su perfil después de autenticarse con Google', canNewUserCreateProfile === true, 'Registro seguro de nuevo alumno permitido con role válido');

// 8. Profesor activo consulta y modifica su disponibilidad
const canTeacherReadAvailability = simulator.canReadAvailability({ uid: 'teacher-1' });
const canTeacherUpdateAvailability = simulator.canUpdateAvailability(
  { uid: 'teacher-1' },
  mockState.teacherAvailability['avail-1'],
  { ...mockState.teacherAvailability['avail-1'], startTime: '11:00' }
);
assertTest('8. Profesor activo consulta y modifica su disponibilidad', canTeacherReadAvailability === true && canTeacherUpdateAvailability === true, 'Profesor activo puede consultar y actualizar su franja horaria');

// Extra: Usuario con legacy sin status se considera activo
const canLegacyTeacherRead = simulator.canReadAvailability({ uid: 'legacy-teacher' });
assertTest('Extra: Usuario existente sin status se considera activo', canLegacyTeacherRead === true, 'Compatibilidad hacia atrás con status default active');

// Imprimir reporte de resultados
console.log('\n================ RESULTADOS DE VALIDACIÓN DE REGLAS ================');
let allPassed = true;
for (const r of results) {
  const symbol = r.passed ? '✓ PASÓ' : '✗ FALLÓ';
  console.log(`${symbol} | ${r.name} -> ${r.details}`);
  if (!r.passed) allPassed = false;
}
console.log('====================================================================');
console.log(`Estado global: ${allPassed ? 'TODAS LAS PRUEBAS SUPERADAS EXITOSAMENTE' : 'HAY PRUEBAS FALLIDAS'}\n`);

if (!allPassed) {
  process.exit(1);
}
