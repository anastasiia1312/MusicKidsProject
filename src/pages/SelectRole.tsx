import React, { useState } from 'react';
import {
  Music,
  GraduationCap,
  BookOpen,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../services/authService';
import type { UserRole } from '../types/auth';

interface SelectRoleProps {
  onNavigate: (path: string) => void;
}

export const SelectRole: React.FC<SelectRoleProps> = ({ onNavigate }) => {
  const { user, pendingGoogleUser, selectRoleForGoogleUser, logout } = useAuth();
  const activeUser = pendingGoogleUser || user;

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirmRole = async (roleToSet?: UserRole) => {
    const finalRole = roleToSet || selectedRole;
    if (!finalRole) {
      setErrorMessage('Seleccioná si vas a utilizar MusicKids como alumno o profesor.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const profile = await selectRoleForGoogleUser(finalRole);
      if (profile.role === 'teacher') {
        onNavigate('/teacher/dashboard');
      } else {
        onNavigate('/student/dashboard');
      }
    } catch (err: any) {
      console.error('Error al guardar rol de usuario:', err);
      const msg = getAuthErrorMessage(err);
      if (msg) {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAndLogout = async () => {
    try {
      await logout();
      onNavigate('/login');
    } catch (err) {
      console.error('Error al cancelar:', err);
    }
  };

  return (
    <div
      id="select-role-container"
      className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden font-sans"
    >
      {/* Elementos ambientales geométricos */}
      <div className="absolute top-12 left-12 w-48 h-48 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-12 right-12 w-64 h-64 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Geometric Balance */}
      <header className="h-20 w-full border-b border-slate-200 bg-white flex items-center justify-between px-6 sm:px-12 shrink-0 z-10">
        <div id="navbar-brand" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 text-white">
            <Music className="w-5 h-5" />
          </div>
          <span className="text-2xl font-black tracking-tight text-slate-900">
            MusicKids
          </span>
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Paso 2 de 2: Selección de Rol
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 z-10">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl shadow-indigo-100/50 border border-slate-100 p-6 sm:p-10 my-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#4F46E5] text-white shadow-lg shadow-indigo-200 mb-4">
              <Music className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              ¡Bienvenido a MusicKids!
            </h1>
            {activeUser?.displayName && (
              <p className="mt-1 text-sm font-bold text-indigo-600">
                Hola, {activeUser.displayName}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-500">
              Por favor, selecciona tu perfil para configurar tu espacio de trabajo musical.
            </p>
          </div>

          {errorMessage && (
            <div
              id="select-role-error"
              className="mb-6 p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-3 text-rose-700 text-sm"
            >
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Opción Alumno */}
            <button
              type="button"
              id="select-role-student-card"
              onClick={() => {
                setSelectedRole('student');
                handleConfirmRole('student');
              }}
              disabled={isSubmitting}
              className={`p-6 rounded-2xl border-2 text-left flex flex-col justify-between transition-all group cursor-pointer ${
                selectedRole === 'student'
                  ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-400 shadow-md'
                  : 'bg-slate-50/60 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-4 shadow-sm shadow-emerald-200 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-950">
                  Soy alumno
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Quiero aprender música, ver mis próximas clases, acceder a partituras y practicar con instrumentos virtuales.
                </p>
              </div>

              <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                <span>Continuar como Alumno</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* Opción Profesor */}
            <button
              type="button"
              id="select-role-teacher-card"
              onClick={() => {
                setSelectedRole('teacher');
                handleConfirmRole('teacher');
              }}
              disabled={isSubmitting}
              className={`p-6 rounded-2xl border-2 text-left flex flex-col justify-between transition-all group cursor-pointer ${
                selectedRole === 'teacher'
                  ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-400 shadow-md'
                  : 'bg-slate-50/60 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40'
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#4F46E5] text-white flex items-center justify-center mb-4 shadow-sm shadow-indigo-200 group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-950">
                  Soy profesor
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Quiero enseñar, gestionar mis clases de música particulares, interactuar con mis alumnos y compartir materiales.
                </p>
              </div>

              <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition-transform">
                <span>Continuar como Profesor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>

          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Guardando tu rol en Firebase...</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-center">
            <button
              type="button"
              onClick={handleCancelAndLogout}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline cursor-pointer"
            >
              Cancelar e iniciar con otra cuenta
            </button>
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
