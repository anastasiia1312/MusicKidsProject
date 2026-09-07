import React, { useState, useEffect } from 'react';
import {
  Music,
  ArrowLeft,
  Loader2,
  Video,
  ShieldAlert,
  Bell,
  User,
  ChevronDown,
  Home,
  Calendar,
  FileText,
  Folder,
  Undo2,
  Redo2,
  LogOut,
  Info,
  X,
  ExternalLink,
  PenTool,
  Maximize2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
  const { user, role, userProfile, logout } = useAuth();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [activeMainTool, setActiveMainTool] = useState<'whiteboard' | 'piano'>('whiteboard');

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

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('/login');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col font-sans relative overflow-x-hidden selection:bg-amber-200">
      {/* Elementos ambientales decorativos de fondo */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-[#FFE29A]/30 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed top-1/3 -left-20 w-80 h-80 bg-[#E8F3F8] rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-[#FFE29A]/20 rounded-full blur-3xl pointer-events-none" />

      {/* Curvas decorativas amarillas en el fondo inferior */}
      <svg
        className="fixed bottom-0 left-0 w-80 h-80 opacity-60 pointer-events-none"
        viewBox="0 0 400 400"
        fill="none"
      >
        <path
          d="M -50 350 C 50 380, 100 300, 120 280 C 160 240, 80 180, 110 140 C 130 110, 180 130, 210 90"
          stroke="#FAB816"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {/* HEADER SUPERIOR (estilo exacto del mockup clase.png) */}
      <header
        id="lesson-page-header"
        className="w-full px-4 sm:px-6 lg:px-8 pt-5 pb-3 flex items-center justify-between relative z-20"
      >
        {/* Lado izquierdo: Logotipo MusicKids + Flecha Volver + Título de la clase */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          {/* Logotipo oficial MusicKids */}
          <div
            id="navbar-brand"
            className="flex items-center gap-1 cursor-pointer select-none shrink-0"
            onClick={handleBack}
            title="Ir al panel"
          >
            <span
              className="font-abril text-[24px] sm:text-[28px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Music
            </span>
            <img
              src="/images/logo-clef.png"
              alt="Clave de Sol MusicKids"
              className="w-5 h-7 sm:w-6 sm:h-8 object-contain -mt-1 transform -rotate-12 drop-shadow-xs inline-block"
            />
            <span
              className="font-parkinsans font-extrabold text-[24px] sm:text-[28px] text-[#FAB816] -ml-0.5 tracking-tight leading-none"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Kids
            </span>
          </div>

          <div className="h-6 w-px bg-slate-300 hidden sm:block shrink-0" />

          {/* Flecha Volver y Título de la Clase */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              id="btn-back-from-lesson"
              type="button"
              onClick={handleBack}
              className="w-9 h-9 rounded-full bg-white hover:bg-slate-100 border border-slate-200/90 flex items-center justify-center text-slate-700 transition cursor-pointer shadow-2xs shrink-0"
              title="Volver al panel"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 truncate">
              {lesson ? lesson.title : 'Clase en vivo'}
            </h1>

            {lesson && (
              <button
                type="button"
                onClick={() => setShowInfoModal(true)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer shrink-0"
                title="Ver información de la clase"
                aria-label="Ver información de la clase"
              >
                <Info className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Lado derecho: Botón Google Meet + Notificaciones + Perfil */}
        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          {/* Botón Abrir GoogleMeet */}
          {lesson?.meetUrl ? (
            <a
              id="btn-open-lesson-meet"
              href={lesson.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs transition cursor-pointer"
            >
              <Video className="w-4 h-4 text-slate-700" />
              <span className="hidden sm:inline">Abrir GoogleMeet</span>
            </a>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
              <Video className="w-3.5 h-3.5" />
              <span>Meet sin asignar</span>
            </div>
          )}

          {/* Notificaciones */}
          <button
            type="button"
            className="p-2 sm:p-2.5 rounded-full text-slate-700 hover:text-[#00537A] hover:bg-white/80 transition-colors cursor-pointer relative"
            title="Notificaciones"
            aria-label="Notificaciones"
          >
            <Bell className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Cápsula de Usuario con Dropdown */}
          <div className="relative">
            <button
              type="button"
              id="user-profile-capsule"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-full px-3 sm:px-3.5 py-1.5 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer select-none"
            >
              <div className="w-6 h-6 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 max-w-[100px] truncate">
                {userProfile?.name || 'Usuario'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {profileDropdownOpen && (
              <div
                id="user-profile-dropdown"
                className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-lg border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Conectado como</p>
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {userProfile?.name || 'Usuario'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5 text-slate-400" />
                  Ir al panel principal
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ÁREA PRINCIPAL: BARRA LATERAL FLOTANTE + CONTENIDO DE LA CLASE */}
      <div className="flex-1 w-full px-3 sm:px-6 lg:px-8 py-2 sm:py-4 flex gap-4 sm:gap-6 relative z-10">
        {/* BARRA LATERAL FLOTANTE (mockup clase.png) */}
        <aside
          id="lesson-floating-sidebar"
          className="hidden md:flex flex-col justify-between items-center w-14 lg:w-16 bg-white rounded-[28px] py-6 px-2 shadow-2xs border border-slate-200/80 shrink-0 select-none h-[calc(100vh-100px)] sticky top-20"
        >
          {/* Grupo superior de navegación */}
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Inicio / Panel */}
            <button
              type="button"
              onClick={handleBack}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
              title="Panel principal"
              aria-label="Panel principal"
            >
              <Home className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Clases (Activo: cápsula azul suave) */}
            <button
              type="button"
              className="w-10 h-10 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center transition cursor-pointer shadow-2xs"
              title="Clase actual"
              aria-label="Clase actual"
            >
              <Calendar className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Tareas */}
            <button
              type="button"
              onClick={() => onNavigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
              title="Tareas"
              aria-label="Tareas"
            >
              <FileText className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Materiales */}
            <button
              type="button"
              onClick={() => onNavigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
              title="Materiales"
              aria-label="Materiales"
            >
              <Folder className="w-5 h-5 stroke-[2]" />
            </button>
          </div>

          {/* Grupo inferior: Deshacer / Rehacer / Salir */}
          <div className="flex flex-col items-center gap-3 w-full">
            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
              title="Deshacer"
              aria-label="Deshacer"
            >
              <Undo2 className="w-4 h-4 stroke-[2]" />
            </button>

            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
              title="Rehacer"
              aria-label="Rehacer"
            >
              <Redo2 className="w-4 h-4 stroke-[2]" />
            </button>

            <div className="w-6 h-px bg-slate-200 my-1" />

            <button
              type="button"
              onClick={handleLogout}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </aside>

        {/* CONTENIDO CENTRAL */}
        <main className="flex-1 min-w-0 flex flex-col gap-5">
          {loading ? (
            <div className="bg-white rounded-[28px] p-16 border border-slate-200/80 flex flex-col items-center justify-center text-slate-400 gap-3 min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-[#00537A]" />
              <span className="text-sm font-medium">Cargando la clase...</span>
            </div>
          ) : accessDenied ? (
            <div
              id="lesson-access-denied"
              className="bg-white rounded-[28px] p-10 border border-rose-200 shadow-2xs text-center flex flex-col items-center justify-center"
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
                className="px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition cursor-pointer"
              >
                Volver al panel
              </button>
            </div>
          ) : notFound || !lesson ? (
            <div className="bg-white rounded-[28px] p-10 border border-slate-200 text-center flex flex-col items-center justify-center">
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
                className="px-6 py-2.5 rounded-2xl bg-[#00537A] hover:bg-[#004261] text-white font-bold text-sm transition cursor-pointer"
              >
                Volver al panel
              </button>
            </div>
          ) : (
            <>
              {/* ÁREA PRINCIPAL: PIZARRA (O PIANO EXPANDIDO) */}
              <div className={activeMainTool === 'whiteboard' ? 'block' : 'hidden'}>
                <Whiteboard isVisible={activeMainTool === 'whiteboard'} />
              </div>

              {activeMainTool === 'piano' && (
                <VirtualPiano
                  isExpanded={true}
                  onToggleExpand={() => setActiveMainTool('whiteboard')}
                />
              )}

              {/* FILA INFERIOR: 3 COMPONENTES AUXILIARES (Metrónomo, Piano o Pizarra, Tuner) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 1. Metrónomo */}
                <Metronome />

                {/* 2. Posición Central: Piano compacto o Pizarra compacta */}
                {activeMainTool === 'whiteboard' ? (
                  <VirtualPiano
                    isExpanded={false}
                    onToggleExpand={() => setActiveMainTool('piano')}
                  />
                ) : (
                  <div
                    id="lesson-whiteboard-compact-section"
                    onClick={() => setActiveMainTool('whiteboard')}
                    className="bg-white rounded-[28px] border border-slate-200/90 shadow-2xs overflow-hidden select-none flex flex-col justify-between cursor-pointer hover:border-[#00537A]/40 hover:shadow-md transition-all group"
                    title="Haz clic para volver a la Pizarra"
                  >
                    {/* Encabezado */}
                    <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-slate-100 group-hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <PenTool className="w-5 h-5" />
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900">
                          Pizarra
                        </h2>
                      </div>
                      <button
                        type="button"
                        aria-label="Expandir pizarra al área principal"
                        className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 group-hover:text-[#00537A] transition cursor-pointer"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Representación visual compacta de la pizarra */}
                    <div className="p-4 sm:p-5 flex-1 flex flex-col items-center justify-center min-h-[170px]">
                      <div className="w-full max-w-[320px] h-28 rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex flex-col justify-between shadow-inner relative overflow-hidden group-hover:bg-white transition-colors">
                        {/* Líneas simuladas de pentagrama */}
                        <div className="space-y-1.5 w-full opacity-60">
                          <div className="h-[1.5px] bg-slate-400 w-full" />
                          <div className="h-[1.5px] bg-slate-400 w-full" />
                          <div className="h-[1.5px] bg-slate-400 w-full" />
                          <div className="h-[1.5px] bg-slate-400 w-full" />
                          <div className="h-[1.5px] bg-slate-400 w-full" />
                        </div>

                        {/* Pie de tarjeta con acción para volver a la Pizarra */}
                        <div className="flex items-center justify-between w-full z-10">
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                            <PenTool className="w-3.5 h-3.5 text-[#00537A]" />
                            <span>Contenido activo</span>
                          </span>
                          <span className="text-[11px] font-bold text-[#00537A] bg-[#E8F3F8] px-2.5 py-1 rounded-full group-hover:bg-[#00537A] group-hover:text-white transition-colors">
                            Abrir Pizarra
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 font-medium mt-2">
                        Toca para volver a la Pizarra principal
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. Tuner */}
                <Tuner />
              </div>
            </>
          )}
        </main>
      </div>

      {/* MODAL DE DETALLES DE LA CLASE (ACCESIBLE VÍA ICONO INFO) */}
      {showInfoModal && lesson && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center">
                  <Music className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Detalles de la clase
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 py-4 text-xs sm:text-sm">
              <div>
                <span className="text-slate-400 font-medium block">Título</span>
                <p className="font-bold text-slate-800 text-base">{lesson.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 font-medium block">Profesor</span>
                  <p className="font-semibold text-slate-800">{lesson.teacherName || 'Profesor'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Alumno</span>
                  <p className="font-semibold text-slate-800">{lesson.studentName || 'Alumno'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 font-medium block">Fecha</span>
                  <p className="font-semibold text-slate-800">{formatLessonDate(lesson.date)}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Hora</span>
                  <p className="font-semibold text-slate-800">{formatLessonTime(lesson.date)} hs</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 font-medium block">Duración</span>
                  <p className="font-semibold text-slate-800">{lesson.duration} minutos</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Estado</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                    {getLessonStatusLabel(lesson.status)}
                  </span>
                </div>
              </div>
              {lesson.meetUrl && (
                <div className="pt-2">
                  <a
                    href={lesson.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 bg-[#4361EE] hover:bg-indigo-600 text-white font-bold rounded-2xl transition cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>Unirse a Google Meet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

