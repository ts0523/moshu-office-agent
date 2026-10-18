import type { AppInfo, FileMeta } from '../types';
import { SEED_FILES } from './seed';

type ReadResult = { text?: string; base64?: string; ext: string };
type WritePayload = { text?: string; base64?: string };

interface MoshuApi {
  isElectron: boolean;
  info: () => Promise<AppInfo>;
  list: () => Promise<Omit<FileMeta, 'ext'>[]>;
  read: (name: string) => Promise<ReadResult>;
  write: (name: string, payload: WritePayload) => Promise<{ name: string; size: number; mtime: number }>;
  remove: (name: string) => Promise<boolean>;
  rename: (from: string, to: string) => Promise<boolean>;
  reveal: (name?: string) => Promise<boolean>;
  openPath: (target: string) => Promise<boolean>;
  importDialog: () => Promise<{ name: string; base64: string; size: number }[]>;
  saveDialog: (name: string, payload: { base64: string }) => Promise<string | null>;
  saveExport: (name: string, base64: string) => Promise<string>;
  exportPdf: (html: string, name: string) => Promise<{ path: string; base64: string; name: string }>;
  aiProxy: (payload: { url: string; headers: Record<string, string>; body: unknown; method?: string }) => Promise<{ ok: boolean; status: number; text: string; data: unknown }>;
  aiDownload: (url: string) => Promise<{ base64: string; mime: string }>;
  openWorkspace: () => Promise<boolean>;
  writeBoard: (name: string, data: unknown) => Promise<boolean>;
  window: (action: string) => Promise<{ maximized: boolean } | void>;
  onBridgeReady: (cb: (data: { port: number; workspace: string }) => void) => () => void;
  onWindowState: (cb: (data: { maximized: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    moshu?: MoshuApi;
  }
}

export const api = typeof window !== 'undefined' ? window.moshu : undefined;
export const isDesktop = !!api?.isElectron;

/* ------------------------------------------------------------------ */
/* 浏览器演示工作区（localStorage）                                      */
/* ------------------------------------------------------------------ */

interface MemoryFile {
  text?: string;
  base64?: string;
  mtime: number;
}

const LS_KEY = 'moshu.workspace.v2';
let memory: Record<string, MemoryFile> | null = null;

function loadStore(): Record<string, MemoryFile> {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      memory = JSON.parse(raw) as Record<string, MemoryFile>;
      return memory;
    }
  } catch { /* ignore */ }
  memory = {};
  for (const [name, text] of Object.entries(SEED_FILES)) {
    memory[name] = { text, mtime: Date.now() - Object.keys(SEED_FILES).indexOf(name) * 120000 };
  }
  persist();
  return memory;
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(memory ?? {}));
  } catch {
    /* 容量不足时退回内存模式 */
  }
}

function browserMeta(): FileMeta[] {
  const store = loadStore();
  return Object.entries(store)
    .map(([name, f]) => ({
      name,
      ext: name.toLowerCase().split('.').pop() || '',
      size: f.base64 ? Math.round((f.base64.length * 3) / 4) : new Blob([f.text ?? '']).size,
      mtime: f.mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

/* ------------------------------------------------------------------ */
/* 统一工作区 API                                                       */
/* ------------------------------------------------------------------ */

export async function listFiles(): Promise<FileMeta[]> {
  if (api) {
    const files = await api.list();
    return files.map((f) => ({ ...f, ext: f.name.toLowerCase().split('.').pop() || '' }));
  }
  return browserMeta();
}

export async function readFile(name: string): Promise<ReadResult> {
  if (api) return api.read(name);
  const file = loadStore()[name];
  if (!file) throw new Error(`文件不存在：${name}`);
  return { text: file.text, base64: file.base64, ext: name.toLowerCase().split('.').pop() || '' };
}

export async function writeFile(name: string, payload: WritePayload): Promise<FileMeta> {
  if (api) {
    const meta = await api.write(name, payload);
    return { ...meta, ext: name.toLowerCase().split('.').pop() || '' };
  }
  const store = loadStore();
  store[name] = { ...payload, mtime: Date.now() };
  persist();
  return browserMeta().find((f) => f.name === name)!;
}

export async function removeFile(name: string): Promise<void> {
  if (api) {
    await api.remove(name);
    return;
  }
  const store = loadStore();
  delete store[name];
  persist();
}

export async function renameFile(from: string, to: string): Promise<void> {
  if (api) {
    await api.rename(from, to);
    return;
  }
  const store = loadStore();
  const file = store[from];
  if (!file) throw new Error('文件不存在');
  delete store[from];
  store[to] = { ...file, mtime: Date.now() };
  persist();
}

export async function getAppInfo(): Promise<AppInfo> {
  if (api) return api.info();
  return {
    isElectron: false,
    version: '1.0.0-web',
    platform: navigator.platform || 'web',
    workspace: '浏览器演示工作区',
    bridge: undefined,
  };
}

export async function importDialog(): Promise<{ name: string; base64: string }[]> {
  if (api) return api.importDialog();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const out: { name: string; base64: string }[] = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        out.push({ name: file.name, base64: base64FromBytes(new Uint8Array(buf)) });
      }
      resolve(out);
    };
    input.click();
  });
}

export async function saveBinary(name: string, base64: string): Promise<string> {
  if (api) return api.saveExport(name, base64);
  downloadBase64(name, base64);
  return name;
}

export async function saveAs(name: string, base64: string): Promise<string | null> {
  if (api) return api.saveDialog(name, { base64 });
  downloadBase64(name, base64);
  return name;
}

export async function reveal(name?: string): Promise<void> {
  if (api) {
    await api.reveal(name);
  }
}

export async function openWorkspace(): Promise<void> {
  if (api) await api.openWorkspace();
}

export function downloadBase64(name: string, base64: string) {
  const link = document.createElement('a');
  link.download = name;
  link.href = `data:application/octet-stream;base64,${base64}`;
  link.click();
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
