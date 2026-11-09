import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Video,
  Repeat,
  CheckCircle2,
  User,
  Mail,
  Ban,
  Edit2,
  Trash2,
  RotateCcw,
  CalendarOff,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { DisplayCalendarSlot } from '../../pages/teacher/TeacherAvailability';
import { calculateEndTime } from '../../services/recurringScheduleService';

interface AvailabilityDetailsModalProps {
  slot: DisplayCalendarSlot | null;
  onClose: () => void;
  onEdit: (slot: DisplayCalendarSlot) => void;
  onBlockDateOccurrence: (slot: DisplayCalendarSlot) => void;
  onDelete: (slot: DisplayCalendarSlot) => void;
  onRestoreException: (exceptionId: string) => Promise<void>;
  onNavigate?: (path: string) => void;
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
 * Formatea una fecha ISO "YYYY-MM-DD" a formato legible completo en español.
 * Ejemplo: "Miércoles, 18 de noviembre de 2026"
 */
function formatFullDateSpanish(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return dateStr;

  const dayName = DAY_NAMES_BY_INDEX[d.getDay()];
  const monthName = MONTH_NAMES[month];
  return `${dayName}, ${day} de ${monthName} de ${year}`;
}

export const AvailabilityDetailsModal: React.FC<AvailabilityDetailsModalProps> = ({
  slot,
  onClose,
  onEdit,
  onBlockDateOccurrence,
  onDelete,
  onRestoreException,
  onNavigate,
}) => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  if (!slot) return null;

  const isRecurring = slot.sourceType === 'recurring';
  const isBooked = slot.status === 'booked';
  const isBlocked = slot.status === 'blocked';
  const isAvailable = slot.status === 'available';

  // Cálculo de hora de finalización
  let endTime = '';
  try {
    endTime = calculateEndTime(slot.startTime, slot.duration);
  } catch {
    endTime = '';
  }

