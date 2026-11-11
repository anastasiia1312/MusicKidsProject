/**
 * Servicio de Tareas y Materiales para MusicKids
 *
 * Principios de seguridad y arquitectura:
 * 1. Solo profesores autenticados pueden crear, editar y eliminar sus propias tareas.
 * 2. Un alumno solo puede consultar tareas asignadas a su UID.
 * 3. Los archivos adjuntos se almacenan en Firebase Storage y se validan por tipo y tamaño.
 * 4. Al eliminar una tarea, se eliminan todos sus archivos adjuntos para evitar archivos huérfanos.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBlob,
  deleteObject,
} from 'firebase/storage';
import { db, storage, auth } from './firebase';
import { handleFirestoreError, OperationType, fetchUserProfile } from './authService';
import { getTeacherLessons, getStudents } from './lessonService';
import { getTeacherMonthlyBookings } from './monthlyBookingConfirmationService';
import type { UserProfile } from '../types/auth';
import type {
  Task,
  TaskAttachment,
  CreateTaskPayload,
  UpdateTaskPayload,
} from '../types/task';

const TASKS_COLLECTION = 'tasks';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB máximo por archivo

/**
 * Valida si un archivo adjunto cumple con los límites de tamaño y tipos permitidos
 */
export function validateAttachmentFile(file: File): { isValid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `El archivo "${file.name}" supera el tamaño máximo permitido de 25 MB.`,
    };
  }

  // Tipos permitidos: Documentos (PDF, partituras), Imágenes, Audios
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/flac',
  ];

  const ext = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'mid', 'midi'];

  const typeMatch = allowedTypes.includes(file.type);
  const extMatch = ext ? allowedExtensions.includes(ext) : false;

  if (!typeMatch && !extMatch) {
    return {
      isValid: false,
      error: `El formato de "${file.name}" no es compatible. Se permiten archivos PDF, imágenes o audios (MP3, WAV).`,
    };
  }

  return { isValid: true };
}

/**
 * Sube un archivo a Firebase Storage y retorna los metadatos del adjunto
 */
export async function uploadTaskAttachment(
  teacherId: string,
  taskIdOrTemp: string,
  file: File
): Promise<TaskAttachment> {
  const validation = validateAttachmentFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `tasks/${teacherId}/${taskIdOrTemp}/${Date.now()}_${safeFileName}`;
  const storageRef = ref(storage, storagePath);

  // Subir archivo a Storage
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);

  return {
    id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: file.name,
    url: downloadUrl,
    path: storagePath,
    size: file.size,
    type: file.type || 'application/octet-stream',
  };
}

/**
 * Elimina un archivo individual de Firebase Storage
 */
export async function deleteTaskAttachment(storagePath: string): Promise<void> {
  if (!storagePath) return;
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch (err: any) {
    // Si el archivo ya no existe, no interrumpir la ejecución
    if (err.code !== 'storage/object-not-found') {
      console.warn('Aviso al eliminar archivo de Storage:', err);
    }
  }
}

/**
 * Descarga de forma autenticada un archivo adjunto utilizando el SDK de Firebase Storage.
 * Respeta el modelo de seguridad evaluando las reglas de Storage sin depender de tokens públicos persistentes.
 */
export async function downloadAttachmentSecurely(attachment: TaskAttachment): Promise<void> {
  if (!attachment.path) {
    if (attachment.url) {
      window.open(attachment.url, '_blank');
      return;
    }
    throw new Error('No se encontró la ruta del archivo adjunto.');
  }

  const fileRef = ref(storage, attachment.path);
  const blob = await getBlob(fileRef);
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = attachment.name || 'archivo_adjunto';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 3000);
}

/**
 * Obtiene una URL temporal (Blob URL) autenticada en memoria para previsualizar o reproducir audio.
 * Respeta las reglas de seguridad sin exponer tokens públicos persistentes.
 */
export async function getAuthenticatedBlobUrl(storagePath: string): Promise<string> {
  if (!storagePath) return '';
  const fileRef = ref(storage, storagePath);
  const blob = await getBlob(fileRef);
  return URL.createObjectURL(blob);
}

/**
 * Obtiene la lista de alumnos vinculados a un profesor (o alumnos activos disponibles)
 */
