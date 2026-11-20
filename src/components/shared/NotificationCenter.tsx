import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Clock,
  CreditCard,
  BookOpen,
  ArrowRight,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  Info,
  Calendar,
  User,
} from 'lucide-react';
import type {
  MonthlyBooking,
  PendingBookingBankDetailsResult,
} from '../../types/monthlyBooking';
import type { Task } from '../../types/task';

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

function toTimestampMs(val: any): number | null {
  if (!val) return null;
  if (typeof val?.toMillis === 'function') {
    const ms = val.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null;
  }
  const d = new Date(val);
  return !isNaN(d.getTime()) ? d.getTime() : null;
}

function formatBookingMonth(monthStr?: string): string {
  if (!monthStr) return 'Mes no especificado';
  const parts = monthStr.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return `${MONTH_NAMES_SPANISH[monthNum - 1]} ${year}`;
    }
  }
  return monthStr;
}

function formatDateTimeAR(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnlyAR(ms: number | null): string | null {
  if (ms === null) return null;
  const d = new Date(ms);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatRemainingTime(expiresAtMs: number, nowMs: number): string {
  const diffMs = expiresAtMs - nowMs;
  if (diffMs <= 0) return 'Vencida';
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) return 'Vence en menos de 1 min';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `Vence en ${mins} min`;
  return `Vence en ${hours}h ${mins}m`;
}

function formatAmountARS(booking: MonthlyBooking): string {
  const raw = Number(booking.totalPrice ?? booking.price ?? 0);
  const safeAmount = Number.isFinite(raw) ? raw : 0;
  return `$ ${safeAmount.toLocaleString('es-AR')} ${booking.currency || 'ARS'}`;
}

function isBookingPendingAndActive(booking: MonthlyBooking, nowMs: number): boolean {
  if (
    booking.status !== 'pending_payment_confirmation' &&
    booking.status !== 'pending_payment'
  ) {
    return false;
  }
  const expiresAtMs = toTimestampMs(booking.expiresAt);
  if (expiresAtMs === null) return false;
  return expiresAtMs > nowMs;
}

interface TeacherNotificationCenterProps {
  role: 'teacher';
  id?: string;
  loading?: boolean;
  bookings: MonthlyBooking[];
  studentNameById: Record<string, string>;
  onConfirmPayment: (booking: MonthlyBooking) => void;
}

interface StudentNotificationCenterProps {
  role: 'student';
  id?: string;
  loading?: boolean;
  bookings: MonthlyBooking[];
  teacherNameById: Record<string, string>;
  bankDetailsByBookingId: Record<string, PendingBookingBankDetailsResult>;
  loadingBankDetailsByBookingId?: Record<string, boolean>;
  tasks: Task[];
  onNavigate: (path: string) => void;
}

export type NotificationCenterProps =
  | TeacherNotificationCenterProps
  | StudentNotificationCenterProps;

export const NotificationCenter: React.FC<NotificationCenterProps> = (props) => {
  const { role, id, loading = false, bookings } = props;
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null);

  // Filtrar y deduplicar reservas pendientes vigentes (excluyendo expiradas), más urgentes primero
  const activePendingBookings = useMemo(() => {
    const uniqueMap = new Map<string, { booking: MonthlyBooking; expiresAtMs: number }>();

    for (const booking of bookings) {
      const bookingId = booking.id?.trim();
      if (!bookingId || uniqueMap.has(bookingId)) continue;
      if (!isBookingPendingAndActive(booking, nowMs)) continue;

      const expiresAtMs = toTimestampMs(booking.expiresAt);
      if (expiresAtMs === null) continue;
      uniqueMap.set(bookingId, { booking, expiresAtMs });
    }

    return Array.from(uniqueMap.values()).sort((a, b) => a.expiresAtMs - b.expiresAtMs);
  }, [bookings, nowMs]);

  // Deduplicar tareas del alumno y ordenar por publicación más reciente primero
  const studentTasks = useMemo(() => {
    if (role !== 'student') return [];
    const seen = new Set<string>();
    const list: Array<{ task: Task; createdAtMs: number | null }> = [];

    for (const task of props.tasks) {
      const taskId = task.id?.trim();
      if (!taskId || seen.has(taskId)) continue;
      seen.add(taskId);
      list.push({ task, createdAtMs: toTimestampMs(task.createdAt) });
    }

    return list.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  }, [role, role === 'student' ? props.tasks : null]);

  // Temporizador local liviano (sin consultas a Firestore) para actualizar tiempo restante
  // y retirar automáticamente reservas que alcanzan su vencimiento de 24h
  useEffect(() => {
    if (activePendingBookings.length === 0) return;

    const currentNow = Date.now();
    const soonestExpiry = activePendingBookings[0].expiresAtMs;
    const msUntilSoonestExpiry = Math.max(250, soonestExpiry - currentNow + 300);
    const delayMs = Math.min(30_000, msUntilSoonestExpiry);

    const timer = setTimeout(() => {
      setNowMs(Date.now());
    }, delayMs);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [activePendingBookings, nowMs]);

  const handleCopyAlias = async (bookingId: string, alias: string) => {
    const cleanAlias = alias.trim();
    if (!cleanAlias) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanAlias);
      } else if (typeof document !== 'undefined') {
        const tempInput = document.createElement('textarea');
        tempInput.value = cleanAlias;
        tempInput.setAttribute('readonly', '');
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      setCopiedBookingId(bookingId);
      setTimeout(() => {
        setCopiedBookingId((prev) => (prev === bookingId ? null : prev));
      }, 2200);
    } catch {
      // Silencioso: no registrar datos bancarios ni bloquear la interfaz
    }
  };

  const totalNotifications =
    activePendingBookings.length + (role === 'student' ? studentTasks.length : 0);

  return (
    <section
      id={id}
      aria-labelledby={`${id || 'notification-center'}-title`}
      className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 mt-2 space-y-4"
    >
      {/* Cabecera reutilizando identidad visual del bloque original */}
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FFF5DB] text-[#FFB800] flex items-center justify-center shrink-0">
          <Megaphone className="w-6 h-6 sm:w-7 sm:h-7 text-[#00537A] stroke-[2]" />
        </div>

        <div className="hidden sm:block w-px h-10 bg-slate-200 shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h4
              id={`${id || 'notification-center'}-title`}
              className="font-parkinsans font-bold text-base sm:text-lg text-[#00537A]"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Noticias o recordatorios importantes
            </h4>
            {!loading && totalNotifications > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#FFEAA7] text-[#7A5A00] border border-[#FFB800]/40">
                {totalNotifications}
              </span>
            )}
          </div>
          <p
            className="font-siemreap text-slate-500 text-xs sm:text-sm mt-0.5"
            style={{ fontFamily: "'Siemreap', sans-serif" }}
          >
            {role === 'teacher'
              ? 'Recordatorios de pagos pendientes de confirmación de tus alumnos.'
              : 'Recordatorios de pagos pendientes de confirmación y tareas asignadas.'}
          </p>
        </div>
      </div>

      {/* Contenido dinámico */}
      {loading ? (
        <div className="flex items-center gap-2.5 text-slate-500 text-xs sm:text-sm bg-slate-50/80 border border-slate-100 rounded-2xl px-4 py-3.5">
          <Loader2 className="w-4 h-4 animate-spin text-[#00537A] shrink-0" />
          <span>Cargando recordatorios...</span>
        </div>
      ) : totalNotifications === 0 ? (
        <div className="bg-slate-50/70 border border-slate-100 rounded-2xl px-4 py-4 text-center sm:text-left">
          <p
            className="font-siemreap text-slate-600 text-xs sm:text-sm"
            style={{ fontFamily: "'Siemreap', sans-serif" }}
          >
            No tenés notificaciones pendientes
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 1. AVISOS PRIORITARIOS: PAGOS PENDIENTES DE CONFIRMACIÓN */}
          {role === 'teacher' &&
            activePendingBookings.map(({ booking, expiresAtMs }) => {
              const bookingId = booking.id!;
              const studentName =
                booking.studentName ||
                props.studentNameById[booking.studentId] ||
                'Alumno/a';

              return (
                <article
                  key={`teacher-pending-${bookingId}`}
                  className="bg-amber-50/55 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                        <CreditCard className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Pago pendiente de confirmación</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-amber-900 border border-amber-200/80">
                        <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                        <span>{formatRemainingTime(expiresAtMs, nowMs)}</span>
                      </span>
                    </div>

                    <p
                      className="font-parkinsans text-sm sm:text-base font-bold text-slate-900 truncate"
                      style={{ fontFamily: "'Parkinsans', sans-serif" }}
                    >
                      {studentName} · Abono {formatBookingMonth(booking.month)}
                    </p>

                    <div
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-siemreap"
                      style={{ fontFamily: "'Siemreap', sans-serif" }}
                    >
                      <span>
                        Importe:{' '}
                        <strong className="text-slate-900">{formatAmountARS(booking)}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          Vence el{' '}
                          <strong className="text-slate-800">
                            {formatDateTimeAR(expiresAtMs)}
                          </strong>
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center sm:justify-end shrink-0">
                    <button
                      id={`btn-confirm-payment-${bookingId}`}
                      type="button"
                      disabled={expiresAtMs <= nowMs}
                      onClick={() => {
                        if (expiresAtMs <= Date.now()) {
                          setNowMs(Date.now());
                          return;
                        }
                        props.onConfirmPayment(booking);
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white text-xs sm:text-sm font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Confirmar pago</span>
                    </button>
                  </div>
                </article>
              );
            })}

          {role === 'student' &&
            activePendingBookings.map(({ booking, expiresAtMs }) => {
              const bookingId = booking.id!;
              const teacherName =
                props.teacherNameById[booking.teacherId] || 'Profesor/a';
              const bankResult = props.bankDetailsByBookingId[bookingId];
              const isBankLoading = Boolean(
                props.loadingBankDetailsByBookingId?.[bookingId]
              );
              const bankDetails = bankResult?.available ? bankResult.bankDetails : null;
              const validAlias = bankDetails?.alias?.trim() || '';
              const isCopied = copiedBookingId === bookingId;

              return (
                <article
                  key={`student-pending-${bookingId}`}
                  className="bg-amber-50/55 border border-amber-200/80 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          <CreditCard className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Pago pendiente de confirmación</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-amber-900 border border-amber-200/80">
                          <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                          <span>{formatRemainingTime(expiresAtMs, nowMs)}</span>
                        </span>
                      </div>

                      <p
                        className="font-parkinsans text-sm sm:text-base font-bold text-slate-900"
                        style={{ fontFamily: "'Parkinsans', sans-serif" }}
                      >
                        Abono {formatBookingMonth(booking.month)} · Prof. {teacherName}
                      </p>

                      <div
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-siemreap"
                        style={{ fontFamily: "'Siemreap', sans-serif" }}
                      >
                        <span>
                          Importe:{' '}
                          <strong className="text-slate-900">
                            {formatAmountARS(booking)}
                          </strong>
                        </span>
                        <span>
                          Vence el{' '}
                          <strong className="text-slate-800">
                            {formatDateTimeAR(expiresAtMs)}
                          </strong>
                        </span>
                      </div>

                      <p className="text-[11px] sm:text-xs text-amber-900/90">
                        Tu reserva tiene un pago pendiente de confirmación. Si ya realizaste la
                        transferencia, aguardá a que tu profesor/a confirme la acreditación.
                      </p>
                    </div>
                  </div>

                  {/* Datos bancarios del profesor (solo si están registrados y autorizados) */}
                  <div className="bg-white/90 border border-amber-200/70 rounded-xl p-3 sm:p-3.5">
                    {isBankLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00537A] shrink-0" />
                        <span>Consultando datos bancarios para la transferencia...</span>
                      </div>
                    ) : bankDetails ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs flex-1 min-w-0">
                          <div className="min-w-0">
                            <span className="block text-[11px] font-semibold text-slate-500">
                              Titular
                            </span>
                            <span className="font-bold text-slate-800 break-words">
                              {bankDetails.accountHolder || 'No informado'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[11px] font-semibold text-slate-500">
                              Alias
                            </span>
                            <span className="font-bold text-[#00537A] break-all">
                              {validAlias || 'No informado'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[11px] font-semibold text-slate-500">
                              CBU / CVU
                            </span>
                            <span className="font-mono text-[11px] sm:text-xs font-semibold text-slate-800 break-all">
                              {bankDetails.cbuCvu || 'No informado'}
                            </span>
                          </div>
                        </div>

                        {validAlias && (
                          <button
                            type="button"
                            onClick={() => handleCopyAlias(bookingId, validAlias)}
                            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>Alias copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 shrink-0" />
                                <span>Copiar alias</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <Info className="w-4 h-4 text-[#00537A] shrink-0 mt-0.5" />
                        <span>
                          Los datos bancarios del profesor no están disponibles para consulta en
                          este momento. Si necesitás los datos para realizar la transferencia,
                          podés solicitarlos directamente a tu profesor/a.
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

          {/* 2. TAREAS Y MATERIALES ASIGNADOS AL ALUMNO */}
          {role === 'student' &&
            studentTasks.map(({ task, createdAtMs }) => {
              const publishedDate = formatDateOnlyAR(createdAtMs);

              return (
                <article
                  key={`student-task-${task.id}`}
                  className="bg-slate-50/75 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F3F8] text-[#00537A]">
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>Tareas y Materiales</span>
                      </span>
                      {publishedDate && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          Publicado el {publishedDate}
                        </span>
                      )}
                    </div>

                    <p
                      className="font-parkinsans text-sm sm:text-base font-bold text-slate-900 truncate"
                      style={{ fontFamily: "'Parkinsans', sans-serif" }}
                    >
                      {task.title}
                    </p>

                    <div
                      className="flex items-center gap-1.5 text-xs text-slate-600 font-siemreap"
                      style={{ fontFamily: "'Siemreap', sans-serif" }}
                    >
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Profesor/a:</span>
                      <span className="font-semibold text-slate-800 truncate">
                        {task.teacherName || 'Profesor/a'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center sm:justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => props.onNavigate('/student/tasks')}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#E8F3F8] text-[#00537A] border border-[#00537A]/20 active:scale-95 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span>Ver tarea</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      )}
    </section>
  );
};
