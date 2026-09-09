import React from 'react';
import { Calendar, DollarSign } from 'lucide-react';

export interface TeacherClassesTabsProps {
  activeTab: 'schedule' | 'rates';
  onNavigate: (path: string) => void;
}

/**
 * Componente selector de pestañas superiores para la sección "Clases" del Profesor.
 * Permite alternar entre "Horario" (/teacher/availability) y "Tarifas" (/teacher/rates).
 */
export const TeacherClassesTabs: React.FC<TeacherClassesTabsProps> = ({
  activeTab,
  onNavigate,
}) => {
  return (
    <div
      id="teacher-classes-tabs-container"
      role="tablist"
      aria-label="Apartado Clases"
      className="inline-flex items-center p-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs gap-1.5 select-none"
    >
      {/* Pestaña 1: Horario (/teacher/availability) */}
      <button
        type="button"
        id="tab-teacher-schedule"
        role="tab"
        aria-selected={activeTab === 'schedule'}
        onClick={() => {
          if (activeTab !== 'schedule') {
            onNavigate('/teacher/availability');
          }
        }}
        className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
          activeTab === 'schedule'
            ? 'bg-[#00537A] text-white shadow-xs'
            : 'text-slate-600 hover:text-[#00537A] hover:bg-slate-50'
        }`}
      >
        <Calendar
          className={`w-4 h-4 shrink-0 ${
            activeTab === 'schedule' ? 'text-white' : 'text-slate-400'
          }`}
        />
        <span>Horario</span>
      </button>

      {/* Pestaña 2: Tarifas (/teacher/rates) */}
      <button
        type="button"
        id="tab-teacher-rates"
        role="tab"
        aria-selected={activeTab === 'rates'}
        onClick={() => {
          if (activeTab !== 'rates') {
            onNavigate('/teacher/rates');
          }
        }}
        className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
          activeTab === 'rates'
            ? 'bg-[#00537A] text-white shadow-xs'
            : 'text-slate-600 hover:text-[#00537A] hover:bg-slate-50'
        }`}
      >
        <DollarSign
          className={`w-4 h-4 shrink-0 ${
            activeTab === 'rates' ? 'text-white' : 'text-slate-400'
          }`}
        />
        <span>Tarifas</span>
      </button>
    </div>
  );
};
