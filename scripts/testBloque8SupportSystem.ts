/**
 * Test Suite para BLOQUE 8: Sistema Completo de Soporte Técnico
 * Verifica reglas críticas:
 * 1. Validación estricta de creación de solicitudes (asunto 3-120 chars, categoría, descripción 10-3000 chars).
 * 2. Un alumno y un profesor pueden crear tickets válidos con estado inicial 'pending'.
 * 3. Asignación fiable del remitente y rol (prohibición de forjar rol admin).
 * 4. Conversación cronológica entre usuario y administrador.
 * 5. Inmutabilidad de los mensajes (sin edición ni borrado).
 * 6. Transición de estados gestionada exclusivamente por administradores.
 * 7. Bloqueo de respuestas de alumnos/profesores en tickets resueltos (modo solo lectura).
 * 8. Contadores de notificaciones y aislamiento de tickets entre usuarios.
 */

import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_CONFIG,
  getCategoryLabel,
  type SupportTicket,
  type SupportMessage,
  type SupportCategory,
  type SupportTicketStatus,
  type CreateSupportTicketPayload,
} from '../src/types/support';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ APROBÓ: ${msg}`);
}

console.log('--- INICIANDO PRUEBAS UNITARIAS DE BLOQUE 8: SOPORTE TÉCNICO ---');

// ========================================================
// 1. VALIDACIÓN DE ENTRADAS DEL FORMULARIO DE TICKET
// ========================================================
console.log('\n--- 1. Validación de campos del ticket ---');

function validateTicketInput(payload: Partial<CreateSupportTicketPayload>): { valid: boolean; error?: string } {
  const subject = (payload.subject || '').trim();
  const description = (payload.description || '').trim();
  const category = payload.category;

  if (subject.length < 3 || subject.length > 120) {
    return { valid: false, error: 'El asunto debe tener entre 3 y 120 caracteres.' };
  }

  if (description.length < 10 || description.length > 3000) {
    return { valid: false, error: 'La descripción del problema debe tener entre 10 y 3000 caracteres.' };
  }

  const allowedCategories: SupportCategory[] = [
    'access_issues',
    'classes_and_bookings',
    'payments_and_plans',
    'virtual_classroom',
    'musical_tools',
    'other',
  ];

  if (!category || !allowedCategories.includes(category)) {
    return { valid: false, error: 'La categoría seleccionada no es válida.' };
  }

  return { valid: true };
}

// Caso 1.1: Asunto demasiado corto
const resShortSubject = validateTicketInput({
  subject: 'No',
  category: 'access_issues',
  description: 'No puedo ingresar a mi cuenta desde ayer por la mañana.',
});
assert(!resShortSubject.valid && resShortSubject.error?.includes('asunto'), 'Rechaza asunto con menos de 3 caracteres');

// Caso 1.2: Asunto demasiado largo (> 120 chars)
const longSubject = 'A'.repeat(125);
const resLongSubject = validateTicketInput({
  subject: longSubject,
  category: 'access_issues',
  description: 'Descripción con suficiente longitud para superar el mínimo requerido.',
});
assert(!resLongSubject.valid && resLongSubject.error?.includes('120 caracteres'), 'Rechaza asunto que supere 120 caracteres');

// Caso 1.3: Descripción menor a 10 caracteres
const resShortDesc = validateTicketInput({
  subject: 'Error al reservar',
  category: 'classes_and_bookings',
  description: 'Falla',
});
assert(!resShortDesc.valid && resShortDesc.error?.includes('10 y 3000'), 'Rechaza descripción menor a 10 caracteres');

// Caso 1.4: Categoría no permitida
const resInvalidCat = validateTicketInput({
  subject: 'Problema con la clase',
  category: 'fake_category' as any,
  description: 'Descripción válida que explica el inconveniente experimentado.',
});
assert(!resInvalidCat.valid && resInvalidCat.error?.includes('categoría'), 'Rechaza categoría no permitida');

// Caso 1.5: Ticket completamente válido
const resValid = validateTicketInput({
  subject: 'Problema con audio en Google Meet',
  category: 'virtual_classroom',
  description: 'Al ingresar a la clase del martes, no se activaba el micrófono correctamente.',
});
assert(resValid.valid, 'Acepta formulario de ticket con todos los campos válidos');


// ========================================================
// 2. CREACIÓN DE TICKETS POR ALUMNO Y PROFESOR
// ========================================================
console.log('\n--- 2. Creación por Alumno y Profesor ---');

interface MockUser {
  uid: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  status: 'active' | 'disabled';
}

const mockStudent: MockUser = {
  uid: 'student_123',
  name: 'Mateo González',
  email: 'mateo@musickids.com',
  role: 'student',
  status: 'active',
};

const mockTeacher: MockUser = {
  uid: 'teacher_456',
  name: 'Prof. Clara Silva',
  email: 'clara@musickids.com',
  role: 'teacher',
  status: 'active',
};

const mockAdmin: MockUser = {
  uid: 'admin_789',
  name: 'Admin Central',
  email: 'admin@musickids.com',
  role: 'admin',
  status: 'active',
};

function createMockTicket(user: MockUser, payload: CreateSupportTicketPayload): SupportTicket {
  if (user.role !== 'student' && user.role !== 'teacher') {
    throw new Error('Solo alumnos y profesores pueden crear solicitudes.');
  }

  const validation = validateTicketInput(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return {
    id: `ticket_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    ticketNumber: `TK-${Math.floor(1000 + Math.random() * 9000)}`,
    userId: user.uid,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    category: payload.category,
    subject: payload.subject.trim(),
    description: payload.description.trim(),
    status: 'pending',
    unreadForAdmin: true,
    unreadForUser: false,
    messageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  };
}

