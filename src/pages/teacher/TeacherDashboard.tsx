import React, { useState, useEffect } from 'react';
import {
  Home,
  Calendar,
  FileText,
  Folder,
  BarChart2,
  LogOut,
  Plus,
  Music,
  User,
  ArrowRight,
  Megaphone,
  Bell,
  Menu,
  ChevronDown,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTeacherLessons, getStudents } from '../../services/lessonService';
import { getLessonTimingLabel } from '../../utils/dateUtils';
import type { Lesson } from '../../types/lesson';
import type { UserProfile } from '../../types/auth';

interface TeacherDashboardProps {
  onNavigate: (path: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const { userProfile, user, logout } = useAuth();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [, setStudents] = useState<UserProfile[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

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

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div
      id="teacher-dashboard-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos ambientales decorativos de fondo (idénticos a la identidad MusicKids) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        {/* Mancha azulada suave arriba a la derecha */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl pointer-events-none" />

        {/* Mancha amarilla suave abajo a la izquierda */}
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl pointer-events-none" />

        {/* Curvas decorativas amarillas en el fondo inferior izquierdo */}
        <svg
          className="absolute bottom-0 left-0 w-80 h-80 sm:w-96 sm:h-96 opacity-75 pointer-events-none"
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

        <svg
          className="absolute top-1/4 right-0 w-64 h-80 opacity-60 pointer-events-none"
          viewBox="0 0 300 400"
          fill="none"
        >
          <path
            d="M 280 50 C 220 80, 180 150, 190 220 C 200 290, 270 320, 240 380"
            stroke="#FAB816"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* HEADER SUPERIOR */}
      <header
        id="teacher-dashboard-header"
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between relative z-20"
      >
        {/* Bloque Izquierdo: Logotipo MusicKids + Menú + Saludo */}
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Logotipo oficial MusicKids */}
          <div
            id="navbar-brand"
            className="flex items-center gap-1 cursor-pointer group select-none"
            onClick={() => onNavigate('/')}
            title="Ir al inicio"
          >
            <span
              className="font-abril text-[26px] sm:text-[30px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Music
            </span>
            <img
              src="/images/logo-clef.png"
              alt="Clave de Sol MusicKids"
              className="h-8 sm:h-10 w-auto object-contain -mx-0.5 -mt-1 select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <span
              className="font-abril text-[26px] sm:text-[30px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Kids
            </span>
          </div>

