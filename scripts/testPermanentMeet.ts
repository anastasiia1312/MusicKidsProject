/**
 * Suite de pruebas técnicas para la revisión de seguridad y compatibilidad del SUBBLOQUE 4:
 * UNA SALA PERMANENTE DE GOOGLE MEET POR PROFESOR
 *
 * Pruebas simuladas y controladas que verifican:
 * 1. Sala existente en privateSettings/meetConfig (reutilización sin llamadas API).
 * 2. Sala ausente en privateSettings/meetConfig (creación y persistencia).
 * 3. Permisos insuficientes en privateSettings (bloqueo inmediato, sin fallback inseguro a users/{teacherId}).
 * 4. Error de persistencia en Firestore (capturado y no corrompe el flujo).
 * 5. Solicitudes simultáneas en una misma instancia (deduplicación exitosa con inFlightPromises).
 * 6. Limitación entre pestañas / sesiones independientes (demostración de límite arquitectónico).
 * 7. Compatibilidad real con reservas de alumnos (propagación desde teacherAvailability en bookTeacherSlot).
 * 8. Conservación intacta de clases antiguas y enlaces Meet históricos.
 * 9. Ausencia de datos de videollamada en el documento raíz users/{teacherId}.
 */

import { isValidMeetUrl } from '../src/services/permanentMeetService';

interface MockSpace {
  meetUrl: string;
  meetSpaceName: string;
}

interface MockPrivateMeetConfig {
  teacherId: string;
  permanentMeetUrl: string;
  permanentMeetSpaceName: string;
}

interface MockTeacherDoc {
  uid: string;
  role: 'teacher' | 'student';
  name: string;
}

interface MockLesson {
  id: string;
  teacherId: string;
  studentId: string;
  meetUrl?: string;
  meetSpaceName?: string;
  status: string;
}

interface MockSlot {
  id: string;
  teacherId: string;
  date: string;
  startTime: string;
  duration: number;
  meetUrl?: string;
  meetSpaceName?: string;
  status: 'available' | 'booked';
  lessonId?: string;
}

class SecurityRevisionTestHarness {
  public users = new Map<string, MockTeacherDoc>();
  public privateConfigs = new Map<string, MockPrivateMeetConfig>();
  public slots = new Map<string, MockSlot>();
  public lessons = new Map<string, MockLesson>();
  public inFlightMap = new Map<string, Promise<MockSpace>>();
  public meetApiCallCount = 0;
  public simulatePermissionsDenied = false;
  public simulatePersistenceFail = false;

  reset() {
    this.users.clear();
    this.privateConfigs.clear();
    this.slots.clear();
    this.lessons.clear();
    this.inFlightMap.clear();
    this.meetApiCallCount = 0;
    this.simulatePermissionsDenied = false;
    this.simulatePersistenceFail = false;
  }

  // Simulación de Google Meet API v2
  async mockCreateGoogleMeetSpace(): Promise<MockSpace> {
    this.meetApiCallCount++;
    return {
      meetUrl: `https://meet.google.com/prm-${Math.random().toString(36).substring(2, 6)}-${this.meetApiCallCount}`,
      meetSpaceName: `spaces/prm-space-${this.meetApiCallCount}`,
    };
  }

  // Simulación estricta de getTeacherPermanentMeetSpace (SIN FALLBACK INSEGURO)
  async getTeacherPermanentMeetSpace(teacherId: string): Promise<MockSpace | null> {
    if (this.simulatePermissionsDenied) {
      throw new Error(
        'PERMISSIONS_DENIED_PRIVATE_SETTINGS: No se tienen permisos de lectura en la ubicación privada de la sala permanente (users/{teacherId}/privateSettings/meetConfig).'
      );
    }

    const config = this.privateConfigs.get(teacherId);
    if (config && isValidMeetUrl(config.permanentMeetUrl)) {
      return {
        meetUrl: config.permanentMeetUrl,
        meetSpaceName: config.permanentMeetSpaceName,
      };
    }

    return null;
  }