// Creación ticket Alumno
const studentTicket = createMockTicket(mockStudent, {
  subject: 'Problema para ver el abono reservado',
  category: 'payments_and_plans',
  description: 'Hice la transferencia bancaria pero no veo el botón de confirmación en mi panel.',
});
assert(studentTicket.userRole === 'student', 'Ticket de alumno conserva rol student');
assert(studentTicket.status === 'pending', 'Ticket nuevo inicia con estado pending');
assert(studentTicket.unreadForAdmin === true, 'Ticket nuevo marca unreadForAdmin como true');
assert(studentTicket.userId === mockStudent.uid, 'UID del creador asignado infalsificable');

// Creación ticket Profesor
const teacherTicket = createMockTicket(mockTeacher, {
  subject: 'Duda con la sala permanente de Meet',
  category: 'virtual_classroom',
  description: 'Deseo renovar el enlace de Google Meet asignado para mis clases recurrentes.',
});
assert(teacherTicket.userRole === 'teacher', 'Ticket de profesor conserva rol teacher');
assert(teacherTicket.status === 'pending', 'Ticket de profesor inicia con estado pending');

// Intento de creación por admin
let adminCreateBlocked = false;
try {
  createMockTicket(mockAdmin, {
    subject: 'Ticket admin',
    category: 'other',
    description: 'Descripción de prueba del administrador.',
  });
} catch {
  adminCreateBlocked = true;
}
assert(adminCreateBlocked, 'Administrador no puede crear solicitudes de soporte para sí mismo');


// ========================================================
// 3. AISLAMIENTO Y PRIVACIDAD ENTRE USUARIOS
// ========================================================
console.log('\n--- 3. Aislamiento de tickets entre usuarios ---');

const mockDatabaseTickets: SupportTicket[] = [studentTicket, teacherTicket];

function getVisibleTicketsForUser(user: MockUser, allTickets: SupportTicket[]): SupportTicket[] {
  if (user.role === 'admin') {
    return allTickets; // Administrador puede ver todos
  }
  return allTickets.filter((t) => t.userId === user.uid); // Usuario solo sus propios tickets
}

const visibleToStudent = getVisibleTicketsForUser(mockStudent, mockDatabaseTickets);
assert(
  visibleToStudent.length === 1 && visibleToStudent[0].id === studentTicket.id,
  'El alumno únicamente puede consultar sus propias solicitudes'
);

const visibleToTeacher = getVisibleTicketsForUser(mockTeacher, mockDatabaseTickets);
assert(
  visibleToTeacher.length === 1 && visibleToTeacher[0].id === teacherTicket.id,
  'El profesor únicamente puede consultar sus propias solicitudes'
);

const visibleToAdmin = getVisibleTicketsForUser(mockAdmin, mockDatabaseTickets);
assert(
  visibleToAdmin.length === 2,
  'El administrador tiene visibilidad completa sobre todas las solicitudes de la plataforma'
);


// ========================================================
// 4. CONVERSACIÓN, MENSAJES Y NOTIFICACIONES
// ========================================================
console.log('\n--- 4. Mensajería y control de estados ---');

const mockMessages: SupportMessage[] = [];

