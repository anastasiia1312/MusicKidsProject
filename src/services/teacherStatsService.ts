/**
 * Servicio de Estadísticas del Profesor para MusicKids (BLOQUE 7)
 *
 * Principios y reglas de negocio:
 * 1. Respetar zona horaria oficial: America/Argentina/Buenos_Aires.
 * 2. Un abono mensual de $65.000 ARS con 4 clases representa un único ingreso de $65.000 ARS
 *    (no multiplicar por la cantidad de clases ni duplicar abonos y clases).
 * 3. Pagos recibidos: solo abonos confirmados (status === 'confirmed'). Excluir transferencias pendientes.
 * 4. Clases realizadas: solo clases con status === 'completed'. No asumir por fecha pasada.
 * 5. Alumnos activos: contar alumnos únicos en el período sin duplicados.
 * 6. Tasa de asistencia: la plataforma no cuenta con sistema independiente de presentismo;
 *    mostrar "Datos no disponibles" sin inventar valores ficticios.
 */

import type { Lesson } from '../types/lesson';
import type { MonthlyBooking } from '../types/monthlyBooking';
import type { TeacherRecurringSlot } from '../types/recurringSchedule';
import type { UserProfile } from '../types/auth';
import { getTeacherLessons } from './lessonService';
import { getTeacherMonthlyBookings } from './monthlyBookingConfirmationService';
import { getTeacherRecurringSlots } from './recurringScheduleService';
import { getStudents } from './lessonService';

export type StatsPeriodKey =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'custom';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

export interface PeriodWithComparison {
  current: DateRange;
  previous: DateRange;
}

export interface TeacherStatsSummary {
  activeStudentsCount: number;
  activeStudentsDeltaPercent: number | null;
  completedLessonsCount: number;
  completedLessonsDeltaPercent: number | null;
  scheduledLessonsCount: number;
  scheduledLessonsDeltaPercent: number | null;
  confirmedIncomeARS: number;
  confirmedIncomeDeltaPercent: number | null;
}

export interface MonthlyChartDataPoint {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "Nov 2026"
  incomeARS: number;
  completedClasses: number;
  scheduledClasses: number;
  cancelledClasses: number;
  totalClasses: number;
}

export interface ClassDistributionData {
  scheduled: number;
  completed: number;
  cancelled: number;
  inProgress: number;
  total: number;
  scheduledPercent: number;
  completedPercent: number;
  cancelledPercent: number;
}

export interface PerformanceIndicators {
  avgLessonsPerStudent: number;
  occupancyRatePercent: number | null;
  totalAvailableSlots: number;
  totalOccupiedSlots: number;
  activeRecurringSlotsCount: number;
  attendanceRateNote: string;
  previousPeriodComparison: {
    incomeChangePercent: number | null;
    lessonsChangePercent: number | null;
    studentsChangePercent: number | null;
  };
}

export interface TeacherStatsResult {
  periodKey: StatsPeriodKey;
  periodLabel: string;
  startDate: Date;
  endDate: Date;
  summary: TeacherStatsSummary;
  monthlyTrend: MonthlyChartDataPoint[];
  classDistribution: ClassDistributionData;
  performance: PerformanceIndicators;
  hasData: boolean;
}

export interface TeacherStatsRawData {
  lessons: Lesson[];
  monthlyBookings: MonthlyBooking[];
  recurringSlots: TeacherRecurringSlot[];
  students: UserProfile[];
}

const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

/**
 * Obtiene el año y mes actual en la zona horaria America/Argentina/Buenos_Aires
 */
export function getBuenosAiresDateParts(refDate = new Date()): {
  year: number;
  month: number; // 1-12
  day: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.format(refDate).split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
  };
}

/**
 * Genera el rango de fechas actual y previo para un filtro dado
 */
