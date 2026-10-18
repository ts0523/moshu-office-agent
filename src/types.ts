export type DocKind = 'rich' | 'markdown' | 'text' | 'code' | 'sheet' | 'pdf' | 'slides' | 'board';

export interface FileMeta {
  name: string;
  ext: string;
  size: number;
  mtime: number;
}

export type Port = 'top' | 'right' | 'bottom' | 'left';
export type NodeKind = 'card' | 'image' | 'annotation-circle' | 'note' | 'ink';
export type Tone = 'ink' | 'clay' | 'moss' | 'sky' | 'sand';

export interface BoardNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  body?: string;
  tone?: Tone;
  image?: string;
  points?: number[];
  fontSize?: number;
}

export interface BoardEdge {
  id: string;
  from: { nodeId: string; port: Port };
  to: { nodeId: string; port: Port };
  label?: string;
  tone?: Tone;
  dashed?: boolean;
}

export interface Board {
  id: string;
  name: string;
  background: 'dots' | 'grid' | 'plain';
  nodes: BoardNode[];
  edges: BoardEdge[];
}

export interface SlideContent {
  title: string;
  lines: string[];
}

export interface Tab {
  id: string;
  name: string;
  ext: string;
  kind: DocKind;
  dirty: boolean;
  html: string;
  text: string;
  rows: string[][];
  slides: SlideContent[];
  board?: Board;
  pdfBase64?: string;
  loading?: boolean;
  error?: string;
  readOnly?: boolean;
  warning?: string;
  savedAt?: number;
}

export interface Settings {
  theme: 'light' | 'dark';
  toolbarScale: number;
  aiBaseUrl: string;
  aiApiKey: string;
  aiTextModel: string;
  aiImageModel: string;
  autoSave: boolean;
  userName: string;
}

export interface Toast {
  id: string;
  text: string;
  tone?: 'default' | 'ok' | 'warn' | 'error';
}

export interface AgentLog {
  id: string;
  at: number;
  action: string;
  detail?: string;
  ok?: boolean;
  source?: 'cli' | 'app';
}

export interface AppInfo {
  isElectron: boolean;
  version: string;
  platform: string;
  workspace: string;
  exports?: string;
  bridge?: { port: number; http: string; ws: string };
  dev?: boolean;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: number;
}
