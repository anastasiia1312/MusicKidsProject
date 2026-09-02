import React, { useState, useEffect } from 'react';
import {
  Music,
  Calendar,
  Clock,
  User,
  GraduationCap,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  Video,
  PenTool,
  Piano,
  Activity,
  Mic,
  CheckCircle2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/common/Navbar';
import { Whiteboard } from '../components/whiteboard/Whiteboard';
import { VirtualPiano } from '../components/piano/VirtualPiano';
import { Metronome } from '../components/metronome/Metronome';
import { Tuner } from '../components/tuner/Tuner';
import { getLessonById } from '../services/lessonService';
import {
  formatLessonDate,
  formatLessonTime,
  getLessonStatusLabel,
} from '../utils/dateUtils';
import type { Lesson } from '../types/lesson';

interface LessonPageProps {
  lessonId: string;
  onNavigate: (path: string) => void;
}

export const LessonPage: React.FC<LessonPageProps> = ({ lessonId, onNavigate }) => {
  const { user, role } = useAuth();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadLesson() {
      if (!lessonId || !user?.uid) return;

      setLoading(true);
      setAccessDenied(false);
      setNotFound(false);

      try {
        const fetchedLesson = await getLessonById(lessonId);

        if (!isMounted) return;

        if (!fetchedLesson) {
          setNotFound(true);
          return;
        }

        // Validación de Seguridad: Solo el profesor o el alumno asignado pueden acceder
        const isAuthorized =
          fetchedLesson.teacherId === user.uid ||
          fetchedLesson.studentId === user.uid;

        if (!isAuthorized) {
          setAccessDenied(true);
          return;
        }

        setLesson(fetchedLesson);
      } catch (err: any) {
        console.error('Error al cargar la clase:', err);
        if (isMounted) {
          // Si Firestore rechaza por reglas de seguridad
          if (
            err?.message?.includes('permission-denied') ||
            err?.code === 'permission-denied'
          ) {
            setAccessDenied(true);
          } else {
            setNotFound(true);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadLesson();

    return () => {
      isMounted = false;
    };
  }, [lessonId, user?.uid]);

  const handleBack = () => {
    if (role === 'teacher') {
      onNavigate('/teacher/dashboard');
    } else if (role === 'student') {
      onNavigate('/student/dashboard');
    } else {
      onNavigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Elementos ambientales */}
      <div className="absolute top-20 left-20 w-48 h-48 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 right-20 w-64 h-64 bg-emerald-100/50 rounded-full blur-3xl pointer-events-none"></div>

      <Navbar onNavigate={onNavigate} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        {/* Botón Volver */}
        <button
          id="btn-back-from-lesson"
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Panel</span>
        </button>

        {loading ? (
          <div className="bg-white rounded-3xl p-16 border border-slate-200/80 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="text-sm font-medium">Cargando detalles de la clase...</span>
          </div>
        ) : accessDenied ? (
          <div
            id="lesson-access-denied"
            className="bg-white rounded-3xl p-10 border border-rose-200 shadow-xl shadow-rose-100/30 text-center flex flex-col items-center justify-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Acceso Denegado
            </h2>
            <p className="text-sm text-slate-500 max-w-md mb-6">
              No tienes permisos para acceder a esta clase. Solo el profesor y el alumno asignados pueden ver sus detalles.
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition cursor-pointer"
            >
              Volver a mi panel
            </button>
          </div>
        ) : notFound || !lesson ? (
          <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
              <Music className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Clase no encontrada
            </h2>
            <p className="text-sm text-slate-500 max-w-md mb-6">
              La clase solicitada no existe o ha sido eliminada.
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition cursor-pointer"
            >
              Volver a mi panel
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tarjeta Principal con Información de la Clase */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl shadow-indigo-100/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
                    <Music className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                      Detalle de la Clase
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {lesson.title}
                    </h1>
                  </div>
                </div>

                <div>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Estado: {getLessonStatusLabel(lesson.status)}
                  </span>
                </div>
              </div>

              {/* Grilla de Datos de la Clase */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6">
                {/* Profesor */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      Profesor
                    </span>
                    <p className="text-sm sm:text-base font-bold text-slate-800">
                      {lesson.teacherName || 'Profesor'}
                    </p>
                    {lesson.teacherEmail && (
                      <p className="text-xs text-slate-500">{lesson.teacherEmail}</p>
                    )}
                  </div>
                </div>

                {/* Alumno */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      Alumno
                    </span>
                    <p className="text-sm sm:text-base font-bold text-slate-800">
                      {lesson.studentName || 'Alumno'}
                    </p>
                    {lesson.studentEmail && (
                      <p className="text-xs text-slate-500">{lesson.studentEmail}</p>
                    )}
                  </div>
                </div>

                {/* Fecha y Hora */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      Fecha y Hora
                    </span>
                    <p className="text-sm sm:text-base font-bold text-slate-800">
                      {formatLessonDate(lesson.date)} a las {formatLessonTime(lesson.date)} hs
                    </p>
                  </div>
                </div>

                {/* Duración */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      Duración
                    </span>
                    <p className="text-sm sm:text-base font-bold text-slate-800">
                      {lesson.duration} minutos
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sección de Videollamada Google Meet */}
            <div
              id="lesson-meet-section"
              className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl shadow-indigo-100/30"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-100 shrink-0">
                    <Video className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Videollamada en vivo
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500">
                      Espacio oficial de Google Meet asignado a esta clase.
                    </p>
                  </div>
                </div>

                {lesson.meetUrl ? (
                  <a
                    id="btn-open-lesson-meet"
                    href={lesson.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 active:scale-[0.99] transition cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>
                      {role === 'teacher' || user?.uid === lesson.teacherId
                        ? 'Iniciar Google Meet'
                        : 'Unirse a Google Meet'}
                    </span>
                    <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
                  </a>
                ) : (
                  <div className="text-xs font-semibold text-slate-400 bg-slate-100 px-4 py-2.5 rounded-xl">
                    Enlace de Google Meet no disponible
                  </div>
                )}
              </div>
            </div>

            {/* Pizarra interactiva de la clase */}
            <Whiteboard />

            {/* Piano virtual interactivo de la clase */}
            <VirtualPiano />

            {/* Metrónomo digital interactivo de la clase */}
            <Metronome />

            {/* Afinador digital interactivo de la clase */}
            <Tuner />

            {/* Herramientas de la clase (Próximamente) */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl shadow-indigo-100/30">
              <div className="flex items-center gap-2.5 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  Herramientas de la clase
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mb-6">
                Próximamente estarán disponibles las siguientes herramientas interactivas en tiempo real:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3 text-slate-600">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block">Google Meet</span>
                    <span className="text-[11px] text-slate-400">Videollamada en vivo</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3 text-slate-600">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block">Pizarra musical</span>
                    <span className="text-[11px] text-slate-400">Partituras colaborativas</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3 text-slate-600">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Piano className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block">Piano virtual</span>
                    <span className="text-[11px] text-slate-400">Teclado interactivo</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3 text-slate-600">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block">Metrónomo</span>
                    <span className="text-[11px] text-slate-400">Tempo y ritmo sincrónico</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3 text-slate-600">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-800 block">Afinador</span>
                    <span className="text-[11px] text-slate-400">Detección de frecuencias</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="h-12 w-full bg-white border-t border-slate-100 flex items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 shrink-0">
        © 2024 MusicKids Academy
      </footer>
    </div>
  );
};
