import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

// Cache en memoria del accessToken para la sesión activa
let cachedMeetToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtiene un token de acceso OAuth con los permisos necesarios para Google Meet API
 */
export async function getGoogleMeetAccessToken(): Promise<string> {
  // Verificar si hay un token válido en memoria (con 2 minutos de margen)
  if (cachedMeetToken && Date.now() < tokenExpiresAt - 120000) {
    return cachedMeetToken;
  }

  const provider = new GoogleAuthProvider();
  provider.addScope(MEET_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline',
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Meet.');
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
