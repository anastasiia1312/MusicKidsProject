export type WhiteboardTool = 'pen' | 'eraser' | 'select';

export type MusicTemplateType = 'music_staff' | 'ukulele_tab' | 'guitar_tab';

export interface MusicTemplate {
  id: string;
  type: MusicTemplateType;
  x: number;
  y: number;
  width: number;
  height: number;
  lineCount: number;
  title: string;
}

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  lineWidth: number;
  points: WhiteboardPoint[];
}

export interface WhiteboardData {
  strokes: WhiteboardStroke[];
  templates: MusicTemplate[];
}
