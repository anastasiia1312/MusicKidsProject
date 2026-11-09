import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  TeacherBankDetails,
  SaveTeacherBankDetailsPayload,
  BankDetailsValidationResult,
} from '../types/bankDetails';

/**
 * Valida minuciosamente los datos bancarios del profesor para transferencias en Argentina.
 */
export function validateBankDetails(data: Partial<SaveTeacherBankDetailsPayload>): BankDetailsValidationResult {
  const alias = (data.alias || '').trim();
  const cbuCvu = (data.cbuCvu || '').trim();
  const accountHolder = (data.accountHolder || '').trim();
  const bankName = (data.bankName || '').trim();

  // 1. Alias obligatorio
  if (!alias) {
    return {
      isValid: false,
      errorMessage: 'El Alias de la cuenta es obligatorio para recibir transferencias.',
    };
  }

  // 2. CBU / CVU obligatorio y exactamente 22 dígitos numéricos
  if (!cbuCvu) {
    return {
      isValid: false,
      errorMessage: 'El CBU o CVU es obligatorio.',
    };
  }

  const onlyDigitsRegex = /^\d{22}$/;
  if (!onlyDigitsRegex.test(cbuCvu)) {
    return {
      isValid: false,
      errorMessage: `El CBU o CVU debe contener exactamente 22 dígitos numéricos (ingresados: ${cbuCvu.length}). Verificá no haber omitido ceros iniciales.`,
    };
  }

  // 3. Titular de la cuenta obligatorio
  if (!accountHolder) {
    return {
      isValid: false,
      errorMessage: 'El nombre y apellido del titular de la cuenta es obligatorio.',
    };
  }

  return {
    isValid: true,
    cleanData: {
      alias,
      cbuCvu,
      accountHolder,
      bankName,
    },
  };
}

/**
 * Consulta los datos bancarios del profesor en la subcolección privada:
 * users/{teacherId}/privateSettings/bankDetails
 */
export async function getTeacherBankDetails(
  teacherId: string
): Promise<TeacherBankDetails | null> {
  if (!teacherId || typeof teacherId !== 'string') return null;

  const trimmedId = teacherId.trim();

  try {
    const docRef = doc(db, 'users', trimmedId, 'privateSettings', 'bankDetails');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        teacherId: data.teacherId || trimmedId,
        alias: data.alias || '',
        cbuCvu: data.cbuCvu || '',
        accountHolder: data.accountHolder || '',
        bankName: data.bankName || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }

    return null;
  } catch (err: any) {
    console.error('Error al consultar datos bancarios del profesor:', err);
    const errMsg = err?.message || String(err);
    if (errMsg.includes('permission-denied') || errMsg.includes('insufficient permissions')) {
      throw new Error(
        'PERMISSIONS_DENIED_BANK_DETAILS: No se tienen permisos de lectura en la subcolección privada de datos bancarios (users/{teacherId}/privateSettings/bankDetails).'
      );
    }
    throw err;
  }
}

/**
 * Guarda o actualiza los datos bancarios del profesor en la subcolección privada:
 * users/{teacherId}/privateSettings/bankDetails
 *
 * Preserva createdAt en actualizaciones y previene duplicados.
 */
export async function saveTeacherBankDetails(
  teacherId: string,
  payload: SaveTeacherBankDetailsPayload
): Promise<void> {
  if (!teacherId || typeof teacherId !== 'string') {
    throw new Error('Identificador de profesor inválido.');
  }

  const validation = validateBankDetails(payload);
  if (!validation.isValid || !validation.cleanData) {
    throw new Error(validation.errorMessage || 'Los datos bancarios ingresados no son válidos.');
  }

  const trimmedId = teacherId.trim();
  const { alias, cbuCvu, accountHolder, bankName } = validation.cleanData;

  try {
    const docRef = doc(db, 'users', trimmedId, 'privateSettings', 'bankDetails');
    const docSnap = await getDoc(docRef);

    const now = serverTimestamp();
    const dataToSave: Record<string, any> = {
      teacherId: trimmedId,
      alias,
      cbuCvu,
      accountHolder,
      bankName,
      updatedAt: now,
    };

    // Si el documento es nuevo, establecer createdAt. Si ya existe, preservarlo.
    if (!docSnap.exists()) {
      dataToSave.createdAt = now;
    }

    await setDoc(docRef, dataToSave, { merge: true });
  } catch (err: any) {
    console.error('Error al guardar datos bancarios del profesor:', err);
    const errMsg = err?.message || String(err);
    if (errMsg.includes('permission-denied') || errMsg.includes('insufficient permissions')) {
      throw new Error(
        'PERMISSIONS_DENIED_BANK_DETAILS: Las reglas de seguridad de Firestore aún no permiten la escritura en users/{teacherId}/privateSettings/bankDetails. Es necesario actualizar las reglas en Firebase Console.'
      );
    }
    throw err;
  }
}
