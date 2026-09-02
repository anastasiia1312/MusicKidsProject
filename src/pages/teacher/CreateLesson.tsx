import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Music,
  ArrowLeft,
  Loader2,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navbar } from '../../components/common/Navbar';
import { getStudents, createLesson } from '../../services/lessonService';
import { createGoogleMeetSpace } from '../../services/meetService';
import { combineDateAndTimeToTimestamp } from '../../utils/dateUtils';
import type { UserProfile } from '../../types/auth';

interface CreateLessonProps {
  onNavigate: (path: string) => void;
}

export const CreateLesson: React.FC<CreateLessonProps> = ({ onNavigate }) => {
  const { userProfile, user } = useAuth();

  const [title, setTitle] = useState('');
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState<number>(60);

  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar lista de alumnos disponibles
  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      try {
        setLoadingStudents(true);
        const studentList = await getStudents();
        if (isMounted) {
          setStudents(studentList);
          if (studentList.length > 0) {
            setStudentId(studentList[0].uid);
          }
        }
      } catch (err: any) {
        console.error('Error al cargar lista de alumnos:', err);
        if (isMounted) {
          setErrorMessage('No pudimos cargar la lista de alumnos. Intentá nuevamente.');
        }
      } finally {
        if (isMounted) {
          setLoadingStudents(false);
        }
      }
    }

    loadStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validaciones
    if (!title.trim()) {
      setErrorMessage('Ingresá el título de la clase.');
      return;
    }

    if (!studentId) {
      setErrorMessage('Seleccioná un alumno.');
      return;
    }

    if (!date) {
      setErrorMessage('Ingresá la fecha de la clase.');
      return;
    }

    if (!time) {
      setErrorMessage('Ingresá la hora de la clase.');
      return;
    }

    if (!duration || duration <= 0) {
      setErrorMessage('Seleccioná la duración de la clase.');
      return;
    }

    if (!user?.uid) {
      setErrorMessage('Tu sesión ha expirado. Por favor, volvé a iniciar sesión.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Crear el espacio oficial de reunión en Google Meet mediante REST API v2
      let meetResult: { meetUrl: string; meetSpaceName: string };
      try {
        meetResult = await createGoogleMeetSpace();
      } catch (meetErr: any) {
        console.error('Error al crear espacio en Google Meet:', meetErr);
        setErrorMessage(
          'No se pudo crear la videollamada de Google Meet. Intentá nuevamente.'
        );
        setIsSubmitting(false);
        return;
      }

      // 2. Crear el documento en Firestore con meetUrl y meetSpaceName
      const timestamp = combineDateAndTimeToTimestamp(date, time);

      await createLesson({
        title: title.trim(),
        teacherId: user.uid,
        studentId,
        date: timestamp,
        duration: Number(duration),
        meetUrl: meetResult.meetUrl,
        meetSpaceName: meetResult.meetSpaceName,
      });

      // Redirigir al dashboard del profesor tras la creación exitosa
      onNavigate('/teacher/dashboard');
    } catch (err: any) {
      console.error('Error al guardar la clase en la base de datos:', err);
      setErrorMessage('Ocurrió un error al registrar la clase. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Elementos ambientales */}
      <div className="absolute top-20 left-20 w-48 h-48 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 right-20 w-64 h-64 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>

      <Navbar onNavigate={onNavigate} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        {/* Botón Volver */}
        <button
          id="btn-back-to-dashboard"
          type="button"
          onClick={() => onNavigate('/teacher/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Panel del Profesor</span>
        </button>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl shadow-indigo-100/40">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <PlusCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Crear nueva clase
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Completá los datos para agendar una clase con uno de tus alumnos.
              </p>
            </div>
          </div>

          {/* Mensaje de Error */}
          {errorMessage && (
            <div
              id="create-lesson-error-alert"
              className="mb-6 p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-3 text-rose-700 text-sm"
            >
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Título de la clase */}
            <div>
              <label
                htmlFor="lesson-title"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
              >
                Título de la clase
              </label>
              <div className="relative">
                <Music className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="lesson-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Ej. Clase de piano, Teoría y solfeo, Guitarra inicial..."
                  disabled={isSubmitting}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm font-medium"
                />
              </div>
            </div>

            {/* Selector de Alumno */}
            <div>
              <label
                htmlFor="lesson-student"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
              >
                Alumno
              </label>
              <div className="relative">
                <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                {loadingStudents ? (
                  <div className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Cargando alumnos registrados...</span>
                  </div>
                ) : students.length === 0 ? (
                  <div className="w-full pl-11 pr-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
                    No hay alumnos registrados actualmente en la plataforma.
                  </div>
                ) : (
                  <select
                    id="lesson-student"
                    value={studentId}
                    onChange={(e) => {
                      setStudentId(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm font-medium appearance-none cursor-pointer"
                  >
                    {students.map((st) => (
                      <option key={st.uid} value={st.uid}>
                        {st.name || 'Alumno sin nombre'} ({st.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Fecha y Hora */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="lesson-date"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Fecha
                </label>
                <div className="relative">
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="lesson-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="lesson-time"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Hora
                </label>
                <div className="relative">
                  <Clock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="lesson-time"
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Duración */}
            <div>
              <label
                htmlFor="lesson-duration"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
              >
                Duración
              </label>
              <select
                id="lesson-duration"
                value={duration}
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-800 text-sm font-medium cursor-pointer"
              >
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos</option>
                <option value={90}>90 minutos</option>
              </select>
            </div>

            {/* Botones de acción */}
            <div className="pt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onNavigate('/teacher/dashboard')}
                disabled={isSubmitting}
                className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                id="btn-submit-create-lesson"
                type="submit"
                disabled={isSubmitting || loadingStudents || students.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-md shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creando clase y videollamada...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Crear clase</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      <footer className="h-12 w-full bg-white border-t border-slate-100 flex items-center justify-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 shrink-0">
        © 2024 MusicKids Academy
      </footer>
    </div>
  );
};
