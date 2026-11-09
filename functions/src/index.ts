/**
 * Cloud Functions v2 - MusicKids Backend
 * Subbloque 6B.3.1: Infraestructura y función de verificación
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';

// Inicializar Firebase Admin SDK si no fue inicializado previamente
if (getApps().length === 0) {
  initializeApp();
}

/**
 * Función Callable mínima de prueba para verificar conectividad y autenticación
 * en Firebase Cloud Functions v2 sin efectos secundarios ni acceso a datos sensibles.
 */
export const healthCheckMusicKids = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    // 1. Verificación estricta de autenticación del llamador
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debe estar autenticado en MusicKids para acceder a este servicio.'
      );
    }

    // 2. Respuesta segura sin datos bancarios ni operaciones de base de datos
    return {
      status: 'ok',
      service: 'MusicKids Cloud Functions v2',
      timestamp: new Date().toISOString(),
      authenticated: true,
      uid: request.auth.uid,
      message: 'Servicio operativo y listo para futuras transacciones de abonos mensuales.',
    };
  }
);
