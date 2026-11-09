import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { handleFirestoreError, OperationType } from './authService';
import type {
  TeacherRecurringSlot,
  CreateRecurringSlotPayload,
  UpdateRecurringSlotPayload,
  RecurringSlotDuration,
} from '../types/recurringSchedule';

const COLLECTION_NAME = 'teacherRecurringSlots';

/**
 * Convierte una hora en formato "HH:mm" a minutos transcurridos desde las 00:00.
 */
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Convierte minutos desde las 00:00 a formato "HH:mm".
 */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Calcula la hora de finalización sumando la duración en minutos a la hora de inicio.
 */
export function calculateEndTime(startTime: string, duration: number): string {
  const startMins = timeToMinutes(startTime);
  const endMins = startMins + duration;
  if (endMins > 24 * 60) {
    throw new Error('El horario finaliza después de la medianoche, lo cual no está permitido.');
  }
  return minutesToTime(endMins);
}

/**
 * Obtiene el día de la semana (0 = Domingo, ..., 6 = Sábado) de una fecha "YYYY-MM-DD"
 * de forma local, evitando errores por desfase de zona horaria UTC.
 */
export function getLocalDateDayOfWeek(dateStr: string): number {
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) {
    throw new Error('Formato de fecha inválido. Se espera YYYY-MM-DD.');
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  // Instanciar usando constructor local año, mes (0-indexado), día
  const localDate = new Date(year, month - 1, day);

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    throw new Error(`La fecha "${dateStr}" no es una fecha de calendario válida.`);
  }

  return localDate.getDay();
}

/**
 * Determina si dos intervalos horarios se solapan.
 * Si uno finaliza justo cuando inicia el otro (startA + durA === startB), NO solapan.
 */
export function hasIntervalOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = aStart + durationA;
  const bStart = timeToMinutes(startB);
  const bEnd = bStart + durationB;

  return aStart < bEnd && aEnd > bStart;
}

/**
 * Valida los datos de entrada para un horario recurrente.
 */
export function validateRecurringSlotData(data: {
  teacherId: string;
  dayOfWeek: number;
  startTime: string;
  duration: RecurringSlotDuration;
  originDate: string;
}): void {
  // 1. Profesor autenticado
  const currentUserId = auth.currentUser?.uid;
  if (!currentUserId) {
    throw new Error('Debes iniciar sesión para realizar esta operación.');
  }
  if (currentUserId !== data.teacherId) {
    throw new Error('No tienes permisos para gestionar horarios de otro profesor.');
  }

  // 2. Formato del profesor
  if (!data.teacherId || typeof data.teacherId !== 'string') {
    throw new Error('El ID de profesor es obligatorio.');
  }

  // 3. Día de la semana (0 a 6)
  if (
    typeof data.dayOfWeek !== 'number' ||
    !Number.isInteger(data.dayOfWeek) ||
    data.dayOfWeek < 0 ||
    data.dayOfWeek > 6
  ) {
    throw new Error('El día de la semana debe ser un número entero entre 0 (Domingo) y 6 (Sábado).');
  }

  // 4. Formato de hora "HH:mm" (24h)
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!data.startTime || !timeRegex.test(data.startTime.trim())) {
    throw new Error('La hora de inicio debe tener el formato HH:mm válido (00:00 - 23:59).');
  }

  // 5. Duraciones permitidas
  const allowedDurations: RecurringSlotDuration[] = [30, 45, 60];
  if (!allowedDurations.includes(data.duration)) {
    throw new Error('La duración debe ser de 30, 45 o 60 minutos.');
  }

  // 6. Hora de fin anterior o igual a las 23:59
  const startMinutes = timeToMinutes(data.startTime);
  if (startMinutes + data.duration > 24 * 60) {
    throw new Error('La clase no puede finalizar después de las 23:59 del mismo día.');
  }

  // 7. Formato y coherencia de originDate
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!data.originDate || !dateRegex.test(data.originDate.trim())) {
    throw new Error('La fecha de origen debe tener el formato YYYY-MM-DD.');
  }

  // 8. Coincidencia entre dayOfWeek y el día real de originDate (evitando UTC shift)
  const calculatedDayOfWeek = getLocalDateDayOfWeek(data.originDate);
  if (calculatedDayOfWeek !== data.dayOfWeek) {
    throw new Error(
      `El día de la semana (${data.dayOfWeek}) no coincide con el día de la fecha de origen ${data.originDate} (día ${calculatedDayOfWeek}).`
    );
  }
}

