import React from 'react';
import type { DisplayCalendarSlot } from '../../pages/teacher/TeacherAvailability';

interface AvailabilitySlotCardProps {
  slot: DisplayCalendarSlot;
  onClick: () => void;
}

/**
 * Tarjeta compacta del calendario semanal para el profesor.
 * Muestra ÚNICAMENTE:
 * - Hora de inicio (ej: 16:00)
 * - Estado: Disponible o Reservado (o Bloqueado)
 *
 * Contenido perfectamente centrado, sin duración y sin botones adicionales.
 * Toda la superficie es interactiva y clicable para abrir el modal de detalles.
 */
export const AvailabilitySlotCard: React.FC<AvailabilitySlotCardProps> = ({ slot, onClick }) => {
  const isBooked = slot.status === 'booked';
  const isBlocked = slot.status === 'blocked';

  let containerClasses =
    'w-full flex flex-col items-center justify-center text-center rounded-xl py-2 px-1.5 sm:px-2 transition-all cursor-pointer border select-none focus:outline-none focus:ring-2 focus:ring-[#00537A]/30 ';
  let statusBadgeClasses = 'text-[10px] font-bold px-2 py-0.5 rounded-md inline-block text-center leading-tight ';
  let statusLabel = 'Disponible';

  if (isBooked) {
    statusLabel = 'Reservado';
    containerClasses +=
      'bg-indigo-50/50 border-indigo-200/80 hover:bg-indigo-50 hover:border-indigo-300 shadow-2xs';
    statusBadgeClasses += 'bg-indigo-100 text-indigo-800 border border-indigo-200/90';
  } else if (isBlocked) {
    statusLabel = 'Bloqueado';
    containerClasses +=
      'bg-amber-50/50 border-dashed border-amber-300 hover:bg-amber-50 hover:border-amber-400 shadow-2xs';
    statusBadgeClasses += 'bg-amber-100 text-amber-900 border border-amber-200/90';
  } else {
    // Disponible
    statusLabel = 'Disponible';
    containerClasses +=
      'bg-white border-slate-200/90 hover:bg-[#F0F7FA]/40 hover:border-[#00537A]/40 hover:shadow-2xs';
    statusBadgeClasses += 'bg-emerald-50 text-emerald-700 border border-emerald-200/80';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={containerClasses}
      title="Clic para ver detalles del horario"
      aria-label={`Horario ${slot.startTime}, ${statusLabel}`}
    >
      <span className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight leading-snug">
        {slot.startTime}
      </span>

      <span className={`mt-1.5 ${statusBadgeClasses}`}>
        {statusLabel}
      </span>
    </button>
  );
};
