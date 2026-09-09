import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  DollarSign,
  Save,
  Check,
  AlertCircle,
  Loader2,
  Info,
  Calendar,
  Pencil,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchUserProfile,
  updateSingleLessonPriceService,
  updateMonthlyPlansService,
} from '../../services/authService';
import type { MonthlyPlan } from '../../types/auth';

interface TeacherRatesProps {
  onNavigate: (path: string) => void;
}

// 3 planes fijos base de MusicKids
const DEFAULT_MONTHLY_PLANS: MonthlyPlan[] = [
  {
    id: 'weekly_1',
    lessonsPerWeek: 1,
    lessonsPerMonth: 4,
    price: null,
    active: true,
  },
  {
    id: 'weekly_2',
    lessonsPerWeek: 2,
    lessonsPerMonth: 8,
    price: null,
    active: true,
  },
  {
    id: 'weekly_3',
    lessonsPerWeek: 3,
    lessonsPerMonth: 12,
    price: null,
    active: true,
  },
];

export const TeacherRates: React.FC<TeacherRatesProps> = ({ onNavigate }) => {
  const { user, role, refreshUserProfile } = useAuth();

  // Estado del campo de precio de clase individual (string para permitir edición limpia en input)
  const [singleLessonPrice, setSingleLessonPrice] = useState<string>('');

  // Estados de los planes mensuales fijos
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>(DEFAULT_MONTHLY_PLANS);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>('');
  const [isSavingPlanId, setIsSavingPlanId] = useState<string | null>(null);

  // Estados de control de carga y retroalimentación para clase individual
  const [loadingInitialData, setLoadingInitialData] = useState<boolean>(true);
  const [isSubmittingSingle, setIsSubmittingSingle] = useState<boolean>(false);
  const [singleSuccessMessage, setSingleSuccessMessage] = useState<string | null>(null);
  const [singleErrorMessage, setSingleErrorMessage] = useState<string | null>(null);

  // Estados de retroalimentación para planes mensuales
  const [monthlySuccessMessage, setMonthlySuccessMessage] = useState<string | null>(null);
  const [monthlyErrorMessage, setMonthlyErrorMessage] = useState<string | null>(null);

  // 1. Cargar datos existentes desde users/{uid} en Firestore
  useEffect(() => {
    let isMounted = true;

    async function loadPriceData() {
      if (!user?.uid) {
        setLoadingInitialData(false);
        return;
      }

      try {
        setLoadingInitialData(true);
        setSingleErrorMessage(null);
        setMonthlyErrorMessage(null);

        // Obtener el documento más reciente de users/{uid}
        const profile = await fetchUserProfile(user.uid);

        if (!isMounted) return;

        if (profile) {
          // Validar que el rol sea "teacher"
          if (profile.role !== 'teacher') {
            setSingleErrorMessage('Solo los profesores pueden configurar tarifas de clases.');
            setLoadingInitialData(false);
            return;
          }

          // A) Si existe singleLessonPrice, cargarlo en el campo; si no, dejar vacío
          if (
            profile.singleLessonPrice !== undefined &&
            profile.singleLessonPrice !== null &&
            !isNaN(profile.singleLessonPrice)
          ) {
            setSingleLessonPrice(String(profile.singleLessonPrice));
          } else {
            setSingleLessonPrice('');
          }

          // B) Si existen monthlyPlans en Firestore, cargarlos; si no, mostrar los 3 planes base
          if (
            profile.monthlyPlans &&
            Array.isArray(profile.monthlyPlans) &&
            profile.monthlyPlans.length > 0
          ) {
            const planMap = new Map(profile.monthlyPlans.map((p) => [p.id, p]));
            const merged = DEFAULT_MONTHLY_PLANS.map((base) => {
              const existing = planMap.get(base.id);
              if (existing) {
                return {
                  id: base.id,
                  lessonsPerWeek: base.lessonsPerWeek,
                  lessonsPerMonth: base.lessonsPerMonth,
                  price:
                    typeof existing.price === 'number' && !isNaN(existing.price)
                      ? existing.price
                      : null,
                  active:
                    existing.active !== undefined ? Boolean(existing.active) : true,
                };
              }
              return base;
            });
            setMonthlyPlans(merged);
          } else {
            // No existe todavía: se inicializan los 3 planes base sin guardar en Firestore automáticamente
            setMonthlyPlans(DEFAULT_MONTHLY_PLANS);
          }
        }
      } catch (err: any) {
        console.error('Error al cargar tarifas del profesor:', err);
        if (isMounted) {
          setSingleErrorMessage('No pudimos cargar tus tarifas actuales. Por favor, intentá nuevamente.');
        }
      } finally {
        if (isMounted) {
          setLoadingInitialData(false);
        }
      }
    }

    loadPriceData();

    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  // ==========================================
  // GESTIÓN DE CLASE INDIVIDUAL
  // ==========================================

  const handleSinglePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSingleLessonPrice(e.target.value);
    if (singleErrorMessage) setSingleErrorMessage(null);
    if (singleSuccessMessage) setSingleSuccessMessage(null);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingSingle) return;

    if (!user?.uid || role !== 'teacher') {
      setSingleErrorMessage('No tenés permisos para realizar esta acción o tu sesión expiró.');
      return;
    }

    const trimmed = singleLessonPrice.trim();
    if (!trimmed) {
      setSingleErrorMessage('El precio de la clase individual es obligatorio.');
      return;
    }

    const isStrictNumericFormat = /^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed);
    if (!isStrictNumericFormat) {
      setSingleErrorMessage('Por favor, ingresá un valor numérico válido (sin letras ni caracteres especiales).');
      return;
    }

    const numericValue = Number(trimmed);

    if (isNaN(numericValue) || !isFinite(numericValue)) {
      setSingleErrorMessage('El valor ingresado no es un número válido.');
      return;
    }

    if (numericValue <= 0) {
      setSingleErrorMessage('El precio debe ser mayor que 0.');
      return;
    }

    setIsSubmittingSingle(true);
    setSingleErrorMessage(null);
    setSingleSuccessMessage(null);

    try {
      await updateSingleLessonPriceService(user.uid, numericValue);
      await refreshUserProfile();
      setSingleSuccessMessage('Precio actualizado correctamente.');
    } catch (err: any) {
      console.error('Error al guardar precio de clase individual:', err);
      setSingleErrorMessage(
        err?.message || 'Ocurrió un error al guardar el precio. Revisá tu conexión e intentá nuevamente.'
      );
    } finally {
      setIsSubmittingSingle(false);
    }
  };

  // ==========================================
  // GESTIÓN DE PLANES MENSUALES
  // ==========================================

  const handleStartEditPlan = (plan: MonthlyPlan) => {
    setEditingPlanId(plan.id);
    setEditPriceInput(plan.price !== null ? String(plan.price) : '');
    setMonthlyErrorMessage(null);
    setMonthlySuccessMessage(null);
  };

  const handleCancelEditPlan = () => {
    setEditingPlanId(null);
    setEditPriceInput('');
    setMonthlyErrorMessage(null);
  };

  const handleSavePlanPrice = async (planId: 'weekly_1' | 'weekly_2' | 'weekly_3') => {
    if (!user?.uid || role !== 'teacher') {
      setMonthlyErrorMessage('No tenés permisos para realizar esta acción o tu sesión expiró.');
      return;
    }

    const currentPlan = monthlyPlans.find((p) => p.id === planId);
    if (!currentPlan) return;

    const trimmed = editPriceInput.trim();

    // Si el plan está activo, el precio es obligatorio
    if (currentPlan.active && !trimmed) {
      setMonthlyErrorMessage('El precio del plan es obligatorio cuando está activo.');
      return;
    }

    let numericPrice: number | null = null;
    if (trimmed) {
      const isStrictNumericFormat = /^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed);
      if (!isStrictNumericFormat) {
        setMonthlyErrorMessage(
          'Por favor, ingresá un precio numérico válido (sin letras ni caracteres especiales).'
        );
        return;
      }

      const val = Number(trimmed);
      if (isNaN(val) || !isFinite(val)) {
        setMonthlyErrorMessage('El valor ingresado no es un número válido.');
        return;
      }

      if (val <= 0) {
        setMonthlyErrorMessage('El precio del plan debe ser mayor que 0.');
        return;
      }

      numericPrice = val;
    }

    setIsSavingPlanId(planId);
    setMonthlyErrorMessage(null);
    setMonthlySuccessMessage(null);

    try {
      const updatedPlans: MonthlyPlan[] = monthlyPlans.map((p) =>
        p.id === planId ? { ...p, price: numericPrice } : p
      );

      await updateMonthlyPlansService(user.uid, updatedPlans);
      setMonthlyPlans(updatedPlans);
      setEditingPlanId(null);
      setEditPriceInput('');
      await refreshUserProfile();
      setMonthlySuccessMessage('Precio del plan guardado correctamente.');
    } catch (err: any) {
      console.error('Error al guardar precio del plan mensual:', err);
      setMonthlyErrorMessage(
        err?.message || 'Ocurrió un error al guardar el plan. Por favor, intentá nuevamente.'
      );
    } finally {
      setIsSavingPlanId(null);
    }
  };

  const handleTogglePlanActive = async (plan: MonthlyPlan) => {
    if (!user?.uid || role !== 'teacher') {
      setMonthlyErrorMessage('No tenés permisos para realizar esta acción o tu sesión expiró.');
      return;
    }

    // Si el plan está inactivo y se quiere activar, verificar que tenga un precio válido mayor a 0
    if (!plan.active) {
      if (plan.price === null || plan.price === undefined || plan.price <= 0) {
        setMonthlyErrorMessage(
          `Debés configurar un precio válido mayor a 0 antes de activar el plan de ${plan.lessonsPerWeek} clase${plan.lessonsPerWeek > 1 ? 's' : ''}/semana.`
        );
        handleStartEditPlan(plan);
        return;
      }
    }

    const nextActive = !plan.active;
    setIsSavingPlanId(plan.id);
    setMonthlyErrorMessage(null);
    setMonthlySuccessMessage(null);

    try {
      const updatedPlans: MonthlyPlan[] = monthlyPlans.map((p) =>
        p.id === plan.id ? { ...p, active: nextActive } : p
      );

      await updateMonthlyPlansService(user.uid, updatedPlans);
      setMonthlyPlans(updatedPlans);
      await refreshUserProfile();
      setMonthlySuccessMessage(
        nextActive
          ? `Plan de ${plan.lessonsPerWeek} clase${plan.lessonsPerWeek > 1 ? 's' : ''}/semana activado.`
          : `Plan de ${plan.lessonsPerWeek} clase${plan.lessonsPerWeek > 1 ? 's' : ''}/semana desactivado.`
      );
    } catch (err: any) {
      console.error('Error al actualizar estado del plan mensual:', err);
      setMonthlyErrorMessage(err?.message || 'Error al actualizar el estado del plan.');
    } finally {
      setIsSavingPlanId(null);
    }
  };

  const formatPriceDisplay = (val: number | null) => {
    if (val === null || val === undefined || isNaN(val)) {
      return 'Sin configurar';
    }
    return `$ ${val.toLocaleString('es-AR')}`;
  };

  return (
    <div id="teacher-rates-page" className="min-h-screen bg-[#F0F4F8] text-slate-900 flex flex-col font-sans">
      {/* HEADER DE NAVEGACIÓN */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 transition-all shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between">
          {/* Logo MusicKids */}
          <div
            id="rates-brand-link"
            className="flex items-center gap-1 cursor-pointer select-none group"
            onClick={() => onNavigate('/teacher/dashboard')}
            title="Volver al Panel del Profesor"
          >
            <span
              className="font-abril text-[22px] sm:text-[26px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Music
            </span>
            <img
              src="/images/logo-clef.png"
              alt="Clave de Sol MusicKids"
              className="h-7 sm:h-8 w-auto object-contain -mx-0.5 -mt-0.5 select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <span
              className="font-abril text-[22px] sm:text-[26px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Kids
            </span>
          </div>

          {/* Botón Volver al Dashboard */}
          <button
            type="button"
            id="btn-back-to-teacher-dashboard"
            onClick={() => onNavigate('/teacher/dashboard')}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 hover:text-[#00537A] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Panel</span>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        {/* Encabezado de la Sección */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#E8F3F8] text-[#00537A] mb-2">
            <GraduationCap className="w-3.5 h-3.5 text-[#00537A]" />
            <span>Tarifas del Profesor</span>
          </div>
          <h1
            id="teacher-rates-main-title"
            className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
          >
            Tarifas de clases
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configurá el valor de tus clases particulares y planes mensuales.
          </p>
        </div>

        {/* Estado de Carga Inicial */}
        {loadingInitialData ? (
          <div
            id="rates-loading-state"
            className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs flex flex-col items-center justify-center space-y-3"
          >
            <Loader2 className="w-8 h-8 text-[#00537A] animate-spin" />
            <p className="text-sm font-semibold text-slate-600">
              Cargando tus tarifas...
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* ==================================================== */}
            {/* SECCIÓN 1: CLASE INDIVIDUAL                          */}
            {/* ==================================================== */}
            <section id="section-single-lesson-price">
              {/* Mensaje de Éxito de Clase Individual */}
              {singleSuccessMessage && (
                <div
                  id="single-rates-success-alert"
                  className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-sm font-medium animate-in fade-in duration-200"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                  <span>{singleSuccessMessage}</span>
                </div>
              )}

              {/* Mensaje de Error de Clase Individual */}
              {singleErrorMessage && (
                <div
                  id="single-rates-error-alert"
                  className="mb-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium animate-in fade-in duration-200"
                >
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <span>{singleErrorMessage}</span>
                </div>
              )}

              {/* Tarjeta de Clase Individual */}
              <form onSubmit={handleSingleSubmit} id="single-lesson-price-form">
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
                  {/* Título de la tarjeta */}
                  <div className="border-b border-slate-100 pb-4">
                    <h2
                      id="single-lesson-card-title"
                      className="text-lg sm:text-xl font-bold text-slate-900"
                    >
                      Clase individual
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Establecé el costo por cada sesión individual impartida.
                    </p>
                  </div>

                  {/* Campo de precio */}
                  <div className="space-y-2 max-w-md">
                    <label
                      htmlFor="single-lesson-price-input"
                      className="block text-xs sm:text-sm font-bold text-slate-800"
                    >
                      Precio de la clase
                    </label>
                    <div className="relative rounded-2xl shadow-2xs">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                        <DollarSign className="w-5 h-5 text-slate-500" />
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        id="single-lesson-price-input"
                        value={singleLessonPrice}
                        onChange={handleSinglePriceChange}
                        placeholder="Ej. 20000"
                        disabled={isSubmittingSingle}
                        className="block w-full rounded-2xl border border-slate-200 bg-slate-50/50 pl-11 pr-4 py-3.5 text-base font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/20 focus:outline-none transition-all disabled:opacity-50"
                      />
                    </div>

                    {/* Texto informativo obligatorio */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Este precio será visible para los alumnos.</span>
                    </div>
                  </div>

                  {/* Botón Guardar Cambios */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                    <button
                      type="submit"
                      id="btn-save-single-lesson-price"
                      disabled={isSubmittingSingle}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold bg-[#00537A] hover:bg-[#004160] text-white shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingSingle ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Guardar cambios</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* ==================================================== */}
            {/* SECCIÓN 2: PLANES MENSUALES                          */}
            {/* ==================================================== */}
            <section id="section-monthly-plans" className="space-y-4">
              {/* Mensaje de Éxito de Planes Mensuales */}
              {monthlySuccessMessage && (
                <div
                  id="monthly-plans-success-alert"
                  className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-sm font-medium animate-in fade-in duration-200"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                  <span>{monthlySuccessMessage}</span>
                </div>
              )}

              {/* Mensaje de Error de Planes Mensuales */}
              {monthlyErrorMessage && (
                <div
                  id="monthly-plans-error-alert"
                  className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium animate-in fade-in duration-200"
                >
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <span>{monthlyErrorMessage}</span>
                </div>
              )}

              {/* Tarjeta Contenedora de Planes Mensuales */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
                {/* Cabecera de la sección */}
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#00537A]" />
                    <h2
                      id="monthly-plans-card-title"
                      className="text-lg sm:text-xl font-bold text-slate-900"
                    >
                      Planes mensuales
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Configurá el precio mensual para paquetes de clases recurrentes. Cada plan cuenta con una frecuencia semanal fija.
                  </p>
                </div>

                {/* VISTA TABLA PARA PANTALLAS MEDIANAS Y GRANDES */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse" id="monthly-plans-table">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Clases por semana</th>
                        <th className="py-3 px-4">Clases al mes</th>
                        <th className="py-3 px-4">Precio mensual</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {monthlyPlans.map((plan) => {
                        const isEditing = editingPlanId === plan.id;
                        const isSaving = isSavingPlanId === plan.id;

                        return (
                          <tr
                            key={plan.id}
                            id={`monthly-plan-row-${plan.id}`}
                            className={`hover:bg-slate-50/70 transition-colors ${
                              !plan.active ? 'opacity-70 bg-slate-50/40' : ''
                            }`}
                          >
                            {/* Clases por semana */}
                            <td className="py-4 px-4 font-bold text-slate-800">
                              {plan.lessonsPerWeek} {plan.lessonsPerWeek === 1 ? 'clase por semana' : 'clases por semana'}
                            </td>

                            {/* Clases por mes */}
                            <td className="py-4 px-4 font-medium text-slate-600">
                              {plan.lessonsPerMonth} clases
                            </td>

                            {/* Precio mensual */}
                            <td className="py-4 px-4">
                              {isEditing ? (
                                <div className="relative max-w-[180px]">
                                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                    <DollarSign className="w-4 h-4 text-slate-400" />
                                  </div>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoFocus
                                    value={editPriceInput}
                                    onChange={(e) => setEditPriceInput(e.target.value)}
                                    placeholder="Ej. 70400"
                                    disabled={isSaving}
                                    className="w-full rounded-xl border border-[#00537A] bg-white pl-8 pr-3 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A]/20"
                                  />
                                </div>
                              ) : (
                                <span
                                  className={`font-semibold ${
                                    plan.price !== null && plan.price > 0
                                      ? 'text-slate-900'
                                      : 'text-slate-400 italic'
                                  }`}
                                >
                                  {formatPriceDisplay(plan.price)}
                                </span>
                              )}
                            </td>

                            {/* Estado (Activo / Inactivo) */}
                            <td className="py-4 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                  plan.active
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    plan.active ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {plan.active ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>

                            {/* Acciones */}
                            <td className="py-4 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSavePlanPrice(plan.id)}
                                      disabled={isSaving}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#00537A] hover:bg-[#004160] text-white transition-colors cursor-pointer disabled:opacity-50"
                                      title="Guardar precio"
                                    >
                                      {isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                      <span>Guardar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditPlan}
                                      disabled={isSaving}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Cancelar edición"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>Cancelar</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditPlan(plan)}
                                      disabled={isSaving}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-[#00537A] hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Editar precio del plan"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Editar</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleTogglePlanActive(plan)}
                                      disabled={isSaving}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                                        plan.active
                                          ? 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
                                          : 'text-emerald-700 hover:bg-emerald-50'
                                      }`}
                                      title={plan.active ? 'Desactivar plan' : 'Activar plan'}
                                    >
                                      {isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : plan.active ? (
                                        <ToggleRight className="w-4 h-4 text-emerald-600" />
                                      ) : (
                                        <ToggleLeft className="w-4 h-4 text-slate-400" />
                                      )}
                                      <span>{plan.active ? 'Desactivar' : 'Activar'}</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* VISTA EN TARJETAS PARA DISPOSITIVOS MÓVILES */}
                <div className="block md:hidden space-y-4" id="monthly-plans-mobile-list">
                  {monthlyPlans.map((plan) => {
                    const isEditing = editingPlanId === plan.id;
                    const isSaving = isSavingPlanId === plan.id;

                    return (
                      <div
                        key={plan.id}
                        className={`p-4 rounded-2xl border transition-all space-y-3 ${
                          plan.active
                            ? 'bg-slate-50/60 border-slate-200'
                            : 'bg-slate-100/40 border-slate-200/60 opacity-80'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">
                              {plan.lessonsPerWeek} {plan.lessonsPerWeek === 1 ? 'clase/semana' : 'clases/semana'}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {plan.lessonsPerMonth} clases al mes
                            </p>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              plan.active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                plan.active ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            {plan.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>

                        {/* Campo o Valor de Precio */}
                        <div className="pt-1">
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Precio mensual:
                          </label>
                          {isEditing ? (
                            <div className="relative">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                <DollarSign className="w-4 h-4 text-slate-400" />
                              </div>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoFocus
                                value={editPriceInput}
                                onChange={(e) => setEditPriceInput(e.target.value)}
                                placeholder="Ej. 70400"
                                disabled={isSaving}
                                className="w-full rounded-xl border border-[#00537A] bg-white pl-8 pr-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A]/20"
                              />
                            </div>
                          ) : (
                            <div className="text-base font-bold text-slate-900">
                              {formatPriceDisplay(plan.price)}
                            </div>
                          )}
                        </div>

                        {/* Botones de acción móvil */}
                        <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-2">
                          {isEditing ? (
                            <div className="flex items-center gap-2 w-full">
                              <button
                                type="button"
                                onClick={() => handleSavePlanPrice(plan.id)}
                                disabled={isSaving}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-[#00537A] text-white"
                              >
                                {isSaving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>Guardar</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditPlan}
                                disabled={isSaving}
                                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 text-slate-700"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Cancelar</span>
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEditPlan(plan)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                <span>Editar precio</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleTogglePlanActive(plan)}
                                disabled={isSaving}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
                                  plan.active
                                    ? 'text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-700'
                                    : 'text-emerald-700 bg-emerald-50'
                                }`}
                              >
                                {isSaving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : plan.active ? (
                                  <ToggleRight className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                                )}
                                <span>{plan.active ? 'Desactivar' : 'Activar'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