/**
 * Comprueba si un nuevo horario propuesto se solapa o duplica con algún horario
 * recurrente activo existente del mismo profesor en el mismo día de la semana.
 */
export async function checkRecurringSlotOverlap(
  teacherId: string,
  dayOfWeek: number,
  startTime: string,
  duration: number,
  excludeSlotId?: string
): Promise<{ hasOverlap: boolean; isDuplicate: boolean; conflictingSlot?: TeacherRecurringSlot }> {
  try {
    const existingSlots = await getTeacherRecurringSlots(teacherId, true);

    for (const slot of existingSlots) {
      if (excludeSlotId && slot.id === excludeSlotId) continue;
      if (slot.dayOfWeek !== dayOfWeek) continue;
      if (!slot.isActive) continue;

      // Verificación de duplicado exacto
      if (slot.startTime === startTime && slot.duration === duration) {
        return { hasOverlap: true, isDuplicate: true, conflictingSlot: slot };
      }

      // Verificación de solapamiento de intervalos
      if (hasIntervalOverlap(startTime, duration, slot.startTime, slot.duration)) {
        return { hasOverlap: true, isDuplicate: false, conflictingSlot: slot };
      }
    }

    return { hasOverlap: false, isDuplicate: false };
  } catch (error) {
    console.error('Error al verificar solapamiento de horarios recurrentes:', error);
    throw error;
  }
}

/**
 * Crea una nueva regla de horario semanal permanente en 'teacherRecurringSlots'.
 */
export async function createRecurringSlot(
  payload: CreateRecurringSlotPayload
): Promise<string> {
  const teacherId = payload.teacherId.trim();
  const startTime = payload.startTime.trim();
  const originDate = payload.originDate.trim();
  const dayOfWeek = payload.dayOfWeek;
  const duration = payload.duration;
  const isActive = payload.isActive !== undefined ? payload.isActive : true;

  // 1. Validaciones en cliente
  validateRecurringSlotData({
    teacherId,
    dayOfWeek,
    startTime,
    duration,
    originDate,
  });

  // 2. Validación de solapamientos y duplicados contra Firestore
  const overlapCheck = await checkRecurringSlotOverlap(teacherId, dayOfWeek, startTime, duration);
  if (overlapCheck.isDuplicate) {
    throw new Error('Ya existe un horario idéntico para este día de la semana.');
  }
  if (overlapCheck.hasOverlap) {
    throw new Error(
      `El horario seleccionado (${startTime}) se solapa con otro horario recurrente existente (${overlapCheck.conflictingSlot?.startTime} - ${overlapCheck.conflictingSlot?.endTime}).`
    );
  }

  // 3. Cálculo de la hora de fin
  const endTime = calculateEndTime(startTime, duration);

  try {
    const slotDocData = {
      teacherId,
      dayOfWeek,
      startTime,
      endTime,
      duration,
      isActive,
      originDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), slotDocData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
  }
}

/**
 * Consulta y devuelve los horarios recurrentes de un profesor desde 'teacherRecurringSlots'.
 * Opcionalmente filtra solo los activos.
 */
export async function getTeacherRecurringSlots(
  teacherId: string,
  onlyActive = false
): Promise<TeacherRecurringSlot[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('teacherId', '==', teacherId)
    );

    const snapshot = await getDocs(q);
    const slots: TeacherRecurringSlot[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const slot: TeacherRecurringSlot = {
        id: docSnap.id,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        isActive: data.isActive ?? true,
        originDate: data.originDate,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };

      if (!onlyActive || slot.isActive) {
        slots.push(slot);
      }
    });

    // Ordenar cronológicamente: día de la semana (0..6), luego hora de inicio
    slots.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    return slots;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
  }
}