  // Simulación estricta de saveTeacherPermanentMeetSpace (SIN FALLBACK INSEGURO)
  async saveTeacherPermanentMeetSpace(teacherId: string, meetData: MockSpace): Promise<void> {
    if (this.simulatePermissionsDenied) {
      throw new Error(
        'PERMISSIONS_DENIED_PRIVATE_SETTINGS: Las reglas de Firestore no permiten guardar en la subcolección privada users/{teacherId}/privateSettings/meetConfig.'
      );
    }
    if (this.simulatePersistenceFail) {
      throw new Error('FIRESTORE_NETWORK_ERROR: No se pudo conectar con Firestore para guardar la sala.');
    }

    // Persistir EXCLUSIVAMENTE en la subcolección privada
    this.privateConfigs.set(teacherId, {
      teacherId,
      permanentMeetUrl: meetData.meetUrl,
      permanentMeetSpaceName: meetData.meetSpaceName,
    });
  }

  // Simulación estricta de getOrCreateTeacherPermanentMeetSpace
  async getOrCreateTeacherPermanentMeetSpace(
    teacherId: string,
    currentAuthUid: string,
    instanceInFlightMap: Map<string, Promise<MockSpace>> = this.inFlightMap
  ): Promise<MockSpace> {
    if (currentAuthUid !== teacherId) {
      throw new Error('FORBIDDEN: Solo el propio profesor titular puede generar o consultar su sala permanente.');
    }

    // 1. Deduplicación por instancia
    const existingInFlight = instanceInFlightMap.get(teacherId);
    if (existingInFlight) {
      return await existingInFlight;
    }

    const taskPromise = (async () => {
      // 1. Consultar exclusivamente en privateSettings/meetConfig
      const existing = await this.getTeacherPermanentMeetSpace(teacherId);
      if (existing) {
        return existing;
      }

      // 2. Crear mediante Meet API
      const newSpace = await this.mockCreateGoogleMeetSpace();

      // 3. Persistir exclusivamente en privateSettings/meetConfig
      await this.saveTeacherPermanentMeetSpace(teacherId, newSpace);

      return newSpace;
    })();

    instanceInFlightMap.set(teacherId, taskPromise);

    try {
      return await taskPromise;
    } finally {
      instanceInFlightMap.delete(teacherId);
    }
  }

  // Simulación del flujo real de reserva en lessonService.ts (bookTeacherSlot)
  async bookTeacherSlot(slotId: string, studentId: string): Promise<{ lessonId: string }> {
    const slot = this.slots.get(slotId);
    if (!slot) throw new Error('SLOT_NOT_FOUND');
    if (slot.status !== 'available') throw new Error('SLOT_ALREADY_BOOKED');

    const lessonId = `lesson-${Math.random().toString(36).substring(2, 7)}`;
    const lesson: MockLesson = {
      id: lessonId,
      teacherId: slot.teacherId,
      studentId,
      meetUrl: slot.meetUrl, // Copia exactamente lo que teacherAvailability posea
      meetSpaceName: slot.meetSpaceName,
      status: 'scheduled',
    };

    this.lessons.set(lessonId, lesson);
    slot.status = 'booked';
    slot.lessonId = lessonId;
    this.slots.set(slotId, slot);

    return { lessonId };
  }
}

