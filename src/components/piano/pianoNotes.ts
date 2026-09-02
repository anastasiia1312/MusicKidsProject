export interface PianoNoteData {
  note: string; // e.g. "C4", "C#4"
  frequency: number; // in Hz (A4 = 440 Hz)
  type: 'white' | 'black';
  keyName: string; // e.g. "C", "C#"
  octave: number; // 4 or 5
  keyLabel?: string; // Accessible label e.g. "Do 4", "Do sostenido 4"
  whiteIndex?: number; // Index among white keys (0..13) for exact positioning
  colorConfig?: {
    borderColor: string;
    textColor: string;
  };
}

export interface ActiveOscillator {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gainNode: GainNode;
}

// Configuración de colores para las notas blancas (C, D, E, F, G, A, B)
// C → rojo, D → naranja, E → amarillo, F → verde, G → celeste, A → azul, B → violeta
export const NOTE_COLOR_MAP: Record<string, { borderColor: string; textColor: string }> = {
  C: { borderColor: '#ef4444', textColor: '#dc2626' }, // Rojo
  D: { borderColor: '#f97316', textColor: '#ea580c' }, // Naranja
  E: { borderColor: '#eab308', textColor: '#ca8a04' }, // Amarillo
  F: { borderColor: '#22c55e', textColor: '#16a34a' }, // Verde
  G: { borderColor: '#06b6d4', textColor: '#0891b2' }, // Celeste
  A: { borderColor: '#3b82f6', textColor: '#2563eb' }, // Azul
  B: { borderColor: '#8b5cf6', textColor: '#7c3aed' }, // Violeta
};

