import React from 'react';
import { Mail, GraduationCap } from 'lucide-react';
import type { UserProfile } from '../../types/auth';

interface StudentCardProps {
  student: UserProfile;
}

export const StudentCard: React.FC<StudentCardProps> = ({ student }) => {
  return (
    <div
      id={`student-card-${student.uid}`}
      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-3 hover:bg-white hover:border-indigo-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar / Placeholder (Carga temporalmente desactivada) */}
        {/* TODO: Rehabilitar carga de avatar en una iteración futura. */}
        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-200 select-none">
          {student.name ? student.name.charAt(0).toUpperCase() : 'A'}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate">
            {student.name || 'Alumno'}
          </h4>
          <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{student.email}</span>
          </p>
        </div>
      </div>

      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200 shrink-0">
        <GraduationCap className="w-3 h-3 text-emerald-600" />
        Alumno
      </span>
    </div>
  );
};