  const handleRestore = async () => {
    if (!slot.exceptionId || isRestoring) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await onRestoreException(slot.exceptionId);
      onClose();
    } catch (err: any) {
      setRestoreError(err?.message || 'Error al restablecer la disponibilidad.');
      setIsRestoring(false);
    }
  };

  const handleGoToClasses = () => {
    onClose();
    if (onNavigate) {
      onNavigate('/teacher/classes');
    }
  };

  return (
    <div
      id="modal-availability-details-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="modal-availability-details-card"
        className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
      >
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Detalles del horario
              </h2>
              <p className="text-xs text-slate-500">
                Información y acciones sobre este bloque de disponibilidad
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de error al restablecer */}
        {restoreError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{restoreError}</span>
          </div>
        )}

        {/* Sección 1: Información Temporal (Fecha, Horario y Duración) */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Fecha
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 block mt-0.5">
                {formatFullDateSpanish(slot.date)}
              </span>
            </div>

            {/* Badges de Estado y Tipo */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {isBooked ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200/90 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Reservado</span>
                </span>
              ) : isBlocked ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200/90 flex items-center gap-1">
                  <Ban className="w-3.5 h-3.5 text-amber-700" />
                  <span>Bloqueado</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/90 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Disponible</span>
                </span>
              )}

              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-800 border border-slate-300/80">
                {isRecurring ? 'Semanal' : 'Puntual'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Horario
              </span>
              <div className="flex items-center gap-1.5 mt-0.5 text-sm sm:text-base font-extrabold text-slate-900">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {slot.startTime} {endTime && `a ${endTime}`} hs
                </span>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Duración
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 block mt-0.5">
                {slot.duration} minutos
              </span>
            </div>
          </div>
        </div>

        {/* Sección 2: Tipo de Disponibilidad */}
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start gap-3 text-xs leading-relaxed">
          {isRecurring ? (
            <>
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                <Repeat className="w-4 h-4 text-sky-600" />
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 block">
                  Disponibilidad semanal recurrente
                </span>
                <p className="text-slate-600">
                  Este horario se repite todas las semanas de forma indefinida a partir de su fecha de inicio
                  {slot.recurringSlot?.originDate && ` (${slot.recurringSlot.originDate})`}.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-[#00537A]" />
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 block">
                  Disponibilidad puntual (Solo esta fecha)
                </span>
                <p className="text-slate-600">
                  Horario extraordinario configurado únicamente para el {slot.date}. No se proyecta a semanas futuras.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Sección 3: Datos de la Clase Reservada (si corresponde) */}
        {isBooked && (
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold">
                <User className="w-4 h-4" />
              </div>
              <span className="text-xs sm:text-sm font-extrabold text-indigo-950">
                Información de la clase reservada
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-indigo-100">
                <span className="font-semibold text-slate-500">Alumno:</span>
                <span className="font-extrabold text-slate-900">
                  {slot.bookedStudentName || slot.bookedLesson?.studentName || 'Alumno confirmado'}
                </span>
              </div>

              {(slot.bookedStudentEmail || slot.bookedLesson?.studentEmail) && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-indigo-100">
                  <span className="font-semibold text-slate-500 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Correo:</span>
                  </span>
                  <span className="font-bold text-slate-800">
                    {slot.bookedStudentEmail || slot.bookedLesson?.studentEmail}
                  </span>
                </div>
              )}

              {slot.bookedLessonTitle && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-indigo-100">
                  <span className="font-semibold text-slate-500">Título de la clase:</span>
                  <span className="font-bold text-slate-800">{slot.bookedLessonTitle}</span>
                </div>
              )}

              {/* Enlace oficial de Google Meet vinculado a la clase */}
              {slot.meetUrl ? (
                <div className="pt-2 border-t border-indigo-100 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[#00537A] font-bold">
                    <Video className="w-4 h-4 text-[#00537A]" />
                    <span>Videollamada de Google Meet vinculada</span>
                  </div>
                  <a
                    href={slot.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    <span>Unirse a Google Meet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic pt-1">
                  No hay enlace de Google Meet registrado para esta clase.
                </p>
              )}
            </div>

            <p className="text-[11px] text-indigo-900/80 leading-relaxed pt-1">
              🔒 <strong>Clase protegida:</strong> Las clases reservadas no pueden cancelarse directamente desde la disponibilidad para proteger la agenda de los alumnos. Cualquier modificación o acuerdo debe realizarse en Mis Clases.
            </p>
          </div>
        )}

        {/* Sección 4: Ocurrencia Bloqueada (si corresponde) */}
        {isBlocked && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Ban className="w-4 h-4 text-amber-700" />
              </div>
              <span className="text-xs sm:text-sm font-extrabold text-amber-950">
                Ocurrencia bloqueada solo para esta fecha
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-amber-200/80 text-xs space-y-1">
              <span className="font-semibold text-slate-500 block">Motivo registrado:</span>
              <span className="font-extrabold text-slate-800 block">
                {slot.blockedReason || 'Bloqueo puntual de horario'}
              </span>
            </div>

            <p className="text-[11px] text-amber-900 leading-relaxed">
              La regla recurrente semanal continúa activa para el resto de las semanas. Podés restablecer la disponibilidad para esta fecha puntual con el botón inferior.
            </p>
          </div>
        )}

        {/* Sección 5: Botones de Acción dentro del Modal */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          {/* Caso A: Horario recurrente disponible */}
          {isAvailable && isRecurring && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                id="btn-modal-block-slot"
                onClick={() => {
                  onClose();
                  onBlockDateOccurrence(slot);
                }}
                className="px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                title="Pausar este horario únicamente en esta fecha"
              >
                <CalendarOff className="w-3.5 h-3.5 text-amber-700" />
                <span>Bloquear fecha</span>
              </button>

              <button
                type="button"
                id="btn-modal-edit-slot"
                onClick={() => {
                  onClose();
                  onEdit(slot);
                }}
                className="px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                title="Editar la hora o duración de la regla semanal"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Editar regla</span>
              </button>

              <button
                type="button"
                id="btn-modal-delete-slot"
                onClick={() => {
                  onClose();
                  onDelete(slot);
                }}
                className="px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                title="Eliminar la regla semanal para todas las semanas"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Eliminar regla</span>
              </button>
            </div>
          )}

          {/* Caso B: Horario puntual disponible */}
          {isAvailable && !isRecurring && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-modal-edit-legacy-slot"
                onClick={() => {
                  onClose();
                  onEdit(slot);
                }}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Editar horario</span>
              </button>

              <button
                type="button"
                id="btn-modal-delete-legacy-slot"
                onClick={() => {
                  onClose();
                  onDelete(slot);
                }}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Eliminar horario</span>
              </button>
            </div>
          )}

          {/* Caso C: Horario bloqueado */}
          {isBlocked && slot.exceptionId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-modal-restore-slot"
                onClick={handleRestore}
                disabled={isRestoring}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Restableciendo...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Restablecer disponibilidad para esta fecha</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Caso D: Clase reservada */}
          {isBooked && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleGoToClasses}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer"
              >
                Gestionar en Mis Clases
              </button>
            </div>
          )}

          {/* Botón Cerrar genérico */}
          <div className="pt-1 flex justify-end">
            <button
              type="button"
              id="btn-modal-close-details"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