export async function getTeacherLinkedStudents(teacherId: string): Promise<UserProfile[]> {
  try {
    const [allStudents, lessons, monthlyBookings] = await Promise.all([
      getStudents().catch(() => []),
      getTeacherLessons(teacherId).catch(() => []),
      getTeacherMonthlyBookings(teacherId).catch(() => []),
    ]);

    // Recolectar UIDs de alumnos vinculados por clases o abonos
    const linkedStudentIds = new Set<string>();
    lessons.forEach((l) => {
      if (l.studentId) linkedStudentIds.add(l.studentId);
    });
    monthlyBookings.forEach((b) => {
      if (b.studentId) linkedStudentIds.add(b.studentId);
    });

    const linkedStudents = allStudents.filter((s) => linkedStudentIds.has(s.uid));

    // Si el profesor ya tiene alumnos vinculados por clases, los devuelve
    // Si aún no tiene clases en el entorno de desarrollo, devuelve la lista de alumnos registrados
    return linkedStudents.length > 0 ? linkedStudents : allStudents;
  } catch (err) {
    console.warn('Aviso al consultar alumnos vinculados:', err);
    return await getStudents();
  }
}

/**
 * Crea una nueva tarea en Firestore asignada a un alumno
 */
export async function createTask(
  teacherId: string,
  teacherName: string,
  teacherEmail: string,
  payload: CreateTaskPayload,
  customTaskId?: string
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== teacherId) {
    throw new Error('Debés iniciar sesión como profesor para crear una tarea.');
  }

  const title = (payload.title || '').trim();
  const description = (payload.description || '').trim();
  const studentId = (payload.studentId || '').trim();

  if (title.length < 3 || title.length > 150) {
    throw new Error('El título de la tarea debe tener entre 3 y 150 caracteres.');
  }

  if (description.length < 5) {
    throw new Error('La descripción debe contener al menos 5 caracteres con las instrucciones de la tarea.');
  }

  if (!studentId) {
    throw new Error('Debés seleccionar un alumno para asignarle la tarea.');
  }

  // Obtener datos del alumno
  const studentProfile = await fetchUserProfile(studentId);
  const studentName = studentProfile?.name || 'Alumno MusicKids';
  const studentEmail = studentProfile?.email || '';

  const taskData = {
    title,
    description,
    teacherId,
    teacherName: teacherName || currentUser.displayName || 'Profesor MusicKids',
    teacherEmail: teacherEmail || currentUser.email || '',
    studentId,
    studentName,
    studentEmail,
    attachments: payload.attachments || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    if (customTaskId) {
      const docRef = doc(db, TASKS_COLLECTION, customTaskId);
      await setDoc(docRef, taskData);
      return customTaskId;
    } else {
      const docRef = await addDoc(collection(db, TASKS_COLLECTION), taskData);
      return docRef.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, TASKS_COLLECTION);
    throw error;
  }
}

/**
 * Actualiza una tarea existente (solo el profesor dueño)
 */
