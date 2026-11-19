import type { Lesson } from '../types/lesson';

export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const DEFAULT_LESSON_DURATION_MINUTES = 45;

const MEET_URL_REGEX =
  /^https:\/\/meet\.google\.com\/[a-zA-Z0-9]{2,}(?:-[a-zA-Z0-9]+)+(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_NO_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const TIME_HH_MM_REGEX = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

const baTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const baDateFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export interface LessonTimeWindow {
  startMs: number;
  endMs: number;
  durationMinutes: number;
}

export type LessonTemporalPhase = 'upcoming' | 'in_progress' | 'past' | 'cancelled';

export interface LessonTemporalState {
  phase: LessonTemporalPhase;
  label: 'Próxima clase' | 'En curso' | 'Clase pasada' | 'Cancelada';
  startMs: number | null;
  endMs: number | null;
  durationMinutes: number;
  startTimeLabel: string;
}

export type MeetAccessBlockReason =
  | 'none'
  | 'cancelled'
  | 'pending_payment'
  | 'unauthorized'
  | 'invalid_url'
  | 'invalid_schedule'
  | 'before_start';

export interface LessonMeetAccess {
  canJoin: boolean;
  reason: MeetAccessBlockReason;
  meetUrl: string | null;
  availableFromLabel: string | null;
  availabilityMessage: string | null;
  startMs: number | null;
  endMs: number | null;
}

export interface OrganizedLessons<T extends Lesson = Lesson> {
  upcomingLessons: T[];
  pastLessons: T[];
  cancelledLessons: T[];
  expiredLessons: T[];
}

/**
 * Valida estrictamente que una URL de Google Meet tenga formato oficial válido.
 */
export function isValidMeetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return MEET_URL_REGEX.test(url.trim());
}

/**
 * Convierte distintos formatos de fecha (Firestore Timestamp, Date, ISO string,
 * YYYY-MM-DD + startTime en Argentina) a un timestamp numérico en milisegundos (UTC epoch).
 */
export function parseLessonTimestampMs(
  value: any,
  fallbackStartTime?: string | null
): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      const ms = d instanceof Date ? d.getTime() : NaN;
      return Number.isFinite(ms) ? ms : null;
    }
    const rawSeconds =
      typeof value.seconds === 'number'
        ? value.seconds
        : typeof value._seconds === 'number'
        ? value._seconds
        : null;
    if (rawSeconds !== null && Number.isFinite(rawSeconds)) {
      const rawNanos =
        typeof value.nanoseconds === 'number'
          ? value.nanoseconds
          : typeof value._nanoseconds === 'number'
          ? value._nanoseconds
          : 0;
      return rawSeconds * 1000 + Math.floor(rawNanos / 1_000_000);
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Fecha sin hora ("YYYY-MM-DD"): interpretar en America/Argentina/Buenos_Aires (UTC-3)
    if (DATE_ONLY_REGEX.test(trimmed)) {
      const timeMatch =
        typeof fallbackStartTime === 'string'
          ? fallbackStartTime.trim().match(TIME_HH_MM_REGEX)
          : null;
      const hh = timeMatch ? timeMatch[1] : '00';
      const mm = timeMatch ? timeMatch[2] : '00';
      const ss = timeMatch && timeMatch[3] ? timeMatch[3] : '00';
      const ms = Date.parse(`${trimmed}T${hh}:${mm}:${ss}-03:00`);
      return Number.isFinite(ms) ? ms : null;
    }

    // ISO local sin offset explícito: interpretar en America/Argentina/Buenos_Aires (UTC-3)
    if (ISO_NO_TZ_REGEX.test(trimmed)) {
      const hasSeconds = trimmed.length >= 19;
      const normalized = hasSeconds ? `${trimmed}-03:00` : `${trimmed}:00-03:00`;
      const ms = Date.parse(normalized);
      return Number.isFinite(ms) ? ms : null;
    }

    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }

  return null;
}

/**
 * Formatea un timestamp numérico como hora HH:mm en zona horaria America/Argentina/Buenos_Aires.
 */
