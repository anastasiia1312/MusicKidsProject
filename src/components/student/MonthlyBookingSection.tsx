import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarDays,
  Sparkles,
  Info,
  ChevronRight,
  ShieldAlert,
  DollarSign,
  X,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import type { TeacherRecurringSlot } from '../../types/recurringSchedule';
import type { TeacherScheduleException } from '../../types/scheduleException';
import type { TeacherAvailability } from '../../types/availability';
import type { MonthlyPlan } from '../../types/auth';
import { getTeacherRecurringSlots } from '../../services/recurringScheduleService';
import { getTeacherScheduleExceptions } from '../../services/teacherScheduleExceptionService';
import { getTeacherAvailability } from '../../services/availabilityService';
import { fetchUserProfile } from '../../services/authService';
import {
  getAvailableMonthOptions,
  calculateMonthlyOccurrences,
  checkSelectedRulesOverlap,
  getFixedMonthlyRateForFrequency,
  formatExpirationBuenosAires,
  type FixedMonthlyRateResult,
} from '../../services/monthlyBookingService';
import { createTemporaryMonthlyBooking } from '../../services/monthlyBookingConfirmationService';
import type {
  MonthOption,
  OccurrenceStatus,
  TeacherSlotLock,
  TemporaryMonthlyBookingResult,
} from '../../types/monthlyBooking';

interface MonthlyBookingSectionProps {
  teacherId: string;
  teacherName?: string;
  monthlyPlans?: MonthlyPlan[];
}

const DAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

