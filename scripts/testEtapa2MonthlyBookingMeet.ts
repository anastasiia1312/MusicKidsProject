/**
 * Suite de pruebas Etapa 2 Google Meet (MusicKids)
 *
 * Tipo de prueba:
 * - Ejecuta la lógica real de `functions/src/monthlyBookingService.ts`
 *   (`confirmMonthlyBookingPaymentTransaction` y `provisionMonthlyBookingMeetService`)
 *   y los validadores reales de `src/utils/meetValidation.ts`.
 * - Utiliza un doble en memoria transaccional de Firestore (`InMemoryAdminFirestore`)
 *   y mocks inyectables para la API externa de Google Meet (`createMeetSpaceFn`).
 * - NO realiza llamadas reales de red a Google Meet REST API v2 ni escribe en Firebase de producción.
 */

import assert from 'assert';
import {
  confirmMonthlyBookingPaymentTransaction,
  provisionMonthlyBookingMeetService,
  isValidMeetUrl as backendIsValidMeetUrl,
  MeetApiCallError,
} from '../functions/src/monthlyBookingService';
import {
  isValidMeetUrl,
  isLessonMeetAuthorized,
  canJoinLessonMeet,
} from '../src/utils/meetValidation';

class InMemoryDocSnap {
  constructor(
    public readonly id: string,
    private readonly payload: any | undefined
  ) {}
  get exists(): boolean {
    return this.payload !== undefined;
  }
  data(): any {
    return this.payload ? structuredClone(this.payload) : undefined;
  }
}

class InMemoryAdminFirestore {
  private store = new Map<string, any>();
  private txChain: Promise<any> = Promise.resolve();
  public failNextTransactionWriteMatching: ((path: string) => boolean) | null = null;

  seed(path: string, data: any) {
    this.store.set(path, structuredClone(data));
  }

  readRaw(path: string): any | undefined {
    const val = this.store.get(path);
    return val !== undefined ? structuredClone(val) : undefined;
  }

  doc(path: string) {
    const self = this;
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    return {
      path,
      id,
      async get() {
        return new InMemoryDocSnap(id, self.readRaw(path));
      },
      async set(val: any, opts?: { merge?: boolean }) {
        const current = self.store.get(path);
        const resolved = self.resolveSentinels(val);
        if (opts?.merge && current) {
          self.store.set(path, { ...current, ...resolved });
        } else {
          self.store.set(path, { ...resolved });
        }
      },
      async delete() {
        self.store.delete(path);
      },
    };
  }

  collection(colName: string) {
    const self = this;
    return {
      where(field: string, op: string, value: any) {
        return {
          async get() {
            const matchedDocs: any[] = [];
            for (const [k, v] of self.store.entries()) {
              if (!k.startsWith(`${colName}/`)) continue;
              const remainder = k.slice(colName.length + 1);
              if (remainder.includes('/')) continue; // solo docs directos de la colección
              if (op === '==' && v?.[field] === value) {
                matchedDocs.push({
                  id: remainder,
                  ref: self.doc(k),
                  data: () => structuredClone(v),
                });
              }
            }
            return {
              empty: matchedDocs.length === 0,
              size: matchedDocs.length,
              docs: matchedDocs,
            };
          },
        };
      },
    };
  }