export function formatTimeInBuenosAires(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return '--:--';
  const parts = baTimeFormatter.formatToParts(new Date(timestampMs));
  let hour = '00';
  let minute = '00';
  for (const part of parts) {
    if (part.type === 'hour') hour = part.value;
    if (part.type === 'minute') minute = part.value;
  }
  if (hour === '24') hour = '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/**
 * Formatea un timestamp numérico como fecha DD/MM/AAAA en zona horaria America/Argentina/Buenos_Aires.
 */
export function formatDateInBuenosAires(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return '--/--/----';
  const parts = baDateFormatter.formatToParts(new Date(timestampMs));
  let day = '01';
  let month = '01';
  let year = '1970';
  for (const part of parts) {
    if (part.type === 'day') day = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'year') year = part.value;
  }
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

/**
 * Resuelve la duración real en minutos de una clase (con respaldo seguro de 45 min).
 */
export function resolveLessonDurationMinutes(lesson?: Partial<Lesson> | null): number {
  const raw = Number(lesson?.duration);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_LESSON_DURATION_MINUTES;
}

/**
 * Obtiene la ventana temporal exacta [startMs, endMs) de una clase en epoch ms.
 */
export function getLessonTimeWindow(lesson?: Partial<Lesson> | null): LessonTimeWindow | null {
  if (!lesson) return null;
  const startMs = parseLessonTimestampMs(lesson.date, (lesson as any).startTime);
  if (startMs === null) return null;
  const durationMinutes = resolveLessonDurationMinutes(lesson);
  const endMs = startMs + durationMinutes * 60 * 1000;
  return {
    startMs,
    endMs,
    durationMinutes,
  };
}

/**
 * Determina si una clase corresponde a una reserva mensual vencida/expirada (plazo 24h).
 */
export function isLessonExpiredReservation(
  lesson?: Partial<Lesson> | null,
  nowMs: number = Date.now()
): boolean {
  if (!lesson) return false;
  if (lesson.status === 'expired') return true;
  if ((lesson as any).paymentStatus === 'expired') return true;
  if (
    (lesson as any).paymentStatus === 'pending_confirmation' &&
    (lesson as any).monthlyBookingId
  ) {
    const expMs = parseLessonTimestampMs((lesson as any).expiresAt);
    if (expMs !== null && expMs <= nowMs) {
      return true;
    }
  }
  return false;
}

/**
 * Determina si la clase está en un estado autorizado para habilitar el acceso a Google Meet.
 * - Exige que no esté cancelada ni expirada.
 * - Si pertenece a un abono mensual, exige paymentStatus === 'confirmed'.
 * - Para clases manuales heredadas sin paymentStatus, permite el acceso mientras no esté cancelada/expirada.
 */
export function isLessonMeetAuthorized(
  lesson?: Partial<Lesson> | null,
  nowMs: number = Date.now()
): boolean {
  if (!lesson) return false;
  if (lesson.status === 'cancelled' || isLessonExpiredReservation(lesson, nowMs)) return false;

  const paymentStatus = (lesson as any).paymentStatus;
  if (
    paymentStatus === 'pending_confirmation' ||
    paymentStatus === 'pending_payment' ||
    paymentStatus === 'pending' ||
    paymentStatus === 'expired' ||
    paymentStatus === 'cancelled' ||
    paymentStatus === 'refunded'
  ) {
    return false;
  }

  if ((lesson as any).monthlyBookingId) {
    return paymentStatus === 'confirmed';
  }

  return !paymentStatus || paymentStatus === 'confirmed';
}

/**
 * Calcula la etiqueta visual temporal de una clase sin modificar estados persistentes de Firestore.
 * - Cancelada -> "Cancelada"
 * - nowMs < startMs -> "Próxima clase"
 * - startMs <= nowMs < endMs -> "En curso"
 * - nowMs >= endMs -> "Clase pasada"
 */
export function getLessonTemporalState(
  lesson?: Partial<Lesson> | null,
  nowMs: number = Date.now()
): LessonTemporalState {
  const durationMinutes = resolveLessonDurationMinutes(lesson);
  const window = getLessonTimeWindow(lesson);
  const startTimeLabel = window ? formatTimeInBuenosAires(window.startMs) : '--:--';

  if (lesson?.status === 'cancelled') {
    return {
      phase: 'cancelled',
      label: 'Cancelada',
      startMs: window?.startMs ?? null,
      endMs: window?.endMs ?? null,
      durationMinutes,
      startTimeLabel,
    };
  }

  if (!window) {
    return {
      phase: 'upcoming',
      label: 'Próxima clase',
      startMs: null,
      endMs: null,
      durationMinutes,
      startTimeLabel,
    };
  }

  if (nowMs < window.startMs) {
    return {
      phase: 'upcoming',
      label: 'Próxima clase',
      startMs: window.startMs,
      endMs: window.endMs,
      durationMinutes,
      startTimeLabel,
    };
  }

  if (nowMs < window.endMs) {
    return {
      phase: 'in_progress',
      label: 'En curso',
      startMs: window.startMs,
      endMs: window.endMs,
      durationMinutes,
      startTimeLabel,
    };
  }

  return {
    phase: 'past',
    label: 'Clase pasada',
    startMs: window.startMs,
    endMs: window.endMs,
    durationMinutes,
    startTimeLabel,
  };
}

/**
 * Evaluación centralizada de acceso a Google Meet (idéntica para profesores y alumnos):
 * 1) Conserva validaciones de estado autorizado, pago confirmado y URL válida.
 * 2) Bloquea el acceso antes del timestamp exacto de inicio (nowMs < startMs)
 *    mostrando "Disponible a partir de las HH:mm" (hora de Buenos Aires).
 * 3) Habilita a partir del inicio (nowMs >= startMs) y mantiene habilitado durante
 *    y después de finalizar la clase sin límite de tiempo.
 */
export function evaluateLessonMeetAccess(
  lesson?: Partial<Lesson> | null,
  nowMs: number = Date.now()
): LessonMeetAccess {
  if (!lesson) {
    return {
      canJoin: false,
      reason: 'unauthorized',
      meetUrl: null,
      availableFromLabel: null,
      availabilityMessage: null,
      startMs: null,
      endMs: null,
    };
  }

  const window = getLessonTimeWindow(lesson);
  const availableFromLabel = window ? formatTimeInBuenosAires(window.startMs) : null;

  if (lesson.status === 'cancelled') {
    return {
      canJoin: false,
      reason: 'cancelled',
      meetUrl: null,
      availableFromLabel,
      availabilityMessage: null,
      startMs: window?.startMs ?? null,
      endMs: window?.endMs ?? null,
    };
  }

  if (isLessonExpiredReservation(lesson, nowMs)) {
    return {
      canJoin: false,
      reason: 'unauthorized',
      meetUrl: null,
      availableFromLabel,
      availabilityMessage: null,
      startMs: window?.startMs ?? null,
      endMs: window?.endMs ?? null,
    };
  }

  const paymentStatus = (lesson as any).paymentStatus;
  if (
    paymentStatus === 'pending_confirmation' ||
    paymentStatus === 'pending_payment' ||
    paymentStatus === 'pending'
  ) {
    return {
      canJoin: false,
      reason: 'pending_payment',
      meetUrl: null,
      availableFromLabel,
      availabilityMessage: null,
      startMs: window?.startMs ?? null,
      endMs: window?.endMs ?? null,
    };
  }

  if (!isLessonMeetAuthorized(lesson, nowMs)) {
    return {
      canJoin: false,
      reason: 'unauthorized',
      meetUrl: null,
      availableFromLabel,
      availabilityMessage: null,
      startMs: window?.startMs ?? null,
      endMs: window?.endMs ?? null,
    };
  }

  if (!isValidMeetUrl(lesson.meetUrl)) {
    return {
      canJoin: false,
      reason: 'invalid_url',
      meetUrl: null,
      availableFromLabel,
      availabilityMessage: null,
      startMs: window?.startMs ?? null,
      endMs: window?.endMs ?? null,
    };
  }

  if (!window) {
    return {
      canJoin: false,
      reason: 'invalid_schedule',
      meetUrl: null,
      availableFromLabel: null,
      availabilityMessage: null,
      startMs: null,
      endMs: null,
    };
  }

  if (nowMs < window.startMs) {
    return {
      canJoin: false,
      reason: 'before_start',
      meetUrl: null,
      availableFromLabel,
      availabilityMessage: `Disponible a partir de las ${availableFromLabel}`,
      startMs: window.startMs,
      endMs: window.endMs,
    };
  }

  return {
    canJoin: true,
    reason: 'none',
    meetUrl: lesson.meetUrl!.trim(),
    availableFromLabel,
    availabilityMessage: null,
    startMs: window.startMs,
    endMs: window.endMs,
  };
}

/**
 * Habilita el enlace a Google Meet ÚNICAMENTE cuando:
 * 1) El acceso está autorizado según estado y pago de la clase.
 * 2) La URL de Google Meet tiene formato estructural válido.
 * 3) Ya llegó o pasó el timestamp exacto de inicio de la clase (nowMs >= startMs).
 */
export function canJoinLessonMeet(
  lesson?: Partial<Lesson> | null,
  nowMs: number = Date.now()
): boolean {
  return evaluateLessonMeetAccess(lesson, nowMs).canJoin;
}

/**
 * Clasifica y ordena cronológicamente las clases para profesores y alumnos de forma idéntica:
 * - upcomingLessons: futuras y en curso (nowMs < endMs), orden ascendente (más próxima primero).
 * - pastLessons: finalizadas (nowMs >= endMs), orden descendente (más reciente primero).
 * - cancelledLessons: canceladas, preservando su identificación, orden descendente.
 * - expiredLessons: reservas vencidas de 24h sin confirmación.
 */
export function organizeLessonsChronologically<T extends Lesson>(
  lessons: T[],
  nowMs: number = Date.now()
): OrganizedLessons<T> {
  const upcomingEntries: Array<{ lesson: T; startMs: number; endMs: number }> = [];
  const pastEntries: Array<{ lesson: T; startMs: number; endMs: number }> = [];
  const cancelledEntries: Array<{ lesson: T; startMs: number }> = [];
  const expiredLessons: T[] = [];

  for (const lesson of lessons) {
    if (isLessonExpiredReservation(lesson, nowMs)) {
      expiredLessons.push(lesson);
      continue;
    }

    const window = getLessonTimeWindow(lesson);
    const startMs = window?.startMs ?? Number.MAX_SAFE_INTEGER;
    const endMs = window?.endMs ?? Number.MAX_SAFE_INTEGER;

    if (lesson.status === 'cancelled') {
      cancelledEntries.push({
        lesson,
        startMs: window?.startMs ?? Number.MIN_SAFE_INTEGER,
      });
      continue;
    }

    if (window && nowMs >= window.endMs) {
      pastEntries.push({ lesson, startMs, endMs });
    } else {
      upcomingEntries.push({ lesson, startMs, endMs });
    }
  }

  // Próximas clases: ascendente (más próxima -> más lejana)
  upcomingEntries.sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.endMs - b.endMs;
  });

  // Clases pasadas: descendente (más reciente -> más antigua)
  pastEntries.sort((a, b) => {
    if (b.startMs !== a.startMs) return b.startMs - a.startMs;
    return b.endMs - a.endMs;
  });

  // Clases canceladas: descendente (más reciente -> más antigua)
  cancelledEntries.sort((a, b) => b.startMs - a.startMs);

  return {
    upcomingLessons: upcomingEntries.map((e) => e.lesson),
    pastLessons: pastEntries.map((e) => e.lesson),
    cancelledLessons: cancelledEntries.map((e) => e.lesson),
    expiredLessons,
  };
}

