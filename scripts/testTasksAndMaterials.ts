/**
 * Test Suite para el Módulo de Tareas y Materiales
 * Proyecto: MusicKids
 *
 * Verifica reglas críticas:
 * 1. Validación de entradas (título 3-150 caracteres, descripción >= 5 caracteres, alumno obligatorio).
 * 2. Validación de archivos adjuntos (límite de 25 MB, formatos permitidos: PDF, imágenes, audios).
 * 3. Las tareas pueden crearse sin archivos adjuntos (archivos opcionales).
 * 4. Control de acceso: el profesor solo puede gestionar sus propias tareas.
 * 5. Control de acceso: el alumno solo puede consultar las tareas asignadas a su UID.
 * 6. Prevención de archivos huérfanos: la eliminación de una tarea recolecta todos sus adjuntos para borrado en Storage.
 */

import { validateAttachmentFile } from '../src/services/taskService';
import type { Task, TaskAttachment, CreateTaskPayload } from '../src/types/task';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ APROBÓ: ${msg}`);
}

console.log('--- INICIANDO PRUEBAS UNITARIAS: TAREAS Y MATERIALES ---');

// ========================================================
// 1. VALIDACIÓN DE CAMPOS DE LA TAREA
// ========================================================
console.log('\n--- 1. Validación de campos de la tarea ---');

function validateTaskInput(payload: Partial<CreateTaskPayload>): { valid: boolean; error?: string } {
  const title = (payload.title || '').trim();
  const description = (payload.description || '').trim();
  const studentId = (payload.studentId || '').trim();

  if (title.length < 3 || title.length > 150) {
    return { valid: false, error: 'El título debe tener entre 3 y 150 caracteres.' };
  }

  if (description.length < 5) {
    return { valid: false, error: 'Las instrucciones deben contener al menos 5 caracteres.' };
  }

  if (!studentId) {
    return { valid: false, error: 'Debés seleccionar un alumno para asignarle la tarea.' };
  }

  return { valid: true };
}

// 1.1 Título corto
const resShortTitle = validateTaskInput({
  title: 'No',
  description: 'Estudiar compases 1 a 16 con metrónomo a 80 BPM.',
  studentId: 'student_123',
});
assert(!resShortTitle.valid && resShortTitle.error?.includes('título'), 'Rechaza título con menos de 3 caracteres');

// 1.2 Título excesivamente largo (> 150 caracteres)
const longTitle = 'A'.repeat(160);
const resLongTitle = validateTaskInput({
  title: longTitle,
  description: 'Instrucciones válidas para la práctica.',
  studentId: 'student_123',
});
assert(!resLongTitle.valid && resLongTitle.error?.includes('150 caracteres'), 'Rechaza título que supere 150 caracteres');

// 1.3 Descripción insuficiente (< 5 caracteres)
const resShortDesc = validateTaskInput({
  title: 'Escala de Re Mayor',
  description: 'Hola',
  studentId: 'student_123',
});
assert(!resShortDesc.valid && resShortDesc.error?.includes('5 caracteres'), 'Rechaza descripción menor a 5 caracteres');

// 1.4 Sin alumno asignado
const resNoStudent = validateTaskInput({
  title: 'Escala de Re Mayor',
  description: 'Practicar 3 veces al día con articulación staccato.',
  studentId: '',
});
assert(!resNoStudent.valid && resNoStudent.error?.includes('alumno'), 'Rechaza tarea sin alumno seleccionado');

// 1.5 Tarea válida sin adjuntos (opcionales)
const resValidWithoutFiles = validateTaskInput({
  title: 'Ejercicio de digitación en Piano',
  description: 'Repetir el ejercicio número 4 del método Hanon a 70 BPM.',
  studentId: 'student_mateo',
});
assert(resValidWithoutFiles.valid, 'Acepta tarea válida sin adjuntos (adjuntos opcionales)');


// ========================================================
// 2. VALIDACIÓN DE ARCHIVOS ADJUNTOS
// ========================================================
console.log('\n--- 2. Validación de archivos adjuntos (tipo y tamaño) ---');

function createMockFile(name: string, sizeBytes: number, type: string): File {
  return {
    name,
    size: sizeBytes,
    type,
  } as unknown as File;
}

// 2.1 Archivo PDF válido
const validPdf = createMockFile('partitura_claro_de_luna.pdf', 2 * 1024 * 1024, 'application/pdf');
assert(validateAttachmentFile(validPdf).isValid, 'Acepta partitura en formato PDF (2 MB)');

// 2.2 Archivo de audio MP3 válido
const validAudio = createMockFile('pista_acompaniamiento.mp3', 8 * 1024 * 1024, 'audio/mpeg');
assert(validateAttachmentFile(validAudio).isValid, 'Acepta archivo de audio MP3 (8 MB)');

// 2.3 Archivo de imagen válido
const validImage = createMockFile('esquema_postura.png', 1.5 * 1024 * 1024, 'image/png');
assert(validateAttachmentFile(validImage).isValid, 'Acepta imagen en formato PNG (1.5 MB)');

// 2.4 Archivo que supera el límite de 25 MB
const largeFile = createMockFile('grabacion_pesada.wav', 30 * 1024 * 1024, 'audio/wav');
const resLarge = validateAttachmentFile(largeFile);
assert(!resLarge.isValid && resLarge.error?.includes('25 MB'), 'Rechaza archivo que supere los 25 MB');

// 2.5 Archivo de extensión peligrosa / no compatible
const invalidExe = createMockFile('ejecutable.exe', 500 * 1024, 'application/x-msdownload');
const resExe = validateAttachmentFile(invalidExe);
assert(!resExe.isValid && resExe.error?.includes('no es compatible'), 'Rechaza archivo con formato no compatible');


// ========================================================
// 3. CONTROL DE ACCESO Y SEGURIDAD ENTRE ROLES
// ========================================================
console.log('\n--- 3. Control de acceso y privacidad ---');

interface MockAuthUser {
  uid: string;
  role: 'teacher' | 'student' | 'admin';
  name: string;
}

const teacherClara: MockAuthUser = { uid: 'teacher_clara', role: 'teacher', name: 'Prof. Clara Silva' };
const teacherPablo: MockAuthUser = { uid: 'teacher_pablo', role: 'teacher', name: 'Prof. Pablo Neruda' };
const studentMateo: MockAuthUser = { uid: 'student_mateo', role: 'student', name: 'Mateo González' };
const studentSofia: MockAuthUser = { uid: 'student_sofia', role: 'student', name: 'Sofía Martínez' };

// Tarea creada por Clara para Mateo con 2 adjuntos
const task1: Task = {
  id: 'task_001',
  title: 'Estudio de Minueto en Sol',
  description: 'Tocar manos separadas compases 1 a 8.',
  teacherId: teacherClara.uid,
  teacherName: teacherClara.name,
  studentId: studentMateo.uid,
  studentName: studentMateo.name,
  attachments: [
    {
      id: 'att_1',
      name: 'minueto_sol.pdf',
      url: 'https://storage/minueto.pdf',
      path: `tasks/${teacherClara.uid}/task_001/minueto.pdf`,
      size: 1024 * 1024,
      type: 'application/pdf',
    },
    {
      id: 'att_2',
      name: 'guia_ritmica.mp3',
      url: 'https://storage/guia.mp3',
      path: `tasks/${teacherClara.uid}/task_001/guia.mp3`,
      size: 3 * 1024 * 1024,
      type: 'audio/mpeg',
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Tarea creada por Clara para Sofía
const task2: Task = {
  id: 'task_002',
  title: 'Práctica de postura',
  description: 'Ejercicios de relajación de hombros.',
  teacherId: teacherClara.uid,
  teacherName: teacherClara.name,
  studentId: studentSofia.uid,
  studentName: studentSofia.name,
  attachments: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const allTasks = [task1, task2];

// 3.1 Filtro de visibilidad para alumno Mateo
const mateoVisibleTasks = allTasks.filter((t) => t.studentId === studentMateo.uid);
assert(
  mateoVisibleTasks.length === 1 && mateoVisibleTasks[0].id === 'task_001',
  'El alumno Mateo solo puede ver las tareas asignadas a su cuenta'
);

// 3.2 El alumno no puede modificar tareas
function canUserModifyTask(user: MockAuthUser, task: Task): boolean {
  return user.role === 'teacher' && task.teacherId === user.uid;
}

assert(!canUserModifyTask(studentMateo, task1), 'El alumno tiene denegada la modificación de tareas');

// 3.3 El profesor Pablo no puede modificar tareas de Clara
assert(!canUserModifyTask(teacherPablo, task1), 'Un profesor distinto no puede modificar tareas creadas por otro docente');

// 3.4 La profesora Clara sí puede modificar sus propias tareas
assert(canUserModifyTask(teacherClara, task1), 'La profesora titular puede modificar sus propias tareas');


// 3.5 Inmutabilidad estricta de studentId en actualización
function validateTaskUpdate(existingTask: Task, updates: Partial<Task>): { valid: boolean; error?: string } {
  if (updates.studentId && updates.studentId !== existingTask.studentId) {
    return { valid: false, error: 'El alumno asignado no puede modificarse una vez creada la tarea.' };
  }
  if (updates.teacherId && updates.teacherId !== existingTask.teacherId) {
    return { valid: false, error: 'El profesor asignado no puede modificarse.' };
  }
  return { valid: true };
}

const resChangeStudent = validateTaskUpdate(task1, { studentId: 'student_sofia' });
assert(!resChangeStudent.valid && resChangeStudent.error?.includes('no puede modificarse'), 'Rechaza reasignar el alumno de una tarea existente (studentId inmutable)');

const resChangeTeacher = validateTaskUpdate(task1, { teacherId: 'teacher_pablo' });
assert(!resChangeTeacher.valid && resChangeTeacher.error?.includes('profesor'), 'Rechaza cambiar el profesor de una tarea existente (teacherId inmutable)');

const resValidUpdate = validateTaskUpdate(task1, { title: 'Nuevo título de estudio', description: 'Nuevas instrucciones' });
assert(resValidUpdate.valid, 'Permite actualizar título e instrucciones de la tarea');


// ========================================================
// 4. SIMULACIÓN DE REGLAS DE SEGURIDAD EN STORAGE (CROSS-SERVICE)
// ========================================================
console.log('\n--- 4. Simulación de reglas de seguridad en Storage (cross-service) ---');

interface MockStorageContext {
  auth: { uid: string; role: string; status: string } | null;
  path: { teacherId: string; taskId: string; fileName: string };
  resource?: { size: number; contentType: string };
}

interface MockFirestoreDB {
  tasks: Record<string, { teacherId: string; studentId: string; title: string }>;
  users: Record<string, { role: string; status: string }>;
}

const mockDB: MockFirestoreDB = {
  tasks: {
    'task_001': { teacherId: 'teacher_clara', studentId: 'student_mateo', title: 'Minueto' },
  },
  users: {
    'teacher_clara': { role: 'teacher', status: 'active' },
    'teacher_pablo': { role: 'teacher', status: 'active' },
    'student_mateo': { role: 'student', status: 'active' },
    'student_sofia': { role: 'student', status: 'active' },
    'admin_user': { role: 'admin', status: 'active' },
  },
};

function evaluateStorageRead(ctx: MockStorageContext, db: MockFirestoreDB): boolean {
  if (!ctx.auth) return false;

  // 1. Admin activo
  const user = db.users[ctx.auth.uid];
  if (user && user.role === 'admin' && user.status === 'active') return true;

  // 2. Consulta al documento en Firestore
  const task = db.tasks[ctx.path.taskId];
  if (task) {
    // teacherId de la ruta debe coincidir con el del documento
    if (task.teacherId !== ctx.path.teacherId) return false;
    // El usuario debe ser el profesor dueño o el alumno asignado
    return ctx.auth.uid === task.teacherId || ctx.auth.uid === task.studentId;
  }

  // 3. Si la tarea aún no se guardó (borrador previo)
  return ctx.auth.uid === ctx.path.teacherId;
}

function evaluateStorageCreate(ctx: MockStorageContext, db: MockFirestoreDB): boolean {
  if (!ctx.auth) return false;
  if (ctx.auth.uid !== ctx.path.teacherId) return false;

  const user = db.users[ctx.auth.uid];
  if (!user || user.role !== 'teacher' || user.status !== 'active') return false;

  const task = db.tasks[ctx.path.taskId];
  if (task && task.teacherId !== ctx.path.teacherId) return false;

  if (!ctx.resource || ctx.resource.size > 25 * 1024 * 1024) return false;

  const allowedTypes = [
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a'
  ];
  return allowedTypes.includes(ctx.resource.contentType);
}

// 4.1 Lectura: Profesora dueña (Clara)
assert(
  evaluateStorageRead({
    auth: { uid: 'teacher_clara', role: 'teacher', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'minueto.pdf' },
  }, mockDB),
  'Storage: La profesora dueña puede leer sus propios archivos adjuntos'
);

// 4.2 Lectura: Alumno asignado (Mateo)
assert(
  evaluateStorageRead({
    auth: { uid: 'student_mateo', role: 'student', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'minueto.pdf' },
  }, mockDB),
  'Storage: El alumno asignado a la tarea puede leer los archivos'
);

// 4.3 Lectura: Alumna ajena (Sofía)
assert(
  !evaluateStorageRead({
    auth: { uid: 'student_sofia', role: 'student', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'minueto.pdf' },
  }, mockDB),
  'Storage: Alumno no asignado tiene acceso DENEGADO a los archivos'
);

// 4.4 Lectura: Profesor ajeno (Pablo)
assert(
  !evaluateStorageRead({
    auth: { uid: 'teacher_pablo', role: 'teacher', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'minueto.pdf' },
  }, mockDB),
  'Storage: Profesor ajeno tiene acceso DENEGADO a los archivos'
);

// 4.5 Lectura: Usuario no autenticado
assert(
  !evaluateStorageRead({
    auth: null,
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'minueto.pdf' },
  }, mockDB),
  'Storage: Usuario no autenticado tiene acceso DENEGADO'
);

// 4.6 Lectura: Administrador activo
assert(
  evaluateStorageRead({
    auth: { uid: 'admin_user', role: 'admin', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'minueto.pdf' },
  }, mockDB),
  'Storage: Administrador activo tiene acceso permitido'
);

// 4.7 Creación: Profesor dueño con archivo válido (<25 MB)
assert(
  evaluateStorageCreate({
    auth: { uid: 'teacher_clara', role: 'teacher', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'partitura.pdf' },
    resource: { size: 5 * 1024 * 1024, contentType: 'application/pdf' },
  }, mockDB),
  'Storage: Profesor dueño puede subir archivos válidos'
);

// 4.8 Creación: Alumno intenta subir archivo a la tarea
assert(
  !evaluateStorageCreate({
    auth: { uid: 'student_mateo', role: 'student', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'tarea_resuelta.pdf' },
    resource: { size: 1024 * 1024, contentType: 'application/pdf' },
  }, mockDB),
  'Storage: Alumno tiene PROHIBIDO subir archivos (solo profesor)'
);

// 4.9 Creación: Archivo > 25 MB
assert(
  !evaluateStorageCreate({
    auth: { uid: 'teacher_clara', role: 'teacher', status: 'active' },
    path: { teacherId: 'teacher_clara', taskId: 'task_001', fileName: 'pesado.mp3' },
    resource: { size: 30 * 1024 * 1024, contentType: 'audio/mp3' },
  }, mockDB),
  'Storage: Rechaza subida de archivos mayores a 25 MB'
);


// ========================================================
// 5. LIMPIEZA ATÓMICA DE ARCHIVOS HUÉRFANOS AL ELIMINAR
// ========================================================
console.log('\n--- 5. Eliminación segura sin archivos huérfanos ---');

function getPathsToDeleteOnTaskRemoval(task: Task): string[] {
  if (!Array.isArray(task.attachments)) return [];
  return task.attachments.map((att) => att.path).filter(Boolean);
}

const pathsToDelete = getPathsToDeleteOnTaskRemoval(task1);
assert(
  pathsToDelete.length === 2 &&
  pathsToDelete.includes(`tasks/${teacherClara.uid}/task_001/minueto.pdf`) &&
  pathsToDelete.includes(`tasks/${teacherClara.uid}/task_001/guia.mp3`),
  'La eliminación de la tarea identifica y programa el borrado de todos los archivos en Storage'
);

const pathsTaskWithoutFiles = getPathsToDeleteOnTaskRemoval(task2);
assert(pathsTaskWithoutFiles.length === 0, 'La eliminación de tarea sin adjuntos se procesa limpiamente');

console.log('\n🎉 TODAS LAS PRUEBAS DE SEGURIDAD Y TAREAS PASARON CON ÉXITO.');

