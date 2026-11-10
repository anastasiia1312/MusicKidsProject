import type { TeacherRecurringSlot } from '../types/recurringSchedule';
import type { TeacherScheduleException } from '../types/scheduleException';
import type { TeacherAvailability } from '../types/availability';
import type { MonthlyPlan } from '../types/auth';
import type {
  MonthlyOccurrencePreview,
  MonthlyPreviewResult,
  MonthOption,
  OccurrenceStatus,
  TeacherSlotLock,
} from '../types/monthlyBooking';
import {
  hasIntervalOverlap,
  timeToMinutes,
} from './recurringScheduleService';
import {
  isDateCoveredByVacation,
} from './teacherScheduleExceptionService';

const MONTH_NAMES_SPANISH = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DAY_NAMES_SPANISH = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/**
 * Obtiene la fecha y hora actual en la zona horaria oficial: America/Argentina/Buenos_Aires.
 */
export function getBuenosAiresNow(): { dateStr: string; timeStr: string; currentMinutes: number } {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // Formato YYYY-MM-DD

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()); // Formato HH:mm

  return {
    dateStr: dateParts,
    timeStr: timeParts,
    currentMinutes: timeToMinutes(timeParts),
  };
}

/**
 * Devuelve la cantidad exacta de días en un mes y año dados, considerando años bisiestos.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Genera la lista de opciones de meses disponibles para selección a partir del mes actual en Buenos Aires.
 */
export function getAvailableMonthOptions(monthsAhead = 6): MonthOption[] {
  const { dateStr } = getBuenosAiresNow();
  const [yearStr, monthStr] = dateStr.split('-');
  const startYear = parseInt(yearStr, 10);
  const startMonth = parseInt(monthStr, 10);

  const options: MonthOption[] = [];

  for (let i = 0; i < monthsAhead; i++) {
    let year = startYear;
    let month = startMonth + i;

    while (month > 12) {
      month -= 12;
      year += 1;
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const label = `${MONTH_NAMES_SPANISH[month - 1]} ${year}`;
    options.push({
      year,
      month,
      monthKey,
      label,
      isCurrentMonth: i === 0,
    });
  }

  return options;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) al formato completo en español.
 */
export function formatFullDateSpanish(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);
  const dayName = DAY_NAMES_SPANISH[d.getDay()];
  const monthName = MONTH_NAMES_SPANISH[month].toLowerCase();

  return `${dayName} ${day} de ${monthName} de ${year}`;
}

/**
 * Comprueba si dos reglas de horarios recurrentes seleccionadas se superponen entre sí.
 * (Permite reglas en diferentes días o en el mismo día siempre que los intervalos no se solapen).
 */
export function checkSelectedRulesOverlap(rules: TeacherRecurringSlot[]): {
  hasOverlap: boolean;
  overlappingRuleA?: TeacherRecurringSlot;
  overlappingRuleB?: TeacherRecurringSlot;
  message?: string;
} {
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];

      // Mismo día de la semana
      if (a.dayOfWeek === b.dayOfWeek) {
        if (hasIntervalOverlap(a.startTime, a.duration, b.startTime, b.duration)) {
          return {
            hasOverlap: true,
            overlappingRuleA: a,
            overlappingRuleB: b,
            message: `Conflicto entre dos horarios seleccionados del ${DAY_NAMES_SPANISH[a.dayOfWeek]}: ${a.startTime} y ${b.startTime} se superponen.`,
          };
        }
      }
    }
  }

  return { hasOverlap: false };
}

export interface CalculateMonthlyOccurrencesParams {
  year: number;
  month: number; // 1 a 12
  selectedRules: TeacherRecurringSlot[];
  exceptions: TeacherScheduleException[];
  availabilitySlots: TeacherAvailability[];
  targetClassesPerWeek: number; // 1, 2 o 3
  referenceNow?: { dateStr: string; currentMinutes: number; nowDate?: Date };
  activeLocks?: TeacherSlotLock[];
}

/**
 * Calcula todas las ocurrencias mensuales de las reglas recurrentes seleccionadas y
 * evalúa la disponibilidad efectiva de cada clase.
 *
 * Jerarquía de evaluación para cada fecha:
 * 1. 'not_originated': La regla recurrente aún no estaba vigente (fecha anterior a originDate).
 * 2. 'past': Fecha u hora ya transcurrida en Buenos Aires.
 * 3. 'vacation': La fecha coincide con un período de vacaciones del profesor.
 * 4. 'blocked_date': La fecha está bloqueada de forma completa.
 * 5. 'blocked_slot': Esta ocurrencia particular está bloqueada por una excepción.
 * 6. 'occupied': Existe una franja ya reservada en esa fecha/hora.
 * 7. 'available': La clase está 100% disponible.
 */
