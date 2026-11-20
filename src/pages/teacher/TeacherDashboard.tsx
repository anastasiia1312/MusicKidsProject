import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Music,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  X,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTeacherLessons, getStudents } from '../../services/lessonService';
import {
  getTeacherMonthlyBookings,
  confirmMonthlyBookingPayment,
  provisionMonthlyBookingMeet,
} from '../../services/monthlyBookingConfirmationService';
import { getGoogleMeetAccessToken, resetMeetTokenCache } from '../../services/meetService';
import {
  evaluateLessonMeetAccess,
  getLessonTemporalState,
  isValidMeetUrl,
  organizeLessonsChronologically,
  resolveLessonDurationMinutes,
} from '../../utils/meetValidation';
import { formatLessonDateTime } from '../../utils/dateUtils';
import { useLessonTimeTick } from '../../hooks/useLessonTimeTick';
import type { Lesson } from '../../types/lesson';
import type { UserProfile } from '../../types/auth';
import type { MonthlyBooking } from '../../types/monthlyBooking';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';
import { NotificationCenter } from '../../components/shared/NotificationCenter';

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

  // Estados de modal de confirmación manual de pago (SUBBLOQUE 6B.6)
  const [selectedBookingForConfirm, setSelectedBookingForConfirm] = useState<MonthlyBooking | null>(
    null
  );
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState<string | null>(null);
  const [meetProvisionWarning, setMeetProvisionWarning] = useState<{
    bookingId: string;
    message: string;
    isUncertain?: boolean;
  } | null>(null);
  const [provisioningBookingIds, setProvisioningBookingIds] = useState<Record<string, boolean>>({});
  const [showExpiredBookingsHistory, setShowExpiredBookingsHistory] = useState(false);

  const studentNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of students) {
      if (s.uid && s.name) {
        map[s.uid] = s.name;
      }
    }
    return map;
  }, [students]);

  const handleOpenConfirmPaymentModal = (booking: MonthlyBooking) => {
    if (
      !booking.id ||
      (booking.status !== 'pending_payment_confirmation' &&
        booking.status !== 'pending_payment')
    ) {
      return;
    }

    const expInfo = getBookingExpirationInfo(booking);
    if (expInfo.isExpired) {
      loadData();
      return;
    }

    setSelectedBookingForConfirm(booking);
    setConfirmError(null);
    setIsConfirmModalOpen(true);
  };

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

  // Historial de abonos con plazo de 24 horas vencido / expirado
  const expiredBookings = useMemo(() => {
    return monthlyBookings.filter((b) => {
      if (b.status === 'expired') return true;
      if (b.status === 'pending_payment_confirmation' || b.status === 'pending_payment') {
        const expInfo = getBookingExpirationInfo(b);
        return expInfo.isExpired;
      }
      return false;
    });
  }, [monthlyBookings]);

  // Actualización automática en transiciones de inicio/fin de clases sin recargar
  const nowMs = useLessonTimeTick(lessons);

  // Organización cronológica centralizada (idéntica a StudentDashboard)
  const { upcomingLessons, pastLessons, cancelledLessons } = useMemo(
    () => organizeLessonsChronologically(lessons, nowMs),
    [lessons, nowMs]
  );

  const hasAnyDisplayableLessons =
    upcomingLessons.length > 0 || pastLessons.length > 0 || cancelledLessons.length > 0;

  const bookingByIdMap = useMemo(() => {
    const map = new Map<string, MonthlyBooking>();
    for (const b of monthlyBookings) {
      if (b.id) map.set(b.id, b);
    }
    return map;
  }, [monthlyBookings]);

  // Abonos confirmados que aún no tienen sala Google Meet válida (o tienen clases sin sincronizar)
  const confirmedBookingsNeedingMeet = useMemo(() => {
    return monthlyBookings.filter((b) => {
      if (!b.id || b.status !== 'confirmed') return false;
      if (!isValidMeetUrl(b.meetUrl)) return true;

      const linkedActiveLessons = lessons.filter(
        (l) =>
          (l as any).monthlyBookingId === b.id &&
          l.status !== 'cancelled' &&
          l.status !== 'expired'
      );
      return linkedActiveLessons.some((l) => !isValidMeetUrl(l.meetUrl));
    });
  }, [monthlyBookings, lessons]);

  const classifyMeetProvisionError = (
    err: any
  ): { message: string; isUncertain: boolean } => {
    const code = String(err?.code || '').toLowerCase();
    const rawMsg = String(err?.message || '');
    const lower = rawMsg.toLowerCase();

    if (code.includes('unauthenticated')) {
      resetMeetTokenCache();
      return {
        message:
          'Tu autorización de Google Meet venció o no es válida. Hacé clic en "Reintentar sala Meet" para volver a autorizar con tu cuenta de Google.',
        isUncertain: false,
      };
    }

    if (
      code.includes('popup-closed-by-user') ||
      code.includes('cancelled-popup-request') ||
      code.includes('popup-blocked')
    ) {
      return {
        message: rawMsg || 'No se completó la ventana de autorización de Google Meet.',
        isUncertain: false,
      };
    }

    if (
      code.includes('deadline-exceeded') ||
      lower.includes('incierto') ||
      lower.includes('salas duplicadas')
    ) {
      return {
        message:
          rawMsg ||
          'El servidor no pudo confirmar si Google Meet creó la sala debido a un timeout. Para evitar salas duplicadas, el reintento automático está bloqueado.',
        isUncertain: true,
      };
    }

    if (code.includes('aborted')) {
      return {
        message:
          rawMsg ||
          'Ya hay otra solicitud generando la sala de Google Meet para este abono. Esperá unos segundos y verificá nuevamente.',
        isUncertain: false,
      };
    }

    return {
      message:
        rawMsg && !rawMsg.includes('INTERNAL')
          ? rawMsg
          : 'No se pudo generar la sala de Google Meet en este momento. El pago sigue confirmado y podés reintentarlo cuando quieras.',
      isUncertain: false,
    };
  };

  const handleProvisionMeetForBooking = async (
    bookingId: string,
    bookingHasExistingValidUrl = false
  ) => {
    if (!bookingId || provisioningBookingIds[bookingId]) return;

    setProvisioningBookingIds((prev) => ({ ...prev, [bookingId]: true }));
    setMeetProvisionWarning(null);
    setConfirmSuccessMessage(null);

    try {
      let accessToken: string | undefined;
      if (!bookingHasExistingValidUrl) {
        accessToken = await getGoogleMeetAccessToken();
      }
      const res = await provisionMonthlyBookingMeet(bookingId, accessToken);
      setConfirmSuccessMessage(
        res.alreadyProvisioned
          ? 'La sala única de Google Meet de este abono quedó sincronizada en todas sus clases.'
          : '¡Sala única de Google Meet generada y vinculada exclusivamente a este abono!'
      );
      await loadData();
    } catch (err: any) {
      console.warn('Aviso al provisionar sala Meet para abono:', err);
      const parsed = classifyMeetProvisionError(err);
      setMeetProvisionWarning({
        bookingId,
        message: parsed.message,
        isUncertain: parsed.isUncertain,
      });
      await loadData();
    } finally {
      setProvisioningBookingIds((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
    }
  };

  const renderLessonCard = (lesson: Lesson) => {
    const isPendingPayment = (lesson as any).paymentStatus === 'pending_confirmation';
    const isConfirmedPayment = (lesson as any).paymentStatus === 'confirmed';
    const temporalState = getLessonTemporalState(lesson, nowMs);
    const meetAccess = evaluateLessonMeetAccess(lesson, nowMs);
    const durationMinutes = resolveLessonDurationMinutes(lesson);
    const isCancelled = temporalState.phase === 'cancelled';

    const canProvisionMissingMeet =
      !isCancelled &&
      meetAccess.reason === 'invalid_url' &&
      isConfirmedPayment &&
      Boolean((lesson as any).monthlyBookingId);

    const temporalBadgeClass =
      temporalState.phase === 'in_progress'
        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold'
        : temporalState.phase === 'past'
        ? 'bg-slate-100 text-slate-600 border border-slate-200 font-semibold'
        : temporalState.phase === 'cancelled'
        ? 'bg-rose-100 text-rose-800 border border-rose-200 font-bold'
        : 'bg-[#FFEAA7] text-[#7A5A00] font-semibold';

    const studentDisplayName =
      lesson.studentName ||
      students.find((s) => s.uid === lesson.studentId)?.name ||
      'Alumno';

    return (
      <div
        key={lesson.id}
        id={`lesson-card-${lesson.id}`}
        className={`bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative group ${
          temporalState.phase === 'in_progress'
            ? 'border-emerald-200'
            : isCancelled
            ? 'border-rose-200/80 bg-white/90'
            : 'border-slate-100'
        }`}
      >
        {/* Lado Izquierdo: Icono Musical + Información de la Clase */}
        <div className="flex items-center gap-4 sm:gap-5 min-w-0">
          <div
            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center shrink-0 ${
              isCancelled
                ? 'bg-rose-50 text-rose-500'
                : temporalState.phase === 'past'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-[#DDF1F8] text-[#00537A]'
            }`}
          >
            <Music className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2]" />
          </div>

          <div className="min-w-0 flex-1">
            {/* Indicador Visual Temporal + Estado de Pago */}
            <div className="flex items-center gap-2 mb-2 flex-wrap select-none">
              <div
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full ${temporalBadgeClass}`}
              >
                {temporalState.phase === 'in_progress' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
                <span>{temporalState.label}</span>
              </div>
              {!isCancelled && isPendingPayment && (
                <div className="inline-flex items-center bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  <Clock className="w-3 h-3 mr-1 text-amber-700" />
                  <span>Transferencia por confirmar</span>
                </div>
              )}
              {!isCancelled && isConfirmedPayment && (
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

            {/* Datos de la clase: Alumno, Fecha y Duración */}
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 mt-1.5 font-siemreap"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Alumno/a:</span>
                <span className="font-semibold text-slate-800 truncate">
                  {studentDisplayName}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{formatLessonDateTime(lesson.date)}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{durationMinutes} min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Derecho: Acceso a la clase (Google Meet y Aula virtual) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          {/* Botón Meet: Reglas idénticas para profesor y alumno */}
          {meetAccess.canJoin && meetAccess.meetUrl ? (
            <a
              id={`btn-join-lesson-${lesson.id}`}
              href={meetAccess.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white font-semibold text-sm sm:text-base px-6 sm:px-7 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4 shrink-0" />
              <span>Unirse a Meet</span>
            </a>
          ) : meetAccess.reason === 'before_start' ? (
            <div className="flex flex-col items-stretch sm:items-center gap-1">
              <button
                id={`btn-join-lesson-${lesson.id}`}
                type="button"
                disabled
                aria-disabled="true"
                title={meetAccess.availabilityMessage || undefined}
                className="bg-slate-200 text-slate-500 font-semibold text-sm sm:text-base px-6 sm:px-7 py-2.5 rounded-full shadow-2xs cursor-not-allowed whitespace-nowrap text-center flex items-center justify-center gap-2"
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
              className="bg-slate-200 text-slate-500 font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-2xs cursor-not-allowed whitespace-nowrap text-center"
            >
              Meet (Pendiente de pago)
            </button>
          ) : canProvisionMissingMeet ? (
            (() => {
              const bookingId = String((lesson as any).monthlyBookingId);
              const linkedBooking = bookingByIdMap.get(bookingId);
              const isUncertain = linkedBooking?.meetProvisioningStatus === 'uncertain';
              const isBookingProvisioning = Boolean(provisioningBookingIds[bookingId]);
              const bookingHasExistingUrl = isValidMeetUrl(linkedBooking?.meetUrl);

              if (isUncertain) {
                return (
                  <span
                    title="La solicitud previa a Google Meet quedó en estado incierto para evitar salas duplicadas"
                    className="bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs px-4 py-2.5 rounded-full whitespace-nowrap text-center"
                  >
                    Meet en revisión
                  </span>
                );
              }

              return (
                <button
                  id={`btn-provision-lesson-meet-${lesson.id}`}
                  type="button"
                  disabled={isBookingProvisioning}
                  onClick={() =>
                    handleProvisionMeetForBooking(bookingId, bookingHasExistingUrl)
                  }
                  className="bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap text-center flex items-center justify-center gap-2"
                >
                  {isBookingProvisioning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Generando Meet...</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4 shrink-0" />
                      <span>
                        {bookingHasExistingUrl ? 'Sincronizar Meet' : 'Generar sala Meet'}
                      </span>
                    </>
                  )}
                </button>
              );
            })()
          ) : null}

          {/* Botón Aula Virtual */}
          {!isCancelled && (
            <button
              id={`btn-view-lesson-${lesson.id}`}
              type="button"
              onClick={() => onNavigate(`/lesson/${lesson.id}`)}
              className={`${
                meetAccess.canJoin || canProvisionMissingMeet
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  : 'bg-[#00537A] hover:bg-[#004262] text-white'
              } active:scale-95 font-semibold text-sm sm:text-base px-5 sm:px-6 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-1.5`}
            >
              <span>Aula virtual</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <TeacherLayout activeSection="dashboard" onNavigate={onNavigate} onRefreshData={loadData}>
      {/* Alerta flotante de éxito al confirmar pago o generar Meet */}
      {confirmSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{confirmSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerta no bloqueante si el pago quedó confirmado pero falló la generación de Meet */}
      {meetProvisionWarning && (
        <div
          id="meet-provision-warning-banner"
          className="bg-amber-50 border border-amber-200 text-amber-950 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200"
        >
          <div className="flex items-start gap-2.5 text-xs sm:text-sm font-semibold">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <span>{meetProvisionWarning.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!meetProvisionWarning.isUncertain && (
              <button
                type="button"
                disabled={Boolean(provisioningBookingIds[meetProvisionWarning.bookingId])}
                onClick={() => handleProvisionMeetForBooking(meetProvisionWarning.bookingId)}
                className="px-3.5 py-2 rounded-xl bg-[#00537A] hover:bg-[#004262] text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {provisioningBookingIds[meetProvisionWarning.bookingId] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Video className="w-3.5 h-3.5" />
                )}
                <span>Reintentar sala Meet</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMeetProvisionWarning(null)}
              className="text-amber-700 hover:text-amber-900 p-1 cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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

      {/* CENTRO DE NOTICIAS Y RECORDATORIOS IMPORTANTES */}
      <NotificationCenter
        id="teacher-news-banner"
        role="teacher"
        loading={loadingBookings}
        bookings={monthlyBookings}
        studentNameById={studentNameById}
        onConfirmPayment={handleOpenConfirmPaymentModal}
      />

      {(expiredBookings.length > 0 || confirmedBookingsNeedingMeet.length > 0) && (
        <div className="space-y-4">
          {/* HISTORIAL DE ABONOS CON PLAZO VENCIDO (Liberados automáticamente) */}
          {expiredBookings.length > 0 && (
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-[20px] p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setShowExpiredBookingsHistory((prev) => !prev)}
              className="w-full flex items-center justify-between text-left text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Historial de abonos con plazo vencido ({expiredBookings.length})</span>
                <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">
                  — Horarios liberados automáticamente para nuevas reservas
                </span>
              </div>
              <span className="text-xs text-[#00537A] font-extrabold shrink-0 ml-2">
                {showExpiredBookingsHistory ? 'Ocultar historial' : 'Ver historial'}
              </span>
            </button>

            {showExpiredBookingsHistory && (
              <div className="mt-3.5 space-y-2.5 pt-3.5 border-t border-slate-200/70 animate-in fade-in duration-200">
                {expiredBookings.map((b) => {
                  const studentName =
                    b.studentName ||
                    students.find((s) => s.uid === b.studentId)?.name ||
                    'Alumno';
                  const schedules = getDistinctSchedulesSummary(b);
                  const totalAmount = (b.totalPrice || b.price || 0).toLocaleString('es-AR');

                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-800">{b.month}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-slate-700">{studentName}</span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                            Plazo de 24h vencido
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px]">
                          {schedules} ({b.totalLessons} clases) — Los horarios ya están libres para otros alumnos.
                        </p>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <span className="font-extrabold text-slate-600 block">
                          $ {totalAmount} {b.currency || 'ARS'}
                        </span>
                        <span className="text-[10px] text-slate-400">Transferencia no confirmada</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* RECUPERACIÓN DE ABONOS CONFIRMADOS SIN SALA GOOGLE MEET */}
        {confirmedBookingsNeedingMeet.length > 0 && (
          <div
            id="confirmed-bookings-meet-recovery"
            className="mt-4 bg-amber-50/70 border border-amber-200/90 rounded-[24px] p-5 space-y-3"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-parkinsans text-sm sm:text-base font-bold text-slate-900">
                    Abonos confirmados pendientes de sala Google Meet ({confirmedBookingsNeedingMeet.length})
                  </h4>
                  <p className="text-xs text-slate-600">
                    Generá una sala única de Google Meet para cada abono confirmado que todavía no tenga enlace asignado.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {confirmedBookingsNeedingMeet.map((booking) => {
                const bookingId = booking.id!;
                const isBookingProvisioning = Boolean(provisioningBookingIds[bookingId]);
                const isUncertain = booking.meetProvisioningStatus === 'uncertain';
                const hasExistingBookingUrl = isValidMeetUrl(booking.meetUrl);
                const studentName =
                  booking.studentName ||
                  students.find((s) => s.uid === booking.studentId)?.name ||
                  'Alumno';
                const schedules = getDistinctSchedulesSummary(booking);

                return (
                  <div
                    key={bookingId}
                    id={`recovery-booking-meet-${bookingId}`}
                    className="bg-white rounded-2xl p-4 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{studentName}</span>
                        <span className="text-xs font-semibold text-[#00537A] bg-[#E8F3F8] px-2.5 py-0.5 rounded-full">
                          {formatBookingMonth(booking.month)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {booking.totalLessons} clases
                        </span>
                        {isUncertain && (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            Estado incierto (reintento bloqueado)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{schedules}</p>
                    </div>

                    {isUncertain ? (
                      <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl shrink-0">
                        Revisión requerida por timeout previo
                      </span>
                    ) : (
                      <button
                        type="button"
                        id={`btn-provision-meet-booking-${bookingId}`}
                        disabled={isBookingProvisioning}
                        onClick={() =>
                          handleProvisionMeetForBooking(bookingId, hasExistingBookingUrl)
                        }
                        className="px-4 py-2.5 rounded-full bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                      >
                        {isBookingProvisioning ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Generando sala...</span>
                          </>
                        ) : (
                          <>
                            <Video className="w-4 h-4" />
                            <span>
                              {hasExistingBookingUrl
                                ? 'Sincronizar sala en clases'
                                : 'Generar sala Google Meet'}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      )}

      {/* SECCIÓN 2: PRÓXIMAS CLASES, CLASES PASADAS Y CANCELADAS */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3
                className="font-parkinsans text-xl sm:text-2xl font-bold text-[#00537A] tracking-tight leading-tight"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                Próximas clases
              </h3>
              {upcomingLessons.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#E8F3F8] text-[#00537A]">
                  {upcomingLessons.length}
                </span>
              )}
            </div>
            <p className="font-siemreap text-slate-500 text-xs sm:text-sm mt-0.5">
              Aquí puedes ver y gestionar tus clases programadas y en curso.
            </p>
          </div>
        </div>

        {/* LISTADO DE TARJETAS DE CLASE (Organización cronológica real) */}
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
        ) : !hasAnyDisplayableLessons ? (
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
          <div className="space-y-8">
            {/* 1. PRÓXIMAS CLASES (Futuras y en curso, orden ascendente) */}
            <section id="teacher-upcoming-lessons-section" className="space-y-4">
              {upcomingLessons.length === 0 ? (
                <div className="bg-white rounded-[24px] p-6 sm:p-8 border border-slate-100 text-center flex flex-col items-center justify-center shadow-xs">
                  <p className="font-parkinsans text-sm sm:text-base font-bold text-slate-700">
                    No tienes próximas clases programadas en este momento
                  </p>
                  <p className="font-siemreap text-xs text-slate-500 mt-1">
                    Podés consultar tus clases pasadas abajo o agendar una nueva clase.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingLessons.map((lesson) => renderLessonCard(lesson))}
                </div>
              )}
            </section>

            {/* 2. CLASES PASADAS (Finalizadas, orden descendente: más reciente primero) */}
            {pastLessons.length > 0 && (
              <section
                id="teacher-past-lessons-section"
                className="space-y-4 pt-4 border-t border-slate-200/70"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3
                    className="font-parkinsans text-xl sm:text-2xl font-bold text-slate-800 tracking-tight"
                    style={{ fontFamily: "'Parkinsans', sans-serif" }}
                  >
                    Clases pasadas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-slate-200/80 text-slate-700">
                    {pastLessons.length}
                  </span>
                </div>
                <div className="space-y-4">
                  {pastLessons.map((lesson) => renderLessonCard(lesson))}
                </div>
              </section>
            )}

            {/* 3. CLASES CANCELADAS (Conservando identificación explícita) */}
            {cancelledLessons.length > 0 && (
              <section
                id="teacher-cancelled-lessons-section"
                className="space-y-4 pt-4 border-t border-slate-200/70"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3
                    className="font-parkinsans text-lg sm:text-xl font-bold text-slate-700 tracking-tight"
                    style={{ fontFamily: "'Parkinsans', sans-serif" }}
                  >
                    Clases canceladas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800">
                    {cancelledLessons.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {cancelledLessons.map((lesson) => renderLessonCard(lesson))}
                </div>
              </section>
            )}
          </div>
        )}
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
                Al confirmar, se consolidará el lugar del alumno en la agenda y luego podrás generar
                la sala única de Google Meet exclusiva para este abono.
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
                  const bookingId = selectedBookingForConfirm?.id;
                  if (!bookingId) return;
                  setIsConfirming(true);
                  setConfirmError(null);
                  setMeetProvisionWarning(null);

                  // 1. Confirmar el pago PRIMERO en el backend (siempre independiente de Google Meet)
                  try {
                    await confirmMonthlyBookingPayment(bookingId);
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
                    setIsConfirming(false);
                    return;
                  }

                  // Pago confirmado exitosamente: cerrar modal y actualizar vistas
                  setIsConfirmModalOpen(false);
                  setSelectedBookingForConfirm(null);
                  setIsConfirming(false);

                  // 2. Solicitar token OAuth y provisionar sala única de Google Meet para este abono
                  setProvisioningBookingIds((prev) => ({ ...prev, [bookingId]: true }));
                  try {
                    const token = await getGoogleMeetAccessToken();
                    await provisionMonthlyBookingMeet(bookingId, token);
                    setConfirmSuccessMessage(
                      '¡Pago confirmado exitosamente! Se generó una sala única de Google Meet exclusiva para todas las clases de este abono.'
                    );
                  } catch (meetErr: any) {
                    console.warn(
                      'Pago confirmado, pero no se pudo completar la generación de Google Meet:',
                      meetErr
                    );
                    const parsed = classifyMeetProvisionError(meetErr);
                    setConfirmSuccessMessage(
                      '¡Pago confirmado exitosamente! Las clases del alumno quedaron habilitadas en tu agenda.'
                    );
                    setMeetProvisionWarning({
                      bookingId,
                      message: `El pago fue confirmado correctamente, pero quedó pendiente la sala Google Meet: ${parsed.message}`,
                      isUncertain: parsed.isUncertain,
                    });
                  } finally {
                    setProvisioningBookingIds((prev) => {
                      const next = { ...prev };
                      delete next[bookingId];
                      return next;
                    });
                    await loadData();
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
