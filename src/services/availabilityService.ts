import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './authService';
import type {
  CreateAvailabilityPayload,
  UpdateAvailabilityPayload,
  TeacherAvailability,
} from '../types/availability';

/**
 * Convierte una hora en formato "HH:mm" a minutos desde la medianoche.
 */
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Evalúa si dos intervalos de tiempo se solapan.
 * Condición: newStart < existingEnd AND newEnd > existingStart.
 * Si uno termina justo cuando empieza el otro (newStart === existingEnd), NO solapan.
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
 * Comprueba si un nuevo horario propuesto se solapa con algún horario existente del profesor
 * para esa misma fecha (status === 'available').
 * Permite excluir un availabilityId específico (útil para edición).
 */
export async function checkAvailabilityOverlap(
  teacherId: string,
  date: string,
  startTime: string,
  duration: number,
  excludeAvailabilityId?: string
): Promise<boolean> {
  try {
    const slots = await getTeacherAvailability(teacherId);
    const targetDate = date.trim();

    for (const slot of slots) {
      // Comparar solo horarios de la misma fecha
      if (slot.date !== targetDate) continue;
      // Excluir el propio horario en edición
      if (excludeAvailabilityId && slot.id === excludeAvailabilityId) continue;
      // Solo comparar con horarios en estado 'available'
      if (slot.status !== 'available') continue;

      if (hasIntervalOverlap(startTime, duration, slot.startTime, slot.duration)) {
        return true; // Hay solapamiento
      }
    }

    return false;
  } catch (error) {
    console.error('Error al verificar solapamiento de disponibilidad:', error);
    // Si falla la consulta, propagar el error para que el llamador lo maneje
    throw error;
  }
}

/**
 * Crea un nuevo horario disponible en la colección 'teacherAvailability'.
 * Guarda teacherId, date, startTime, duration, status: 'available', createdAt y updatedAt.
 */
export async function createTeacherAvailability(
  payload: CreateAvailabilityPayload
): Promise<string> {
  const path = 'teacherAvailability';
  try {
    const availabilityData = {
      teacherId: payload.teacherId,
      date: payload.date.trim(),
      startTime: payload.startTime.trim(),
      duration: payload.duration,
      status: 'available' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, path), availabilityData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Actualiza un horario disponible existente en 'teacherAvailability'.
 * Actualiza únicamente: date, startTime, duration, updatedAt.
 * Mantiene: teacherId, status, createdAt.
 */
export async function updateTeacherAvailability(
  availabilityId: string,
  payload: UpdateAvailabilityPayload
): Promise<void> {
  const path = 'teacherAvailability';
  try {
    const docRef = doc(db, path, availabilityId);
    await updateDoc(docRef, {
      date: payload.date.trim(),
      startTime: payload.startTime.trim(),
      duration: payload.duration,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Elimina un horario disponible existente en 'teacherAvailability'.
 */
export async function deleteTeacherAvailability(
  availabilityId: string
): Promise<void> {
  const path = 'teacherAvailability';
  try {
    const docRef = doc(db, path, availabilityId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Consulta y devuelve los horarios disponibles de un profesor desde 'teacherAvailability'.
 * Filtra únicamente por teacherId.
 */
export async function getTeacherAvailability(
  teacherId: string
): Promise<TeacherAvailability[]> {
  const path = 'teacherAvailability';
  try {
    const q = query(
      collection(db, path),
      where('teacherId', '==', teacherId)
    );
    const snapshot = await getDocs(q);
    const results: TeacherAvailability[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      results.push({
        id: docSnap.id,
        teacherId: data.teacherId,
        date: data.date,
        startTime: data.startTime,
        duration: data.duration,
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
