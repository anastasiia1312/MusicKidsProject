import React, { useState } from 'react';
import {
  Pencil,
  Eraser,
  MousePointer,
  Trash2,
  Check,
  AlertCircle,
  X,
  Music2,
} from 'lucide-react';
import type { WhiteboardTool, MusicTemplateType } from './types';

interface WhiteboardToolbarProps {
  tool: WhiteboardTool;
  onToolChange: (tool: WhiteboardTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  lineWidth: number;
  onLineWidthChange: (width: number) => void;
  onClear: () => void;
  onAddTemplate: (type: MusicTemplateType) => void;
  hasSelectedTemplate: boolean;
  onDeleteSelectedTemplate: () => void;
}

const LINE_WIDTH_OPTIONS = [
  { value: 2, label: '2px' },
  { value: 4, label: '4px' },
  { value: 8, label: '8px' },
  { value: 12, label: '12px' },
];

const PRESET_COLORS = [
  { value: '#111827', label: 'Negro' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Amarillo' },
  { value: '#8b5cf6', label: 'Púrpura' },
];

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  tool,
  onToolChange,
  color,
  onColorChange,
  lineWidth,
  onLineWidthChange,
  onClear,
  onAddTemplate,
  hasSelectedTemplate,
  onDeleteSelectedTemplate,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleConfirmClear = () => {
    onClear();
    setShowClearConfirm(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 bg-slate-50 border-b border-slate-200/80 rounded-t-2xl select-none">
      {/* Fila 1: Herramientas principales de dibujo, selección, color y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Herramienta Lápiz */}
          <button
            id="btn-whiteboard-tool-pen"
            type="button"
            aria-label="Lápiz para dibujar"
            onClick={() => onToolChange('pen')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              tool === 'pen'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Pencil className="w-4 h-4" />
            <span>Lápiz</span>
          </button>

          {/* Herramienta Borrador */}
          <button
            id="btn-whiteboard-tool-eraser"
            type="button"
            aria-label="Borrador de trazos"
            onClick={() => onToolChange('eraser')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              tool === 'eraser'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Eraser className="w-4 h-4" />
            <span>Borrador</span>
          </button>

          {/* Herramienta Seleccionar y Mover */}
          <button
            id="btn-whiteboard-tool-select"
            type="button"
            aria-label="Seleccionar y mover plantillas"
            onClick={() => onToolChange('select')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              tool === 'select'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <MousePointer className="w-4 h-4" />
            <span>Seleccionar</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Selector de Grosor */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-400 uppercase px-1.5 hidden md:inline">
              Grosor:
            </span>
            {LINE_WIDTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                id={`btn-stroke-width-${opt.value}`}
                type="button"
                aria-label={`Grosor de trazo ${opt.label}`}
                onClick={() => onLineWidthChange(opt.value)}
                className={`px-2 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  lineWidth === opt.value
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Selector de color */}
          {tool === 'pen' && (
            <div className="flex items-center gap-1 bg-white p-1 px-2 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase hidden md:inline mr-1">
                Color:
              </span>
              <div className="flex items-center gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={`Color ${c.label}`}
                    onClick={() => onColorChange(c.value)}
                    className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                      color.toLowerCase() === c.value.toLowerCase()
                        ? 'scale-125 border-indigo-600 ring-2 ring-indigo-200'
                        : 'border-slate-300 hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}

                {/* Input color nativo */}
                <label
                  aria-label="Color personalizado"
                  className="w-5 h-5 rounded-full border border-slate-300 cursor-pointer overflow-hidden relative ml-1 flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title="Elegir color personalizado"
                >
                  <input
                    id="whiteboard-color-picker"
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Acciones de eliminación y limpieza */}
        <div className="flex items-center gap-2">
          {/* Botón eliminar plantilla seleccionada */}
          {hasSelectedTemplate && tool === 'select' && (
            <button
              id="btn-delete-selected-template"
              type="button"
              aria-label="Eliminar plantilla seleccionada"
              onClick={onDeleteSelectedTemplate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs"
            >
              <X className="w-4 h-4" />
              <span>Eliminar plantilla</span>
            </button>
          )}

          {/* Botón limpiar pizarra con confirmación */}
          {showClearConfirm ? (
            <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-xl border border-red-200 animate-fadeIn">
              <span className="text-xs text-red-700 font-semibold px-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                ¿Borrar todo?
              </span>
              <button
                id="btn-confirm-clear-whiteboard"
                type="button"
                aria-label="Confirmar limpiar pizarra"
                onClick={handleConfirmClear}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Sí</span>
              </button>
              <button
                type="button"
                aria-label="Cancelar limpiar pizarra"
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200 transition-all cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              id="btn-whiteboard-clear"
              type="button"
              aria-label="Limpiar pizarra"
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs sm:text-sm font-bold transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
      </div>

      {/* Fila 2: Sección destacada de Plantillas Musicales */}
      <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-200/80 bg-white/70 -mx-3 -mb-3 sm:-mx-4 sm:-mb-4 p-3 sm:px-4 rounded-b-2xl">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-900 mr-1 shrink-0">
          <Music2 className="w-3.5 h-3.5 text-indigo-600" />
          <span>Plantillas musicales:</span>
        </div>

        {/* Pentagrama — 5 líneas */}
        <button
          id="btn-template-staff"
          type="button"
          aria-label="Insertar Pentagrama — 5 líneas"
          onClick={() => onAddTemplate('music_staff')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 active:bg-indigo-100 text-slate-800 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <span className="text-sm">🎼</span>
          <span>Pentagrama — 5 líneas</span>
        </button>

        {/* Tablatura ukulele — 4 líneas */}
        <button
          id="btn-template-ukulele"
          type="button"
          aria-label="Insertar Tablatura ukulele — 4 líneas"
          onClick={() => onAddTemplate('ukulele_tab')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 active:bg-indigo-100 text-slate-800 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <span className="text-sm">🪕</span>
          <span>Tablatura ukulele — 4 líneas</span>
        </button>

        {/* Tablatura guitarra — 6 líneas */}
        <button
          id="btn-template-guitar"
          type="button"
          aria-label="Insertar Tablatura guitarra — 6 líneas"
          onClick={() => onAddTemplate('guitar_tab')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 active:bg-indigo-100 text-slate-800 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <span className="text-sm">🎸</span>
          <span>Tablatura guitarra — 6 líneas</span>
        </button>
      </div>
    </div>
  );
};
