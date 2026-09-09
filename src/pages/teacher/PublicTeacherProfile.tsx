import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  Music,
  BookOpen,
  Sparkles,
  AlertCircle,
  Loader2,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import type { MonthlyPlan } from '../../types/auth';

interface PublicTeacherProfileProps {
  teacherId: string;
  onNavigate: (path: string) => void;
}

interface TeacherPublicData {
  name: string;
  photoURL: string | null;
  instruments: string[];
  education: string;
  bio: string;
  singleLessonPrice?: number | null;
  monthlyPlans?: MonthlyPlan[];
}

const INSTRUMENT_LABELS: Record<string, string> = {
  guitar: 'Guitarra',
  ukulele: 'Ukulele',
  solfege: 'Solfeo',
  vocal: 'Vocal',
};

export const PublicTeacherProfile: React.FC<PublicTeacherProfileProps> = ({
  teacherId,
  onNavigate,
}) => {
  const { role } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<TeacherPublicData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTeacherProfile() {
      if (!teacherId || teacherId.trim() === '') {
        setErrorMessage('Identificador de profesor no válido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setTeacher(null);

      try {
        const teacherDocRef = doc(db, 'users', teacherId.trim());
        const docSnap = await getDoc(teacherDocRef);

        if (!isMounted) return;

        if (!docSnap.exists()) {
          setErrorMessage('El profesor solicitado no existe o no se encuentra registrado en MusicKids.');
          setLoading(false);
          return;
        }

        const data = docSnap.data();

        // Validar estrictamente que el rol sea "teacher"
        if (data.role !== 'teacher') {
          setErrorMessage('El perfil solicitado no pertenece a un profesor de MusicKids.');
          setLoading(false);
          return;
        }

        // Extraer exclusivamente los campos públicos permitidos
        const singleLessonPrice =
          typeof data.singleLessonPrice === 'number' &&
          !isNaN(data.singleLessonPrice) &&
          data.singleLessonPrice > 0
            ? data.singleLessonPrice
            : null;

        const monthlyPlans = Array.isArray(data.monthlyPlans) ? data.monthlyPlans : [];

        setTeacher({
          name: data.name || 'Profesor de Música',
          photoURL: data.photoURL || null,
          instruments: Array.isArray(data.instruments) ? data.instruments : [],
          education: data.education || '',
          bio: data.bio || '',
          singleLessonPrice,
          monthlyPlans,
        });
      } catch (err: any) {
        console.error('Error al cargar perfil público del profesor:', err);
        if (isMounted) {
          setErrorMessage('No fue posible cargar el perfil del profesor. Intentá nuevamente más tarde.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTeacherProfile();

    return () => {
      isMounted = false;
    };
  }, [teacherId]);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      onNavigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    }
  };

  return (
    <div id="public-teacher-profile-page" className="min-h-screen bg-[#F0F4F8] text-slate-900 flex flex-col">
      {/* Barra superior de navegación */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              id="btn-back-from-public-profile"
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>

            {/* Logo MusicKids */}
            <div
              className="flex items-center gap-1 cursor-pointer select-none"
              onClick={() => onNavigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
            >
              <span
                className="font-abril text-[20px] sm:text-[22px] text-[#00537A] tracking-normal leading-none"
                style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
              >
                Music
              </span>
              <img
                src="/images/logo-clef.png"
                alt="Clave de Sol"
                className="h-6 sm:h-7 w-auto object-contain -mx-0.5 -mt-0.5 select-none pointer-events-none"
                referrerPolicy="no-referrer"
              />
              <span
                className="font-abril text-[20px] sm:text-[22px] text-[#00537A] tracking-normal leading-none"
                style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
              >
                Kids
              </span>
            </div>
          </div>

          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            Perfil de Profesor
          </span>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Estado de Carga */}
        {loading && (
          <div
            id="public-profile-loading"
            className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs flex flex-col items-center justify-center space-y-4"
          >
            <Loader2 className="w-10 h-10 text-[#00537A] animate-spin" />
            <p className="text-sm sm:text-base font-semibold text-slate-600">
              Cargando perfil del profesor...
            </p>
          </div>
        )}

        {/* Estado de Error o Profesor No Encontrado / No es Teacher */}
        {!loading && errorMessage && (
          <div
            id="public-profile-error"
            className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-rose-200/80 shadow-xs flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              No se pudo mostrar el perfil
            </h2>
            <p className="text-sm text-slate-600 max-w-md">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-[#00537A] hover:bg-[#004160] text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Regresar</span>
            </button>
          </div>
        )}

        {/* Vista del Perfil Público del Profesor (Solo Lectura) */}
        {!loading && !errorMessage && teacher && (
          <div id="teacher-public-card" className="space-y-6 animate-in fade-in duration-200">
            {/* Cabecera del Perfil con Foto y Nombre */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Avatar / Placeholder del Profesor (Carga temporalmente desactivada) */}
                <div className="relative shrink-0">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-[#00537A] text-white flex items-center justify-center font-bold text-4xl sm:text-5xl border-4 border-[#E8F3F8] shadow-sm select-none">
                    {/* TODO: Rehabilitar carga de avatar en una iteración futura. */}
                    {teacher.name ? (
                      teacher.name.charAt(0).toUpperCase()
                    ) : (
                      <GraduationCap className="w-12 h-12 text-white/90" />
                    )}
                  </div>
                </div>

                {/* Nombre y Rol */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F3F8] text-[#00537A] border border-[#00537A]/10">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Profesor de Música</span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    {teacher.name}
                  </h1>

                  {/* Instrumentos que imparte */}
                  <div className="pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Instrumentos y Especialidades
                    </h3>
                    {teacher.instruments && teacher.instruments.length > 0 ? (
                      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                        {teacher.instruments.map((instKey) => {
                          const label = INSTRUMENT_LABELS[instKey] || instKey;
                          return (
                            <span
                              key={instKey}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                            >
                              <Music className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{label}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 italic">
                        No ha especificado instrumentos aún.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Formación y Estudios */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-[#00537A] flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Formación y Estudios
                </h2>
              </div>

              {teacher.education && teacher.education.trim() !== '' ? (
                <p className="text-sm sm:text-base text-slate-700 whitespace-pre-line leading-relaxed">
                  {teacher.education}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  El profesor aún no ha agregado información sobre su formación musical.
                </p>
              )}
            </div>

            {/* Presentación / Biografía */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#FAB816] flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Sobre mí
                </h2>
              </div>

              {teacher.bio && teacher.bio.trim() !== '' ? (
                <p className="text-sm sm:text-base text-slate-700 whitespace-pre-line leading-relaxed">
                  {teacher.bio}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  El profesor aún no ha agregado una presentación personal.
                </p>
              )}
            </div>

            {/* Tarifas */}
            {(() => {
              const hasSinglePrice =
                typeof teacher.singleLessonPrice === 'number' &&
                !isNaN(teacher.singleLessonPrice) &&
                teacher.singleLessonPrice > 0;

              const activeMonthlyPlans = Array.isArray(teacher.monthlyPlans)
                ? teacher.monthlyPlans.filter(
                    (plan) =>
                      plan.active === true &&
                      typeof plan.price === 'number' &&
                      !isNaN(plan.price) &&
                      plan.price > 0
                  )
                : [];

              const hasAnyRates = hasSinglePrice || activeMonthlyPlans.length > 0;

              const formatPrice = (val: number): string => {
                return `$ ${val.toLocaleString('es-AR')}`;
              };

              return (
                <div
                  id="teacher-rates-public-section"
                  className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 mb-6">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Tarifas
                    </h2>
                  </div>

                  {!hasAnyRates ? (
                    <p
                      id="no-rates-message"
                      className="text-sm text-slate-400 italic"
                    >
                      El profesor todavía no configuró sus tarifas.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {/* 1. Clase individual */}
                      {hasSinglePrice && (
                        <div id="public-single-lesson-rate" className="space-y-2">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Clase individual
                          </h3>
                          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="text-base font-bold text-slate-900 block">
                                Clase individual
                              </span>
                              <span className="text-xs text-slate-500">
                                Sesión individual personalizada
                              </span>
                            </div>
                            <div className="text-lg sm:text-xl font-extrabold text-[#00537A]">
                              {formatPrice(teacher.singleLessonPrice!)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. Planes mensuales */}
                      {activeMonthlyPlans.length > 0 && (
                        <div id="public-monthly-plans-rate" className="space-y-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Planes mensuales
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {activeMonthlyPlans.map((plan, idx) => (
                              <div
                                key={idx}
                                className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between space-y-4"
                              >
                                <div className="space-y-1">
                                  <div className="text-base font-bold text-slate-900">
                                    {plan.lessonsPerWeek}{' '}
                                    {plan.lessonsPerWeek === 1
                                      ? 'clase por semana'
                                      : 'clases por semana'}
                                  </div>
                                  <div className="text-xs font-medium text-slate-500">
                                    {plan.lessonsPerMonth} clases al mes
                                  </div>
                                </div>

                                <div className="pt-3 border-t border-slate-200/70">
                                  <div className="text-lg font-extrabold text-[#00537A]">
                                    {formatPrice(plan.price!)}{' '}
                                    <span className="text-xs font-semibold text-slate-500">
                                      / mes
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
};
