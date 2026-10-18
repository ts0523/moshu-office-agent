import { app, BrowserWindow, ipcMain, shell, dialog, Menu, net } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env.OA_DEV === '1';

const WORKSPACE = process.env.OA_WORKSPACE || path.join(app.getPath('documents'), 'MoshuWorkspace');
const EXPORTS = path.join(WORKSPACE, 'exports');
const TMP = path.join(WORKSPACE, '.moshu');
const SETTINGS_DIR = path.join(app.getPath('appData'), 'MoshuOfficeAgent');
const BRIDGE_FILE = path.join(SETTINGS_DIR, 'bridge.json');

let mainWindow = null;
let bridgePort = 17866;
let wss = null;
let watcher = null;
let broadcastTimer = null;
const pending = new Map();

app.setName('墨枢 Office Agent');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

/* ------------------------------------------------------------------ */
/* 工作区                                                              */
/* ------------------------------------------------------------------ */

const SEED_FILES = {
  '欢迎使用墨枢.md': `# 欢迎使用墨枢

> 一份文档、一块画布、一个会动手的 Agent。

墨枢把「写作」与「思考」放在同一张桌面上：左边是文件，中间是纸面，右边是 Agent。所有能力都可以被命令行驱动。

## 三件事，先试试

1. 按 \`Ctrl + K\` 打开命令面板，输入「路线图」直接新建一块画布。
2. 在画布上按住 \`R\` 拖出一个矩形，松手即成为图片框；按住 \`O\` 随手画圈，会自动收敛成标注圆。
3. 从任意方片的边缘小圆点拖出连线，落到另一张方片上，一张结构图就出现了。

## 支持的手感

- **格式**：docx / pdf / xlsx / pptx / md / csv / html / rtf / odt / json / yaml / tex … 20 余种，读写一体。
- **画笔**：矩形图片框、手绘标注圆、方片连线、自由文本。
- **AI**：示意图一键出图、分镜动画、短视频导出、文案撰写。
- **Agent**：本地 CLI 直接驱动界面，无需模拟鼠标。

\`\`\`bash
oa create "周报.md" --content "# 本周进展" --open
oa canvas add-card --title "需求" --body "多格式文档" --x 320 --y 220
oa canvas connect --from <id> --to <id>
oa ai image --style blueprint
\`\`\`

> 提示：把鼠标悬停在底部工具栏上，滚动滚轮可以调整工具栏大小。

愿你写得少一点，想得多一点。
`,
  '产品路线图.board.json': JSON.stringify(
    {
      id: 'board-seed',
      name: '产品路线图',
      background: 'dots',
      nodes: [
        {
          id: 'n1',
          kind: 'card',
          x: 120,
          y: 220,
          w: 205,
          h: 122,
          title: '文档内核',
          body: '20+ 格式 · 读写一体\nDOCX / PDF / XLSX / PPTX',
          tone: 'ink',
        },
        {
          id: 'n2',
          kind: 'card',
          x: 392,
          y: 118,
          w: 218,
          h: 122,
          title: '方片画布',
          body: '拖拽连接点 · 自动成图\n矩形图片 / 标注圆',
          tone: 'clay',
        },
        {
          id: 'n3',
          kind: 'card',
          x: 392,
          y: 330,
          w: 218,
          h: 122,
          title: 'AI 生成',
          body: '示意图出图 · 分镜动画\n短视频 · 文案',
          tone: 'moss',
        },
        {
          id: 'n4',
          kind: 'card',
          x: 682,
          y: 222,
          w: 205,
          h: 122,
          title: 'Agent 桥接',
          body: 'CLI / HTTP / WS\n可被脚本编排的桌面应用',
          tone: 'ink',
        },
        {
          id: 'n5',
          kind: 'annotation-circle',
          x: 792,
          y: 392,
          w: 126,
          h: 126,
          title: '一键出片',
          body: '',
          tone: 'clay',
        },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'n1', port: 'right' }, to: { nodeId: 'n2', port: 'left' }, label: '富文本' },
        { id: 'e2', from: { nodeId: 'n1', port: 'right' }, to: { nodeId: 'n3', port: 'left' }, label: '上下文' },
        { id: 'e3', from: { nodeId: 'n2', port: 'right' }, to: { nodeId: 'n4', port: 'left' }, label: '画布指令' },
        { id: 'e4', from: { nodeId: 'n3', port: 'right' }, to: { nodeId: 'n4', port: 'left' }, label: '生成结果' },
        { id: 'e5', from: { nodeId: 'n4', port: 'bottom' }, to: { nodeId: 'n5', port: 'top' }, label: '' },
      ],
    },
    null,
    2,
  ),
  '内容排期.csv': `日期,渠道,主题,状态,负责人
2026-10-20,公众号,墨枢 1.0 发布,进行中,阿墨
2026-10-22,小红书,桌面 Agent 的三个瞬间,待审,小枢
2026-10-25,视频号,方片连线 30 秒上手,待拍,阿墨
2026-10-28,官网,多格式文档能力白皮书,已完成,设计组
`,
  '品牌文案.txt': `墨枢 · 让文档自己动起来

不是又一个编辑器。
是一张会思考的桌面：文档、画布、Agent，在同一个地方呼吸。
20 余种格式，打开即写；一张示意图，一键成片。
命令行能抵达的，鼠标都能抵达；鼠标没想到的，Agent 已经开始。
`,
  '会议纪要 · 设计评审.md': `# 设计评审 · 2026-10-17

**参与**：产品、设计、工程
**结论**：界面保持「纸与墨」的克制，能力藏在手势与命令里。

## 决议

- 底部工具栏常驻，滚轮可缩放，不做二级面板。
- 画布默认使用点阵底，方片四边留连接点，悬停才显形。
- AI 生成结果直接落回画布，不弹独立窗口。

## 待办

- [ ] 补齐 PPTX 导出的版式
- [ ] 标注圆增加箭头指向
- [x] CLI 支持 \`--json\` 输出
`,
};

