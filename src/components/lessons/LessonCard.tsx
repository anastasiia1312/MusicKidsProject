import React, { useMemo } from 'react';
import { Calendar, Clock, User, ArrowRight, Music2, Video } from 'lucide-react';
import type { Lesson } from '../../types/lesson';
import { formatLessonDateTime } from '../../utils/dateUtils';
import {
  evaluateLessonMeetAccess,
  getLessonTemporalState,
  resolveLessonDurationMinutes,
} from '../../utils/meetValidation';
import { useLessonTimeTick } from '../../hooks/useLessonTimeTick';

interface LessonCardProps {
  lesson: Lesson;
  viewerRole: 'teacher' | 'student';
  onNavigate: (path: string) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  viewerRole,
  onNavigate,
}) => {
  const counterpartLabel = viewerRole === 'teacher' ? 'Alumno' : 'Profesor';
  const counterpartName =
    viewerRole === 'teacher'
      ? lesson.studentName || 'Alumno'
      : lesson.teacherName || 'Profesor';

  const tickLessons = useMemo(() => [lesson], [lesson]);
  const nowMs = useLessonTimeTick(tickLessons);
  const temporalState = useMemo(
    () => getLessonTemporalState(lesson, nowMs),
    [lesson, nowMs]
  );
  const meetAccess = useMemo(
    () => evaluateLessonMeetAccess(lesson, nowMs),
    [lesson, nowMs]
  );
  const durationMinutes = resolveLessonDurationMinutes(lesson);

  const badgeClassName =
    temporalState.phase === 'in_progress'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : temporalState.phase === 'past'
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : temporalState.phase === 'cancelled'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : 'bg-[#FFEAA7] text-[#7A5A00] border-[#FFB800]/30';

  const hasMeetBlock =
    meetAccess.canJoin ||
    meetAccess.reason === 'before_start' ||
    meetAccess.reason === 'pending_payment';

  return (
    <div
      id={`lesson-card-${lesson.id}`}
      className={`bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all flex flex-col justify-between group ${
        temporalState.phase === 'cancelled'
          ? 'border-rose-200/80 opacity-90'
          : temporalState.phase === 'in_progress'
          ? 'border-emerald-200'
          : 'border-slate-200/80'
      }`}
    >
      <div>
        {/* Header de la tarjeta */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Music2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                {lesson.title}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium">{counterpartLabel}:</span>
                <span className="font-semibold text-slate-700">{counterpartName}</span>
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${badgeClassName}`}
          >
            {temporalState.phase === 'in_progress' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
            <span>{temporalState.label}</span>
          </span>
        </div>

        {/* Detalles de Fecha y Duración */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-3 border-t border-slate-100 text-xs text-slate-600 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>{formatLessonDateTime(lesson.date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Duración: {durationMinutes} min</span>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
        {meetAccess.canJoin && meetAccess.meetUrl ? (
          <a
            id={`btn-meet-lesson-${lesson.id}`}
            href={meetAccess.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-sm shadow-indigo-200 transition-all cursor-pointer text-center"
          >
            <Video className="w-4 h-4 shrink-0" />
            <span>Unirse a Meet</span>
          </a>
        ) : meetAccess.reason === 'before_start' ? (
          <div className="w-full sm:flex-1 flex flex-col items-stretch gap-1">
            <button
              id={`btn-meet-lesson-${lesson.id}`}
              type="button"
              disabled
              aria-disabled="true"
              title={meetAccess.availabilityMessage || undefined}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs sm:text-sm cursor-not-allowed text-center"
            >
              <Video className="w-4 h-4 shrink-0" />
              <span>Unirse a Meet</span>
            </button>
            {meetAccess.availabilityMessage && (
              <span className="text-[11px] font-semibold text-slate-500 text-center">
                {meetAccess.availabilityMessage}
              </span>
            )}
          </div>
        ) : meetAccess.reason === 'pending_payment' ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Se habilitará Google Meet una vez confirmado el pago del abono"
            className="w-full sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs cursor-not-allowed text-center"
          >
            <span>Meet (Pendiente de pago)</span>
          </button>
        ) : null}

        <button
          id={`btn-view-lesson-${lesson.id}`}
          type="button"
          onClick={() => onNavigate(`/lesson/${lesson.id}`)}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm border border-slate-200 transition-all cursor-pointer ${
            hasMeetBlock ? 'w-full sm:w-auto shrink-0' : 'w-full'
          }`}
        >
          <span>Ver clase</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
