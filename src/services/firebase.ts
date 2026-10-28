import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Inicialización de la instancia de Firebase (Singleton)
let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Inicialización de Firebase Authentication con persistencia robusta (localStorage -> sessionStorage -> inMemory)
// y el resolver browserPopupRedirectResolver para evitar el fallo auth/argument-error en signInWithPopup
let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  authInstance = getAuth(app);
}

export const auth: Auth = authInstance;
export { browserPopupRedirectResolver };

// Proveedor de Google con selector de cuentas
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Inicialización de Cloud Firestore (soporta databaseId específico si fue configurado)
const configWithDbId = firebaseConfig as typeof firebaseConfig & { firestoreDatabaseId?: string };

export const db: Firestore =
  configWithDbId.firestoreDatabaseId &&
  configWithDbId.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, configWithDbId.firestoreDatabaseId)
    : getFirestore(app);

export default app;
