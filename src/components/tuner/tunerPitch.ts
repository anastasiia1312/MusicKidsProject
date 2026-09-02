/**
 * Algoritmos y cálculos musicales para el afinador digital
 * - Autocorrelación normalizada en dominio temporal con interpolación parabólica y coeficiente de confianza
 * - Conversión de frecuencia a nota cromática (A4 = 440 Hz)
 * - Cálculo de desviación en cents (-50 a +50 cents)
 */

export interface PitchDetectionResult {
  frequency: number; // en Hz
  note: string; // ej. "C", "C#", "D", "G"
  cents: number; // Desviación en cents (-50 a +50)
  inTune: boolean; // ±6 cents de tolerancia
  tuningStatus: 'very_low' | 'low' | 'in_tune' | 'high' | 'very_high';
}

const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convierte una frecuencia en Hz a la nota musical más cercana y calcula la desviación en cents
 * Basado en la afinación estándar A4 = 440 Hz (MIDI 69)
 */
export function getNoteFromFrequency(frequency: number): PitchDetectionResult | null {
  if (frequency < 55 || frequency > 1400) {
    return null;
  }

  // Número de nota MIDI fraccionario: 69 + 12 * log2(f / 440)
  const midiFractional = 69 + 12 * Math.log2(frequency / 440);
  const midiNearest = Math.round(midiFractional);

  // Desviación en cents = 100 * (midiFractional - midiNearest)
  const cents = Math.round((midiFractional - midiNearest) * 100);

  // Nombre de la nota cromática (0 = C, 1 = C#, ..., 9 = A, etc.)
  const noteIndex = ((midiNearest % 12) + 12) % 12;
  const noteName = NOTE_STRINGS[noteIndex];

  const inTune = Math.abs(cents) <= 6; // Tolerancia óptima para estabilidad de niños (±6 cents)

  let tuningStatus: PitchDetectionResult['tuningStatus'] = 'in_tune';
  if (cents < -20) {
    tuningStatus = 'very_low';
  } else if (cents < -6) {
    tuningStatus = 'low';
  } else if (cents > 20) {
    tuningStatus = 'very_high';
  } else if (cents > 6) {
    tuningStatus = 'high';
  }

  return {
    frequency: Math.round(frequency * 10) / 10,
    note: noteName,
    cents: Math.max(-50, Math.min(50, cents)),
    inTune,
    tuningStatus,
  };
}

/**
 * Algoritmo de autocorrelación (ACF) con detección de picos, interpolación parabólica y coeficiente de confianza
 * Calcula la frecuencia fundamental (pitch) a partir del buffer PCM
 * Retorna -1 si la señal es silencio/ruido o la confianza es insuficiente
 *
 * RMS = 0.0015
 * Confidence = 0.28
 */
export function autoCorrelate(
  buffer: Float32Array,
  sampleRate: number,
  minRmsThreshold = 0.0015
): number {
  const size = buffer.length;

  // 1. Calcular el nivel de energía RMS para filtrar silencio absoluto
  let sumSquares = 0;
  for (let i = 0; i < size; i++) {
    const val = buffer[i];
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / size);

  if (rms < minRmsThreshold) {
    return -1; // Silencio
  }

  // 2. Recorte adaptativo de bordes para centrarse en la onda representativa
  let r1 = 0;
  let r2 = size - 1;
  const threshold = Math.max(0.005, rms * 0.25);

  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < threshold) {
      r2 = size - i;
      break;
    }
  }

  const trimmedBuffer = buffer.slice(r1, r2);
  const cSize = trimmedBuffer.length;

  // Rango de búsqueda de frecuencia fundamental: 60 Hz a 1200 Hz
  const maxPeriod = Math.floor(sampleRate / 60);
  const minPeriod = Math.floor(sampleRate / 1200);

  if (cSize <= maxPeriod) {
    return -1;
  }

  // 3. Autocorrelación normalizada
  // Calcular energía en lag 0 para normalizar y calcular confianza
  let energy0 = 0;
  for (let i = 0; i < cSize; i++) {
    energy0 += trimmedBuffer[i] * trimmedBuffer[i];
  }

  if (energy0 <= 0.000001) {
    return -1;
  }

  const correlations = new Float32Array(maxPeriod + 1);
  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    let sum = 0;
    for (let i = 0; i < cSize - lag; i++) {
      sum += trimmedBuffer[i] * trimmedBuffer[i + lag];
    }
    correlations[lag] = sum;
  }

  // 4. Encontrar el primer pico principal de autocorrelación
  let bestLag = -1;
  let maxVal = -1;

  for (let lag = minPeriod + 1; lag < maxPeriod; lag++) {
    if (
      correlations[lag] > correlations[lag - 1] &&
      correlations[lag] > correlations[lag + 1] &&
      correlations[lag] > maxVal
    ) {
      maxVal = correlations[lag];
      bestLag = lag;
    }
  }

  if (bestLag === -1 || maxVal <= 0) {
    return -1;
  }

  // 5. Criterio de Confianza de Autocorrelación (relación pico / energía base)
  const confidence = maxVal / energy0;
  // Umbral de periodicidad: 0.28 para sostener notas decaecientes de ukulele/guitarra
  if (confidence < 0.28) {
    return -1;
  }

  // 6. Interpolación parabólica para refinar la precisión del período en sub-muestras
  const y1 = correlations[bestLag - 1];
  const y2 = correlations[bestLag];
  const y3 = correlations[bestLag + 1];

  const denominator = 2 * (2 * y2 - y1 - y3);
  if (Math.abs(denominator) < 0.000001) {
    return -1;
  }

  const delta = (y3 - y1) / denominator;
  const refinedPeriod = bestLag + delta;

  if (refinedPeriod <= 0) {
    return -1;
  }

  const fundamentalFreq = sampleRate / refinedPeriod;

  // Validar rango admisible (60 Hz a 1200 Hz)
  if (fundamentalFreq < 60 || fundamentalFreq > 1200) {
    return -1;
  }

  return fundamentalFreq;
}
