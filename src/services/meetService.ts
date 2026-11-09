import {
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  reauthenticateWithPopup,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import { auth } from './firebase';

const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

// Cache en memoria del accessToken para la sesión activa
let cachedMeetToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Limpia la caché en memoria del token de Google Meet
 */
export function resetMeetTokenCache(): void {
  cachedMeetToken = null;
  tokenExpiresAt = 0;
}

/**
 * Obtiene un token de acceso OAuth con los permisos necesarios para Google Meet API,
 * preservando de forma segura la sesión del usuario actual en Firebase Auth.
 */
export async function getGoogleMeetAccessToken(): Promise<string> {
  // Verificar si hay un token válido en memoria (con 2 minutos de margen de expiración)
  if (cachedMeetToken && Date.now() < tokenExpiresAt - 120000) {
    return cachedMeetToken;
  }

  const provider = new GoogleAuthProvider();
  provider.addScope(MEET_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline',
  });

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para autorizar Google Meet.');
  }

  const originalUid = currentUser.uid;

  try {
    let result;
    const isGoogleLinked = currentUser.providerData.some(
      (p) => p.providerId === GoogleAuthProvider.PROVIDER_ID
    );

    if (isGoogleLinked) {
      // Si el proveedor de Google ya está vinculado, reautenticar para refrescar el token de Meet
      try {
        result = await reauthenticateWithPopup(currentUser, provider, browserPopupRedirectResolver);
      } catch (reauthError: any) {
        console.warn('Reautenticación con Google falló, intentando enlace alternativo:', reauthError);
        result = await linkWithPopup(currentUser, provider, browserPopupRedirectResolver);
      }
    } else {
      // Intentar vincular la cuenta de Google al usuario autenticado actual sin cerrar su sesión
      try {
        result = await linkWithPopup(currentUser, provider, browserPopupRedirectResolver);
      } catch (linkError: any) {
        if (linkError.code === 'auth/provider-already-linked') {
          result = await reauthenticateWithPopup(currentUser, provider, browserPopupRedirectResolver);
        } else if (linkError.code === 'auth/credential-already-in-use') {
          // La credencial de Google ya está registrada en otra cuenta de Firebase
          console.warn('La credencial de Google ya existe en otra cuenta. Obteniendo token con signInWithPopup...');
          result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
        } else {
          throw linkError;
        }
      }
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Meet.');
    }

    if (auth.currentUser && auth.currentUser.uid !== originalUid) {
      console.warn('Aviso: La sesión de Firebase Auth cambió de UID durante la autorización.');
    }

    cachedMeetToken = accessToken;
    // Los tokens OAuth de Google suelen expirar a los 3600 segundos
    tokenExpiresAt = Date.now() + 3500 * 1000;

    return accessToken;
  } catch (error: any) {
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
  try {
    const token = await getGoogleMeetAccessToken();

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
    console.error('Fallo en la creación del espacio de Google Meet:', error);
    throw error;
  }
}
