import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  browserPopupRedirectResolver,
  type Auth,
  type AuthProvider,
  type OAuthCredential,
  type PopupRedirectResolver,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';

const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

// Cache en memoria del accessToken para la sesión activa
let cachedMeetToken: string | null = null;
let tokenExpiresAt = 0;

export interface MeetAuthDependencies {
  authInstance: Pick<Auth, 'currentUser'>;
  linkWithPopupFn: (
    user: User,
    provider: AuthProvider,
    resolver?: PopupRedirectResolver
  ) => Promise<UserCredential>;
  reauthenticateWithPopupFn: (
    user: User,
    provider: AuthProvider,
    resolver?: PopupRedirectResolver
  ) => Promise<UserCredential>;
  credentialFromResultFn: (result: UserCredential) => OAuthCredential | null;
}

function createAuthError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

const POPUP_INTERRUPTION_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/popup-blocked',
]);

function getErrorCode(error: any): string {
  const direct = typeof error?.code === 'string' ? error.code : '';
  if (direct) return direct.toLowerCase();
  const msg = typeof error?.message === 'string' ? error.message : String(error || '');
  const match = msg.match(/auth\/[a-z0-9-]+/i);
  return match ? match[0].toLowerCase() : '';
}

function isPopupInterruptionError(error: any): boolean {
  return POPUP_INTERRUPTION_CODES.has(getErrorCode(error));
}

function normalizePopupInterruptionError(error: any): Error & { code: string } {
  const code = getErrorCode(error);
  switch (code) {
    case 'auth/popup-closed-by-user':
      return createAuthError(
        'auth/popup-closed-by-user',
        'Se cerró la ventana emergente de Google antes de completar la autorización de Google Meet.'
      );
    case 'auth/cancelled-popup-request':
      return createAuthError(
        'auth/cancelled-popup-request',
        'Se canceló la ventana emergente porque ya había una autorización de Google Meet en curso.'
      );
    case 'auth/popup-blocked':
      return createAuthError(
        'auth/popup-blocked',
        'El navegador bloqueó la ventana emergente de Google. Permití las ventanas emergentes para este sitio e intentá nuevamente.'
      );
    default:
      return error;
  }
}

/**
 * Limpia la caché en memoria del token de Google Meet
 */
export function resetMeetTokenCache(): void {
  cachedMeetToken = null;
  tokenExpiresAt = 0;
}

/**
 * Obtiene un token de acceso OAuth con los permisos necesarios para Google Meet API,
 * preservando estrictamente la sesión y el UID del usuario actual en Firebase Auth.
 *
 * REGLA DE SEGURIDAD:
 * - Nunca utiliza signInWithPopup() como fallback cuando ya existe una sesión autenticada.
 * - Si la cuenta Google seleccionada pertenece a otro usuario (auth/credential-already-in-use)
 *   o no coincide con la vinculada (auth/user-mismatch), cancela la operación y conserva la sesión original.
 */
