import React, { useState } from 'react';
import { Palmtree, Ban, RotateCcw, X, Loader2, AlertCircle, Info, Calendar, CalendarOff } from 'lucide-react';
import type { TeacherScheduleException } from '../../types/scheduleException';

interface DayExceptionDetailsModalProps {
  exception: TeacherScheduleException | null;
  dateStr?: string;
  dayName?: string;
  slotsCount?: number;
  onClose: () => void;
  onRestore: (exceptionId: string) => Promise<void>;
  onBlockDay?: (dateStr: string) => void;
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

export const DayExceptionDetailsModal: React.FC<DayExceptionDetailsModalProps> = ({
  exception,
  dateStr,
  dayName,
  slotsCount = 0,
  onClose,
  onRestore,
  onBlockDay,
}) => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const isVacation = exception?.type === 'vacation';
  const isBlockedDate = exception?.type === 'blocked_date';
  const isNormalDay = !exception;

  const handleRestore = async () => {
    if (!exception?.id || isRestoring) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await onRestore(exception.id);
      onClose();
    } catch (err: any) {
      setRestoreError(err?.message || 'Error al restablecer la disponibilidad.');
      setIsRestoring(false);
    }
  };

  const handleBlockDayClick = () => {
    if (!dateStr || !onBlockDay) return;
    onClose();
    onBlockDay(dateStr);
  };

  const formattedDate = dateStr ? formatFullDateSpanish(dateStr) : '';

  return (
    <div
      id="modal-day-details-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="modal-day-details-card"
        className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-xl space-y-5 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isVacation
                  ? 'bg-amber-100 text-amber-800'
                  : isBlockedDate
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-[#E8F3F8] text-[#00537A]'
              }`}
            >
              {isVacation ? (
                <Palmtree className="w-5 h-5 text-amber-700" />
              ) : isBlockedDate ? (
                <Ban className="w-5 h-5 text-rose-700" />
              ) : (
                <Calendar className="w-5 h-5 text-[#00537A]" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isVacation
                  ? 'Período anterior (Vacaciones)'
                  : isBlockedDate
                  ? 'Detalles de fecha bloqueada'
                  : 'Detalles del día'}
              </h2>
              <p className="text-xs text-slate-500">
                {isVacation
                  ? 'Excepción previa multidia registrada en el calendario'
                  : isBlockedDate
                  ? 'Bloqueo temporal de fecha completa'
                  : 'Gestión y estado de la fecha seleccionada'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {restoreError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{restoreError}</span>
          </div>
        )}

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              {isVacation ? 'Rango de fechas' : 'Fecha'}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-slate-900 block mt-0.5">
              {isVacation
                ? `${exception.startDate} al ${exception.endDate}`
                : formattedDate || dateStr}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Estado de la fecha
            </span>
            <div className="mt-1">
              {isVacation ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  Período anterior (Vacaciones)
                </span>
              ) : isBlockedDate ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-200">
                  Fecha bloqueada
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Día disponible ({slotsCount} {slotsCount === 1 ? 'horario' : 'horarios'})
                </span>
              )}
            </div>
          </div>

          {(isVacation || isBlockedDate) && (
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Motivo registrado
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 block mt-0.5">
                {exception?.reason || (isVacation ? 'Período no disponible' : 'Día no disponible')}
              </span>
            </div>
          )}
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            {isVacation
              ? 'Este período de receso fue registrado anteriormente. Puedes eliminarlo haciendo clic en "Restablecer disponibilidad" para reactivar tus reglas habituales en estas fechas.'
              : isBlockedDate
              ? 'Los horarios recurrentes de este día están pausados temporalmente. Las clases previamente pactadas se respetan.'
              : 'Puedes bloquear esta fecha completa si necesitas pausar tu disponibilidad sin alterar tus reglas semanales recurrentes.'}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cerrar
          </button>

          {/* Opción de restablecer si está bloqueado o en vacaciones */}
          {exception?.id && (
            <button
              type="button"
              onClick={handleRestore}
              disabled={isRestoring}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Restableciendo...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Restablecer disponibilidad</span>
                </>
              )}
            </button>
          )}

          {/* Opción de bloquear día completo si el día está disponible y no bloqueado */}
          {isNormalDay && onBlockDay && dateStr && (
            <button
              type="button"
              onClick={handleBlockDayClick}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              <CalendarOff className="w-4 h-4" />
              <span>Bloquear día completo</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
