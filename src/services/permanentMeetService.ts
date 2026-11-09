import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { createGoogleMeetSpace, type GoogleMeetSpaceResult } from './meetService';
import type { PermanentMeetSpaceResult } from '../types/permanentMeet';

/**
 * Mapa en memoria para deduplicar operaciones concurrentes hacia Google Meet API.
 *
 * ALCANCE Y LIMITACIÓN DE CONCURRENCIA:
 * Este mapa en memoria protege EXCLUSIVAMENTE contra peticiones simultáneas dentro de la
 * misma instancia/hilo de ejecución JavaScript (misma pestaña del navegador).
 * NO garantiza la unicidad entre múltiples pestañas, diferentes navegadores o múltiples
 * dispositivos del profesor.
 *
 * La garantía de unicidad absoluta entre clientes distribuidos sin ejecutar llamadas
 * externas dentro de transacciones de Firestore requiere necesariamente una autoridad centralizada
 * de backend (por ejemplo, Cloud Functions con un cerrojo distribuido) antes de invocar
 * la API de Google Meet.
 */
const inFlightPromises = new Map<string, Promise<PermanentMeetSpaceResult>>();

/**
 * Valida si una URL de Google Meet tiene un formato estructural válido.
 */
export function isValidMeetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('https://meet.google.com/') && trimmed.length > 24;
}

/**
 * Consulta la sala permanente guardada de un profesor.
 *
 * REGLA DE SEGURIDAD ESTRICTA (Subbloque 4):
 * La sala permanente se consulta EXCLUSIVAMENTE en la subcolección privada:
 * `users/{teacherId}/privateSettings/meetConfig`.
 *
 * NO existe ningún fallback a `users/{teacherId}` para evitar cualquier exposición
 * de la sala permanente en consultas públicas de alumnos (ej. catálogo de profesores).
 *
 * @throws {Error} Si Firestore deniega el acceso a la subcolección privada por falta de permisos.
 */
export async function getTeacherPermanentMeetSpace(
  teacherId: string
): Promise<GoogleMeetSpaceResult | null> {
  if (!teacherId || typeof teacherId !== 'string') return null;

  const trimmedId = teacherId.trim();

  try {
    const privateDocRef = doc(db, 'users', trimmedId, 'privateSettings', 'meetConfig');
    const privateSnap = await getDoc(privateDocRef);

    if (privateSnap.exists()) {
      const data = privateSnap.data();
      const meetUrl = data?.permanentMeetUrl;
      const meetSpaceName = data?.permanentMeetSpaceName;

      if (isValidMeetUrl(meetUrl)) {
        return {
          meetUrl,
          meetSpaceName: typeof meetSpaceName === 'string' ? meetSpaceName : '',
        };
      }
    }

    return null;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('permission-denied') || errMsg.includes('insufficient permissions')) {
      console.error(
        'Permisos insuficientes para leer users/{teacherId}/privateSettings/meetConfig en Firestore.'
      );
      throw new Error(
        'PERMISSIONS_DENIED_PRIVATE_SETTINGS: No se tienen permisos de lectura en la ubicación privada de la sala permanente (users/{teacherId}/privateSettings/meetConfig).'
      );
    }
    console.error('Error al consultar sala permanente privada en Firestore:', err);
    throw err;
  }
}

/**
 * Guarda los datos de la sala permanente del profesor en Firestore.
 *
 * REGLA DE SEGURIDAD ESTRICTA:
 * Se persiste EXCLUSIVAMENTE en `users/{teacherId}/privateSettings/meetConfig`.
 * No se guarda en el documento raíz `users/{teacherId}` bajo ninguna circunstancia.
 * Si la escritura falla por permisos o cualquier otra razón, se lanza un error explícito.
 */
