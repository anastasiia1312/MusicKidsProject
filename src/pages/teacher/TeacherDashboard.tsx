import React, { useState, useEffect } from 'react';
import {
  Plus,
  Music,
  User,
  ArrowRight,
  Megaphone,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  X,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTeacherLessons, getStudents } from '../../services/lessonService';
import {
  getTeacherMonthlyBookings,
  confirmMonthlyBookingPayment,
} from '../../services/monthlyBookingConfirmationService';
import { getLessonTimingLabel } from '../../utils/dateUtils';
import type { Lesson } from '../../types/lesson';
import type { UserProfile } from '../../types/auth';
import type { MonthlyBooking } from '../../types/monthlyBooking';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';

interface TeacherDashboardProps {
  onNavigate: (path: string) => void;
}

const MONTH_NAMES_SPANISH = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DAY_NAMES_SPANISH = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

function formatBookingMonth(monthStr?: string): string {
  if (!monthStr) return 'Mes no especificado';
  const parts = monthStr.split('-');
  if (parts.length === 2) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    if (m >= 1 && m <= 12) {
      return `${MONTH_NAMES_SPANISH[m - 1]} ${y}`;
    }
  }
  return monthStr;
}

function formatBookingDate(val: any): string {
  if (!val) return '—';
  const d = val.toDate ? val.toDate() : new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDistinctSchedulesSummary(booking: MonthlyBooking): string {
  if (!booking.occurrences || booking.occurrences.length === 0) {
    return `${booking.weeklyFrequency} ${
      booking.weeklyFrequency === 1 ? 'clase semanal' : 'clases semanales'
    }`;
  }
  const summaryMap = new Map<string, string>();
  for (const occ of booking.occurrences) {
    const parts = occ.date.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12);
    const dayName = DAY_NAMES_SPANISH[d.getDay()];
    const key = `${dayName}_${occ.startTime}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, `${dayName}s ${occ.startTime} - ${occ.endTime || ''}`);
    }
  }
  return Array.from(summaryMap.values()).join(' • ');
}

function getBookingExpirationInfo(booking: MonthlyBooking): {
  isExpired: boolean;
  label: string;
  badgeClass: string;
} {
  if (booking.status === 'confirmed') {
    return {
      isExpired: false,
      label: 'Pago confirmado',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }
  if (booking.status === 'cancelled') {
    return {
      isExpired: false,
      label: 'Cancelado',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (booking.status === 'expired') {
    return {
      isExpired: true,
      label: 'Plazo de 24h vencido',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    };
  }

  const expDate = booking.expiresAt?.toDate
    ? booking.expiresAt.toDate()
    : booking.expiresAt
    ? new Date(booking.expiresAt)
    : null;

  if (expDate) {
    const diffMs = expDate.getTime() - Date.now();
    if (diffMs <= 0) {
      return {
        isExpired: true,
        label: 'Plazo de 24h vencido',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      isExpired: false,
      label: `Vence en ${diffHours}h ${diffMins}m`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
    };
  }

  return {
    isExpired: false,
    label: 'Pendiente de confirmación',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
  };
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);

  // Estados para abonos mensuales
  const [monthlyBookings, setMonthlyBookings] = useState<MonthlyBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  // Estados de modal de confirmación manual de pago (SUBBLOQUE 6B.6)
  const [selectedBookingForConfirm, setSelectedBookingForConfirm] = useState<MonthlyBooking | null>(
    null
  );
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    if (!user?.uid) return;

    // 1. Cargar clases del profesor
    setLoadingLessons(true);
    setLessonsError(null);
    let teacherLessons: Lesson[] = [];
    try {
      teacherLessons = await getTeacherLessons(user.uid);
      setLessons(teacherLessons);
    } catch (err: any) {
      console.error('Error al cargar clases del profesor:', err);
      setLessonsError('No pudimos cargar las clases. Intentá nuevamente.');
    } finally {
      setLoadingLessons(false);
    }

    // 2. Cargar alumnos para relacionar nombres
    try {
      const studentList = await getStudents();
      setStudents(studentList);
    } catch (err: any) {
      console.warn('Aviso al consultar lista de alumnos:', err);
    }

    // 3. Cargar abonos mensuales del profesor
    setLoadingBookings(true);
    setBookingsError(null);
    try {
      const bookings = await getTeacherMonthlyBookings(user.uid, teacherLessons);
      setMonthlyBookings(bookings);
    } catch (err: any) {
      console.warn('Aviso al consultar abonos mensuales:', err);
      setMonthlyBookings([]);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  // Filtrar abonos pendientes de confirmación
  const pendingBookings = monthlyBookings.filter(
    (b) => b.status === 'pending_payment_confirmation' || b.status === 'pending_payment'
  );

  return (
    <TeacherLayout activeSection="dashboard" onNavigate={onNavigate} onRefreshData={loadData}>
      {/* Alerta flotante de éxito al confirmar pago */}
      {confirmSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{confirmSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabecera de la Sección Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            id="main-section-title"
            className="font-parkinsans text-2xl sm:text-3xl font-bold text-[#00537A] tracking-tight leading-tight"
            style={{ fontFamily: "'Parkinsans', sans-serif" }}
          >
            Panel del Profesor
          </h2>
          <p
            className="font-siemreap text-slate-500 text-sm sm:text-base mt-1"
            style={{ fontFamily: "'Siemreap', sans-serif" }}
          >
            Gestioná tus clases programadas y confirmá las transferencias de abonos mensuales.
          </p>
        </div>

        {/* Botón + Nueva clase en Amarillo (#FFB800) */}
        <button
          id="btn-create-lesson-main"
          type="button"
          onClick={() => onNavigate('/teacher/lessons/new')}
          className="bg-[#FFB800] hover:bg-[#E6A600] active:scale-95 text-white font-bold text-sm sm:text-base px-6 py-2.5 rounded-full shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Nueva clase</span>
        </button>
      </div>

      {/* SECCIÓN 1: ABONOS PENDIENTES DE PAGO (SUBBLOQUE 6B.6) */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3
              id="pending-bookings-title"
              className="font-parkinsans text-xl sm:text-2xl font-bold text-[#00537A]"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Abonos pendientes de pago
            </h3>
            {pendingBookings.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#FFEAA7] text-[#7A5A00] border border-[#FFB800]/40">
                {pendingBookings.length} {pendingBookings.length === 1 ? 'pendiente' : 'pendientes'}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Retención de 24 horas por transferencia bancaria
          </span>
        </div>

        {loadingBookings ? (
          <div className="bg-white rounded-[24px] p-8 border border-slate-100 flex flex-col items-center justify-center text-slate-400 gap-2 shadow-xs">
            <Loader2 className="w-6 h-6 animate-spin text-[#00537A]" />
            <span className="text-xs font-medium">Cargando abonos pendientes...</span>
          </div>
        ) : bookingsError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-[24px] p-6 text-center text-xs font-medium text-rose-700 flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{bookingsError}</span>
          </div>
        ) : pendingBookings.length === 0 ? (
          <div className="bg-white rounded-[24px] p-6 sm:p-8 border border-slate-100 text-center flex flex-col items-center justify-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-parkinsans text-sm sm:text-base font-bold text-slate-800">
              No tienes transferencias pendientes de confirmación
            </h4>
            <p className="font-siemreap text-xs text-slate-500 mt-0.5">
              Cuando un alumno reserve un abono mensual, aparecerá aquí durante 24 horas para que
              verifiques el pago bancario.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingBookings.map((booking) => {
              const expInfo = getBookingExpirationInfo(booking);
              const studentName =
                booking.studentName ||
                students.find((s) => s.uid === booking.studentId)?.name ||
                'Alumno';
              const schedules = getDistinctSchedulesSummary(booking);
              const totalAmount = (booking.totalPrice || booking.price || 0).toLocaleString(
                'es-AR'
              );

              return (
                <div
                  key={booking.id}
                  id={`pending-booking-card-${booking.id}`}
                  className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 hover:shadow-md transition-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative"
                >
                  {/* Datos Principales del Abono */}
                  <div className="space-y-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-extrabold px-3 py-1 rounded-full border ${expInfo.badgeClass}`}
                      >
                        {expInfo.label}
                      </span>
                      <span className="text-xs font-bold text-[#00537A] bg-[#E8F3F8] px-3 py-1 rounded-full border border-[#00537A]/20">
                        {booking.weeklyFrequency}{' '}
                        {booking.weeklyFrequency === 1 ? 'clase/semana' : 'clases/semana'}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">
                        ID: {booking.id?.substring(0, 10)}...
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-parkinsans text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                        <User className="w-5 h-5 text-[#00537A] shrink-0" />
                        <span>Alumno/a: {studentName}</span>
                      </h4>
                      <p className="text-xs text-slate-600 font-semibold flex items-center gap-1.5 flex-wrap">
                        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Mes: {formatBookingMonth(booking.month)}</span>
                        <span>•</span>
                        <span>{booking.totalLessons} clases programadas</span>
                      </p>
                    </div>

                    {/* Fila de Horarios y Fechas Clave */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px] uppercase">
                          Horarios reservados
                        </span>
                        <span className="font-semibold text-slate-800">{schedules}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px] uppercase">
                          Fecha límite de confirmación
                        </span>
                        <span className="font-semibold text-amber-900 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>{formatBookingDate(booking.expiresAt)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Derecho: Importe y Botón de Confirmación */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0 pt-3 sm:pt-0 border-t lg:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <span className="text-[11px] font-bold text-slate-400 uppercase block">
                        Importe por transferencia
                      </span>
                      <span className="text-xl sm:text-2xl font-extrabold text-[#00537A]">
                        $ {totalAmount} {booking.currency || 'ARS'}
                      </span>
                    </div>

                    <button
                      id={`btn-confirm-payment-${booking.id}`}
                      type="button"
                      disabled={expInfo.isExpired}
                      onClick={() => {
                        setSelectedBookingForConfirm(booking);
                        setConfirmError(null);
                        setIsConfirmModalOpen(true);
                      }}
                      className="w-full sm:w-auto bg-[#00537A] hover:bg-[#003d5b] active:scale-95 text-white font-extrabold text-xs sm:text-sm px-6 py-3 rounded-full shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
                      <span>Confirmar pago recibido</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: TUS PRÓXIMAS CLASES */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3
              className="font-parkinsans text-xl sm:text-2xl font-bold text-[#00537A] tracking-tight leading-tight"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Tus próximas clases
            </h3>
            <p className="font-siemreap text-slate-500 text-xs sm:text-sm mt-0.5">
              Aquí puedes ver y gestionar tus clases particulares y de abonos mensuales.
            </p>
          </div>
        </div>

        {/* LISTADO DE TARJETAS DE CLASE (Datos reales) */}
        {loadingLessons ? (
          <div className="bg-white rounded-[24px] p-12 border border-slate-100 flex flex-col items-center justify-center text-slate-400 gap-3 shadow-xs">
            <Loader2 className="w-8 h-8 animate-spin text-[#00537A]" />
            <span className="text-sm font-medium">Cargando clases...</span>
          </div>
        ) : lessonsError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-[24px] p-8 text-center flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <p className="text-sm font-medium text-rose-700">{lessonsError}</p>
            <button
              type="button"
              onClick={loadData}
              className="px-4 py-2 bg-white rounded-xl text-xs font-bold text-rose-700 border border-rose-200 hover:bg-rose-100/50 transition cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : lessons.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 sm:p-14 border border-slate-100 text-center flex flex-col items-center justify-center shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-[#DDF1F8] text-[#00537A] flex items-center justify-center mb-4">
              <Music className="w-8 h-8" />
            </div>
            <h4
              className="font-parkinsans text-lg sm:text-xl font-bold text-slate-800 mb-1"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Todavía no tienes clases programadas
            </h4>
            <p
              className="font-siemreap text-xs sm:text-sm text-slate-500 max-w-md mb-6"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Comienza agendando tu primera clase particular de música con cualquiera de tus alumnos
              registrados.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/teacher/lessons/new')}
              className="bg-[#FFB800] hover:bg-[#E6A600] active:scale-95 text-white font-bold text-sm px-6 py-2.5 rounded-full shadow-sm flex items-center gap-2 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Crear primera clase</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {lessons.map((lesson) => {
              const isPendingPayment = (lesson as any).paymentStatus === 'pending_confirmation';
              const isConfirmedPayment = (lesson as any).paymentStatus === 'confirmed';

              return (
                <div
                  key={lesson.id}
                  id={`lesson-card-${lesson.id}`}
                  className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative group"
                >
                  {/* Lado Izquierdo: Icono Musical + Información de la Clase */}
                  <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                    <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-[#DDF1F8] text-[#00537A] flex items-center justify-center shrink-0">
                      <Music className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Indicador Temporal Amarillo del Mockup + Estado de Pago */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap select-none">
                        <div className="inline-flex items-center bg-[#FFEAA7] text-[#7A5A00] text-xs font-semibold px-3 py-1 rounded-full">
                          {getLessonTimingLabel(lesson.date)}
                        </div>
                        {isPendingPayment && (
                          <div className="inline-flex items-center bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            <Clock className="w-3 h-3 mr-1 text-amber-700" />
                            <span>Transferencia por confirmar</span>
                          </div>
                        )}
                        {isConfirmedPayment && (
                          <div className="inline-flex items-center bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            <span>Abono confirmado</span>
                          </div>
                        )}
                      </div>

                      {/* Título de la clase */}
                      <h4
                        onClick={() => onNavigate(`/lesson/${lesson.id}`)}
                        className="font-parkinsans text-lg sm:text-xl font-bold text-slate-900 truncate hover:text-[#00537A] transition-colors cursor-pointer"
                        style={{ fontFamily: "'Parkinsans', sans-serif" }}
                        title="Entrar al aula de la clase"
                      >
                        {lesson.title}
                      </h4>

                      {/* Alumno/a */}
                      <div
                        className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 mt-1 font-siemreap"
                        style={{ fontFamily: "'Siemreap', sans-serif" }}
                      >
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Alumno/a:</span>
                        <span className="font-semibold text-slate-800 truncate">
                          {lesson.studentName ||
                            students.find((s) => s.uid === lesson.studentId)?.name ||
                            'Alumno'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Derecho: Acceso a la clase (Unirse a la clase y Aula virtual) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {/* Botón "Unirse a la clase" (#00537A) o aviso si pago está pendiente */}
                    {isPendingPayment ? (
                      <button
                        type="button"
                        disabled
                        title="Se habilitará Google Meet una vez confirmado el pago del abono"
                        className="bg-slate-200 text-slate-500 font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-2xs cursor-not-allowed whitespace-nowrap text-center"
                      >
                        Meet (Pendiente de pago)
                      </button>
                    ) : (
                      <a
                        id={`btn-join-lesson-${lesson.id}`}
                        href={lesson.meetUrl || `/lesson/${lesson.id}`}
                        target={lesson.meetUrl ? '_blank' : undefined}
                        rel={lesson.meetUrl ? 'noopener noreferrer' : undefined}
                        onClick={(e) => {
                          if (!lesson.meetUrl) {
                            e.preventDefault();
                            onNavigate(`/lesson/${lesson.id}`);
                          }
                        }}
                        className="bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white font-semibold text-sm sm:text-base px-6 sm:px-7 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer whitespace-nowrap text-center"
                      >
                        Unirse a la clase
                      </a>
                    )}

                    {/* Botón Aula Virtual */}
                    <button
                      id={`btn-view-lesson-${lesson.id}`}
                      type="button"
                      onClick={() => onNavigate(`/lesson/${lesson.id}`)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 font-semibold text-sm sm:text-base px-5 sm:px-6 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-1.5"
                    >
                      <span>Aula virtual</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BLOQUE INFERIOR: NOTICIAS O RECORDATORIOS IMPORTANTES (Mockup) */}
      <div
        id="teacher-news-banner"
        className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 flex items-center gap-5 sm:gap-6 mt-2"
      >
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#FFF5DB] text-[#FFB800] flex items-center justify-center shrink-0">
          <Megaphone className="w-7 h-7 sm:w-8 sm:h-8 text-[#00537A] stroke-[2]" />
        </div>

        <div className="hidden sm:block w-px h-12 bg-slate-200 shrink-0" />

        <div>
          <h4
            className="font-parkinsans font-bold text-base sm:text-lg text-[#00537A]"
            style={{ fontFamily: "'Parkinsans', sans-serif" }}
          >
            Noticias o recordatorios importantes
          </h4>
          <p
            className="font-siemreap text-slate-500 text-xs sm:text-sm mt-0.5"
            style={{ fontFamily: "'Siemreap', sans-serif" }}
          >
            Aquí aparecerán avisos, novedades y recordatorios de la plataforma.
          </p>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN MANUAL DE PAGO RECIBIDO (SUBBLOQUE 6B.6) */}
      {isConfirmModalOpen && selectedBookingForConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5">
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => {
                if (!isConfirming) {
                  setIsConfirmModalOpen(false);
                  setSelectedBookingForConfirm(null);
                }
              }}
              className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <h3 className="font-parkinsans text-xl font-bold text-slate-900">
                Confirmar recepción de pago
              </h3>
              <p className="font-siemreap text-xs text-slate-600">
                Abono mensual de música • MusicKids
              </p>
            </div>

            {/* ADVERTENCIA BANCARIA OBLIGATORIA */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-amber-900">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                Verificación bancaria previa obligatoria:
              </span>
              <p className="leading-relaxed">
                Antes de confirmar, asegurate de haber verificado en tu cuenta bancaria o home banking
                el ingreso real y acreditado de la transferencia por{' '}
                <strong>
                  ${' '}
                  {(
                    selectedBookingForConfirm.totalPrice ||
                    selectedBookingForConfirm.price ||
                    0
                  ).toLocaleString('es-AR')}{' '}
                  ARS
                </strong>
                .
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed pt-0.5">
                Al confirmar, se asignará de manera inmediata y definitiva el enlace permanente de
                Google Meet para las clases del alumno y se consolidará su lugar en la agenda.
              </p>
            </div>

            {/* RESUMEN DEL ABONO */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-semibold">Alumno/a:</span>
                <strong className="text-slate-900">
                  {selectedBookingForConfirm.studentName ||
                    students.find((s) => s.uid === selectedBookingForConfirm.studentId)?.name ||
                    'Alumno'}
                </strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-semibold">Mes de cursada:</span>
                <strong className="text-slate-900">
                  {formatBookingMonth(selectedBookingForConfirm.month)}
                </strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-semibold">Clases del abono:</span>
                <strong className="text-slate-900">
                  {selectedBookingForConfirm.totalLessons} clases programadas
                </strong>
              </div>
              <div className="flex justify-between py-1.5 items-center bg-white px-3 rounded-xl border border-slate-200">
                <span className="text-slate-700 font-bold">Importe a confirmar:</span>
                <strong className="text-slate-900 text-sm font-extrabold text-[#00537A]">
                  ${' '}
                  {(
                    selectedBookingForConfirm.totalPrice ||
                    selectedBookingForConfirm.price ||
                    0
                  ).toLocaleString('es-AR')}{' '}
                  ARS
                </strong>
              </div>
            </div>

            {confirmError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{confirmError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setSelectedBookingForConfirm(null);
                }}
                className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                id="btn-modal-confirm-payment-submit"
                disabled={isConfirming}
                onClick={async () => {
                  if (!selectedBookingForConfirm?.id) return;
                  setIsConfirming(true);
                  setConfirmError(null);
                  try {
                    await confirmMonthlyBookingPayment(selectedBookingForConfirm.id);
                    setIsConfirmModalOpen(false);
                    setSelectedBookingForConfirm(null);
                    setConfirmSuccessMessage(
                      '¡Pago confirmado exitosamente! Las clases del alumno quedaron activadas y su sala Google Meet está habilitada.'
                    );
                    await loadData();
                  } catch (err: any) {
                    console.warn('Aviso al confirmar pago:', err);
                    const msg = err?.message || 'Error al confirmar la recepción del pago.';
                    setConfirmError(
                      msg.includes('failed-precondition')
                        ? 'No se pudo confirmar el pago. Verificá que la reserva no haya expirado o haya sido cancelada.'
                        : msg.includes('INTERNAL')
                        ? 'No se pudo procesar la confirmación en el servidor. Por favor intentá nuevamente.'
                        : msg
                    );
                  } finally {
                    setIsConfirming(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl font-extrabold text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Confirmando pago en servidor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Sí, confirmar pago recibido</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
};