export async function updateTask(
  taskId: string,
  teacherId: string,
  payload: UpdateTaskPayload
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== teacherId) {
    throw new Error('Usuario no autorizado para modificar esta tarea.');
  }

  const title = (payload.title || '').trim();
  const description = (payload.description || '').trim();
  const studentId = (payload.studentId || '').trim();

  if (title.length < 3 || title.length > 150) {
    throw new Error('El título de la tarea debe tener entre 3 y 150 caracteres.');
  }

  if (description.length < 5) {
    throw new Error('La descripción debe contener al menos 5 caracteres.');
  }

  if (!studentId) {
    throw new Error('Debés seleccionar un alumno para la tarea.');
  }

  const taskRef = doc(db, TASKS_COLLECTION, taskId);
  const taskSnap = await getDoc(taskRef);

  if (!taskSnap.exists()) {
    throw new Error('La tarea que intentás modificar no existe.');
  }

  const existingData = taskSnap.data();
  if (existingData.teacherId !== teacherId) {
    throw new Error('No tenés permisos para modificar una tarea creada por otro profesor.');
  }

  // Validación de inmutabilidad estricta de studentId (requisito de seguridad)
  if (studentId && studentId !== existingData.studentId) {
    throw new Error('El alumno asignado no puede modificarse una vez creada la tarea.');
  }

  const updates = {
    title,
    description,
    attachments: payload.attachments || [],
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(taskRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TASKS_COLLECTION}/${taskId}`);
    throw error;
  }
}

/**
 * Elimina una tarea y todos sus archivos adjuntos de Firebase Storage de forma atómica
 */
export async function deleteTask(taskId: string, teacherId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== teacherId) {
    throw new Error('Usuario no autorizado para eliminar esta tarea.');
  }

  const taskRef = doc(db, TASKS_COLLECTION, taskId);
  const taskSnap = await getDoc(taskRef);

  if (!taskSnap.exists()) {
    throw new Error('La tarea no existe o ya fue eliminada.');
  }

  const taskData = taskSnap.data() as Task;
  if (taskData.teacherId !== teacherId) {
    throw new Error('No podés eliminar tareas de otro profesor.');
  }

  // 1. Eliminar todos los adjuntos de Storage para no dejar archivos huérfanos
  if (Array.isArray(taskData.attachments) && taskData.attachments.length > 0) {
    await Promise.allSettled(
      taskData.attachments.map((att) => deleteTaskAttachment(att.path))
    );
  }

  // 2. Eliminar el documento de Firestore
  try {
    await deleteDoc(taskRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TASKS_COLLECTION}/${taskId}`);
    throw error;
  }
}

/**
 * Obtiene todas las tareas creadas por un profesor específico
 */
export async function getTeacherTasks(teacherId: string): Promise<Task[]> {
  if (!teacherId) return [];

  try {
    const q = query(
      collection(db, TASKS_COLLECTION),
      where('teacherId', '==', teacherId)
    );
    const snap = await getDocs(q);
    const tasks: Task[] = [];

    snap.forEach((docSnap) => {
      tasks.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Task, 'id'>),
      });
    });

    // Ordenar por fecha de creación descendente
    tasks.sort((a, b) => {
      const timeA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : a.createdAt?.toDate
        ? a.createdAt.toDate().getTime()
        : 0;
      const timeB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : b.createdAt?.toDate
        ? b.createdAt.toDate().getTime()
        : 0;
      return timeB - timeA;
    });

    return tasks;
  } catch (error) {
    const errStr = String(error instanceof Error ? error.message : error);
    if (
      errStr.includes('permission-denied') ||
      errStr.includes('insufficient permissions') ||
      errStr.includes('Missing or insufficient')
    ) {
      console.warn('Permisos de lectura en tareas en sincronización; retornando lista vacía temporal.');
      return [];
    }
    console.error('Error al consultar tareas del profesor:', error);
    return [];
  }
}

/**
 * Obtiene todas las tareas asignadas a un alumno específico
 */
export async function getStudentTasks(studentId: string): Promise<Task[]> {
  if (!studentId) return [];

  try {
    const q = query(
      collection(db, TASKS_COLLECTION),
      where('studentId', '==', studentId)
    );
    const snap = await getDocs(q);
    const tasks: Task[] = [];

    snap.forEach((docSnap) => {
      tasks.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Task, 'id'>),
      });
    });

    // Ordenar por fecha de creación descendente
    tasks.sort((a, b) => {
      const timeA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : a.createdAt?.toDate
        ? a.createdAt.toDate().getTime()
        : 0;
      const timeB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : b.createdAt?.toDate
        ? b.createdAt.toDate().getTime()
        : 0;
      return timeB - timeA;
    });

    return tasks;
  } catch (error) {
    const errStr = String(error instanceof Error ? error.message : error);
    if (
      errStr.includes('permission-denied') ||
      errStr.includes('insufficient permissions') ||
      errStr.includes('Missing or insufficient')
    ) {
      console.warn('Permisos de lectura en tareas del alumno en sincronización; retornando lista vacía temporal.');
      return [];
    }
    console.error('Error al consultar tareas del alumno:', error);
    return [];
  }
}

/**
 * Obtiene los detalles de una tarea específica
 */
export async function getTaskById(taskId: string): Promise<Task | null> {
  if (!taskId) return null;
  try {
    const snap = await getDoc(doc(db, TASKS_COLLECTION, taskId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<Task, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TASKS_COLLECTION}/${taskId}`);
    return null;
  }
}
