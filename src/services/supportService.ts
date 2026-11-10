/**
 * Servicio de Soporte Técnico para MusicKids (BLOQUE 8)
 *
 * Principios de seguridad y arquitectura:
 * 1. El UID del remitente se obtiene estrictamente de auth.currentUser (nunca se confía en valores del cliente).
 * 2. Un alumno o profesor solo puede ver y consultar sus propios tickets.
 * 3. Los administradores pueden gestionar todos los tickets y modificar sus estados.
 * 4. Los mensajes son inmutables y no se permite edición ni eliminación.
 * 5. Los tickets resueltos permanecen en modo lectura estricto.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { handleFirestoreError, OperationType, fetchUserProfile } from './authService';
import type {
  SupportTicket,
  SupportMessage,
  CreateSupportTicketPayload,
  SupportCategory,
  SupportTicketStatus,
} from '../types/support';

const TICKETS_COLLECTION = 'supportTickets';
const MESSAGES_SUBCOLLECTION = 'messages';

/**
 * Genera un identificador visual determinista y amigable para el ticket
 */
function generateTicketNumber(): string {
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `TK-${randomPart}`;
}

/**
 * Crea una nueva solicitud de soporte técnico en Firestore
 */
export async function createSupportTicket(
  payload: CreateSupportTicketPayload
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Debés iniciar sesión en MusicKids para enviar una solicitud de soporte.');
  }

  // Obtener perfil del usuario para asegurar rol y nombre fiables
  const profile = await fetchUserProfile(currentUser.uid);
  if (!profile) {
    throw new Error('No se pudo verificar el perfil del usuario.');
  }

  if (profile.role !== 'student' && profile.role !== 'teacher') {
    throw new Error('Solo alumnos y profesores pueden crear solicitudes de soporte técnico.');
  }

  const subject = (payload.subject || '').trim();
  const description = (payload.description || '').trim();
  const category = payload.category;

  if (subject.length < 3 || subject.length > 120) {
    throw new Error('El asunto debe tener entre 3 y 120 caracteres.');
  }

  if (description.length < 10 || description.length > 3000) {
    throw new Error('La descripción del problema debe tener entre 10 y 3000 caracteres.');
  }

  const allowedCategories: SupportCategory[] = [
    'access_issues',
    'classes_and_bookings',
    'payments_and_plans',
    'virtual_classroom',
    'musical_tools',
    'other',
  ];

  if (!allowedCategories.includes(category)) {
    throw new Error('La categoría seleccionada no es válida.');
  }

  const ticketData = {
    ticketNumber: generateTicketNumber(),
    userId: currentUser.uid,
    userName: profile.name || currentUser.displayName || 'Usuario MusicKids',
    userEmail: profile.email || currentUser.email || '',
    userRole: profile.role,
    category,
    subject,
    description,
    status: 'pending' as SupportTicketStatus,
    unreadForAdmin: true,
    unreadForUser: false,
    messageCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, TICKETS_COLLECTION), ticketData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, TICKETS_COLLECTION);
    throw error;
  }
}

/**
 * Obtiene todas las solicitudes del usuario autenticado
 */
export async function getUserSupportTickets(userId: string): Promise<SupportTicket[]> {
  if (!userId) return [];

  try {
    const q = query(
      collection(db, TICKETS_COLLECTION),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const tickets: SupportTicket[] = [];

    snap.forEach((docSnap) => {
      tickets.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SupportTicket, 'id'>),
      });
    });

    // Ordenar cronológicamente descendente por última actividad
    tickets.sort((a, b) => {
      const timeA = a.lastActivityAt?.toMillis
        ? a.lastActivityAt.toMillis()
        : a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : 0;
      const timeB = b.lastActivityAt?.toMillis
        ? b.lastActivityAt.toMillis()
        : b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : 0;
      return timeB - timeA;
    });

    return tickets;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, TICKETS_COLLECTION);
    return [];
  }
}

/**
 * Obtiene todas las solicitudes registradas en la plataforma (Exclusivo Administrador)
 */
export async function getAllSupportTickets(): Promise<SupportTicket[]> {
  try {
    const snap = await getDocs(collection(db, TICKETS_COLLECTION));
    const tickets: SupportTicket[] = [];

    snap.forEach((docSnap) => {
      tickets.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SupportTicket, 'id'>),
      });
    });

    tickets.sort((a, b) => {
      const timeA = a.lastActivityAt?.toMillis
        ? a.lastActivityAt.toMillis()
        : a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : 0;
      const timeB = b.lastActivityAt?.toMillis
        ? b.lastActivityAt.toMillis()
        : b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : 0;
      return timeB - timeA;
    });

    return tickets;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, TICKETS_COLLECTION);
    return [];
  }
}

/**
 * Obtiene los detalles de un ticket específico
 */
export async function getSupportTicketById(ticketId: string): Promise<SupportTicket | null> {
  if (!ticketId) return null;
  try {
    const docSnap = await getDoc(doc(db, TICKETS_COLLECTION, ticketId));
    if (!docSnap.exists()) return null;
    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<SupportTicket, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TICKETS_COLLECTION}/${ticketId}`);
    return null;
  }
}

/**
 * Obtiene los mensajes de la conversación de un ticket en orden cronológico
 */
export async function getTicketMessages(ticketId: string): Promise<SupportMessage[]> {
  if (!ticketId) return [];
  try {
    const messagesRef = collection(db, TICKETS_COLLECTION, ticketId, MESSAGES_SUBCOLLECTION);
    const snap = await getDocs(messagesRef);
    const messages: SupportMessage[] = [];

    snap.forEach((docSnap) => {
      messages.push({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SupportMessage, 'id'>),
      });
    });

    // Ordenar ascendente por fecha de creación (los más antiguos primero)
    messages.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeA - timeB;
    });

    return messages;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TICKETS_COLLECTION}/${ticketId}/${MESSAGES_SUBCOLLECTION}`);
    return [];
  }
}