// 2 octavas completas: C4 (Do4) hasta B5 (Si5)
// Fórmula de frecuencia: f = 440 * (2 ** ((n - 69) / 12)) donde MIDI A4 = 69 (440 Hz)
export const PIANO_NOTES: PianoNoteData[] = [
  // --- Octava 4 ---
  {
    note: 'C4',
    frequency: 261.63,
    type: 'white',
    keyName: 'C',
    octave: 4,
    keyLabel: 'Do 4',
    whiteIndex: 0,
    colorConfig: NOTE_COLOR_MAP.C,
  },
  {
    note: 'C#4',
    frequency: 277.18,
    type: 'black',
    keyName: 'C#',
    octave: 4,
    keyLabel: 'Do sostenido 4',
    whiteIndex: 0,
  },
  {
    note: 'D4',
    frequency: 293.66,
    type: 'white',
    keyName: 'D',
    octave: 4,
    keyLabel: 'Re 4',
    whiteIndex: 1,
    colorConfig: NOTE_COLOR_MAP.D,
  },
  {
    note: 'D#4',
    frequency: 311.13,
    type: 'black',
    keyName: 'D#',
    octave: 4,
    keyLabel: 'Re sostenido 4',
    whiteIndex: 1,
  },
  {
    note: 'E4',
    frequency: 329.63,
    type: 'white',
    keyName: 'E',
    octave: 4,
    keyLabel: 'Mi 4',
    whiteIndex: 2,
    colorConfig: NOTE_COLOR_MAP.E,
  },
  {
    note: 'F4',
    frequency: 349.23,
    type: 'white',
    keyName: 'F',
    octave: 4,
    keyLabel: 'Fa 4',
    whiteIndex: 3,
    colorConfig: NOTE_COLOR_MAP.F,
  },
  {
    note: 'F#4',
    frequency: 369.99,
    type: 'black',
    keyName: 'F#',
    octave: 4,
    keyLabel: 'Fa sostenido 4',
    whiteIndex: 3,
  },
  {
    note: 'G4',
    frequency: 392.0,
    type: 'white',
    keyName: 'G',
    octave: 4,
    keyLabel: 'Sol 4',
    whiteIndex: 4,
    colorConfig: NOTE_COLOR_MAP.G,
  },
  {
    note: 'G#4',
    frequency: 415.3,
    type: 'black',
    keyName: 'G#',
    octave: 4,
    keyLabel: 'Sol sostenido 4',
    whiteIndex: 4,
  },
  {
    note: 'A4',
    frequency: 440.0,
    type: 'white',
    keyName: 'A',
    octave: 4,
    keyLabel: 'La 4',
    whiteIndex: 5,
    colorConfig: NOTE_COLOR_MAP.A,
  },
  {
    note: 'A#4',
    frequency: 466.16,
    type: 'black',
    keyName: 'A#',
    octave: 4,
    keyLabel: 'La sostenido 4',
    whiteIndex: 5,
  },
  {
    note: 'B4',
    frequency: 493.88,
    type: 'white',
    keyName: 'B',
    octave: 4,
    keyLabel: 'Si 4',
    whiteIndex: 6,
    colorConfig: NOTE_COLOR_MAP.B,
  },

  // --- Octava 5 ---
  {
    note: 'C5',
    frequency: 523.25,
    type: 'white',
    keyName: 'C',
    octave: 5,
    keyLabel: 'Do 5',
    whiteIndex: 7,
    colorConfig: NOTE_COLOR_MAP.C,
  },
  {
    note: 'C#5',
    frequency: 554.37,
    type: 'black',
    keyName: 'C#',
    octave: 5,
    keyLabel: 'Do sostenido 5',
    whiteIndex: 7,
  },
  {
    note: 'D5',
    frequency: 587.33,
    type: 'white',
    keyName: 'D',
    octave: 5,
    keyLabel: 'Re 5',
    whiteIndex: 8,
    colorConfig: NOTE_COLOR_MAP.D,
  },
  {
    note: 'D#5',
    frequency: 622.25,
    type: 'black',
    keyName: 'D#',
    octave: 5,
    keyLabel: 'Re sostenido 5',
    whiteIndex: 8,
  },
  {
    note: 'E5',
    frequency: 659.25,
    type: 'white',
    keyName: 'E',
    octave: 5,
    keyLabel: 'Mi 5',
    whiteIndex: 9,
    colorConfig: NOTE_COLOR_MAP.E,
  },
  {
    note: 'F5',
    frequency: 698.46,
    type: 'white',
    keyName: 'F',
    octave: 5,
    keyLabel: 'Fa 5',
    whiteIndex: 10,
    colorConfig: NOTE_COLOR_MAP.F,
  },
  {
    note: 'F#5',
    frequency: 739.99,
    type: 'black',
    keyName: 'F#',
    octave: 5,
    keyLabel: 'Fa sostenido 5',
    whiteIndex: 10,
  },
  {
    note: 'G5',
    frequency: 783.99,
    type: 'white',
    keyName: 'G',
    octave: 5,
    keyLabel: 'Sol 5',
    whiteIndex: 11,
    colorConfig: NOTE_COLOR_MAP.G,
  },
  {
    note: 'G#5',
    frequency: 830.61,
    type: 'black',
    keyName: 'G#',
    octave: 5,
    keyLabel: 'Sol sostenido 5',
    whiteIndex: 11,
  },
  {
    note: 'A5',
    frequency: 880.0,
    type: 'white',
    keyName: 'A',
    octave: 5,
    keyLabel: 'La 5',
    whiteIndex: 12,
    colorConfig: NOTE_COLOR_MAP.A,
  },
  {
    note: 'A#5',
    frequency: 932.33,
    type: 'black',
    keyName: 'A#',
    octave: 5,
    keyLabel: 'La sostenido 5',
    whiteIndex: 12,
  },
  {
    note: 'B5',
    frequency: 987.77,
    type: 'white',
    keyName: 'B',
    octave: 5,
    keyLabel: 'Si 5',
    whiteIndex: 13,
    colorConfig: NOTE_COLOR_MAP.B,
  },
];
