import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Search,
  FileText,
  File,
  Image as ImageIcon,
  Music,
  ExternalLink,
  Download,
  AlertCircle,
  Calendar,
  User,
  GraduationCap,
  Sparkles,
  Volume2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StudentLayout } from '../../components/student/StudentLayout';
import { getStudentTasks } from '../../services/taskService';
import type { Task, TaskAttachment } from '../../types/task';

interface StudentTasksPageProps {
  onNavigate: (path: string) => void;
}

export const StudentTasksPage: React.FC<StudentTasksPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const loadTasks = async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStudentTasks(user.uid);
      setTasks(data);
    } catch (err: any) {
      console.error('Error al cargar tareas del alumno:', err);
      setError('No pudimos cargar tus tareas. Por favor reintentá.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [user?.uid]);

  const formatDate = (val: any) => {
    if (!val) return '';
    const dateObj = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(dateObj.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(dateObj);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isAudioFile = (att: TaskAttachment) => {
    const type = (att.type || '').toLowerCase();
    const name = (att.name || '').toLowerCase();
    return type.includes('audio') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg');
  };

  const renderAttachmentIcon = (att: TaskAttachment) => {
    const type = (att.type || '').toLowerCase();
    const name = (att.name || '').toLowerCase();

    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-rose-500 shrink-0" />;
    }
    if (isAudioFile(att)) {
      return <Music className="w-5 h-5 text-purple-500 shrink-0" />;
    }
    if (type.includes('image') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.webp')) {
      return <ImageIcon className="w-5 h-5 text-sky-500 shrink-0" />;
    }
    return <File className="w-5 h-5 text-slate-400 shrink-0" />;
  };

  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return tasks;
    const term = searchTerm.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        (t.teacherName || '').toLowerCase().includes(term) ||
        t.description.toLowerCase().includes(term)
    );
  }, [tasks, searchTerm]);

  return (
    <StudentLayout activeSection="tasks" onNavigate={onNavigate}>
      <div className="space-y-6 pb-12 max-w-5xl mx-auto w-full">
        {/* ENCABEZADO */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F3F8] text-[#00537A] text-xs font-bold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              Mis Tareas y Materiales
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#00537A] tracking-tight">
              Actividades y Partituras
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl">
              Aquí podés leer las instrucciones que te dejaron tus profesores y acceder a tus partituras y audios de práctica.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTasks}
            disabled={loading}
            title="Actualizar tareas"
            className="p-3 rounded-2xl border border-slate-200 text-slate-600 hover:text-[#00537A] hover:bg-slate-50 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00537A]' : ''}`} />
          </button>
        </div>

        {/* BARRA DE BÚSQUEDA */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-100 flex items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, profesor o tema..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
            />
          </div>
          <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'tarea' : 'tareas'}
          </span>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={loadTasks}
              className="text-xs font-bold underline hover:no-underline ml-4 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* SKELETON LOADER */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse space-y-3">
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-2/3" />
                <div className="h-16 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* LISTADO DE TAREAS */}
        {!loading && filteredTasks.length > 0 && (
          <div className="space-y-5">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 hover:shadow-md transition-all space-y-4"
              >
                {/* Encabezado: Profesor y Fecha */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
                      <GraduationCap className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Asignado por:
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800">
                        {task.teacherName}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs text-slate-400 font-medium sm:text-right">
                    {formatDate(task.createdAt)}
                  </span>
                </div>

                {/* Título de la tarea */}
                <h2 className="text-lg sm:text-xl font-extrabold text-[#00537A] tracking-tight">
                  {task.title}
                </h2>

                {/* Instrucciones de la tarea */}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/60 text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1 text-[11px]">
                    Instrucciones de práctica:
                  </span>
                  {task.description}
                </div>

                {/* Materiales y archivos adjuntos */}
                {Array.isArray(task.attachments) && task.attachments.length > 0 && (
                  <div className="pt-2 space-y-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Materiales para descargar o escuchar ({task.attachments.length}):
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {task.attachments.map((att) => {
                        const isAudio = isAudioFile(att);

                        return (
                          <div
                            key={att.id}
                            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3 hover:border-[#00537A]/30 transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {renderAttachmentIcon(att)}
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate" title={att.name}>
                                    {att.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {formatFileSize(att.size)}
                                  </p>
                                </div>
                              </div>

                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-xl bg-[#E8F3F8] text-[#00537A] hover:bg-[#DDF1F8] transition-colors shrink-0"
                                title="Abrir o descargar archivo"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>

                            {/* Reproductor de audio embebido para pistas musicales */}
                            {isAudio && (
                              <div className="pt-1">
                                <audio
                                  controls
                                  src={att.url}
                                  className="w-full h-8"
                                  preload="metadata"
                                >
                                  Tu navegador no soporta el reproductor de audio.
                                </audio>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ESTADO VACÍO */}
        {!loading && filteredTasks.length === 0 && (
          <div className="bg-[#E8F3F8]/40 border border-[#00537A]/20 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#00537A] text-white flex items-center justify-center mx-auto shadow-sm">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-[#00537A]">
              {searchTerm ? 'No se encontraron tareas con esa búsqueda' : '¡Estás al día con tus actividades!'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600">
              {searchTerm
                ? 'Intentá buscar con otras palabras clave o el nombre de tu profesor.'
                : 'Aún no tenés tareas asignadas por tus profesores. Cuando te asignen una partitura o ejercicio, aparecerá aquí.'}
            </p>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};
