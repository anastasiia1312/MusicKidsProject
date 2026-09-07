import React, { useState } from 'react';
import {
  Mail,
  Lock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../services/authService';

interface LoginProps {
  onNavigate: (path: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigate }) => {
  const { loginWithEmail, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage('Ingresá tu email.');
      return;
    }

    if (!password) {
      setErrorMessage('Ingresá tu contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const profile = await loginWithEmail(email, password);
      if (!profile) {
        onNavigate('/select-role');
      } else if (profile.role === 'teacher') {
        onNavigate('/teacher/dashboard');
      } else if (profile.role === 'student') {
        onNavigate('/student/dashboard');
      } else {
        onNavigate('/select-role');
      }
    } catch (err: any) {
      console.error('Error al iniciar sesión con email:', err);
      const msg = getAuthErrorMessage(err);
      if (msg) {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await loginWithGoogle();
      if (result.isNewUser || !result.profile) {
        onNavigate('/select-role');
      } else if (result.profile.role === 'teacher') {
        onNavigate('/teacher/dashboard');
      } else if (result.profile.role === 'student') {
        onNavigate('/student/dashboard');
      } else {
        onNavigate('/select-role');
      }
    } catch (err: any) {
      console.error('Error al iniciar sesión con Google:', err);
      const msg = getAuthErrorMessage(err);
      if (msg) {
        setErrorMessage(msg);
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div
      id="login-page-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos ambientales decorativos de fondo (idénticos a Registro y Landing) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        {/* Mancha amarilla suave abajo a la izquierda */}
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/40 rounded-full blur-3xl pointer-events-none" />

        {/* Mancha azulada suave arriba a la derecha */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl pointer-events-none" />

        {/* Curvas decorativas amarillas en el fondo */}
        <svg
          className="absolute bottom-0 left-0 w-80 h-80 sm:w-96 sm:h-96 opacity-80 pointer-events-none"
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
          className="absolute top-1/4 right-0 w-64 h-80 sm:w-72 sm:h-96 opacity-75 pointer-events-none"
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

      {/* Header Geometric Balance (Idéntico a Registro y LandingPage) */}
      <header
        id="login-header"
        className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pt-8 pb-4 flex items-center justify-between shrink-0 relative z-10"
      >
        {/* Logotipo MusicKids */}
        <div
          id="navbar-brand"
          className="flex items-center gap-1 cursor-pointer group select-none"
          onClick={() => onNavigate('/')}
        >
          <span
            className="font-abril text-[28px] sm:text-[32px] text-[#00537A] tracking-normal leading-none"
            style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
          >
            Music
          </span>
          <img
            src="/images/logo-clef.png"
            alt="Clave de Sol MusicKids"
            className="h-9 sm:h-11 w-auto object-contain -mx-0.5 -mt-1 select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          <span
            className="font-abril text-[28px] sm:text-[32px] text-[#00537A] tracking-normal leading-none"
            style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
          >
            Kids
          </span>
        </div>

        {/* Acciones de Navegación: "Iniciar sesión" (sección actual) + Botón "REGISTRO" */}
        <div className="flex items-center gap-6 sm:gap-8">
          <span className="text-sm font-bold text-[#00537A] border-b-2 border-[#00537A] pb-0.5 cursor-default select-none">
            Iniciar sesión
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/register')}
            className="rounded-full bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white text-xs sm:text-sm font-bold tracking-wider uppercase px-6 py-2.5 cursor-pointer transition-all shadow-none"
          >
            REGISTRO
          </button>
        </div>
      </header>

      {/* Contenedor Principal: Card Dividida (Panel Izquierdo Azul + Panel Derecho Formulario) */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-10 relative z-10">
        <div className="max-w-4xl w-full bg-white rounded-[32px] sm:rounded-[36px] shadow-xl shadow-[#00537A]/10 border border-slate-100 flex flex-col lg:flex-row overflow-hidden my-auto">
          {/* Panel Izquierdo: Azul Petróleo Oscuro (#00537A) Limpio */}
          <div className="w-full lg:w-5/12 bg-[#00537A] p-8 sm:p-10 lg:p-12 text-white flex flex-col justify-center relative overflow-hidden shrink-0">
            {/* Título: Bienvenido de nuevo a MusicKids. ("MusicKids." en #FFB800) */}
            <h2
              className="font-parkinsans text-3xl sm:text-4xl lg:text-[40px] font-normal leading-[1.18] tracking-tight"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              <span className="block text-white">Bienvenido</span>
              <span className="block text-white">de nuevo a</span>
              <span className="block text-[#FFB800] font-normal">MusicKids.</span>
            </h2>

            {/* Texto Descriptivo Inferior */}
            <p
              className="font-siemreap text-white/95 text-sm sm:text-base mt-6 sm:mt-8 leading-relaxed max-w-sm"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Continúa aprendiendo, creando y disfrutando de la música desde cualquier lugar.
            </p>
          </div>

          {/* Panel Derecho: Formulario de Inicio de Sesión sobre Fondo Blanco */}
          <div className="w-full lg:w-7/12 p-6 sm:p-10 lg:p-12 bg-white flex flex-col justify-center">
            <div className="mb-6">
              <h3
                className="font-parkinsans text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                Iniciar sesión
              </h3>
              <p
                className="font-siemreap text-slate-500 text-sm sm:text-base mt-1"
                style={{ fontFamily: "'Siemreap', sans-serif" }}
              >
                Ingresa a tu cuenta de MusicKids.
              </p>
            </div>

            {/* Mensaje de Error si ocurre */}
            {errorMessage && (
              <div
                id="login-error-alert"
                className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <form id="login-form" onSubmit={handleEmailLogin} className="space-y-4">
              {/* Campo Correo Electrónico */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  CORREO ELECTRÓNICO
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="tu@email.com"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A]/30 focus:border-[#00537A] outline-none transition-all text-slate-800 text-sm placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  CONTRASEÑA
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Tu contraseña"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A]/30 focus:border-[#00537A] outline-none transition-all text-slate-800 text-sm placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Botón Iniciar Sesión */}
              <div className="pt-2">
                <button
                  type="submit"
                  id="submit-login-btn"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="w-full py-3.5 bg-[#00537A] hover:bg-[#004262] text-white font-bold rounded-xl shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer text-sm sm:text-base flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Iniciando sesión...</span>
                    </>
                  ) : (
                    'Iniciar sesión'
                  )}
                </button>
              </div>
            </form>

            {/* Separador "o" */}
            <div className="my-4 flex items-center">
              <div className="flex-1 border-t border-slate-200"></div>
              <span className="px-3 text-xs font-semibold text-slate-400">
                o
              </span>
              <div className="flex-1 border-t border-slate-200"></div>
            </div>

            {/* Botón Continuar con Google */}
            <button
              type="button"
              id="login-google-btn"
              onClick={handleGoogleLogin}
              disabled={isSubmitting || isGoogleSubmitting}
              className="w-full py-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors font-semibold text-slate-700 text-sm shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isGoogleSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#00537A]" />
                  <span>Conectando con Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continuar con Google</span>
                </>
              )}
            </button>

            {/* Enlace a Registro */}
            <div className="mt-5 text-center text-xs text-slate-500">
              ¿No tienes una cuenta?{' '}
              <button
                type="button"
                id="go-to-register-btn"
                onClick={() => onNavigate('/register')}
                className="font-bold text-[#00537A] hover:underline cursor-pointer"
              >
                Regístrate
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Espaciado inferior de balance */}
      <footer className="w-full py-3 shrink-0" />
    </div>
  );
};
