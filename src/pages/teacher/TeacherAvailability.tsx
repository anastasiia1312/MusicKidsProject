import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  createTeacherAvailability,
  getTeacherAvailability,
  updateTeacherAvailability,
  deleteTeacherAvailability,
  checkAvailabilityOverlap,
} from '../../services/availabilityService';
import type {
  AvailabilityDuration,
  TeacherAvailability as TeacherAvailabilityType,
} from '../../types/availability';
import { TeacherClassesTabs } from '../../components/teacher/TeacherClassesTabs';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';

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
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Estados del formulario existente (Creación 2.1)
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [duration, setDuration] = useState<AvailabilityDuration>(60);

  // Estados de control de envío y mensajes
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados para Edición (2.3)
  const [editingSlot, setEditingSlot] = useState<TeacherAvailabilityType | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editDuration, setEditDuration] = useState<AvailabilityDuration>(60);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);

  // Estados para Eliminación (2.3)
  const [slotToDelete, setSlotToDelete] = useState<TeacherAvailabilityType | null>(null);
  const [isDeletingSlot, setIsDeletingSlot] = useState<boolean>(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Obtener fecha mínima permitida en formato local (hoy: YYYY-MM-DD)
  const getTodayLocalString = (): string => {
    return formatDateToLocalISO(new Date());
  };

  // Carga de horarios desde Firestore para el profesor autenticado
  const loadAvailability = useCallback(async () => {
    if (!user?.uid) return;

    try {
      setIsLoadingSlots(true);
      setCalendarError(null);
      const slots = await getTeacherAvailability(user.uid);
      setAvailabilitySlots(slots);
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

  const handleDurationSelect = (selectedDuration: AvailabilityDuration) => {
    setDuration(selectedDuration);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };

  // Envío del formulario de creación con validación de solapamiento
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Impedir envíos duplicados
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

    // 3. Duración obligatoria (únicamente 30, 45 o 60)
    if (!duration || ![30, 45, 60].includes(duration)) {
      setErrorMessage('La duración seleccionada no es válida. Debe ser 30, 45 o 60 minutos.');
      return;
    }

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
      // 6. Validación de solapamiento (2.3)
      const hasOverlap = await checkAvailabilityOverlap(
        user.uid,
        trimmedDate,
        trimmedTime,
        duration
      );

      if (hasOverlap) {
        setErrorMessage('Este horario se superpone con otro horario disponible.');
        setIsSubmitting(false);
        return;
      }

      await createTeacherAvailability({
        teacherId: user.uid,
        date: trimmedDate,
        startTime: trimmedTime,
        duration,
      });

      // Guardado exitoso: mostrar mensaje y limpiar formulario
      setSuccessMessage('Horario disponible publicado correctamente.');
      setDate('');
      setStartTime('');
      setDuration(60);

      // Si el horario publicado pertenece a otra semana, navegar a ella
      const slotMonday = getMondayOfWeek(selectedDay);
      setCurrentMonday(slotMonday);

      // Actualizar inmediatamente el calendario sin recargar manualmente
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al publicar horario de disponibilidad:', err);

      const errString = err?.message || String(err);
      if (errString.includes('permission-denied') || errString.includes('insufficient permissions')) {
        setErrorMessage(
          'Permiso denegado en Firestore: Las reglas de seguridad de Firestore aún no contemplan la colección "teacherAvailability". Contactá al administrador o publicá las reglas requeridas.'
        );
      } else {
        setErrorMessage(
          err?.message || 'Ocurrió un error al guardar el horario disponible. Por favor, intentá nuevamente.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejadores para Edición (2.3)
  const handleOpenEdit = (slot: TeacherAvailabilityType) => {
    setEditingSlot(slot);
    setEditDate(slot.date);
    setEditStartTime(slot.startTime);
    setEditDuration(slot.duration);
    setEditErrorMessage(null);
  };

  const handleCloseEdit = () => {
    if (isSavingEdit) return;
    setEditingSlot(null);
    setEditErrorMessage(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingSlot || !editingSlot.id || isSavingEdit) return;

    if (!user?.uid || role !== 'teacher') {
      setEditErrorMessage('No tenés permisos para realizar esta acción o tu sesión expiró.');
      return;
    }

    const trimmedDate = editDate.trim();
    if (!trimmedDate) {
      setEditErrorMessage('La fecha es obligatoria.');
      return;
    }

    const trimmedTime = editStartTime.trim();
    if (!trimmedTime) {
      setEditErrorMessage('La hora de inicio es obligatoria.');
      return;
    }

    if (!editDuration || ![30, 45, 60].includes(editDuration)) {
      setEditErrorMessage('La duración seleccionada no es válida. Debe ser 30, 45 o 60 minutos.');
      return;
    }

    const dateParts = trimmedDate.split('-');
    const timeParts = trimmedTime.split(':');

    if (dateParts.length !== 3 || timeParts.length !== 2) {
      setEditErrorMessage('El formato de fecha u hora es inválido.');
      return;
    }

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      setEditErrorMessage('La fecha u hora contiene valores inválidos.');
      return;
    }

    const selectedDay = new Date(year, month, day, 0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDay.getTime() < today.getTime()) {
      setEditErrorMessage('No podés seleccionar una fecha anterior al día actual.');
      return;
    }

    const selectedDateTime = new Date(year, month, day, hours, minutes, 0, 0);
    const now = new Date();

    if (selectedDateTime.getTime() <= now.getTime()) {
      setEditErrorMessage('No podés asignar un horario cuya fecha y hora ya hayan pasado.');
      return;
    }

    setIsSavingEdit(true);
    setEditErrorMessage(null);

    try {
      // Validar solapamientos excluyendo el propio documento
      const hasOverlap = await checkAvailabilityOverlap(
        user.uid,
        trimmedDate,
        trimmedTime,
        editDuration,
        editingSlot.id
      );

      if (hasOverlap) {
        setEditErrorMessage('Este horario se superpone con otro horario disponible.');
        setIsSavingEdit(false);
        return;
      }

      await updateTeacherAvailability(editingSlot.id, {
        date: trimmedDate,
        startTime: trimmedTime,
        duration: editDuration,
      });

      setSuccessMessage('Horario actualizado correctamente.');
      setEditingSlot(null);

      // Si la nueva fecha no está en la semana actual, mover la vista a esa semana
      const slotMonday = getMondayOfWeek(selectedDay);
      setCurrentMonday(slotMonday);

      await loadAvailability();
    } catch (err: any) {
      console.error('Error al actualizar horario:', err);
      const errString = err?.message || String(err);
      if (errString.includes('permission-denied') || errString.includes('insufficient permissions')) {
        setEditErrorMessage(
          'Permiso denegado en Firestore: No se pudo actualizar el horario.'
        );
      } else {
        setEditErrorMessage(
          err?.message || 'Ocurrió un error al actualizar el horario. Por favor, intentá nuevamente.'
        );
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Manejadores para Eliminación (2.3)
  const handleOpenDelete = (slot: TeacherAvailabilityType) => {
    setSlotToDelete(slot);
    setDeleteErrorMessage(null);
  };

  const handleCloseDelete = () => {
    if (isDeletingSlot) return;
    setSlotToDelete(null);
    setDeleteErrorMessage(null);
  };

  const handleConfirmDelete = async () => {
    if (!slotToDelete || !slotToDelete.id || isDeletingSlot) return;
    if (!user?.uid || role !== 'teacher') return;

    setIsDeletingSlot(true);
    setDeleteErrorMessage(null);

    try {
      await deleteTeacherAvailability(slotToDelete.id);
      setSuccessMessage('Horario eliminado correctamente.');
      setSlotToDelete(null);
      await loadAvailability();
    } catch (err: any) {
      console.error('Error al eliminar horario:', err);
      const errString = err?.message || String(err);
      if (errString.includes('permission-denied') || errString.includes('insufficient permissions')) {
        setDeleteErrorMessage(
          'Permiso denegado en Firestore: No se pudo eliminar el horario.'
        );
      } else {
        setDeleteErrorMessage(
          err?.message || 'Ocurrió un error al eliminar el horario. Por favor, intentá nuevamente.'
        );
      }
    } finally {
      setIsDeletingSlot(false);
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

  // Filtrar los horarios que pertenecen a la semana actualmente visible
  const weekSlots = availabilitySlots.filter(
    (slot) => slot.date >= mondayStr && slot.date <= sundayStr
  );

  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const shortNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const dayDate = new Date(
      currentMonday.getFullYear(),
      currentMonday.getMonth(),
      currentMonday.getDate() + i
    );
    const dateStr = formatDateToLocalISO(dayDate);
    const daySlots = weekSlots
      .filter((s) => s.date === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      name: dayNames[i],
      shortName: shortNames[i],
      dateNumber: dayDate.getDate(),
      dateStr,
      isToday: dateStr === todayStr,
      slots: daySlots,
    };
  });

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
            Gestioná tus franjas horarias y visualizá tu calendario semanal de clases disponibles.
          </p>

          {/* Selector de pestañas: Horario / Tarifas */}
          <div className="mt-5">
            <TeacherClassesTabs activeTab="schedule" onNavigate={onNavigate} />
          </div>
        </div>

        {/* Mensaje de Éxito al publicar, editar o eliminar */}
        {successMessage && (
          <div
            id="availability-success-alert"
            className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-sm font-medium animate-in fade-in duration-200"
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
            className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm font-medium animate-in fade-in duration-200"
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
            className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-800 text-sm font-medium animate-in fade-in duration-200"
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
                    Horarios disponibles configurados para esta semana
                  </p>
                </div>
              </div>

              {/* Controles de Navegación: Flechas y Rango */}
              <div className="flex items-center gap-2 self-start sm:self-center">
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

            {/* Estado de carga discreto */}
            {isLoadingSlots && (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-[#00537A]" />
                <span>Cargando disponibilidad...</span>
              </div>
            )}

            {/* Mensaje cuando la semana no tiene horarios */}
            {!isLoadingSlots && weekSlots.length === 0 && (
              <div
                id="weekly-calendar-empty-notice"
                className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200/70 text-center text-slate-500 text-sm flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span>No hay horarios publicados esta semana.</span>
              </div>
            )}

            {/* CUADRÍCULA DE 7 DÍAS (Lunes a Domingo) */}
            <div className="overflow-x-auto pb-2 -mx-2 sm:mx-0 px-2 sm:px-0">
              <div className="grid grid-cols-7 gap-2.5 min-w-[640px]">
                {weekDays.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`flex flex-col rounded-2xl p-2.5 sm:p-3 transition-colors border min-h-[220px] ${
                      day.isToday
                        ? 'bg-[#F0F7FA]/70 border-[#00537A]/30 ring-1 ring-[#00537A]/10'
                        : 'bg-slate-50/50 border-slate-200/70'
                    }`}
                  >
                    {/* Cabecera del día */}
                    <div className="text-center pb-2 mb-2 border-b border-slate-200/60 select-none">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        {day.shortName}
                      </span>
                      <span
                        className={`text-sm sm:text-base font-extrabold inline-flex items-center justify-center w-7 h-7 rounded-full mt-0.5 ${
                          day.isToday
                            ? 'bg-[#00537A] text-white shadow-2xs'
                            : 'text-slate-800'
                        }`}
                      >
                        {day.dateNumber}
                      </span>
                    </div>

                    {/* Lista de horarios dentro del día */}
                    <div className="space-y-2 flex-1">
                      {day.slots.length > 0 ? (
                        day.slots.map((slot, sIdx) => (
                          <div
                            key={slot.id || `${slot.date}-${slot.startTime}-${sIdx}`}
                            className="p-2 sm:p-2.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-[#00537A]/40 transition-all space-y-1.5 group"
                          >
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <span className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                                {slot.startTime}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                Disponible
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-medium text-slate-500 pt-0.5">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{slot.duration} min</span>
                              </div>

                              {/* Acciones discretas: Editar y Eliminar */}
                              {slot.status === 'available' && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    id={`btn-edit-slot-${slot.id || sIdx}`}
                                    onClick={() => handleOpenEdit(slot)}
                                    title="Editar horario"
                                    className="p-1 rounded-md text-slate-400 hover:text-[#00537A] hover:bg-slate-100 transition-colors cursor-pointer"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    id={`btn-delete-slot-${slot.id || sIdx}`}
                                    onClick={() => handleOpenDelete(slot)}
                                    title="Eliminar horario"
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
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
                  Ingresá la fecha, hora de inicio y duración de la clase disponible.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} id="form-add-availability" className="space-y-5">
              {/* Campo Fecha */}
              <div className="space-y-2">
                <label
                  htmlFor="availability-date-input"
                  className="block text-xs sm:text-sm font-bold text-slate-800"
                >
                  Fecha
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
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Info className="w-3 h-3 text-slate-400" />
                  <span>No se permiten fechas anteriores al día de hoy.</span>
                </p>
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

              {/* Campo Duración (30, 45, 60 min) */}
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold text-slate-800">
                  Duración de la clase
                </label>
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3" id="duration-selector-group">
                  {[30, 45, 60].map((dur) => {
                    const isSelected = duration === dur;
                    return (
                      <button
                        key={dur}
                        type="button"
                        id={`btn-duration-${dur}`}
                        onClick={() => handleDurationSelect(dur as AvailabilityDuration)}
                        disabled={isSubmitting}
                        className={`py-3 px-2 rounded-2xl font-bold text-xs sm:text-sm transition-all border flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-50 ${
                          isSelected
                            ? 'bg-[#00537A] text-white border-[#00537A] shadow-sm scale-[1.02]'
                            : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-base sm:text-lg font-extrabold leading-none">{dur}</span>
                        <span className={`text-[10px] sm:text-xs ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                          minutos
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botón de envío */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  id="btn-publish-availability"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Publicando horario...</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4" />
                      <span>Publicar horario</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {/* MODAL DE EDICIÓN DE HORARIO DISPONIBLE */}
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
                    Editar horario disponible
                  </h3>
                  <p className="text-xs text-slate-500">
                    Modificá la fecha, hora o duración.
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

            {editErrorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{editErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Fecha */}
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

              {/* Duración */}
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-slate-800">
                  Duración de la clase
                </label>
                <div className="grid grid-cols-3 gap-2.5" id="edit-duration-selector-group">
                  {[30, 45, 60].map((dur) => {
                    const isSelected = editDuration === dur;
                    return (
                      <button
                        key={dur}
                        type="button"
                        id={`btn-edit-duration-${dur}`}
                        onClick={() => {
                          setEditDuration(dur as AvailabilityDuration);
                          if (editErrorMessage) setEditErrorMessage(null);
                        }}
                        disabled={isSavingEdit}
                        className={`py-2.5 px-2 rounded-2xl font-bold text-xs sm:text-sm transition-all border flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-50 ${
                          isSelected
                            ? 'bg-[#00537A] text-white border-[#00537A] shadow-sm'
                            : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm sm:text-base font-extrabold leading-none">{dur}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                          minutos
                        </span>
                      </button>
                    );
                  })}
                </div>
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

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
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
                ¿Querés eliminar este horario disponible?
              </h3>
              <p className="text-xs sm:text-sm text-slate-500">
                Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-700 flex items-center justify-center gap-3 font-semibold">
              <span>{slotToDelete.date}</span>
              <span>•</span>
              <span>{slotToDelete.startTime} ({slotToDelete.duration} min)</span>
            </div>

            {deleteErrorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-left">
                {deleteErrorMessage}
              </div>
            )}

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
          </div>
        </div>
      )}
    </TeacherLayout>
  );
};
