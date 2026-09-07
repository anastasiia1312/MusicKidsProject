import React, { useState } from 'react';
import {
  User,
  Mail,
  Lock,
  GraduationCap,
  BookOpen,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../services/authService';
import type { UserRole } from '../types/auth';

interface RegisterProps {
  onNavigate: (path: string) => void;
}

export const Register: React.FC<RegisterProps> = ({ onNavigate }) => {
  const { registerWithEmail, loginWithGoogle } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const validateForm = (): boolean => {
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Ingresá tu nombre.');
      return false;
    }

    if (!email.trim()) {
      setErrorMessage('Ingresá tu email.');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Ingresá un email válido.');
      return false;
    }

    if (!password) {
      setErrorMessage('Ingresá tu contraseña.');
      return false;
    }

    if (password.length < 6) {
      setErrorMessage('La contraseña es demasiado débil. Utilizá al menos 6 caracteres.');
      return false;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return false;
    }

    if (!role) {
      setErrorMessage('Seleccioná si vas a utilizar MusicKids como alumno o profesor.');
      return false;
    }

    return true;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const profile = await registerWithEmail(name, email, password, role as UserRole);
      if (profile.role === 'teacher') {
        onNavigate('/teacher/dashboard');
      } else {
        onNavigate('/student/dashboard');
      }
    } catch (err: any) {
      console.error('Error al registrar usuario:', err);
      const msg = getAuthErrorMessage(err);
      if (msg) {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleClick = async () => {
    setIsGoogleSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await loginWithGoogle();
      if (result.isNewUser) {
        onNavigate('/select-role');
      } else if (result.profile?.role === 'teacher') {
        onNavigate('/teacher/dashboard');
      } else if (result.profile?.role === 'student') {
        onNavigate('/student/dashboard');
      } else {
        onNavigate('/select-role');
      }
    } catch (err: any) {
      console.error('Error al autenticar con Google:', err);
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
      id="register-page-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos ambientales decorativos de fondo (exactos al mockup de Figma) */}
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

      {/* Header Geometric Balance (Idéntico a LandingPage) */}
      <header
        id="register-header"
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

        {/* Acciones de Navegación: "Iniciar sesión" + Botón "REGISTRO" */}
        <div className="flex items-center gap-6 sm:gap-8">
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="text-sm font-semibold text-[#00537A] hover:text-[#003954] hover:underline cursor-pointer transition-colors"
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className="rounded-full bg-[#00537A] text-white text-xs sm:text-sm font-bold tracking-wider uppercase px-6 py-2.5 cursor-default select-none shadow-none"
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
            {/* Título: Únete a la academia MusicKids. ("MusicKids." en #FFB800) */}
            <h2
              className="font-parkinsans text-3xl sm:text-4xl lg:text-[40px] font-normal leading-[1.18] tracking-tight"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              <span className="block text-white">Únete a la</span>
              <span className="block text-white">academia</span>
              <span className="block text-[#FFB800] font-normal">MusicKids.</span>
            </h2>

            {/* Texto Descriptivo Inferior */}
            <p
              className="font-siemreap text-white/95 text-sm sm:text-base mt-6 sm:mt-8 leading-relaxed max-w-sm"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              La plataforma integral de clases particulares de música que une a profesores y alumnos con herramientas en tiempo real.
            </p>
          </div>

          {/* Panel Derecho: Formulario de Registro sobre Fondo Blanco */}
          <div className="w-full lg:w-7/12 p-6 sm:p-10 lg:p-12 bg-white flex flex-col justify-center">
            <div className="mb-6">
              <h3
                className="font-parkinsans text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                Crear una cuenta
              </h3>
              <p
                className="font-siemreap text-slate-500 text-sm sm:text-base mt-1"
                style={{ fontFamily: "'Siemreap', sans-serif" }}
              >
                Completa tus datos para ingresar a MusicKids.
              </p>
            </div>

            {/* Mensaje de Error si ocurre */}
            {errorMessage && (
              <div
                id="register-error-alert"
                className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <form id="register-form" onSubmit={handleEmailSubmit} className="space-y-4">
              {/* Campo Nombre Completo */}
              <div>
                <label
                  htmlFor="register-name"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  NOMBRE COMPLETO
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="register-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Ej. María López"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A]/30 focus:border-[#00537A] outline-none transition-all text-slate-800 text-sm placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Campo Correo Electrónico */}
              <div>
                <label
                  htmlFor="register-email"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  CORREO ELECTRÓNICO
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="register-email"
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

              {/* Contraseña y Confirmar Contraseña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="register-password"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                  >
                    CONTRASEÑA
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="register-password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Mín. 6 caracteres"
                      disabled={isSubmitting || isGoogleSubmitting}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A]/30 focus:border-[#00537A] outline-none transition-all text-slate-800 text-sm placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-confirm-password"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                  >
                    CONFIRMAR
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="register-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Repite contraseña"
                      disabled={isSubmitting || isGoogleSubmitting}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A]/30 focus:border-[#00537A] outline-none transition-all text-slate-800 text-sm placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Selección de Rol: Alumno / Profesor */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
                  SELECCIONA TU ROL
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Opción Alumno */}
                  <button
                    type="button"
                    id="role-option-student"
                    onClick={() => {
                      setRole('student');
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting || isGoogleSubmitting}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      role === 'student'
                        ? 'border-[#00537A] bg-[#00537A]/5 ring-1 ring-[#00537A]/30 text-[#00537A] shadow-xs'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100/70 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                          role === 'student'
                            ? 'bg-[#00537A] text-white'
                            : 'bg-slate-200/80 text-slate-600'
                        }`}
                      >
                        <BookOpen className="w-4 h-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">Alumno</div>
                      <div className="text-xs text-slate-500 leading-tight mt-0.5">
                        Aprender música
                      </div>
                    </div>
                  </button>

                  {/* Opción Profesor */}
                  <button
                    type="button"
                    id="role-option-teacher"
                    onClick={() => {
                      setRole('teacher');
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting || isGoogleSubmitting}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      role === 'teacher'
                        ? 'border-[#00537A] bg-[#00537A]/5 ring-1 ring-[#00537A]/30 text-[#00537A] shadow-xs'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-700 hover:bg-slate-100/70 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                          role === 'teacher'
                            ? 'bg-[#00537A] text-white'
                            : 'bg-slate-200/80 text-slate-600'
                        }`}
                      >
                        <GraduationCap className="w-4 h-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">Profesor</div>
                      <div className="text-xs text-slate-500 leading-tight mt-0.5">
                        Impartir clases
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Botón Crear cuenta */}
              <div className="pt-2">
                <button
                  type="submit"
                  id="submit-register-btn"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="w-full py-3.5 bg-[#00537A] hover:bg-[#004262] text-white font-bold rounded-xl shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer text-sm sm:text-base flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Creando cuenta...</span>
                    </>
                  ) : (
                    'Crear cuenta'
                  )}
                </button>
              </div>
            </form>

            {/* Separador "O" */}
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
              id="register-google-btn"
              onClick={handleGoogleClick}
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

            {/* Enlace Iniciar Sesión */}
            <div className="mt-5 text-center text-xs text-slate-500">
              ¿Ya tienes una cuenta?{' '}
              <button
                type="button"
                id="go-to-login-btn"
                onClick={() => onNavigate('/login')}
                className="font-bold text-[#00537A] hover:underline cursor-pointer"
              >
                Iniciar sesión
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
