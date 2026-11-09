import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Loader2,
  Check,
  AlertCircle,
  PlusCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  X,
  Repeat,
  ShieldAlert,
  CalendarOff,
  RotateCcw,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getTeacherAvailability,
  updateTeacherAvailability,
  deleteTeacherAvailability,
  checkAvailabilityOverlap,
} from '../../services/availabilityService';
import {
  createRecurringSlot,
  getTeacherRecurringSlots,
  updateRecurringSlot,
  deleteRecurringSlot,
  getLocalDateDayOfWeek,
  checkRecurringSlotOverlap,
} from '../../services/recurringScheduleService';
import {
  createScheduleException,
  getTeacherScheduleExceptions,
  deleteScheduleException,
  checkConflictingBookedLessons,
  isDateCoveredByVacation,
  isDateBlocked,
  isSlotBlocked,
  checkPunctualSlotExceptionConflict,
} from '../../services/teacherScheduleExceptionService';
import { getTeacherLessons } from '../../services/lessonService';
import { getOrCreateTeacherPermanentMeetSpace } from '../../services/permanentMeetService';
import type {
  AvailabilityDuration,
  TeacherAvailability as TeacherAvailabilityType,
} from '../../types/availability';
import type {
  TeacherRecurringSlot,
  RecurringSlotDuration,
} from '../../types/recurringSchedule';
import type { TeacherScheduleException } from '../../types/scheduleException';
import { LESSON_DURATION_MINUTES, type Lesson } from '../../types/lesson';
import { TeacherClassesTabs } from '../../components/teacher/TeacherClassesTabs';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';
import { AvailabilitySlotCard } from '../../components/teacher/AvailabilitySlotCard';
import { AvailabilityDetailsModal } from '../../components/teacher/AvailabilityDetailsModal';
import { DayExceptionDetailsModal } from '../../components/teacher/DayExceptionDetailsModal';

