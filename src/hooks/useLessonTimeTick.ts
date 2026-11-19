import { useState, useEffect } from 'react';
import type { Lesson } from '../types/lesson';
import { computeNextLessonTickDelayMs } from '../utils/meetValidation';

/**
 * Hook reactivo que actualiza automáticamente el timestamp actual (`nowMs`)
 * en los instantes exactos de inicio y finalización de las clases recibidas,
 * sin recargar la página y limpiando correctamente temporizadores y listeners.
 */
export function useLessonTimeTick(
  lessons: Array<Partial<Lesson> | null | undefined>
): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const currentNow = Date.now();
    const delayMs = computeNextLessonTickDelayMs(lessons, currentNow);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (delayMs !== null) {
      timeoutId = setTimeout(() => {
        setNowMs(Date.now());
      }, delayMs);
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [lessons, nowMs]);

  return nowMs;
}