          {/* Botón Menú Hamburguesa */}
          <button
            type="button"
            id="toggle-sidebar-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-xl text-slate-700 hover:bg-white/80 hover:text-[#00537A] transition-colors cursor-pointer"
            aria-label={isSidebarCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            title={isSidebarCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
          >
            <Menu className="w-6 h-6 stroke-[2]" />
          </button>

          {/* Saludo "¡Hola, Profe!" */}
          <h1
            id="teacher-greeting-heading"
            className="font-parkinsans text-xl sm:text-2xl font-bold text-slate-900 tracking-tight select-none hidden xs:block"
            style={{ fontFamily: "'Parkinsans', sans-serif" }}
          >
            ¡Hola, Profe!
          </h1>
        </div>

        {/* Bloque Derecho: Notificaciones + Perfil del Profesor */}
        <div className="flex items-center gap-3 sm:gap-4 relative">
          {/* Icono Notificaciones */}
          <button
            type="button"
            id="teacher-notifications-btn"
            className="p-2.5 rounded-full text-slate-700 hover:text-[#00537A] hover:bg-white/80 transition-colors cursor-pointer relative"
            title="Notificaciones"
          >
            <Bell className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Área de Perfil del Profesor */}
          <div className="relative">
            <button
              type="button"
              id="teacher-profile-capsule"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2.5 bg-white border border-slate-200/90 rounded-full px-3.5 sm:px-4 py-1.5 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer select-none"
            >
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                {/* TODO: Rehabilitar carga de avatar en una iteración futura. */}
                <User className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 max-w-[120px] sm:max-w-[180px] truncate">
                {userProfile?.name || 'Tu Nombre'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {/* Dropdown flotante de perfil */}
            {profileDropdownOpen && (
              <div
                id="teacher-profile-dropdown"
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-lg border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Conectado como</p>
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {userProfile?.name || 'Profesor'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <button
                  type="button"
                  id="dropdown-teacher-profile-link"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onNavigate('/teacher/profile');
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Mi perfil
                </button>
                <button
                  type="button"
                  onClick={loadData}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                  Actualizar clases
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

      {/* CONTENIDO PRINCIPAL (SIDEBAR + ÁREA DE CLASES) */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative z-10 flex flex-col lg:flex-row gap-6 items-start">
        {/* SIDEBAR (Collapsible: Expanded vs Collapsed) */}
        <aside
          id="teacher-sidebar"
          aria-expanded={!isSidebarCollapsed}
          className={`flex flex-col justify-between ${
            isSidebarCollapsed ? 'w-20 px-2.5 py-5' : 'w-full lg:w-64 p-5'
          } bg-white rounded-[28px] sm:rounded-[32px] shadow-sm border border-slate-100/90 shrink-0 lg:min-h-[580px] self-stretch transition-all duration-200 ease-in-out`}
        >
          {/* Navegación Superior */}
          <nav className="space-y-2 select-none">
            {/* 1. Panel (Activo como en Mockup) */}
            <div
              id="sidebar-item-panel"
              title="Panel"
              aria-label="Panel"
              className={`flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl bg-[#E8F3F8] text-[#00537A] font-bold text-sm cursor-pointer transition-colors`}
            >
              <Home className="w-5 h-5 text-[#00537A] shrink-0" />
              {!isSidebarCollapsed && <span>Panel</span>}
            </div>

            {/* 2. Clases */}
            <div
              id="sidebar-item-clases"
              title="Clases"
              aria-label="Clases"
              className={`flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl text-slate-700 hover:bg-slate-50 hover:text-[#00537A] font-semibold text-sm cursor-pointer transition-colors`}
            >
              <Calendar className="w-5 h-5 text-slate-500 shrink-0" />
              {!isSidebarCollapsed && <span>Clases</span>}
            </div>

            {/* 3. Tareas (Próximamente) */}
            <div
              id="sidebar-item-tareas"
              title="Tareas (Próximamente)"
              aria-label="Tareas (Próximamente)"
              className={`flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'
              } rounded-2xl text-slate-600 font-semibold text-sm cursor-default hover:bg-slate-50/60 transition-colors`}
            >
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3.5'}`}>
                <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                {!isSidebarCollapsed && <span>Tareas</span>}
              </div>
              {!isSidebarCollapsed && (
                <span className="bg-[#FFEAA7] text-[#7A5A00] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Próximamente
                </span>
              )}
            </div>

            {/* 4. Materiales (Próximamente) */}
            <div
              id="sidebar-item-materiales"
              title="Materiales (Próximamente)"
              aria-label="Materiales (Próximamente)"
              className={`flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'
              } rounded-2xl text-slate-600 font-semibold text-sm cursor-default hover:bg-slate-50/60 transition-colors`}
            >
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3.5'}`}>
                <Folder className="w-5 h-5 text-slate-400 shrink-0" />
                {!isSidebarCollapsed && <span>Materiales</span>}
              </div>
              {!isSidebarCollapsed && (
                <span className="bg-[#FFEAA7] text-[#7A5A00] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Próximamente
                </span>
              )}
            </div>

            {/* 5. Estadísticas (Próximamente) */}
            <div
              id="sidebar-item-estadisticas"
              title="Estadísticas (Próximamente)"
              aria-label="Estadísticas (Próximamente)"
              className={`flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'
              } rounded-2xl text-slate-600 font-semibold text-sm cursor-default hover:bg-slate-50/60 transition-colors`}
            >
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3.5'}`}>
                <BarChart2 className="w-5 h-5 text-slate-400 shrink-0" />
                {!isSidebarCollapsed && <span>Estadísticas</span>}
              </div>
              {!isSidebarCollapsed && (
                <span className="bg-[#FFEAA7] text-[#7A5A00] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Próximamente
                </span>
              )}
            </div>
          </nav>

          {/* Navegación Inferior: Cerrar sesión */}
          <div className="pt-6 border-t border-slate-100 mt-6 lg:mt-auto">
            <button
              type="button"
              id="sidebar-logout-btn"
              onClick={handleLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl text-slate-700 hover:text-rose-600 hover:bg-rose-50/60 font-semibold text-sm transition-colors cursor-pointer`}
            >
              <LogOut className="w-5 h-5 text-slate-500 hover:text-rose-600 shrink-0" />
              {!isSidebarCollapsed && <span>Cerrar sesión</span>}
            </button>
          </div>
        </aside>

        {/* ÁREA PRINCIPAL: TUS PRÓXIMAS CLASES */}
        <main className="flex-1 min-w-0 w-full flex flex-col gap-6 transition-all duration-200 ease-in-out">
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
        </main>
      </div>

      {/* Espaciado inferior de balance */}
      <footer className="w-full py-4 shrink-0" />
    </div>
  );
};
