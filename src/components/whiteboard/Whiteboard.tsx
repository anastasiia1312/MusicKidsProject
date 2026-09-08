import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PenTool } from 'lucide-react';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import type {
  WhiteboardTool,
  MusicTemplate,
  MusicTemplateType,
  WhiteboardStroke,
} from './types';
import {
  subscribeToWhiteboard,
  saveStroke,
  saveTemplates,
  clearWhiteboard,
} from '../../services/whiteboardService';

export interface WhiteboardProps {
  isVisible?: boolean;
  lessonId?: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({
  isVisible = true,
  lessonId,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Estados de herramientas y configuración
  const [tool, setTool] = useState<WhiteboardTool>('pen');
  const [color, setColor] = useState<string>('#111827');
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [templates, setTemplates] = useState<MusicTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );

  // Referencias para el dibujo de alto rendimiento sin provocar re-renders en pointermove
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const toolRef = useRef<WhiteboardTool>(tool);
  const colorRef = useRef<string>(color);
  const lineWidthRef = useRef<number>(lineWidth);

  // Canvas en memoria para conservar los trazos del lápiz/borrador de forma independiente
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Historial de trazos sincronizados
  const strokesRef = useRef<WhiteboardStroke[]>([]);
  const currentStrokeRef = useRef<WhiteboardStroke | null>(null);

  // Referencias para selección, arrastre y resize
  const templatesRef = useRef<MusicTemplate[]>(templates);
  const selectedTemplateIdRef = useRef<string | null>(selectedTemplateId);
  const dragStateRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    templateId: string | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
  }>({
    isDragging: false,
    isResizing: false,
    templateId: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialWidth: 0,
    initialHeight: 0,
  });

