import React, { useState } from 'react';
import { ShieldAlert, LogOut, RotateCw, Mail, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AccountDisabledScreenProps {
  onNavigate?: (path: string) => void;
}

export const AccountDisabledScreen: React.FC<AccountDisabledScreenProps> = ({ onNavigate }) => {
  const { user, userProfile, logout, refreshUserProfile } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await logout();
      if (onNavigate) {
        onNavigate('/login');
      } else {
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  const handleRecheck = async () => {
    setIsChecking(true);
    setCheckMessage(null);
    try {
      const refreshed = await refreshUserProfile();
      if (refreshed && refreshed.status !== 'disabled') {
        // La cuenta fue reactivada
        setCheckMessage('¡Tu cuenta ha sido reactivada!');
      } else {
        setCheckMessage('La cuenta sigue desactivada por el administrador.');
      }
    } catch {
      setCheckMessage('No se pudo verificar el estado en este momento.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      id="account-disabled-screen"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos decorativos de fondo acordes a MusicKids */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl" />
      </div>

      {/* HEADER SUPERIOR */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-1 select-none">
          <span
            className="font-abril text-[26px] sm:text-[30px] text-[#00537A] tracking-normal leading-none"
            style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
          >
            Music
          </span>
          <img
            src="/images/logo-clef.png"
            alt="Clave de Sol MusicKids"
            className="h-8 sm:h-10 w-auto object-contain -mx-0.5 -mt-1 select-none pointer-events-none"
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
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 shadow-2xs transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-rose-500" />
          <span>Cerrar sesión</span>
        </button>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12 relative z-10 flex flex-col justify-center">
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-10 shadow-lg border border-slate-100 flex flex-col items-center text-center space-y-6">
          {/* Ícono de Alerta */}
          <div className="w-20 h-20 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center border-2 border-rose-100 shadow-inner">
            <ShieldAlert className="w-10 h-10 stroke-[2]" />
          </div>

          {/* Mensajes Principales */}
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              Acceso Restringido
            </span>

            <h1
              id="account-disabled-title"
              className="font-parkinsans text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Cuenta desactivada
            </h1>

            <p
              id="account-disabled-message"
              className="font-siemreap text-rose-700 font-semibold text-base sm:text-lg"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Tu cuenta ha sido desactivada. Contacta con el administrador de MusicKids.
            </p>
          </div>

          {/* Explicación y Datos del Usuario */}
          <div className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 font-siemreap">
            <div className="text-xs text-slate-600 space-y-1">
              <p>
                <strong>Usuario:</strong> {userProfile?.name || 'Usuario'}
              </p>
              <p>
                <strong>Correo:</strong> {userProfile?.email || user?.email}
              </p>
              <p>
                <strong>Rol:</strong>{' '}
                {userProfile?.role === 'teacher'
                  ? 'Profesor'
                  : userProfile?.role === 'student'
                  ? 'Alumno'
                  : 'Usuario'}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200 text-xs text-slate-500 leading-relaxed flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                El acceso a las clases, materiales, calendario y funciones protegidas de MusicKids
                está suspendido temporalmente. Tus datos y progreso permanecen guardados con
                total seguridad.
              </span>
            </div>
          </div>

          {/* Mensaje de chequeo */}
          {checkMessage && (
            <p className="text-xs font-semibold text-slate-600 animate-in fade-in">
              {checkMessage}
            </p>
          )}

          {/* Botones de Acción */}
          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              id="btn-recheck-disabled-account"
              onClick={handleRecheck}
              disabled={isChecking}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold text-[#00537A] bg-[#E8F3F8] hover:bg-[#DDF1F8] border border-[#00537A]/20 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RotateCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>Verificar estado</span>
            </button>

            <button
              type="button"
              id="btn-logout-disabled-account"
              onClick={handleLogout}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 shadow-sm transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </main>

      <footer className="w-full py-6 shrink-0" />
    </div>
  );
};