export function calculateMonthlyOccurrences(
  params: CalculateMonthlyOccurrencesParams
): MonthlyPreviewResult {
  const {
    year,
    month,
    selectedRules,
    exceptions,
    availabilitySlots,
    targetClassesPerWeek,
  } = params;

  const daysInMonth = getDaysInMonth(year, month);
  const nowBA = params.referenceNow || getBuenosAiresNow();
  const todayStr = nowBA.dateStr;
  const currentMinutes = nowBA.currentMinutes;

  const occurrences: MonthlyOccurrencePreview[] = [];

  // Recorrer cada regla recurrente seleccionada
  for (const rule of selectedRules) {
    // Si la regla no está activa, ignorarla
    if (!rule.isActive) continue;

    // Iterar cada día del mes
    for (let day = 1; day <= daysInMonth; day++) {
      // Instanciar localmente para evitar desplazamientos por UTC
      const localDate = new Date(year, month - 1, day);
      const dayOfWeek = localDate.getDay(); // 0: Domingo ... 6: Sábado

      if (dayOfWeek !== rule.dayOfWeek) continue;

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const occurrenceId = `${rule.id}-${dateStr}`;

      let status: OccurrenceStatus = 'available';
      let statusLabel = 'Disponible';
      let conflictReason: string | undefined = undefined;
      let exceptionId: string | undefined = undefined;

      // 1. Comprobar originDate de la regla
      if (rule.originDate && dateStr < rule.originDate) {
        status = 'not_originated';
        statusLabel = 'No vigente';
        conflictReason = `Esta regla recurrente comienza el ${rule.originDate}.`;
      }
      // 2. Comprobar si la fecha y hora ya pasaron
      else if (
        dateStr < todayStr ||
        (dateStr === todayStr && timeToMinutes(rule.startTime) <= currentMinutes)
      ) {
        status = 'past';
        statusLabel = 'Fecha pasada';
        conflictReason = 'Este día u horario ya ha transcurrido.';
      }
      // 3. Comprobar si cae en vacaciones
      else {
        const vacation = isDateCoveredByVacation(dateStr, exceptions);
        if (vacation) {
          status = 'vacation';
          statusLabel = 'Período no disponible';
          conflictReason = `Período no disponible registrado por el profesor (${vacation.reason || 'Receso previo'}).`;
          exceptionId = vacation.id;
        }
        // 4. Comprobar si la fecha completa está bloqueada (blocked_date)
        else {
          const blockedDate = exceptions.find(
            (ex) => ex.type === 'blocked_date' && ex.startDate === dateStr
          );
          if (blockedDate) {
            status = 'blocked_date';
            statusLabel = 'Día bloqueado';
            conflictReason = `Fecha bloqueada en el calendario (${blockedDate.reason || 'Día no disponible'}).`;
            exceptionId = blockedDate.id;
          }
          // 5. Comprobar si la ocurrencia puntual de esta regla está bloqueada (blocked_slot)
          else {
            const blockedSlot = exceptions.find(
              (ex) =>
                ex.type === 'blocked_slot' &&
                ex.startDate === dateStr &&
                (ex.recurringSlotId === rule.id || ex.targetTime === rule.startTime)
            );
            if (blockedSlot) {
              status = 'blocked_slot';
              statusLabel = 'Horario bloqueado';
              conflictReason = `Horario pausado para esta fecha (${blockedSlot.reason || 'Excepción puntual'}).`;
              exceptionId = blockedSlot.id;
            }
            // 6. Comprobar si ya existe una clase o franja ocupada en teacherAvailability
            else {
              const bookedSlot = availabilitySlots.find((slot) => {
                if (slot.date !== dateStr) return false;
                // Si el slot está marcado como booked
                if (slot.status === 'booked') {
                  return hasIntervalOverlap(
                    rule.startTime,
                    rule.duration,
                    slot.startTime,
                    slot.duration
                  );
                }
                return false;
              });

              if (bookedSlot) {
                status = 'occupied';
                statusLabel = 'Ocupada';
                conflictReason = 'Este horario ya se encuentra reservado por otro alumno.';
              } else if (params.activeLocks && params.activeLocks.length > 0) {
                const nowTime = params.referenceNow?.nowDate
                  ? params.referenceNow.nowDate.getTime()
                  : Date.now();

                const activeLock = params.activeLocks.find((lock) => {
                  if (lock.date !== dateStr) return false;
                  // Si el lock expiró (24 horas transcurridas), NO bloquea la disponibilidad
                  if (lock.expiresAt) {
                    const expMs = lock.expiresAt?.toDate
                      ? lock.expiresAt.toDate().getTime()
                      : new Date(lock.expiresAt).getTime();
                    if (nowTime >= expMs) return false;
                  }
                  return hasIntervalOverlap(
                    rule.startTime,
                    rule.duration,
                    lock.startTime,
                    lock.duration || 45
                  );
                });

                if (activeLock) {
                  status = 'occupied';
                  statusLabel = 'Reserva temporal activa';
                  conflictReason =
                    'Este horario se encuentra reservado temporalmente por otro alumno (en espera de transferencia).';
                }
              }
            }
          }
        }
      }

      occurrences.push({
        id: occurrenceId,
        ruleId: rule.id || '',
        date: dateStr,
        dayOfWeek,
        dayName: DAY_NAMES_SPANISH[dayOfWeek],
        formattedDate: formatFullDateSpanish(dateStr),
        startTime: rule.startTime,
        endTime: rule.endTime,
        duration: rule.duration,
        status,
        statusLabel,
        conflictReason,
        exceptionId,
      });
    }
  }

  // Ordenar cronológicamente todas las ocurrencias (primero por fecha ascendente, luego por hora)
  occurrences.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  const totalOccurrences = occurrences.length;
  const availableCount = occurrences.filter((o) => o.status === 'available').length;
  const unavailableCount = totalOccurrences - availableCount;
  const isFullyAvailable = totalOccurrences > 0 && unavailableCount === 0;

  return {
    year,
    month,
    monthLabel: `${MONTH_NAMES_SPANISH[month - 1]} ${year}`,
    targetClassesPerWeek,
    selectedRulesCount: selectedRules.length,
    totalOccurrences,
    availableCount,
    unavailableCount,
    isFullyAvailable,
    occurrences,
  };
}

