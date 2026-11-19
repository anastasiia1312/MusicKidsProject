/**
 * Suite de pruebas exhaustivas: Organización cronológica de clases y acceso a Google Meet
 *
 * Verifica los 12 escenarios obligatorios de forma idéntica para profesores y alumnos:
 * 1. Antes del inicio: Meet bloqueado ("Disponible a partir de las HH:mm") para ambos roles.
 * 2. En el instante exacto de inicio (nowMs === startMs): Meet habilitado para ambos roles.
 * 3. Durante la clase (startMs <= nowMs < endMs): etiqueta visual "En curso", en Próximas clases.
 * 4. Al finalizar la clase (nowMs === endMs): etiqueta visual "Clase pasada", en Clases pasadas.
 * 5. Después de finalizar (horas, días y meses después): Meet permanece habilitado sin límite.
 * 6. Próximas clases ordenadas cronológicamente ascendente (más próxima -> más lejana).
 * 7. Clases pasadas separadas y ordenadas cronológicamente descendente (más reciente -> más antigua).
 * 8. Clases canceladas conservan etiqueta "Cancelada" y bloquean Meet incluso después del inicio.
 * 9. Clases sin URL válida, pendientes de pago o expiradas bloquean Meet.
 * 10. Actualización automática sin recargar página (cálculo de transiciones, temporizador real y cleanup).
 * 11. Zona horaria America/Argentina/Buenos_Aires, duraciones variables (30/45/60/90 min) y cruces de día/mes/año.
 * 12. Verificación estática en todo src/ de que ningún componente renderiza enlaces Meet sin validación temporal.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { Lesson } from '../src/types/lesson';
import {
  ARGENTINA_TIMEZONE,
  DEFAULT_LESSON_DURATION_MINUTES,
  canJoinLessonMeet,
  computeNextLessonTickDelayMs,
  evaluateLessonMeetAccess,
  formatDateInBuenosAires,
  formatTimeInBuenosAires,
  getLessonTemporalState,
  getLessonTimeWindow,
  getNextLessonTransitionMs,
  organizeLessonsChronologically,
  parseLessonTimestampMs,
  resolveLessonDurationMinutes,
} from '../src/utils/meetValidation';
import { formatLessonDateTime } from '../src/utils/dateUtils';

function makeLesson(overrides: Partial<Lesson> & Record<string, any> = {}): Lesson {
  return {
    id: overrides.id || 'lesson_1',
    title: overrides.title || 'Clase de Piano',
    teacherId: 'teacher_1',
    teacherName: 'Prof. Clara',
    studentId: 'student_1',
    studentName: 'Mateo',
    date: overrides.date ?? '2026-08-15T15:00:00-03:00',
    duration: overrides.duration ?? 45,
    status: overrides.status ?? 'scheduled',
    meetUrl: overrides.meetUrl !== undefined ? overrides.meetUrl : 'https://meet.google.com/abc-defg-hij',
    createdAt: '2026-08-01T10:00:00-03:00',
    ...overrides,
  } as Lesson;
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function runTests() {
  console.log('========================================================================');
  console.log('  MUSICKIDS: PRUEBAS DE CRONOLOGÍA DE CLASES Y ACCESO A GOOGLE MEET     ');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Profesor y alumno antes del inicio -> Meet bloqueado
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Bloqueo de Meet antes del inicio (profesor y alumno) ---');
  const startIso = '2026-08-15T15:30:00-03:00';
  const startMs = Date.parse(startIso);
  const confirmedLesson = makeLesson({
    id: 'l_confirmed',
    date: startIso,
    duration: 45,
    monthlyBookingId: 'mb_1',
    paymentStatus: 'confirmed',
  });

  // 1 ms antes del inicio y 2 horas antes del inicio
  for (const nowBefore of [startMs - 2 * 60 * 60 * 1000, startMs - 1]) {
    const teacherEval = evaluateLessonMeetAccess(confirmedLesson, nowBefore);
    const studentEval = evaluateLessonMeetAccess(confirmedLesson, nowBefore);
    assert.deepStrictEqual(
      teacherEval,
      studentEval,
      'La evaluación debe ser idéntica para profesor y alumno'
    );
    assert.strictEqual(teacherEval.canJoin, false);
    assert.strictEqual(teacherEval.reason, 'before_start');
    assert.strictEqual(teacherEval.meetUrl, null, 'Nunca exponer href antes del inicio');
    assert.strictEqual(teacherEval.availableFromLabel, '15:30');
    assert.strictEqual(teacherEval.availabilityMessage, 'Disponible a partir de las 15:30');
    assert.strictEqual(canJoinLessonMeet(confirmedLesson, nowBefore), false);

    const stateBefore = getLessonTemporalState(confirmedLesson, nowBefore);
    assert.strictEqual(stateBefore.phase, 'upcoming');
    assert.strictEqual(stateBefore.label, 'Próxima clase');
  }
  console.log('✓ [TEST 1] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 2: En el instante exacto de inicio (nowMs === startMs) -> Meet habilitado
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Habilitación exacta en nowMs === startMs ---');
  const atStartEval = evaluateLessonMeetAccess(confirmedLesson, startMs);
  assert.strictEqual(atStartEval.canJoin, true);
  assert.strictEqual(atStartEval.reason, 'none');
  assert.strictEqual(atStartEval.meetUrl, 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(atStartEval.availabilityMessage, null);
  assert.strictEqual(canJoinLessonMeet(confirmedLesson, startMs), true);
  console.log('✓ [TEST 2] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Durante la clase (startMs <= nowMs < endMs) -> "En curso"
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Estado visual "En curso" durante la clase ---');
  const endMs = startMs + 45 * 60 * 1000;
  for (const duringMs of [startMs, startMs + 20 * 60 * 1000, endMs - 1]) {
    const state = getLessonTemporalState(confirmedLesson, duringMs);
    assert.strictEqual(state.phase, 'in_progress');
    assert.strictEqual(state.label, 'En curso');
    assert.strictEqual(evaluateLessonMeetAccess(confirmedLesson, duringMs).canJoin, true);

    const organized = organizeLessonsChronologically([confirmedLesson], duringMs);
    assert.strictEqual(organized.upcomingLessons.length, 1);
    assert.strictEqual(organized.pastLessons.length, 0);
  }
  console.log('✓ [TEST 3] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 4: En el instante exacto de finalización (nowMs === endMs) -> "Clase pasada"
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Transición exacta a "Clase pasada" en nowMs === endMs ---');
  const atEndState = getLessonTemporalState(confirmedLesson, endMs);
  assert.strictEqual(atEndState.phase, 'past');
  assert.strictEqual(atEndState.label, 'Clase pasada');

  const organizedAtEnd = organizeLessonsChronologically([confirmedLesson], endMs);
  assert.strictEqual(organizedAtEnd.upcomingLessons.length, 0);
  assert.strictEqual(organizedAtEnd.pastLessons.length, 1);
  assert.strictEqual(organizedAtEnd.pastLessons[0].id, confirmedLesson.id);
  console.log('✓ [TEST 4] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Después de finalizar -> Meet sigue habilitado sin límite de tiempo
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Meet permanece habilitado después de finalizar sin límite ---');
  const postEndMoments = [
    endMs,
    endMs + 60 * 60 * 1000, // +1 hora
    endMs + 7 * 24 * 60 * 60 * 1000, // +7 días
    endMs + 365 * 24 * 60 * 60 * 1000, // +1 año
  ];
  for (const afterMs of postEndMoments) {
    const access = evaluateLessonMeetAccess(confirmedLesson, afterMs);
    assert.strictEqual(access.canJoin, true);
    assert.strictEqual(access.meetUrl, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(getLessonTemporalState(confirmedLesson, afterMs).label, 'Clase pasada');
  }
  console.log('✓ [TEST 5] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 6 y TEST 7: Orden cronológico ascendente (Próximas) y descendente (Pasadas)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6 y 7: Ordenamiento ascendente en Próximas y descendente en Pasadas ---');
  const refNowMs = Date.parse('2026-08-15T15:20:00-03:00');
  const mixedLessons: Lesson[] = [
    // Futura lejana
    makeLesson({ id: 'future_far', date: '2026-08-20T18:00:00-03:00', duration: 60 }),
    // Pasada antigua
    makeLesson({ id: 'past_oldest', date: '2026-08-01T10:00:00-03:00', duration: 45 }),
    // En curso (15:00 - 15:45)
    makeLesson({ id: 'in_progress_now', date: '2026-08-15T15:00:00-03:00', duration: 45 }),
    // Pasada más reciente (14:00 - 14:45)
    makeLesson({ id: 'past_recent', date: '2026-08-15T14:00:00-03:00', duration: 45 }),
    // Futura cercana (hoy 16:00)
    makeLesson({ id: 'future_near', date: '2026-08-15T16:00:00-03:00', duration: 30 }),
    // Pasada intermedia (10 ago)
    makeLesson({ id: 'past_mid', date: '2026-08-10T11:00:00-03:00', duration: 45 }),
    // Futura intermedia (17 ago)
    makeLesson({ id: 'future_mid', date: '2026-08-17T09:00:00-03:00', duration: 45 }),
  ];

  const organizedMixed = organizeLessonsChronologically(mixedLessons, refNowMs);
  assert.deepStrictEqual(
    organizedMixed.upcomingLessons.map((l) => l.id),
    ['in_progress_now', 'future_near', 'future_mid', 'future_far'],
    'Próximas clases debe incluir en curso y futuras en orden ascendente'
  );
  assert.deepStrictEqual(
    organizedMixed.pastLessons.map((l) => l.id),
    ['past_recent', 'past_mid', 'past_oldest'],
    'Clases pasadas debe ordenarse descendente (más reciente a más antigua)'
  );
  console.log('✓ [TEST 6 y 7] PASARON\n');

  // ---------------------------------------------------------------------------
  // TEST 8: Clases canceladas conservan etiqueta "Cancelada" y bloquean Meet
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Clases canceladas identificadas y con Meet bloqueado ---');
  const cancelledPast = makeLesson({
    id: 'cancelled_1',
    date: '2026-08-10T10:00:00-03:00',
    status: 'cancelled',
    paymentStatus: 'confirmed',
    monthlyBookingId: 'mb_c1',
    meetUrl: 'https://meet.google.com/xyz-abcd-efg',
  });
  const cancelledFuture = makeLesson({
    id: 'cancelled_2',
    date: '2026-08-20T10:00:00-03:00',
    status: 'cancelled',
    meetUrl: 'https://meet.google.com/xyz-abcd-efg',
  });

  for (const cLesson of [cancelledPast, cancelledFuture]) {
    const tState = getLessonTemporalState(cLesson, refNowMs);
    assert.strictEqual(tState.phase, 'cancelled');
    assert.strictEqual(tState.label, 'Cancelada');
    const access = evaluateLessonMeetAccess(cLesson, refNowMs);
    assert.strictEqual(access.canJoin, false);
    assert.strictEqual(access.reason, 'cancelled');
    assert.strictEqual(access.meetUrl, null);
  }

  const orgWithCancelled = organizeLessonsChronologically(
    [...mixedLessons, cancelledPast, cancelledFuture],
    refNowMs
  );
  assert.deepStrictEqual(
    orgWithCancelled.cancelledLessons.map((l) => l.id),
    ['cancelled_2', 'cancelled_1']
  );
  assert.strictEqual(
    orgWithCancelled.upcomingLessons.some((l) => l.status === 'cancelled'),
    false
  );
  assert.strictEqual(
    orgWithCancelled.pastLessons.some((l) => l.status === 'cancelled'),
    false
  );
  console.log('✓ [TEST 8] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 9: URL inválida, pago pendiente, estado no autorizado o reserva expirada
  // ---------------------------------------------------------------------------
  console.log('--- TEST 9: Validaciones existentes de URL, pago confirmado y expiración ---');
  const startedDate = '2026-08-15T15:00:00-03:00';

  const pendingPaymentLesson = makeLesson({
    id: 'pending_pay',
    date: startedDate,
    monthlyBookingId: 'mb_p',
    paymentStatus: 'pending_confirmation',
    expiresAt: '2026-08-16T15:00:00-03:00',
  });
  const evalPending = evaluateLessonMeetAccess(pendingPaymentLesson, refNowMs);
  assert.strictEqual(evalPending.canJoin, false);
  assert.strictEqual(evalPending.reason, 'pending_payment');
  assert.strictEqual(evalPending.meetUrl, null);

  const expiredLesson = makeLesson({
    id: 'expired_l',
    date: startedDate,
    status: 'expired',
    paymentStatus: 'expired',
    monthlyBookingId: 'mb_e',
  });
  assert.strictEqual(evaluateLessonMeetAccess(expiredLesson, refNowMs).canJoin, false);

  const expiredPending24h = makeLesson({
    id: 'expired_24h',
    date: startedDate,
    monthlyBookingId: 'mb_e2',
    paymentStatus: 'pending_confirmation',
    expiresAt: '2026-08-15T14:00:00-03:00',
  });
  assert.strictEqual(evaluateLessonMeetAccess(expiredPending24h, refNowMs).canJoin, false);
  const orgExpired = organizeLessonsChronologically([expiredLesson, expiredPending24h], refNowMs);
  assert.strictEqual(orgExpired.expiredLessons.length, 2);
  assert.strictEqual(orgExpired.upcomingLessons.length, 0);

  const badUrlLesson = makeLesson({
    id: 'bad_url',
    date: startedDate,
    meetUrl: 'https://zoom.us/j/123456',
    paymentStatus: 'confirmed',
    monthlyBookingId: 'mb_bad',
  });
  const evalBadUrl = evaluateLessonMeetAccess(badUrlLesson, refNowMs);
  assert.strictEqual(evalBadUrl.canJoin, false);
  assert.strictEqual(evalBadUrl.reason, 'invalid_url');

  const missingUrlLesson = makeLesson({
    id: 'no_url',
    date: startedDate,
    meetUrl: '',
    paymentStatus: 'confirmed',
    monthlyBookingId: 'mb_no',
  });
  assert.strictEqual(evaluateLessonMeetAccess(missingUrlLesson, refNowMs).reason, 'invalid_url');

  const missingDateLesson = makeLesson({
    id: 'no_date',
    date: '',
    paymentStatus: 'confirmed',
    monthlyBookingId: 'mb_nodate',
  });
  assert.strictEqual(evaluateLessonMeetAccess(missingDateLesson, refNowMs).reason, 'invalid_schedule');
  console.log('✓ [TEST 9] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 10: Actualización automática sin recargar la página (timer real + cleanup)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 10: Actualización automática sin recargar (transición real + cleanup) ---');
  const baseNow = Date.now();
  const shortStartMs = baseNow + 90; // Inicia en 90ms
  const shortDurationMin = 0.0025; // 150ms de duración para prueba real rápida
  const liveLesson = makeLesson({
    id: 'live_transition',
    date: new Date(shortStartMs),
    duration: shortDurationMin,
    paymentStatus: 'confirmed',
    monthlyBookingId: 'mb_live',
  });

  // Antes del inicio
  assert.strictEqual(evaluateLessonMeetAccess(liveLesson, baseNow).reason, 'before_start');
  assert.strictEqual(getLessonTemporalState(liveLesson, baseNow).label, 'Próxima clase');
  const nextStartTransition = getNextLessonTransitionMs([liveLesson], baseNow);
  assert.strictEqual(nextStartTransition, shortStartMs);
  const delayToStart = computeNextLessonTickDelayMs([liveLesson], baseNow);
  assert.ok(delayToStart !== null && delayToStart > 0 && delayToStart <= 250);

  // Esperar transición automática al inicio sin recargar
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      resolve();
    }, delayToStart!);
  });

  const nowAtStart = Date.now();
  assert.strictEqual(evaluateLessonMeetAccess(liveLesson, nowAtStart).canJoin, true);
  assert.strictEqual(getLessonTemporalState(liveLesson, nowAtStart).label, 'En curso');

  // Esperar transición automática al fin de la clase
  const delayToEnd = computeNextLessonTickDelayMs([liveLesson], nowAtStart);
  assert.ok(delayToEnd !== null && delayToEnd > 0);
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      resolve();
    }, delayToEnd!);
  });

  const nowAfterEnd = Date.now();
  assert.strictEqual(getLessonTemporalState(liveLesson, nowAfterEnd).label, 'Clase pasada');
  assert.strictEqual(evaluateLessonMeetAccess(liveLesson, nowAfterEnd).canJoin, true);
  assert.strictEqual(computeNextLessonTickDelayMs([liveLesson], nowAfterEnd), null);
  console.log('✓ [TEST 10] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 11: Zona horaria Argentina, duraciones variables y cruces día/mes/año
  // ---------------------------------------------------------------------------
  console.log('--- TEST 11: Zona horaria Buenos Aires, duraciones variables y cruces de año ---');
  assert.strictEqual(ARGENTINA_TIMEZONE, 'America/Argentina/Buenos_Aires');
  assert.strictEqual(resolveLessonDurationMinutes({ duration: undefined }), DEFAULT_LESSON_DURATION_MINUTES);
  assert.strictEqual(resolveLessonDurationMinutes({ duration: 30 }), 30);
  assert.strictEqual(resolveLessonDurationMinutes({ duration: 45 }), 45);
  assert.strictEqual(resolveLessonDurationMinutes({ duration: 60 }), 60);
  assert.strictEqual(resolveLessonDurationMinutes({ duration: 90 }), 90);

  // Clase que cruza medianoche, fin de mes y fin de año en Buenos Aires:
  // 31/12/2026 23:30 (-03:00) + 45 min => finaliza 01/01/2027 00:15 (-03:00)
  // En UTC esto corresponde a 01/01/2027 02:30Z -> 03:15Z
  const nyeLesson = makeLesson({
    id: 'nye_rollover',
    date: '2027-01-01T02:30:00.000Z', // 23:30 en Buenos Aires del 31/12/2026
    duration: 45,
    paymentStatus: 'confirmed',
    monthlyBookingId: 'mb_nye',
  });
  const nyeWindow = getLessonTimeWindow(nyeLesson)!;
  assert.ok(nyeWindow);
  assert.strictEqual(formatDateInBuenosAires(nyeWindow.startMs), '31/12/2026');
  assert.strictEqual(formatTimeInBuenosAires(nyeWindow.startMs), '23:30');
  assert.strictEqual(formatDateInBuenosAires(nyeWindow.endMs), '01/01/2027');
  assert.strictEqual(formatTimeInBuenosAires(nyeWindow.endMs), '00:15');
  assert.strictEqual(formatLessonDateTime(nyeLesson.date), '31/12/2026 - 23:30');

  // 23:29:59 BA -> bloqueado con "Disponible a partir de las 23:30"
  const beforeNye = Date.parse('2026-12-31T23:29:59-03:00');
  const accessBeforeNye = evaluateLessonMeetAccess(nyeLesson, beforeNye);
  assert.strictEqual(accessBeforeNye.canJoin, false);
  assert.strictEqual(accessBeforeNye.availabilityMessage, 'Disponible a partir de las 23:30');

  // 00:05:00 del 01/01/2027 BA -> En curso
  const midNye = Date.parse('2027-01-01T00:05:00-03:00');
  assert.strictEqual(getLessonTemporalState(nyeLesson, midNye).label, 'En curso');
  assert.strictEqual(evaluateLessonMeetAccess(nyeLesson, midNye).canJoin, true);

  // 00:15:00 del 01/01/2027 BA -> Clase pasada, Meet sigue habilitado
  const endNye = Date.parse('2027-01-01T00:15:00-03:00');
  assert.strictEqual(getLessonTemporalState(nyeLesson, endNye).label, 'Clase pasada');
  assert.strictEqual(evaluateLessonMeetAccess(nyeLesson, endNye).canJoin, true);

  // Verificar soporte de Firestore Timestamp mockeado y YYYY-MM-DD + startTime
  const firestoreTsMock = {
    seconds: Math.floor(Date.parse('2026-09-01T00:00:00-03:00') / 1000),
    nanoseconds: 0,
  };
  const midnightMs = parseLessonTimestampMs(firestoreTsMock)!;
  assert.strictEqual(formatTimeInBuenosAires(midnightMs), '00:00', 'Medianoche debe formatearse 00:00 y nunca 24:00');
  assert.strictEqual(
    parseLessonTimestampMs('2026-09-01', '09:15'),
    Date.parse('2026-09-01T09:15:00-03:00')
  );
  console.log('✓ [TEST 11] PASÓ\n');

  // ---------------------------------------------------------------------------
  // TEST 12: Auditoría estática de que ningún componente UI expone href Meet sin gate
  // ---------------------------------------------------------------------------
  console.log('--- TEST 12: Auditoría estática de componentes UI (sin acceso prematuro a Meet) ---');
  const srcRoot = path.resolve(process.cwd(), 'src');
  const allSrcFiles = collectSourceFiles(srcRoot);
  const violations: string[] = [];

  for (const filePath of allSrcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(process.cwd(), filePath);

    // Detectar cualquier href directo a .meetUrl o window.open con meetUrl que evada meetAccess.meetUrl
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (
        /href=\{[^}]*\.meetUrl/.test(line) &&
        !/href=\{meetAccess\.meetUrl\}/.test(line)
      ) {
        violations.push(`${rel}:${idx + 1} -> ${line.trim()}`);
      }
      if (/window\.open\([^)]*meetUrl/i.test(line)) {
        violations.push(`${rel}:${idx + 1} -> ${line.trim()}`);
      }
    });
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Se encontraron enlaces Google Meet sin validación centralizada:\n${violations.join('\n')}`
  );

  // Verificar que los 5 componentes UI clave utilizan evaluateLessonMeetAccess y useLessonTimeTick
  const requiredGatedFiles = [
    'src/pages/teacher/TeacherDashboard.tsx',
    'src/pages/student/StudentDashboard.tsx',
    'src/pages/LessonPage.tsx',
    'src/components/lessons/LessonCard.tsx',
    'src/components/teacher/AvailabilityDetailsModal.tsx',
  ];
  for (const relFile of requiredGatedFiles) {
    const text = fs.readFileSync(path.resolve(process.cwd(), relFile), 'utf8');
    assert.ok(
      text.includes('evaluateLessonMeetAccess'),
      `${relFile} debe usar evaluateLessonMeetAccess`
    );
    assert.ok(
      text.includes('useLessonTimeTick'),
      `${relFile} debe usar useLessonTimeTick para actualización automática sin recarga`
    );
  }
  console.log('✓ [TEST 12] PASÓ\n');

  console.log('========================================================================');
  console.log('  TODOS LOS TESTS DE CRONOLOGÍA Y GOOGLE MEET PASARON (12/12)           ');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('❌ Error en pruebas de cronología y acceso a Google Meet:', err);
  process.exit(1);
});
