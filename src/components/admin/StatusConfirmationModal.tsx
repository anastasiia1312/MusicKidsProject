import React, { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldAlert,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';
import type { UserProfile } from '../../types/auth';

interface StatusConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  targetUser: UserProfile | null;
  actionType: 'activate' | 'deactivate';
  isLoading: boolean;
}

export const StatusConfirmationModal: React.FC<StatusConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetUser,
  actionType,
  isLoading,
}) => {
  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  // Evitar scroll en body
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

  if (!isOpen || !targetUser) return null;

  const isDeactivating = actionType === 'deactivate';

  return (
    <div
      id="status-confirmation-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden relative animate-in zoom-in-95 duration-200">
        {/* Botón cerrar X */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Encabezado con Ícono Grande */}
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isDeactivating
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {isDeactivating ? (
                <ShieldAlert className="w-6 h-6 stroke-[2]" />
              ) : (
                <CheckCircle2 className="w-6 h-6 stroke-[2]" />
              )}
            </div>

            <div className="space-y-1 pr-6">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block ${
                  isDeactivating
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {isDeactivating ? 'Desactivación temporal' : 'Reactivación de cuenta'}
              </span>

              <h3
                id="status-modal-title"
                className="font-parkinsans text-xl sm:text-2xl font-bold text-slate-900"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                {isDeactivating
                  ? '¿Desactivar acceso al usuario?'
                  : '¿Reactivar cuenta de usuario?'}
              </h3>
            </div>
          </div>

          {/* Caja con Datos del Usuario Afectado */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5 font-siemreap">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Usuario:</span>
              <span className="text-xs font-bold text-slate-800">
                {targetUser.role === 'teacher' ? 'Profesor' : 'Alumno'}
              </span>
            </div>
            <p className="font-bold text-slate-900 text-base">{targetUser.name}</p>
            <p className="text-xs text-slate-600 truncate">{targetUser.email}</p>
          </div>

          {/* Explicación de consecuencias */}
          <div className="space-y-3 font-siemreap text-xs sm:text-sm text-slate-600">
            {isDeactivating ? (
              <>
                <p className="leading-relaxed">
                  Al desactivar esta cuenta,{' '}
                  <strong className="text-slate-900 font-semibold">{targetUser.name}</strong>{' '}
                  perderá de forma inmediata el acceso a las funciones, clases, materiales y datos
                  protegidos de MusicKids.
                </p>
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    <strong>Garantía de integridad:</strong> Los datos del usuario, historial de
                    clases y perfiles <strong>NO serán eliminados</strong>. Podrás reactivar su cuenta
                    en cualquier momento desde este mismo panel.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="leading-relaxed">
                  Al reactivar la cuenta de{' '}
                  <strong className="text-slate-900 font-semibold">{targetUser.name}</strong>, el
                  usuario recuperará de forma inmediata el acceso a su panel, clases, calendario y
                  todas las herramientas de MusicKids.
                </p>
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    El usuario podrá iniciar sesión normalmente con sus credenciales habituales.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              id="btn-cancel-status-modal"
              onClick={onClose}
              disabled={isLoading}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer text-center"
            >
              Cancelar
            </button>

            <button
              type="button"
              id="btn-confirm-status-modal"
              onClick={onConfirm}
              disabled={isLoading}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                isDeactivating
                  ? 'bg-rose-600 hover:bg-rose-700 focus:ring-2 focus:ring-rose-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500/20'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : isDeactivating ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Sí, desactivar cuenta</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Sí, reactivar cuenta</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