async function ensureWorkspace() {
  await fs.mkdir(WORKSPACE, { recursive: true });
  await fs.mkdir(EXPORTS, { recursive: true });
  await fs.mkdir(TMP, { recursive: true });
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  const entries = await fs.readdir(WORKSPACE, { withFileTypes: true });
  const visibleFiles = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.'));
  if (visibleFiles.length === 0) {
    for (const [name, content] of Object.entries(SEED_FILES)) {
      const target = path.join(WORKSPACE, name);
      if (!existsSync(target)) await fs.writeFile(target, content, 'utf8');
    }
  }
}

function safePath(name) {
  const clean = String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_').trim();
  if (!clean) throw new Error('非法文件名');
  const full = path.resolve(WORKSPACE, clean);
  if (!full.startsWith(path.resolve(WORKSPACE))) throw new Error('路径越界');
  return full;
}

const EXT_MIME = {
  md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  html: 'text/html', htm: 'text/html', xml: 'application/xml', yaml: 'text/yaml',
  yml: 'text/yaml', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

async function listFiles() {
  const names = await fs.readdir(WORKSPACE, { withFileTypes: true });
  const out = [];
  for (const entry of names) {
    if (entry.name.startsWith('.') || entry.isDirectory()) continue;
    const full = path.join(WORKSPACE, entry.name);
    const stat = await fs.stat(full);
    out.push({
      name: entry.name,
      ext: path.extname(entry.name).slice(1).toLowerCase(),
      size: stat.size,
      mtime: stat.mtimeMs,
    });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/* ------------------------------------------------------------------ */
/* Agent 本地桥接 (HTTP + WebSocket)                                    */
/* ------------------------------------------------------------------ */

function sendToRenderer(action, params, timeout = 120000) {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) return reject(new Error('窗口未就绪'));
    if (!wss || wss.clients.size === 0) return reject(new Error('渲染进程未连接桥接'));
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`命令超时：${action}`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    const payload = JSON.stringify({ type: 'command', id, action, params: params || {} });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 40 * 1024 * 1024) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

function startBridge(port) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (url.pathname === '/api/ping') {
      return json(res, 200, {
        ok: true,
        app: '墨枢 Office Agent',
        version: app.getVersion(),
        workspace: WORKSPACE,
        renderer: !!(wss && wss.clients.size),
        pid: process.pid,
      });
    }

    if (url.pathname === '/api/files' && req.method === 'GET') {
      try { return json(res, 200, { ok: true, files: await listFiles() }); }
      catch (e) { return json(res, 500, { ok: false, error: e.message }); }
    }

    if (url.pathname === '/api/command' && req.method === 'POST') {
      try {
        const { action, params } = await readBody(req);
        if (!action) return json(res, 400, { ok: false, error: '缺少 action' });
        const data = await sendToRenderer(action, params);
        return json(res, 200, { ok: true, data });
      } catch (e) {
        return json(res, 503, { ok: false, error: e.message });
      }
    }

    return json(res, 404, { ok: false, error: 'not found' });
  });

  wss = new WebSocketServer({ server, path: '/agent' });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'hello', workspace: WORKSPACE }));
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'result' && pending.has(msg.id)) {
          const job = pending.get(msg.id);
          clearTimeout(job.timer);
          pending.delete(msg.id);
          if (msg.ok) job.resolve(msg.data);
          else job.reject(new Error(msg.error || '命令执行失败'));
        }
        if (msg.type === 'event') {
          broadcast(msg.event);
        }
      } catch { /* ignore */ }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 17886) {
      startBridge(port + 1);
    } else {
      console.error('[bridge]', err.message);
    }
  });

  server.listen(port, '127.0.0.1', async () => {
    bridgePort = port;
    await fs.writeFile(BRIDGE_FILE, JSON.stringify({
      port, workspace: WORKSPACE, pid: process.pid, startedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(TMP, 'bridge.json'), JSON.stringify({ port, workspace: WORKSPACE }), 'utf8');
    console.log(`[bridge] http://127.0.0.1:${port}  workspace=${WORKSPACE}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bridge:ready', { port, workspace: WORKSPACE });
    }
  });
}

function broadcast(event) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'event', event: event || { type: 'files:changed' } });
  for (const client of wss.clients) if (client.readyState === 1) client.send(payload);
}

/* ------------------------------------------------------------------ */
/* 窗口                                                               */
/* ------------------------------------------------------------------ */

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#f4f1ea',
    title: '墨枢 Office Agent',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (IS_DEV) {
    await mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message}  (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[renderer] did-fail-load', code, desc, url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] gone', details);
  });
  mainWindow.on('maximize', () => mainWindow.webContents.send('win:state', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:state', { maximized: false }));
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ------------------------------------------------------------------ */
/* IPC                                                                */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:info', () => ({
  isElectron: true,
  version: app.getVersion(),
  platform: process.platform,
  workspace: WORKSPACE,
  exports: EXPORTS,
  bridge: { port: bridgePort, http: `http://127.0.0.1:${bridgePort}`, ws: `ws://127.0.0.1:${bridgePort}/agent` },
  dev: IS_DEV,
}));

ipcMain.handle('win:action', (_e, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'close') mainWindow.close();
  return { maximized: mainWindow.isMaximized() };
});

ipcMain.handle('fs:list', async () => listFiles());

ipcMain.handle('fs:read', async (_e, name) => {
  const full = safePath(name);
  const ext = path.extname(name).slice(1).toLowerCase();
  const buffer = await fs.readFile(full);
  if (['docx', 'pdf', 'xlsx', 'xls', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) {
    return { base64: buffer.toString('base64'), ext };
  }
  return { text: buffer.toString('utf8'), ext };
});

ipcMain.handle('fs:write', async (_e, name, payload) => {
  const full = safePath(name);
  if (payload?.base64 != null) {
    await fs.writeFile(full, Buffer.from(payload.base64, 'base64'));
  } else {
    await fs.writeFile(full, String(payload?.text ?? ''), 'utf8');
  }
  const stat = await fs.stat(full);
  return { name, size: stat.size, mtime: stat.mtimeMs };
});

ipcMain.handle('fs:delete', async (_e, name) => {
  await fs.rm(safePath(name), { force: true });
  return true;
});

ipcMain.handle('fs:rename', async (_e, from, to) => {
  const src = safePath(from);
  const dst = safePath(to);
  await fs.rename(src, dst);
  return true;
});

ipcMain.handle('shell:reveal', async (_e, name) => {
  shell.showItemInFolder(name ? safePath(name) : WORKSPACE);
  return true;
});

ipcMain.handle('shell:openPath', async (_e, target) => {
  if (!target) return false;
  const full = path.isAbsolute(target) ? target : safePath(target);
  const err = await shell.openPath(full);
  return !err;
});

ipcMain.handle('dialog:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入文档',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '所有支持的文档', extensions: ['docx', 'pdf', 'xlsx', 'xls', 'pptx', 'odt', 'ods', 'odp', 'md', 'txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'rtf', 'tex', 'sql', 'ini', 'toml', 'log', 'js', 'ts', 'py', 'css'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  const out = [];
  for (const file of result.filePaths) {
    const buffer = await fs.readFile(file);
    out.push({ name: path.basename(file), base64: buffer.toString('base64'), size: buffer.length });
  }
  return out;
});

ipcMain.handle('dialog:save', async (_e, name, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出文件',
    defaultPath: path.join(EXPORTS, name || '导出文件'),
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, Buffer.from(payload.base64 || '', 'base64'));
  return result.filePath;
});

ipcMain.handle('workspace:save-export', async (_e, name, base64) => {
  const full = path.join(EXPORTS, String(name).replace(/[\\/:*?"<>|]/g, '_'));
  await fs.writeFile(full, Buffer.from(base64, 'base64'));
  return full;
});

ipcMain.handle('pdf:export', async (_e, html, name) => {
  const tempName = `export-${Date.now()}.html`;
  const tempPath = path.join(TMP, tempName);
  await fs.writeFile(tempPath, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: true },
  });
  try {
    await win.loadFile(tempPath);
    await new Promise((r) => setTimeout(r, 450));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
      preferCSSPageSize: true,
    });
    const fileName = String(name || '文档.pdf').replace(/\.pdf$/i, '') + '.pdf';
    const outPath = path.join(EXPORTS, fileName.replace(/[\\/:*?"<>|]/g, '_'));
    await fs.writeFile(outPath, pdf);
    return { path: outPath, base64: pdf.toString('base64'), name: path.basename(outPath) };
  } finally {
    win.destroy();
    fs.rm(tempPath, { force: true }).catch(() => {});
  }
});

ipcMain.handle('ai:proxy', async (_e, { url, headers, body, method = 'POST' }) => {
  const res = await net.fetch(url, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: res.ok, status: res.status, text, data };
});

ipcMain.handle('ai:download', async (_e, url) => {
  const res = await net.fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString('base64'), mime: res.headers.get('content-type') || 'image/png' };
});

ipcMain.handle('app:openWorkspace', () => shell.openPath(WORKSPACE));

ipcMain.handle('app:writeBoardFile', async (_e, name, data) => {
  const full = safePath(name);
  await fs.writeFile(full, JSON.stringify(data, null, 2), 'utf8');
  return true;
});

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

if (gotSingleInstanceLock) app.whenReady().then(async () => {
  await ensureWorkspace();
  startBridge(17866);

  try {
    watcher = watch(WORKSPACE, { recursive: false }, () => {
      clearTimeout(broadcastTimer);
      broadcastTimer = setTimeout(() => broadcast({ type: 'files:changed' }), 180);
    });
  } catch { /* ignore */ }

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { watcher?.close(); } catch { /* ignore */ }
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaught', err);
});
