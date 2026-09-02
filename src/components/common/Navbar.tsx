import React from 'react';
import { Music, LogOut, GraduationCap, BookOpen, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface NavbarProps {
  onNavigate?: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const { userProfile, role, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      if (onNavigate) {
        onNavigate('/login');
      }
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <header
      id="main-navbar"
      className="h-20 w-full border-b border-slate-200 bg-white sticky top-0 z-40 flex items-center justify-between px-4 sm:px-8 lg:px-12 shrink-0 shadow-xs"
    >
      {/* Logo & Marca */}
      <div
        id="navbar-brand"
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => {
          if (onNavigate) {
            if (role === 'teacher') onNavigate('/teacher/dashboard');
            else if (role === 'student') onNavigate('/student/dashboard');
            else onNavigate('/login');
          }
        }}
      >
        <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 text-white">
          <Music className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-black tracking-tight text-slate-900">
            MusicKids
          </span>
        </div>
      </div>

      {/* Perfil & Acciones */}
      {userProfile ? (
        <div id="navbar-user-section" className="flex items-center gap-3 sm:gap-4">
          {/* Badge de Rol */}
          <div
            id="user-role-badge"
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              role === 'teacher'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
            }`}
          >
            {role === 'teacher' ? (
              <>
                <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                <span>Profesor</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>Alumno</span>
              </>
            )}
          </div>

          {/* Avatar & Nombre */}
          <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 rounded-xl pl-1.5 pr-3 py-1">
            {userProfile.photoURL ? (
              <img
                id="user-avatar-img"
                src={userProfile.photoURL}
                alt={userProfile.name}
                className="w-7 h-7 rounded-lg object-cover border border-indigo-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                id="user-avatar-fallback"
                className="w-7 h-7 rounded-lg bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold"
              >
                {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
            )}
            <span id="user-display-name" className="text-xs sm:text-sm font-semibold text-slate-700 max-w-[120px] sm:max-w-[160px] truncate">
              {userProfile.name || 'Usuario'}
            </span>
          </div>

          {/* Botón Cerrar Sesión */}
          <button
            id="logout-button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-100 cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      ) : (
        <nav className="flex items-center gap-4 sm:gap-8 text-xs sm:text-sm font-semibold uppercase tracking-widest text-slate-500">
          <button
            onClick={() => onNavigate && onNavigate('/login')}
            className="hover:text-indigo-600 transition-colors cursor-pointer"
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => onNavigate && onNavigate('/register')}
            className="hover:text-indigo-600 text-indigo-600 transition-colors cursor-pointer"
          >
            Registro
          </button>
        </nav>
      )}
    </header>
  );
};
