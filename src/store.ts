import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { AgentLog, AppInfo, Board, BoardEdge, BoardNode, FileMeta, Port, Settings, Tab, Toast, Tone } from './types';
import { kindOf, specOf, isBoardFile } from './lib/formats';
import {
  getAppInfo, listFiles, readFile, removeFile, writeFile, saveBinary, formatSize,
} from './lib/fsapi';

import { parseDocument, htmlToText } from './lib/parsers';
import { serializeForSave, buildDocx, buildPdf, mdToHtml } from './lib/writers';
import { generateImage, generateCopy, localCopy, type CopyRequest } from './lib/ai';
import { generateBoardMovie, blobToBase64 } from './lib/aiVideo';
import { boardToPng, renderBoard, type RenderStyle } from './lib/boardRender';
import { SEED_BOARD } from './lib/seed';

export type BoardTool = 'select' | 'card' | 'image' | 'circle' | 'pen' | 'connect' | 'text' | 'hand';
export type ViewMode = 'doc' | 'board' | 'split';
export type AiTab = 'image' | 'movie' | 'copy' | 'agent';

export interface AiImageState {
  dataUrl: string;
  prompt: string;
  style: RenderStyle;
  provider: string;
  note?: string;
}

export interface AiVideoState {
  url: string;
  base64: string;
  name: string;
  duration: number;
  mode: 'video' | 'animation';
}

