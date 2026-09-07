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
      className="bg-white rounded-[28px] border border-slate-200/90 shadow-2xs overflow-hidden select-none flex flex-col justify-between"
    >
      {/* Encabezado del Metrónomo */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Metronomo
          </h2>
        </div>

        {/* Control de Sonido Rápido */}
        <div className="flex items-center gap-2">
          <button
            id="btn-metronome-toggle-mute"
            type="button"
            aria-label={isMuted ? 'Activar sonido del metrónomo' : 'Silenciar metrónomo'}
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#00537A]" />
            )}
          </button>
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="p-5 sm:p-6 flex flex-col items-center justify-center flex-1 gap-5">
        {/* Fila Central: [-]  BPM  [+] */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 w-full">
          {/* Botón Disminuir (-) */}
          <button
            id="btn-metronome-bpm-minus"
            type="button"
            aria-label="Disminuir BPM"
            onClick={() => changeBpm(bpm - 1)}
            className="w-12 h-12 rounded-full bg-[#F0F4F8] hover:bg-slate-200 active:scale-95 border border-slate-200/70 flex items-center justify-center text-slate-700 transition cursor-pointer"
          >
            <Minus className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Valor BPM */}
          <div className="flex flex-col items-center min-w-[90px]">
            <span
              id="metronome-bpm-display"
              className={`text-5xl sm:text-6xl font-black tracking-tight text-slate-900 font-mono transition-transform duration-75 ${
                isTickActive ? 'scale-105 text-[#4361EE]' : 'scale-100'
              }`}
            >
              {bpm}
            </span>
            <span className="text-xs font-bold text-slate-400 tracking-wider">
              BPM
            </span>
          </div>

          {/* Botón Aumentar (+) */}
          <button
            id="btn-metronome-bpm-plus"
            type="button"
            aria-label="Aumentar BPM"
            onClick={() => changeBpm(bpm + 1)}
            className="w-12 h-12 rounded-full bg-[#F0F4F8] hover:bg-slate-200 active:scale-95 border border-slate-200/70 flex items-center justify-center text-slate-700 transition cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Botón Iniciar / Detener */}
        <div className="w-full flex flex-col items-center gap-3">
          <button
            id="btn-metronome-toggle-play"
            type="button"
            aria-label={isPlaying ? 'Detener metrónomo' : 'Iniciar metrónomo'}
            onClick={handleTogglePlay}
            className={`w-full max-w-[200px] h-11 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm shadow-sm active:scale-95 transition-all cursor-pointer ${
              isPlaying
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                : 'bg-[#4361EE] hover:bg-indigo-600 text-white shadow-indigo-100'
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>Detener</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>Iniciar</span>
              </>
            )}
          </button>

          {/* Slider de Tempo y Volumen compacto */}
          <div className="w-full flex items-center justify-between gap-3 px-2 pt-1 text-xs text-slate-400">
            <span className="font-mono">40</span>
            <input
              id="metronome-bpm-slider"
              type="range"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => changeBpm(Number(e.target.value))}
              aria-label="Ajustar tempo en BPM"
              className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#4361EE]"
            />
            <span className="font-mono">240</span>
          </div>
        </div>
      </div>
    </div>
  );
};
