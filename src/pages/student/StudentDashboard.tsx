import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Music,
  User,
  Megaphone,
  ChevronDown,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  Video,
  ArrowRight,
  Compass,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getStudentLessons } from '../../services/lessonService';
import { formatLessonDateTime } from '../../utils/dateUtils';
import {
  evaluateLessonMeetAccess,
  getLessonTemporalState,
  organizeLessonsChronologically,
  resolveLessonDurationMinutes,
} from '../../utils/meetValidation';
import { useLessonTimeTick } from '../../hooks/useLessonTimeTick';
import { StudentLayout } from '../../components/student/StudentLayout';
import type { Lesson } from '../../types/lesson';

interface StudentDashboardProps {
  onNavigate: (path: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [showExpiredLessonsHistory, setShowExpiredLessonsHistory] = useState(false);

  // Actualización automática en transiciones de inicio/fin de clases sin recargar
  const nowMs = useLessonTimeTick(lessons);

  // Organización cronológica centralizada (idéntica a TeacherDashboard)
  const { upcomingLessons, pastLessons, cancelledLessons, expiredLessons } = useMemo(
    () => organizeLessonsChronologically(lessons, nowMs),
    [lessons, nowMs]
  );

  const hasAnyDisplayableLessons =
    upcomingLessons.length > 0 || pastLessons.length > 0 || cancelledLessons.length > 0;

  const loadStudentLessons = async () => {
    if (!user?.uid) return;

    setLoadingLessons(true);
    setLessonsError(null);
    try {
      const studentLessons = await getStudentLessons(user.uid);
      setLessons(studentLessons);
    } catch (err: any) {
      console.error('Error al cargar clases del alumno:', err);
      setLessonsError('No pudimos cargar las clases. Intentá nuevamente.');
    } finally {
      setLoadingLessons(false);
    }
  };

  useEffect(() => {
    loadStudentLessons();
  }, [user?.uid]);

  const renderLessonCard = (lesson: Lesson) => {
    const isPendingPayment = (lesson as any).paymentStatus === 'pending_confirmation';
    const isConfirmedPayment =
      (lesson as any).paymentStatus === 'confirmed' ||
      (!(lesson as any).paymentStatus && (lesson as any).bookingType === 'manual');
    const temporalState = getLessonTemporalState(lesson, nowMs);
    const meetAccess = evaluateLessonMeetAccess(lesson, nowMs);
    const durationMinutes = resolveLessonDurationMinutes(lesson);
    const isCancelled = temporalState.phase === 'cancelled';

    const temporalBadgeClass =
      temporalState.phase === 'in_progress'
        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold'
        : temporalState.phase === 'past'
        ? 'bg-slate-100 text-slate-600 border border-slate-200 font-semibold'
        : temporalState.phase === 'cancelled'
        ? 'bg-rose-100 text-rose-800 border border-rose-200 font-bold'
        : 'bg-[#FFEAA7] text-[#7A5A00] font-semibold';

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
          {/* Icono musical */}
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

          {/* Información */}
          <div className="min-w-0 flex-1">
            {/* Badges de estado visual temporal y pago */}
            <div className="flex flex-wrap items-center gap-2 mb-2 select-none">
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
            <h3
              onClick={() => onNavigate(`/lesson/${lesson.id}`)}
              className="font-parkinsans text-lg sm:text-xl font-bold text-slate-900 truncate hover:text-[#00537A] transition-colors cursor-pointer"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
              title="Entrar al aula de la clase"
            >
              {lesson.title}
            </h3>

            {/* Datos de la clase: Profesor, Fecha y Duración */}
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 mt-1.5 font-siemreap"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Profesor/a:</span>
                <span className="font-semibold text-slate-800 truncate">
                  {lesson.teacherName || 'Profesor'}
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
              id={`btn-meet-lesson-${lesson.id}`}
              href={meetAccess.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white font-semibold text-sm sm:text-base px-5 sm:px-6 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4 shrink-0" />
              <span>Unirse a Meet</span>
            </a>
          ) : meetAccess.reason === 'before_start' ? (
            <div className="flex flex-col items-stretch sm:items-center gap-1">
              <button
                id={`btn-meet-lesson-${lesson.id}`}
                type="button"
                disabled
                aria-disabled="true"
                title={meetAccess.availabilityMessage || undefined}
                className="bg-slate-200 text-slate-500 font-semibold text-sm sm:text-base px-5 sm:px-6 py-2.5 rounded-full shadow-2xs cursor-not-allowed whitespace-nowrap text-center flex items-center justify-center gap-2"
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
              title="Se habilitará Google Meet una vez que el profesor confirme la recepción del pago"
              className="bg-slate-200 text-slate-500 font-semibold text-xs sm:text-sm px-4 sm:px-5 py-2.5 rounded-full shadow-2xs cursor-not-allowed whitespace-nowrap text-center"
            >
              Meet (Pendiente de pago)
            </button>
          ) : null}

          {/* Botón Aula Virtual: Siempre disponible e independiente */}
          {!isCancelled && (
            <button
              id={`btn-view-lesson-${lesson.id}`}
              type="button"
              onClick={() => onNavigate(`/lesson/${lesson.id}`)}
              className={`${
                meetAccess.canJoin
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
    <StudentLayout
      activeSection="dashboard"
      onNavigate={onNavigate}
      onRefreshData={loadStudentLessons}
    >
      {/* BANNER DESTACADO: BUSCAR PROFESORES */}
          <div
            id="student-search-teachers-banner"
            className="bg-linear-to-r from-[#00537A] to-[#08638F] text-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden"
          >
            <div className="relative z-10 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[#FFEAA7] text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#FFB800]" />
                <span>Catálogo de Clases Particulares</span>
              </div>
              <h3
                className="font-parkinsans text-xl sm:text-2xl font-bold tracking-tight text-white"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                ¿Buscás un nuevo profesor de música?
              </h3>
              <p
                className="font-siemreap text-white/85 text-xs sm:text-sm mt-1"
                style={{ fontFamily: "'Siemreap', sans-serif" }}
              >
                Conocé a los profesores de música disponibles en MusicKids.
              </p>
            </div>

            <button
              id="btn-search-teachers-main"
              type="button"
              onClick={() => onNavigate('/student/teachers')}
              className="relative z-10 bg-[#FFB800] hover:bg-[#FAB816] active:scale-95 text-[#00537A] font-bold text-xs sm:text-sm px-5 sm:px-6 py-2.5 sm:py-3 rounded-full shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 shrink-0"
            >
              <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-[#00537A]" />
              <span>Buscar profesores</span>
            </button>
          </div>

          {/* Cabecera de la Sección Principal */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  id="main-section-title"
                  className="font-parkinsans text-2xl sm:text-3xl font-bold text-[#00537A] tracking-tight leading-tight"
                  style={{ fontFamily: "'Parkinsans', sans-serif" }}
                >
                  Próximas clases
                </h2>
                {upcomingLessons.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#E8F3F8] text-[#00537A]">
                    {upcomingLessons.length}
                  </span>
                )}
              </div>
              <p
                className="font-siemreap text-slate-500 text-sm sm:text-base mt-1"
                style={{ fontFamily: "'Siemreap', sans-serif" }}
              >
                Aquí puedes ver y acceder a tus clases particulares programadas y en curso.
              </p>
            </div>

            {/* Botón de actualizar clases */}
            <button
              id="btn-refresh-student-lessons"
              type="button"
              onClick={loadStudentLessons}
              className="bg-white hover:bg-slate-50 active:scale-95 text-slate-700 hover:text-[#00537A] font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-full border border-slate-200/90 shadow-2xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto shrink-0"
              title="Actualizar clases"
            >
              <RefreshCw className={`w-4 h-4 ${loadingLessons ? 'animate-spin text-[#00537A]' : 'text-slate-400'}`} />
              <span>Actualizar</span>
            </button>
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
                onClick={loadStudentLessons}
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
              <h3
                className="font-parkinsans text-lg sm:text-xl font-bold text-slate-800 mb-1"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                Todavía no tienes clases programadas
              </h3>
              <p
                className="font-siemreap text-xs sm:text-sm text-slate-500 max-w-md"
                style={{ fontFamily: "'Siemreap', sans-serif" }}
              >
                Cuando tu profesor programe una nueva clase particular de música, aparecerá aquí para que puedas unirte.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* 1. PRÓXIMAS CLASES (Futuras y en curso, orden ascendente) */}
              <section id="student-upcoming-lessons-section" className="space-y-4">
                {upcomingLessons.length === 0 ? (
                  <div className="bg-white rounded-[24px] p-6 sm:p-8 border border-slate-100 text-center flex flex-col items-center justify-center shadow-xs">
                    <p className="font-parkinsans text-sm sm:text-base font-bold text-slate-700">
                      No tienes próximas clases programadas en este momento
                    </p>
                    <p className="font-siemreap text-xs text-slate-500 mt-1">
                      Podés revisar tus clases pasadas abajo o reservar un nuevo abono con un profesor.
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
                  id="student-past-lessons-section"
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
                  id="student-cancelled-lessons-section"
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

          {/* HISTORIAL DE RESERVAS EXPIRADAS / VENCIDAS (Si existen) */}
          {expiredLessons.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-[20px] p-4 sm:p-5 mt-2">
              <button
                type="button"
                onClick={() => setShowExpiredLessonsHistory((prev) => !prev)}
                className="w-full flex items-center justify-between text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                    Historial de reservas vencidas ({expiredLessons.length})
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                  <span>{showExpiredLessonsHistory ? 'Ocultar' : 'Mostrar'}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      showExpiredLessonsHistory ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {showExpiredLessonsHistory && (
                <div className="mt-4 pt-3 border-t border-slate-200 space-y-2.5">
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    Estas clases pertenecían a reservas de abonos que no recibieron confirmación de pago dentro del plazo de 24 horas y fueron liberadas para otros alumnos.
                  </p>
                  {expiredLessons.map((expired) => (
                    <div
                      key={expired.id}
                      className="bg-white/80 rounded-xl p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium text-[11px] border border-amber-200">
                          Reserva vencida (24h)
                        </span>
                        <span className="font-semibold text-slate-800">{expired.title}</span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                        <span>Profesor/a: {expired.teacherName || 'Profesor'}</span>
                        <span>•</span>
                        <span>{formatLessonDateTime(expired.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BLOQUE INFERIOR: NOTICIAS O RECORDATORIOS IMPORTANTES (Identidad MusicKids) */}
          <div
            id="student-news-banner"
            className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 flex items-center gap-5 sm:gap-6 mt-2"
          >
            {/* Megáfono visual con colores de MusicKids */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#FFF5DB] text-[#FFB800] flex items-center justify-center shrink-0">
              <Megaphone className="w-7 h-7 sm:w-8 sm:h-8 text-[#00537A] stroke-[2]" />
            </div>

            {/* Separador vertical */}
            <div className="hidden sm:block w-px h-12 bg-slate-200 shrink-0" />

            {/* Texto informativo */}
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
                Aquí aparecerán tus tareas asignadas, avisos y novedades de tus profesores.
              </p>
            </div>
          </div>
    </StudentLayout>
  );
};