const SETTINGS_KEY = 'moshu.settings.v1';

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  toolbarScale: 1,
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiTextModel: 'gpt-4o-mini',
  aiImageModel: '',
  autoSave: true,
  userName: '',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function persistSettings(settings: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

const EMPTY_BOARD: Board = { id: `board-${Date.now()}`, name: '未命名画布', background: 'dots', nodes: [], edges: [] };

function makeTab(name: string): Tab {
  const spec = specOf(name);
  return {
    id: nanoid(8),
    name,
    ext: name.toLowerCase().endsWith('.board.json') ? 'board.json' : spec.ext,
    kind: kindOf(name),
    dirty: false,
    html: '',
    text: '',
    rows: [['', '', ''], ['', '', ''], ['', '', '']],
    slides: [{ title: '未命名演示', lines: ['第一页内容'] }],
  };
}

function templateFor(ext: string, name: string): string {
  const title = name.replace(/\.[^.]+$/, '');
  switch (ext) {
    case 'md':
    case 'markdown':
      return `# ${title}\n\n从这里开始写。\n\n## 要点\n\n- 第一点\n- 第二点\n`;
    case 'csv':
      return '列A,列B,列C\n内容,内容,内容\n';
    case 'json':
      return '{\n  "name": "' + title + '"\n}\n';
    case 'html':
    case 'htm':
      return `<h1>${title}</h1>\n<p>从这里开始写。</p>\n`;
    case 'tex':
      return `\\documentclass{article}\n\\begin{document}\n${title}\n\\end{document}\n`;
    default:
      return '';
  }
}

let boardSaveTimer: ReturnType<typeof setTimeout> | null = null;
let docSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function downloadOrSave(name: string, base64: string) {
  return saveBinary(name, base64);
}

interface AppStore {
  booted: boolean;
  info: AppInfo | null;
  files: FileMeta[];
  tabs: Tab[];
  activeId: string | null;
  view: ViewMode;
  boardFile: string;
  board: Board;
  boardDirty: boolean;
  boardHistory: { past: Board[]; future: Board[] };
  selectedNodes: string[];
  selectedEdge: string | null;
  tool: BoardTool;
  settings: Settings;
  aiOpen: boolean;
  aiTab: AiTab;
  aiBusy: boolean;
  aiStage: string;
  aiProgress: number;
  aiImage: AiImageState | null;
  aiVideo: AiVideoState | null;
  aiCopy: string;
  aiNote: string;
  imagePrompt: string;
  imageStyle: RenderStyle;
  imageSource: 'board' | 'poster';
  videoTitle: string;
  videoMode: 'video' | 'animation';
  copyTopic: string;
  copyChannel: CopyRequest['channel'];
  copyTone: CopyRequest['tone'];
  copyLength: CopyRequest['length'];
  logs: AgentLog[];
  toasts: Toast[];
  commandOpen: boolean;
  settingsOpen: boolean;
  helpOpen: boolean;
  bridgeOnline: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;

  boot: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  addLog: (log: Omit<AgentLog, 'id' | 'at'>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setView: (view: ViewMode) => void;
  setAiOpen: (open: boolean) => void;
  setAiTab: (tab: AiTab) => void;
  setCommandOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setBridgeOnline: (online: boolean) => void;

  openFile: (name: string) => Promise<void>;
  loadBoardFile: (name: string) => Promise<void>;
  createFile: (name: string, ext?: string, content?: string) => Promise<string | null>;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  patchActive: (patch: Partial<Tab>) => void;
  saveActive: (silent?: boolean) => Promise<boolean>;
  saveBoard: (silent?: boolean) => Promise<void>;
  deleteByName: (name: string) => Promise<void>;
  exportActive: (target: string) => Promise<void>;
  exportBoard: (target: 'png' | 'pdf') => Promise<void>;
  insertCopy: (text: string) => Promise<void>;

  setTool: (tool: BoardTool) => void;
  selectNode: (id: string | null, additive?: boolean) => void;
  selectEdge: (id: string | null) => void;
  setBoardName: (name: string) => void;
  addNode: (node: Partial<BoardNode> & { x: number; y: number }) => string;
  updateNode: (id: string, patch: Partial<BoardNode>, commit?: boolean) => void;
  removeSelected: () => void;
  connectNodes: (fromId: string, toId: string, label?: string, ports?: { from: Port; to: Port }) => string | null;
  removeEdge: (id: string) => void;
  setBoard: (board: Board) => void;
  commitHistory: (snapshot: Board) => void;
  undoBoard: () => void;
  redoBoard: () => void;
  autoLayout: () => void;
  duplicateSelected: () => void;

  runImage: () => Promise<void>;
  insertImageNode: () => void;
  runMovie: (mode: 'video' | 'animation') => Promise<void>;
  runCopy: () => Promise<void>;
}

export const useStore = create<AppStore>((set, get) => ({
  booted: false,
  info: null,
  files: [],
  tabs: [],
  activeId: null,
  view: 'doc',
  boardFile: '产品路线图.board.json',
  board: SEED_BOARD,
  boardDirty: false,
  boardHistory: { past: [], future: [] },
  selectedNodes: [],
  selectedEdge: null,
  tool: 'select',
  settings: DEFAULT_SETTINGS,
  aiOpen: true,
  aiTab: 'image',
  aiBusy: false,
  aiStage: '',
  aiProgress: 0,
  aiImage: null,
  aiVideo: null,
  aiCopy: '',
  aiNote: '',
  imagePrompt: '把这张示意图渲染成一张可以直接放进演示稿的视觉图',
  imageStyle: 'editorial',
  imageSource: 'board',
  videoTitle: '墨枢 · 产品概览',
  videoMode: 'video',
  copyTopic: '墨枢：把文档、画布与 Agent 放在一张桌面上',
  copyChannel: 'xiaohongshu',
  copyTone: '克制',
  copyLength: '中',
  logs: [],
  toasts: [],
  commandOpen: false,
  settingsOpen: false,
  helpOpen: false,
  bridgeOnline: false,
  saveState: 'idle',
  lastSavedAt: null,

  boot: async () => {
    const settings = loadSettings();
    set({ settings });
    document.documentElement.dataset.theme = settings.theme;
    try {
      const [info, files] = await Promise.all([getAppInfo(), listFiles()]);
      set({ info, files });

      const boardMeta = files.find((f) => f.name === '产品路线图.board.json') ?? files.find((f) => isBoardFile(f.name));
      let boardFile = boardMeta?.name ?? '产品路线图.board.json';
      if (boardMeta) {
        try {
          const raw = await readFile(boardFile);
          const parsed = JSON.parse(raw.text || '{}') as Board;
          if (parsed?.nodes) set({ board: parsed });
        } catch { /* ignore */ }
      } else {
        await writeFile(boardFile, { text: JSON.stringify(SEED_BOARD, null, 2) });
      }

      const welcome = files.find((f) => f.name === '欢迎使用墨枢.md') ?? files.find((f) => f.ext === 'md');
      set({ booted: true, boardFile });
      if (welcome) await get().openFile(welcome.name);
      await get().refreshFiles();
    } catch (error) {
      set({ booted: true });
      get().toast(`工作区初始化失败：${(error as Error).message}`, 'error');
    }
  },

  refreshFiles: async () => {
    try {
      const files = await listFiles();
      set({ files });
    } catch { /* ignore */ }
  },

  toast: (text, tone = 'default') => {
    const id = nanoid(6);
    set((state) => ({ toasts: [...state.toasts, { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 3200);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  addLog: (log) => set((state) => ({
    logs: [{ ...log, id: nanoid(6), at: Date.now() }, ...state.logs].slice(0, 120),
  })),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    if (patch.toolbarScale !== undefined) settings.toolbarScale = Math.min(1.4, Math.max(0.7, patch.toolbarScale));
    persistSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
    set({ settings });
  },

  setView: (view) => set({ view }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setAiTab: (aiTab) => set({ aiTab }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setBridgeOnline: (bridgeOnline) => set({ bridgeOnline }),

  openFile: async (name) => {
    if (isBoardFile(name)) {
      await get().loadBoardFile(name);
      set({ view: get().view === 'split' ? 'split' : 'board' });
      return;
    }
    const existing = get().tabs.find((t) => t.name === name);
    if (existing) {
      set({ activeId: existing.id, view: get().view === 'board' ? 'doc' : get().view });
      return;
    }
    const tab = makeTab(name);
    tab.loading = true;
    set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id, view: state.view === 'board' ? 'doc' : state.view }));

    try {
      const payload = await readFile(name);
      const parsed = await parseDocument(name, payload);
      set((state) => ({
        tabs: state.tabs.map((t) => t.id === tab.id ? {
          ...t,
          kind: parsed.kind,
          html: parsed.html ?? '',
          text: parsed.text ?? '',
          rows: parsed.rows ?? t.rows,
          slides: parsed.slides ?? t.slides,
          pdfBase64: parsed.pdfBase64,
          readOnly: parsed.readOnly,
          warning: parsed.warning,
          loading: false,
        } : t),
      }));
      if (parsed.warning) get().toast(parsed.warning, 'warn');
    } catch (error) {
      set((state) => ({
        tabs: state.tabs.map((t) => t.id === tab.id ? { ...t, loading: false, error: (error as Error).message } : t),
      }));
      get().toast(`打开失败：${(error as Error).message}`, 'error');
    }
  },

  loadBoardFile: async (name) => {
    try {
      const payload = await readFile(name);
      const board = JSON.parse(payload.text || '{}') as Board;
      if (!Array.isArray(board.nodes)) throw new Error('画布文件格式不正确');
      set({
        boardFile: name,
        board: { ...board, name: board.name || name.replace('.board.json', '') },
        boardDirty: false,
        selectedNodes: [],
        boardHistory: { past: [], future: [] },
      });
    } catch (error) {
      get().toast(`画布载入失败：${(error as Error).message}`, 'error');
    }
  },

  createFile: async (name, ext, content) => {
    let finalName = name.trim();
    if (!finalName) return null;
    const targetExt = ext || finalName.split('.').pop() || 'md';
    if (!/\.(board\.json|[a-z0-9]+)$/i.test(finalName)) finalName += `.${targetExt}`;
    if (isBoardFile(finalName) || targetExt === 'board.json') {
      if (!finalName.endsWith('.board.json')) finalName = `${finalName.replace(/\.[^.]+$/, '')}.board.json`;
      const blank: Board = { ...EMPTY_BOARD, name: finalName.replace('.board.json', ''), id: `board-${Date.now()}` };
      const exists = get().files.some((f) => f.name === finalName);
      if (exists) { get().toast('同名文件已存在', 'warn'); return null; }
      await writeFile(finalName, { text: JSON.stringify(blank, null, 2) });
      await get().refreshFiles();
      await get().loadBoardFile(finalName);
      set({ view: 'board' });
      get().toast('画布已创建', 'ok');
      return finalName;
    }

    const exists = get().files.some((f) => f.name === finalName);
    if (exists) { get().toast('同名文件已存在', 'warn'); return null; }

    const extFinal = finalName.split('.').pop()?.toLowerCase() || 'txt';
    const tab = makeTab(finalName);
    tab.kind = kindOf(finalName);
    if (content != null) {
      if (tab.kind === 'markdown' || tab.kind === 'code' || tab.kind === 'text') tab.text = content;
      else tab.html = content;
    } else if (tab.kind === 'markdown' || tab.kind === 'code' || tab.kind === 'text') {
      tab.text = templateFor(extFinal, finalName);
    } else if (tab.kind === 'rich') {
      tab.html = `<h1>${finalName.replace(/\.[^.]+$/, '')}</h1><p><br></p>`;
    }

    const binary = ['docx', 'pdf', 'xlsx', 'pptx', 'odt'].includes(extFinal);
    if (binary) {
      const serialized = await serializeForSave(tab, extFinal);
      await writeFile(finalName, { base64: serialized.base64 });
    } else if (tab.kind === 'sheet') {
      await writeFile(finalName, { text: content ?? templateFor('csv', finalName) });
    } else {
      await writeFile(finalName, { text: tab.kind === 'rich' ? tab.html : tab.text });
    }
    await get().refreshFiles();
    await get().openFile(finalName);
    get().toast(`已创建 ${finalName}`, 'ok');
    return finalName;
  },

  closeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.dirty && !window.confirm(`「${tab.name}」还有未保存的修改，仍要关闭吗？`)) return;
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== id);
      const activeId = state.activeId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeId;
      return { tabs, activeId };
    });
  },

  setActive: (id) => set((state) => ({ activeId: id, view: state.view === 'board' ? 'doc' : state.view })),

  patchActive: (patch) => {
    const id = get().activeId;
    if (!id) return;
    set((state) => ({
      tabs: state.tabs.map((t) => t.id === id ? { ...t, ...patch, dirty: true } : t),
    }));
    if (get().settings.autoSave) {
      if (docSaveTimer) clearTimeout(docSaveTimer);
      docSaveTimer = setTimeout(() => { void get().saveActive(true); }, 1600);
    }
  },

  saveActive: async (silent) => {
    const tab = get().tabs.find((t) => t.id === get().activeId);
    if (!tab) return false;
    if (tab.readOnly) {
      if (!silent) get().toast('该格式为只读，请使用「另存为」导出可编辑格式', 'warn');
      return false;
    }
    try {
      set({ saveState: 'saving' });
      const serialized = await serializeForSave(tab, tab.ext);
      if (serialized.base64 != null) await writeFile(tab.name, { base64: serialized.base64 });
      else await writeFile(tab.name, { text: serialized.text ?? '' });
      set((state) => ({
        tabs: state.tabs.map((t) => t.id === tab.id ? { ...t, dirty: false, savedAt: Date.now() } : t),
        saveState: 'saved',
        lastSavedAt: Date.now(),
      }));
      if (!silent) get().toast('已保存', 'ok');
      await get().refreshFiles();
      return true;
    } catch (error) {
      set({ saveState: 'error' });
      get().toast(`保存失败：${(error as Error).message}`, 'error');
      return false;
    }
  },

  saveBoard: async (silent) => {
    const { board, boardFile } = get();
    try {
      await writeFile(boardFile, { text: JSON.stringify({ ...board, name: boardFile.replace('.board.json', '') }, null, 2) });
      set({ boardDirty: false, saveState: 'saved', lastSavedAt: Date.now() });
      if (!silent) get().toast('画布已保存', 'ok');
    } catch (error) {
      get().toast(`画布保存失败：${(error as Error).message}`, 'error');
    }
  },

  deleteByName: async (name) => {
    try {
      await removeFile(name);
      set((state) => ({
        tabs: state.tabs.filter((t) => t.name !== name),
        activeId: state.tabs.find((t) => t.id === state.activeId)?.name === name ? null : state.activeId,
      }));
      await get().refreshFiles();
      get().toast('已移入废纸篓', 'ok');
    } catch (error) {
      get().toast(`删除失败：${(error as Error).message}`, 'error');
    }
  },

  exportActive: async (target) => {
    const tab = get().tabs.find((t) => t.id === get().activeId);
    if (!tab) {
      get().toast('先打开一份文档', 'warn');
      return;
    }
    try {
      const serialized = await serializeForSave(tab, target);
      if (serialized.base64 != null) {
        const path = await downloadOrSave(serialized.name, serialized.base64);
        get().toast(`已导出：${path}`, 'ok');
      } else {
        const base64 = btoa(unescape(encodeURIComponent(serialized.text ?? '')));
        const path = await saveBinary(serialized.name, base64);
        get().toast(`已导出：${path}`, 'ok');
      }
    } catch (error) {
      get().toast(`导出失败：${(error as Error).message}`, 'error');
    }
  },

  exportBoard: async (target) => {
    const { board } = get();
    if (target === 'png') {
      try {
        const dataUrl = await boardToPng(board, { style: 'editorial', title: board.name, scale: 2, padding: 120 });
        const base64 = dataUrl.split(',')[1];
        const path = await saveBinary(`${board.name || '画布'}.png`, base64);
        get().toast(`已导出图片：${path}`, 'ok');
      } catch (error) {
        get().toast(`导出失败：${(error as Error).message}`, 'error');
      }
      return;
    }
    try {
      const dataUrl = await boardToPng(board, { style: 'editorial', title: board.name, scale: 2, padding: 120 });
      const tab = makeTab(`${board.name || '画布'}.pdf`);
      tab.html = `<img src="${dataUrl}" style="width:100%" />`;
      tab.kind = 'rich';
      const serialized = await buildPdf(tab);
      const path = await saveBinary(serialized.name, serialized.base64!);
      get().toast(`已导出 PDF：${path}`, 'ok');
    } catch (error) {
      get().toast(`导出失败：${(error as Error).message}`, 'error');
    }
  },

  insertCopy: async (text) => {
    const tab = get().tabs.find((t) => t.id === get().activeId);
    if (!tab) {
      const name = await get().createFile('AI 文案.md', 'md', `# AI 文案\n\n${text}`);
      if (name) get().toast('已新建文案文档', 'ok');
      return;
    }
    if (tab.kind === 'markdown' || tab.kind === 'text' || tab.kind === 'code') {
      get().patchActive({ text: `${tab.text}${tab.text ? '\n\n' : ''}${text}` });
    } else if (tab.kind === 'rich') {
      get().patchActive({ html: `${tab.html}${mdToHtml(text)}` });
    } else {
      get().toast('当前文档不支持插入文案', 'warn');
    }
  },

  setTool: (tool) => set({ tool, selectedNodes: [] }),

  selectNode: (id, additive) => set((state) => {
    if (!id) return { selectedNodes: [] };
    if (!additive) return { selectedNodes: [id] };
    return {
      selectedNodes: state.selectedNodes.includes(id)
        ? state.selectedNodes.filter((n) => n !== id)
        : [...state.selectedNodes, id],
    };
  }),

  selectEdge: (id) => set({ selectedEdge: id, selectedNodes: [] }),

  setBoardName: (name) => {
    set((state) => ({ board: { ...state.board, name }, boardDirty: true }));
  },

  addNode: (partial) => {
    const id = partial.id ?? nanoid(6);
    const node: BoardNode = {
      id,
      kind: partial.kind ?? 'card',
      x: Math.round(partial.x),
      y: Math.round(partial.y),
      w: partial.w ?? 240,
      h: partial.h ?? 140,
      title: partial.title ?? '新方片',
      body: partial.body ?? '',
      tone: partial.tone ?? 'ink',
      image: partial.image,
      points: partial.points,
      fontSize: partial.fontSize,
    };
    set((state) => ({
      board: { ...state.board, nodes: [...state.board.nodes, node] },
      boardDirty: true,
      selectedNodes: [id],
      boardHistory: { past: [...state.boardHistory.past.slice(-30), state.board], future: [] },
    }));
    scheduleBoardAutosave(get);
    return id;
  },

  updateNode: (id, patch, commit = true) => {
    set((state) => {
      const board = {
        ...state.board,
        nodes: state.board.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      };
      return {
        board,
        boardDirty: true,
        boardHistory: commit
          ? { past: [...state.boardHistory.past.slice(-30), state.board], future: [] }
          : state.boardHistory,
      };
    });
    scheduleBoardAutosave(get);
  },

  removeSelected: () => {
    const { selectedNodes, selectedEdge } = get();
    if (!selectedNodes.length && !selectedEdge) return;
    set((state) => ({
      board: {
        ...state.board,
        nodes: state.board.nodes.filter((n) => !selectedNodes.includes(n.id)),
        edges: state.board.edges.filter(
          (e) => e.id !== selectedEdge && !selectedNodes.includes(e.from.nodeId) && !selectedNodes.includes(e.to.nodeId),
        ),
      },
      selectedNodes: [],
      selectedEdge: null,
      boardDirty: true,
      boardHistory: { past: [...state.boardHistory.past.slice(-30), state.board], future: [] },
    }));
    scheduleBoardAutosave(get);
  },

  connectNodes: (fromId, toId, label, ports) => {
    if (fromId === toId) return null;
    const { board } = get();
    const from = board.nodes.find((n) => n.id === fromId);
    const to = board.nodes.find((n) => n.id === toId);
    if (!from || !to) return null;
    const chosen = ports ?? autoPorts(from, to);
    const edge: BoardEdge = {
      id: nanoid(6),
      from: { nodeId: fromId, port: chosen.from },
      to: { nodeId: toId, port: chosen.to },
      label: label ?? '',
      tone: 'ink',
    };
    set((state) => ({
      board: { ...state.board, edges: [...state.board.edges, edge] },
      boardDirty: true,
      boardHistory: { past: [...state.boardHistory.past.slice(-30), state.board], future: [] },
    }));
    scheduleBoardAutosave(get);
    return edge.id;
  },

  removeEdge: (id) => {
    set((state) => ({
      board: { ...state.board, edges: state.board.edges.filter((e) => e.id !== id) },
      boardDirty: true,
      selectedEdge: null,
      boardHistory: { past: [...state.boardHistory.past.slice(-30), state.board], future: [] },
    }));
    scheduleBoardAutosave(get);
  },

  setBoard: (board) => {
    set((state) => ({
      board,
      boardDirty: true,
      boardHistory: { past: [...state.boardHistory.past.slice(-30), state.board], future: [] },
    }));
    scheduleBoardAutosave(get);
  },

  commitHistory: (snapshot) => set((state) => ({
    boardHistory: { past: [...state.boardHistory.past.slice(-30), snapshot], future: [] },
  })),

  undoBoard: () => set((state) => {
    const previous = state.boardHistory.past[state.boardHistory.past.length - 1];
    if (!previous) return {};
    return {
      board: previous,
      boardDirty: true,
      boardHistory: {
        past: state.boardHistory.past.slice(0, -1),
        future: [state.board, ...state.boardHistory.future].slice(0, 30),
      },
    };
  }),

  redoBoard: () => set((state) => {
    const next = state.boardHistory.future[0];
    if (!next) return {};
    return {
      board: next,
      boardDirty: true,
      boardHistory: {
        past: [...state.boardHistory.past, state.board].slice(-30),
        future: state.boardHistory.future.slice(1),
      },
    };
  }),

  autoLayout: () => {
    const { board } = get();
    if (!board.nodes.length) return;
    const incoming = new Map<string, number>();
    board.nodes.forEach((n) => incoming.set(n.id, 0));
    board.edges.forEach((e) => incoming.set(e.to.nodeId, (incoming.get(e.to.nodeId) ?? 0) + 1));
    const layers = new Map<string, number>();
    const queue = board.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
    if (!queue.length) queue.push(board.nodes[0]);
    queue.forEach((n) => layers.set(n.id, 0));
    for (let i = 0; i < queue.length; i += 1) {
      const node = queue[i];
      const layer = layers.get(node.id) ?? 0;
      board.edges.filter((e) => e.from.nodeId === node.id).forEach((e) => {
        const target = board.nodes.find((n) => n.id === e.to.nodeId);
        if (!target) return;
        if (!layers.has(target.id)) { layers.set(target.id, layer + 1); queue.push(target); }
      });
    }
    const columns = new Map<number, BoardNode[]>();
    board.nodes.forEach((n) => {
      const layer = layers.get(n.id) ?? 0;
      columns.set(layer, [...(columns.get(layer) ?? []), n]);
    });
    const nodes = board.nodes.map((n) => {
      const layer = layers.get(n.id) ?? 0;
      const column = columns.get(layer) ?? [];
      const index = column.findIndex((c) => c.id === n.id);
      return { ...n, x: 140 + layer * 340, y: 160 + index * 200 };
    });
    get().setBoard({ ...board, nodes });
    get().toast('已按连接关系整理', 'ok');
  },

  duplicateSelected: () => {
    const { board, selectedNodes } = get();
    if (!selectedNodes.length) return;
    const copies = board.nodes
      .filter((n) => selectedNodes.includes(n.id))
      .map((n) => ({ ...n, id: nanoid(6), x: n.x + 36, y: n.y + 36 }));
    set((state) => ({
      board: { ...state.board, nodes: [...state.board.nodes, ...copies] },
      selectedNodes: copies.map((c) => c.id),
      boardDirty: true,
      boardHistory: { past: [...state.boardHistory.past.slice(-30), state.board], future: [] },
    }));
    scheduleBoardAutosave(get);
  },

  runImage: async () => {
    const state = get();
    if (state.aiBusy) return;
    const useBoard = state.imageSource === 'board' && state.board.nodes.length > 0;
    set({ aiBusy: true, aiStage: '正在理解示意图结构', aiProgress: 0.15 });
    try {
      await new Promise((r) => setTimeout(r, 420));
      set({ aiStage: '正在渲染画面', aiProgress: 0.55 });
      const result = await generateImage({
        prompt: state.imagePrompt,
        style: state.imageStyle,
        useBoard,
        board: state.board,
        title: useBoard ? state.board.name : '',
      }, state.settings);
      set({
        aiImage: { dataUrl: result.dataUrl, prompt: result.prompt, style: state.imageStyle, provider: result.provider, note: result.note },
        aiBusy: false,
        aiProgress: 1,
        aiStage: '',
        aiTab: 'image',
      });
      get().addLog({ action: 'ai.image', detail: `${result.provider} · ${state.imageStyle}`, ok: true, source: 'app' });
      get().toast(result.note ?? '图片已生成', result.provider === 'local' ? 'ok' : 'ok');
    } catch (error) {
      set({ aiBusy: false, aiProgress: 0, aiStage: '' });
      get().toast(`出图失败：${(error as Error).message}`, 'error');
    }
  },

  insertImageNode: () => {
    const image = get().aiImage;
    if (!image) return;
    const { board } = get();
    const minX = board.nodes.length ? Math.min(...board.nodes.map((n) => n.x)) : 120;
    const maxY = board.nodes.length ? Math.max(...board.nodes.map((n) => n.y + n.h)) : 120;
    get().addNode({
      kind: 'image',
      x: minX,
      y: maxY + 80,
      w: 480,
      h: 300,
      title: 'AI 生成图',
      body: image.prompt,
      image: image.dataUrl,
      tone: 'clay',
    });
    get().toast('已放入画布', 'ok');
  },

  runMovie: async (mode) => {
    const state = get();
    if (state.aiBusy) return;
    if (!state.board.nodes.length) { get().toast('画布还是空的，先放几张方片', 'warn'); return; }
    set({ aiBusy: true, aiProgress: 0, aiStage: mode === 'video' ? '正在运镜与录制' : '正在编排方片动画' });
    try {
      const result = await generateBoardMovie(state.board, {
        mode,
        title: state.videoTitle || state.board.name,
        style: 'editorial',
      }, (progress) => set({ aiProgress: progress }));
      const base64 = await blobToBase64(result.blob);
      const ext = result.mime.includes('mp4') ? 'mp4' : 'webm';
      const name = `${(state.videoTitle || state.board.name).replace(/[\\/:*?"<>|]/g, '')}.${ext}`;
      const path = await saveBinary(name, base64);
      const url = URL.createObjectURL(result.blob);
      set({
        aiVideo: { url, base64, name, duration: result.duration, mode },
        aiBusy: false,
        aiProgress: 1,
        aiStage: '',
      });
      get().addLog({ action: mode === 'video' ? 'ai.video' : 'ai.animate', detail: `${result.duration.toFixed(1)}s · ${name}`, ok: true, source: 'app' });
      get().toast(`成片已导出：${path}`, 'ok');
    } catch (error) {
      set({ aiBusy: false, aiProgress: 0, aiStage: '' });
      get().toast(`生成失败：${(error as Error).message}`, 'error');
    }
  },

  runCopy: async () => {
    const state = get();
    if (state.aiBusy) return;
    if (!state.copyTopic.trim()) { get().toast('先写一个主题', 'warn'); return; }
    set({ aiBusy: true, aiStage: '正在组织语言', aiProgress: 0.3 });
    try {
      const result = await generateCopy({
        topic: state.copyTopic,
        channel: state.copyChannel,
        tone: state.copyTone,
        length: state.copyLength,
      }, state.settings);
      set({ aiCopy: result.text, aiBusy: false, aiProgress: 1, aiStage: '', aiNote: result.provider === 'remote' ? '远程模型' : '本地文案引擎' });
      get().addLog({ action: 'ai.copy', detail: `${state.copyChannel} · ${result.provider}`, ok: true, source: 'app' });
    } catch (error) {
      set({ aiBusy: false, aiProgress: 0, aiStage: '' });
      // 远程失败时退回本地引擎
      const fallback = localCopy({
        topic: state.copyTopic,
        channel: state.copyChannel,
        tone: state.copyTone,
        length: state.copyLength,
      });
      set({ aiCopy: fallback, aiNote: '本地文案引擎（远程失败）' });
      get().toast(`远程模型不可用，已本地生成：${(error as Error).message}`, 'warn');
    }
  },
}));

/* ------------------------------------------------------------------ */
/* 辅助                                                               */
/* ------------------------------------------------------------------ */

function scheduleBoardAutosave(get: () => AppStore) {
  if (!get().settings.autoSave) return;
  if (boardSaveTimer) clearTimeout(boardSaveTimer);
  boardSaveTimer = setTimeout(() => { void get().saveBoard(true); }, 700);
}

function autoPorts(from: BoardNode, to: BoardNode): { from: Port; to: Port } {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

export function activeTabOf(state: { tabs: Tab[]; activeId: string | null }): Tab | undefined {
  return state.tabs.find((t) => t.id === state.activeId);
}

export function boardSummary(board: Board): string {
  return `${board.nodes.length} 个节点 / ${board.edges.length} 条连线 · ${formatSize(new Blob([JSON.stringify(board)]).size)}`;
}

export type { RenderStyle, Tone };
