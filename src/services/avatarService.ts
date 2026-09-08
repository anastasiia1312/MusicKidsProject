import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './authService';

/**
 * Configuración de Cloudinary para Avatares en MusicKids
 * Cloud name: swfbgbbev
 * Upload preset: musickids_avatars (Modo Unsigned)
 * Endpoint exacto: https://api.cloudinary.com/v1_1/swfbgbbev/image/upload
 */
export const CLOUDINARY_CLOUD_NAME = 'swfbgbbev';
export const CLOUDINARY_UPLOAD_PRESET = 'musickids_avatars';
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/**
 * Límite máximo de tamaño de imagen: 5 MB
 */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Tipos MIME de imagen permitidos
 */
export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Valida que el archivo seleccionado cumpla con el formato (JPEG, PNG, WebP)
 * y que no supere el tamaño límite de 5 MB.
 * Si no cumple, NO se realiza ninguna petición a Cloudinary.
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No se seleccionó ningún archivo.' };
  }

  // Comprobar formato MIME y extensión por seguridad
  const isMimeAllowed = ALLOWED_AVATAR_MIME_TYPES.includes(file.type.toLowerCase());
  const fileNameLower = file.name.toLowerCase();
  const hasAllowedExt =
    fileNameLower.endsWith('.jpg') ||
    fileNameLower.endsWith('.jpeg') ||
    fileNameLower.endsWith('.png') ||
    fileNameLower.endsWith('.webp');

  if (!isMimeAllowed && !hasAllowedExt) {
    return {
      valid: false,
      error: 'Formato no permitido. Solo podés subir imágenes en formato JPG, PNG o WebP.',
    };
  }

  // Comprobar tamaño máximo de 5 MB
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `La imagen pesa ${sizeInMB} MB y supera el límite máximo permitido de 5 MB. Por favor, elegí una imagen más liviana.`,
    };
  }

  return { valid: true };
}

/**
 * Sube una imagen de avatar a Cloudinary mediante upload unsigned REST directo
 * Endpoint EXACTO: https://api.cloudinary.com/v1_1/swfbgbbev/image/upload
 * FormData: ÚNICAMENTE "file" y "upload_preset" = "musickids_avatars"
 * 
 * NO se envía api_key, api_secret, signature ni timestamp.
 * NO se establece manualmente Content-Type (el navegador calcula el boundary).
 * NO se envía Authorization header ni autenticación Basic.
 * 
 * Tras obtener secure_url:
 * Actualiza atómicamente users/{uid}.photoURL y updatedAt en Firestore (sin sobrescribir otros campos).
 */
export async function uploadUserAvatarService(uid: string, file: File): Promise<string> {
  console.log('[Avatar Cloudinary] start');
  console.log('[Avatar Cloudinary] uid:', uid);
  console.log('[Avatar Cloudinary] file type:', file.type || 'unknown');
  console.log(`[Avatar Cloudinary] file size: ${file.size} bytes (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

  // 1. Validar autenticación activa y pertenencia
  if (!auth.currentUser) {
    const err = 'Debés iniciar sesión para actualizar tu foto de perfil.';
    console.error('[Avatar Cloudinary] error:', err);
    throw new Error(err);
  }

  if (auth.currentUser.uid !== uid) {
    const err = 'No tenés permisos para modificar el avatar de otro usuario.';
    console.error('[Avatar Cloudinary] error:', err);
    throw new Error(err);
  }

  // 2. Validar formato y tamaño del archivo ANTES de cualquier petición
  const validation = validateAvatarFile(file);
  if (!validation.valid) {
    const err = validation.error || 'Archivo inválido.';
    console.error('[Avatar Cloudinary] error:', err);
    throw new Error(err);
  }

  // 3. Preparar FormData para Cloudinary con ÚNICAMENTE los campos requeridos
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  let secureUrl = '';

  try {
    // 4. Realizar petición POST a Cloudinary sin cabeceras manuales
    // (el navegador genera automáticamente multipart/form-data con boundary)
    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    // 5. Diagnóstico de respuesta
    console.log('[Avatar Cloudinary] status:', response.status);

    const xCldError = response.headers.get('X-Cld-Error') || response.headers.get('x-cld-error');
    if (xCldError) {
      console.log('[Avatar Cloudinary] X-Cld-Error:', xCldError);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('[Avatar Cloudinary] HTTP status:', response.status);
      console.error('[Avatar Cloudinary] X-Cld-Error:', xCldError || 'none');
      console.error('[Avatar Cloudinary] data.error?.message:', data?.error?.message || 'none');

      const detailedMsg = data?.error?.message || xCldError || `Error ${response.status} en Cloudinary`;
      console.error('[Avatar Cloudinary] error:', detailedMsg);
      throw new Error(`No se pudo cargar la imagen en Cloudinary: ${detailedMsg}`);
    }

    // 6. Analizar respuesta de Cloudinary y verificar secure_url
    if (!data || !data.secure_url) {
      const err = 'Cloudinary no devolvió una URL segura válida (secure_url no encontrada).';
      console.error('[Avatar Cloudinary] error:', err);
      throw new Error(err);
    }

    secureUrl = data.secure_url;
    console.log('[Avatar Cloudinary] secure_url:', secureUrl);
  } catch (networkErr: any) {
    console.error('[Avatar Cloudinary] error:', networkErr?.message || networkErr);
    throw networkErr;
  }

  // 7. Actualizar Firestore ÚNICAMENTE en photoURL y updatedAt
  // Garantiza que uid, name, email, role, birthDate, bio, instruments, education, etc. queden intactos
  const firestorePath = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      photoURL: secureUrl,
      updatedAt: serverTimestamp(),
    });
    console.log('[Avatar Cloudinary] Firestore updated');
  } catch (firestoreErr: any) {
    console.error('[Avatar Cloudinary] error al actualizar Firestore:', firestoreErr);
    handleFirestoreError(firestoreErr, OperationType.UPDATE, firestorePath);
    throw firestoreErr;
  }

  // 8. Sincronizar también con Firebase Auth (auth.currentUser.photoURL) de forma segura si la sesión activa coincide
  try {
    if (auth.currentUser && auth.currentUser.uid === uid) {
      await updateProfile(auth.currentUser, {
        photoURL: secureUrl,
      });
    }
  } catch (authProfileErr) {
    console.warn('Advertencia no crítica al sincronizar photoURL en Firebase Auth:', authProfileErr);
  }

  return secureUrl;
}