  private resolveSentinels(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.resolveSentinels(item));
    if (obj.constructor && obj.constructor.name === 'ServerTimestampTransform') {
      return new Date().toISOString();
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && v.constructor?.name === 'ServerTimestampTransform') {
        out[k] = new Date().toISOString();
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    // Serializa transacciones al estilo de Firestore para garantizar atomicidad real en memoria
    const run = this.txChain.then(async () => {
      const stagedWrites: Array<() => void> = [];
      let hasStartedWrites = false;

      const tx = {
        get: async (docRef: any) => {
          if (hasStartedWrites) {
            throw new Error('Firestore violation: read after write inside transaction');
          }
          return new InMemoryDocSnap(docRef.id, this.readRaw(docRef.path));
        },
        set: (docRef: any, val: any, opts?: { merge?: boolean }) => {
          hasStartedWrites = true;
          if (this.failNextTransactionWriteMatching && this.failNextTransactionWriteMatching(docRef.path)) {
            this.failNextTransactionWriteMatching = null;
            throw new Error('Simulated transient Firestore failure during transaction write');
          }
          stagedWrites.push(() => {
            const current = this.store.get(docRef.path);
            const resolved = this.resolveSentinels(val);
            if (opts?.merge && current) {
              this.store.set(docRef.path, { ...current, ...resolved });
            } else {
              this.store.set(docRef.path, { ...resolved });
            }
          });
        },
        delete: (docRef: any) => {
          hasStartedWrites = true;
          stagedWrites.push(() => {
            this.store.delete(docRef.path);
          });
        },
      };

      const res = await fn(tx);
      for (const apply of stagedWrites) apply();
      return res;
    });

    this.txChain = run.catch(() => {});
    return run;
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('   ETAPA 2 GOOGLE MEET: PRUEBAS UNITARIAS Y DE CONCURRENCIA (MOCK DB)   ');
  console.log('========================================================================\n');

  // 1. Validación estricta de URLs y permisos de botones
  console.log('--- TEST 1: Validación estricta de URL Meet y autorización en botones ---');
  assert.strictEqual(isValidMeetUrl('https://meet.google.com/abc-defg-hij'), true);
  assert.strictEqual(backendIsValidMeetUrl('https://meet.google.com/abc-defg-hij'), true);
  assert.strictEqual(isValidMeetUrl('https://meet.google.com/a'), false);
  assert.strictEqual(isValidMeetUrl('http://meet.google.com/abc-defg-hij'), false);
  assert.strictEqual(isValidMeetUrl('https://evil.com/https://meet.google.com/abc-defg-hij'), false);
  assert.strictEqual(isValidMeetUrl(''), false);

  assert.strictEqual(
    canJoinLessonMeet({
      monthlyBookingId: 'mb1',
      paymentStatus: 'pending_confirmation',
      status: 'scheduled',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    } as any),
    false,
    'Nunca habilitar Meet si el abono sigue pendiente de pago'
  );
  assert.strictEqual(
    canJoinLessonMeet({
      monthlyBookingId: 'mb1',
      paymentStatus: 'confirmed',
      status: 'cancelled',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    } as any),
    false,
    'Nunca habilitar Meet si la clase fue cancelada'
  );
  assert.strictEqual(
    canJoinLessonMeet({
      monthlyBookingId: 'mb1',
      paymentStatus: 'confirmed',
      status: 'expired',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    } as any),
    false,
    'Nunca habilitar Meet si la clase expiró'
  );
  assert.strictEqual(
    canJoinLessonMeet({
      monthlyBookingId: 'mb1',
      paymentStatus: 'confirmed',
      status: 'scheduled',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    } as any),
    true
  );
  assert.strictEqual(
    isLessonMeetAuthorized({
      bookingType: 'manual',
      status: 'scheduled',
    } as any),
    true,
    'Las clases manuales heredadas sin paymentStatus siguen autorizadas'
  );
  console.log('✓ [TEST 1] PASÓ\n');

  // 2. Confirmación de pago desacoplada de Meet y sin fallbacks permanentes
  console.log('--- TEST 2: Confirmación de pago independiente y sin fallback permanente ---');
  const db = new InMemoryAdminFirestore();
  const futureExpires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  // Sembrar sala permanente heredada en privateSettings y users/{teacherId} para verificar que NO se copie
  db.seed('users/teacher_1', {
    uid: 'teacher_1',
    role: 'teacher',
    permanentMeetUrl: 'https://meet.google.com/leg-acy-room',
    permanentMeetSpaceName: 'spaces/legacy-root',
  });
  db.seed('users/teacher_1/privateSettings/meetConfig', {
    permanentMeetUrl: 'https://meet.google.com/leg-acy-priv',
    permanentMeetSpaceName: 'spaces/legacy-private',
  });

  db.seed('monthlyBookings/booking_A', {
    id: 'booking_A',
    teacherId: 'teacher_1',
    studentId: 'student_1',
    month: '2099-05',
    weeklyFrequency: 1,
    totalPrice: 40000,
    price: 40000,
    totalLessons: 2,
    lessonIds: ['lesson_A1', 'lesson_A2'],
    occurrences: [
      { date: '2099-05-04', startTime: '15:00', endTime: '15:45', duration: 45 },
      { date: '2099-05-11', startTime: '15:00', endTime: '15:45', duration: 45 },
    ],
    status: 'pending_payment_confirmation',
    expiresAt: futureExpires,
    meetUrl: null,
  });

  db.seed('lessons/lesson_A1', {
    id: 'lesson_A1',
    teacherId: 'teacher_1',
    studentId: 'student_1',
    monthlyBookingId: 'booking_A',
    status: 'scheduled',
    paymentStatus: 'pending_confirmation',
    meetUrl: null,
    meetSpaceName: null,
  });
  db.seed('lessons/lesson_A2', {
    id: 'lesson_A2',
    teacherId: 'teacher_1',
    studentId: 'student_1',
    monthlyBookingId: 'booking_A',
    status: 'scheduled',
    paymentStatus: 'pending_confirmation',
    meetUrl: null,
    meetSpaceName: null,
  });
  db.seed('teacherDailySchedule/teacher_1_2099-05-04', {
    teacherId: 'teacher_1',
    date: '2099-05-04',
    intervals: [
      {
        startTime: '15:00',
        endTime: '15:45',
        startMinutes: 900,
        endMinutes: 945,
        bookingId: 'booking_A',
        studentId: 'student_1',
        status: 'pending_payment_confirmation',
        expiresAt: futureExpires,
      },
    ],
  });
  db.seed('teacherSlotLocks/teacher_1_2099-05-04_1500', {
    bookingId: 'booking_A',
    expiresAt: futureExpires,
  });

  const confirmRes = await confirmMonthlyBookingPaymentTransaction(db as any, 'teacher_1', {
    bookingId: 'booking_A',
  });
  assert.strictEqual(confirmRes.status, 'confirmed');
  const confirmedBookingA = db.readRaw('monthlyBookings/booking_A');
  assert.strictEqual(confirmedBookingA.status, 'confirmed');
  assert.strictEqual(confirmedBookingA.meetUrl, null, 'Confirmación NO debe copiar sala permanente heredada');
  assert.strictEqual(db.readRaw('lessons/lesson_A1').paymentStatus, 'confirmed');
  assert.strictEqual(db.readRaw('lessons/lesson_A1').meetUrl, null, 'Lección NO debe recibir sala permanente heredada');
  assert.strictEqual(db.readRaw('teacherSlotLocks/teacher_1_2099-05-04_1500').expiresAt, null);
  console.log('✓ [TEST 2] PASÓ\n');

  // 3. Guards de autenticación, pertenencia y estado
  console.log('--- TEST 3: Seguridad, pertenencia del profesor y validaciones de estado ---');
  let apiCalls = 0;
  const mockCreateMeet = async () => {
    apiCalls++;
    return {
      meetUrl: `https://meet.google.com/room-uniq-${apiCalls}`,
      meetSpaceName: `spaces/room-uniq-${apiCalls}`,
    };
  };

  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        '',
        { bookingId: 'booking_A', meetAccessToken: 'tok' },
        { createMeetSpaceFn: mockCreateMeet }
      ),
    (err: any) => err?.code === 'unauthenticated'
  );

  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        'other_teacher',
        { bookingId: 'booking_A', meetAccessToken: 'tok' },
        { createMeetSpaceFn: mockCreateMeet }
      ),
    (err: any) => err?.code === 'permission-denied'
  );

  db.seed('monthlyBookings/booking_pending', {
    id: 'booking_pending',
    teacherId: 'teacher_1',
    studentId: 'student_2',
    status: 'pending_payment_confirmation',
  });
  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        'teacher_1',
        { bookingId: 'booking_pending', meetAccessToken: 'tok' },
        { createMeetSpaceFn: mockCreateMeet }
      ),
    (err: any) => err?.code === 'failed-precondition'
  );
  assert.strictEqual(apiCalls, 0, 'Los rechazos previos no deben llamar a Google Meet API');
  console.log('✓ [TEST 3] PASÓ\n');

  // 4. Provisión exitosa 1 sala por abono + propagación a todas sus lessons
  console.log('--- TEST 4: Provisión única por abono y propagación exacta a sus clases ---');
  const provA = await provisionMonthlyBookingMeetService(
    db as any,
    'teacher_1',
    { bookingId: 'booking_A', meetAccessToken: 'oauth_tok_1' },
    { createMeetSpaceFn: mockCreateMeet }
  );
  assert.strictEqual(apiCalls, 1);
  assert.strictEqual(provA.alreadyProvisioned, false);
  assert.strictEqual(provA.updatedLessonsCount, 2);
  assert.strictEqual(db.readRaw('monthlyBookings/booking_A').meetUrl, provA.meetUrl);
  assert.strictEqual(db.readRaw('monthlyBookings/booking_A').meetProvisioningStatus, 'ready');
  assert.strictEqual(db.readRaw('monthlyBookings/booking_A').totalPrice, 40000);
  assert.strictEqual(db.readRaw('lessons/lesson_A1').meetUrl, provA.meetUrl);
  assert.strictEqual(db.readRaw('lessons/lesson_A2').meetUrl, provA.meetUrl);
  assert.strictEqual(db.readRaw('lessons/lesson_A2').meetSpaceName, provA.meetSpaceName);
  console.log('✓ [TEST 4] PASÓ\n');

  // 5. Idempotencia y sanación de clases faltantes con 0 llamadas extra a Meet API
  console.log('--- TEST 5: Idempotencia por bookingId y sanación sin llamadas duplicadas ---');
  const idempA = await provisionMonthlyBookingMeetService(
    db as any,
    'teacher_1',
    { bookingId: 'booking_A' }, // incluso sin token cuando ya existe sala
    { createMeetSpaceFn: mockCreateMeet }
  );
  assert.strictEqual(apiCalls, 1, 'No debe volver a llamar a Google Meet API');
  assert.strictEqual(idempA.alreadyProvisioned, true);
  assert.strictEqual(idempA.meetUrl, provA.meetUrl);

  // Simular una lección de booking_A que quedó sin meetUrl
  db.seed('lessons/lesson_A2', {
    ...db.readRaw('lessons/lesson_A2'),
    meetUrl: null,
  });
  const healA = await provisionMonthlyBookingMeetService(
    db as any,
    'teacher_1',
    { bookingId: 'booking_A' },
    { createMeetSpaceFn: mockCreateMeet }
  );
  assert.strictEqual(apiCalls, 1, 'La sanación reutiliza la sala del abono sin llamar a Meet API');
  assert.strictEqual(healA.updatedLessonsCount, 1);
  assert.strictEqual(db.readRaw('lessons/lesson_A2').meetUrl, provA.meetUrl);
  console.log('✓ [TEST 5] PASÓ\n');

  // 6. Distintos abonos reciben salas distintas
  console.log('--- TEST 6: Dos abonos distintos del mismo profesor obtienen salas diferentes ---');
  db.seed('monthlyBookings/booking_B', {
    id: 'booking_B',
    teacherId: 'teacher_1',
    studentId: 'student_2',
    month: '2099-06',
    status: 'confirmed',
    lessonIds: ['lesson_B1'],
    meetUrl: null,
  });
  db.seed('lessons/lesson_B1', {
    id: 'lesson_B1',
    teacherId: 'teacher_1',
    studentId: 'student_2',
    monthlyBookingId: 'booking_B',
    status: 'scheduled',
    paymentStatus: 'confirmed',
    meetUrl: null,
  });
  const provB = await provisionMonthlyBookingMeetService(
    db as any,
    'teacher_1',
    { bookingId: 'booking_B', meetAccessToken: 'oauth_tok_1' },
    { createMeetSpaceFn: mockCreateMeet }
  );
  assert.strictEqual(apiCalls, 2);
  assert.notStrictEqual(provB.meetUrl, provA.meetUrl, 'Abono B debe tener sala distinta a Abono A');
  assert.strictEqual(db.readRaw('lessons/lesson_B1').meetUrl, provB.meetUrl);
  console.log('✓ [TEST 6] PASÓ\n');

  // 7. Concurrencia persistente en Firestore (dos invocaciones simultáneas)
  console.log('--- TEST 7: Concurrencia persistente en Firestore (máximo 1 sala creada) ---');
  db.seed('monthlyBookings/booking_concurrent', {
    id: 'booking_concurrent',
    teacherId: 'teacher_1',
    studentId: 'student_3',
    status: 'confirmed',
    lessonIds: ['lesson_C1'],
    meetUrl: null,
  });
  db.seed('lessons/lesson_C1', {
    id: 'lesson_C1',
    teacherId: 'teacher_1',
    studentId: 'student_3',
    monthlyBookingId: 'booking_concurrent',
    status: 'scheduled',
    paymentStatus: 'confirmed',
    meetUrl: null,
  });

  let concurrentApiCalls = 0;
  const slowCreateMeet = async () => {
    concurrentApiCalls++;
    await new Promise((r) => setTimeout(r, 40));
    return {
      meetUrl: 'https://meet.google.com/cnc-curr-ent',
      meetSpaceName: 'spaces/concurrent-1',
    };
  };

  const [r1, r2] = await Promise.allSettled([
    provisionMonthlyBookingMeetService(
      db as any,
      'teacher_1',
      { bookingId: 'booking_concurrent', meetAccessToken: 'tok' },
      { createMeetSpaceFn: slowCreateMeet }
    ),
    provisionMonthlyBookingMeetService(
      db as any,
      'teacher_1',
      { bookingId: 'booking_concurrent', meetAccessToken: 'tok' },
      { createMeetSpaceFn: slowCreateMeet }
    ),
  ]);

  assert.strictEqual(concurrentApiCalls, 1, 'El lock persistente debe impedir más de 1 llamada a Meet API');
  const resultsStatus = [r1.status, r2.status].sort();
  assert.deepStrictEqual(resultsStatus, ['fulfilled', 'rejected']);
  const rejectedResult = (r1.status === 'rejected' ? r1 : r2) as PromiseRejectedResult;
  assert.strictEqual((rejectedResult.reason as any)?.code, 'aborted');
  assert.strictEqual(
    db.readRaw('lessons/lesson_C1').meetUrl,
    'https://meet.google.com/cnc-curr-ent'
  );
  console.log('✓ [TEST 7] PASÓ\n');

  // 8. Respuesta incierta (timeout / 5xx) bloquea reintento ciego
  console.log('--- TEST 8: Protección ante respuesta incierta de Google Meet API ---');
  db.seed('monthlyBookings/booking_uncertain', {
    id: 'booking_uncertain',
    teacherId: 'teacher_1',
    studentId: 'student_4',
    status: 'confirmed',
    lessonIds: ['lesson_U1'],
    meetUrl: null,
  });
  db.seed('lessons/lesson_U1', {
    id: 'lesson_U1',
    teacherId: 'teacher_1',
    studentId: 'student_4',
    monthlyBookingId: 'booking_uncertain',
    status: 'scheduled',
    paymentStatus: 'confirmed',
    meetUrl: null,
  });

  let uncertainApiCalls = 0;
  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        'teacher_1',
        { bookingId: 'booking_uncertain', meetAccessToken: 'tok' },
        {
          createMeetSpaceFn: async () => {
            uncertainApiCalls++;
            throw new MeetApiCallError('Timeout simulado tras envío a Meet API', 'uncertain');
          },
        }
      ),
    (err: any) => err?.code === 'deadline-exceeded'
  );

  assert.strictEqual(
    db.readRaw('monthlyBookings/booking_uncertain').meetProvisioningStatus,
    'uncertain'
  );
  assert.strictEqual(db.readRaw('monthlyBookings/booking_uncertain').meetLockOwnerToken, null);

  // Reintento ciego posterior DEBE ser bloqueado sin invocar nuevamente Meet API
  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        'teacher_1',
        { bookingId: 'booking_uncertain', meetAccessToken: 'tok' },
        {
          createMeetSpaceFn: async () => {
            uncertainApiCalls++;
            return { meetUrl: 'https://meet.google.com/dup-room-bad', meetSpaceName: 'spaces/bad' };
          },
        }
      ),
    (err: any) => err?.code === 'failed-precondition'
  );
  assert.strictEqual(uncertainApiCalls, 1, 'No debe crear sala duplicada tras respuesta incierta');
  console.log('✓ [TEST 8] PASÓ\n');

  // 9. Fallo determinístico (401 OAuth expirado) libera lock y permite reintentar
  console.log('--- TEST 9: Fallo determinístico HTTP 401 libera lock y permite reintentar ---');
  db.seed('monthlyBookings/booking_retry_401', {
    id: 'booking_retry_401',
    teacherId: 'teacher_1',
    studentId: 'student_5',
    status: 'confirmed',
    lessonIds: ['lesson_R1'],
    meetUrl: null,
  });
  db.seed('lessons/lesson_R1', {
    id: 'lesson_R1',
    teacherId: 'teacher_1',
    studentId: 'student_5',
    monthlyBookingId: 'booking_retry_401',
    status: 'scheduled',
    paymentStatus: 'confirmed',
    meetUrl: null,
  });

  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        'teacher_1',
        { bookingId: 'booking_retry_401', meetAccessToken: 'expired_tok' },
        {
          createMeetSpaceFn: async () => {
            throw new MeetApiCallError('Token OAuth inválido', 'definitive_failure', 401);
          },
        }
      ),
    (err: any) => err?.code === 'unauthenticated'
  );
  assert.strictEqual(db.readRaw('monthlyBookings/booking_retry_401').meetProvisioningStatus, 'failed');

  const recoveredAfter401 = await provisionMonthlyBookingMeetService(
    db as any,
    'teacher_1',
    { bookingId: 'booking_retry_401', meetAccessToken: 'fresh_tok' },
    { createMeetSpaceFn: mockCreateMeet }
  );
  assert.strictEqual(recoveredAfter401.success, true);
  assert.strictEqual(db.readRaw('lessons/lesson_R1').meetUrl, recoveredAfter401.meetUrl);
  console.log('✓ [TEST 9] PASÓ\n');

  // 10. Fallo parcial tras crear sala en Meet API no pierde la URL y reintento propaga sin recrear sala
  console.log('--- TEST 10: Fallo parcial en sincronización conserva sala creada para reintento ---');
  db.seed('monthlyBookings/booking_partial', {
    id: 'booking_partial',
    teacherId: 'teacher_1',
    studentId: 'student_6',
    status: 'confirmed',
    lessonIds: ['lesson_P1', 'lesson_P2'],
    meetUrl: null,
  });
  db.seed('lessons/lesson_P1', {
    id: 'lesson_P1',
    teacherId: 'teacher_1',
    studentId: 'student_6',
    monthlyBookingId: 'booking_partial',
    status: 'scheduled',
    paymentStatus: 'confirmed',
    meetUrl: null,
  });
  db.seed('lessons/lesson_P2', {
    id: 'lesson_P2',
    teacherId: 'teacher_1',
    studentId: 'student_6',
    monthlyBookingId: 'booking_partial',
    status: 'scheduled',
    paymentStatus: 'confirmed',
    meetUrl: null,
  });

  let partialApiCalls = 0;
  db.failNextTransactionWriteMatching = (path) => path === 'lessons/lesson_P2';

  await assert.rejects(
    () =>
      provisionMonthlyBookingMeetService(
        db as any,
        'teacher_1',
        { bookingId: 'booking_partial', meetAccessToken: 'tok' },
        {
          createMeetSpaceFn: async () => {
            partialApiCalls++;
            return {
              meetUrl: 'https://meet.google.com/prt-safe-room',
              meetSpaceName: 'spaces/partial-safe',
            };
          },
        }
      ),
    (err: any) => err?.code === 'internal'
  );

  // Gracias al fallback de resguardo, booking_partial conservó la URL creada
  assert.strictEqual(
    db.readRaw('monthlyBookings/booking_partial').meetUrl,
    'https://meet.google.com/prt-safe-room'
  );

  // Reintento posterior sincroniza lesson_P1 y lesson_P2 con 0 llamadas adicionales a Meet API
  const partialHealed = await provisionMonthlyBookingMeetService(
    db as any,
    'teacher_1',
    { bookingId: 'booking_partial', meetAccessToken: 'tok' },
    {
      createMeetSpaceFn: async () => {
        partialApiCalls++;
        return { meetUrl: 'https://meet.google.com/should-not-happen', meetSpaceName: 'spaces/no' };
      },
    }
  );
  assert.strictEqual(partialApiCalls, 1, 'El reintento tras fallo parcial NO debe recrear sala');
  assert.strictEqual(partialHealed.alreadyProvisioned, true);
  assert.strictEqual(partialHealed.updatedLessonsCount, 2);
  assert.strictEqual(db.readRaw('lessons/lesson_P1').meetUrl, 'https://meet.google.com/prt-safe-room');
  assert.strictEqual(db.readRaw('lessons/lesson_P2').meetUrl, 'https://meet.google.com/prt-safe-room');
  console.log('✓ [TEST 10] PASÓ\n');

  console.log('========================================================================');
  console.log('   TODOS LOS TESTS DE ETAPA 2 GOOGLE MEET PASARON (10/10)               ');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('❌ Error en pruebas Etapa 2 Google Meet:', err);
  process.exit(1);
});
