import { nanoid } from 'nanoid';
import { useStore, activeTabOf } from '../store';
import type { BoardNode, Tone } from '../types';
import { readFile, writeFile, saveBinary, base64FromBytes } from './fsapi';
import { generateCopy } from './ai';
import { boardToPng, type RenderStyle } from './boardRender';
import { buildDocx, buildPdf } from './writers';
import { htmlToText } from './parsers';
import { isBoardFile } from './formats';

interface Command {
  action: string;
  params: Record<string, unknown>;
}

function result(ok: boolean, data?: unknown, error?: string) {
  return { ok, data, error };
}

export async function executeCommand(action: string, params: Record<string, unknown> = {}): Promise<ReturnType<typeof result>> {
  const store = useStore.getState();
  try {
    switch (action) {
      case 'status':
      case 'app.state': {
        return result(true, {
          app: '墨枢 Office Agent',
          version: store.info?.version ?? '1.0.0-web',
          workspace: store.info?.workspace ?? '浏览器演示工作区',
          desktop: !!store.info?.isElectron,
          view: store.view,
          files: store.files.length,
          tabs: store.tabs.map((t) => ({ name: t.name, kind: t.kind, dirty: t.dirty })),
          board: { file: store.boardFile, nodes: store.board.nodes.length, edges: store.board.edges.length },
          bridgeOnline: store.bridgeOnline,
        });
      }

      case 'file.list':
        return result(true, store.files);

      case 'file.read': {
        const name = String(params.name ?? '');
        const payload = await readFile(name);
        return result(true, { name, ...payload });
      }

      case 'file.write': {
        const name = String(params.name ?? '');
        if (!name) throw new Error('缺少 name');
        if (params.base64) await writeFile(name, { base64: String(params.base64) });
        else await writeFile(name, { text: String(params.content ?? params.text ?? '') });
        await store.refreshFiles();
        store.toast(`Agent 写入：${name}`, 'ok');
        return result(true, { name });
      }

      case 'file.create': {
        const name = String(params.name ?? '');
        const ext = params.ext ? String(params.ext) : undefined;
        const created = await store.createFile(name, ext, params.content != null ? String(params.content) : undefined);
        if (!created) throw new Error('创建失败，文件可能已存在');
        return result(true, { name: created });
      }

      case 'file.open': {
        const name = String(params.name ?? '');
        await store.openFile(name);
        return result(true, { name, opened: true });
      }

      case 'file.delete': {
        await store.deleteByName(String(params.name ?? ''));
        return result(true, { deleted: true });
      }

      case 'doc.info': {
        const tab = activeTabOf(store);
        if (!tab) throw new Error('没有打开的文档');
        const text = tab.kind === 'markdown' || tab.kind === 'text' || tab.kind === 'code' ? tab.text : htmlToText(tab.html);
        return result(true, {
          name: tab.name,
          kind: tab.kind,
          chars: text.length,
          words: text.trim() ? text.trim().split(/\s+/).length : 0,
          lines: text.split('\n').length,
          outline: text.split('\n').filter((l) => /^#{1,4}\s/.test(l)).map((l) => l.replace(/^#+\s*/, '')),
          dirty: tab.dirty,
        });
      }

      case 'doc.append': {
        const tab = activeTabOf(store);
        if (!tab) throw new Error('没有打开的文档');
        const text = String(params.text ?? params.content ?? '');
        if (tab.kind === 'markdown' || tab.kind === 'text' || tab.kind === 'code') {
          store.patchActive({ text: `${tab.text}${tab.text ? '\n\n' : ''}${text}` });
        } else if (tab.kind === 'rich') {
          store.patchActive({ html: `${tab.html}${text.split(/\n{2,}/).map((p) => `<p>${p.replace(/</g, '&lt;')}</p>`).join('')}` });
        } else {
          throw new Error('当前文档类型不支持追加');
        }
        await store.saveActive(true);
        return result(true, { name: tab.name, appended: text.length });
      }

      case 'doc.replace': {
        const tab = activeTabOf(store);
        if (!tab) throw new Error('没有打开的文档');
        const text = String(params.text ?? params.content ?? '');
        if (tab.kind === 'rich') store.patchActive({ html: text });
        else store.patchActive({ text });
        await store.saveActive(true);
        return result(true, { name: tab.name });
      }

      case 'board.get':
        return result(true, { file: store.boardFile, board: store.board });

      case 'board.set': {
        if (!params.board) throw new Error('缺少 board');
        store.setBoard(params.board as never);
        await store.saveBoard(true);
        return result(true, { nodes: store.board.nodes.length });
      }

      case 'board.add-card': {
        const id = store.addNode({
          kind: 'card',
          x: Number(params.x ?? 240),
          y: Number(params.y ?? 240),
          w: Number(params.w ?? 250),
          h: Number(params.h ?? 140),
          title: String(params.title ?? 'Agent 方片'),
          body: String(params.body ?? ''),
          tone: (params.tone as Tone) ?? 'ink',
        });
        await store.saveBoard(true);
        return result(true, { id, node: useStore.getState().board.nodes.find((n) => n.id === id) });
      }

      case 'board.add-image':
      case 'board.add-rect': {
        const id = store.addNode({
          kind: 'image',
          x: Number(params.x ?? 240),
          y: Number(params.y ?? 240),
          w: Number(params.w ?? 420),
          h: Number(params.h ?? 280),
          title: String(params.title ?? '图片框'),
          image: params.image ? String(params.image) : undefined,
          tone: 'clay',
        });
        await store.saveBoard(true);
        return result(true, { id });
      }

      case 'board.add-circle': {
        const id = store.addNode({
          kind: 'annotation-circle',
          x: Number(params.x ?? 480),
          y: Number(params.y ?? 240),
          w: Number(params.w ?? 140),
          h: Number(params.h ?? 140),
          title: String(params.title ?? '标注'),
          tone: (params.tone as Tone) ?? 'clay',
        });
        await store.saveBoard(true);
        return result(true, { id });
      }

      case 'board.connect': {
        const id = store.connectNodes(
          String(params.from ?? ''),
          String(params.to ?? ''),
          params.label ? String(params.label) : '',
        );
        if (!id) throw new Error('连接失败，请检查节点 id');
        await store.saveBoard(true);
        return result(true, { id });
      }

      case 'board.clear': {
        store.setBoard({ ...store.board, nodes: [], edges: [] });
        await store.saveBoard(true);
        return result(true, { cleared: true });
      }

      case 'board.layout': {
        store.autoLayout();
        await store.saveBoard(true);
        return result(true, { nodes: store.board.nodes.length });
      }

      case 'board.export': {
        const style = (params.style as RenderStyle) ?? 'editorial';
        const dataUrl = await boardToPng(store.board, { style, title: store.board.name, scale: 2, padding: 120 });
        const base64 = dataUrl.split(',')[1];
        const path = await saveBinary(`${store.board.name || '画布'}.png`, base64);
        return result(true, { path });
      }

      case 'ai.image': {
        if (params.prompt) useStore.setState({ imagePrompt: String(params.prompt) });
        if (params.style) useStore.setState({ imageStyle: params.style as RenderStyle });
        if (params.useBoard === false) useStore.setState({ imageSource: 'poster' });
        if (params.useBoard === true) useStore.setState({ imageSource: 'board' });
        await store.runImage();
        const image = useStore.getState().aiImage;
        if (!image) throw new Error('生成失败');
        const base64 = image.dataUrl.split(',')[1];
        const path = await saveBinary(`AI-${Date.now()}.png`, base64);
        return result(true, { provider: image.provider, note: image.note, path });
      }

      case 'ai.copy': {
        const state = useStore.getState();
        const req = {
          topic: String(params.topic ?? state.copyTopic),
          channel: (params.channel as never) ?? state.copyChannel,
          tone: (params.tone as never) ?? state.copyTone,
          length: (params.length as never) ?? state.copyLength,
          extra: params.extra ? String(params.extra) : undefined,
        };
        const copy = await generateCopy(req, state.settings);
        useStore.setState({ aiCopy: copy.text, aiNote: copy.provider === 'remote' ? '远程模型' : '本地文案引擎', aiTab: 'copy' });
        return result(true, { text: copy.text, provider: copy.provider });
      }

      case 'ai.video':
      case 'ai.animate': {
        if (params.title) useStore.setState({ videoTitle: String(params.title) });
        const mode = action === 'ai.animate' || params.mode === 'animation' ? 'animation' : 'video';
        await store.runMovie(mode);
        const video = useStore.getState().aiVideo;
        if (!video) throw new Error('生成失败');
        return result(true, { name: video.name, duration: video.duration, mode, path: `exports/${video.name}` });
      }

      case 'export.pdf':
      case 'export.docx': {
        const tab = activeTabOf(store);
        if (!tab) throw new Error('没有打开的文档');
        const target = action === 'export.pdf' ? 'pdf' : 'docx';
        const serialized = target === 'pdf' ? await buildPdf(tab) : await buildDocx(tab);
        const path = await saveBinary(serialized.name, serialized.base64!);
        return result(true, { path, name: serialized.name });
      }

      case 'export.image': {
        const dataUrl = await boardToPng(store.board, { style: 'editorial', title: store.board.name, scale: 2, padding: 120 });
        const path = await saveBinary(`${store.board.name || '画布'}.png`, dataUrl.split(',')[1]);
        return result(true, { path });
      }

      case 'ui.view': {
        const view = String(params.view ?? 'doc');
        if (view === 'doc' || view === 'board' || view === 'split') store.setView(view);
        return result(true, { view });
      }

      case 'ui.toast': {
        store.toast(String(params.text ?? '来自 Agent 的消息'), 'ok');
        return result(true, { shown: true });
      }

      default:
        throw new Error(`未知命令：${action}`);
    }
  } catch (error) {
    return result(false, undefined, (error as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/* WebSocket 桥接                                                      */
/* ------------------------------------------------------------------ */

let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;

export function connectAgentBridge(): () => void {
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    const info = useStore.getState().info;
    // 浏览器演示模式不接入桌面桥接，避免抢占 CLI 指令
    if (!info?.isElectron) {
      useStore.getState().setBridgeOnline(false);
      return;
    }
    const url = info?.bridge?.ws ?? 'ws://127.0.0.1:17866/agent';
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }

    socket.onopen = () => {
      retries = 0;
      useStore.getState().setBridgeOnline(true);
      useStore.getState().addLog({ action: 'bridge.connected', detail: url, ok: true, source: 'app' });
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'hello') {
          useStore.getState().setBridgeOnline(true);
        }
        if (msg.type === 'event' && msg.event?.type === 'files:changed') {
          await useStore.getState().refreshFiles();
        }
        if (msg.type === 'command') {
          useStore.getState().addLog({
            action: msg.action,
            detail: msg.action.startsWith('board.') ? '画布指令' : 'CLI 指令',
            ok: true,
            source: 'cli',
          });
          const res = await executeCommand(msg.action, msg.params ?? {});
          socket?.send(JSON.stringify({ type: 'result', id: msg.id, ...res }));
        }
      } catch { /* ignore */ }
    };

    socket.onclose = () => {
      useStore.getState().setBridgeOnline(false);
      if (!disposed) {
        retries += 1;
        const delay = Math.min(12000, 1000 + retries * 800);
        retryTimer = setTimeout(connect, delay);
      }
    };
    socket.onerror = () => { /* onclose 会处理 */ };
  };

  connect();
  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}

/* ------------------------------------------------------------------ */
/* 浏览器内的 CLI 模拟                                                  */
/* ------------------------------------------------------------------ */

export async function runLocalCommand(line: string): Promise<string> {
  const tokens = tokenize(line.trim().replace(/^oa\s+/, ''));
  if (!tokens.length) throw new Error('请输入命令，例如 oa status');
  const [command, ...rest] = tokens;
  const flags = parseFlags(rest);
  const positional = rest.filter((t) => !t.startsWith('--'));

  const num = (key: string, fallback: number) => Number(flags[key] ?? fallback);

  if (command === 'status') return JSON.stringify(await executeCommand('status'), null, 2);
  if (command === 'list') return JSON.stringify((await executeCommand('file.list')).data, null, 2);
  if (command === 'create') {
    return JSON.stringify(await executeCommand('file.create', {
      name: positional[0],
      ext: flags.format,
      content: flags.content,
    }), null, 2);
  }
  if (command === 'read') return JSON.stringify(await executeCommand('file.read', { name: positional[0] }), null, 2);
  if (command === 'open') return JSON.stringify(await executeCommand('file.open', { name: positional[0] }), null, 2);
  if (command === 'append') return JSON.stringify(await executeCommand('doc.append', { text: flags.content ?? positional.join(' ') }), null, 2);

  if (command === 'canvas' || command === 'board') {
    const sub = positional[0] ?? 'list';
    if (sub === 'add-card') {
      return JSON.stringify(await executeCommand('board.add-card', {
        title: flags.title ?? 'Agent 方片',
        body: flags.body ?? '',
        x: num('x', 320), y: num('y', 240), w: num('w', 250), h: num('h', 140),
      }), null, 2);
    }
    if (sub === 'add-rect' || sub === 'add-image') {
      return JSON.stringify(await executeCommand('board.add-rect', {
        x: num('x', 320), y: num('y', 240), w: num('w', 420), h: num('h', 280), title: flags.title,
      }), null, 2);
    }
    if (sub === 'connect') {
      return JSON.stringify(await executeCommand('board.connect', {
        from: flags.from ?? positional[1], to: flags.to ?? positional[2], label: flags.label,
      }), null, 2);
    }
    if (sub === 'clear') return JSON.stringify(await executeCommand('board.clear'), null, 2);
    if (sub === 'export') return JSON.stringify(await executeCommand('board.export', { style: flags.style }), null, 2);
    return JSON.stringify(await executeCommand('board.get'), null, 2);
  }

  if (command === 'ai') {
    const sub = positional[0];
    if (sub === 'image') {
      return JSON.stringify(await executeCommand('ai.image', { prompt: flags.prompt, style: flags.style }), null, 2);
    }
    if (sub === 'copy') {
      const res = await executeCommand('ai.copy', { topic: flags.topic ?? positional.slice(1).join(' '), channel: flags.channel, tone: flags.tone });
      return res.data ? (res.data as { text: string }).text : JSON.stringify(res, null, 2);
    }
    if (sub === 'video' || sub === 'animate') {
      return JSON.stringify(await executeCommand(sub === 'video' ? 'ai.video' : 'ai.animate', { title: flags.title }), null, 2);
    }
  }

  if (command === 'export') {
    const format = flags.format ?? positional[0] ?? 'pdf';
    return JSON.stringify(await executeCommand(format === 'docx' ? 'export.docx' : 'export.pdf'), null, 2);
  }

  throw new Error(`未识别的本地命令：${command}`);
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) {
      if (current) { out.push(current); current = ''; }
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i += 1; } else flags[key] = 'true';
    }
  }
  return flags;
}

export { base64FromBytes, htmlToText, isBoardFile, nanoid };
export type { BoardNode };
