import {
  doc,
  setDoc,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './authService';
import type {
  WhiteboardStroke,
  MusicTemplate,
  WhiteboardData,
} from '../components/whiteboard/types';

/**
 * Suscribe un listener en tiempo real al estado de la pizarra de una clase específica.
 * Retorna la función de desuscripción (cleanup) para evitar listeners duplicados.
 */
export function subscribeToWhiteboard(
  lessonId: string,
  onUpdate: (data: WhiteboardData) => void
): () => void {
  const path = `lessons/${lessonId}/whiteboard/state`;
  const docRef = doc(db, 'lessons', lessonId, 'whiteboard', 'state');

  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onUpdate({
          strokes: Array.isArray(data?.strokes) ? data.strokes : [],
          templates: Array.isArray(data?.templates) ? data.templates : [],
        });
      } else {
        // Pizarra vacía si todavía no existe el documento para esta clase
        onUpdate({
          strokes: [],
          templates: [],
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );

  return unsubscribe;
}

/**
 * Guarda un trazo individual completo al terminar de dibujarlo (pointerup).
 * Utiliza arrayUnion para agregarlo de forma atómica y concurrente sin pisar otros trazos.
 */
export async function saveStroke(
  lessonId: string,
  stroke: WhiteboardStroke
): Promise<void> {
  const path = `lessons/${lessonId}/whiteboard/state`;
  const docRef = doc(db, 'lessons', lessonId, 'whiteboard', 'state');

  try {
    await setDoc(
      docRef,
      {
        strokes: arrayUnion(stroke),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Guarda la lista de plantillas musicales actualizadas (agregar, mover, redimensionar o borrar).
 * Mantiene intactos los trazos existentes usando merge: true.
 */
export async function saveTemplates(
  lessonId: string,
  templates: MusicTemplate[]
): Promise<void> {
  const path = `lessons/${lessonId}/whiteboard/state`;
  const docRef = doc(db, 'lessons', lessonId, 'whiteboard', 'state');

  try {
    await setDoc(
      docRef,
      {
        templates,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Limpia por completo la pizarra compartida de la clase (trazos y plantillas).
 */
export async function clearWhiteboard(lessonId: string): Promise<void> {
  const path = `lessons/${lessonId}/whiteboard/state`;
  const docRef = doc(db, 'lessons', lessonId, 'whiteboard', 'state');

  try {
    await setDoc(docRef, {
      strokes: [],
      templates: [],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
