import React, { useState } from 'react';
import {
  Home,
  Calendar,
  FileText,
  Folder,
  BarChart2,
  LogOut,
  User,
  Bell,
  Menu,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface TeacherLayoutProps {
  children: React.ReactNode;
  activeSection: 'dashboard' | 'classes' | 'tasks' | 'materials' | 'stats';
  onNavigate: (path: string) => void;
  onRefreshData?: () => void;
}

export const TeacherLayout: React.FC<TeacherLayoutProps> = ({
  children,
  activeSection,
  onNavigate,
  onRefreshData,
}) => {
  const { userProfile, user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

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
      {/* Elementos ambientales decorativos de fondo (identidad MusicKids) */}
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

          {/* Saludo '¡Hola, Profe!' */}
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
                <User className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 max-w-[120px] sm:max-w-[180px] truncate">
                {userProfile?.name || 'Tu Nombre'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {/* Dropdown flotante de perfil */}
            {profileDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileDropdownOpen(false)}
                />
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
                    id="dropdown-teacher-classes-link"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onNavigate('/teacher/availability');
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Clases
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
                      Actualizar clases
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      handleLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-500" />
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL (SIDEBAR + CONTENIDO DE PÁGINA) */}
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
            {/* 1. Panel */}
            <button
              type="button"
              id="sidebar-item-panel"
              title="Panel"
              aria-label="Panel"
              onClick={() => onNavigate('/teacher/dashboard')}
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

            {/* 2. Clases */}
            <button
              type="button"
              id="sidebar-item-clases"
              title="Clases"
              aria-label="Clases"
              onClick={() => onNavigate('/teacher/availability')}
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
              {!isSidebarCollapsed && <span>Clases</span>}
            </button>

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

        {/* ÁREA DE CONTENIDO ESPECÍFICO DE LA PÁGINA */}
        <main className="flex-1 min-w-0 w-full flex flex-col gap-6 transition-all duration-200 ease-in-out">
          {children}
        </main>
      </div>

      {/* Espaciado inferior de balance */}
      <footer className="w-full py-4 shrink-0" />
    </div>
  );
};