/**
 * Envía un mensaje dentro de una solicitud de soporte existente
 */
export async function sendSupportMessage(
  ticketId: string,
  content: string
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Debés iniciar sesión para enviar un mensaje.');
  }

  const profile = await fetchUserProfile(currentUser.uid);
  if (!profile) {
    throw new Error('No se pudo verificar el perfil del usuario.');
  }

  const trimmedContent = (content || '').trim();
  if (trimmedContent.length < 1 || trimmedContent.length > 3000) {
    throw new Error('El mensaje debe tener entre 1 y 3000 caracteres.');
  }

  // Obtener estado del ticket
  const ticketRef = doc(db, TICKETS_COLLECTION, ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (!ticketSnap.exists()) {
    throw new Error('La solicitud de soporte no existe.');
  }

  const ticketData = ticketSnap.data() as SupportTicket;

  // Regla de seguridad: Si el usuario es alumno o profesor, no puede responder si el ticket ya está resuelto
  if (profile.role !== 'admin' && ticketData.status === 'resolved') {
    throw new Error('Esta solicitud ya fue resuelta. Por favor creá una nueva solicitud si necesitás asistencia adicional.');
  }

  // Regla de seguridad: El usuario debe ser el dueño del ticket o administrador
  if (profile.role !== 'admin' && ticketData.userId !== currentUser.uid) {
    throw new Error('No tenés permiso para interactuar con esta solicitud.');
  }

  const isAdmin = profile.role === 'admin';

  // 1. Crear el mensaje inmutable
  const messageData = {
    ticketId,
    senderId: currentUser.uid,
    senderName: isAdmin ? 'Equipo de Soporte MusicKids' : (profile.name || 'Usuario'),
    senderRole: profile.role,
    content: trimmedContent,
    createdAt: serverTimestamp(),
  };

  const messagesRef = collection(db, TICKETS_COLLECTION, ticketId, MESSAGES_SUBCOLLECTION);
  const newMsgRef = await addDoc(messagesRef, messageData);

  // 2. Actualizar el ticket con fecha de última actividad y banderas de notificación
  const updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    messageCount: increment(1),
  };

  if (isAdmin) {
    updates.unreadForUser = true;
    updates.unreadForAdmin = false;
    // Si estaba pendiente, al responder el admin puede quedar en proceso
    if (ticketData.status === 'pending') {
      updates.status = 'in_progress';
    }
  } else {
    updates.unreadForAdmin = true;
    updates.unreadForUser = false;
  }

  await updateDoc(ticketRef, updates);

  return newMsgRef.id;
}

/**
 * Actualiza el estado de una solicitud (Exclusivo Administrador)
 */
export async function updateTicketStatus(
  ticketId: string,
  status: 'in_progress' | 'resolved'
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario no autenticado.');
  }

  const profile = await fetchUserProfile(currentUser.uid);
  if (profile?.role !== 'admin') {
    throw new Error('Solo los administradores pueden cambiar el estado de las solicitudes.');
  }

  const ticketRef = doc(db, TICKETS_COLLECTION, ticketId);
  const updates: Record<string, any> = {
    status,
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  };

  if (status === 'resolved') {
    updates.resolvedAt = serverTimestamp();
  }

  await updateDoc(ticketRef, updates);
}

/**
 * Marca una solicitud como leída para el usuario o para el administrador
 */
export async function markTicketAsRead(
  ticketId: string,
  forRole: 'user' | 'admin'
): Promise<void> {
  const ticketRef = doc(db, TICKETS_COLLECTION, ticketId);
  try {
    if (forRole === 'user') {
      await updateDoc(ticketRef, { unreadForUser: false });
    } else {
      await updateDoc(ticketRef, { unreadForAdmin: false });
    }
  } catch (err) {
    // Si falla silenciosamente por reglas locales no desplegadas, no interrumpe la UI
    console.warn('Aviso al marcar ticket como leído:', err);
  }
}

/**
 * Suscripción en tiempo real al contador de notificaciones de soporte para Alumno o Profesor
 */
export function subscribeToUserSupportCount(
  userId: string,
  callback: (unreadCount: number) => void
): Unsubscribe {
  if (!userId) {
    callback(0);
    return () => {};
  }

  const q = query(
    collection(db, TICKETS_COLLECTION),
    where('userId', '==', userId)
  );

  return onSnapshot(
    q,
    (snap) => {
      let count = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.unreadForUser === true) {
          count++;
        }
      });
      callback(count);
    },
    (err) => {
      console.warn('Aviso en suscripción a notificaciones de soporte:', err);
      callback(0);
    }
  );
}

/**
 * Suscripción en tiempo real al contador de soporte para Administrador
 */
export function subscribeToAdminSupportCounts(
  callback: (counts: { pending: number; unread: number; total: number }) => void
): Unsubscribe {
  const q = collection(db, TICKETS_COLLECTION);

  return onSnapshot(
    q,
    (snap) => {
      let pending = 0;
      let unread = 0;
      let total = snap.size;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === 'pending') {
          pending++;
        }
        if (data.unreadForAdmin === true) {
          unread++;
        }
      });

      callback({ pending, unread, total });
    },
    (err) => {
      console.warn('Aviso en suscripción de soporte de administrador:', err);
      callback({ pending: 0, unread: 0, total: 0 });
    }
  );
}
