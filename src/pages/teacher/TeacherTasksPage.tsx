import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  PlusCircle,
  Search,
  Filter,
  FileText,
  File,
  Image as ImageIcon,
  Music,
  Trash2,
  Edit2,
  X,
  Upload,
  ExternalLink,
  Download,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  Play,
  Volume2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';
import {
  getTeacherTasks,
  getTeacherLinkedStudents,
  createTask,
  updateTask,
  deleteTask,
  uploadTaskAttachment,
  deleteTaskAttachment,
} from '../../services/taskService';
import type { Task, TaskAttachment } from '../../types/task';
import type { UserProfile } from '../../types/auth';

interface TeacherTasksPageProps {
  onNavigate: (path: string) => void;
}

export const TeacherTasksPage: React.FC<TeacherTasksPageProps> = ({ onNavigate }) => {
  const { user, userProfile } = useAuth();

  // Estados de datos
  const [tasks, setTasks] = useState<Task[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de filtrado y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState('all');

  // Estados de modal (creación / edición)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDescription, setModalDescription] = useState('');
  const [modalStudentId, setModalStudentId] = useState('');
  const [modalAttachments, setModalAttachments] = useState<TaskAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Estado de subida de archivos
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal de confirmación de eliminación
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Carga inicial de tareas y lista de alumnos vinculados
  const loadData = async () => {
    if (!user?.uid) return;
    setLoadingTasks(true);
    setErrorMessage(null);

    try {
      const [teacherTasks, studentList] = await Promise.all([
        getTeacherTasks(user.uid).catch((err) => {
          console.warn('Aviso al recuperar tareas del profesor:', err);
          return [] as Task[];
        }),
        getTeacherLinkedStudents(user.uid).catch((err) => {
          console.warn('Aviso al recuperar alumnos vinculados:', err);
          return [] as UserProfile[];
        }),
      ]);
      setTasks(teacherTasks);
      setStudents(studentList);
      if (studentList.length > 0 && !modalStudentId) {
        setModalStudentId(studentList[0].uid);
      }
    } catch (err: any) {
      console.error('Error al cargar tareas o alumnos:', err);
      setErrorMessage('No pudimos cargar la información de tareas. Intentá nuevamente.');
    } finally {
      setLoadingTasks(false);
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  // Abrir modal en modo "Nueva tarea"
  const handleOpenCreateModal = () => {
    setEditingTaskId(null);
    setModalTitle('');
    setModalDescription('');
    setModalStudentId(students.length > 0 ? students[0].uid : '');
    setModalAttachments([]);
    setModalError(null);
    setIsModalOpen(true);
  };

  // Abrir modal en modo "Editar tarea"
  const handleOpenEditModal = (task: Task) => {
    setEditingTaskId(task.id);
    setModalTitle(task.title);
    setModalDescription(task.description);
    setModalStudentId(task.studentId);
    setModalAttachments(task.attachments || []);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting || uploadingFiles) return;
    setIsModalOpen(false);
    setEditingTaskId(null);
    setModalTitle('');
    setModalDescription('');
    setModalAttachments([]);
    setModalError(null);
  };

  // Subir archivos al servidor
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user?.uid) return;

    setUploadingFiles(true);
    setModalError(null);

    const tempFolderId = editingTaskId || `temp_${Date.now()}`;
    const newAttachments: TaskAttachment[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploaded = await uploadTaskAttachment(user.uid, tempFolderId, file);
        newAttachments.push(uploaded);
      }
      setModalAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err: any) {
      console.error('Error al subir archivo:', err);
      setModalError(err.message || 'Ocurrió un error al subir el archivo adjunto.');
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Quitar archivo adjunto de la lista
  const handleRemoveAttachment = async (indexToRemove: number) => {
    const target = modalAttachments[indexToRemove];
    if (target?.path) {
      // Eliminar de Storage
      await deleteTaskAttachment(target.path);
    }
    setModalAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Guardar tarea (creación o edición)
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    const trimmedTitle = modalTitle.trim();
    const trimmedDesc = modalDescription.trim();

    if (trimmedTitle.length < 3 || trimmedTitle.length > 150) {
      setModalError('El título debe tener entre 3 y 150 caracteres.');
      return;
    }

    if (trimmedDesc.length < 5) {
      setModalError('Las instrucciones deben contener al menos 5 caracteres.');
      return;
    }

    if (!modalStudentId) {
      setModalError('Debés seleccionar un alumno para asignarle la tarea.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingTaskId) {
        // Actualizar tarea existente
        await updateTask(editingTaskId, user.uid, {
          title: trimmedTitle,
          description: trimmedDesc,
          studentId: modalStudentId,
          attachments: modalAttachments,
        });
        setSuccessMessage('¡Tarea actualizada correctamente!');
      } else {
        // Crear nueva tarea
        await createTask(
          user.uid,
          userProfile?.name || 'Profesor MusicKids',
          user.email || '',
          {
            title: trimmedTitle,
            description: trimmedDesc,
            studentId: modalStudentId,
            attachments: modalAttachments,
          }
        );
        setSuccessMessage('¡Tarea creada y asignada exitosamente!');
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error al guardar tarea:', err);
      setModalError(err.message || 'No se pudo guardar la tarea. Verificá los campos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmar eliminación de tarea
  const handleConfirmDelete = async () => {
    if (!taskToDelete || !user?.uid) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteTask(taskToDelete.id, user.uid);
      setSuccessMessage(`La tarea "${taskToDelete.title}" fue eliminada.`);
      setTaskToDelete(null);
      await loadData();
    } catch (err: any) {
      console.error('Error al eliminar tarea:', err);
      setErrorMessage(err.message || 'Ocurrió un error al eliminar la tarea.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Formato de fecha
  const formatDate = (val: any) => {
    if (!val) return '';
    const dateObj = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(dateObj.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(dateObj);
  };

  // Formato de tamaño de archivo en KB o MB
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Icono según tipo de archivo
  const renderAttachmentIcon = (att: TaskAttachment) => {
    const type = (att.type || '').toLowerCase();
    const name = (att.name || '').toLowerCase();

    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
    }
    if (type.includes('audio') || name.endsWith('.mp3') || name.endsWith('.wav')) {
      return <Music className="w-4 h-4 text-purple-500 shrink-0" />;
    }
    if (type.includes('image') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.webp')) {
      return <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />;
    }
    return <File className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  // Filtrado de tareas
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedStudentFilter !== 'all' && t.studentId !== selectedStudentFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(term);
        const matchesStudent = (t.studentName || '').toLowerCase().includes(term);
        const matchesDesc = t.description.toLowerCase().includes(term);
        return matchesTitle || matchesStudent || matchesDesc;
      }
      return true;
    });
  }, [tasks, selectedStudentFilter, searchTerm]);

  return (
    <TeacherLayout activeSection="tasks" onNavigate={onNavigate}>
      <div className="space-y-6 pb-12 max-w-[1400px] mx-auto w-full">
        {/* ENCABEZADO PRINCIPAL */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F3F8] text-[#00537A] text-xs font-bold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              Gestión Pedagógica
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#00537A] tracking-tight">
              Tareas y Materiales
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl">
              Creá asignaciones personalizadas y compartí partituras en PDF, audios de práctica e instrucciones para tus alumnos.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="flex-1 sm:flex-initial px-5 py-3 rounded-2xl bg-[#00537A] text-white text-xs sm:text-sm font-bold hover:bg-[#003d59] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nueva tarea</span>
            </button>
            <button
              type="button"
              onClick={loadData}
              disabled={loadingTasks}
              title="Actualizar lista"
              className="p-3 rounded-2xl border border-slate-200 text-slate-600 hover:text-[#00537A] hover:bg-slate-50 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loadingTasks ? 'animate-spin text-[#00537A]' : ''}`} />
            </button>
          </div>
        </div>

        {/* MENSAJES DE FEEDBACK */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 text-sm flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-xs font-bold underline hover:no-underline ml-4 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs font-bold underline hover:no-underline ml-4 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* BARRA DE FILTROS Y BÚSQUEDA */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" /> Alumno:
            </span>
            <select
              value={selectedStudentFilter}
              onChange={(e) => setSelectedStudentFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
            >
              <option value="all">Todos los alumnos ({tasks.length})</option>
              {students.map((st) => (
                <option key={st.uid} value={st.uid}>
                  {st.name || st.email}
                </option>
              ))}
            </select>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título o alumno..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
            />
          </div>
        </div>

        {/* LISTA DE TAREAS */}
        {loadingTasks && (
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

        {!loadingTasks && filteredTasks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
              >
                <div className="space-y-3">
                  {/* Encabezado: Alumno asignado y Fecha */}
                  <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100 gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F3F8] text-[#00537A] font-bold">
                      <User className="w-3.5 h-3.5 text-[#00537A]" />
                      {task.studentName}
                    </span>
                    <span className="text-slate-400 font-medium">
                      {formatDate(task.createdAt)}
                    </span>
                  </div>

                  {/* Título de la tarea */}
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#00537A] transition-colors leading-snug">
                    {task.title}
                  </h3>

                  {/* Instrucciones */}
                  <div className="text-xs sm:text-sm text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-4">
                    {task.description}
                  </div>

                  {/* Archivos adjuntos (si existen) */}
                  {Array.isArray(task.attachments) && task.attachments.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Materiales adjuntos ({task.attachments.length}):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {task.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-[#E8F3F8] hover:border-[#00537A]/30 text-xs font-semibold text-slate-700 hover:text-[#00537A] transition-colors group/att"
                            title={`Descargar ${att.name} (${formatFileSize(att.size)})`}
                          >
                            {renderAttachmentIcon(att)}
                            <span className="max-w-[140px] truncate">{att.name}</span>
                            <span className="text-[10px] text-slate-400">({formatFileSize(att.size)})</span>
                            <Download className="w-3 h-3 text-slate-400 group-hover/att:text-[#00537A]" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones del profesor: Editar y Eliminar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(task)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#00537A] bg-[#E8F3F8] hover:bg-[#DDF1F8] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskToDelete(task)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ESTADO VACÍO */}
        {!loadingTasks && filteredTasks.length === 0 && (
          <div className="bg-[#E8F3F8]/40 border border-[#00537A]/20 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#00537A] text-white flex items-center justify-center mx-auto shadow-sm">
              <BookOpen className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#00537A]">
                {searchTerm || selectedStudentFilter !== 'all'
                  ? 'No se encontraron tareas con estos filtros'
                  : 'Aún no creaste tareas para tus alumnos'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                {searchTerm || selectedStudentFilter !== 'all'
                  ? 'Probá borrando el texto de búsqueda o cambiando el filtro de alumno.'
                  : 'Asigná partituras, audios de referencia e instrucciones para acompañar el progreso de cada alumno entre clase y clase.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-5 py-2.5 bg-[#00537A] text-white text-xs font-bold rounded-xl hover:bg-[#003d59] transition-all shadow-2xs inline-flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Crear primera tarea</span>
            </button>
          </div>
        )}
      </div>

      {/* MODAL DE CREACIÓN / EDICIÓN */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-[32px] shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="p-6 sm:p-7 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
              <div className="space-y-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#00537A]">
                  {editingTaskId ? 'Editar Tarea' : 'Nueva Tarea'}
                </span>
                <h2 className="text-xl font-extrabold text-[#00537A]">
                  {editingTaskId ? 'Modificar asignación' : 'Crear asignación para alumno'}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting || uploadingFiles}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario scrolleable */}
            <form onSubmit={handleSaveTask} className="p-6 sm:p-7 overflow-y-auto space-y-5 flex-1">
              {modalError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Selector de alumno */}
              <div>
                <label htmlFor="task-student-select" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Alumno asignado <span className="text-rose-500">*</span>
                </label>
                <select
                  id="task-student-select"
                  value={modalStudentId}
                  onChange={(e) => setModalStudentId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all"
                >
                  {students.map((st) => (
                    <option key={st.uid} value={st.uid}>
                      {st.name} ({st.email})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  El alumno verá esta tarea exclusivamente en su dashboard personal.
                </span>
              </div>

              {/* Título de la tarea */}
              <div>
                <label htmlFor="task-title" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Título de la tarea <span className="text-rose-500">*</span>
                </label>
                <input
                  id="task-title"
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="Ej: Estudio de escalas en Do Mayor y ejercicio rítmico"
                  maxLength={150}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {modalTitle.length}/150 caracteres
                </span>
              </div>

              {/* Descripción / Instrucciones */}
              <div>
                <label htmlFor="task-description" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Instrucciones detalladas <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="task-description"
                  rows={4}
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  placeholder="Escribí aquí las indicaciones para la práctica: compases a estudiar, velocidad del metrónomo o indicaciones técnicas..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Archivos adjuntos (opcionales) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Archivos y materiales adjuntos (opcional)
                  </label>
                  <span className="text-[11px] text-slate-400">PDF, imágenes, audios (máx. 25 MB)</span>
                </div>

                {/* Botón selector de archivos */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,image/*,audio/*,.mid,.midi"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-[#00537A] bg-slate-50/70 hover:bg-[#E8F3F8]/30 rounded-2xl p-5 text-center cursor-pointer transition-colors space-y-1.5"
                >
                  <Upload className="w-5 h-5 text-[#00537A] mx-auto" />
                  <p className="text-xs font-bold text-[#00537A]">
                    {uploadingFiles ? 'Subiendo archivos...' : 'Hacé clic para adjuntar partituras o audios'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Soporta partituras en PDF, audios MP3/WAV o capturas fotográficas
                  </p>
                </div>

                {/* Lista de archivos adjuntos subidos */}
                {modalAttachments.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {modalAttachments.map((att, idx) => (
                      <div
                        key={att.id || idx}
                        className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          {renderAttachmentIcon(att)}
                          <span className="font-semibold text-slate-800 truncate">{att.name}</span>
                          <span className="text-slate-400 text-[10px]">({formatFileSize(att.size)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Quitar archivo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer con botones */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting || uploadingFiles}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || uploadingFiles}
                  className="px-6 py-2.5 rounded-xl bg-[#00537A] text-white text-xs sm:text-sm font-bold hover:bg-[#003d59] transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  <span>{isSubmitting ? 'Guardando...' : editingTaskId ? 'Guardar cambios' : 'Crear tarea'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {taskToDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setTaskToDelete(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900">
                ¿Eliminar esta tarea?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Vas a eliminar la tarea <strong>"{taskToDelete.title}"</strong> y todos los materiales adjuntos asociados. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Eliminando...' : 'Sí, eliminar tarea'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
};