export async function saveTeacherPermanentMeetSpace(
  teacherId: string,
  meetData: GoogleMeetSpaceResult
): Promise<void> {
  if (!teacherId || typeof teacherId !== 'string') {
    throw new Error('ID de profesor no especificado o inválido.');
  }
  if (!isValidMeetUrl(meetData.meetUrl)) {
    throw new Error('La URL de Google Meet no es válida.');
  }

  const trimmedId = teacherId.trim();

  try {
    const privateDocRef = doc(db, 'users', trimmedId, 'privateSettings', 'meetConfig');
    await setDoc(
      privateDocRef,
      {
        teacherId: trimmedId,
        permanentMeetUrl: meetData.meetUrl,
        permanentMeetSpaceName: meetData.meetSpaceName || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('permission-denied') || errMsg.includes('insufficient permissions')) {
      console.error(
        'Permisos insuficientes para escribir en users/{teacherId}/privateSettings/meetConfig.'
      );
      throw new Error(
        'PERMISSIONS_DENIED_PRIVATE_SETTINGS: Las reglas de Firestore no permiten guardar en la subcolección privada users/{teacherId}/privateSettings/meetConfig.'
      );
    }
    console.error('Fallo al persistir la sala permanente en Firestore:', err);
    throw err;
  }
}

/**
 * Obtiene o crea la sala permanente de Google Meet para un profesor.
 *
 * Comportamiento:
 * 1. Consulta si el profesor ya tiene una sala permanente guardada en privateSettings/meetConfig.
 * 2. Si existe y es válida, la reutiliza inmediatamente (0 llamadas a la API de Google Meet).
 * 3. Si no existe, comprueba que el profesor esté autenticado y disponga de autorización OAuth.
 * 4. Crea el espacio mediante Google Meet REST API v2 (`createGoogleMeetSpace`).
 * 5. Persiste meetingUri e identificador en users/{teacherId}/privateSettings/meetConfig.
 * 6. Si la persistencia falla, aborta y lanza un error para evitar continuar con clases no vinculadas.
 *
 * Concurrencia intra-instancia:
 * Protege contra llamadas concurrentes en la misma sesión JavaScript mediante inFlightPromises.
 */
export async function getOrCreateTeacherPermanentMeetSpace(
  teacherId: string
): Promise<PermanentMeetSpaceResult> {
  if (!teacherId || typeof teacherId !== 'string') {
    throw new Error('Identificador de profesor no válido.');
  }

  const trimmedId = teacherId.trim();

  // Deduplicación para llamadas concurrentes en la misma instancia del navegador
  const existingInFlight = inFlightPromises.get(trimmedId);
  if (existingInFlight) {
    return await existingInFlight;
  }

  const taskPromise = (async (): Promise<PermanentMeetSpaceResult> => {
    // 1. Consultar si ya existe una sala permanente guardada en la subcolección privada
    const existing = await getTeacherPermanentMeetSpace(trimmedId);
    if (existing && isValidMeetUrl(existing.meetUrl)) {
      return {
        meetUrl: existing.meetUrl,
        meetSpaceName: existing.meetSpaceName,
        isExisting: true,
      };
    }

    // 2. Comprobar que el usuario actual es el profesor titular autenticado
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Debes iniciar sesión para configurar tu sala de Google Meet.');
    }
    if (currentUser.uid !== trimmedId) {
      throw new Error('Solo el propio profesor puede autorizar y crear su sala de Google Meet.');
    }

    // 3. Crear el espacio oficial mediante Google Meet REST API v2
    const createdSpace = await createGoogleMeetSpace();

    if (!isValidMeetUrl(createdSpace.meetUrl)) {
      throw new Error('La respuesta de Google Meet API no contiene un enlace válido.');
    }

    // 4. Persistir de forma segura y exclusiva en la subcolección privada
    await saveTeacherPermanentMeetSpace(trimmedId, createdSpace);

    return {
      meetUrl: createdSpace.meetUrl,
      meetSpaceName: createdSpace.meetSpaceName,
      isExisting: false,
    };
  })();

  // Registrar en el mapa de promesas activas y garantizar su limpieza
  inFlightPromises.set(trimmedId, taskPromise);

  try {
    return await taskPromise;
  } finally {
    inFlightPromises.delete(trimmedId);
  }
}