  // Mantener sincronizadas las referencias con los estados de React
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    lineWidthRef.current = lineWidth;
  }, [lineWidth]);

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  /**
   * Dibuja una plantilla musical con líneas horizontales uniformemente distribuidas
   */
  const drawSingleTemplate = (
    ctx: CanvasRenderingContext2D,
    tpl: MusicTemplate,
    isSelected: boolean
  ) => {
    const { x, y, width, height, lineCount, type } = tpl;

    ctx.save();

    // Fondo blanco limpio para la plantilla
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height);

    // Dibujar líneas paralelas horizontales
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'butt';

    const spacing = lineCount > 1 ? height / (lineCount - 1) : 0;

    for (let i = 0; i < lineCount; i++) {
      const lineY = Math.round(y + i * spacing);
      ctx.beginPath();
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + width, lineY);
      ctx.stroke();
    }

    // Barras verticales de cierre en los extremos
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();

    // Etiqueta distintiva sobre la plantilla
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px sans-serif';
    const label =
      type === 'music_staff'
        ? '🎼 Pentagrama (5 líneas)'
        : type === 'ukulele_tab'
        ? '🪕 TAB Ukulele (4 líneas)'
        : '🎸 TAB Guitarra (6 líneas)';
    ctx.fillText(label, x + 2, y - 6);

    // Marco y controlador de redimensionamiento si está seleccionada y en modo selección
    if (isSelected && toolRef.current === 'select') {
      // Marco discontinuo de selección
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x - 5, y - 5, width + 10, height + 10);
      ctx.setLineDash([]);

      // Handle de redimensionamiento en esquina inferior derecha
      const handleSize = 12;
      const handleX = x + width + 5 - handleSize / 2;
      const handleY = y + height + 5 - handleSize / 2;

      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(handleX, handleY, handleSize, handleSize);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(handleX, handleY, handleSize, handleSize);
    }

    ctx.restore();
  };

  /**
   * Compone el lienzo en capas:
   * 1. Fondo blanco
   * 2. Plantillas musicales
   * 3. Trazos del usuario (lápiz/borrador desde drawingCanvas)
   */
  const renderComposite = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Escalar al sistema de coordenadas lógicas
    ctx.scale(dpr, dpr);

    // 2. Dibujar plantillas musicales
    const curTemplates = templatesRef.current;
    const curSelectedId = selectedTemplateIdRef.current;
    curTemplates.forEach((tpl) => {
      drawSingleTemplate(ctx, tpl, tpl.id === curSelectedId);
    });

    // 3. Dibujar trazos de usuario encima de las plantillas
    if (drawingCanvasRef.current) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(drawingCanvasRef.current, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }, []);

  /**
   * Re-dibuja todos los trazos almacenados sobre el canvas en memoria
   */
  const redrawDrawingCanvas = useCallback((strokes: WhiteboardStroke[]) => {
    let dCanvas = drawingCanvasRef.current;
    if (!dCanvas) {
      dCanvas = document.createElement('canvas');
      drawingCanvasRef.current = dCanvas;
    }
    const canvas = canvasRef.current;
    if (canvas && (dCanvas.width !== canvas.width || dCanvas.height !== canvas.height)) {
      dCanvas.width = canvas.width;
      dCanvas.height = canvas.height;
    }
    if (dCanvas.width === 0 || dCanvas.height === 0) return;
    const dctx = dCanvas.getContext('2d');
    if (!dctx) return;

    const dpr = window.devicePixelRatio || 1;

    dctx.save();
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, dCanvas.width, dCanvas.height);
    dctx.restore();

    strokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;

      dctx.save();
      dctx.scale(dpr, dpr);
      dctx.lineCap = 'round';
      dctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        dctx.globalCompositeOperation = 'destination-out';
        dctx.lineWidth = stroke.lineWidth * 3;
      } else {
        dctx.globalCompositeOperation = 'source-over';
        dctx.strokeStyle = stroke.color;
        dctx.fillStyle = stroke.color;
        dctx.lineWidth = stroke.lineWidth;
      }

      if (stroke.points.length === 1) {
        dctx.beginPath();
        dctx.arc(
          stroke.points[0].x,
          stroke.points[0].y,
          dctx.lineWidth / 2,
          0,
          Math.PI * 2
        );
        dctx.fill();
      } else {
        dctx.beginPath();
        dctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          dctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        dctx.stroke();
      }

      dctx.restore();
    });
  }, []);

  /**
   * Inicializa o redimensiona el canvas manteniendo la nitidez con devicePixelRatio
   */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;
    const displayWidth = rect.width;
    const displayHeight = Math.max(
      500,
      Math.min(580, window.innerHeight * 0.6)
    );

    const dpr = window.devicePixelRatio || 1;
    const newPixelWidth = displayWidth * dpr;
    const newPixelHeight = displayHeight * dpr;

    if (
      canvas.width === newPixelWidth &&
      canvas.height === newPixelHeight &&
      canvas.style.width === `${displayWidth}px` &&
      canvas.style.height === `${displayHeight}px`
    ) {
      renderComposite();
      return;
    }

    // Inicializar o adaptar el canvas en memoria de los trazos
    if (!drawingCanvasRef.current) {
      drawingCanvasRef.current = document.createElement('canvas');
    }
    const drawingCanvas = drawingCanvasRef.current;

    canvas.width = newPixelWidth;
    canvas.height = newPixelHeight;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    drawingCanvas.width = newPixelWidth;
    drawingCanvas.height = newPixelHeight;

    // Redibujar todos los trazos sincronizados en el nuevo buffer
    redrawDrawingCanvas(strokesRef.current);
    renderComposite();
  }, [redrawDrawingCanvas, renderComposite]);

  // Redimensionamiento y montaje
  useEffect(() => {
    setupCanvas();

    const handleResize = () => {
      setupCanvas();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [setupCanvas]);

  // Re-renderizar cuando cambian las plantillas, la selección o la herramienta
  useEffect(() => {
    renderComposite();
  }, [templates, selectedTemplateId, tool, renderComposite]);

  // Si vuelve a ser visible tras intercambio con el piano, redibujar sin perder trazos
  useEffect(() => {
    if (isVisible) {
      setupCanvas();
      renderComposite();
    }
  }, [isVisible, setupCanvas, renderComposite]);

  /**
   * Sincronización en tiempo real mediante Firestore onSnapshot vinculada al lessonId
   */
  useEffect(() => {
    if (!lessonId) return;

    const unsubscribe = subscribeToWhiteboard(lessonId, (data) => {
      // 1. Sincronizar trazos
      strokesRef.current = data.strokes;
      redrawDrawingCanvas(data.strokes);

      // Si el usuario local estaba dibujando en ese instante, re-dibujar el segmento local
      if (isDrawingRef.current && currentStrokeRef.current) {
        const dCanvas = drawingCanvasRef.current;
        if (dCanvas) {
          const dctx = dCanvas.getContext('2d');
          if (dctx) {
            const dpr = window.devicePixelRatio || 1;
            const stroke = currentStrokeRef.current;
            dctx.save();
            dctx.scale(dpr, dpr);
            dctx.lineCap = 'round';
            dctx.lineJoin = 'round';
            if (stroke.tool === 'eraser') {
              dctx.globalCompositeOperation = 'destination-out';
              dctx.lineWidth = stroke.lineWidth * 3;
            } else {
              dctx.globalCompositeOperation = 'source-over';
              dctx.strokeStyle = stroke.color;
              dctx.lineWidth = stroke.lineWidth;
            }
            if (stroke.points.length > 1) {
              dctx.beginPath();
              dctx.moveTo(stroke.points[0].x, stroke.points[0].y);
              for (let i = 1; i < stroke.points.length; i++) {
                dctx.lineTo(stroke.points[i].x, stroke.points[i].y);
              }
              dctx.stroke();
            }
            dctx.restore();
          }
        }
      }

      // 2. Sincronizar plantillas musicales (evitar pisar si el usuario local está arrastrando/redimensionando)
      if (!dragStateRef.current.isDragging && !dragStateRef.current.isResizing) {
        setTemplates(data.templates);
        templatesRef.current = data.templates;

        if (
          selectedTemplateIdRef.current &&
          !data.templates.some((t) => t.id === selectedTemplateIdRef.current)
        ) {
          setSelectedTemplateId(null);
        }
      }

      // 3. Renderizar la composición
      renderComposite();
    });

    return () => {
      unsubscribe();
    };
  }, [lessonId, redrawDrawingCanvas, renderComposite]);

  /**
   * Eliminar la plantilla seleccionada y sincronizar en Firestore
   */
  const handleDeleteSelectedTemplate = useCallback(async () => {
    const targetId = selectedTemplateIdRef.current;
    if (!targetId) return;
    const updated = templatesRef.current.filter((t) => t.id !== targetId);
    templatesRef.current = updated;
    setTemplates(updated);
    setSelectedTemplateId(null);

    if (lessonId) {
      try {
        await saveTemplates(lessonId, updated);
      } catch (err) {
        console.error('[Whiteboard realtime] error: al eliminar plantilla seleccionada:', err);
      }
    }
  }, [lessonId]);

  // Soporte de tecla Delete / Backspace para borrar la plantilla seleccionada
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedTemplateIdRef.current &&
        toolRef.current === 'select'
      ) {
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
        ) {
          return;
        }
        e.preventDefault();
        handleDeleteSelectedTemplate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lessonId, handleDeleteSelectedTemplate]);

  /**
   * Obtiene las coordenadas precisas del puntero en el sistema de coordenadas lógicas
   */
  const getCoordinates = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  /**
   * Comprueba si el puntero está sobre el handle de redimensionamiento
   */
  const isOverResizeHandle = (
    x: number,
    y: number,
    tpl: MusicTemplate
  ): boolean => {
    const handleSize = 16;
    const handleX = tpl.x + tpl.width + 5;
    const handleY = tpl.y + tpl.height + 5;
    return (
      x >= handleX - handleSize &&
      x <= handleX + handleSize &&
      y >= handleY - handleSize &&
      y <= handleY + handleSize
    );
  };

  /**
   * Comprueba si el puntero está dentro de los límites de una plantilla
   */
  const isInsideTemplate = (
    x: number,
    y: number,
    tpl: MusicTemplate
  ): boolean => {
    return (
      x >= tpl.x - 5 &&
      x <= tpl.x + tpl.width + 5 &&
      y >= tpl.y - 14 &&
      y <= tpl.y + tpl.height + 5
    );
  };

  /**
   * Inicio de interacción con el puntero
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCoordinates(e);

    // MODO SELECCIÓN / ARRASTRE / REDIMENSIONAMIENTO
    if (toolRef.current === 'select') {
      const curTemplates = templatesRef.current;
      const selId = selectedTemplateIdRef.current;
      const selTpl = curTemplates.find((t) => t.id === selId);

      // Comprobar si tocó el handle de redimensionamiento de la plantilla seleccionada
      if (selTpl && isOverResizeHandle(point.x, point.y, selTpl)) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Fallback
        }
        dragStateRef.current = {
          isDragging: false,
          isResizing: true,
          templateId: selTpl.id,
          startX: point.x,
          startY: point.y,
          initialX: selTpl.x,
          initialY: selTpl.y,
          initialWidth: selTpl.width,
          initialHeight: selTpl.height,
        };
        return;
      }

      // Comprobar si tocó el cuerpo de alguna plantilla (de la última a la primera)
      const clickedTpl = [...curTemplates]
        .reverse()
        .find((t) => isInsideTemplate(point.x, point.y, t));

      if (clickedTpl) {
        setSelectedTemplateId(clickedTpl.id);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Fallback
        }
        dragStateRef.current = {
          isDragging: true,
          isResizing: false,
          templateId: clickedTpl.id,
          startX: point.x,
          startY: point.y,
          initialX: clickedTpl.x,
          initialY: clickedTpl.y,
          initialWidth: clickedTpl.width,
          initialHeight: clickedTpl.height,
        };
      } else {
        setSelectedTemplateId(null);
      }
      return;
    }

    // MODO DIBUJO CON LÁPIZ O BORRADOR
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dctx = dCanvas.getContext('2d');
    if (!dctx) return;

    const dpr = window.devicePixelRatio || 1;

    isDrawingRef.current = true;
    lastPointRef.current = point;

    const roundedPoint = {
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
    };

    currentStrokeRef.current = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tool: toolRef.current,
      color: toolRef.current === 'eraser' ? '#000000' : colorRef.current,
      lineWidth: lineWidthRef.current,
      points: [roundedPoint],
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }

    dctx.save();
    dctx.scale(dpr, dpr);
    dctx.lineCap = 'round';
    dctx.lineJoin = 'round';

    if (toolRef.current === 'eraser') {
      dctx.globalCompositeOperation = 'destination-out';
      dctx.lineWidth = lineWidthRef.current * 3;
    } else {
      dctx.globalCompositeOperation = 'source-over';
      dctx.strokeStyle = colorRef.current;
      dctx.fillStyle = colorRef.current;
      dctx.lineWidth = lineWidthRef.current;
    }

    // Dibujar punto inicial
    dctx.beginPath();
    dctx.arc(point.x, point.y, dctx.lineWidth / 2, 0, Math.PI * 2);
    dctx.fill();
    dctx.restore();

    renderComposite();
  };

  /**
   * Movimiento del puntero
   */
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCoordinates(e);

    // Manejo de Arrastre / Redimensionamiento en modo Selección
    if (toolRef.current === 'select') {
      const drag = dragStateRef.current;
      if (drag.isDragging && drag.templateId) {
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        const newX = Math.max(10, Math.round(drag.initialX + dx));
        const newY = Math.max(20, Math.round(drag.initialY + dy));

        const updated = templatesRef.current.map((t) =>
          t.id === drag.templateId ? { ...t, x: newX, y: newY } : t
        );
        templatesRef.current = updated;
        setTemplates(updated);
        return;
      }

      if (drag.isResizing && drag.templateId) {
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        const newWidth = Math.max(150, Math.round(drag.initialWidth + dx));
        const newHeight = Math.max(40, Math.round(drag.initialHeight + dy));

        const updated = templatesRef.current.map((t) =>
          t.id === drag.templateId
            ? { ...t, width: newWidth, height: newHeight }
            : t
        );
        templatesRef.current = updated;
        setTemplates(updated);
        return;
      }
      return;
    }

    // Modo Dibujo
    if (!isDrawingRef.current || !lastPointRef.current || !currentStrokeRef.current)
      return;

    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dctx = dCanvas.getContext('2d');
    if (!dctx) return;

    const dpr = window.devicePixelRatio || 1;

    dctx.save();
    dctx.scale(dpr, dpr);
    dctx.lineCap = 'round';
    dctx.lineJoin = 'round';

    if (toolRef.current === 'eraser') {
      dctx.globalCompositeOperation = 'destination-out';
      dctx.lineWidth = lineWidthRef.current * 3;
    } else {
      dctx.globalCompositeOperation = 'source-over';
      dctx.strokeStyle = colorRef.current;
      dctx.lineWidth = lineWidthRef.current;
    }

    dctx.beginPath();
    dctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    dctx.lineTo(point.x, point.y);
    dctx.stroke();
    dctx.restore();

    // Guardar punto con precisión de 1 decimal para eficiencia de almacenamiento
    const roundedPoint = {
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
    };
    currentStrokeRef.current.points.push(roundedPoint);

    lastPointRef.current = point;
    renderComposite();
  };

  /**
   * Fin de la pulsación
   */
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Si estaba arrastrando o redimensionando una plantilla, persistir en Firestore
    if (toolRef.current === 'select') {
      const wasModifying =
        dragStateRef.current.isDragging || dragStateRef.current.isResizing;
      dragStateRef.current.isDragging = false;
      dragStateRef.current.isResizing = false;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Fallback
      }

      if (wasModifying && lessonId) {
        saveTemplates(lessonId, templatesRef.current).catch((err) => {
          console.error('[Whiteboard realtime] error: al guardar posición de plantilla:', err);
        });
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Fallback
    }

    // Persistir el trazo completo en Firestore al levantar el puntero
    const strokeToSave = currentStrokeRef.current;
    currentStrokeRef.current = null;

    if (strokeToSave && strokeToSave.points.length > 0) {
      strokesRef.current = [...strokesRef.current, strokeToSave];

      if (lessonId) {
        saveStroke(lessonId, strokeToSave).catch((err) => {
          console.error('[Whiteboard realtime] error: al guardar trazo en Firestore:', err);
        });
      }
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawingRef.current || dragStateRef.current.isDragging || dragStateRef.current.isResizing) {
      handlePointerUp(e);
    }
  };

  /**
   * Insertar una nueva plantilla musical en la pizarra y sincronizarla
   */
  const handleAddTemplate = async (type: MusicTemplateType) => {
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || 700;

    const lineCount =
      type === 'music_staff' ? 5 : type === 'ukulele_tab' ? 4 : 6;

    const defaultWidth = Math.min(containerWidth - 60, 480);
    const defaultHeight =
      type === 'music_staff' ? 75 : type === 'ukulele_tab' ? 65 : 95;

    // Desplazamiento progresivo para que no se superpongan exactamente
    const offset = (templates.length % 6) * 25;
    const x = Math.max(
      20,
      Math.min(50 + offset, containerWidth - defaultWidth - 20)
    );
    const y = 45 + offset;

    const newTemplate: MusicTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      x,
      y,
      width: defaultWidth,
      height: defaultHeight,
      lineCount,
      title:
        type === 'music_staff'
          ? 'Pentagrama'
          : type === 'ukulele_tab'
          ? 'Tablatura Ukulele'
          : 'Tablatura Guitarra',
    };

    const updated = [...templatesRef.current, newTemplate];
    templatesRef.current = updated;
    setTemplates(updated);
    setSelectedTemplateId(newTemplate.id);
    setTool('select');

    if (lessonId) {
      try {
        await saveTemplates(lessonId, updated);
      } catch (err) {
        console.error('[Whiteboard realtime] error: al guardar nueva plantilla:', err);
      }
    }
  };

  /**
   * Limpiar únicamente las plantillas musicales
   */
  const handleClearTemplates = async () => {
    templatesRef.current = [];
    setTemplates([]);
    setSelectedTemplateId(null);

    if (lessonId) {
      try {
        await saveTemplates(lessonId, []);
      } catch (err) {
        console.error('[Whiteboard realtime] error: al limpiar plantillas:', err);
      }
    }
  };

  /**
   * Limpiar toda la pizarra (trazos y plantillas) y sincronizar el estado vacío
   */
  const handleClear = async () => {
    strokesRef.current = [];
    templatesRef.current = [];
    setTemplates([]);
    setSelectedTemplateId(null);

    if (drawingCanvasRef.current) {
      const dctx = drawingCanvasRef.current.getContext('2d');
      if (dctx) {
        dctx.save();
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.clearRect(
          0,
          0,
          drawingCanvasRef.current.width,
          drawingCanvasRef.current.height
        );
        dctx.restore();
      }
    }

    renderComposite();

    if (lessonId) {
      try {
        await clearWhiteboard(lessonId);
      } catch (err) {
        console.error('[Whiteboard realtime] error: al limpiar pizarra en Firestore:', err);
      }
    }
  };

  // Cursor del área de pizarra según herramienta
  const getCanvasCursor = () => {
    if (tool === 'select') return 'default';
    if (tool === 'pen') return 'crosshair';
    if (tool === 'eraser') return 'cell';
    return 'default';
  };

  return (
    <div
      id="lesson-whiteboard-section"
      className="bg-white rounded-[28px] border border-slate-200/90 shadow-2xs overflow-hidden"
    >
      {/* Encabezado de la pizarra */}
      <div className="p-4 sm:p-5 pb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#E8F3F8] text-[#00537A] flex items-center justify-center shrink-0">
            <PenTool className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Pizarra de la clase
            </h2>
            <p className="text-xs text-slate-500">
              Espacio interactivo de dibujo libre y plantillas musicales.
            </p>
          </div>
        </div>
      </div>

      {/* Barra de herramientas */}
      <WhiteboardToolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        lineWidth={lineWidth}
        onLineWidthChange={setLineWidth}
        onClear={handleClear}
        onAddTemplate={handleAddTemplate}
        onClearTemplates={handleClearTemplates}
        hasSelectedTemplate={Boolean(selectedTemplateId)}
        onDeleteSelectedTemplate={handleDeleteSelectedTemplate}
      />

      {/* Contenedor del Canvas */}
      <div
        ref={containerRef}
        className="w-full bg-white relative select-none overflow-hidden"
        style={{ cursor: getCanvasCursor(), minHeight: '480px' }}
      >
        <canvas
          ref={canvasRef}
          id="whiteboard-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
          className="block w-full bg-white"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  );
};