export const MonthlyBookingSection: React.FC<MonthlyBookingSectionProps> = ({
  teacherId,
  teacherName = 'el profesor',
  monthlyPlans: monthlyPlansProp,
}) => {
  // Opciones de meses futuros disponibles
  const monthOptions = useMemo(() => getAvailableMonthOptions(6), []);
  const [selectedMonthOption, setSelectedMonthOption] = useState<MonthOption>(monthOptions[0]);

  // Frecuencia semanal deseada (1, 2 o 3 clases fijas por semana)
  const [targetFrequency, setTargetFrequency] = useState<number>(1);

  // Reglas recurrentes seleccionadas (IDs)
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);

  // Estados de datos remotos
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recurringSlots, setRecurringSlots] = useState<TeacherRecurringSlot[]>([]);
  const [exceptions, setExceptions] = useState<TeacherScheduleException[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<TeacherAvailability[]>([]);
  const [slotLocks, setSlotLocks] = useState<TeacherSlotLock[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>(monthlyPlansProp || []);

  // Contexto de autenticación
  const { user, role } = useAuth();

  // Estados de modal y confirmación de reserva temporal (SUBBLOQUE 6B.3)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingResult, setBookingResult] = useState<TemporaryMonthlyBookingResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sincronizar planes si las props cambian
  useEffect(() => {
    if (monthlyPlansProp && monthlyPlansProp.length > 0) {
      setMonthlyPlans(monthlyPlansProp);
    }
  }, [monthlyPlansProp]);

  // Cargar datos necesarios del profesor
  const loadData = async () => {
    if (!teacherId) return;

    try {
      setLoading(true);
      setLoadError(null);

      // 1. Cargar reglas recurrentes activas
      const recurringPromise = getTeacherRecurringSlots(teacherId, true).catch((err) => {
        console.error('Error al consultar teacherRecurringSlots:', err);
        throw err;
      });

      // 2. Cargar excepciones y bloqueos
      const exceptionsPromise = getTeacherScheduleExceptions(teacherId).catch((err) => {
        console.warn('Advertencia al consultar teacherScheduleExceptions:', err);
        return [] as TeacherScheduleException[];
      });

      // 3. Cargar disponibilidad y franjas puntuales/reservadas
      const availabilityPromise = getTeacherAvailability(teacherId).catch((err) => {
        console.warn('Advertencia al consultar teacherAvailability:', err);
        return [] as TeacherAvailability[];
      });

      // 4. Cargar bloqueos temporales existentes
      const locksPromise = getDocs(
        query(collection(db, 'teacherSlotLocks'), where('teacherId', '==', teacherId))
      )
        .then((snap) => snap.docs.map((d) => d.data() as TeacherSlotLock))
        .catch((err) => {
          console.warn('Advertencia al consultar teacherSlotLocks:', err);
          return [] as TeacherSlotLock[];
        });

      // 5. Si no se recibieron planes mensuales por props, cargarlos del perfil
      const profilePromise =
        !monthlyPlansProp || monthlyPlansProp.length === 0
          ? fetchUserProfile(teacherId).catch((err) => {
              console.warn('Advertencia al consultar planes del profesor:', err);
              return null;
            })
          : Promise.resolve(null);

      const [
        fetchedRecurring,
        fetchedExceptions,
        fetchedAvailability,
        fetchedLocks,
        fetchedProfile,
      ] = await Promise.all([
        recurringPromise,
        exceptionsPromise,
        availabilityPromise,
        locksPromise,
        profilePromise,
      ]);

      setRecurringSlots(fetchedRecurring);
      setExceptions(fetchedExceptions);
      setAvailabilitySlots(fetchedAvailability);
      setSlotLocks(fetchedLocks);

      if (fetchedProfile && Array.isArray(fetchedProfile.monthlyPlans)) {
        setMonthlyPlans(fetchedProfile.monthlyPlans);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('permission-denied') || msg.includes('insufficient permissions')) {
        setLoadError('Permiso denegado al consultar la disponibilidad recurrente del profesor.');
      } else {
        setLoadError('No se pudo cargar la configuración de horarios del profesor en este momento.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [teacherId, monthlyPlansProp]);

  // Tarifa fija para la frecuencia semanal actualmente seleccionada (SUBBLOQUE 6B.2)
  const currentFixedRate: FixedMonthlyRateResult = useMemo(() => {
    return getFixedMonthlyRateForFrequency(monthlyPlans, targetFrequency);
  }, [monthlyPlans, targetFrequency]);

  // Tarifas fijas para cada frecuencia (1, 2, 3) para mostrar en los botones de selección
  const frequencyRates = useMemo(() => {
    return {
      1: getFixedMonthlyRateForFrequency(monthlyPlans, 1),
      2: getFixedMonthlyRateForFrequency(monthlyPlans, 2),
      3: getFixedMonthlyRateForFrequency(monthlyPlans, 3),
    };
  }, [monthlyPlans]);

  // Limpiar selección de horarios si cambia la frecuencia objetivo
  const handleFrequencyChange = (freq: number) => {
    setTargetFrequency(freq);
    setSelectedRuleIds((prev) => prev.slice(0, freq));
  };

  // Reglas seleccionadas completas
  const selectedRules = useMemo(() => {
    return recurringSlots.filter((r) => r.id && selectedRuleIds.includes(r.id));
  }, [recurringSlots, selectedRuleIds]);

  // Validación de superposición entre las reglas seleccionadas
  const overlapCheck = useMemo(() => {
    return checkSelectedRulesOverlap(selectedRules);
  }, [selectedRules]);

  // Manejador para alternar la selección de una regla
  const toggleRuleSelection = (ruleId: string) => {
    if (!ruleId) return;

    setSelectedRuleIds((prev) => {
      if (prev.includes(ruleId)) {
        return prev.filter((id) => id !== ruleId);
      }

      if (prev.length >= targetFrequency) {
        // Reemplazar la última selección o mantener el límite
        return [...prev.slice(0, targetFrequency - 1), ruleId];
      }

      return [...prev, ruleId];
    });
  };

  // Cálculo en memoria de la vista previa de ocurrencias del mes
  const previewResult = useMemo(() => {
    if (selectedRules.length === 0) return null;

    return calculateMonthlyOccurrences({
      year: selectedMonthOption.year,
      month: selectedMonthOption.month,
      selectedRules,
      exceptions,
      availabilitySlots,
      activeLocks: slotLocks,
      targetClassesPerWeek: targetFrequency,
    });
  }, [
    selectedMonthOption,
    selectedRules,
    exceptions,
    availabilitySlots,
    slotLocks,
    targetFrequency,
  ]);

  // Helper para renderizar insignia de estado
  const renderStatusBadge = (status: OccurrenceStatus, label: string) => {
    switch (status) {
      case 'available':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{label}</span>
          </span>
        );
      case 'occupied':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>{label}</span>
          </span>
        );
      case 'vacation':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>{label}</span>
          </span>
        );
      case 'blocked_date':
      case 'blocked_slot':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>{label}</span>
          </span>
        );
      case 'not_originated':
      case 'past':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{label}</span>
          </span>
        );
    }
  };

  return (
    <section
      id="monthly-booking-section"
      className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-7"
    >
      {/* Cabecera de la sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E8F3F8] text-[#00537A] text-[11px] font-bold mb-1">
              <Sparkles className="w-3 h-3" />
              <span>Abono Mensual Recurrente</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Reservar clases mensuales
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Configurá 1, 2 o 3 horarios fijos por semana y visualizá todas las clases correspondientes al mes elegido.
            </p>
          </div>
        </div>
      </div>

      {/* Manejo de estados de carga y error */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#00537A]" />
          <span className="text-sm font-semibold text-slate-600">
            Consultando horarios recurrentes y excepciones de {teacherName}...
          </span>
        </div>
      ) : loadError ? (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">No pudimos cargar la disponibilidad recurrente</span>
            <p className="text-xs text-rose-700 mt-1">{loadError}</p>
          </div>
        </div>
      ) : recurringSlots.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 text-center space-y-2">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">
            {teacherName} aún no ha publicado horarios recurrentes fijos
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Podés consultar los horarios extraordinarios puntuales disponibles más arriba o contactar al profesor para acordar un horario.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {/* PASO 1: Selección del Mes */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              1. Seleccioná el mes de cursada
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {monthOptions.map((opt) => {
                const isSelected =
                  opt.year === selectedMonthOption.year && opt.month === selectedMonthOption.month;
                return (
                  <button
                    key={`${opt.year}-${opt.month}`}
                    type="button"
                    onClick={() => setSelectedMonthOption(opt)}
                    className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all border text-center cursor-pointer ${
                      isSelected
                        ? 'bg-[#00537A] text-white border-[#00537A] shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80'
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PASO 2: Selección de Frecuencia Semanal (1, 2 o 3 clases) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                2. Frecuencia semanal deseada
              </label>
              <span className="text-xs font-semibold text-[#00537A]">
                Seleccionados: {selectedRuleIds.length} de {targetFrequency}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { freq: 1, label: '1 clase por semana', desc: '4 o 5 clases al mes' },
                { freq: 2, label: '2 clases por semana', desc: '8 a 10 clases al mes' },
                { freq: 3, label: '3 clases por semana', desc: '12 a 14 clases al mes' },
              ].map((item) => {
                const isSelected = targetFrequency === item.freq;
                const itemRate = frequencyRates[item.freq as 1 | 2 | 3];
                return (
                  <button
                    key={item.freq}
                    type="button"
                    onClick={() => handleFrequencyChange(item.freq)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#E8F3F8] border-[#00537A] text-[#00537A] ring-1 ring-[#00537A]'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div>
                      <span className="font-extrabold text-sm block">{item.label}</span>
                      <span className="text-xs text-slate-500 mt-0.5 block">{item.desc}</span>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70">
                      {itemRate.isConfigured ? (
                        <div className="text-xs font-extrabold text-[#00537A]">
                          $ {itemRate.price!.toLocaleString('es-AR')}{' '}
                          <span className="text-[10px] font-semibold text-slate-500">
                            ARS / mes
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] font-medium text-slate-400 italic">
                          Tarifa no configurada
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tarjeta de Precio Fijo Mensual (Subbloque 6B.2) */}
            <div id="monthly-fixed-rate-container" className="pt-2">
              {currentFixedRate.isConfigured ? (
                <div
                  id="monthly-fixed-rate-card"
                  className="bg-gradient-to-r from-[#E8F3F8]/90 via-[#F0F8FB] to-emerald-50/70 rounded-2xl p-4 sm:p-5 border border-[#00537A]/20 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-[#00537A] bg-[#00537A]/10 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Abono Mensual Fijo</span>
                      </span>
                      <span className="text-xs font-bold text-slate-700">
                        {targetFrequency} {targetFrequency === 1 ? 'clase por semana' : 'clases por semana'} • {selectedMonthOption.label}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm font-medium text-slate-700">
                      Cantidad real de clases proyectadas:{' '}
                      <strong className="text-slate-900 font-bold">
                        {previewResult
                          ? `${previewResult.totalOccurrences} clases en ${selectedMonthOption.label}`
                          : targetFrequency === 1
                          ? '4 o 5 clases (según días del mes)'
                          : targetFrequency === 2
                          ? '8 a 10 clases (según días del mes)'
                          : '12 a 14 clases (según días del mes)'}
                      </strong>
                    </div>

                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      El precio del abono es mensual y fijo, independientemente de la cantidad de clases del mes.
                    </p>
                  </div>

                  <div className="flex flex-col md:items-end justify-center shrink-0 border-t md:border-t-0 md:border-l border-slate-200/80 pt-3 md:pt-0 md:pl-6">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Precio total mensual
                    </span>
                    <div className="text-2xl sm:text-3xl font-black text-[#00537A] tracking-tight">
                      $ {currentFixedRate.price!.toLocaleString('es-AR')}
                      <span className="text-xs sm:text-sm font-bold text-slate-600 ml-1.5">
                        ARS
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full mt-1">
                      Moneda ARS
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  id="monthly-rate-not-configured-alert"
                  className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      El profesor todavía no configuró el precio de este abono.
                    </span>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      Para contratar el abono de {targetFrequency} {targetFrequency === 1 ? 'clase semanal' : 'clases semanales'}, el profesor debe establecer previamente su tarifa mensual correspondiente en su perfil.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PASO 3: Selección de Horarios Recurrentes del Profesor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                3. Elegí los horarios fijos del profesor ({selectedRuleIds.length}/{targetFrequency})
              </label>
              {selectedRuleIds.length < targetFrequency && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 font-bold">
                  Faltan elegir {targetFrequency - selectedRuleIds.length} horario(s)
                </span>
              )}
            </div>

            {overlapCheck.hasOverlap && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{overlapCheck.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {recurringSlots.map((rule) => {
                const isSelected = selectedRuleIds.includes(rule.id || '');
                const dayName = DAY_LABELS[rule.dayOfWeek] || `Día ${rule.dayOfWeek}`;

                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => toggleRuleSelection(rule.id || '')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#00537A] text-white border-[#00537A] shadow-xs'
                        : 'bg-slate-50/60 hover:bg-slate-100/80 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span
                        className={`text-xs font-bold uppercase tracking-wide block ${
                          isSelected ? 'text-white/80' : 'text-slate-500'
                        }`}
                      >
                        Todos los {dayName}
                      </span>
                      <span className="text-sm sm:text-base font-extrabold tracking-tight block">
                        {rule.startTime} - {rule.endTime}
                      </span>
                      <span
                        className={`text-[11px] font-semibold block ${
                          isSelected ? 'text-white/80' : 'text-slate-400'
                        }`}
                      >
                        Duración: {rule.duration} min
                        {rule.originDate && ` • Válido desde ${rule.originDate}`}
                      </span>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                        isSelected
                          ? 'bg-white text-[#00537A] border-white'
                          : 'border-slate-300 text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 fill-current" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PASO 4: VISTA PREVIA Y EVALUACIÓN DE DISPONIBILIDAD DEL MES */}
          {selectedRules.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              Seleccioná {targetFrequency} {targetFrequency === 1 ? 'horario' : 'horarios'} para calcular y visualizar la lista completa de clases de {selectedMonthOption.label}.
            </div>
          ) : previewResult ? (
            <div className="space-y-5 pt-3 border-t border-slate-100">
              {/* Barra de Resumen de Clases con Tarifa Fija Mensual */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Vista previa de cursada: {previewResult.monthLabel}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {previewResult.selectedRulesCount} {previewResult.selectedRulesCount === 1 ? 'horario semanal' : 'horarios semanales'} • Total de clases en el mes:{' '}
                    <strong className="text-slate-900 font-bold">{previewResult.totalOccurrences} clases</strong>
                  </p>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-xs font-bold text-[#00537A]">
                      Abono mensual:{' '}
                      {currentFixedRate.isConfigured
                        ? `$ ${currentFixedRate.price!.toLocaleString('es-AR')} ARS`
                        : 'Tarifa no configurada'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      • Moneda ARS • Precio mensual fijo
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {previewResult.availableCount} disponibles
                  </span>
                  {previewResult.unavailableCount > 0 && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      {previewResult.unavailableCount} con conflicto
                    </span>
                  )}
                </div>
              </div>

              {/* Banner de Política de Abono Completo */}
              {previewResult.isFullyAvailable ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Abono mensual 100% disponible</span>
                    <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                      Todas las {previewResult.totalOccurrences} clases del mes seleccionado están libres y disponibles para cursar de forma continua.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Abono no disponible para reserva completa</span>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      {previewResult.unavailableCount} de las {previewResult.totalOccurrences} clases presentan conflictos de disponibilidad (vacaciones, bloqueos o reservas previas). Para garantizar la continuidad pedagógica, el abono mensual requiere que todas sus clases estén disponibles.
                    </p>
                  </div>
                </div>
              )}

              {/* Lista Detallada de Ocurrencias del Mes */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Calendario detallado de clases ({previewResult.totalOccurrences} fechas)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {previewResult.occurrences.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                        item.status === 'available'
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50/70 border-slate-200/90'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-extrabold text-slate-900 block">
                            {item.formattedDate}
                          </span>
                          <span className="text-xs text-slate-500 font-semibold block mt-0.5">
                            {item.startTime} - {item.endTime} ({item.duration} min)
                          </span>
                        </div>
                        {renderStatusBadge(item.status, item.statusLabel)}
                      </div>

                      {item.conflictReason && (
                        <p className="text-[11px] text-rose-700 bg-rose-50/70 border border-rose-200/60 rounded-xl px-2.5 py-1 font-medium mt-1">
                          {item.conflictReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ACCIÓN DE RESERVA TEMPORAL (SUBBLOQUE 6B.3) */}
              {previewResult.isFullyAvailable ? (
                currentFixedRate.isConfigured ? (
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-[#E8F3F8] to-slate-50 border border-[#00537A]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="font-extrabold text-[#00537A] text-sm sm:text-base flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#00537A]" />
                        Abono mensual disponible para reserva
                      </span>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Podés reservar y bloquear las {previewResult.totalOccurrences} clases del mes de forma exclusiva durante 24 horas mientras realizás el pago por transferencia.
                      </p>
                    </div>

                    <button
                      id="btn-reserve-monthly-24h"
                      type="button"
                      onClick={() => {
                        setSubmitError(null);
                        setBookingResult(null);
                        setIsModalOpen(true);
                      }}
                      className="w-full sm:w-auto px-5 py-3 rounded-xl font-extrabold text-sm text-white bg-[#00537A] hover:bg-[#003d5b] transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                      <Clock className="w-4 h-4" />
                      <span>Reservar por 24 horas</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Tarifa mensual no configurada</span>
                      <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                        El profesor aún no ha establecido la tarifa fija mensual para la frecuencia de {targetFrequency} {targetFrequency === 1 ? 'clase' : 'clases'} por semana. No es posible iniciar la reserva en este momento.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 text-xs flex items-start gap-3">
                  <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Para habilitar la reserva mensual de 24 horas, todas las fechas del mes seleccionado deben encontrarse libres de conflictos.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE RESERVA TEMPORAL (24 HORAS) */}
      {isModalOpen && previewResult && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Botón cerrar */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                if (isSubmitting) return;
                setIsModalOpen(false);
                if (bookingResult?.success) {
                  loadData();
                }
              }}
              className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>

            {bookingResult?.success ? (
              /* ESTADO DE ÉXITO */
              <div className="space-y-5 text-center pt-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-xl font-extrabold text-slate-900">
                    ¡Reserva temporal creada!
                  </h3>
                  <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-200">
                    Tu reserva temporal se creó correctamente. Tenés 24 horas para realizar la transferencia.
                  </p>
                </div>

                {/* Tarjeta de vencimiento exacto */}
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>Límite para realizar el pago:</span>
                  </div>
                  <p className="text-base font-extrabold text-amber-950">
                    {bookingResult.expiresAtFormatted ||
                      formatExpirationBuenosAires(bookingResult.expiresAt)}
                  </p>
                  <p className="text-[11px] text-amber-800">
                    (Horario oficial de Argentina • Si no se confirma el pago antes de este momento, los horarios se liberarán automáticamente).
                  </p>
                </div>

                {/* Resumen del abono reservado */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Profesor:</span>
                    <strong className="text-slate-900">{teacherName}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Mes de cursada:</span>
                    <strong className="text-slate-900">{previewResult.monthLabel}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Clases reservadas:</span>
                    <strong className="text-slate-900">{bookingResult.totalLessons} clases</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-semibold">Total a transferir:</span>
                    <strong className="text-slate-900 text-sm font-extrabold text-[#00537A]">
                      $ {bookingResult.totalPrice?.toLocaleString('es-AR')} {bookingResult.currency}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setBookingResult(null);
                    loadData();
                  }}
                  className="w-full py-3 px-4 rounded-xl font-bold text-white bg-[#00537A] hover:bg-[#003d5b] transition-all shadow-md cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            ) : (
              /* FORMULARIO DE CONFIRMACIÓN PREVIO */
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Confirmar reserva temporal por 24 horas
                  </h3>
                  <p className="text-xs text-slate-600">
                    Revisá el resumen de tu abono antes de bloquear los horarios en el calendario.
                  </p>
                </div>

                {/* Resumen de la reserva */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Profesor:</span>
                    <strong className="text-slate-900">{teacherName}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Mes de cursada:</span>
                    <strong className="text-slate-900">{previewResult.monthLabel}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Frecuencia semanal:</span>
                    <strong className="text-slate-900">
                      {targetFrequency} {targetFrequency === 1 ? 'clase' : 'clases'} por semana
                    </strong>
                  </div>
                  <div className="py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold block mb-1">Horarios seleccionados:</span>
                    <div className="space-y-0.5">
                      {selectedRules.map((rule) => (
                        <div key={rule.id} className="text-slate-800 font-medium pl-2 border-l-2 border-[#00537A]">
                          {DAY_LABELS[rule.dayOfWeek]}: {rule.startTime} - {rule.endTime} (45 min)
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Total de clases del mes:</span>
                    <strong className="text-slate-900">{previewResult.totalOccurrences} clases</strong>
                  </div>
                  <div className="flex justify-between py-1.5 items-center bg-white px-3 rounded-xl border border-slate-200">
                    <span className="text-slate-700 font-bold">Precio total mensual fijo:</span>
                    <strong className="text-slate-900 text-base font-extrabold text-[#00537A]">
                      $ {currentFixedRate.price?.toLocaleString('es-AR')} ARS
                    </strong>
                  </div>
                </div>

                {/* Advertencia sobre la reserva temporal */}
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Al confirmar, las {previewResult.totalOccurrences} clases quedarán reservadas exclusivamente a tu nombre por <strong>24 horas</strong>. Tendrás ese plazo para realizar la transferencia bancaria.
                  </p>
                </div>

                {/* Validaciones de sesión */}
                {!user ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Debés iniciar sesión con tu cuenta de alumno para realizar la reserva.</span>
                  </div>
                ) : role === 'teacher' ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Estás conectado como profesor. Para reservar un abono, ingresá con tu cuenta de alumno.</span>
                  </div>
                ) : null}

                {/* Error al procesar */}
                {submitError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Botones de acción */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || !user || role === 'teacher'}
                    onClick={async () => {
                      if (!user) {
                        setSubmitError('Debés iniciar sesión para reservar.');
                        return;
                      }
                      if (!previewResult || !previewResult.isFullyAvailable || !currentFixedRate.isConfigured) {
                        return;
                      }

                      setIsSubmitting(true);
                      setSubmitError(null);

                      try {
                        const result = await createTemporaryMonthlyBooking(
                          {
                            teacherId,
                            month: selectedMonthOption.monthKey,
                            recurringSlotIds: selectedRuleIds,
                            weeklyFrequency: targetFrequency,
                          },
                          user.uid
                        );

                        if (result.success) {
                          setBookingResult(result);
                        } else {
                          setSubmitError(result.message);
                        }
                      } catch (err: any) {
                        setSubmitError(
                          err?.message || 'Ocurrió un error inesperado al procesar la reserva.'
                        );
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl font-extrabold text-xs text-white bg-[#00537A] hover:bg-[#003d5b] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Procesando reserva...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirmar reserva por 24 horas</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
