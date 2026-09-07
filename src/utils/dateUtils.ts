import { Timestamp } from 'firebase/firestore';

/**
 * Convierte un Timestamp o Date a fecha formateada en formato Argentina (DD/MM/AAAA)
 */
export function formatLessonDate(timestamp: Timestamp | Date | any): string {
  if (!timestamp) return '--/--/----';
  
  const dateObj = timestamp instanceof Timestamp 
    ? timestamp.toDate() 
    : (timestamp instanceof Date ? timestamp : new Date(timestamp));

  if (isNaN(dateObj.getTime())) return '--/--/----';

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Convierte un Timestamp o Date a hora formateada (HH:mm)
 */
export function formatLessonTime(timestamp: Timestamp | Date | any): string {
  if (!timestamp) return '--:--';

  const dateObj = timestamp instanceof Timestamp 
    ? timestamp.toDate() 
    : (timestamp instanceof Date ? timestamp : new Date(timestamp));

  if (isNaN(dateObj.getTime())) return '--:--';

  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

/**
 * Formatea fecha y hora combinadas (DD/MM/AAAA - HH:mm)
 */
export function formatLessonDateTime(timestamp: Timestamp | Date | any): string {
  return `${formatLessonDate(timestamp)} - ${formatLessonTime(timestamp)}`;
}

/**
 * Combina un string de fecha (YYYY-MM-DD) y un string de hora (HH:mm) en un Timestamp de Firestore
 */
export function combineDateAndTimeToTimestamp(dateStr: string, timeStr: string): Timestamp {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const [hoursStr, minutesStr] = timeStr.split(':');

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed en Date
  const day = parseInt(dayStr, 10);
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  const jsDate = new Date(year, month, day, hours, minutes, 0, 0);
  return Timestamp.fromDate(jsDate);
}

/**
 * Obtiene la traducción amigable del estado de la clase
 */
export function getLessonStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Programada';
    case 'in_progress':
      return 'En curso';
    case 'completed':
      return 'Completada';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Programada';
  }
}

/**
 * Obtiene la etiqueta temporal amigable para las tarjetas de clase (ej: "Comienza en 15 min", "Mañana a las 14:00")
 */
export function getLessonTimingLabel(timestamp: Timestamp | Date | any): string {
  if (!timestamp) return 'Fecha pendiente';

  const dateObj = timestamp instanceof Timestamp
    ? timestamp.toDate()
    : (timestamp instanceof Date ? timestamp : new Date(timestamp));

  if (isNaN(dateObj.getTime())) return 'Fecha pendiente';

  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (diffMinutes > 0 && diffMinutes <= 60) {
    return `Comienza en ${diffMinutes} min`;
  }

  if (diffMinutes > 60 && diffMinutes <= 180) {
    const hours = Math.round(diffMinutes / 60);
    return `Comienza en ${hours} hora${hours > 1 ? 's' : ''}`;
  }

  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (dateObj.toDateString() === now.toDateString()) {
    return `Hoy a las ${timeStr}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateObj.toDateString() === tomorrow.toDateString()) {
    return `Mañana a las ${timeStr}`;
  }

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${day}/${month} a las ${timeStr}`;
}
