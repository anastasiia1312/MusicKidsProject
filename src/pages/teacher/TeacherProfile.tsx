import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  updateTeacherProfileService,
  updateStudentProfileService,
  fetchUserProfile,
} from '../../services/authService';
import type { TeacherInstrument } from '../../types/auth';

interface TeacherProfileProps {
  onNavigate: (path: string) => void;
}

interface InstrumentOption {
  id: TeacherInstrument;
  label: string;
  description: string;
}

const AVAILABLE_INSTRUMENTS: InstrumentOption[] = [
  { id: 'guitar', label: 'Guitarra', description: 'Acústica, eléctrica y clásica' },
  { id: 'ukulele', label: 'Ukulele', description: 'Iniciación y técnicas avanzadas' },
  { id: 'solfege', label: 'Solfeo', description: 'Lectura musical, teoría y ritmo' },
  { id: 'vocal', label: 'Vocal', description: 'Técnica vocal, afinación y canto' },
];

export const TeacherProfile: React.FC<TeacherProfileProps> = ({ onNavigate }) => {
  const { user, userProfile, role, refreshUserProfile } = useAuth();

  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';
  const dashboardPath = isTeacher ? '/teacher/dashboard' : '/student/dashboard';

  // Estados del formulario
  const [birthDate, setBirthDate] = useState<string>('');
  const [instruments, setInstruments] = useState<string[]>([]);
  const [education, setEducation] = useState<string>('');
  const [bio, setBio] = useState<string>('');

  // Estados de control de carga y retroalimentación
  const [loadingInitialData, setLoadingInitialData] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fecha máxima permitida (hoy, para no permitir fechas futuras)
  const maxDate = new Date().toISOString().split('T')[0];

  // 1. Cargar datos existentes del documento users/{uid} en Firestore
  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      if (!user?.uid) {
        setLoadingInitialData(false);
        return;
      }

      try {
        setLoadingInitialData(true);
        // Obtener la versión más reciente del documento en Firestore
        const profile = await fetchUserProfile(user.uid);

        if (isMounted && profile) {
          if (profile.birthDate) {
            setBirthDate(profile.birthDate);
          }
          if (profile.bio) {
            setBio(profile.bio);
          }
          // Si el usuario tiene rol profesor, cargar también los campos de profesor
          if (role === 'teacher') {
            if (Array.isArray(profile.instruments)) {
              setInstruments(profile.instruments);
            }
            if (profile.education) {
              setEducation(profile.education);
            }
          }
        }
      } catch (err) {
        console.error('Error al cargar datos del perfil:', err);
        if (isMounted) {
          setErrorMessage('No pudimos cargar tus datos de perfil. Por favor, intentá nuevamente.');
        }
      } finally {
        if (isMounted) {
          setLoadingInitialData(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.uid, role]);

  // Manejo de la selección múltiple de instrumentos (solo profesor)
  const toggleInstrument = (instrumentId: string) => {
    setInstruments((prev) => {
      if (prev.includes(instrumentId)) {
        return prev.filter((id) => id !== instrumentId);
      } else {
        return [...prev, instrumentId];
      }
    });
    // Limpiar alertas al interactuar
    if (successMessage) setSuccessMessage(null);
    if (errorMessage) setErrorMessage(null);
  };

  // 2. Guardar cambios en users/{uid}
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!user?.uid) {
      setErrorMessage('No se encontró una sesión activa.');
      return;
    }

    // Validación de rol permitido
    if (role !== 'teacher' && role !== 'student') {
      setErrorMessage('No tenés permisos para editar este perfil.');
      return;
    }

    // Validación de fecha de nacimiento
    if (birthDate) {
      const selectedDate = new Date(birthDate);
      const today = new Date();
      if (isNaN(selectedDate.getTime())) {
        setErrorMessage('La fecha de nacimiento no es válida.');
        return;
      }
      if (birthDate > maxDate || selectedDate > today) {
        setErrorMessage('La fecha de nacimiento no puede ser una fecha futura.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isTeacher) {
        // Para el profesor: actualizar birthDate, instruments, education y bio
        await updateTeacherProfileService(user.uid, {
          birthDate: birthDate.trim(),
          instruments,
          education: education.trim(),
          bio: bio.trim(),
        });
      } else {
        // Para el alumno: actualizar ÚNICAMENTE birthDate y bio
        await updateStudentProfileService(user.uid, {
          birthDate: birthDate.trim(),
          bio: bio.trim(),
        });
      }

      // Refrescar el estado global del perfil en AuthContext
      await refreshUserProfile();

      setSuccessMessage('Perfil actualizado correctamente');

      // Desplazar suavemente hacia el mensaje de confirmación
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error al guardar perfil:', err);
      setErrorMessage('Ocurrió un error al guardar los cambios. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id={isTeacher ? 'teacher-profile-page-container' : 'student-profile-page-container'}
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos ambientales decorativos de fondo (idénticos a la identidad MusicKids) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* HEADER DE NAVEGACIÓN */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 transition-all shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-18 sm:h-20 flex items-center justify-between">
          {/* Logo MusicKids */}
          <div
            id="brand-link-dashboard"
            className="flex items-center gap-1 cursor-pointer group select-none"
            onClick={() => onNavigate(dashboardPath)}
            title={isTeacher ? 'Volver al Panel del Profesor' : 'Volver al Panel del Alumno'}
          >
            <span
              className="font-abril text-[24px] sm:text-[28px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Music
            </span>
            <img
              src="/images/logo-clef.png"
              alt="Clave de Sol MusicKids"
              className="h-8 sm:h-9 w-auto object-contain -mx-0.5 -mt-1 select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <span
              className="font-abril text-[24px] sm:text-[28px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Kids
            </span>
          </div>

          {/* Botón Volver al Dashboard */}
          <button
            type="button"
            id="btn-nav-back-to-dashboard"
            onClick={() => onNavigate(dashboardPath)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 hover:text-[#00537A] hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Panel</span>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        {/* Encabezado de la página */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#E8F3F8] text-[#00537A] mb-2">
              {isTeacher ? (
                <>
                  <GraduationCap className="w-3.5 h-3.5 text-[#00537A]" />
                  <span>Panel del Profesor</span>
                </>
              ) : (
                <>
                  <User className="w-3.5 h-3.5 text-[#00537A]" />
                  <span>Panel del Alumno</span>
                </>
              )}
            </div>
            <h1
              id={isTeacher ? 'teacher-profile-title' : 'student-profile-title'}
              className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
            >
              {isTeacher ? 'Perfil del Profesor' : 'Perfil del Alumno'}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {isTeacher
                ? 'Configurá tus datos personales, los instrumentos que enseñás y tu formación.'
                : 'Configurá tu fecha de nacimiento y una breve presentación sobre vos.'}
            </p>
          </div>
        </div>

        {/* Tarjeta con Resumen de Cuenta y Avatar */}
        <div
          id={isTeacher ? 'teacher-account-summary-card' : 'student-account-summary-card'}
          className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            {/* Contenedor del Avatar Circular con Placeholder Visual (Carga temporalmente desactivada) */}
            <div className="relative shrink-0 flex items-center justify-start">
              <div
                id="user-avatar-preview-container"
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-[#00537A] text-white flex items-center justify-center font-black text-2xl shadow-md shadow-[#00537A]/20 border-2 border-white ring-2 ring-slate-100 select-none relative"
              >
                {/* TODO: Rehabilitar carga de avatar en una iteración futura. */}
                {userProfile?.name ? (
                  <span>{userProfile.name.charAt(0).toUpperCase()}</span>
                ) : isTeacher ? (
                  <GraduationCap className="w-8 h-8" />
                ) : (
                  <User className="w-8 h-8" />
                )}
              </div>
            </div>

            {/* Datos del usuario */}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {userProfile?.name || (isTeacher ? 'Profesor' : 'Alumno')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F3F8] text-[#00537A] border border-[#00537A]/10">
              {isTeacher ? (
                <>
                  <GraduationCap className="w-3.5 h-3.5" />
                  Rol: Profesor
                </>
              ) : (
                <>
                  <User className="w-3.5 h-3.5" />
                  Rol: Alumno
                </>
              )}
            </span>
          </div>
        </div>

        {/* Banner de Mensaje de Éxito */}
        {successMessage && (
          <div
            id="profile-success-alert"
            className="mb-6 p-4 sm:p-5 bg-emerald-50 border border-emerald-200/90 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="flex-1 font-semibold">{successMessage}</span>
          </div>
        )}

        {/* Banner de Mensaje de Error */}
        {errorMessage && (
          <div
            id="profile-error-alert"
            className="mb-6 p-4 sm:p-5 bg-rose-50 border border-rose-200/90 rounded-2xl flex items-start gap-3 text-rose-800 text-sm animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* CONTENEDOR DEL FORMULARIO */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm">
          {loadingInitialData ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#00537A]" />
              <p className="text-sm font-semibold text-slate-600">
                Cargando datos del perfil...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 1. FECHA DE NACIMIENTO (Visible para profesor y alumno) */}
              <div>
                <label
                  htmlFor={isTeacher ? 'teacher-birthdate-input' : 'student-birthdate-input'}
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Fecha de nacimiento
                </label>
                <div className="relative max-w-sm">
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id={isTeacher ? 'teacher-birthdate-input' : 'student-birthdate-input'}
                    type="date"
                    max={maxDate}
                    value={birthDate}
                    onChange={(e) => {
                      setBirthDate(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                    disabled={isSubmitting}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-800 text-sm font-medium"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Ingresá tu fecha de nacimiento (no se permiten fechas futuras).
                </p>
              </div>

              {/* CAMPOS ESPECÍFICOS DEL PROFESOR (NO se muestran al alumno) */}
              {isTeacher && (
                <>
                  <div className="border-t border-slate-100 my-6" />

                  {/* 2. INSTRUMENTOS QUE ENSEÑA (Selección múltiple - Solo Profesor) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Instrumentos que enseña
                      </label>
                      <span className="text-xs font-semibold text-[#00537A]">
                        {instruments.length}{' '}
                        {instruments.length === 1 ? 'seleccionado' : 'seleccionados'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Seleccioná uno o más instrumentos de tu especialidad pedagógica:
                    </p>

                    <div
                      id="teacher-instruments-selection-grid"
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    >
                      {AVAILABLE_INSTRUMENTS.map((inst) => {
                        const isSelected = instruments.includes(inst.id);
                        return (
                          <div
                            key={inst.id}
                            id={`instrument-option-${inst.id}`}
                            onClick={() => toggleInstrument(inst.id)}
                            className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'bg-[#E8F3F8] border-[#00537A] text-[#00537A] shadow-xs ring-1 ring-[#00537A]/30'
                                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70 text-slate-700'
                            }`}
                          >
                            {/* Checkbox visual accesible */}
                            <div className="pt-0.5 shrink-0">
                              <input
                                type="checkbox"
                                id={`instrument-checkbox-${inst.id}`}
                                checked={isSelected}
                                onChange={() => {}} // El click en el contenedor padre maneja el estado
                                className="sr-only"
                              />
                              <div
                                className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                                  isSelected
                                    ? 'bg-[#00537A] border-[#00537A] text-white'
                                    : 'bg-white border-slate-300'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>

                            {/* Etiquetas */}
                            <div className="min-w-0">
                              <span className="text-sm font-bold block leading-tight">
                                {inst.label}
                              </span>
                              <span
                                className={`text-xs block mt-0.5 ${
                                  isSelected ? 'text-[#00537A]/80' : 'text-slate-500'
                                }`}
                              >
                                {inst.description}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 my-6" />

                  {/* 3. FORMACIÓN / EDUCACIÓN (Solo Profesor) */}
                  <div>
                    <label
                      htmlFor="teacher-education-input"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                    >
                      Formación / Educación
                    </label>
                    <textarea
                      id="teacher-education-input"
                      rows={3}
                      value={education}
                      onChange={(e) => {
                        setEducation(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                        if (successMessage) setSuccessMessage(null);
                      }}
                      disabled={isSubmitting}
                      placeholder="Ej. Conservatorio Superior de Música, Licenciatura en Composición, Profesorado de Piano..."
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-800 text-sm leading-relaxed"
                    />
                    <p className="text-xs text-slate-500 mt-1.5">
                      Describí brevemente tus títulos, estudios o instituciones musicales donde te capacitaste.
                    </p>
                  </div>
                </>
              )}

              <div className="border-t border-slate-100 my-6" />

              {/* 4. SOBRE MÍ (Visible para profesor y alumno) */}
              <div>
                <label
                  htmlFor={isTeacher ? 'teacher-bio-input' : 'student-bio-input'}
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Sobre mí
                </label>
                <textarea
                  id={isTeacher ? 'teacher-bio-input' : 'student-bio-input'}
                  rows={isTeacher ? 4 : 3}
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                    if (successMessage) setSuccessMessage(null);
                  }}
                  disabled={isSubmitting}
                  placeholder={
                    isTeacher
                      ? 'Contá un poco sobre vos, tu experiencia pedagógica con niños o jóvenes, y tu visión de la enseñanza musical...'
                      : 'Contá un poco sobre vos (ej. Me gusta aprender música y estoy estudiando ukulele)...'
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#00537A] focus:border-transparent outline-none transition-all text-slate-800 text-sm leading-relaxed"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  {isTeacher
                    ? 'Una breve presentación personal para que los alumnos y sus familias te conozcan.'
                    : 'Una breve información sobre vos para tu perfil de alumno.'}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-slate-500 text-center sm:text-left">
                  Los cambios se guardarán en tu perfil de usuario de MusicKids.
                </p>

                {/* BOTÓN GUARDAR CAMBIOS */}
                <button
                  type="submit"
                  id={isTeacher ? 'btn-save-teacher-profile' : 'btn-save-student-profile'}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#00537A] hover:bg-[#004160] active:scale-[0.99] text-white font-bold px-8 py-3.5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Guardando cambios...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Guardar cambios</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* FOOTER SIMPLE DE IDENTIDAD */}
      <footer className="w-full py-6 text-center text-xs text-slate-500 border-t border-slate-200/50 relative z-10">
        <p>© 2026 MusicKids — Plataforma Educativa Musical</p>
      </footer>
    </div>
  );
};

export const ProfilePage = TeacherProfile;
export const StudentProfile = TeacherProfile;
