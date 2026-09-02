import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  autoCorrelate,
  getNoteFromFrequency,
  type PitchDetectionResult,
} from './tunerPitch';

export const Tuner: React.FC = () => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Detección activa en tiempo real (mientras hay sonido)
  const [currentDetection, setCurrentDetection] = useState<PitchDetectionResult | null>(null);
  // Última detección válida que conserva note, frequency, cents, inTune y tuningStatus
  const [lastValidDetection, setLastValidDetection] = useState<PitchDetectionResult | null>(null);
  // Indicador de si el micrófono está recibiendo señal activa en este instante
  const [hasAudioSignal, setHasAudioSignal] = useState<boolean>(false);

  // Referencias para Web Audio API, MediaStream y RequestAnimationFrame
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Buffer de muestras temporales para estabilización
  const recentFreqsRef = useRef<number[]>([]);
  const silenceCounterRef = useRef<number>(0);

  /**
   * Detiene el flujo de audio, libera el micrófono y cancela el loop de animación
   */
  const stopTuner = useCallback(() => {
    // 1. Cancelar requestAnimationFrame
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // 2. Detener y liberar todas las pistas del micrófono
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignorar
        }
      });
      mediaStreamRef.current = null;
    }

    // 3. Desconectar nodos de audio
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignorar
      }
      sourceNodeRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Ignorar
      }
      analyserRef.current = null;
    }

    // 4. Cerrar AudioContext si existe
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch {
        // Ignorar
      }
      audioCtxRef.current = null;
    }

    // 5. Reset completo de estados para la próxima sesión
    recentFreqsRef.current = [];
    silenceCounterRef.current = 0;
    setIsActive(false);
    setCurrentDetection(null);
    setLastValidDetection(null);
    setHasAudioSignal(false);
  }, []);

  /**
   * Loop de procesamiento de audio en tiempo real por requestAnimationFrame
   */
  const updatePitch = useCallback(() => {
    const analyser = analyserRef.current;
    const audioCtx = audioCtxRef.current;

    if (!analyser || !audioCtx) {
      return;
    }

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const freq = autoCorrelate(buffer, audioCtx.sampleRate);

    if (freq !== -1) {
      silenceCounterRef.current = 0;
      setHasAudioSignal(true);

      // Estabilización mediante mediana de las últimas 5 muestras válidas
      const recent = recentFreqsRef.current;
      recent.push(freq);
      if (recent.length > 5) {
        recent.shift();
      }

      // Ordenar para obtener la mediana y filtrar transitorios
      const sorted = [...recent].sort((a, b) => a - b);
      const medianFreq = sorted[Math.floor(sorted.length / 2)];

      const pitchResult = getNoteFromFrequency(medianFreq);
      if (pitchResult) {
        setCurrentDetection(pitchResult);
        // Persistir note, frequency, cents, inTune y tuningStatus como última medición
        setLastValidDetection(pitchResult);
      }
    } else {
      // Contador de histéresis (8 frames ~ 130ms) para cambio suave a estado de silencio
      silenceCounterRef.current += 1;
      if (silenceCounterRef.current > 8) {
        setHasAudioSignal(false);
        setCurrentDetection(null);
        recentFreqsRef.current = [];
        // NOTA: lastValidDetection con note, frequency, cents y status NO se borra
      }
    }

    rafIdRef.current = requestAnimationFrame(updatePitch);
  }, []);

  /**
   * Inicia el afinador pidiendo permiso de micrófono optimizado para instrumentos acústicos
   */
  const startTuner = async () => {
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Tu navegador no permite utilizar el micrófono para el afinador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      mediaStreamRef.current = stream;

      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioCtxClass) {
        setErrorMessage('Tu navegador no es compatible con el sistema de audio.');
        return;
      }

      const ctx = new AudioCtxClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      setIsActive(true);
      rafIdRef.current = requestAnimationFrame(updatePitch);
    } catch (err: unknown) {
      console.warn('Error al acceder al micrófono:', err);
      const error = err as { name?: string };

      if (
        error?.name === 'NotAllowedError' ||
        error?.name === 'PermissionDeniedError'
      ) {
        setErrorMessage('Necesitamos acceso al micrófono para utilizar el afinador.');
      } else if (
        error?.name === 'NotFoundError' ||
        error?.name === 'DevicesNotFoundError'
      ) {
        setErrorMessage('No encontramos un micrófono disponible.');
      } else {
        setErrorMessage('No pudimos iniciar el afinador. Intentá nuevamente.');
      }

      stopTuner();
    }
  };

  /**
   * Limpieza al desmontar el componente (navegación)
   */
  useEffect(() => {
    return () => {
      stopTuner();
    };
  }, [stopTuner]);

  // Medición a renderizar: la detección activa en tiempo real o la última medición válida congelada
  const displayedResult = currentDetection || lastValidDetection;

  // Posición del punto indicador en la barra (-50 cents a +50 cents)
  // Conserva la posición exacta de la aguja incluso durante el silencio
  const cents = displayedResult?.cents ?? 0;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const indicatorPercent = 50 + (clampedCents / 50) * 45;

  return (
    <div
      id="lesson-tuner-section"
      className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-indigo-100/30 overflow-hidden select-none"
    >
      {/* Encabezado del Afinador */}
      <div className="p-5 sm:p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Afinador digital</span>
              {isActive && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Micrófono activo
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              Tocá una nota y MusicKids te ayudará a afinar tu instrumento.
            </p>
          </div>
        </div>

        {/* Botón Desactivar afinador en encabezado si está activo */}
        {isActive && (
          <button
            id="btn-tuner-deactivate-header"
            type="button"
            aria-label="Desactivar afinador"
            onClick={stopTuner}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 text-xs font-bold transition cursor-pointer self-start sm:self-auto"
          >
            <MicOff className="w-4 h-4" />
            <span>Desactivar afinador</span>
          </button>
        )}
      </div>

      {/* Contenido Principal */}
      <div className="p-6 sm:p-10 bg-slate-50/60 flex flex-col items-center justify-center min-h-[260px]">
        {/* Mensaje de Error Amigable */}
        {errorMessage && (
          <div
            id="tuner-error-alert"
            className="w-full max-w-md mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-700 text-xs sm:text-sm font-semibold"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Estado 1: Desactivado */}
        {!isActive ? (
          <div className="flex flex-col items-center text-center max-w-sm gap-4 py-4">
            <div className="w-16 h-16 rounded-3xl bg-indigo-100/70 text-indigo-600 flex items-center justify-center shadow-inner">
              <Mic className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Afiná tu instrumento
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Presioná el botón para permitir el uso del micrófono y detectar la nota en tiempo real.
              </p>
            </div>
            <button
              id="btn-tuner-activate"
              type="button"
              aria-label="Activar afinador"
              onClick={startTuner}
              className="w-full max-w-[240px] h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-base shadow-lg shadow-indigo-200 ring-4 ring-indigo-100 flex items-center justify-center gap-2.5 transition cursor-pointer mt-2"
            >
              <Mic className="w-5 h-5" />
              <span>Activar afinador</span>
            </button>
          </div>
        ) : (
          /* Estado 2: Activo escuchando o mostrando la última medición congelada */
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            {/* Nota Detectada y Frecuencia (Permanecen visibles y congeladas) */}
            <div className="flex flex-col items-center text-center min-h-[110px] justify-center">
              {displayedResult ? (
                <>
                  <span
                    id="tuner-detected-note"
                    className={`text-6xl sm:text-7xl font-black tracking-tight transition-colors duration-150 ${
                      displayedResult.inTune
                        ? 'text-emerald-600'
                        : 'text-amber-500'
                    }`}
                  >
                    {displayedResult.note}
                  </span>
                  <span
                    id="tuner-detected-freq"
                    className="text-xs sm:text-sm font-bold text-slate-500 font-mono mt-1"
                  >
                    {displayedResult.frequency} Hz
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-slate-400 animate-pulse">
                    Tocá una nota...
                  </span>
                  <span className="text-xs text-slate-400">
                    Acercá tu ukulele, guitarra o cantá cerca del micrófono
                  </span>
                </div>
              )}
            </div>

            {/* Barra Visual de Afinación (-50 Cents a +50 Cents) */}
            <div className="w-full flex flex-col gap-2">
              <div className="flex justify-between text-[11px] font-extrabold text-slate-400 px-1">
                <span>BAJO</span>
                <span
                  className={`font-black ${
                    displayedResult?.inTune
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  AFINADO
                </span>
                <span>ALTO</span>
              </div>

              {/* Pista del medidor */}
              <div className="relative w-full h-5 bg-slate-200 rounded-full overflow-visible flex items-center shadow-inner">
                {/* Zona central verde (Afinado) */}
                <div className="absolute left-1/2 -translate-x-1/2 w-12 h-full bg-emerald-100/90 rounded-full border border-emerald-300/50" />
                {/* Línea de calibración central */}
                <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-6 bg-slate-400 z-0" />

                {/* Punto indicador de aguja: conserva la posición de afinación de la última medición */}
                {displayedResult && (
                  <div
                    id="tuner-pitch-needle"
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full shadow-md border-2 border-white transition-all duration-100 z-10 ${
                      displayedResult.inTune
                        ? 'bg-emerald-500 ring-4 ring-emerald-200'
                        : 'bg-amber-500 ring-4 ring-amber-200'
                    }`}
                    style={{ left: `${indicatorPercent}%` }}
                  />
                )}
              </div>
            </div>

            {/* Estado de afinación textual claro: conserva exactamente Bajo / Alto / Afinado */}
            <div className="h-6 flex items-center justify-center">
              {displayedResult ? (
                displayedResult.inTune ? (
                  <span className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4" />
                    ✓ Afinado
                  </span>
                ) : displayedResult.cents < 0 ? (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    Bajo ({displayedResult.cents} cents)
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    Alto (+{displayedResult.cents} cents)
                  </span>
                )
              ) : (
                <span className="text-xs text-slate-400 font-medium">
                  Esperando sonido...
                </span>
              )}
            </div>

            {/* Indicador secundario de espera de sonido cuando cesa la señal */}
            {displayedResult && !hasAudioSignal && (
              <span className="text-[11px] font-semibold text-slate-400 -mt-3">
                Esperando sonido...
              </span>
            )}

            {/* Botón Desactivar Afinador */}
            <button
              id="btn-tuner-deactivate"
              type="button"
              aria-label="Desactivar afinador"
              onClick={stopTuner}
              className="w-full max-w-[220px] h-12 rounded-2xl bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-700 active:scale-95 font-extrabold text-sm transition cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              <MicOff className="w-4 h-4" />
              <span>Desactivar afinador</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
