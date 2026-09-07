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

  // Ángulo de la aguja: de -60° (-50 cents) a +60° (+50 cents)
  const centsValue = displayedResult?.cents ?? 0;
  const needleAngle = Math.max(-60, Math.min(60, (centsValue / 50) * 60));

  return (
    <div
      id="lesson-tuner-section"
      className="bg-white rounded-[28px] border border-slate-200/90 shadow-2xs overflow-hidden select-none flex flex-col justify-between"
    >
      {/* Encabezado del Afinador */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
            <Mic className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Tuner
          </h2>
        </div>

        {/* Estado y botón de activación rápida */}
        <div>
          {isActive ? (
            <button
              id="btn-tuner-deactivate-header"
              type="button"
              aria-label="Desactivar micrófono del afinador"
              onClick={stopTuner}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition cursor-pointer"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>Detener</span>
            </button>
          ) : (
            <button
              id="btn-tuner-activate-header"
              type="button"
              aria-label="Activar afinador"
              onClick={startTuner}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F3F8] hover:bg-indigo-50 text-[#00537A] text-xs font-semibold transition cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Activar</span>
            </button>
          )}
        </div>
      </div>

      {/* Contenido Principal: Medidor de Aguja Radial estilo Mockup */}
      <div className="p-5 sm:p-6 flex flex-col items-center justify-center flex-1">
        {errorMessage && (
          <div
            id="tuner-error-alert"
            className="w-full mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-700 text-xs font-semibold"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Dial de Aguja Semicircular */}
        <div className="relative w-full max-w-[240px] flex flex-col items-center">
          <svg
            viewBox="0 0 200 115"
            className="w-full overflow-visible select-none"
          >
            {/* Arco base */}
            <path
              d="M 25 105 A 75 75 0 0 1 175 105"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Zona afinada central verde */}
            <path
              d="M 88 32 A 75 75 0 0 1 112 32"
              fill="none"
              stroke="#10B981"
              strokeWidth="5"
              strokeLinecap="round"
            />

            {/* Ticks de calibración */}
            {/* -50 */}
            <line x1="28" y1="98" x2="38" y2="92" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
            {/* -25 */}
            <line x1="56" y1="56" x2="63" y2="63" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
            {/* 0 centro */}
            <line x1="100" y1="24" x2="100" y2="34" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
            {/* +25 */}
            <line x1="144" y1="56" x2="137" y2="63" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
            {/* +50 */}
            <line x1="172" y1="98" x2="162" y2="92" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />

            {/* Etiquetas de valores */}
            <text x="22" y="112" fill="#94A3B8" fontSize="10" fontWeight="bold" textAnchor="middle">-50</text>
            <text x="100" y="18" fill="#10B981" fontSize="11" fontWeight="bold" textAnchor="middle">0</text>
            <text x="178" y="112" fill="#94A3B8" fontSize="10" fontWeight="bold" textAnchor="middle">+50</text>

            {/* Aguja dinámica */}
            <g
              transform={`rotate(${isActive ? needleAngle : 0}, 100, 105)`}
              className="transition-transform duration-100 ease-out origin-[100px_105px]"
            >
              <line
                x1="100"
                y1="105"
                x2="100"
                y2="38"
                stroke={
                  !isActive
                    ? '#94A3B8'
                    : displayedResult?.inTune
                    ? '#10B981'
                    : '#F59E0B'
                }
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle
                cx="100"
                cy="105"
                r="6"
                fill={
                  !isActive
                    ? '#94A3B8'
                    : displayedResult?.inTune
                    ? '#10B981'
                    : '#F59E0B'
                }
              />
            </g>
          </svg>

          {/* Nota Detectada y Frecuencia en el centro inferior */}
          <div className="flex flex-col items-center justify-center -mt-2 min-h-[52px]">
            {isActive ? (
              displayedResult ? (
                <>
                  <span
                    id="tuner-detected-note"
                    className={`text-3xl sm:text-4xl font-black tracking-tight ${
                      displayedResult.inTune
                        ? 'text-emerald-600'
                        : 'text-slate-900'
                    }`}
                  >
                    {displayedResult.note}
                  </span>
                  <span
                    id="tuner-detected-freq"
                    className="text-xs font-semibold text-slate-400 font-mono"
                  >
                    {displayedResult.frequency} Hz
                  </span>
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-400 animate-pulse">
                  Tocá una nota...
                </span>
              )
            ) : (
              <button
                type="button"
                onClick={startTuner}
                className="text-xs font-bold text-[#4361EE] hover:underline cursor-pointer"
              >
                Toca para activar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
