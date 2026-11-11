import React, { useState, useEffect } from 'react';
import {
  Home,
  Calendar,
  FileText,
  Folder,
  LogOut,
  User,
  Bell,
  Menu,
  ChevronDown,
  RefreshCw,
  Compass,
  Headphones,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserSupportCount } from '../../services/supportService';

export interface StudentLayoutProps {
  children: React.ReactNode;
  activeSection: 'dashboard' | 'classes' | 'teachers' | 'tasks' | 'materials' | 'support';
  onNavigate: (path: string) => void;
  onRefreshData?: () => void;
}

export const StudentLayout: React.FC<StudentLayoutProps> = ({
  children,
  activeSection,
  onNavigate,
  onRefreshData,
}) => {
  const { userProfile, user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [unreadSupportCount, setUnreadSupportCount] = useState<number>(0);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = subscribeToUserSupportCount(user.uid, (count) => {
      setUnreadSupportCount(count);
    });
    return () => unsubscribe();
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
      id="student-dashboard-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos ambientales decorativos de fondo (identidad MusicKids) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl" />
      </div>

      {/* HEADER SUPERIOR */}
      <header
        id="student-dashboard-header"
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between relative z-20"
      >
        {/* Bloque Izquierdo: Logotipo MusicKids + Menú + Saludo */}
        <div className="flex items-center gap-3 sm:gap-6">
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

          <button
            type="button"
            id="toggle-sidebar-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-xl text-slate-700 hover:bg-white/80 hover:text-[#00537A] transition-colors cursor-pointer"
            aria-label={isSidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
            title={isSidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
          >
            <Menu className="w-6 h-6 stroke-[2]" />
          </button>

          <h1
            id="student-greeting-heading"
            className="font-parkinsans text-xl sm:text-2xl font-bold text-slate-900 tracking-tight select-none hidden xs:block"
            style={{ fontFamily: "'Parkinsans', sans-serif" }}
          >
            ¡Hola, {userProfile?.name ? userProfile.name.split(' ')[0] : 'Alumno'}!
          </h1>
        </div>

        {/* Bloque Derecho: Notificaciones + Perfil del Alumno */}
        <div className="flex items-center gap-3 sm:gap-4 relative">
          <button
            type="button"
            id="student-notifications-btn"
            onClick={() => onNavigate('/student/support')}
            className="p-2.5 rounded-full text-slate-700 hover:text-[#00537A] hover:bg-white/80 transition-colors cursor-pointer relative"
            title="Notificaciones y Soporte"
          >
            <Bell className="w-5 h-5 stroke-[2]" />
            {unreadSupportCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#FFB800] rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Área de Perfil del Alumno */}
          <div className="relative">
            <button
              type="button"
              id="student-profile-capsule"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2.5 bg-white border border-slate-200/90 rounded-full px-3.5 sm:px-4 py-1.5 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer select-none"
            >
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                <User className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 max-w-[120px] sm:max-w-[180px] truncate">
                {userProfile?.name || 'Alumno'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {profileDropdownOpen && (
              <div
                id="student-profile-dropdown"
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-lg border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Conectado como</p>
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {userProfile?.name || 'Alumno'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <button
                  type="button"
                  id="dropdown-student-profile-link"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onNavigate('/student/profile');
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Mi perfil
                </button>
                {onRefreshData && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onRefreshData();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    Actualizar
                  </button>
                )}
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

      {/* CONTENIDO PRINCIPAL (SIDEBAR + CONTENIDO DE PÁGINA) */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative z-10 flex flex-col lg:flex-row gap-6 items-start">
        {/* SIDEBAR DEL ALUMNO */}
        <aside
          id="student-sidebar"
          aria-expanded={!isSidebarCollapsed}
          className={`flex flex-col justify-between ${
            isSidebarCollapsed ? 'w-20 px-2.5 py-5' : 'w-full lg:w-64 p-5'
          } bg-white rounded-[28px] sm:rounded-[32px] shadow-sm border border-slate-100/90 shrink-0 lg:min-h-[580px] self-stretch transition-all duration-200 ease-in-out`}
        >
          {/* Navegación Superior */}
          <nav className="space-y-2 select-none">
            {/* 1. Panel */}
            <button
              type="button"
              id="sidebar-item-panel"
              title="Panel"
              aria-label="Panel"
              onClick={() => onNavigate('/student/dashboard')}
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl ${
                activeSection === 'dashboard'
                  ? 'bg-[#E8F3F8] text-[#00537A] font-bold'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-[#00537A] font-semibold'
              } text-sm cursor-pointer transition-colors text-left`}
            >
              <Home
                className={`w-5 h-5 ${
                  activeSection === 'dashboard' ? 'text-[#00537A]' : 'text-slate-500'
                } shrink-0`}
              />
              {!isSidebarCollapsed && <span>Panel</span>}
            </button>

            {/* 2. Mis Clases */}
            <button
              type="button"
              id="sidebar-item-clases"
              title="Mis Clases"
              aria-label="Mis Clases"
              onClick={() => onNavigate('/student/dashboard')}
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl ${
                activeSection === 'classes'
                  ? 'bg-[#E8F3F8] text-[#00537A] font-bold'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-[#00537A] font-semibold'
              } text-sm cursor-pointer transition-colors text-left`}
            >
              <Calendar
                className={`w-5 h-5 ${
                  activeSection === 'classes' ? 'text-[#00537A]' : 'text-slate-500'
                } shrink-0`}
              />
              {!isSidebarCollapsed && <span>Mis Clases</span>}
            </button>

            {/* 3. Buscar profesores */}
            <button
              type="button"
              id="sidebar-item-buscar-profesores"
              title="Buscar profesores"
              aria-label="Buscar profesores"
              onClick={() => onNavigate('/student/teachers')}
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl ${
                activeSection === 'teachers'
                  ? 'bg-[#E8F3F8] text-[#00537A] font-bold'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-[#00537A] font-semibold'
              } text-sm cursor-pointer transition-colors text-left`}
            >
              <Compass
                className={`w-5 h-5 ${
                  activeSection === 'teachers' ? 'text-[#00537A]' : 'text-slate-500'
                } shrink-0`}
              />
              {!isSidebarCollapsed && <span>Buscar profesores</span>}
            </button>

            {/* 4. Tareas y Materiales */}
            <button
              type="button"
              id="sidebar-item-tareas-materiales"
              title="Tareas y Materiales"
              aria-label="Tareas y Materiales"
              onClick={() => onNavigate('/student/tasks')}
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'gap-3.5 px-4 py-3'
              } rounded-2xl ${
                activeSection === 'tasks' || activeSection === 'materials'
                  ? 'bg-[#E8F3F8] text-[#00537A] font-bold'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-[#00537A] font-semibold'
              } text-sm cursor-pointer transition-colors text-left`}
            >
              <BookOpen
                className={`w-5 h-5 ${
                  activeSection === 'tasks' || activeSection === 'materials' ? 'text-[#00537A]' : 'text-slate-500'
                } shrink-0`}
              />
              {!isSidebarCollapsed && <span>Tareas y Materiales</span>}
            </button>

            {/* 6. Soporte Técnico */}
            <button
              type="button"
              id="sidebar-item-soporte"
              title="Soporte técnico"
              aria-label="Soporte técnico"
              onClick={() => onNavigate('/student/support')}
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'
              } rounded-2xl ${
                activeSection === 'support'
                  ? 'bg-[#E8F3F8] text-[#00537A] font-bold'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-[#00537A] font-semibold'
              } text-sm cursor-pointer transition-colors text-left`}
            >
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3.5'}`}>
                <Headphones
                  className={`w-5 h-5 ${
                    activeSection === 'support' ? 'text-[#00537A]' : 'text-slate-500'
                  } shrink-0`}
                />
                {!isSidebarCollapsed && <span>Soporte técnico</span>}
              </div>
              {unreadSupportCount > 0 && !isSidebarCollapsed && (
                <span className="bg-[#FFB800] text-[#7A5A00] text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-2xs">
                  {unreadSupportCount}
                </span>
              )}
            </button>
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
              <LogOut className="w-5 h-5 text-slate-500 shrink-0" />
              {!isSidebarCollapsed && <span>Cerrar sesión</span>}
            </button>
          </div>
        </aside>

        {/* CONTENIDO CENTRAL */}
        <main className="flex-1 w-full min-w-0">{children}</main>
      </div>
    </div>
  );
};