/**
 * Actualiza una regla recurrente existente.
 * Valida solapamientos si se modifica el día, hora o duración.
 */
export async function updateRecurringSlot(
  slotId: string,
  payload: UpdateRecurringSlotPayload
): Promise<void> {
  try {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      throw new Error('Debes iniciar sesión para realizar esta operación.');
    }

    const docRef = doc(db, COLLECTION_NAME, slotId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('El horario recurrente solicitado no existe.');
    }

    const currentData = docSnap.data() as TeacherRecurringSlot;
    if (currentData.teacherId !== currentUserId) {
      throw new Error('No tienes permisos para modificar este horario.');
    }

    const newDayOfWeek = payload.dayOfWeek !== undefined ? payload.dayOfWeek : currentData.dayOfWeek;
    const newStartTime = payload.startTime ? payload.startTime.trim() : currentData.startTime;
    const newDuration = payload.duration !== undefined ? payload.duration : currentData.duration;
    const newOriginDate = payload.originDate ? payload.originDate.trim() : currentData.originDate;
    const newIsActive = payload.isActive !== undefined ? payload.isActive : currentData.isActive;

    // Si se modifica día, hora o duración, validar y recalcular endTime
    const timeChanged =
      newDayOfWeek !== currentData.dayOfWeek ||
      newStartTime !== currentData.startTime ||
      newDuration !== currentData.duration;

    if (timeChanged) {
      validateRecurringSlotData({
        teacherId: currentData.teacherId,
        dayOfWeek: newDayOfWeek,
        startTime: newStartTime,
        duration: newDuration,
        originDate: newOriginDate,
      });

      if (newIsActive) {
        const overlapCheck = await checkRecurringSlotOverlap(
          currentData.teacherId,
          newDayOfWeek,
          newStartTime,
          newDuration,
          slotId
        );
        if (overlapCheck.isDuplicate) {
          throw new Error('Ya existe un horario idéntico para este día de la semana.');
        }
        if (overlapCheck.hasOverlap) {
          throw new Error(
            `El horario seleccionado se solapa con otro horario recurrente (${overlapCheck.conflictingSlot?.startTime} - ${overlapCheck.conflictingSlot?.endTime}).`
          );
        }
      }
    }

    const updatedEndTime = calculateEndTime(newStartTime, newDuration);

    const updateFields: Record<string, any> = {
      dayOfWeek: newDayOfWeek,
      startTime: newStartTime,
      endTime: updatedEndTime,
      duration: newDuration,
      originDate: newOriginDate,
      isActive: newIsActive,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, updateFields);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
  }
}

/**
 * Desactiva un horario recurrente sin eliminarlo físicamente.
 */
export async function deactivateRecurringSlot(slotId: string): Promise<void> {
  try {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      throw new Error('Debes iniciar sesión para realizar esta operación.');
    }

    const docRef = doc(db, COLLECTION_NAME, slotId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('El horario recurrente no existe.');
    }

    const data = docSnap.data();
    if (data.teacherId !== currentUserId) {
      throw new Error('No tienes permisos para desactivar este horario.');
    }

    await updateDoc(docRef, {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
  }
}

/**
 * Elimina físicamente una regla de horario recurrente de la colección 'teacherRecurringSlots'.
 */
export async function deleteRecurringSlot(slotId: string): Promise<void> {
  try {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      throw new Error('Debes iniciar sesión para realizar esta operación.');
    }

    const docRef = doc(db, COLLECTION_NAME, slotId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('El horario recurrente no existe.');
    }

    const data = docSnap.data();
    if (data.teacherId !== currentUserId) {
      throw new Error('No tienes permisos para eliminar este horario.');
    }

    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
  }
}

