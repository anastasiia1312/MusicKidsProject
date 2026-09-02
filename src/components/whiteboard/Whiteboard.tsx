import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PenTool } from 'lucide-react';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import type {
  WhiteboardTool,
  MusicTemplate,
  MusicTemplateType,
} from './types';

export const Whiteboard: React.FC = () => {
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
    ctx.lineTo(x, y + height);
    ctx.moveTo(x + width, y);
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
   * Inicializa o redimensiona el canvas manteniendo la nitidez con devicePixelRatio
   */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = Math.max(500, Math.min(580, window.innerHeight * 0.6));

    if (
      canvas.style.width === `${displayWidth}px` &&
      canvas.style.height === `${displayHeight}px` &&
      canvas.width > 0
    ) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    // Inicializar o adaptar el canvas en memoria de los trazos
    if (!drawingCanvasRef.current) {
      drawingCanvasRef.current = document.createElement('canvas');
    }
    const drawingCanvas = drawingCanvasRef.current;

    const prevWidth = drawingCanvas.width;
    const prevHeight = drawingCanvas.height;

    // Configurar dimensiones reales del buffer escaladas por DPR
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Si es primera vez o cambió el tamaño del buffer en memoria
    if (prevWidth === 0 || prevHeight === 0) {
      drawingCanvas.width = canvas.width;
      drawingCanvas.height = canvas.height;
    } else if (prevWidth !== canvas.width || prevHeight !== canvas.height) {
      const temp = document.createElement('canvas');
      temp.width = prevWidth;
      temp.height = prevHeight;
      const tctx = temp.getContext('2d');
      if (tctx) tctx.drawImage(drawingCanvas, 0, 0);

      drawingCanvas.width = canvas.width;
      drawingCanvas.height = canvas.height;
      const dctx = drawingCanvas.getContext('2d');
      if (dctx) dctx.drawImage(temp, 0, 0);
    }

    renderComposite();
  }, [renderComposite]);

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

  // Soporte de tecla Delete / Backspace para borrar la plantilla seleccionada
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedTemplateIdRef.current &&
        toolRef.current === 'select'
      ) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        handleDeleteSelectedTemplate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Obtiene las coordenadas precisas del puntero en el sistema de coordenadas lógicas
   */
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
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
        const newX = Math.max(10, drag.initialX + dx);
        const newY = Math.max(20, drag.initialY + dy);

        setTemplates((prev) =>
          prev.map((t) =>
            t.id === drag.templateId ? { ...t, x: newX, y: newY } : t
          )
        );
        return;
      }

      if (drag.isResizing && drag.templateId) {
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        // Límites mínimos para mantener las líneas legibles
        const newWidth = Math.max(150, drag.initialWidth + dx);
        const newHeight = Math.max(40, drag.initialHeight + dy);

        setTemplates((prev) =>
          prev.map((t) =>
            t.id === drag.templateId
              ? { ...t, width: newWidth, height: newHeight }
              : t
          )
        );
        return;
      }
      return;
    }

    // Modo Dibujo
    if (!isDrawingRef.current || !lastPointRef.current) return;
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

    lastPointRef.current = point;
    renderComposite();
  };

  /**
   * Fin de la pulsación
   */
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolRef.current === 'select') {
      dragStateRef.current.isDragging = false;
      dragStateRef.current.isResizing = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Fallback
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
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    handlePointerUp(e);
  };

  /**
   * Insertar una nueva plantilla musical en la pizarra
   */
  const handleAddTemplate = (type: MusicTemplateType) => {
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || 700;

    const lineCount =
      type === 'music_staff' ? 5 : type === 'ukulele_tab' ? 4 : 6;

    const defaultWidth = Math.min(containerWidth - 60, 480);
    const defaultHeight =
      type === 'music_staff' ? 75 : type === 'ukulele_tab' ? 65 : 95;

    // Desplazamiento progresivo para que no se superpongan exactamente
    const offset = (templates.length % 6) * 25;
    const x = Math.max(20, Math.min(50 + offset, containerWidth - defaultWidth - 20));
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

    setTemplates((prev) => [...prev, newTemplate]);
    setSelectedTemplateId(newTemplate.id);
    setTool('select');
  };

  /**
   * Eliminar la plantilla seleccionada
   */
  const handleDeleteSelectedTemplate = () => {
    if (!selectedTemplateId) return;
    setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplateId));
    setSelectedTemplateId(null);
  };

  /**
   * Limpiar toda la pizarra (trazos y plantillas)
   */
  const handleClear = () => {
    if (drawingCanvasRef.current) {
      const dctx = drawingCanvasRef.current.getContext('2d');
      if (dctx) {
        dctx.clearRect(
          0,
          0,
          drawingCanvasRef.current.width,
          drawingCanvasRef.current.height
        );
      }
    }

    setTemplates([]);
    setSelectedTemplateId(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
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
      className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-indigo-100/30 overflow-hidden"
    >
      {/* Encabezado de la pizarra */}
      <div className="p-5 sm:p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <PenTool className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
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
        hasSelectedTemplate={Boolean(selectedTemplateId)}
        onDeleteSelectedTemplate={handleDeleteSelectedTemplate}
      />

      {/* Contenedor del Canvas */}
      <div
        ref={containerRef}
        className="w-full bg-white relative select-none overflow-hidden"
        style={{ cursor: getCanvasCursor(), minHeight: '500px' }}
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
