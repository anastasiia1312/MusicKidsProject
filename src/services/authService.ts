import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import type { UserProfile, UserRole, MonthlyPlan } from '../types/auth';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Centraliza la traducción de errores de Firebase Auth a mensajes claros, amigables y en español.
 */
export const getAuthErrorMessage = (error: any): string => {
  if (!error) return 'Ocurrió un error. Intentá nuevamente.';

  // Extraer el código de error directamente o buscarlo en el mensaje
  let code = (error.code || '').toLowerCase();
  const rawMessage = typeof error === 'string' ? error : (error.message || '');

  if (!code && rawMessage) {
    const match = rawMessage.match(/auth\/[a-z0-9-]+/i);
    if (match) {
      code = match[0].toLowerCase();
    }
  }

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'El email o la contraseña son incorrectos.';

    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta registrada con este email. Podés iniciar sesión.';

    case 'auth/invalid-email':
      return 'Ingresá un email válido.';

    case 'auth/weak-password':
      return 'La contraseña es demasiado débil. Utilizá al menos 6 caracteres.';

    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Esperá unos minutos e intentá nuevamente.';

    case 'auth/network-request-failed':
      return 'No se pudo conectar con el servidor. Revisá tu conexión a Internet e intentá nuevamente.';

    case 'auth/popup-closed-by-user':
      return 'Se cerró la ventana de Google antes de completar el inicio de sesión.';

    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes e intentá nuevamente.';

    case 'auth/cancelled-popup-request':
      // Evitar mensaje de error crítico si fue causado por abrir varias ventanas de autenticación
      return '';

    default:
      if (
        rawMessage.toLowerCase().includes('network') ||
        rawMessage.toLowerCase().includes('fetch') ||
        rawMessage.toLowerCase().includes('unavailable')
      ) {
        return 'No se pudo conectar con el servidor. Revisá tu conexión a Internet e intentá nuevamente.';
      }
      return 'Ocurrió un error. Intentá nuevamente.';
  }
};

export const getFriendlyErrorMessage = getAuthErrorMessage;

/**
 * Obtiene el perfil de un usuario desde la colección 'users/{uid}' en Firestore.
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface TeacherProfileUpdateInput {
  birthDate?: string;
  instruments?: string[];
  education?: string;
  bio?: string;
}

export interface StudentProfileUpdateInput {
  birthDate?: string;
  bio?: string;
}

/**
 * Actualiza exclusivamente los campos del perfil del profesor en 'users/{uid}'
 * utilizando updateDoc para preservar todos los demás campos existentes.
 */
export async function updateTeacherProfileService(
  uid: string,
  data: TeacherProfileUpdateInput
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      birthDate: data.birthDate?.trim() ?? '',
      instruments: Array.isArray(data.instruments) ? data.instruments : [],
      education: data.education?.trim() ?? '',
      bio: data.bio?.trim() ?? '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Actualiza exclusivamente los campos del perfil del alumno en 'users/{uid}'
 * utilizando updateDoc para preservar todos los demás campos existentes.
 */
export async function updateStudentProfileService(
  uid: string,
  data: StudentProfileUpdateInput
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      birthDate: data.birthDate?.trim() ?? '',
      bio: data.bio?.trim() ?? '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Actualiza exclusivamente el precio de clase individual del profesor en 'users/{uid}'
 * utilizando updateDoc para preservar todos los demás campos existentes.
 */
export async function updateSingleLessonPriceService(
  uid: string,
  price: number
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      singleLessonPrice: price,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Actualiza exclusivamente la lista de planes mensuales del profesor en 'users/{uid}'
 * utilizando updateDoc para preservar todos los demás campos existentes.
 */
export async function updateMonthlyPlansService(
  uid: string,
  plans: MonthlyPlan[]
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      monthlyPlans: plans,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Registra un nuevo usuario con Email y Contraseña, asigna displayName y crea su documento en Firestore.
 */
export async function registerWithEmailService(
  name: string,
  email: string,
  pass: string,
  role: UserRole
): Promise<{ user: User; profile: UserProfile }> {
  // 1. Crear el usuario en Firebase Authentication
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = userCredential.user;

  // 2. Actualizar displayName en Firebase Auth
  await updateProfile(user, {
    displayName: name.trim(),
  });

  // 3. Crear el documento en Cloud Firestore: users/{uid}
  const userProfile: UserProfile = {
    uid: user.uid,
    name: name.trim(),
    email: user.email || email.trim(),
    role: role,
    photoURL: user.photoURL || null,
    authProvider: 'email',
    createdAt: serverTimestamp(),
  };

  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, userProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return { user, profile: userProfile };
}

/**
 * Inicia sesión con Email y Contraseña y recupera su perfil de Firestore.
 */
export async function loginWithEmailService(
  email: string,
  pass: string
): Promise<{ user: User; profile: UserProfile | null }> {
  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
  const user = userCredential.user;
  const profile = await fetchUserProfile(user.uid);
  return { user, profile };
}

/**
 * Inicia sesión / Registro con Google mediante Popup.
 * Determina si el usuario ya tiene perfil o si es nuevo y requiere selección de rol.
 */
export async function loginWithGoogleService(): Promise<{
  user: User;
  profile: UserProfile | null;
  isNewUser: boolean;
}> {
  const userCredential = await signInWithPopup(auth, googleProvider);
  const user = userCredential.user;
  const profile = await fetchUserProfile(user.uid);

  return {
    user,
    profile,
    isNewUser: !profile, // Si no existe documento en Firestore, es nuevo usuario
  };
}

/**
 * Completa el registro para un usuario nuevo de Google guardando su rol seleccionado en Firestore.
 */
export async function completeGoogleUserRole(
  user: User,
  role: UserRole
): Promise<UserProfile> {
  // Detectar si el usuario se autenticó originalmente con Google o con email/password
  const isGoogle = user.providerData?.some((p) => p.providerId === 'google.com' || p.providerId === 'google');
  const derivedName =
    user.displayName ||
    (user.email ? user.email.split('@')[0] : 'Usuario MusicKids');

  const userProfile: UserProfile = {
    uid: user.uid,
    name: derivedName,
    email: user.email || '',
    role: role,
    photoURL: user.photoURL || null,
    authProvider: isGoogle ? 'google' : 'email',
    createdAt: serverTimestamp(),
  };

  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, userProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return userProfile;
}

/**
 * Cierra la sesión activa en Firebase.
 */
export async function logoutService(): Promise<void> {
  await signOut(auth);
}