export async function getGoogleMeetAccessToken(
  deps?: Partial<MeetAuthDependencies>
): Promise<string> {
  const authInstance = deps?.authInstance ?? auth;
  const linkFn = deps?.linkWithPopupFn ?? linkWithPopup;
  const reauthFn = deps?.reauthenticateWithPopupFn ?? reauthenticateWithPopup;
  const credentialFromResultFn =
    deps?.credentialFromResultFn ?? GoogleAuthProvider.credentialFromResult;

  // Verificar si hay un token válido en memoria (con 2 minutos de margen de expiración)
  if (!deps && cachedMeetToken && Date.now() < tokenExpiresAt - 120000) {
    return cachedMeetToken;
  }

  const provider = new GoogleAuthProvider();
  provider.addScope(MEET_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline',
  });

  const currentUser = authInstance.currentUser;
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para autorizar Google Meet.');
  }

  const originalUid = currentUser.uid;

  try {
    let result: UserCredential;
    const isGoogleLinked = currentUser.providerData.some(
      (p) => p.providerId === GoogleAuthProvider.PROVIDER_ID
    );

    if (isGoogleLinked) {
      // Si el proveedor de Google ya está vinculado, reautenticar sin cambiar de cuenta
      try {
        result = await reauthFn(currentUser, provider, browserPopupRedirectResolver);
      } catch (reauthError: any) {
        if (reauthError?.code === 'auth/no-such-provider') {
          try {
            result = await linkFn(currentUser, provider, browserPopupRedirectResolver);
          } catch (linkError: any) {
            if (linkError?.code === 'auth/credential-already-in-use') {
              resetMeetTokenCache();
              throw createAuthError(
                'auth/credential-already-in-use',
                'La cuenta de Google seleccionada ya está vinculada a otro usuario de MusicKids. Se conservó tu sesión actual sin cambios.'
              );
            }
            throw linkError;
          }
        } else if (reauthError?.code === 'auth/user-mismatch') {
          resetMeetTokenCache();
          throw createAuthError(
            'auth/user-mismatch',
            'La cuenta de Google seleccionada no coincide con la cuenta vinculada a tu sesión actual. Se conservó tu sesión sin cambios.'
          );
        } else {
          throw reauthError;
        }
      }
    } else {
      // Vincular la cuenta de Google al usuario autenticado actual sin cerrar ni reemplazar su sesión
      try {
        result = await linkFn(currentUser, provider, browserPopupRedirectResolver);
      } catch (linkError: any) {
        if (linkError?.code === 'auth/provider-already-linked') {
          try {
            result = await reauthFn(currentUser, provider, browserPopupRedirectResolver);
          } catch (reauthError: any) {
            if (reauthError?.code === 'auth/user-mismatch') {
              resetMeetTokenCache();
              throw createAuthError(
                'auth/user-mismatch',
                'La cuenta de Google seleccionada no coincide con la cuenta vinculada a tu sesión actual. Se conservó tu sesión sin cambios.'
              );
            }
            throw reauthError;
          }
        } else if (linkError?.code === 'auth/credential-already-in-use') {
          // PROHIBIDO usar signInWithPopup: cancelamos para no reemplazar el UID activo
          resetMeetTokenCache();
          throw createAuthError(
            'auth/credential-already-in-use',
            'La cuenta de Google seleccionada ya está vinculada a otro usuario de MusicKids. Se conservó tu sesión actual sin cambios; autorizá con otra cuenta de Google.'
          );
        } else {
          throw linkError;
        }
      }
    }

    // Verificación estricta de integridad de identidad tras la respuesta del popup
    const activeUid = authInstance.currentUser?.uid;
    if (!activeUid || activeUid !== originalUid) {
      resetMeetTokenCache();
      throw createAuthError(
        'auth/session-identity-mismatch',
        'La sesión activa de Firebase Auth cambió durante la autorización de Google Meet. La operación fue cancelada para proteger tu identidad.'
      );
    }

    const credential = credentialFromResultFn(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Meet.');
    }

    if (!deps) {
      cachedMeetToken = accessToken;
      // Los tokens OAuth de Google suelen expirar a los 3600 segundos
      tokenExpiresAt = Date.now() + 3500 * 1000;
    }

    return accessToken;
  } catch (error: any) {
    if (isPopupInterruptionError(error)) {
      const normalized = normalizePopupInterruptionError(error);
      console.warn('Autorización de Google Meet interrumpida por el usuario o el navegador:', normalized.code);
      throw normalized;
    }
    console.error('Error al autorizar Google Meet:', error);
    throw error;
  }
}

export interface GoogleMeetSpaceResult {
  meetUrl: string;
  meetSpaceName: string;
}

/**
 * Crea un espacio de reunión oficial utilizando Google Meet REST API v2
 * POST https://meet.googleapis.com/v2/spaces
 */
export async function createGoogleMeetSpace(): Promise<GoogleMeetSpaceResult> {
  const token = await getGoogleMeetAccessToken();

  try {
    const response = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedMeetToken = null;
        tokenExpiresAt = 0;
      }
      const errorText = await response.text();
      console.error(`Error Google Meet API [${response.status}]:`, errorText);
      throw new Error(`Google Meet API error HTTP ${response.status}`);
    }

    const data = await response.json();

    const meetUrl = data.meetingUri;
    const meetSpaceName = data.name;

    if (!meetUrl) {
      console.error('Respuesta inesperada de Google Meet API:', data);
      throw new Error('La respuesta de Google Meet API no incluyó el enlace de reunión.');
    }

    return {
      meetUrl,
      meetSpaceName: meetSpaceName || '',
    };
  } catch (error: any) {
    if (!isPopupInterruptionError(error)) {
      console.error('Fallo en la creación del espacio de Google Meet:', error);
    }
    throw error;
  }
}
