import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Users,
  Calendar,
  PlusCircle,
  LogOut,
  Music,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navbar } from '../../components/common/Navbar';
import { LessonCard } from '../../components/lessons/LessonCard';
import { StudentCard } from '../../components/teacher/StudentCard';
import { getTeacherLessons, getStudents } from '../../services/lessonService';
import type { Lesson } from '../../types/lesson';
import type { UserProfile } from '../../types/auth';

interface TeacherDashboardProps {
  onNavigate: (path: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const { userProfile, user, logout } = useAuth();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);

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

    // Cargar lista de alumnos
    setLoadingStudents(true);
    setStudentsError(null);
    try {
      const studentList = await getStudents();
      setStudents(studentList);
    } catch (err: any) {
      console.error('Error al cargar lista de alumnos:', err);
      setStudentsError('No pudimos cargar la lista de alumnos.');
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadData();
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
      <div className="absolute top-20 left-20 w-48 h-48 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 right-20 w-64 h-64 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>

      <Navbar onNavigate={onNavigate} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        {/* Banner de Bienvenida */}
        <div
          id="teacher-welcome-banner"
          className="relative overflow-hidden bg-[#4F46E5] rounded-3xl p-6 sm:p-10 text-white shadow-2xl shadow-indigo-100/50 mb-8"
        >
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-indigo-100 uppercase tracking-wider mb-3">
                <GraduationCap className="w-3.5 h-3.5" />
                Rol: Profesor
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
                Hola, {userProfile?.name || 'Profesor'} 👋
              </h1>
              <p className="mt-2 text-indigo-100 text-sm sm:text-base max-w-xl">
                Panel del profesor. Gestioná tus clases de música, organizá horarios y acompañá el avance de tus alumnos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                id="btn-create-lesson-header"
                type="button"
                onClick={() => onNavigate('/teacher/lessons/new')}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-indigo-600 font-extrabold text-sm shadow-lg hover:bg-indigo-50 active:scale-95 transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Crear clase</span>
              </button>

              <button
                id="teacher-logout-btn"
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm backdrop-blur-md border border-white/20 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-300" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          <div className="absolute -right-6 -bottom-8 opacity-10 pointer-events-none">
            <Music className="w-64 h-64 text-white" />
          </div>
        </div>

        {/* Layout Principal: 2 Columnas (Próximas Clases y Mis Alumnos) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna Izquierda / Principal: Próximas Clases */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Próximas clases</h2>
                  <p className="text-xs text-slate-500">Clases programadas con tus alumnos</p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadData}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Actualizar clases"
              >
                <RefreshCw className={`w-4 h-4 ${loadingLessons ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Estados de Próximas Clases */}
            {loadingLessons ? (
              <div className="bg-white rounded-3xl p-12 border border-slate-200/80 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="text-sm font-medium">Cargando clases...</span>
              </div>
            ) : lessonsError ? (
              <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center flex flex-col items-center gap-3">
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
              <div className="bg-white rounded-3xl p-12 border border-slate-200/80 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">
                  Todavía no tenés clases programadas.
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mb-6">
                  Comenzá agendando tu primera clase particular de música con cualquiera de tus alumnos registrados.
                </p>
                <button
                  id="btn-create-first-lesson"
                  type="button"
                  onClick={() => onNavigate('/teacher/lessons/new')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-100 transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Crear primera clase</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lessons.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    viewerRole="teacher"
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Columna Derecha: Mis Alumnos */}
          <div className="space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Mis alumnos</h2>
                <p className="text-xs text-slate-500">Alumnos registrados en MusicKids</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm">
              {loadingStudents ? (
                <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-xs font-medium">Cargando alumnos...</span>
                </div>
              ) : studentsError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 text-center">
                  {studentsError}
                </div>
              ) : students.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <p className="text-xs">No hay alumnos registrados actualmente.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {students.map((student) => (
                    <StudentCard key={student.uid} student={student} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="h-12 w-full bg-white border-t border-slate-100 flex items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 shrink-0">
        © 2024 MusicKids Academy
      </footer>
    </div>
  );
};
