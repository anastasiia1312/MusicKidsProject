import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  LogOut,
  Music,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navbar } from '../../components/common/Navbar';
import { LessonCard } from '../../components/lessons/LessonCard';
import { getStudentLessons } from '../../services/lessonService';
import type { Lesson } from '../../types/lesson';

interface StudentDashboardProps {
  onNavigate: (path: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigate }) => {
  const { userProfile, user, logout } = useAuth();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);

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

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Elementos ambientales */}
      <div className="absolute top-20 left-20 w-48 h-48 bg-emerald-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 right-20 w-64 h-64 bg-indigo-100/50 rounded-full blur-3xl pointer-events-none"></div>

      <Navbar onNavigate={onNavigate} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        {/* Banner de Bienvenida */}
        <div
          id="student-welcome-banner"
          className="relative overflow-hidden bg-[#059669] rounded-3xl p-6 sm:p-10 text-white shadow-2xl shadow-emerald-100/50 mb-8"
        >
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-emerald-100 uppercase tracking-wider mb-3">
                <BookOpen className="w-3.5 h-3.5" />
                Rol: Alumno
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
                Hola, {userProfile?.name || 'Alumno'} 👋
              </h1>
              <p className="mt-2 text-emerald-100 text-sm sm:text-base max-w-xl">
                Panel del alumno. Aquí encontrarás todas tus clases particulares de música agendadas por tus profesores.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                id="student-logout-btn"
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white text-slate-800 font-bold text-sm shadow-md hover:bg-emerald-50 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          <div className="absolute -right-6 -bottom-8 opacity-10 pointer-events-none">
            <Music className="w-64 h-64 text-white" />
          </div>
        </div>

        {/* Sección de Próximas Clases */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Mis próximas clases</h2>
                <p className="text-xs text-slate-500">Clases agendadas con tu profesor de música</p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadStudentLessons}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Actualizar clases"
            >
              <RefreshCw className={`w-4 h-4 ${loadingLessons ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Estados de la Lista de Clases */}
          {loadingLessons ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/80 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-sm font-medium">Cargando clases...</span>
            </div>
          ) : lessonsError ? (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center flex flex-col items-center gap-3">
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
          ) : lessons.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/80 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                Todavía no tenés clases programadas.
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Cuando tu profesor programe una nueva clase particular, aparecerá aquí automáticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {lessons.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  viewerRole="student"
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="h-12 w-full bg-white border-t border-slate-100 flex items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 shrink-0">
        © 2024 MusicKids Academy
      </footer>
    </div>
  );
};