export function calculatePeriodRanges(
  periodKey: StatsPeriodKey,
  customStart?: string,
  customEnd?: string,
  referenceDate = new Date()
): PeriodWithComparison {
  const { year: currentYear, month: currentMonth } = getBuenosAiresDateParts(referenceDate);

  if (periodKey === 'this_month') {
    // Mes actual: 1ro del mes actual al último día del mes
    const startDate = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const endDate = new Date(currentYear, currentMonth - 1, lastDay, 23, 59, 59, 999);

    // Período previo: Mes anterior
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1, 0, 0, 0, 0);
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevEndDate = new Date(prevYear, prevMonth - 1, prevLastDay, 23, 59, 59, 999);

    return {
      current: {
        startDate,
        endDate,
        label: `${MONTH_NAMES_SHORT[currentMonth - 1]} ${currentYear}`,
      },
      previous: {
        startDate: prevStartDate,
        endDate: prevEndDate,
        label: `${MONTH_NAMES_SHORT[prevMonth - 1]} ${prevYear}`,
      },
    };
  }

  if (periodKey === 'last_month') {
    const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = new Date(targetYear, targetMonth - 1, lastDay, 23, 59, 59, 999);

    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1, 0, 0, 0, 0);
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevEndDate = new Date(prevYear, prevMonth - 1, prevLastDay, 23, 59, 59, 999);

    return {
      current: {
        startDate,
        endDate,
        label: `${MONTH_NAMES_SHORT[targetMonth - 1]} ${targetYear}`,
      },
      previous: {
        startDate: prevStartDate,
        endDate: prevEndDate,
        label: `${MONTH_NAMES_SHORT[prevMonth - 1]} ${prevYear}`,
      },
    };
  }

  if (periodKey === 'last_3_months') {
    // Últimos 3 meses (e.g. mes actual y los 2 anteriores)
    const startDate = new Date(currentYear, currentMonth - 3, 1, 0, 0, 0, 0);
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const endDate = new Date(currentYear, currentMonth - 1, lastDay, 23, 59, 59, 999);

    const prevStartDate = new Date(currentYear, currentMonth - 6, 1, 0, 0, 0, 0);
    const prevLastDay = new Date(currentYear, currentMonth - 3, 0).getDate();
    const prevEndDate = new Date(currentYear, currentMonth - 4, prevLastDay, 23, 59, 59, 999);

    return {
      current: {
        startDate,
        endDate,
        label: 'Últimos 3 meses',
      },
      previous: {
        startDate: prevStartDate,
        endDate: prevEndDate,
        label: '3 meses anteriores',
      },
    };
  }

  if (periodKey === 'last_6_months') {
    const startDate = new Date(currentYear, currentMonth - 6, 1, 0, 0, 0, 0);
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const endDate = new Date(currentYear, currentMonth - 1, lastDay, 23, 59, 59, 999);

    const prevStartDate = new Date(currentYear, currentMonth - 12, 1, 0, 0, 0, 0);
    const prevLastDay = new Date(currentYear, currentMonth - 6, 0).getDate();
    const prevEndDate = new Date(currentYear, currentMonth - 7, prevLastDay, 23, 59, 59, 999);

    return {
      current: {
        startDate,
        endDate,
        label: 'Últimos 6 meses',
      },
      previous: {
        startDate: prevStartDate,
        endDate: prevEndDate,
        label: '6 meses anteriores',
      },
    };
  }

  if (periodKey === 'this_year') {
    const startDate = new Date(currentYear, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const prevStartDate = new Date(currentYear - 1, 0, 1, 0, 0, 0, 0);
    const prevEndDate = new Date(currentYear - 1, 11, 31, 23, 59, 59, 999);

    return {
      current: {
        startDate,
        endDate,
        label: `Año ${currentYear}`,
      },
      previous: {
        startDate: prevStartDate,
        endDate: prevEndDate,
        label: `Año ${currentYear - 1}`,
      },
    };
  }

  // Personalizado
  const startParts = (customStart || '').split('-').map((v) => parseInt(v, 10));
  const endParts = (customEnd || '').split('-').map((v) => parseInt(v, 10));

  const validStart =
    startParts.length === 3 && !isNaN(startParts[0])
      ? new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0)
      : new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);

  const validEnd =
    endParts.length === 3 && !isNaN(endParts[0])
      ? new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999)
      : new Date(currentYear, currentMonth - 1, 28, 23, 59, 59, 999);

  const durationMs = Math.max(86400000, validEnd.getTime() - validStart.getTime());
  const prevEndDate = new Date(validStart.getTime() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs);

  return {
    current: {
      startDate: validStart,
      endDate: validEnd,
      label: 'Personalizado',
    },
    previous: {
      startDate: prevStartDate,
      endDate: prevEndDate,
      label: 'Período anterior equivalente',
    },
  };
}

/**
 * Convierte un Timestamp o fecha en objeto Date
 */
export function toSafeDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (typeof val.toMillis === 'function') {
    return new Date(val.toMillis());
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Calcula el porcentaje de variación entre dos valores numéricos.
 * Retorna null si el valor previo fue 0 y no se puede calcular porcentaje razonable.
 */
export function calculateDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const delta = ((current - previous) / previous) * 100;
  return Math.round(delta * 10) / 10;
}

