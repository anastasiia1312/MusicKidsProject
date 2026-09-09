import React, { useState, useEffect } from 'react';
import {
  Plus,
  Music,
  User,
  ArrowRight,
  Megaphone,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTeacherLessons, getStudents } from '../../services/lessonService';
import { getLessonTimingLabel } from '../../utils/dateUtils';
import type { Lesson } from '../../types/lesson';
import type { UserProfile } from '../../types/auth';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';

interface TeacherDashboardProps {
  onNavigate: (path: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [, setStudents] = useState<UserProfile[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);

  const loadData = async () => {
    if (!user?.uid) return;

    // Cargar clases del profesor
    setLoadingLessons(true);
    setLessonsError(null);
    try {
      const teacherLessons = await getTeacherLessons(user.uid);
      setLessons(teacherLessons);
    } catch (err: any) {
      console.error('Error al cargar clases del profesor:', err);
      setLessonsError('No pudimos cargar las clases. Intentá nuevamente.');
    } finally {
      setLoadingLessons(false);
    }

    // Mantener la carga de lista de alumnos para consistencia de datos
    try {
      const studentList = await getStudents();
      setStudents(studentList);
    } catch (err: any) {
      console.error('Error al cargar lista de alumnos:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  return (
    <TeacherLayout
      activeSection="dashboard"
      onNavigate={onNavigate}
      onRefreshData={loadData}
    >
      {/* Cabecera de la Sección Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            id="main-section-title"
            className="font-parkinsans text-2xl sm:text-3xl font-bold text-[#00537A] tracking-tight leading-tight"
            style={{ fontFamily: "'Parkinsans', sans-serif" }}
          >
            Tus próximas clases
          </h2>
          <p
            className="font-siemreap text-slate-500 text-sm sm:text-base mt-1"
            style={{ fontFamily: "'Siemreap', sans-serif" }}
          >
            Aquí puedes ver y gestionar tus clases programadas.
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
              <h3
                className="font-parkinsans text-lg sm:text-xl font-bold text-slate-800 mb-1"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                Todavía no tienes clases programadas
              </h3>
              <p
                className="font-siemreap text-xs sm:text-sm text-slate-500 max-w-md mb-6"
                style={{ fontFamily: "'Siemreap', sans-serif" }}
              >
                Comienza agendando tu primera clase particular de música con cualquiera de tus alumnos registrados.
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
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  id={`lesson-card-${lesson.id}`}
                  className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative group"
                >
                  {/* Lado Izquierdo: Icono Musical + Información de la Clase */}
                  <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                    {/* Icono musical en contenedor celeste */}
                    <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-[#DDF1F8] text-[#00537A] flex items-center justify-center shrink-0">
                      <Music className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2]" />
                    </div>

                    {/* Información */}
                    <div className="min-w-0 flex-1">
                      {/* Indicador Temporal Amarillo del Mockup */}
                      <div className="inline-flex items-center bg-[#FFEAA7] text-[#7A5A00] text-xs font-semibold px-3 py-1 rounded-full mb-2 select-none">
                        {getLessonTimingLabel(lesson.date)}
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

                      {/* Alumno/a */}
                      <div
                        className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 mt-1 font-siemreap"
                        style={{ fontFamily: "'Siemreap', sans-serif" }}
                      >
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Alumno/a:</span>
                        <span className="font-semibold text-slate-800 truncate">
                          {lesson.studentName || 'Alumno'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Derecho: Acceso a la clase (Unirse a la clase y Aula virtual) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {/* Botón "Unirse a la clase" (#00537A) */}
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
              ))}
            </div>
          )}

          {/* BLOQUE INFERIOR: NOTICIAS O RECORDATORIOS IMPORTANTES (Mockup) */}
          <div
            id="teacher-news-banner"
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
                Aquí aparecerán avisos, novedades y recordatorios.
              </p>
            </div>
          </div>
    </TeacherLayout>
  );
};
