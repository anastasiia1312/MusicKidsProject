import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  ShieldCheck,
  CreditCard,
  User,
  Info,
} from 'lucide-react';
import {
  getTeacherBankDetails,
  saveTeacherBankDetails,
  validateBankDetails,
} from '../../services/teacherBankDetailsService';

interface TeacherBankDetailsSectionProps {
  teacherId: string;
}

export const TeacherBankDetailsSection: React.FC<TeacherBankDetailsSectionProps> = ({
  teacherId,
}) => {
  // Estados del formulario bancario
  const [alias, setAlias] = useState<string>('');
  const [cbuCvu, setCbuCvu] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');

  // Estados de carga y retroalimentación
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRulesPending, setIsRulesPending] = useState<boolean>(false);

  // 1. Cargar datos bancarios existentes al montar
  useEffect(() => {
    let isMounted = true;

    async function loadBankDetails() {
      if (!teacherId) {
        setLoadingInitial(false);
        return;
      }

      try {
        setLoadingInitial(true);
        setErrorMessage(null);
        setIsRulesPending(false);

        const data = await getTeacherBankDetails(teacherId);

        if (isMounted && data) {
          setAlias(data.alias || '');
          setCbuCvu(data.cbuCvu || '');
          setAccountHolder(data.accountHolder || '');
          setBankName(data.bankName || '');
        }
      } catch (err: any) {
        console.error('Error al cargar datos bancarios:', err);
        const errStr = err?.message || String(err);
        if (errStr.includes('PERMISSIONS_DENIED_BANK_DETAILS') || errStr.includes('permission-denied')) {
          if (isMounted) {
            setIsRulesPending(true);
            setErrorMessage(
              'Las reglas de seguridad de Firestore para datos bancarios aún no están desplegadas en Firebase Console. Podrás ver y editar el formulario, pero la lectura/escritura estará pausada hasta que se autorice la subcolección privada.'
            );
          }
        } else {
          if (isMounted) {
            setErrorMessage('No pudimos cargar tus datos bancarios. Por favor, intentá nuevamente.');
          }
        }
      } finally {
        if (isMounted) {
          setLoadingInitial(false);
        }
      }
    }

    loadBankDetails();

    return () => {
      isMounted = false;
    };
  }, [teacherId]);

  // 2. Manejo de cambios en los inputs con sanitización básica
  const handleCbuCvuChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permitir únicamente dígitos numéricos y limitar a 22 caracteres
    const rawVal = e.target.value.replace(/\D/g, '');
    const cleanVal = rawVal.slice(0, 22);
    setCbuCvu(cleanVal);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };

  const handleAliasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAlias(e.target.value);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };

  const handleAccountHolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAccountHolder(e.target.value);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };

  const handleBankNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBankName(e.target.value);
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);
  };

  // 3. Guardar cambios
  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!teacherId) {
      setErrorMessage('No se encontró una sesión de profesor válida.');
      return;
    }

    // Validación preliminar en cliente
    const validation = validateBankDetails({
      alias,
      cbuCvu,
      accountHolder,
      bankName,
    });

    if (!validation.isValid) {
      setErrorMessage(validation.errorMessage || 'Verificá los datos ingresados.');
      return;
    }

    setIsSaving(true);

    try {
      await saveTeacherBankDetails(teacherId, {
        alias,
        cbuCvu,
        accountHolder,
        bankName,
      });

      setSuccessMessage('Los datos para transferencias se guardaron correctamente.');
      setIsRulesPending(false);
    } catch (err: any) {
      console.error('Error al guardar datos bancarios:', err);
      const errStr = err?.message || String(err);
      if (errStr.includes('PERMISSIONS_DENIED_BANK_DETAILS') || errStr.includes('permission-denied')) {
        setIsRulesPending(true);
        setErrorMessage(
          'Permiso denegado en Firestore: Las reglas de seguridad para "users/{teacherId}/privateSettings/bankDetails" aún no están desplegadas en Firebase Console. Verificá la propuesta de reglas en el informe técnico.'
        );
      } else {
        setErrorMessage(
          err?.message || 'Ocurrió un error al guardar los datos bancarios. Por favor, intentá nuevamente.'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="teacher-bank-details-section"
      className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm mt-6"
    >
      {/* Encabezado de la sección */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0 shadow-2xs">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Datos para transferencias
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
              Configurá los datos de la cuenta donde recibirás los pagos de tus alumnos mediante transferencia bancaria.
            </p>
          </div>
        </div>

        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Privado y seguro</span>
        </span>
      </div>

      {/* Alerta de advertencia de reglas pendientes si corresponde */}
      {isRulesPending && (
        <div
          id="bank-details-rules-pending-alert"
          className="mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs sm:text-sm flex items-start gap-3"
        >
          <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Reglas de seguridad pendientes en Firebase Console</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              La subcolección <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-amber-950 font-bold">privateSettings/bankDetails</code> requiere
              autorización en las reglas de seguridad de Firestore para permitir la persistencia en producción.
            </p>
          </div>
        </div>
      )}

      {/* Banner de Mensaje de Éxito */}
      {successMessage && (
        <div
          id="bank-details-success-alert"
          className="mb-5 p-4 bg-emerald-50 border border-emerald-200/90 rounded-2xl flex items-center gap-3 text-emerald-800 text-xs sm:text-sm font-medium animate-in fade-in duration-200"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="flex-1 font-semibold">{successMessage}</span>
        </div>
      )}

      {/* Banner de Mensaje de Error */}
      {errorMessage && (
        <div
          id="bank-details-error-alert"
          className="mb-5 p-4 bg-rose-50 border border-rose-200/90 rounded-2xl flex items-start gap-3 text-rose-800 text-xs sm:text-sm font-medium animate-in fade-in duration-200"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Estado de Carga Inicial */}
      {loadingInitial ? (
        <div className="py-10 flex flex-col items-center justify-center text-slate-500 gap-2.5">
          <Loader2 className="w-7 h-7 animate-spin text-[#00537A]" />
          <p className="text-xs font-semibold text-slate-600">
            Consultando datos bancarios guardados...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSaveBankDetails} className="space-y-5" id="form-teacher-bank-details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. ALIAS (Obligatorio) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bank-alias-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Alias <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">Obligatorio</span>
              </div>
              <input
                type="text"
                id="bank-alias-input"
                value={alias}
                onChange={handleAliasChange}
                disabled={isSaving}
                placeholder="ej. musica.kids.profesor"
                className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-900 text-sm font-medium"
              />
              <p className="text-[11px] text-slate-500">
                El Alias de tu cuenta bancaria o billetera virtual.
              </p>
            </div>

            {/* 2. CBU / CVU (Obligatorio, exactamente 22 dígitos) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bank-cbu-cvu-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  CBU / CVU <span className="text-rose-500">*</span>
                </label>
                <span
                  className={`text-[11px] font-bold ${
                    cbuCvu.length === 22
                      ? 'text-emerald-700'
                      : cbuCvu.length > 0
                      ? 'text-amber-700'
                      : 'text-slate-400'
                  }`}
                >
                  {cbuCvu.length} / 22 dígitos
                </span>
              </div>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  id="bank-cbu-cvu-input"
                  value={cbuCvu}
                  onChange={handleCbuCvuChange}
                  disabled={isSaving}
                  maxLength={22}
                  placeholder="22 dígitos numéricos sin espacios"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-900 font-mono text-sm tracking-wide"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Debe contener exactamente 22 dígitos numéricos. No omitas los ceros iniciales.
              </p>
            </div>

            {/* 3. TITULAR DE LA CUENTA (Obligatorio) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bank-account-holder-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Titular de la cuenta <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">Obligatorio</span>
              </div>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  id="bank-account-holder-input"
                  value={accountHolder}
                  onChange={handleAccountHolderChange}
                  disabled={isSaving}
                  placeholder="Nombre y apellido completo"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-900 text-sm font-medium"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Nombre y apellido como figura registrado en tu entidad bancaria.
              </p>
            </div>

            {/* 4. BANCO O BILLETERA VIRTUAL (Opcional) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bank-name-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Banco o billetera virtual
                </label>
                <span className="text-[11px] text-slate-400 font-medium">Opcional</span>
              </div>
              <input
                type="text"
                id="bank-name-input"
                value={bankName}
                onChange={handleBankNameChange}
                disabled={isSaving}
                placeholder="ej. Banco Galicia, Banco Nación, Mercado Pago, Ualá..."
                className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-900 text-sm font-medium"
              />
              <p className="text-[11px] text-slate-500">
                Ayuda al alumno a identificar la entidad de destino al transferir.
              </p>
            </div>
          </div>

          {/* Aviso de Privacidad y Seguridad */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Información segura:</strong> Estos datos se guardan en tu subcolección privada y no son públicos en la plataforma. Nunca te solicitaremos contraseñas, claves bancarias ni números de tarjetas.
            </p>
          </div>

          {/* Botón de Guardado */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-400 text-center sm:text-left">
              Podés modificar estos datos en cualquier momento.
            </p>

            <button
              type="submit"
              id="btn-save-bank-details"
              disabled={isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#00537A] hover:bg-[#004160] active:scale-[0.99] text-white font-bold px-7 py-3 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando datos bancarios...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar datos bancarios</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
