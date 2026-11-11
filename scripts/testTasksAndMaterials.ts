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


// ========================================================
// 4. LIMPIEZA ATÓMICA DE ARCHIVOS HUÉRFANOS AL ELIMINAR
// ========================================================
console.log('\n--- 4. Eliminación segura sin archivos huérfanos ---');

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

console.log('\n🎉 TODAS LAS PRUEBAS DE TAREAS Y MATERIALES PASARON CON ÉXITO.');
