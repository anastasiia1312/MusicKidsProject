import React, { useState } from 'react';
import {
  Music,
  User,
  Mail,
  Lock,
  GraduationCap,
  BookOpen,
  AlertCircle,
  Loader2,
  CheckCircle2,
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
      className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden font-sans"
    >
      {/* Elementos ambientales geométricos */}
      <div className="absolute top-12 left-12 w-48 h-48 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-12 right-12 w-64 h-64 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Geometric Balance */}
      <header className="h-20 w-full border-b border-slate-200 bg-white flex items-center justify-between px-6 sm:px-12 shrink-0 z-10">
        <div
          id="navbar-brand"
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => onNavigate('/login')}
        >
          <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 text-white">
            <Music className="w-5 h-5" />
          </div>
          <span className="text-2xl font-black tracking-tight text-slate-900">
            MusicKids
          </span>
        </div>
        <nav className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-slate-400">
          <button
            onClick={() => onNavigate('/login')}
            className="hover:text-indigo-600 transition-colors cursor-pointer"
          >
            Iniciar sesión
          </button>
          <span className="text-indigo-600 font-extrabold border-b-2 border-indigo-600 pb-0.5">
            Registro
          </span>
        </nav>
      </header>

      {/* Contenido Principal con Card Dividida */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 z-10">
        <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl shadow-indigo-100/50 border border-slate-100 flex flex-col md:flex-row overflow-hidden my-auto">
          {/* Panel Izquierdo: Hero Banner */}
          <div className="w-full md:w-5/12 bg-[#4F46E5] p-8 sm:p-10 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-md mb-6 shadow-sm">
                <Music className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                Únete a la academia MusicKids.
              </h2>
              <p className="text-indigo-100 text-sm mt-3 leading-relaxed">
                La plataforma integral de clases particulares de música que une a profesores y alumnos con herramientas en tiempo real.
              </p>
            </div>

            <div className="relative z-10 mt-8 space-y-3">
              <div className="bg-indigo-500/30 p-3.5 rounded-2xl backdrop-blur-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-xs">Profesores y Alumnos</h4>
                  <p className="text-[11px] text-indigo-100">Perfiles personalizados según tu rol</p>
                </div>
              </div>

              <div className="bg-indigo-500/30 p-3.5 rounded-2xl backdrop-blur-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-xs">Seguridad Firebase</h4>
                  <p className="text-[11px] text-indigo-100">Autenticación y base de datos segura</p>
                </div>
              </div>
            </div>

            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none"></div>
          </div>

          {/* Panel Derecho: Formulario */}
          <div className="w-full md:w-7/12 p-6 sm:p-10 bg-white flex flex-col justify-center">
            <div className="mb-6">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Crear una cuenta
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                Completa tus datos para ingresar a MusicKids
              </p>
            </div>

            {/* Mensaje de Error */}
            {errorMessage && (
              <div
                id="register-error-alert"
                className="mb-5 p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-3 text-rose-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <form id="register-form" onSubmit={handleEmailSubmit} className="space-y-4">
              {/* Campo Nombre */}
              <div>
                <label
                  htmlFor="register-name"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Nombre completo
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
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Campo Email */}
              <div>
                <label
                  htmlFor="register-email"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Correo electrónico
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
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Contraseña y Confirmar Contraseña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="register-password"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                  >
                    Contraseña
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
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-confirm-password"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                  >
                    Confirmar
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
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Selección de Rol */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Selecciona tu rol
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
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      role === 'student'
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/40 text-indigo-950 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                          role === 'student'
                            ? 'bg-[#4F46E5] text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </div>
                      {role === 'student' && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      )}
                    </div>
                    <span className="font-bold text-xs sm:text-sm">Alumno</span>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Aprender música
                    </span>
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
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      role === 'teacher'
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/40 text-indigo-950 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                          role === 'teacher'
                            ? 'bg-[#4F46E5] text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                      </div>
                      {role === 'teacher' && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      )}
                    </div>
                    <span className="font-bold text-xs sm:text-sm">Profesor</span>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Impartir clases
                    </span>
                  </button>
                </div>
              </div>

              {/* Botón Crear Cuenta */}
              <div className="pt-2">
                <button
                  type="submit"
                  id="submit-register-btn"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="w-full py-3.5 bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creando cuenta...</span>
                    </>
                  ) : (
                    'Crear cuenta'
                  )}
                </button>
              </div>
            </form>

            {/* Separador */}
            <div className="my-4 flex items-center">
              <div className="flex-1 border-t border-slate-200"></div>
              <span className="px-3 text-xs font-semibold uppercase text-slate-400">
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
              className="w-full py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors font-semibold text-slate-700 text-sm shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isGoogleSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
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
                className="font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
              >
                Iniciar sesión
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Geometric Balance */}
      <footer className="h-12 w-full bg-white border-t border-slate-100 flex items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 shrink-0">
        © 2024 MusicKids Academy • Proyecto Firebase ID: musickids-83026
      </footer>
    </div>
  );
};