/**
 * Comprueba si una clase cae dentro de un rango de fechas
 */
function isLessonInDateRange(lesson: Lesson, start: Date, end: Date): boolean {
  const d = toSafeDate(lesson.date);
  if (!d) return false;
  const time = d.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

/**
 * Comprueba si un abono mensual confirmado corresponde al rango de fechas.
 * Criterio robusto:
 * 1. Si tiene `confirmedAt`, verifica que su fecha esté en [start, end].
 * 2. Si no tiene `confirmedAt`, verifica si su `month` (YYYY-MM) cae dentro de los meses del rango.
 */
function isBookingInDateRange(booking: MonthlyBooking, start: Date, end: Date): boolean {
  if (booking.confirmedAt) {
    const confDate = toSafeDate(booking.confirmedAt);
    if (confDate) {
      const time = confDate.getTime();
      if (time >= start.getTime() && time <= end.getTime()) {
        return true;
      }
    }
  }

  // Verificar por mes "YYYY-MM" si coincide con los meses cubiertos por el rango
  if (booking.month) {
    const [yStr, mStr] = booking.month.split('-');
    const bYear = parseInt(yStr, 10);
    const bMonth = parseInt(mStr, 10);
    if (!isNaN(bYear) && !isNaN(bMonth)) {
      // Crear fecha representativa del mes del abono (el 15 del mes a mediodía)
      const midMonth = new Date(bYear, bMonth - 1, 15, 12, 0, 0).getTime();
      if (midMonth >= start.getTime() && midMonth <= end.getTime()) {
        return true;
      }
    }
  }

  // Fallback si no hay confirmedAt ni month válido: usar createdAt
  if (booking.createdAt) {
    const createdDate = toSafeDate(booking.createdAt);
    if (createdDate) {
      const time = createdDate.getTime();
      return time >= start.getTime() && time <= end.getTime();
    }
  }

  return false;
}

/**
 * Obtiene la lista ordenada de meses clave ("YYYY-MM") dentro de un rango de fechas
 */
function getMonthKeysInRange(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endLimit = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur.getTime() <= endLimit.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  return keys;
}

/**
 * Calcula todas las estadísticas a partir de datos crudos del profesor
 */
export function calculateTeacherStats(
  rawData: TeacherStatsRawData,
  periodKey: StatsPeriodKey,
  customStart?: string,
  customEnd?: string,
  referenceDate = new Date()
): TeacherStatsResult {
  const { current, previous } = calculatePeriodRanges(
    periodKey,
    customStart,
    customEnd,
    referenceDate
  );

  // 1. Filtrar clases para el período actual y previo
  const currentLessons = rawData.lessons.filter((l) =>
    isLessonInDateRange(l, current.startDate, current.endDate)
  );
  const prevLessons = rawData.lessons.filter((l) =>
    isLessonInDateRange(l, previous.startDate, previous.endDate)
  );

  // 2. Filtrar abonos confirmados para el período actual y previo
  const confirmedBookingsCurrent = rawData.monthlyBookings.filter(
    (b) => b.status === 'confirmed' && isBookingInDateRange(b, current.startDate, current.endDate)
  );
  const confirmedBookingsPrev = rawData.monthlyBookings.filter(
    (b) => b.status === 'confirmed' && isBookingInDateRange(b, previous.startDate, previous.endDate)
  );

  // 3. Cálculos de Ingresos en ARS (ESTRICTAMENTE: cada abono confirmado suma su valor fijo UNA VEZ)
  const currentIncome = confirmedBookingsCurrent.reduce((acc, b) => {
    const val = typeof b.totalPrice === 'number' && !isNaN(b.totalPrice)
      ? b.totalPrice
      : typeof b.price === 'number' && !isNaN(b.price)
      ? b.price
      : 0;
    return acc + val;
  }, 0);

  const prevIncome = confirmedBookingsPrev.reduce((acc, b) => {
    const val = typeof b.totalPrice === 'number' && !isNaN(b.totalPrice)
      ? b.totalPrice
      : typeof b.price === 'number' && !isNaN(b.price)
      ? b.price
      : 0;
    return acc + val;
  }, 0);

  // 4. Clases realizadas y programadas
  const completedLessonsCurrent = currentLessons.filter((l) => l.status === 'completed').length;
  const completedLessonsPrev = prevLessons.filter((l) => l.status === 'completed').length;

  const scheduledLessonsCurrent = currentLessons.filter((l) => l.status === 'scheduled').length;
  const scheduledLessonsPrev = prevLessons.filter((l) => l.status === 'scheduled').length;

  const cancelledLessonsCurrent = currentLessons.filter((l) => l.status === 'cancelled').length;
  const inProgressLessonsCurrent = currentLessons.filter((l) => l.status === 'in_progress').length;

  // 5. Alumnos activos únicos en el período
  const currentStudentIds = new Set<string>();
  // Alumnos que tienen clases no canceladas en el período
  currentLessons.forEach((l) => {
    if (l.status !== 'cancelled' && l.studentId) {
      currentStudentIds.add(l.studentId);
    }
  });
  // Alumnos con abonos confirmados en el período
  confirmedBookingsCurrent.forEach((b) => {
    if (b.studentId) {
      currentStudentIds.add(b.studentId);
    }
  });

  const prevStudentIds = new Set<string>();
  prevLessons.forEach((l) => {
    if (l.status !== 'cancelled' && l.studentId) {
      prevStudentIds.add(l.studentId);
    }
  });
  confirmedBookingsPrev.forEach((b) => {
    if (b.studentId) {
      prevStudentIds.add(b.studentId);
    }
  });

  const activeStudentsCount = currentStudentIds.size;
  const prevActiveStudentsCount = prevStudentIds.size;

  // 6. Tendencia mensual para gráficos (Chart 1 y Chart 2)
  const monthKeys = getMonthKeysInRange(current.startDate, current.endDate);
  // Si el rango es solo 1 mes (ej: this_month o last_month), mostrar al menos los últimos 3 o 4 meses
  // para dar contexto visual enriquecido al profesor, o centrar en los meses correspondientes.
  let chartMonthKeys = monthKeys;
  if (chartMonthKeys.length <= 1) {
    const refYear = current.startDate.getFullYear();
    const refMonth = current.startDate.getMonth();
    chartMonthKeys = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(refYear, refMonth - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      chartMonthKeys.push(`${y}-${m}`);
    }
  }

  const monthlyTrend: MonthlyChartDataPoint[] = chartMonthKeys.map((mk) => {
    const [yStr, mStr] = mk.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const mStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const mEnd = new Date(y, m, 0, 23, 59, 59, 999);

    // Ingresos del mes por abonos confirmados
    const monthBookings = rawData.monthlyBookings.filter(
      (b) => b.status === 'confirmed' && isBookingInDateRange(b, mStart, mEnd)
    );
    const mIncome = monthBookings.reduce((acc, b) => {
      const val = typeof b.totalPrice === 'number' && !isNaN(b.totalPrice)
        ? b.totalPrice
        : typeof b.price === 'number' && !isNaN(b.price)
        ? b.price
        : 0;
      return acc + val;
    }, 0);

    // Clases del mes
    const monthLessons = rawData.lessons.filter((l) => isLessonInDateRange(l, mStart, mEnd));
    const completed = monthLessons.filter((l) => l.status === 'completed').length;
    const scheduled = monthLessons.filter((l) => l.status === 'scheduled').length;
    const cancelled = monthLessons.filter((l) => l.status === 'cancelled').length;

    return {
      monthKey: mk,
      monthLabel: `${MONTH_NAMES_SHORT[m - 1]} ${y}`,
      incomeARS: mIncome,
      completedClasses: completed,
      scheduledClasses: scheduled,
      cancelledClasses: cancelled,
      totalClasses: monthLessons.length,
    };
  });

  // 7. Distribución de clases (Chart 3)
  const totalClasses = currentLessons.length;
  const classDistribution: ClassDistributionData = {
    scheduled: scheduledLessonsCurrent,
    completed: completedLessonsCurrent,
    cancelled: cancelledLessonsCurrent,
    inProgress: inProgressLessonsCurrent,
    total: totalClasses,
    scheduledPercent: totalClasses > 0 ? Math.round((scheduledLessonsCurrent / totalClasses) * 100) : 0,
    completedPercent: totalClasses > 0 ? Math.round((completedLessonsCurrent / totalClasses) * 100) : 0,
    cancelledPercent: totalClasses > 0 ? Math.round((cancelledLessonsCurrent / totalClasses) * 100) : 0,
  };

  // 8. Indicadores de Desempeño
  // Promedio de clases por alumno (realizadas + programadas en el período / alumnos activos)
  const totalRelevantClasses = completedLessonsCurrent + scheduledLessonsCurrent;
  const avgLessonsPerStudent =
    activeStudentsCount > 0
      ? Math.round((totalRelevantClasses / activeStudentsCount) * 10) / 10
      : 0;

  // Ocupación de horarios disponibles:
  // Capacidad = slots recurrentes activos * semanas en el período
  const activeSlots = rawData.recurringSlots.filter((s) => s.isActive !== false);
  const periodDays = Math.max(
    1,
    Math.round((current.endDate.getTime() - current.startDate.getTime()) / 86400000)
  );
  const weeksInPeriod = Math.max(1, Math.round(periodDays / 7));
  const totalAvailableSlots = activeSlots.length * weeksInPeriod;
  const totalOccupiedSlots = completedLessonsCurrent + scheduledLessonsCurrent;

  const occupancyRatePercent =
    totalAvailableSlots > 0
      ? Math.min(100, Math.round((totalOccupiedSlots / totalAvailableSlots) * 100))
      : null;

  const previousPeriodComparison = {
    incomeChangePercent: calculateDeltaPercent(currentIncome, prevIncome),
    lessonsChangePercent: calculateDeltaPercent(
      completedLessonsCurrent + scheduledLessonsCurrent,
      completedLessonsPrev + scheduledLessonsPrev
    ),
    studentsChangePercent: calculateDeltaPercent(activeStudentsCount, prevActiveStudentsCount),
  };

  const performance: PerformanceIndicators = {
    avgLessonsPerStudent,
    occupancyRatePercent,
    totalAvailableSlots,
    totalOccupiedSlots,
    activeRecurringSlotsCount: activeSlots.length,
    attendanceRateNote: 'Datos no disponibles (se requiere registro explícito de presentismo)',
    previousPeriodComparison,
  };

  const summary: TeacherStatsSummary = {
    activeStudentsCount,
    activeStudentsDeltaPercent: previousPeriodComparison.studentsChangePercent,
    completedLessonsCount: completedLessonsCurrent,
    completedLessonsDeltaPercent: calculateDeltaPercent(
      completedLessonsCurrent,
      completedLessonsPrev
    ),
    scheduledLessonsCount: scheduledLessonsCurrent,
    scheduledLessonsDeltaPercent: calculateDeltaPercent(
      scheduledLessonsCurrent,
      scheduledLessonsPrev
    ),
    confirmedIncomeARS: currentIncome,
    confirmedIncomeDeltaPercent: previousPeriodComparison.incomeChangePercent,
  };

  const hasData =
    rawData.lessons.length > 0 ||
    rawData.monthlyBookings.length > 0 ||
    rawData.recurringSlots.length > 0;

  return {
    periodKey,
    periodLabel: current.label,
    startDate: current.startDate,
    endDate: current.endDate,
    summary,
    monthlyTrend,
    classDistribution,
    performance,
    hasData,
  };
}

/**
 * Consulta y recupera todos los datos necesarios para las estadísticas del profesor
 */
export async function fetchTeacherStatsData(teacherId: string): Promise<TeacherStatsRawData> {
  if (!teacherId) {
    return {
      lessons: [],
      monthlyBookings: [],
      recurringSlots: [],
      students: [],
    };
  }

  // 1. Obtener clases del profesor
  let lessons: Lesson[] = [];
  try {
    lessons = await getTeacherLessons(teacherId);
  } catch (err) {
    console.warn('Aviso al recuperar clases para estadísticas:', err);
  }

  // 2. Obtener abonos mensuales del profesor (aprovechando fallback de lessons si fuera necesario)
  let monthlyBookings: MonthlyBooking[] = [];
  try {
    monthlyBookings = await getTeacherMonthlyBookings(teacherId, lessons);
  } catch (err) {
    console.warn('Aviso al recuperar abonos para estadísticas:', err);
  }

  // 3. Obtener slots recurrentes del profesor
  let recurringSlots: TeacherRecurringSlot[] = [];
  try {
    recurringSlots = await getTeacherRecurringSlots(teacherId, false);
  } catch (err) {
    console.warn('Aviso al recuperar slots recurrentes para estadísticas:', err);
  }

  // 4. Obtener alumnos
  let students: UserProfile[] = [];
  try {
    students = await getStudents();
  } catch (err) {
    console.warn('Aviso al recuperar lista de alumnos para estadísticas:', err);
  }

  return {
    lessons,
    monthlyBookings,
    recurringSlots,
    students,
  };
}