/**
 * Resultado del cálculo del precio fijo del abono mensual (SUBBLOQUE 6B.2)
 */
export interface FixedMonthlyRateResult {
  frequency: number; // 1, 2 o 3 clases semanales
  planId: 'weekly_1' | 'weekly_2' | 'weekly_3';
  plan: MonthlyPlan | null;
  price: number | null;
  isConfigured: boolean;
  currency: 'ARS';
  formattedPrice: string | null;
}

/**
 * Obtiene la tarifa mensual fija configurada por el profesor para una frecuencia semanal dada.
 *
 * Reglas de negocio (SUBBLOQUE 6B.2):
 * - Frecuencia 1: tarifa fija de 1 clase por semana (plan 'weekly_1').
 * - Frecuencia 2: tarifa fija de 2 clases por semana (plan 'weekly_2').
 * - Frecuencia 3: tarifa fija de 3 clases por semana (plan 'weekly_3').
 * - El precio es mensual y fijo: NO depende de la cantidad real de clases del mes (sean 4 o 5 ocurrencias).
 * - NO se multiplica por la cantidad de clases ni se divide entre cuatro semanas.
 * - NO se aplican recargos por meses con cinco ocurrencias ni descuentos por meses con cuatro.
 * - NO se calculan precios por clase.
 * - Si no está configurada (null, <= 0, inactiva o ausente), retorna isConfigured: false y price: null.
 * - La tarifa de clase individual NO se utiliza como sustituto ni fallback.
 * - No se asume que un valor ausente equivale a cero.
 */
export function getFixedMonthlyRateForFrequency(
  monthlyPlans: MonthlyPlan[] | undefined | null,
  frequency: number
): FixedMonthlyRateResult {
  const planIdMap: Record<number, 'weekly_1' | 'weekly_2' | 'weekly_3'> = {
    1: 'weekly_1',
    2: 'weekly_2',
    3: 'weekly_3',
  };

  const targetPlanId = planIdMap[frequency] || 'weekly_1';

  if (!Array.isArray(monthlyPlans) || monthlyPlans.length === 0) {
    return {
      frequency,
      planId: targetPlanId,
      plan: null,
      price: null,
      isConfigured: false,
      currency: 'ARS',
      formattedPrice: null,
    };
  }

  // Buscar el plan correspondiente por ID o por frecuencia semanal
  const foundPlan =
    monthlyPlans.find(
      (p) => p.id === targetPlanId || p.lessonsPerWeek === frequency
    ) || null;

  if (
    !foundPlan ||
    foundPlan.active !== true ||
    typeof foundPlan.price !== 'number' ||
    isNaN(foundPlan.price) ||
    foundPlan.price <= 0
  ) {
    return {
      frequency,
      planId: targetPlanId,
      plan: foundPlan,
      price: null,
      isConfigured: false,
      currency: 'ARS',
      formattedPrice: null,
    };
  }

  const formattedPrice = `$ ${foundPlan.price.toLocaleString('es-AR')} ARS`;

  return {
    frequency,
    planId: targetPlanId,
    plan: foundPlan,
    price: foundPlan.price,
    isConfigured: true,
    currency: 'ARS',
    formattedPrice,
  };
}

/**
 * Formatea la fecha y hora de vencimiento exacta de la reserva temporal (24 horas)
 * en la zona horaria oficial America/Argentina/Buenos_Aires.
 */
export function formatExpirationBuenosAires(expiresAt: Date | any): string {
  if (!expiresAt) return '';
  const dateObj = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);

  const formattedDate = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);

  const formattedTime = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dateObj);

  return `${formattedDate} a las ${formattedTime} hs`;
}


