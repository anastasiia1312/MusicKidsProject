/**
 * Servicio temporal y aislado para la verificación de Cloud Functions v2.
 * SUBBLOQUE 6B.3.2: Verificación de healthCheckMusicKids.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface HealthCheckResponse {
  status: string;
  service: string;
  timestamp: string;
  authenticated: boolean;
  uid: string;
  message: string;
}

export interface HealthCheckResult {
  success: boolean;
  data?: HealthCheckResponse;
  error?: string;
  errorCode?: string;
}

/**
 * Invoca la Cloud Function v2 'healthCheckMusicKids' utilizando el SDK oficial
 * de Firebase Functions con la sesión de autenticación activa en el cliente.
 */
export async function invokeHealthCheck(): Promise<HealthCheckResult> {
  try {
    const healthCheckCallable = httpsCallable<void, HealthCheckResponse>(
      functions,
      'healthCheckMusicKids'
    );
    const response = await healthCheckCallable();
    return {
      success: true,
      data: response.data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
      errorCode: err?.code || 'UNKNOWN_ERROR',
    };
  }
}

// Exponer en window para verificación manual no invasiva desde la consola del navegador
// sin alterar la interfaz visual ni agregar botones visibles
if (typeof window !== 'undefined') {
  (window as any).__runHealthCheck = invokeHealthCheck;
}