/**
 * Calcula el próximo timestamp de transición (inicio o fin de clase) estrictamente mayor a nowMs.
 */
export function getNextLessonTransitionMs(
  lessons: Array<Partial<Lesson> | null | undefined>,
  nowMs: number = Date.now()
): number | null {
  let nextMs: number | null = null;

  for (const lesson of lessons) {
    if (!lesson || lesson.status === 'cancelled' || isLessonExpiredReservation(lesson, nowMs)) {
      continue;
    }
    const window = getLessonTimeWindow(lesson);
    if (!window) continue;

    if (window.startMs > nowMs && (nextMs === null || window.startMs < nextMs)) {
      nextMs = window.startMs;
    }
    if (window.endMs > nowMs && (nextMs === null || window.endMs < nextMs)) {
      nextMs = window.endMs;
    }
  }

  return nextMs;
}

/**
 * Calcula el retraso en ms para el próximo temporizador automático,
 * acotado a maxDelayMs para evitar desbordamiento de setTimeout y compensar suspensión del equipo.
 */
export function computeNextLessonTickDelayMs(
  lessons: Array<Partial<Lesson> | null | undefined>,
  nowMs: number = Date.now(),
  maxDelayMs: number = 60_000
): number | null {
  const nextTransitionMs = getNextLessonTransitionMs(lessons, nowMs);
  if (nextTransitionMs === null) return null;
  const delta = Math.max(0, nextTransitionMs - nowMs);
  return Math.min(delta + 25, maxDelayMs);
}
