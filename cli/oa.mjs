#!/usr/bin/env node
/**
 * 墨枢 Office Agent · 本地命令行
 * 零依赖，Node 18+。
 *
 * 在线：通过 127.0.0.1 桥接驱动桌面应用（画布 / AI / 导出 / 打开文件）
 * 离线：直接读写工作区文本文件，应用启动后自动同步
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const APPDATA = process.env.APPDATA || path.join(os.homedir(), '.config');
const BRIDGE_FILE = path.join(APPDATA, 'MoshuOfficeAgent', 'bridge.json');
const DEFAULT_WORKSPACE = path.join(os.homedir(), 'Documents', 'MoshuWorkspace');
const TEXT_EXT = new Set([
  'md', 'markdown', 'txt', 'csv', 'tsv', 'html', 'htm', 'json', 'yaml', 'yml', 'xml',
  'toml', 'ini', 'log', 'tex', 'sql', 'js', 'ts', 'py', 'css', 'rtf',
]);
const BINARY_EXT = new Set(['docx', 'doc', 'pdf', 'xlsx', 'xls', 'pptx', 'odt', 'ods', 'odp']);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = (text) => paint('2', text);
const bold = (text) => paint('1', text);
const red = (text) => paint('31', text);
const green = (text) => paint('32', text);
const amber = (text) => paint('33', text);
const cyan = (text) => paint('36', text);

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const raw = arg.slice(2);
      const eq = raw.indexOf('=');
      if (eq >= 0) {
        flags[raw.slice(0, eq)] = raw.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[raw] = next;
          i += 1;
        } else {
          flags[raw] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function fallbackWorkspace() {
  if (process.env.OA_WORKSPACE) return process.env.OA_WORKSPACE;
  return DEFAULT_WORKSPACE;
}

async function discover() {
  const bridge = await readJson(BRIDGE_FILE);
  let workspace = bridge?.workspace || fallbackWorkspace();
  let port = Number(process.env.OA_PORT || bridge?.port || 17866);

  if (!bridge) {
    const local = await readJson(path.join(fallbackWorkspace(), '.moshu', 'bridge.json')).catch(() => null);
    if (local?.port) {
      port = Number(local.port);
      workspace = local.workspace || workspace;
    }
  }
  if (process.env.OA_PORT) port = Number(process.env.OA_PORT);
  return { port, workspace, bridge };
}

async function ping(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(900) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function findBridge(workspace) {
  const ports = [Number(process.env.OA_PORT || 0), 17866, 17867, 17868, 17869, 17870].filter((p, i, arr) => p && arr.indexOf(p) === i);
  const saved = await discover();
  if (saved.port && !ports.includes(saved.port)) ports.unshift(saved.port);
  for (const port of ports) {
    const info = await ping(port);
    if (info?.ok) return { port, info };
  }
  return null;
}

async function command(port, action, params = {}) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    throw new Error(`无法连接桥接服务（${error.message}）。请先启动应用：npm run app`);
  }
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`桥接返回了非 JSON 响应（HTTP ${res.status}）`);
  if (!json.ok) throw new Error(json.error || `命令失败（HTTP ${res.status}）`);
  return json.data;
}

function needBridge(bridge, what) {
  if (!bridge) {
    throw new Error(`${what} 需要桌面端在线。请先启动应用：npm run app（CLI 仍可离线读写 md / txt / csv 等文本文件）`);
  }
}

async function listLocal(workspace) {
  const entries = await fs.readdir(workspace, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isDirectory()) continue;
    const full = path.join(workspace, entry.name);
    const stat = await fs.stat(full);
    files.push({ name: entry.name, ext: path.extname(entry.name).slice(1).toLowerCase(), size: stat.size, mtime: stat.mtimeMs });
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(ms) {
  return new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function printFiles(files) {
  if (!files.length) {
    console.log(dim('（工作区为空）'));
    return;
  }
  const width = Math.min(48, Math.max(...files.map((f) => [...f.name].length), 8));
  for (const file of files) {
    const name = file.name.length > width ? `${file.name.slice(0, width - 1)}…` : file.name;
    console.log(`  ${cyan(name.padEnd(width))}  ${dim(formatSize(file.size).padStart(9))}  ${dim(formatTime(file.mtime))}`);
  }
  console.log(dim(`\n${files.length} 个文件`));
}

async function safeName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_');
}

async function main() {
  const argv = process.argv.slice(2);
  const { flags, positional } = parseArgs(argv);
  const jsonMode = !!flags.json || !!flags.JSON;
  const { workspace: wsDefault } = await discover();
  const bridge = await findBridge(wsDefault);
  const workspace = bridge?.info?.workspace || wsDefault;
  const [commandName, ...rest] = positional;

  if (!commandName || commandName === 'help' || flags.help) {
    printHelp();
    return;
  }

  if (commandName === 'status') {
    const files = bridge ? await command(bridge.port, 'file.list') : await listLocal(workspace);
    const state = bridge ? await command(bridge.port, 'status').catch(() => null) : null;
    if (jsonMode) {
      console.log(JSON.stringify({
        online: !!bridge,
        port: bridge?.port ?? null,
        workspace,
        version: bridge?.info?.version ?? null,
        files: files.length,
        board: state?.board ?? null,
      }, null, 2));
      return;
    }
    console.log('');
    console.log(`  ${bold('墨枢 Office Agent')}  ${dim(bridge?.info?.version ?? '离线')}`);
    console.log(`  ${dim('状态')}    ${bridge ? green('● 在线') : amber('○ 离线')}${bridge ? dim(`  http://127.0.0.1:${bridge.port}`) : ''}`);
    console.log(`  ${dim('工作区')}  ${workspace}`);
    console.log(`  ${dim('文件')}    ${files.length}`);
    if (state?.board) console.log(`  ${dim('画布')}    ${state.board.nodes} 个节点 / ${state.board.edges} 条连线`);
    if (!bridge) console.log(dim('\n  提示：启动桌面端（npm run app）后，画布 / AI / 导出命令可用。'));
    console.log('');
    return;
  }

  if (commandName === 'list' || commandName === 'ls') {
    const files = bridge ? await command(bridge.port, 'file.list') : await listLocal(workspace);
    if (jsonMode) { console.log(JSON.stringify(files, null, 2)); return; }
    printFiles(files);
    return;
  }

  if (commandName === 'create') {
    const name = rest[0];
    if (!name) throw new Error('用法：oa create <文件名> [--content 文本] [--format md] [--open]');
    const ext = String(flags.format || path.extname(name).slice(1) || 'md').toLowerCase();
    let finalName = name;
    if (!path.extname(finalName)) finalName += `.${ext}`;
    const content = flags.content != null ? String(flags.content) : (flags.file ? await fs.readFile(String(flags.file), 'utf8') : '');

    if (bridge) {
      const data = await command(bridge.port, 'file.create', { name: finalName, ext, content });
      if (flags.open) await command(bridge.port, 'file.open', { name: data.name });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`${green('✓')} 已创建 ${cyan(data.name)}${data.name ? dim(`  → ${path.join(workspace, data.name)}`) : ''}`);
      return;
    }

    if (BINARY_EXT.has(ext)) {
      throw new Error(`离线模式下无法生成 .${ext} 文件。请先启动应用，或改用 md / txt / csv / json。`);
    }
    const full = path.join(workspace, await safeName(finalName));
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.access(full).then(() => { throw new Error(`文件已存在：${finalName}`); }).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
    await fs.writeFile(full, content || (ext === 'md' ? `# ${finalName.replace(/\.[^.]+$/, '')}\n\n` : ''), 'utf8');
    if (jsonMode) { console.log(JSON.stringify({ name: finalName, path: full }, null, 2)); return; }
    console.log(`${green('✓')} 已创建 ${cyan(finalName)} ${dim(`(离线)  ${full}`)}`);
    return;
  }

  if (commandName === 'read') {
    const name = rest[0];
    if (!name) throw new Error('用法：oa read <文件名>');
    if (bridge) {
      const data = await command(bridge.port, 'file.read', { name });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      if (data.text != null) { console.log(data.text); return; }
      console.log(dim(`[二进制文件 ${formatSize(Buffer.from(data.base64 || '', 'base64').length)}] 请在应用中打开查看。`));
      return;
    }
    const ext = path.extname(name).slice(1).toLowerCase();
    if (BINARY_EXT.has(ext)) throw new Error(`离线模式无法解析 .${ext}，请启动应用后读取。`);
    const text = await fs.readFile(path.join(workspace, await safeName(name)), 'utf8');
    if (jsonMode) { console.log(JSON.stringify({ name, text }, null, 2)); return; }
    console.log(text);
    return;
  }

  if (commandName === 'write' || commandName === 'append') {
    const name = rest[0];
    if (!name) throw new Error(`用法：oa ${commandName} <文件名> --content 文本`);
    const content = flags.content != null ? String(flags.content) : (flags.file ? await fs.readFile(String(flags.file), 'utf8') : '');
    if (!content && !flags.file) throw new Error('缺少 --content 或 --file');
    if (bridge) {
      if (commandName === 'append') {
        await command(bridge.port, 'file.open', { name });
        const data = await command(bridge.port, 'doc.append', { text: content });
        console.log(`${green('✓')} 已追加 ${cyan(name)} ${dim(`(${data.appended} 字符)`)}`);
      } else {
        await command(bridge.port, 'file.write', { name, content });
        console.log(`${green('✓')} 已写入 ${cyan(name)}`);
      }
      return;
    }
    const full = path.join(workspace, await safeName(name));
    if (commandName === 'append') {
      await fs.appendFile(full, `\n${content}`, 'utf8');
    } else {
      await fs.writeFile(full, content, 'utf8');
    }
    console.log(`${green('✓')} 已${commandName === 'append' ? '追加' : '写入'} ${cyan(name)} ${dim('(离线)')}`);
    return;
  }

  if (commandName === 'open') {
    const name = rest[0];
    if (!name) throw new Error('用法：oa open <文件名>');
    needBridge(bridge, '打开文件');
    await command(bridge.port, 'file.open', { name });
    console.log(`${green('✓')} 已在应用中打开 ${cyan(name)}`);
    return;
  }

  if (commandName === 'rm' || commandName === 'delete') {
    const name = rest[0];
    if (!name) throw new Error('用法：oa rm <文件名>');
    if (bridge) {
      await command(bridge.port, 'file.delete', { name });
    } else {
      await fs.rm(path.join(workspace, await safeName(name)), { force: true });
    }
    console.log(`${green('✓')} 已删除 ${cyan(name)}`);
    return;
  }

  if (commandName === 'canvas' || commandName === 'board') {
    needBridge(bridge, '画布操作');
    const sub = rest[0] || 'get';
    const x = Number(flags.x ?? 240);
    const y = Number(flags.y ?? 240);

    if (sub === 'add-card' || sub === 'card') {
      const data = await command(bridge.port, 'board.add-card', {
        title: flags.title ?? (rest.slice(1).join(' ') || 'Agent 方片'),
        body: flags.body ?? '',
        x, y,
        w: Number(flags.w ?? 250),
        h: Number(flags.h ?? 140),
        tone: flags.tone,
      });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`${green('✓')} 已添加方片 ${cyan(data.id)}  ${dim(JSON.stringify(data.node?.title ?? ''))}`);
      return;
    }
    if (sub === 'add-rect' || sub === 'add-image' || sub === 'rect') {
      const data = await command(bridge.port, 'board.add-rect', {
        title: flags.title ?? '图片框',
        x, y,
        w: Number(flags.w ?? 420),
        h: Number(flags.h ?? 280),
        image: flags.image,
      });
      console.log(`${green('✓')} 已添加矩形图片框 ${cyan(data.id)}`);
      return;
    }
    if (sub === 'add-circle' || sub === 'circle') {
      const data = await command(bridge.port, 'board.add-circle', {
        title: flags.title ?? '标注',
        x, y,
        w: Number(flags.w ?? 140),
        h: Number(flags.h ?? 140),
      });
      console.log(`${green('✓')} 已添加标注圆 ${cyan(data.id)}`);
      return;
    }
    if (sub === 'connect' || sub === 'link') {
      const from = flags.from ?? rest[1];
      const to = flags.to ?? rest[2];
      if (!from || !to) throw new Error('用法：oa canvas connect --from <id> --to <id> [--label 文案]');
      const data = await command(bridge.port, 'board.connect', { from, to, label: flags.label });
      console.log(`${green('✓')} 已连接 ${cyan(from)} → ${cyan(to)}  ${dim(data.id)}`);
      return;
    }
    if (sub === 'clear') {
      await command(bridge.port, 'board.clear');
      console.log(`${green('✓')} 画布已清空`);
      return;
    }
    if (sub === 'layout') {
      await command(bridge.port, 'board.layout');
      console.log(`${green('✓')} 已整理画布`);
      return;
    }
    if (sub === 'export') {
      const data = await command(bridge.port, 'board.export', { style: flags.style ?? 'editorial' });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`${green('✓')} 已导出 ${cyan(data.path)}`);
      return;
    }
    if (sub === 'set') {
      if (!flags.file) throw new Error('用法：oa canvas set --file <board.json>');
      const raw = await fs.readFile(String(flags.file), 'utf8');
      const board = JSON.parse(raw);
      if (!Array.isArray(board.nodes)) throw new Error('画布 JSON 缺少 nodes 数组');
      const data = await command(bridge.port, 'board.set', { board });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`${green('✓')} 已载入画布 ${dim(`(${board.nodes.length} 节点)`)}`);
      return;
    }
    if (sub === 'list' || sub === 'get') {
      const data = await command(bridge.port, 'board.get');
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`  ${bold(data.board.name)}  ${dim(`${data.board.nodes.length} 节点 / ${data.board.edges.length} 连线`)}`);
      for (const node of data.board.nodes) {
        console.log(`  ${cyan(node.id.padEnd(8))} ${dim(node.kind.padEnd(18))} ${node.title || ''}`);
      }
      return;
    }
    throw new Error(`未知画布命令：${sub}`);
  }

  if (commandName === 'ai') {
    needBridge(bridge, 'AI 生成');
    const sub = rest[0];
    if (sub === 'image' || sub === 'img') {
      const data = await command(bridge.port, 'ai.image', {
        prompt: flags.prompt,
        style: flags.style,
        useBoard: flags.source === 'poster' ? false : true,
      });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`${green('✓')} 图片已生成 ${dim(`(${data.provider})`)}`);
      console.log(`  ${cyan(data.path)}`);
      if (data.note) console.log(dim(`  注：${data.note}`));
      return;
    }
    if (sub === 'video' || sub === 'animate') {
      const action = sub === 'animate' ? 'ai.animate' : 'ai.video';
      const data = await command(bridge.port, action, { title: flags.title, mode: flags.mode });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(`${green('✓')} 成片已完成 ${dim(`${data.duration?.toFixed?.(1) ?? data.duration}s`)}`);
      console.log(`  ${cyan(data.path || data.name)}`);
      return;
    }
    if (sub === 'copy' || sub === 'text') {
      const topic = flags.topic || rest.slice(1).join(' ');
      if (!topic) throw new Error('用法：oa ai copy --topic "主题" [--channel xiaohongshu] [--tone 克制]');
      const data = await command(bridge.port, 'ai.copy', {
        topic,
        channel: flags.channel,
        tone: flags.tone,
        length: flags.length,
      });
      if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
      console.log(data.text);
      console.log(dim(`\n— ${data.provider === 'remote' ? '远程模型' : '本地文案引擎'}`));
      return;
    }
    throw new Error(`未知 AI 命令：${sub ?? '(空)'}。可用：image / video / animate / copy`);
  }

  if (commandName === 'export') {
    needBridge(bridge, '导出');
    const format = (rest[0] || flags.format || 'pdf').toLowerCase();
    const action = format === 'docx' ? 'export.docx' : format === 'png' ? 'export.image' : 'export.pdf';
    if (flags.name) await command(bridge.port, 'file.open', { name: String(flags.name) });
    const data = await command(bridge.port, action);
    if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
    console.log(`${green('✓')} 已导出 ${cyan(data.path)}`);
    return;
  }

  if (commandName === 'doc') {
    const sub = rest[0] || 'info';
    if (sub !== 'info') throw new Error(`未知文档命令：${sub}`);
    needBridge(bridge, '文档信息');
    const data = await command(bridge.port, 'doc.info');
    if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
    console.log(`  ${bold(data.name)}  ${dim(`${data.chars} 字符 / ${data.words} 词 / ${data.lines} 行`)}`);
    if (data.outline?.length) {
      console.log(dim('  大纲'));
      data.outline.forEach((line) => console.log(`  · ${line}`));
    }
    return;
  }

  if (commandName === 'view') {
    needBridge(bridge, '切换视图');
    const view = rest[0] || 'doc';
    await command(bridge.port, 'ui.view', { view });
    console.log(`${green('✓')} 已切换到 ${cyan(view)}`);
    return;
  }

  throw new Error(`未知命令：${commandName}。运行 oa help 查看全部命令。`);
}

function printHelp() {
  console.log(`
${bold('墨枢 Office Agent · CLI')}  ${dim('v1.0')}

${bold('用法')}  oa <命令> [参数] [--json]
${dim('提示')}  在项目目录下也可以直接使用 ${cyan('oa.cmd')}，例如 ${cyan('oa status')}。

${bold('工作区')}
  oa status                       查看桥接状态、工作区与画布
  oa list [--json]                列出工作区文件
  oa create <名称> [--content 文本] [--format md] [--open]
  oa read <名称>                  读取文件（在线支持 docx/pdf 等）
  oa write <名称> --content 文本
  oa append <名称> --content 文本
  oa open <名称>                  在应用中打开
  oa rm <名称>                    删除文件

${bold('画布')}
  oa canvas list                  列出方片
  oa canvas add-card --title 需求 --body 说明 --x 320 --y 220 [--tone clay]
  oa canvas add-rect --x 200 --y 400 --w 420 --h 280
  oa canvas add-circle --x 480 --y 240 --w 140 --h 140 --title 标注
  oa canvas connect --from <id> --to <id> [--label 依赖]
  oa canvas layout                自动整理
  oa canvas set --file board.json 用 JSON 整块替换画布
  oa canvas export --style blueprint
  oa canvas clear
  oa doc info [--json]            当前文档字数 / 大纲

${bold('AI')}
  oa ai image [--style blueprint|editorial|flat|sketch|neon|plain] [--prompt 描述]
  oa ai video [--title 片名] [--mode video|animation]
  oa ai animate [--title 片名]
  oa ai copy --topic "主题" [--channel xiaohongshu|wechat|email|speech|summary|product] [--tone 克制]

${bold('导出')}
  oa export pdf [--name 文档.md]
  oa export docx
  oa view doc|board|split

${bold('说明')}
  · 画布 / AI / 导出命令需要桌面端在线：${cyan('npm run app')}
  · 离线时仍可读写 md / txt / csv / json 等文本文件
  · 加 ${cyan('--json')} 输出结构化结果，便于 Agent 解析
`);
}

main().catch((error) => {
  console.error(`${red('✗')} ${error.message}`);
  process.exitCode = 1;
});
