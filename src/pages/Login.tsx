import React, { useState } from 'react';
import {
  Music,
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
          <span className="text-indigo-600 font-extrabold border-b-2 border-indigo-600 pb-0.5">
            Iniciar sesión
          </span>
          <button
            onClick={() => onNavigate('/register')}
            className="hover:text-indigo-600 transition-colors cursor-pointer"
          >
            Registro
          </button>
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
                Tu aula musical en cualquier lugar.
              </h2>
              <p className="text-indigo-100 text-sm mt-3 leading-relaxed">
                Accede a tus clases particulares, materiales didácticos y herramientas musicales interactivas.
              </p>
            </div>

            <div className="relative z-10 mt-8 space-y-3">
              <div className="bg-indigo-500/30 p-3.5 rounded-2xl backdrop-blur-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-xs">Clases Particulares</h4>
                  <p className="text-[11px] text-indigo-100">Interacción directa profesor-alumno</p>
                </div>
              </div>

              <div className="bg-indigo-500/30 p-3.5 rounded-2xl backdrop-blur-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-xs">Acceso Instantáneo</h4>
                  <p className="text-[11px] text-indigo-100">Correo o cuenta de Google</p>
                </div>
              </div>
            </div>

            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none"></div>
          </div>

          {/* Panel Derecho: Formulario */}
          <div className="w-full md:w-7/12 p-6 sm:p-10 bg-white flex flex-col justify-center">
            <div className="mb-6">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Iniciar sesión
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                Bienvenido de nuevo a la academia MusicKids
              </p>
            </div>

            {/* Alerta de Error */}
            {errorMessage && (
              <div
                id="login-error-alert"
                className="mb-5 p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-3 text-rose-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <form id="login-form" onSubmit={handleEmailLogin} className="space-y-4">
              {/* Campo Email */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Correo electrónico
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
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Contraseña
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
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Botón Iniciar Sesión */}
              <div className="pt-2">
                <button
                  type="submit"
                  id="submit-login-btn"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="w-full py-3.5 bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span>Iniciando sesión...</span>
                    </>
                  ) : (
                    'Iniciar sesión'
                  )}
                </button>
              </div>
            </form>

            {/* Separador */}
            <div className="my-5 flex items-center">
              <div className="flex-1 border-t border-slate-200"></div>
              <span className="px-3 text-xs font-semibold uppercase text-slate-400">
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
              className="w-full py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors font-semibold text-slate-700 text-sm shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isGoogleSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-600" />
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
            <div className="mt-6 text-center text-xs text-slate-500">
              ¿No tienes una cuenta?{' '}
              <button
                type="button"
                id="go-to-register-btn"
                onClick={() => onNavigate('/register')}
                className="font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
              >
                Registrarse
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
