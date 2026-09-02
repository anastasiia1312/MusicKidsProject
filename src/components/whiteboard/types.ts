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