interface TeacherAvailabilityProps {
  onNavigate: (path: string) => void;
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DAY_NAMES_BY_INDEX = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/**
 * Representación unificada en memoria para un horario dentro de un día del calendario.
 */
export interface DisplayCalendarSlot {
  id: string;
  sourceType: 'recurring' | 'legacy';
  recurringSlot?: TeacherRecurringSlot;
  legacySlot?: TeacherAvailabilityType;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  duration: AvailabilityDuration;
  status: 'available' | 'booked' | 'blocked';
  meetUrl?: string;
  bookedLesson?: Lesson;
  bookedLessonTitle?: string;
  bookedStudentName?: string;
  bookedStudentEmail?: string;
  blockedReason?: string;
  exceptionId?: string;
}

/**
 * Obtiene el Lunes correspondiente a la semana de una fecha dada, en hora local.
 */
export const getMondayOfWeek = (d: Date): Date => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sábado
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Formatea una fecha a string ISO local "YYYY-MM-DD" sin desfases UTC.
 */
export const formatDateToLocalISO = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formatea el rango de la semana para la cabecera del calendario.
 * Ejemplo: "7 de septiembre - 13 de septiembre, 2026"
 */
export const formatWeekRangeLabel = (monday: Date, sunday: Date): string => {
  const startDay = monday.getDate();
  const startMonth = MONTH_NAMES[monday.getMonth()];
  const startYear = monday.getFullYear();

  const endDay = sunday.getDate();
  const endMonth = MONTH_NAMES[sunday.getMonth()];
  const endYear = sunday.getFullYear();

  if (startYear !== endYear) {
    return `${startDay} de ${startMonth}, ${startYear} - ${endDay} de ${endMonth}, ${endYear}`;
  }
  return `${startDay} de ${startMonth} - ${endDay} de ${endMonth}, ${startYear}`;
};

export const TeacherAvailability: React.FC<TeacherAvailabilityProps> = ({ onNavigate }) => {
  const { user, role } = useAuth();

  // Estados del calendario semanal
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [availabilitySlots, setAvailabilitySlots] = useState<TeacherAvailabilityType[]>([]);
  const [recurringSlots, setRecurringSlots] = useState<TeacherRecurringSlot[]>([]);
  const [teacherLessons, setTeacherLessons] = useState<Lesson[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Detección de disponibilidad de reglas de seguridad Firestore para 'teacherRecurringSlots'
  const [recurringRulesPending, setRecurringRulesPending] = useState<boolean>(false);
  // Detección de disponibilidad de reglas de seguridad Firestore para 'teacherScheduleExceptions'
  const [exceptionsRulesPending, setExceptionsRulesPending] = useState<boolean>(false);

  // Estados de Excepciones y Bloqueos (Subbloque 3)
  const [exceptions, setExceptions] = useState<TeacherScheduleException[]>([]);
  const [showExceptionsPanel, setShowExceptionsPanel] = useState<boolean>(false);

  // Modal para Bloquear Ocurrencia Puntual de Horario o Día Completo
  const [blockingTarget, setBlockingTarget] = useState<{
    type: 'blocked_slot' | 'blocked_date';
    date: string;
    recurringSlotId?: string;
    startTime?: string;
    duration?: number;
    title?: string;
  } | null>(null);
  const [blockingReason, setBlockingReason] = useState<string>('');
  const [isSavingBlock, setIsSavingBlock] = useState<boolean>(false);
  const [blockingErrorMessage, setBlockingErrorMessage] = useState<string | null>(null);

  // Modal de Advertencia de Conflicto con Clases Reservadas Existentes (Protección de Clases)
  const [conflictingLessonsState, setConflictingLessonsState] = useState<{
    lessons: Lesson[];
    actionDescription: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Estados para el sistema de dos niveles (UX/UI: Tarjeta compacta + Modal de detalles)
  const [selectedSlotForDetails, setSelectedSlotForDetails] = useState<DisplayCalendarSlot | null>(null);
  const [selectedDayException, setSelectedDayException] = useState<{
    exception: TeacherScheduleException | null;
    dateStr: string;
    dayName?: string;
    slotsCount?: number;
  } | null>(null);

  // Estados del formulario de creación (Horarios semanales recurrentes)
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [duration, setDuration] = useState<AvailabilityDuration>(LESSON_DURATION_MINUTES as AvailabilityDuration);

  // Estados de control de envío y mensajes
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados para Edición
  const [editingSlot, setEditingSlot] = useState<DisplayCalendarSlot | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editDuration, setEditDuration] = useState<AvailabilityDuration>(LESSON_DURATION_MINUTES as AvailabilityDuration);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);

  // Estados para Eliminación
  const [slotToDelete, setSlotToDelete] = useState<DisplayCalendarSlot | null>(null);
  const [isDeletingSlot, setIsDeletingSlot] = useState<boolean>(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Obtener fecha mínima permitida en formato local (hoy: YYYY-MM-DD)
  const getTodayLocalString = (): string => {
    return formatDateToLocalISO(new Date());
  };

  // Carga integral de datos: disponibilidad puntual, reglas recurrentes, clases y excepciones
  const loadAvailability = useCallback(async () => {
    if (!user?.uid) return;

    try {
      setIsLoadingSlots(true);
      setCalendarError(null);

      // 1. Cargar horarios puntuales existentes
      const legacySlotsPromise = getTeacherAvailability(user.uid).catch((err) => {
        console.warn('Advertencia al consultar teacherAvailability:', err);
        return [] as TeacherAvailabilityType[];
      });

      // 2. Cargar clases reservadas del profesor para validar solapamientos
      const lessonsPromise = getTeacherLessons(user.uid).catch((err) => {
        console.warn('Advertencia al consultar lessons del profesor:', err);
        return [] as Lesson[];
      });

      // 3. Cargar reglas recurrentes permanentes
      let recurringRulesFetched: TeacherRecurringSlot[] = [];
      let rulesPendingFlag = false;

      try {
        recurringRulesFetched = await getTeacherRecurringSlots(user.uid, true);
        rulesPendingFlag = false;
      } catch (recErr: any) {
        const errStr = recErr?.message || String(recErr);
        if (
          errStr.includes('permission-denied') ||
          errStr.includes('insufficient permissions') ||
          errStr.includes('Missing or insufficient')
        ) {
          rulesPendingFlag = true;
          console.info('Reglas de teacherRecurringSlots no detectadas en Firestore aún.');
        } else {
          console.error('Error al consultar teacherRecurringSlots:', recErr);
        }
      }

      // 4. Cargar excepciones de disponibilidad y vacaciones
      let exceptionsFetched: TeacherScheduleException[] = [];
      let excPendingFlag = false;

      try {
        exceptionsFetched = await getTeacherScheduleExceptions(user.uid);
      } catch (excErr: any) {
        const errStr = excErr?.message || String(excErr);
        if (
          excErr?.isRulesPending ||
          errStr.includes('permission-denied') ||
          errStr.includes('insufficient permissions') ||
          errStr.includes('Missing or insufficient')
        ) {
          excPendingFlag = true;
          console.info('Reglas de teacherScheduleExceptions no detectadas en Firestore aún.');
        } else {
          console.error('Error al consultar teacherScheduleExceptions:', excErr);
        }
      }

      const [legacySlots, lessons] = await Promise.all([legacySlotsPromise, lessonsPromise]);

      setAvailabilitySlots(legacySlots);
      setTeacherLessons(lessons);
      setRecurringSlots(recurringRulesFetched);
      setRecurringRulesPending(rulesPendingFlag);
      setExceptions(exceptionsFetched);
      setExceptionsRulesPending(excPendingFlag);
    } catch (err: any) {
      console.error('Error al cargar disponibilidad:', err);
      const errString = err?.message || String(err);
      if (errString.includes('permission-denied') || errString.includes('insufficient permissions')) {
        setCalendarError(
          'Permiso denegado en Firestore: No se pudieron leer los horarios de disponibilidad.'
        );
      } else {
        setCalendarError('No se pudieron cargar los horarios en este momento.');
      }
    } finally {
      setIsLoadingSlots(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Manejadores de navegación semanal
  const handlePrevWeek = () => {
    setCurrentMonday((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7);
      return getMondayOfWeek(d);
    });
  };

  const handleNextWeek = () => {
    setCurrentMonday((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7);
      return getMondayOfWeek(d);
    });
  };

  const handleToday = () => {
    setCurrentMonday(getMondayOfWeek(new Date()));
  };

  // Manejadores del formulario de creación
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartTime(e.target.value);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };


  // Día de la semana calculado para previsualización dinámica en el formulario
  const selectedDayInfo = useMemo(() => {
    if (!date) return null;
    try {
      const dayIdx = getLocalDateDayOfWeek(date);
      return {
        dayIdx,
        dayName: DAY_NAMES_BY_INDEX[dayIdx],
      };
    } catch {
      return null;
    }
  }, [date]);

  // Envío del formulario de creación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    // Validación de sesión y rol
    if (!user?.uid || role !== 'teacher') {
      setErrorMessage('No tenés permisos para realizar esta acción o tu sesión expiró.');
      return;
    }

    // 1. Fecha obligatoria
    const trimmedDate = date.trim();
    if (!trimmedDate) {
      setErrorMessage('La fecha es obligatoria. Por favor, seleccioná una fecha.');
      return;
    }

    // 2. Hora obligatoria
    const trimmedTime = startTime.trim();
    if (!trimmedTime) {
      setErrorMessage('La hora de inicio es obligatoria. Por favor, seleccioná una hora.');
      return;
    }

    // 3. Duración obligatoria fija (45 minutos)
    const slotDuration = LESSON_DURATION_MINUTES as AvailabilityDuration;

    // Parseo de fecha y hora para comprobaciones temporales
    const dateParts = trimmedDate.split('-');
    const timeParts = trimmedTime.split(':');

    if (dateParts.length !== 3 || timeParts.length !== 2) {
      setErrorMessage('El formato de fecha u hora es inválido.');
      return;
    }

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      setErrorMessage('La fecha u hora ingresada contiene valores no válidos.');
      return;
    }

    // 4. No permitir fechas anteriores al día actual
    const selectedDay = new Date(year, month, day, 0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDay.getTime() < today.getTime()) {
      setErrorMessage('No podés seleccionar una fecha anterior al día actual.');
      return;
    }

    // 5. No permitir crear un horario cuya fecha/hora ya haya pasado
    const selectedDateTime = new Date(year, month, day, hours, minutes, 0, 0);
    const now = new Date();

    if (selectedDateTime.getTime() <= now.getTime()) {
      setErrorMessage('No podés crear un horario cuya fecha y hora ya hayan pasado.');
      return;
    }

    // Iniciar proceso de guardado
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Verificación de reglas de seguridad: si están pendientes, no permitir escritura destructiva
      if (recurringRulesPending) {
        setErrorMessage(
          'Las reglas de seguridad de Firestore para "teacherRecurringSlots" aún no están desplegadas en Firebase Console. La creación de horarios recurrentes está pausada para proteger tus datos.'
        );
        setIsSubmitting(false);
        return;
      }

      const dayOfWeek = getLocalDateDayOfWeek(trimmedDate);

      // Validar solapamiento con reglas recurrentes existentes
      const overlapResult = await checkRecurringSlotOverlap(
        user.uid,
        dayOfWeek,
        trimmedTime,
        slotDuration
      );

      if (overlapResult.isDuplicate) {
        setErrorMessage(
          `Ya existe un horario recurrente idéntico configurado para los ${DAY_NAMES_BY_INDEX[dayOfWeek]} a las ${trimmedTime}.`
        );
        setIsSubmitting(false);
        return;
      }

      if (overlapResult.hasOverlap) {
        setErrorMessage(
          `Este horario se solapa con otro horario recurrente de los ${DAY_NAMES_BY_INDEX[dayOfWeek]} (${overlapResult.conflictingSlot?.startTime} - ${overlapResult.conflictingSlot?.endTime}).`
        );
        setIsSubmitting(false);
        return;
      }

      // Crear la regla en teacherRecurringSlots (sin crear Meet prematuro, respetando el diseño)
      await createRecurringSlot({
        teacherId: user.uid,
        dayOfWeek,
        startTime: trimmedTime,
        duration: slotDuration as RecurringSlotDuration,
        originDate: trimmedDate,
        isActive: true,
      });

      setSuccessMessage(
        `Horario semanal recurrente configurado con éxito. Se repetirá todos los ${DAY_NAMES_BY_INDEX[dayOfWeek]} a partir del ${trimmedDate}.`
      );

      // Limpiar formulario y navegar a la semana del horario creado
      setDate('');
      setStartTime('');
      setDuration(LESSON_DURATION_MINUTES as AvailabilityDuration);

      const slotMonday = getMondayOfWeek(selectedDay);
      setCurrentMonday(slotMonday);

      // Recargar disponibilidad
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al publicar horario:', err);
      const errString = err?.message || String(err);
      if (errString.includes('permission-denied') || errString.includes('insufficient permissions')) {
        setErrorMessage(
          'Permiso denegado en Firestore: Verificá que las reglas de seguridad estén actualizadas en Firebase Console.'
        );
      } else {
        setErrorMessage(
          err?.message || 'Ocurrió un error al guardar el horario. Por favor, intentá nuevamente.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejadores para Edición
  const handleOpenEdit = (slot: DisplayCalendarSlot) => {
    setEditingSlot(slot);
    setEditDate(slot.date);
    setEditStartTime(slot.startTime);
    setEditDuration(LESSON_DURATION_MINUTES as AvailabilityDuration);
    setEditErrorMessage(null);
  };

  const handleCloseEdit = () => {
    if (isSavingEdit) return;
    setEditingSlot(null);
    setEditErrorMessage(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingSlot || isSavingEdit) return;
    if (!user?.uid || role !== 'teacher') {
      setEditErrorMessage('No tenés permisos para realizar esta acción o tu sesión expiró.');
      return;
    }

    const trimmedTime = editStartTime.trim();
    if (!trimmedTime) {
      setEditErrorMessage('La hora de inicio es obligatoria.');
      return;
    }

    const finalEditDuration = LESSON_DURATION_MINUTES as AvailabilityDuration;

    setIsSavingEdit(true);
    setEditErrorMessage(null);

    try {
      if (editingSlot.sourceType === 'recurring' && editingSlot.recurringSlot?.id) {
        // Edición de regla semanal recurrente completa
        await updateRecurringSlot(editingSlot.recurringSlot.id, {
          startTime: trimmedTime,
          duration: finalEditDuration as RecurringSlotDuration,
        });

        setSuccessMessage('Regla recurrente semanal actualizada correctamente.');
      } else if (editingSlot.sourceType === 'legacy' && editingSlot.legacySlot?.id) {
        // Edición de horario puntual existente
        const trimmedDate = editDate.trim();
        if (!trimmedDate) {
          setEditErrorMessage('La fecha es obligatoria.');
          setIsSavingEdit(false);
          return;
        }

        // Validación contra excepciones y vacaciones del profesor (Subbloque 5)
        const exceptionConflict = checkPunctualSlotExceptionConflict({
          date: trimmedDate,
          startTime: trimmedTime,
          duration: finalEditDuration,
          exceptions,
          recurringSlots,
        });

        if (exceptionConflict.hasConflict) {
          setEditErrorMessage(
            exceptionConflict.errorMessage || 'No se puede actualizar el horario debido a una excepción en el calendario.'
          );
          setIsSavingEdit(false);
          return;
        }

        const hasOverlap = await checkAvailabilityOverlap(
          user.uid,
          trimmedDate,
          trimmedTime,
          finalEditDuration,
          editingSlot.legacySlot.id
        );

        if (hasOverlap) {
          setEditErrorMessage('Este horario se superpone con otro horario disponible.');
          setIsSavingEdit(false);
          return;
        }

        await updateTeacherAvailability(editingSlot.legacySlot.id, {
          date: trimmedDate,
          startTime: trimmedTime,
          duration: finalEditDuration,
        });

        setSuccessMessage('Horario puntual actualizado correctamente.');
      }

      setEditingSlot(null);
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al actualizar horario:', err);
      setEditErrorMessage(err?.message || 'Ocurrió un error al actualizar el horario.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Manejadores para Eliminación
  const handleOpenDelete = (slot: DisplayCalendarSlot) => {
    setSlotToDelete(slot);
    setDeleteErrorMessage(null);
  };

  const handleCloseDelete = () => {
    if (isDeletingSlot) return;
    setSlotToDelete(null);
    setDeleteErrorMessage(null);
  };

  const handleConfirmDelete = async () => {
    if (!slotToDelete || isDeletingSlot) return;
    if (!user?.uid || role !== 'teacher') return;

    setIsDeletingSlot(true);
    setDeleteErrorMessage(null);

    try {
      if (slotToDelete.sourceType === 'recurring' && slotToDelete.recurringSlot?.id) {
        // Eliminación segura de la regla semanal completa (Subbloque 2)
        await deleteRecurringSlot(slotToDelete.recurringSlot.id);
        setSuccessMessage('Regla semanal recurrente eliminada correctamente para todas las semanas.');
      } else if (slotToDelete.sourceType === 'legacy' && slotToDelete.legacySlot?.id) {
        // Eliminación del horario puntual
        await deleteTeacherAvailability(slotToDelete.legacySlot.id);
        setSuccessMessage('Horario puntual eliminado correctamente.');
      }

      setSlotToDelete(null);
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al eliminar horario:', err);
      setDeleteErrorMessage(err?.message || 'Ocurrió un error al eliminar el horario.');
    } finally {
      setIsDeletingSlot(false);
    }
  };

  // --- MANEJADORES DE EXCEPCIONES Y VACACIONES (SUBBLOQUE 3) ---

  // 1. Abrir modal para bloquear un horario puntual o un día completo
  const handleOpenBlockSlot = (slot: DisplayCalendarSlot) => {
    if (!slot.recurringSlot?.id) return;
    setBlockingTarget({
      type: 'blocked_slot',
      date: slot.date,
      recurringSlotId: slot.recurringSlot.id,
      startTime: slot.startTime,
      duration: slot.duration,
      title: `Horario ${slot.startTime} (${slot.date})`,
    });
    setBlockingReason('');
    setBlockingErrorMessage(null);
  };

  const handleOpenBlockDate = (dateStr: string) => {
    setBlockingTarget({
      type: 'blocked_date',
      date: dateStr,
      title: `Fecha completa (${dateStr})`,
    });
    setBlockingReason('');
    setBlockingErrorMessage(null);
  };

  const handleCloseBlockModal = () => {
    if (isSavingBlock) return;
    setBlockingTarget(null);
    setBlockingReason('');
    setBlockingErrorMessage(null);
  };

  // Ejecución segura de la creación de excepción tras verificar clases
  const executeBlockCreation = async (
    target: {
      type: 'blocked_slot' | 'blocked_date';
      date: string;
      recurringSlotId?: string;
      startTime?: string;
      duration?: number;
    },
    reason: string
  ) => {
    if (!user?.uid) return;
    setIsSavingBlock(true);
    setBlockingErrorMessage(null);

    try {
      if (target.type === 'blocked_slot') {
        await createScheduleException({
          teacherId: user.uid,
          type: 'blocked_slot',
          startDate: target.date,
          endDate: target.date,
          recurringSlotId: target.recurringSlotId,
          targetTime: target.startTime,
          reason: reason.trim() || 'Bloqueo puntual de horario',
        });
        setSuccessMessage(
          `Horario bloqueado únicamente para el ${target.date}. La regla semanal continúa activa para el resto de las semanas.`
        );
      } else {
        await createScheduleException({
          teacherId: user.uid,
          type: 'blocked_date',
          startDate: target.date,
          endDate: target.date,
          reason: reason.trim() || 'Día no disponible',
        });
        setSuccessMessage(`Fecha ${target.date} bloqueada correctamente.`);
      }

      setBlockingTarget(null);
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al bloquear:', err);
      setBlockingErrorMessage(err?.message || 'Ocurrió un error al registrar el bloqueo.');
    } finally {
      setIsSavingBlock(false);
    }
  };

  // Envío del formulario de bloqueo (con verificación preventiva de clases reservadas)
  const handleConfirmBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockingTarget || isSavingBlock || !user?.uid) return;

    try {
      // Comprobar si hay clases ya reservadas en este día/horario
      const conflictingLessons = await checkConflictingBookedLessons(
        user.uid,
        blockingTarget.date,
        blockingTarget.date,
        blockingTarget.type === 'blocked_slot' ? blockingTarget.startTime : undefined
      );

      if (conflictingLessons.length > 0) {
        // Mostrar modal de advertencia de clases existentes (garantiza que NUNCA se cancelen)
        const targetCopy = { ...blockingTarget };
        const reasonCopy = blockingReason;
        setBlockingTarget(null);

        setConflictingLessonsState({
          lessons: conflictingLessons,
          actionDescription:
            targetCopy.type === 'blocked_slot'
              ? `el bloqueo del horario de las ${targetCopy.startTime} del ${targetCopy.date}`
              : `el bloqueo de la fecha completa ${targetCopy.date}`,
          onConfirm: async () => {
            await executeBlockCreation(targetCopy, reasonCopy);
          },
        });
        return;
      }

      await executeBlockCreation(blockingTarget, blockingReason);
    } catch (err: any) {
      setBlockingErrorMessage(err?.message || 'Error al verificar clases reservadas.');
    }
  };

  // 2. Restablecer Disponibilidad (Eliminar Excepción o Bloqueo)
  const handleRestoreException = async (exceptionId: string) => {
    if (!exceptionId || !user?.uid) return;
    try {
      await deleteScheduleException(exceptionId, user.uid);
      setSuccessMessage('Disponibilidad restablecida correctamente.');
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al restablecer disponibilidad:', err);
      setErrorMessage(err?.message || 'No se pudo restablecer la disponibilidad.');
    }
  };

  const minDateString = getTodayLocalString();

  // Cálculos de la semana actual visible
  const currentSunday = new Date(
    currentMonday.getFullYear(),
    currentMonday.getMonth(),
    currentMonday.getDate() + 6
  );

  const mondayStr = formatDateToLocalISO(currentMonday);
  const sundayStr = formatDateToLocalISO(currentSunday);
  const todayStr = getTodayLocalString();

  // PROYECCIÓN EN MEMORIA DE HORARIOS PARA LA SEMANA VISIBLE
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const shortNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const dayDate = new Date(
      currentMonday.getFullYear(),
      currentMonday.getMonth(),
      currentMonday.getDate() + i
    );
    const dateStr = formatDateToLocalISO(dayDate);
    const dayOfWeek = dayDate.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sábado

    // Detección de vacaciones o día bloqueado para esta fecha
    const vacationForDay = isDateCoveredByVacation(dateStr, exceptions);
    const blockedDateForDay = exceptions.find(
      (ex) => ex.type === 'blocked_date' && ex.startDate === dateStr
    );
    const isDayFullyBlocked = Boolean(vacationForDay || blockedDateForDay);

    const daySlots: DisplayCalendarSlot[] = [];

    // 1. Agregar horarios puntuales de 'teacherAvailability' para este día específico
    const legacyForDay = availabilitySlots.filter((s) => s.date === dateStr);
    legacyForDay.forEach((leg) => {
      // Las clases reservadas se muestran SIEMPRE, incluso si el día está bloqueado o en vacaciones
      if (leg.status === 'booked') {
        const matchingLegacyLesson = teacherLessons.find((lesson) => {
          if (lesson.status === 'cancelled') return false;
          if (leg.lessonId && lesson.id === leg.lessonId) return true;
          if (!lesson.date) return false;
          const lDate = lesson.date?.toDate ? lesson.date.toDate() : new Date(lesson.date as any);
          if (isNaN(lDate.getTime())) return false;
          const lDateStr = formatDateToLocalISO(lDate);
          if (lDateStr !== dateStr) return false;
          const lHours = String(lDate.getHours()).padStart(2, '0');
          const lMins = String(lDate.getMinutes()).padStart(2, '0');
          return `${lHours}:${lMins}` === leg.startTime;
        });

        daySlots.push({
          id: leg.id || `legacy-${leg.date}-${leg.startTime}`,
          sourceType: 'legacy',
          legacySlot: leg,
          date: leg.date,
          startTime: leg.startTime,
          duration: leg.duration,
          status: 'booked',
          meetUrl: leg.meetUrl || matchingLegacyLesson?.meetUrl,
          bookedLesson: matchingLegacyLesson,
          bookedLessonTitle: matchingLegacyLesson?.title,
          bookedStudentName: matchingLegacyLesson?.studentName,
          bookedStudentEmail: matchingLegacyLesson?.studentEmail,
        });
      } else if (!isDayFullyBlocked) {
        // Horario puntual disponible (se muestra solo si la fecha no está bloqueada ni en vacaciones)
        daySlots.push({
          id: leg.id || `legacy-${leg.date}-${leg.startTime}`,
          sourceType: 'legacy',
          legacySlot: leg,
          date: leg.date,
          startTime: leg.startTime,
          duration: leg.duration,
          status: 'available',
          meetUrl: leg.meetUrl,
        });
      }
    });

    // 2. Proyectar horarios recurrentes de 'teacherRecurringSlots'
    recurringSlots.forEach((rec) => {
      // Regla inactiva: no proyectar
      if (!rec.isActive) return;

      // El día de la semana debe coincidir
      if (rec.dayOfWeek !== dayOfWeek) return;

      // NUNCA proyectar en fechas anteriores a la fecha de origen (originDate)
      if (dateStr < rec.originDate) return;

      // Si ya existe un horario puntual en esta fecha y hora, no duplicar la tarjeta
      const alreadyHasLegacyAtSameTime = daySlots.some(
        (s) => s.sourceType === 'legacy' && s.startTime === rec.startTime
      );
      if (alreadyHasLegacyAtSameTime) {
        return;
      }

      // Comprobar si coincide con una clase reservada en esta fecha específica
      const overlappingLesson = teacherLessons.find((lesson) => {
        if (lesson.status === 'cancelled') return false;
        if (!lesson.date) return false;

        const lDate = lesson.date?.toDate ? lesson.date.toDate() : new Date(lesson.date as any);
        if (isNaN(lDate.getTime())) return false;

        const lDateStr = formatDateToLocalISO(lDate);
        if (lDateStr !== dateStr) return false;

        const lHours = String(lDate.getHours()).padStart(2, '0');
        const lMins = String(lDate.getMinutes()).padStart(2, '0');
        const lStartTime = `${lHours}:${lMins}`;

        return lStartTime === rec.startTime;
      });

      // Si hay clase reservada, SIEMPRE mostrarla (incluso en días bloqueados o vacaciones)
      if (overlappingLesson) {
        daySlots.push({
          id: `recurring-${rec.id}-${dateStr}`,
          sourceType: 'recurring',
          recurringSlot: rec,
          date: dateStr,
          startTime: rec.startTime,
          duration: rec.duration,
          status: 'booked',
          meetUrl: overlappingLesson.meetUrl,
          bookedLesson: overlappingLesson,
          bookedLessonTitle: overlappingLesson.title,
          bookedStudentName: overlappingLesson.studentName,
          bookedStudentEmail: overlappingLesson.studentEmail,
        });
        return;
      }

      // Si el día está completamente bloqueado por vacaciones o bloqueo de fecha, no ofrecer slots disponibles
      if (isDayFullyBlocked) {
        return;
      }

      // Comprobar si esta ocurrencia específica está bloqueada (blocked_slot)
      const slotBlockEx = exceptions.find(
        (ex) =>
          ex.type === 'blocked_slot' &&
          ex.startDate === dateStr &&
          (ex.recurringSlotId === rec.id || ex.targetTime === rec.startTime)
      );

      if (slotBlockEx) {
        daySlots.push({
          id: `recurring-blocked-${rec.id}-${dateStr}`,
          sourceType: 'recurring',
          recurringSlot: rec,
          date: dateStr,
          startTime: rec.startTime,
          duration: rec.duration,
          status: 'blocked',
          blockedReason: slotBlockEx.reason || 'Bloqueado solo esta fecha',
          exceptionId: slotBlockEx.id,
        });
        return;
      }

      // Horario disponible normal
      daySlots.push({
        id: `recurring-${rec.id}-${dateStr}`,
        sourceType: 'recurring',
        recurringSlot: rec,
        date: dateStr,
        startTime: rec.startTime,
        duration: rec.duration,
        status: 'available',
      });
    });

    // Ordenar cronológicamente por hora de inicio
    daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      name: dayNames[i],
      shortName: shortNames[i],
      dateNumber: dayDate.getDate(),
      dateStr,
      isToday: dateStr === todayStr,
      vacation: vacationForDay,
      blockedDate: blockedDateForDay,
      isDayFullyBlocked,
      slots: daySlots,
    };
  });

  const totalVisibleSlots = weekDays.reduce((acc, d) => acc + d.slots.length, 0);

  return (
    <TeacherLayout activeSection="classes" onNavigate={onNavigate}>
      <div id="teacher-availability-content" className="w-full flex flex-col gap-6">
        {/* Encabezado de la Sección */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#E8F3F8] text-[#00537A] mb-2">
            <Calendar className="w-3.5 h-3.5 text-[#00537A]" />
            <span>Agenda del Profesor</span>
          </div>
          <h1
            id="teacher-availability-main-title"
            className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
          >
            Mi agenda y disponibilidad
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Gestioná tus franjas horarias semanales permanentes y visualizá tu calendario de clases disponibles.
          </p>

          {/* Selector de pestañas: Horario / Tarifas */}
          <div className="mt-5">
            <TeacherClassesTabs activeTab="schedule" onNavigate={onNavigate} />
          </div>
        </div>

        {/* Notificación informativa si las reglas de seguridad de teacherRecurringSlots no están desplegadas */}
        {recurringRulesPending && (
          <div
            id="recurring-rules-pending-alert"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 text-sm animate-in fade-in duration-200"
          >
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-amber-950">
                Reglas de seguridad pendientes para horarios recurrentes
              </span>
              <p className="text-xs text-amber-800 leading-relaxed">
                La colección <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-amber-900 font-semibold">teacherRecurringSlots</code> requiere
                que las reglas de seguridad estén desplegadas en Firebase Console. La creación recurrente permanecerá en modo protegido para evitar errores.
              </p>
            </div>
          </div>
        )}

        {/* Notificación informativa si las reglas de seguridad de teacherScheduleExceptions no están desplegadas */}
        {exceptionsRulesPending && (
          <div
            id="exceptions-rules-pending-alert"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 text-sm animate-in fade-in duration-200"
          >
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-amber-950">
                Reglas de seguridad pendientes para vacaciones y excepciones
              </span>
              <p className="text-xs text-amber-800 leading-relaxed">
                La colección <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-amber-900 font-semibold">teacherScheduleExceptions</code> requiere
                que las reglas estén desplegadas en Firebase Console. Los horarios y el calendario continuarán funcionando normalmente.
              </p>
            </div>
          </div>
        )}

        {/* Mensaje de Éxito al publicar, editar, bloquear o eliminar */}
        {successMessage && (
          <div
            id="availability-success-alert"
            className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-sm font-medium animate-in fade-in duration-200"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Mensaje de Error de Validación / Envío en Creación */}
        {errorMessage && (
          <div
            id="availability-error-alert"
            className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm font-medium animate-in fade-in duration-200"
          >
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">Atención</span>
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Error de lectura del calendario */}
        {calendarError && (
          <div
            id="availability-calendar-error-alert"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-800 text-sm font-medium animate-in fade-in duration-200"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">Aviso del Calendario</span>
              <span className="leading-relaxed">{calendarError}</span>
            </div>
          </div>
        )}

        {/* PANEL DE EXCEPCIONES Y VACACIONES ACTIVAS (Subbloque 3) */}
        {exceptions.length > 0 && (
          <div
            id="active-exceptions-summary-card"
            className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Ban className="w-4 h-4 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Bloqueos y Excepciones Registradas ({exceptions.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bloqueos de fechas y horarios que modifican temporalmente tu disponibilidad sin alterar las reglas semanales.
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="btn-toggle-exceptions-panel"
                onClick={() => setShowExceptionsPanel((prev) => !prev)}
                className="text-xs font-bold text-[#00537A] hover:underline cursor-pointer"
              >
                {showExceptionsPanel ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
            </div>

            {showExceptionsPanel && (
              <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 animate-in fade-in duration-150">
                {exceptions.map((ex) => {
                  const isVac = ex.type === 'vacation';
                  const isDate = ex.type === 'blocked_date';
                  return (
                    <div
                      key={ex.id || `${ex.type}-${ex.startDate}`}
                      className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              isVac
                                ? 'bg-amber-100 text-amber-800'
                                : isDate
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {isVac ? 'Período anterior (Vacaciones)' : isDate ? 'Día bloqueado' : 'Horario bloqueado'}
                          </span>
                          {ex.targetTime && (
                            <span className="text-[11px] font-bold text-slate-700">
                              {ex.targetTime}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {isVac ? `${ex.startDate} al ${ex.endDate}` : ex.startDate}
                        </p>
                        {ex.reason && (
                          <p className="text-[11px] text-slate-500 truncate">{ex.reason}</p>
                        )}
                      </div>

                      {ex.id && (
                        <button
                          type="button"
                          onClick={() => handleRestoreException(ex.id!)}
                          title="Restablecer disponibilidad original"
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-[#00537A] border border-slate-200 shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restablecer</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ESTRUCTURA PRINCIPAL: CALENDARIO (IZQ) Y FORMULARIO (DER) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUMNA IZQUIERDA: CALENDARIO SEMANAL */}
          <section
            id="weekly-calendar-card"
            className="lg:col-span-7 xl:col-span-8 bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/80 shadow-xs space-y-6"
          >
            {/* Cabecera y Navegación Semanal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="weekly-calendar-heading"
                    className="text-lg sm:text-xl font-bold text-slate-900"
                  >
                    Calendario semanal
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Horarios disponibles (recurrentes y extraordinarios) proyectados para esta semana
                  </p>
                </div>
              </div>

              {/* Controles de Navegación Semanal */}
              <div className="flex items-center gap-2 flex-wrap self-start sm:self-center">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    id="btn-calendar-prev-week"
                    onClick={handlePrevWeek}
                    className="p-2 rounded-xl text-slate-600 hover:text-[#00537A] hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
                    title="Semana anterior"
                    aria-label="Semana anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div
                    id="calendar-week-range-label"
                    className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm font-bold text-slate-800 text-center whitespace-nowrap select-none"
                  >
                    {formatWeekRangeLabel(currentMonday, currentSunday)}
                  </div>

                  <button
                    type="button"
                    id="btn-calendar-next-week"
                    onClick={handleNextWeek}
                    className="p-2 rounded-xl text-slate-600 hover:text-[#00537A] hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
                    title="Semana siguiente"
                    aria-label="Semana siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    id="btn-calendar-today"
                    onClick={handleToday}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-[#00537A] hover:bg-[#E8F3F8] border border-slate-200 transition-colors cursor-pointer"
                    title="Volver a la semana actual"
                  >
                    Hoy
                  </button>
                </div>
              </div>
            </div>

            {/* Estado de carga discreto */}
            {isLoadingSlots && (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-[#00537A]" />
                <span>Cargando disponibilidad y agenda...</span>
              </div>
            )}

            {/* Mensaje cuando la semana no tiene horarios */}
            {!isLoadingSlots && totalVisibleSlots === 0 && (
              <div
                id="weekly-calendar-empty-notice"
                className="p-6 rounded-2xl bg-slate-50/90 border border-slate-200/70 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-2"
              >
                <Calendar className="w-6 h-6 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700">No hay horarios disponibles configurados para esta semana.</span>
                <span className="text-xs text-slate-500 max-w-sm">
                  Añadí un nuevo horario desde el formulario lateral. Podés elegir que se repita todas las semanas de forma automática.
                </span>
              </div>
            )}

            {/* CUADRÍCULA DE 7 DÍAS (Lunes a Domingo) */}
            <div className="overflow-x-auto pb-2 -mx-2 sm:mx-0 px-2 sm:px-0">
              <div className="grid grid-cols-7 gap-2.5 min-w-[640px]">
                {weekDays.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`flex flex-col rounded-2xl p-2.5 sm:p-3 transition-colors border min-h-[220px] ${
                      day.vacation
                        ? 'bg-amber-50/40 border-amber-200/70 ring-1 ring-amber-300/30'
                        : day.blockedDate
                        ? 'bg-rose-50/40 border-rose-200/70 ring-1 ring-rose-300/30'
                        : day.isToday
                        ? 'bg-[#F0F7FA]/70 border-[#00537A]/30 ring-1 ring-[#00537A]/10'
                        : 'bg-slate-50/50 border-slate-200/70'
                    }`}
                  >
                    {/* Cabecera del día (limpia, compacta y clicable para ver detalles o gestionar bloqueo) */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDayException({
                          exception: day.vacation || day.blockedDate || null,
                          dateStr: day.dateStr,
                          dayName: day.name,
                          slotsCount: day.slots.length,
                        })
                      }
                      title={`Ver detalles de ${day.name} ${day.dateStr}`}
                      className="w-full text-center pb-2 mb-2 border-b border-slate-200/60 select-none rounded-t-xl hover:bg-slate-100/70 transition-colors cursor-pointer group flex flex-col items-center"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block group-hover:text-slate-800 transition-colors">
                        {day.shortName}
                      </span>
                      <span
                        className={`text-sm sm:text-base font-extrabold inline-flex items-center justify-center w-7 h-7 rounded-full mt-0.5 transition-transform group-hover:scale-105 ${
                          day.isToday
                            ? 'bg-[#00537A] text-white shadow-2xs'
                            : 'text-slate-800'
                        }`}
                      >
                        {day.dateNumber}
                      </span>

                      {/* Indicadores de Bloqueo a nivel día (Compactos) */}
                      {day.vacation ? (
                        <div
                          className="mt-1 px-1.5 py-0.5 rounded-md bg-amber-100/90 text-amber-900 border border-amber-200 text-[10px] font-bold flex items-center justify-center gap-1 w-full max-w-[95px] truncate"
                          title="Período anterior registrado (haz clic para ver o restablecer)"
                        >
                          <Ban className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                          <span className="truncate">Período bloq.</span>
                        </div>
                      ) : day.blockedDate ? (
                        <div
                          className="mt-1 px-1.5 py-0.5 rounded-md bg-rose-100/90 text-rose-900 border border-rose-200 text-[10px] font-bold flex items-center justify-center gap-1 w-full max-w-[95px] truncate"
                          title="Fecha bloqueada"
                        >
                          <Ban className="w-2.5 h-2.5 text-rose-700 shrink-0" />
                          <span className="truncate">Bloqueado</span>
                        </div>
                      ) : null}
                    </button>

                    {/* Lista de horarios dentro del día: Tarjetas compactas de dos niveles */}
                    <div className="space-y-1.5 flex-1">
                      {day.slots.length > 0 ? (
                        day.slots.map((slot, sIdx) => (
                          <AvailabilitySlotCard
                            key={slot.id || `${slot.date}-${slot.startTime}-${sIdx}`}
                            slot={slot}
                            onClick={() => setSelectedSlotForDetails(slot)}
                          />
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-300 font-medium select-none">
                          -
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* COLUMNA DERECHA: FORMULARIO AÑADIR HORARIO DISPONIBLE */}
          <section
            id="add-availability-card"
            className="lg:col-span-5 xl:col-span-4 bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs space-y-6"
          >
            <div className="border-b border-slate-100 pb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="add-availability-card-title"
                  className="text-lg sm:text-xl font-bold text-slate-900"
                >
                  Añadir horario disponible
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Configurá tus horas de clase semanales recurrentes.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} id="form-add-availability" className="space-y-5">
              {/* Campo Fecha de Inicio */}
              <div className="space-y-2">
                <label
                  htmlFor="availability-date-input"
                  className="block text-xs sm:text-sm font-bold text-slate-800"
                >
                  Fecha de inicio (comienza esta semana)
                </label>
                <div className="relative rounded-2xl shadow-2xs">
                  <input
                    type="date"
                    id="availability-date-input"
                    min={minDateString}
                    value={date}
                    onChange={handleDateChange}
                    disabled={isSubmitting}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm sm:text-base font-medium text-slate-900 focus:bg-white focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/20 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
                  />
                </div>

                {/* Previsualización dinámica de la recurrencia */}
                {selectedDayInfo ? (
                  <p className="text-xs text-[#00537A] font-medium bg-[#E8F3F8]/60 p-2 rounded-xl flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-[#00537A] shrink-0" />
                    <span>
                      Se repetirá todos los <strong>{selectedDayInfo.dayName}</strong> a partir del {date}.
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400" />
                    <span>No se permiten fechas anteriores al día de hoy.</span>
                  </p>
                )}
              </div>

              {/* Campo Hora */}
              <div className="space-y-2">
                <label
                  htmlFor="availability-time-input"
                  className="block text-xs sm:text-sm font-bold text-slate-800"
                >
                  Hora de inicio
                </label>
                <div className="relative rounded-2xl shadow-2xs">
                  <input
                    type="time"
                    id="availability-time-input"
                    value={startTime}
                    onChange={handleTimeChange}
                    disabled={isSubmitting}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm sm:text-base font-medium text-slate-900 focus:bg-white focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/20 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
                  />
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Hora local de inicio de la sesión.</span>
                </p>
              </div>

              {/* Información contextual del horario semanal */}
              <div className="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200/80 flex items-start gap-2.5 text-xs text-sky-900">
                <Repeat className="w-4 h-4 shrink-0 mt-0.5 text-sky-700" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-bold block">Horario semanal permanente</span>
                  <span className="text-slate-600 block">
                    Este horario se proyectará semana a semana de forma automática. Permite que los alumnos reserven clases semanales fijas.
                  </span>
                </div>
              </div>

              {/* Botón de envío */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  id="btn-publish-availability"
                  disabled={isSubmitting || recurringRulesPending}
                  title={
                    recurringRulesPending
                      ? 'Deshabilitado hasta que las reglas de seguridad de teacherRecurringSlots estén desplegadas en Firebase Console'
                      : undefined
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando horario recurrente...</span>
                    </>
                  ) : recurringRulesPending ? (
                    <>
                      <ShieldAlert className="w-4 h-4" />
                      <span>Reglas de Firestore pendientes</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4" />
                      <span>Publicar horario semanal</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {/* MODAL DE EDICIÓN DE HORARIO */}
      {editingSlot && (
        <div
          id="modal-edit-availability-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            id="modal-edit-availability"
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-xl space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingSlot.sourceType === 'recurring'
                      ? 'Editar regla semanal recurrente'
                      : 'Editar horario puntual'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingSlot.sourceType === 'recurring'
                      ? 'Modificá la hora y duración para toda la serie semanal.'
                      : 'Modificá la fecha, hora o duración.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-edit-modal"
                onClick={handleCloseEdit}
                disabled={isSavingEdit}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editingSlot.sourceType === 'recurring' && (
              <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs leading-relaxed">
                💡 <strong>Nota del Subbloque 2:</strong> Este cambio modificará la regla para todas las semanas futuras.
                La edición de excepciones para fechas individuales puntuales estará disponible en el Subbloque 3.
              </div>
            )}

            {editErrorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{editErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Fecha (Solo editable en horarios puntuales) */}
              {editingSlot.sourceType === 'legacy' ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-availability-date-input"
                    className="block text-xs sm:text-sm font-bold text-slate-800"
                  >
                    Fecha
                  </label>
                  <input
                    type="date"
                    id="edit-availability-date-input"
                    min={minDateString}
                    value={editDate}
                    onChange={(e) => {
                      setEditDate(e.target.value);
                      if (editErrorMessage) setEditErrorMessage(null);
                    }}
                    disabled={isSavingEdit}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/20 focus:outline-none transition-all cursor-pointer"
                  />
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Día de la semana:</span>
                  <span className="font-extrabold text-slate-900">
                    {editingSlot.recurringSlot
                      ? DAY_NAMES_BY_INDEX[editingSlot.recurringSlot.dayOfWeek]
                      : ''}
                  </span>
                </div>
              )}

              {/* Hora */}
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-availability-time-input"
                  className="block text-xs sm:text-sm font-bold text-slate-800"
                >
                  Hora de inicio
                </label>
                <input
                  type="time"
                  id="edit-availability-time-input"
                  value={editStartTime}
                  onChange={(e) => {
                    setEditStartTime(e.target.value);
                    if (editErrorMessage) setEditErrorMessage(null);
                  }}
                  disabled={isSavingEdit}
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/20 focus:outline-none transition-all cursor-pointer"
                />
              </div>


              {/* Botones de acción */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  id="btn-cancel-edit"
                  onClick={handleCloseEdit}
                  disabled={isSavingEdit}
                  className="px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-save-edit"
                  disabled={isSavingEdit}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN / OPCIÓN DE BLOQUEO PUNTUAL */}
      {slotToDelete && (
        <div
          id="modal-delete-availability-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            id="modal-delete-availability"
            className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-xl space-y-4 text-center animate-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                {slotToDelete.sourceType === 'recurring'
                  ? '¿Cómo deseas gestionar este horario?'
                  : '¿Eliminar horario disponible puntual?'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500">
                {slotToDelete.sourceType === 'recurring'
                  ? 'Podés pausar este horario únicamente para esta fecha puntual, o bien eliminar la regla para todas las semanas.'
                  : 'Esta acción eliminará el horario disponible puntual. No se puede deshacer.'}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-700 flex items-center justify-center gap-3 font-semibold">
              {slotToDelete.sourceType === 'recurring' && slotToDelete.recurringSlot ? (
                <>
                  <span>Todos los {DAY_NAMES_BY_INDEX[slotToDelete.recurringSlot.dayOfWeek]}</span>
                  <span>•</span>
                  <span>{slotToDelete.startTime} ({slotToDelete.duration} min)</span>
                </>
              ) : (
                <>
                  <span>{slotToDelete.date}</span>
                  <span>•</span>
                  <span>{slotToDelete.startTime} ({slotToDelete.duration} min)</span>
                </>
              )}
            </div>

            {deleteErrorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-left">
                {deleteErrorMessage}
              </div>
            )}

            {/* Opciones para Horarios Recurrentes: Bloqueo puntual vs Eliminación total */}
            {slotToDelete.sourceType === 'recurring' ? (
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  id="btn-block-only-this-date-from-modal"
                  onClick={() => {
                    const target = slotToDelete;
                    handleCloseDelete();
                    handleOpenBlockSlot(target);
                  }}
                  className="w-full px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CalendarOff className="w-4 h-4 text-amber-700" />
                  <span>Bloquear solo el {slotToDelete.date}</span>
                </button>

                <button
                  type="button"
                  id="btn-confirm-delete-recurring-all"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingSlot}
                  className="w-full px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isDeletingSlot ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <span>Eliminar para todas las semanas</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCloseDelete}
                  disabled={isDeletingSlot}
                  className="w-full px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  id="btn-cancel-delete"
                  onClick={handleCloseDelete}
                  disabled={isDeletingSlot}
                  className="flex-1 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingSlot}
                  className="flex-1 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isDeletingSlot ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <span>Eliminar</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL PARA BLOQUEAR HORARIO PUNTUAL O DÍA COMPLETO (SUBBLOQUE 3) */}
      {blockingTarget && (
        <div
          id="modal-blocking-target-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            id="modal-blocking-target-card"
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-xl space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {blockingTarget.type === 'blocked_slot'
                      ? 'Bloquear este horario únicamente'
                      : 'Bloquear fecha completa'}
                  </h3>
                  <p className="text-xs text-slate-500">{blockingTarget.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseBlockModal}
                disabled={isSavingBlock}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {blockingErrorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{blockingErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleConfirmBlockSubmit} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-1">
                <span className="font-bold block">
                  {blockingTarget.type === 'blocked_slot'
                    ? 'La regla recurrente semanal se mantendrá activa'
                    : 'Disponibilidad pausada para esta fecha'}
                </span>
                <p>
                  {blockingTarget.type === 'blocked_slot'
                    ? `Este horario no estará disponible únicamente el ${blockingTarget.date}. Todas las demás semanas continuarán normalmente.`
                    : `No se ofrecerán horarios disponibles a los alumnos durante el día ${blockingTarget.date}.`}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Motivo del bloqueo (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Cita médica, feriado, trámite personal..."
                  value={blockingReason}
                  onChange={(e) => setBlockingReason(e.target.value)}
                  disabled={isSavingBlock}
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/20 focus:outline-none transition-all"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  id="btn-cancel-block"
                  onClick={handleCloseBlockModal}
                  disabled={isSavingBlock}
                  className="px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-confirm-block"
                  disabled={isSavingBlock}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingBlock ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Confirmar bloqueo</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ADVERTENCIA DE CLASES RESERVADAS EXISTENTES (PROTECCIÓN DE CLASES - SUBBLOQUE 3) */}
      {conflictingLessonsState && (
        <div
          id="modal-conflicting-lessons-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            id="modal-conflicting-lessons-card"
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">
                  Atención: Clases reservadas en el período
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Detectamos {conflictingLessonsState.lessons.length} clase(s) ya reservada(s) con alumnos durante el período para {conflictingLessonsState.actionDescription}.
                </p>
              </div>
            </div>

            {/* Lista de clases reservadas involucradas */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {conflictingLessonsState.lessons.map((lesson) => {
                const lDate = lesson.date?.toDate ? lesson.date.toDate() : new Date(lesson.date as any);
                const lDateStr = !isNaN(lDate.getTime()) ? formatDateToLocalISO(lDate) : '';
                const lHours = !isNaN(lDate.getTime()) ? String(lDate.getHours()).padStart(2, '0') : '';
                const lMins = !isNaN(lDate.getTime()) ? String(lDate.getMinutes()).padStart(2, '0') : '';
                const lTimeStr = `${lHours}:${lMins}`;

                return (
                  <div
                    key={lesson.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs gap-3"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{lesson.title}</span>
                      <span className="text-slate-500 block">
                        Alumno: <strong>{lesson.studentName || 'Alumno'}</strong> {lesson.studentEmail && `(${lesson.studentEmail})`}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-[#00537A] block">{lDateStr}</span>
                      <span className="text-slate-500 font-medium block">{lTimeStr} hs ({lesson.duration} min)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Advertencia explícita de política de protección */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-1">
              <span className="font-bold block flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-amber-700" />
                <span>Esta acción NO cancelará estas clases existentes</span>
              </span>
              <p>
                El bloqueo impedirá que nuevos alumnos reserven en estas fechas, pero respetará las clases ya pactadas. Si necesitas suspender o reprogramar alguna clase, deberás acordarlo previamente de forma directa con tus alumnos.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                id="btn-cancel-conflict-modal"
                onClick={() => setConflictingLessonsState(null)}
                className="px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Volver sin cambios
              </button>
              <button
                type="button"
                id="btn-confirm-conflict-modal"
                onClick={async () => {
                  const action = conflictingLessonsState.onConfirm;
                  setConflictingLessonsState(null);
                  await action();
                }}
                className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-sm transition-all cursor-pointer"
              >
                Entendido, continuar con el bloqueo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLES DEL HORARIO (SISTEMA DE DOS NIVELES - NIVEL 2) */}
      {selectedSlotForDetails && (
        <AvailabilityDetailsModal
          slot={selectedSlotForDetails}
          onClose={() => setSelectedSlotForDetails(null)}
          onEdit={(slot) => {
            setSelectedSlotForDetails(null);
            handleOpenEdit(slot);
          }}
          onBlockDateOccurrence={(slot) => {
            setSelectedSlotForDetails(null);
            handleOpenBlockSlot(slot);
          }}
          onDelete={(slot) => {
            setSelectedSlotForDetails(null);
            handleOpenDelete(slot);
          }}
          onRestoreException={async (exceptionId) => {
            await handleRestoreException(exceptionId);
            setSelectedSlotForDetails(null);
          }}
          onNavigate={onNavigate}
        />
      )}

      {/* MODAL DE DETALLES DE VACACIONES O DÍA BLOQUEADO O GESTIÓN DEL DÍA */}
      {selectedDayException && (
        <DayExceptionDetailsModal
          exception={selectedDayException.exception}
          dateStr={selectedDayException.dateStr}
          dayName={selectedDayException.dayName}
          slotsCount={selectedDayException.slotsCount}
          onClose={() => setSelectedDayException(null)}
          onRestore={async (exceptionId) => {
            await handleRestoreException(exceptionId);
            setSelectedDayException(null);
          }}
          onBlockDay={(d) => handleOpenBlockDate(d)}
        />
      )}
    </TeacherLayout>
  );
};
export default TeacherAvailability;