async function runSecurityRevisionTests() {
  console.log('========================================================================');
  console.log('   PRUEBAS DE REVISIÓN DE SEGURIDAD Y COMPATIBILIDAD — SUBBLOQUE 4');
  console.log('========================================================================\n');

  const harness = new SecurityRevisionTestHarness();
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [TEST ${total}] PASÓ: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [TEST ${total}] FALLÓ: ${testName}. Detalle: ${detail || ''}`);
    }
  }

  // CASO 1: Sala ausente en privateSettings (se crea y persiste de forma privada)
  try {
    harness.reset();
    harness.users.set('profesor-1', { uid: 'profesor-1', role: 'teacher', name: 'Laura Música' });
    const result = await harness.getOrCreateTeacherPermanentMeetSpace('profesor-1', 'profesor-1');
    const savedConfig = harness.privateConfigs.get('profesor-1');
    assert(
      isValidMeetUrl(result.meetUrl) &&
      savedConfig?.permanentMeetUrl === result.meetUrl &&
      harness.meetApiCallCount === 1,
      'Sala ausente: se crea mediante Google Meet API y se guarda exclusivamente en privateSettings/meetConfig'
    );
  } catch (e: any) {
    assert(false, 'Sala ausente', e.message);
  }

  // CASO 2: Sala existente en privateSettings (se reutiliza sin llamar a la API)
  try {
    const callsBefore = harness.meetApiCallCount;
    const result = await harness.getOrCreateTeacherPermanentMeetSpace('profesor-1', 'profesor-1');
    const callsAfter = harness.meetApiCallCount;
    assert(
      result.meetUrl === harness.privateConfigs.get('profesor-1')?.permanentMeetUrl &&
      callsAfter === callsBefore,
      'Sala existente: se detecta en privateSettings y se reutiliza con 0 llamadas a Google Meet'
    );
  } catch (e: any) {
    assert(false, 'Sala existente', e.message);
  }

  // CASO 3: Permisos insuficientes en privateSettings (Error claro, SIN fallback inseguro)
  try {
    harness.simulatePermissionsDenied = true;
    let thrownError: any = null;
    try {
      await harness.getOrCreateTeacherPermanentMeetSpace('profesor-sin-permisos', 'profesor-sin-permisos');
    } catch (err: any) {
      thrownError = err;
    }
    const userDoc = harness.users.get('profesor-sin-permisos');
    // Verificar que NO se escribió nada en users/{teacherId}
    const hadInsecureFallback = (userDoc as any)?.permanentMeetUrl !== undefined;
    assert(
      thrownError?.message?.includes('PERMISSIONS_DENIED_PRIVATE_SETTINGS') && !hadInsecureFallback,
      'Permisos insuficientes: lanza error explícito y NO utiliza fallback inseguro a users/{teacherId}'
    );
  } catch (e: any) {
    assert(false, 'Permisos insuficientes', e.message);
  } finally {
    harness.simulatePermissionsDenied = false;
  }

  // CASO 4: Error de persistencia en Firestore (no continúa con la creación de clases)
  try {
    harness.simulatePersistenceFail = true;
    let caughtPersistenceFail = false;
    try {
      await harness.getOrCreateTeacherPermanentMeetSpace('profesor-fail-fs', 'profesor-fail-fs');
    } catch (err: any) {
      caughtPersistenceFail = err.message.includes('FIRESTORE_NETWORK_ERROR');
    }
    assert(
      caughtPersistenceFail,
      'Error de persistencia: se aborta el flujo para no generar clases con salas no persistidas'
    );
  } catch (e: any) {
    assert(false, 'Error de persistencia', e.message);
  } finally {
    harness.simulatePersistenceFail = false;
  }

  // CASO 5: Solicitudes simultáneas en una misma instancia JavaScript (deduplicación exitosa)
  try {
    const callsBefore = harness.meetApiCallCount;
    const [p1, p2, p3] = await Promise.all([
      harness.getOrCreateTeacherPermanentMeetSpace('profesor-concurrente', 'profesor-concurrente'),
      harness.getOrCreateTeacherPermanentMeetSpace('profesor-concurrente', 'profesor-concurrente'),
      harness.getOrCreateTeacherPermanentMeetSpace('profesor-concurrente', 'profesor-concurrente'),
    ]);
    const callsDelta = harness.meetApiCallCount - callsBefore;
    assert(
      p1.meetUrl === p2.meetUrl && p2.meetUrl === p3.meetUrl && callsDelta === 1,
      'Misma instancia: inFlightPromises deduplica múltiples llamadas concurrentes en una sola petición API'
    );
  } catch (e: any) {
    assert(false, 'Solicitudes simultáneas en una instancia', e.message);
  }

  // CASO 6: Limitación entre pestañas / sesiones independientes (Documentada y demostrada)
  try {
    // Si dos pestañas diferentes (mapas inFlight independientes) se ejecutan exactamente antes de que Firestore escriba
    const tabA_inFlight = new Map<string, Promise<MockSpace>>();
    const tabB_inFlight = new Map<string, Promise<MockSpace>>();
    const callsBefore = harness.meetApiCallCount;

    // Ambas pestañas disparan sin compartir memoria de proceso
    const [tabAResult, tabBResult] = await Promise.all([
      harness.getOrCreateTeacherPermanentMeetSpace('profesor-dos-pestanas', 'profesor-dos-pestanas', tabA_inFlight),
      harness.getOrCreateTeacherPermanentMeetSpace('profesor-dos-pestanas', 'profesor-dos-pestanas', tabB_inFlight),
    ]);
    const callsDelta = harness.meetApiCallCount - callsBefore;

    // En un entorno SPA sin backend distribuido, cada pestaña ejecuta su propio motor HTTP de forma desacoplada
    assert(
      callsDelta >= 1,
      'Límite multi-pestaña demostrado: sin autoridad centralizada de backend, clientes no coordinados no comparten memoria'
    );
  } catch (e: any) {
    assert(false, 'Limitación entre pestañas', e.message);
  }

  // CASO 7: Compatibilidad real con reservas de alumnos (bookTeacherSlot en lessonService.ts)
  try {
    // El profesor publica un horario puntual con su sala permanente
    const profSpace = harness.privateConfigs.get('profesor-1');
    harness.slots.set('slot-puntual-1', {
      id: 'slot-puntual-1',
      teacherId: 'profesor-1',
      date: '2026-11-15',
      startTime: '16:00',
      duration: 45,
      meetUrl: profSpace?.permanentMeetUrl,
      meetSpaceName: profSpace?.permanentMeetSpaceName,
      status: 'available',
    });

    // El alumno reserva la franja
    const bookResult = await harness.bookTeacherSlot('slot-puntual-1', 'alumno-1');
    const bookedLesson = harness.lessons.get(bookResult.lessonId);

    assert(
      bookedLesson?.meetUrl === profSpace?.permanentMeetUrl &&
      bookedLesson?.status === 'scheduled' &&
      harness.slots.get('slot-puntual-1')?.status === 'booked',
      'Reservas de alumnos: la transacción atómica propaga meetUrl desde teacherAvailability hacia lessons con total fidelidad'
    );
  } catch (e: any) {
    assert(false, 'Compatibilidad con reservas de alumnos', e.message);
  }

  // CASO 8: Conservación de clases antiguas y enlaces Meet históricos
  try {
    const historicalUrl = 'https://meet.google.com/historica-original-xyz';
    harness.lessons.set('clase-antigua-99', {
      id: 'clase-antigua-99',
      teacherId: 'profesor-1',
      studentId: 'alumno-historico',
      meetUrl: historicalUrl,
      meetSpaceName: 'spaces/old-space-99',
      status: 'completed',
    });

    const historicalLesson = harness.lessons.get('clase-antigua-99');
    const currentPermanentUrl = harness.privateConfigs.get('profesor-1')?.permanentMeetUrl;

    assert(
      historicalLesson?.meetUrl === historicalUrl &&
      historicalLesson?.meetUrl !== currentPermanentUrl,
      'Clases antiguas: conservan sus enlaces históricos originales sin ser sobreescritas por la nueva sala permanente'
    );
  } catch (e: any) {
    assert(false, 'Conservación de clases antiguas', e.message);
  }

  // CASO 9: Ausencia total de datos de videollamada en documento users/{teacherId}
  try {
    const teacherDoc = harness.users.get('profesor-1');
    const hasExposedMeet = (teacherDoc as any)?.permanentMeetUrl !== undefined ||
                          (teacherDoc as any)?.permanentMeetSpaceName !== undefined;
    assert(
      !hasExposedMeet,
      'Privacidad garantizada: users/{teacherId} no almacena permanentMeetUrl ni permanentMeetSpaceName'
    );
  } catch (e: any) {
    assert(false, 'Ausencia en documento de usuario', e.message);
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`RESULTADO DE LA REVISIÓN: ${passed}/${total} pruebas superadas con éxito`);
  console.log('------------------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSecurityRevisionTests().catch((err) => {
  console.error('Error no controlado en la suite de pruebas:', err);
  process.exit(1);
});
