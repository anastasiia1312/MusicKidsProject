import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, Piano, Maximize2, Minimize2 } from 'lucide-react';
import {
  PIANO_NOTES,
  type PianoNoteData,
  type ActiveOscillator,
} from './pianoNotes';

export interface VirtualPianoProps {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const VirtualPiano: React.FC<VirtualPianoProps> = ({
  isExpanded = false,
  onToggleExpand,
}) => {
  const [volume, setVolume] = useState<number>(60);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());

  // Web Audio Context & nodos
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  // Mapa de notas activas con sus osciladores y envelope de ganancia
  const activeOscillatorsRef = useRef<Map<string, ActiveOscillator>>(new Map());
  // Mapa de punteros táctiles activos para soporte multitouch
  const pointerNotesRef = useRef<Map<number, string>>(new Map());

  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);

  useEffect(() => {
    volumeRef.current = volume;
    if (masterGainRef.current && audioCtxRef.current) {
      const targetGain = isMuted ? 0 : volume / 100;
      masterGainRef.current.gain.setTargetAtTime(
        targetGain,
        audioCtxRef.current.currentTime,
        0.015
      );
    }
  }, [volume, isMuted]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  /**
   * Inicializa o reanuda de forma perezosa el AudioContext tras la primera interacción
   */
  const getAudioContext = useCallback((): AudioContext | null => {
    if (!audioCtxRef.current) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtxClass) return null;

      const ctx = new AudioCtxClass();
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(
        isMutedRef.current ? 0 : volumeRef.current / 100,
        ctx.currentTime
      );
      masterGain.connect(ctx.destination);

      audioCtxRef.current = ctx;
      masterGainRef.current = masterGain;
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    return audioCtxRef.current;
  }, []);

  /**
   * Detiene una nota activa con envolvente de liberación suave (release)
   */
  const stopNote = useCallback((noteName: string) => {
    const active = activeOscillatorsRef.current.get(noteName);
    const ctx = audioCtxRef.current;

    if (active && ctx) {
      const now = ctx.currentTime;
      // Release suave: decay de 0.12 segundos para evitar cortes o clics
      active.gainNode.gain.cancelScheduledValues(now);
      active.gainNode.gain.setValueAtTime(active.gainNode.gain.value, now);
      active.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      setTimeout(() => {
        try {
          active.osc1.stop();
          active.osc2.stop();
          active.osc1.disconnect();
          active.osc2.disconnect();
          active.gainNode.disconnect();
        } catch {
          // Ignorar si ya fue detenido
        }
      }, 150);

      activeOscillatorsRef.current.delete(noteName);
    }

    setActiveNotes((prev) => {
      if (!prev.has(noteName)) return prev;
      const next = new Set(prev);
      next.delete(noteName);
      return next;
    });
  }, []);

  /**
   * Inicia la reproducción de una nota usando síntesis aditiva (triangle + sine) y envolvente ADSR
   */
  const startNote = useCallback(
    (noteData: PianoNoteData) => {
      const ctx = getAudioContext();
      if (!ctx || !masterGainRef.current) return;

      // Si ya está sonando, no recrear
      if (activeOscillatorsRef.current.has(noteData.note)) {
        return;
      }

      const now = ctx.currentTime;

      // Oscilador 1: Onda triangular principal (cálida y armónica)
      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(noteData.frequency, now);

      // Oscilador 2: Onda senoidal suave una octava arriba para brillo acústico tipo teclado
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(noteData.frequency * 2, now);

      // Envolvente de volumen (Attack rápido + Decay a Sustain)
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0.0001, now);
      // Attack de 8ms
      noteGain.gain.exponentialRampToValueAtTime(0.7, now + 0.008);
      // Decay hacia sustain de 0.45
      noteGain.gain.exponentialRampToValueAtTime(0.45, now + 0.15);

      // Mezcla de osciladores
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.18, now); // Sutil
      osc2.connect(osc2Gain);
      osc2Gain.connect(noteGain);

      osc1.connect(noteGain);
      noteGain.connect(masterGainRef.current);

      osc1.start(now);
      osc2.start(now);

      activeOscillatorsRef.current.set(noteData.note, {
        osc1,
        osc2,
        gainNode: noteGain,
      });

      setActiveNotes((prev) => new Set(prev).add(noteData.note));
    },
    [getAudioContext]
  );

  /**
   * Limpieza de AudioContext y osciladores al desmontar el componente
   */
  useEffect(() => {
    return () => {
      // Detener todas las notas activas
      activeOscillatorsRef.current.forEach((active) => {
        try {
          active.osc1.stop();
          active.osc2.stop();
          active.osc1.disconnect();
          active.osc2.disconnect();
          active.gainNode.disconnect();
        } catch {
          // Ignorar
        }
      });
      activeOscillatorsRef.current.clear();

      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch {
          // Ignorar
        }
      }
    };
  }, []);

  /**
   * Manejadores de interacción por Pointer Events (Mouse, Touch, Stylus)
   */
  const handlePointerDown = (
    noteData: PianoNoteData,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }
    pointerNotesRef.current.set(e.pointerId, noteData.note);
    startNote(noteData);
  };

  const handlePointerUp = (
    noteData: PianoNoteData,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Fallback
    }
    pointerNotesRef.current.delete(e.pointerId);
    stopNote(noteData.note);
  };

  const handlePointerCancel = (
    noteData: PianoNoteData,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    handlePointerUp(noteData, e);
  };

  const whiteNotes = PIANO_NOTES.filter((n) => n.type === 'white');
  const blackNotes = PIANO_NOTES.filter((n) => n.type === 'black');

  // Posicionamiento porcentual exacto de las teclas negras sobre las 14 teclas blancas (2 octavas)
  // Cada tecla blanca ocupa 100% / 14 = 7.142857%
  const getBlackKeyLeftPercentage = (note: PianoNoteData): number => {
    const whiteWidthPct = 100 / 14;
    const wIndex = note.whiteIndex ?? 0;
    // La tecla negra se sitúa centrada en la división entre dos teclas blancas
    return (wIndex + 1) * whiteWidthPct - whiteWidthPct * 0.32;
  };

  return (
    <div
      id="lesson-virtual-piano-section"
      className={`bg-white rounded-[28px] border border-slate-200/90 shadow-2xs overflow-hidden select-none flex flex-col justify-between ${
        !isExpanded ? 'hover:border-slate-300 transition-colors' : ''
      }`}
    >
      {/* Encabezado y controles de volumen */}
      <div
        className={`p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-slate-100 ${
          !isExpanded && onToggleExpand ? 'cursor-pointer hover:bg-slate-50/50 transition-colors' : ''
        }`}
        onClick={!isExpanded && onToggleExpand ? onToggleExpand : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
            <Piano className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Piano</span>
              {isExpanded && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-[#00537A] border border-indigo-200/60">
                  2 Octavas
                </span>
              )}
            </h2>
            {isExpanded && (
              <p className="text-xs text-slate-500 hidden sm:block">
                Tocá las teclas del piano con mouse o pantalla táctil.
              </p>
            )}
          </div>
        </div>

        {/* Control de Volumen y Botón de alternancia */}
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {isExpanded && (
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200/80 mr-1">
              <label
                htmlFor="piano-volume-slider"
                className="text-xs font-bold text-slate-600 w-10 text-right"
              >
                {isMuted ? '0%' : `${volume}%`}
              </label>
              <input
                id="piano-volume-slider"
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                aria-label="Volumen del piano virtual"
                className="w-20 sm:w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#00537A]"
              />
            </div>
          )}

          <button
            id="btn-piano-toggle-mute"
            type="button"
            aria-label={isMuted ? 'Activar sonido del piano' : 'Silenciar piano'}
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#00537A]" />
            )}
          </button>

          {onToggleExpand && (
            isExpanded ? (
              <button
                id="btn-piano-collapse"
                type="button"
                aria-label="Volver a la Pizarra"
                onClick={onToggleExpand}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer ml-1"
                title="Volver a la Pizarra"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Volver a la Pizarra</span>
                <span className="sm:hidden">Pizarra</span>
              </button>
            ) : (
              <button
                id="btn-piano-expand"
                type="button"
                aria-label="Expandir piano al área principal"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 hover:text-[#00537A] transition cursor-pointer"
                title="Expandir al área principal"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Contenedor del Teclado del Piano */}
      <div className={`p-4 sm:p-5 flex-1 flex flex-col justify-center overflow-x-auto ${isExpanded ? 'min-h-[300px]' : ''}`}>
        <div
          className={`relative mx-auto rounded-xl overflow-hidden bg-slate-900 shadow-md ${
            isExpanded
              ? 'p-2 pt-0 border-t-6 border-slate-700'
              : 'p-1.5 pt-0 border-t-4 border-slate-700'
          }`}
          style={{
            width: '100%',
            minWidth: isExpanded ? '640px' : '320px',
            maxWidth: isExpanded ? '1020px' : '420px',
            height: isExpanded ? '280px' : '170px',
          }}
        >
          {/* Capa 1: Teclas Blancas */}
          <div className="w-full h-full flex gap-[2px]">
            {whiteNotes.map((note) => {
              const isPressed = activeNotes.has(note.note);
              const colorCfg = note.colorConfig;

              return (
                <button
                  key={note.note}
                  id={`piano-key-${note.note}`}
                  type="button"
                  aria-label={`${note.keyLabel || note.note}`}
                  onPointerDown={(e) => handlePointerDown(note, e)}
                  onPointerUp={(e) => handlePointerUp(note, e)}
                  onPointerCancel={(e) => handlePointerCancel(note, e)}
                  className={`flex-1 h-full rounded-b-md flex flex-col justify-end items-center transition-all cursor-pointer select-none active:scale-[0.99] origin-top ${
                    isExpanded ? 'pb-5 sm:pb-6' : 'pb-3.5'
                  } ${
                    isPressed
                      ? 'bg-amber-100 text-slate-950 shadow-inner translate-y-0.5 ring-2 ring-indigo-500'
                      : 'bg-white hover:bg-slate-50 text-slate-700 shadow-md'
                  }`}
                  style={{ touchAction: 'none' }}
                >
                  {/* Círculo de color con fondo blanco y borde de color con la letra de la nota */}
                  <div
                    className={`${
                      isExpanded ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-7 h-7'
                    } rounded-full bg-white flex items-center justify-center border-2 shadow-xs transition-transform`}
                    style={{
                      borderColor: colorCfg?.borderColor || '#64748b',
                    }}
                  >
                    <span
                      className={`font-extrabold leading-none ${
                        isExpanded ? 'text-xs sm:text-sm' : 'text-xs'
                      }`}
                      style={{
                        color: colorCfg?.textColor || '#0f172a',
                      }}
                    >
                      {note.keyName}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Capa 2: Teclas Negras (Superpuestas y completamente limpias visualmente) */}
          {blackNotes.map((note) => {
            const isPressed = activeNotes.has(note.note);
            const leftPct = getBlackKeyLeftPercentage(note);
            const keyWidthPct = (100 / 14) * 0.64; // Ancho armónico respecto a tecla blanca

            return (
              <button
                key={note.note}
                id={`piano-key-${note.note}`}
                type="button"
                aria-label={`${note.keyLabel || note.note}`}
                onPointerDown={(e) => handlePointerDown(note, e)}
                onPointerUp={(e) => handlePointerUp(note, e)}
                onPointerCancel={(e) => handlePointerCancel(note, e)}
                style={{
                  left: `${leftPct}%`,
                  width: `${keyWidthPct}%`,
                  height: '60%',
                  touchAction: 'none',
                }}
                className={`absolute top-0 z-10 rounded-b-md flex items-center justify-center transition-all cursor-pointer select-none ${
                  isPressed
                    ? 'bg-indigo-600 shadow-inner translate-y-0.5 ring-2 ring-amber-400'
                    : 'bg-gradient-to-b from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 shadow-lg border-b-4 border-black'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