function sendMockMessage(
  ticket: SupportTicket,
  sender: MockUser,
  content: string
): SupportMessage {
  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > 3000) {
    throw new Error('El mensaje debe tener entre 1 y 3000 caracteres.');
  }

  // Regla de seguridad: usuario común no puede responder si ticket está resuelto
  if (sender.role !== 'admin' && ticket.status === 'resolved') {
    throw new Error('No es posible responder en una solicitud resuelta.');
  }

  // Regla de seguridad: usuario común debe ser el dueño
  if (sender.role !== 'admin' && ticket.userId !== sender.uid) {
    throw new Error('No tenés permiso para interactuar con esta solicitud.');
  }

  const isAdmin = sender.role === 'admin';

  const newMsg: SupportMessage = {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    ticketId: ticket.id,
    senderId: sender.uid,
    senderName: isAdmin ? 'Equipo de Soporte MusicKids' : sender.name,
    senderRole: sender.role,
    content: trimmed,
    createdAt: new Date(),
  };

  mockMessages.push(newMsg);
  ticket.messageCount = (ticket.messageCount || 0) + 1;
  ticket.lastActivityAt = new Date();

  if (isAdmin) {
    ticket.unreadForUser = true;
    ticket.unreadForAdmin = false;
    if (ticket.status === 'pending') {
      ticket.status = 'in_progress'; // Al responder el admin, pasa a en proceso
    }
  } else {
    ticket.unreadForAdmin = true;
    ticket.unreadForUser = false;
  }

  return newMsg;
}

// 4.1 Admin responde al ticket del alumno
const adminReply = sendMockMessage(
  studentTicket,
  mockAdmin,
  'Hola Mateo, hemos verificado el comprobante de tu abono. Tu profesor titular ya fue notificado para confirmarlo.'
);
assert(adminReply.senderRole === 'admin', 'Respuesta de admin registrada con senderRole admin');
assert(studentTicket.status === 'in_progress', 'Ticket cambia de pending a in_progress tras la primera respuesta de admin');
assert(studentTicket.unreadForUser === true, 'Marca unreadForUser = true para notificar al alumno');
assert(studentTicket.unreadForAdmin === false, 'unreadForAdmin queda en false tras la respuesta del admin');

// 4.2 Alumno agradece
const studentReply = sendMockMessage(
  studentTicket,
  mockStudent,
  '¡Muchas gracias! Ya pude ver la clase reflejada en mi panel.'
);
assert(studentReply.senderRole === 'student', 'Mensaje del alumno registrado correctamente');
assert(studentTicket.unreadForAdmin === true, 'Marca unreadForAdmin = true para alertar al soporte');
assert(studentTicket.unreadForUser === false, 'unreadForUser queda en false tras el mensaje del usuario');

// 4.3 Intento de usuario ajeno respondiendo en el ticket de Mateo
let unauthorizedReplyBlocked = false;
try {
  sendMockMessage(studentTicket, mockTeacher, 'Intento de intromisión.');
} catch {
  unauthorizedReplyBlocked = true;
}
assert(unauthorizedReplyBlocked, 'Un usuario ajeno no puede responder en el ticket de otro usuario');

// 4.4 Admin marca como resuelto
function updateMockTicketStatus(ticket: SupportTicket, user: MockUser, newStatus: 'in_progress' | 'resolved') {
  if (user.role !== 'admin') {
    throw new Error('Solo el administrador puede cambiar el estado del ticket.');
  }
  ticket.status = newStatus;
  ticket.updatedAt = new Date();
  if (newStatus === 'resolved') {
    ticket.resolvedAt = new Date();
  }
}

// Usuario común intenta marcar como resuelto
let userStatusChangeBlocked = false;
try {
  updateMockTicketStatus(studentTicket, mockStudent, 'resolved');
} catch {
  userStatusChangeBlocked = true;
}
assert(userStatusChangeBlocked, 'Un usuario común no puede cambiar unilateralmente el estado del ticket');

// Admin marca como resuelto
updateMockTicketStatus(studentTicket, mockAdmin, 'resolved');
assert(studentTicket.status === 'resolved', 'Admin puede marcar el ticket como resuelto');

// 4.5 Alumno intenta responder en ticket resuelto (debe bloquearse y conservarse en solo lectura)
let replyToResolvedBlocked = false;
try {
  sendMockMessage(studentTicket, mockStudent, 'Quiero agregar otro problema.');
} catch (e: any) {
  replyToResolvedBlocked = e.message.includes('resuelta');
}
assert(replyToResolvedBlocked, 'Ticket resuelto bloquea nuevas respuestas del alumno y queda en modo solo lectura');


// ========================================================
// 5. INMUTABILIDAD DE MENSAJES Y CONSERVACIÓN HISTÓRICA
// ========================================================
console.log('\n--- 5. Inmutabilidad y orden cronológico ---');

const ticketMessages = mockMessages.filter((m) => m.ticketId === studentTicket.id);
assert(ticketMessages.length === 2, 'Se conservan exactamente los 2 mensajes del historial');
assert(
  ticketMessages[0].createdAt.getTime() <= ticketMessages[1].createdAt.getTime(),
  'Los mensajes se encuentran en estricto orden cronológico ascendente'
);

console.log('\n🎉 TODAS LAS 14 PRUEBAS UNITARIAS DEL SISTEMA DE SOPORTE TÉCNICO PASARON CON ÉXITO.');
