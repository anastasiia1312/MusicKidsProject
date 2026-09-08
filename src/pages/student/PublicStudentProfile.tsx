import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

interface PublicStudentProfileProps {
  studentId: string;
  onNavigate: (path: string) => void;
}

interface StudentPublicData {
  name: string;
  bio: string;
  age: number | null;
}

/**
 * Calcula la edad en años a partir de una fecha en formato YYYY-MM-DD.
 * Si birthDate está vacío, no es válido o es fecha futura, retorna null.
 */
function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr || typeof birthDateStr !== 'string') return null;
  const trimmed = birthDateStr.trim();
  if (!trimmed) return null;

  const birthDate = new Date(trimmed);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  // Validar límites razonables (no fechas futuras o irreales)
  if (age < 0 || age > 120) return null;

  return age;
}

export const PublicStudentProfile: React.FC<PublicStudentProfileProps> = ({
  studentId,
  onNavigate,
}) => {
  const { role } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentPublicData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudentProfile() {
      if (!studentId || studentId.trim() === '') {
        setErrorMessage('Identificador de alumno no válido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setStudent(null);

      try {
        const studentDocRef = doc(db, 'users', studentId.trim());
        const docSnap = await getDoc(studentDocRef);

        if (!isMounted) return;

        if (!docSnap.exists()) {
          setErrorMessage('El alumno solicitado no existe o no se encuentra registrado en MusicKids.');
          setLoading(false);
          return;
        }

        const data = docSnap.data();

        // Validar estrictamente que el rol sea "student"
        if (data.role !== 'student') {
          setErrorMessage('El perfil solicitado no pertenece a un alumno de MusicKids.');
          setLoading(false);
          return;
        }

        // Calcular edad a partir de birthDate sin exponer la fecha completa
        const computedAge = calculateAge(data.birthDate);

        // Extraer únicamente los datos públicos permitidos
        setStudent({
          name: data.name || 'Alumno',
          bio: data.bio || '',
          age: computedAge,
        });
      } catch (err: any) {
        console.error('Error al cargar perfil del alumno:', err);
        if (isMounted) {
          setErrorMessage('No fue posible cargar el perfil del alumno. Intentá nuevamente más tarde.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadStudentProfile();

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      onNavigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    }
  };

  return (
    <div id="public-student-profile-page" className="min-h-screen bg-[#F0F4F8] text-slate-900 flex flex-col">
      {/* Barra superior de navegación */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              id="btn-back-from-student-profile"
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
            Perfil de Alumno
          </span>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Estado de Carga */}
        {loading && (
          <div
            id="student-profile-loading"
            className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs flex flex-col items-center justify-center space-y-4"
          >
            <Loader2 className="w-10 h-10 text-[#00537A] animate-spin" />
            <p className="text-sm sm:text-base font-semibold text-slate-600">
              Cargando perfil del alumno...
            </p>
          </div>
        )}

        {/* Estado de Error o Alumno No Encontrado / No es Student */}
        {!loading && errorMessage && (
          <div
            id="student-profile-error"
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

        {/* Vista del Perfil del Alumno (Solo Lectura) */}
        {!loading && !errorMessage && student && (
          <div id="student-public-card" className="space-y-6 animate-in fade-in duration-200">
            {/* Cabecera del Perfil con Placeholder de Avatar y Nombre */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Avatar / Placeholder por defecto */}
                <div className="relative shrink-0">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-[#00537A] text-white flex items-center justify-center font-bold text-4xl sm:text-5xl border-4 border-[#E8F3F8] shadow-sm select-none">
                    {student.name ? (
                      student.name.charAt(0).toUpperCase()
                    ) : (
                      <User className="w-12 h-12 text-white/90" />
                    )}
                  </div>
                </div>

                {/* Nombre, Rol y Edad */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    {student.name}
                  </h1>

                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      Alumno · {student.age !== null ? `${student.age} ${student.age === 1 ? 'año' : 'años'}` : 'Edad no especificada'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sobre mí (Biografía del Alumno) */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#FAB816] flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Sobre mí
                </h2>
              </div>

              {student.bio && student.bio.trim() !== '' ? (
                <p className="text-sm sm:text-base text-slate-700 whitespace-pre-line leading-relaxed">
                  {student.bio}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  El alumno aún no ha agregado una descripción personal.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
