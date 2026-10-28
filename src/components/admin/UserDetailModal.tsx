import React, { useEffect } from 'react';
import {
  X,
  Mail,
  Calendar,
  Shield,
  GraduationCap,
  Music,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  DollarSign,
  FileText,
  User as UserIcon,
  BookOpen,
} from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import { formatRegistrationDate } from '../../services/adminService';

interface UserDetailModalProps {
  user: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

const INSTRUMENT_LABELS: Record<string, string> = {
  guitar: 'Guitarra',
  ukulele: 'Ukulele',
  solfege: 'Solfeo',
  vocal: 'Vocal / Canto',
};

const PLAN_LABELS: Record<string, string> = {
  weekly_1: '1 clase por semana (4 clases/mes)',
  weekly_2: '2 clases por semana (8 clases/mes)',
  weekly_3: '3 clases por semana (12 clases/mes)',
};

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  isOpen,
  onClose,
}) => {
  const [copiedUid, setCopiedUid] = React.useState(false);

  // Cerrar con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Evitar scroll en body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const userStatus = user.status || 'active';
  const isActive = userStatus === 'active';

  const copyUidToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      // Fallback silencioso
    }
  };

  return (
    <div
      id="user-detail-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-detail-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
        {/* Cabecera del Modal */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-[#F0F4F8] via-[#E8F3F8] to-[#F0F4F8] border-b border-slate-200/80 relative">
          <button
            type="button"
            id="btn-close-modal-x"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-4 sm:gap-5">
            {/* Avatar o Iniciales */}
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white shadow-md shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#00537A] text-white flex items-center justify-center font-bold text-2xl sm:text-3xl shadow-md shrink-0">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}

            <div className="flex-1 min-w-0 pr-8">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {/* Badge de Rol */}
                {user.role === 'teacher' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Profesor
                  </span>
                )}
                {user.role === 'student' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Music className="w-3.5 h-3.5" />
                    Alumno
                  </span>
                )}
                {user.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#00537A] text-white">
                    <Shield className="w-3.5 h-3.5" />
                    Administrador
                  </span>
                )}

                {/* Badge de Estado */}
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Activo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Desactivado
                  </span>
                )}

                {/* Badge de Solo Lectura */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200/80 text-slate-700">
                  Solo Lectura
                </span>
              </div>

              <h2
                id="user-detail-modal-title"
                className="font-parkinsans text-xl sm:text-2xl font-bold text-slate-900 truncate"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                {user.name}
              </h2>

              <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5 mt-0.5 truncate font-siemreap">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Cuerpo del Modal (Scrolleable) */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 text-slate-800 font-siemreap">
          {/* Bloque: Información General de la Cuenta */}
          <div>
            <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-3 flex items-center gap-1.5 font-parkinsans">
              <UserIcon className="w-3.5 h-3.5 text-slate-500" />
              Datos de la Cuenta
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Fecha de Registro */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                <p className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Fecha de registro
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {formatRegistrationDate(user.createdAt)}
                </p>
              </div>

              {/* Proveedor de Autenticación */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                <p className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <Shield className="w-3 h-3 text-slate-400" />
                  Método de acceso
                </p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5 capitalize">
                  {user.authProvider === 'google' ? 'Google Account' : 'Correo y contraseña'}
                </p>
              </div>

              {/* UID del Documento */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 sm:col-span-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">
                    ID de usuario (UID Firestore)
                  </p>
                  <p className="text-xs font-mono text-slate-700 truncate mt-0.5">
                    {user.uid}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyUidToClipboard}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Copiar UID"
                >
                  {copiedUid ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Fecha de nacimiento (si existe) */}
              {user.birthDate && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 sm:col-span-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">
                    Fecha de nacimiento
                  </p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">
                    {user.birthDate}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bloque: Información específica de Profesor */}
          {user.role === 'teacher' && (
            <div className="pt-2 border-t border-slate-100 space-y-4">
              <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1.5 font-parkinsans">
                <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                Perfil Profesional del Profesor
              </h3>

              {/* Especialidades e Instrumentos */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  Especialidades e instrumentos impartidos:
                </p>
                {user.instruments && user.instruments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {user.instruments.map((inst) => (
                      <span
                        key={inst}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#E8F3F8] text-[#00537A] border border-[#00537A]/15"
                      >
                        <Music className="w-3 h-3 text-[#00537A]" />
                        {INSTRUMENT_LABELS[inst] || inst}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    No ha seleccionado instrumentos aún.
                  </p>
                )}
              </div>

              {/* Tarifas y Planes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70">
                  <p className="text-[11px] font-semibold text-amber-800 uppercase flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-amber-600" />
                    Precio por clase individual
                  </p>
                  <p className="text-base font-bold text-amber-900 mt-0.5">
                    {typeof user.singleLessonPrice === 'number'
                      ? `$${user.singleLessonPrice.toFixed(2)} USD`
                      : 'No configurado'}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
                  <p className="text-[11px] font-semibold text-indigo-800 uppercase flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-indigo-600" />
                    Planes mensuales activos
                  </p>
                  <p className="text-sm font-bold text-indigo-900 mt-0.5">
                    {user.monthlyPlans && user.monthlyPlans.filter((p) => p.active).length > 0
                      ? `${user.monthlyPlans.filter((p) => p.active).length} planes habilitados`
                      : 'Ninguno configurado'}
                  </p>
                </div>
              </div>

              {/* Detalle de planes si existen */}
              {user.monthlyPlans && user.monthlyPlans.some((p) => p.active) && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600">
                    Desglose de planes:
                  </p>
                  <div className="space-y-1">
                    {user.monthlyPlans
                      .filter((p) => p.active)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                        >
                          <span className="font-medium text-slate-700">
                            {PLAN_LABELS[p.id] || p.id}
                          </span>
                          <span className="font-bold text-slate-900">
                            ${p.price ? p.price.toFixed(2) : '0.00'} / mes
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Biografía */}
              {user.bio && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1 mb-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    Presentación personal
                  </p>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {user.bio}
                  </p>
                </div>
              )}

              {/* Formación Musical */}
              {user.education && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1 mb-1">
                    <GraduationCap className="w-3 h-3 text-slate-400" />
                    Formación musical y estudios
                  </p>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {user.education}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Bloque: Información específica de Alumno */}
          {user.role === 'student' && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1.5 font-parkinsans">
                <Music className="w-3.5 h-3.5 text-slate-500" />
                Perfil del Alumno
              </h3>

              {user.bio ? (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
                    Intereses y notas de aprendizaje
                  </p>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {user.bio}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  El alumno no ha cargado una descripción personal aún.
                </p>
              )}
            </div>
          )}

          {/* Nota de pie explicativa de solo lectura */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
            Vista de perfil para administradores. La edición de datos de usuarios está restringida a sus respectivos propietarios.
          </div>
        </div>

        {/* Footer del Modal */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end">
          <button
            type="button"
            id="btn-close-modal-bottom"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
