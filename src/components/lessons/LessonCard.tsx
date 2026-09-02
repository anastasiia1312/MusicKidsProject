import React from 'react';
import { Calendar, Clock, User, ArrowRight, Music2, Video } from 'lucide-react';
import type { Lesson } from '../../types/lesson';
import { formatLessonDateTime, getLessonStatusLabel } from '../../utils/dateUtils';

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

  const statusLabel = getLessonStatusLabel(lesson.status);
  const meetActionLabel = viewerRole === 'teacher' ? 'Iniciar clase' : 'Unirse a la clase';

  return (
    <div
      id={`lesson-card-${lesson.id}`}
      className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
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

          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
            {statusLabel}
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
            <span>Duración: {lesson.duration} min</span>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-100">
        {lesson.meetUrl ? (
          <a
            id={`btn-meet-lesson-${lesson.id}`}
            href={lesson.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-sm shadow-indigo-200 transition-all cursor-pointer text-center"
          >
            <Video className="w-4 h-4 shrink-0" />
            <span>{meetActionLabel}</span>
          </a>
        ) : null}

        <button
          id={`btn-view-lesson-${lesson.id}`}
          type="button"
          onClick={() => onNavigate(`/lesson/${lesson.id}`)}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm border border-slate-200 transition-all cursor-pointer ${
            lesson.meetUrl ? 'w-full sm:w-auto shrink-0' : 'w-full'
          }`}
        >
          <span>Ver clase</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
