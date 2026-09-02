import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  Plus,
  Minus,
  Volume2,
  VolumeX,
  Clock,
} from 'lucide-react';

export const Metronome: React.FC = () => {
  const [bpm, setBpm] = useState<number>(100);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isTickActive, setIsTickActive] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Referencias para la síntesis de audio precisa y el scheduler
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const bpmRef = useRef<number>(bpm);
  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);

  // Parámetros de precisión temporal (Lookahead Scheduler)
  const nextNoteTimeRef = useRef<number>(0);
  const timerIdRef = useRef<number | null>(null);

  // Mantener actualizadas las referencias sin reconstruir el scheduler
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    volumeRef.current = volume;
    if (masterGainRef.current && audioCtxRef.current) {
      const target = isMuted ? 0 : volume / 100;
      masterGainRef.current.gain.setTargetAtTime(
        target,
        audioCtxRef.current.currentTime,
        0.015
      );
    }
  }, [volume, isMuted]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  /**
   * Obtiene o inicializa de forma perezosa el AudioContext del metrónomo
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
   * Programa un clic de audio en el tiempo exacto usando AudioContext.currentTime
   */
  const scheduleClick = useCallback((time: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Frecuencia nítida y agradable para todos los pulsos (880 Hz)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, time);

    // Envolvente ultracorta y percusiva (decay rápido de 35ms sin ruidos ni clics)
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.8, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);

    osc.connect(gain);
    gain.connect(masterGainRef.current);

    osc.start(time);
    osc.stop(time + 0.045);

    // Disparar flash visual del pulso en sincronía con el audio
    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
    window.setTimeout(() => {
      if (isPlayingRef.current) {
        setIsTickActive(true);
        setTimeout(() => setIsTickActive(false), 90);
      }
    }, delayMs);
  }, []);

  /**
   * Planificador Lookahead: evalúa periódicamente y programa clicks de audio en AudioContext
   */
  const scheduler = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isPlayingRef.current) return;

    const lookaheadSec = 0.1; // 100ms de anticipación

    while (nextNoteTimeRef.current < ctx.currentTime + lookaheadSec) {
      scheduleClick(nextNoteTimeRef.current);

      // Calcular el intervalo del próximo beat en función del BPM actual
      const secondsPerBeat = 60.0 / bpmRef.current;
      nextNoteTimeRef.current += secondsPerBeat;
    }

    if (isPlayingRef.current) {
      timerIdRef.current = window.setTimeout(scheduler, 25);
    }
  }, [scheduleClick]);

  /**
   * Inicia el metrónomo
   */
  const startMetronome = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    isPlayingRef.current = true;
    setIsPlaying(true);

    // Comenzar inmediatamente con un pequeño margen seguro de 50ms
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    scheduler();
  }, [getAudioContext, scheduler]);

  /**
   * Detiene el metrónomo y limpia temporizadores
   */
  const stopMetronome = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsTickActive(false);

    if (timerIdRef.current !== null) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  /**
   * Toggle iniciar/detener
   */
  const handleTogglePlay = () => {
    if (isPlaying) {
      stopMetronome();
    } else {
      startMetronome();
    }
  };

  /**
   * Ajuste de BPM seguro dentro del rango [40, 240]
   */
  const changeBpm = (newBpm: number) => {
    const clamped = Math.max(40, Math.min(240, Math.round(newBpm)));
    setBpm(clamped);
  };

  /**
   * Limpieza al desmontar el componente: detiene timers y cierra AudioContext
   */
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if (timerIdRef.current !== null) {
        clearTimeout(timerIdRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch {
          // Ignorar
        }
      }
    };
  }, []);

  return (
    <div
      id="lesson-metronome-section"
      className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-indigo-100/30 overflow-hidden select-none"
    >
      {/* Encabezado del Metrónomo */}
      <div className="p-5 sm:p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Metrónomo digital
            </h2>
            <p className="text-xs text-slate-500">
              Pulso rítmico y control de tempo.
            </p>
          </div>
        </div>

        {/* Control de Volumen Propio del Metrónomo */}
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200/80">
          <button
            id="btn-metronome-toggle-mute"
            type="button"
            aria-label={isMuted ? 'Activar sonido del metrónomo' : 'Silenciar metrónomo'}
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-700 transition cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-indigo-600" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <label
              htmlFor="metronome-volume-slider"
              className="text-xs font-bold text-slate-600 w-12"
            >
              {isMuted ? '0%' : `${volume}%`}
            </label>
            <input
              id="metronome-volume-slider"
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              aria-label="Volumen del metrónomo"
              className="w-24 sm:w-28 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
        </div>
      </div>

      {/* Contenido Principal Simplificado para Niños */}
      <div className="p-6 sm:p-10 bg-slate-50/60">
        <div className="max-w-md mx-auto flex flex-col items-center gap-8">
          {/* Elemento Principal: Número Grande de BPM con Indicador Visual de Pulso Integrado */}
          <div className="flex flex-col items-center relative">
            <div className="flex items-baseline gap-2">
              <span
                id="metronome-bpm-display"
                className={`text-6xl sm:text-7xl font-black tracking-tight text-slate-900 font-mono transition-transform duration-75 ${
                  isTickActive ? 'scale-105 text-indigo-600' : 'scale-100'
                }`}
              >
                {bpm}
              </span>
              <span className="text-base sm:text-lg font-extrabold text-slate-400 tracking-wider">
                BPM
              </span>
            </div>

            {/* Pequeño punto visual indicador del pulso */}
            <div
              className={`w-3 h-3 rounded-full mt-2 transition-all duration-75 ${
                isPlaying
                  ? isTickActive
                    ? 'bg-indigo-600 scale-150 shadow-md shadow-indigo-300 ring-4 ring-indigo-200'
                    : 'bg-indigo-200 scale-100'
                  : 'bg-slate-200'
              }`}
            />
          </div>

          {/* Fila de Botones Principales: [-] [ ▶ Iniciar / ■ Detener ] [+] */}
          <div className="w-full flex items-center justify-center gap-4 sm:gap-6">
            {/* Botón Disminuir BPM (-) */}
            <button
              id="btn-metronome-bpm-minus"
              type="button"
              aria-label="Disminuir BPM"
              onClick={() => changeBpm(bpm - 1)}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 border-2 border-slate-200 flex items-center justify-center text-slate-700 font-black shadow-md hover:shadow-lg transition cursor-pointer text-xl"
            >
              <Minus className="w-6 h-6 stroke-[3]" />
            </button>

            {/* Botón Central Grande Iniciar / Detener */}
            <button
              id="btn-metronome-toggle-play"
              type="button"
              aria-label={isPlaying ? 'Detener metrónomo' : 'Iniciar metrónomo'}
              onClick={handleTogglePlay}
              className={`flex-1 max-w-[220px] h-14 sm:h-16 rounded-2xl flex items-center justify-center gap-3 font-extrabold text-base sm:text-lg shadow-lg active:scale-95 transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 ring-4 ring-rose-100'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 ring-4 ring-indigo-100'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  <span>Detener</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                  <span>Iniciar</span>
                </>
              )}
            </button>

            {/* Botón Aumentar BPM (+) */}
            <button
              id="btn-metronome-bpm-plus"
              type="button"
              aria-label="Aumentar BPM"
              onClick={() => changeBpm(bpm + 1)}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 border-2 border-slate-200 flex items-center justify-center text-slate-700 font-black shadow-md hover:shadow-lg transition cursor-pointer text-xl"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>

          {/* Slider de BPM: 40 ─────●───── 240 */}
          <div className="w-full flex items-center gap-4 px-2">
            <span className="text-sm font-bold text-slate-400 font-mono w-7 text-right">
              40
            </span>
            <input
              id="metronome-bpm-slider"
              type="range"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => changeBpm(Number(e.target.value))}
              aria-label="Ajustar tempo en BPM"
              className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <span className="text-sm font-bold text-slate-400 font-mono w-7">
              240
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
