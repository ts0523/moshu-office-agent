import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, X, FilePlus2, FileText, Table2, Presentation, FileType2, LayoutGrid, Columns2,
  Sparkles, Clapperboard, Type, Settings as SettingsIcon, HelpCircle, Download, Terminal,
  ArrowRight, Copy, Check, FolderOpen, Cpu, Palette, MousePointer2, CornerDownLeft, Command,
  Keyboard, ExternalLink, Wand2, BadgeCheck,
} from 'lucide-react';
import { useStore } from '../store';
import { FORMATS, WRITABLE_COUNT } from '../lib/formats';
import { openWorkspace } from '../lib/fsapi';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof FileText;
  run: () => void;
}

export function CommandPalette() {
  const open = useStore((s) => s.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const files = useStore((s) => s.files);
  const createFile = useStore((s) => s.createFile);
  const openFile = useStore((s) => s.openFile);
  const setView = useStore((s) => s.setView);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const setAiTab = useStore((s) => s.setAiTab);
  const runImage = useStore((s) => s.runImage);
  const runMovie = useStore((s) => s.runMovie);
  const runCopy = useStore((s) => s.runCopy);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const loadBoard = useStore((s) => s.loadBoardFile);
  const boardFile = useStore((s) => s.boardFile);

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const base: PaletteItem[] = [
      { id: 'new-md', label: '新建 Markdown 文档', hint: 'Ctrl N', group: '创建', icon: FileText, run: () => void createFile(`未命名-${Date.now().toString().slice(-4)}.md`, 'md') },
      { id: 'new-docx', label: '新建 Word 文档', group: '创建', icon: FileText, run: () => void createFile(`新文档-${Date.now().toString().slice(-4)}.docx`, 'docx') },
      { id: 'new-xlsx', label: '新建 Excel 工作簿', group: '创建', icon: Table2, run: () => void createFile(`新表格-${Date.now().toString().slice(-4)}.xlsx`, 'xlsx') },
      { id: 'new-pptx', label: '新建 PowerPoint', group: '创建', icon: Presentation, run: () => void createFile(`新演示-${Date.now().toString().slice(-4)}.pptx`, 'pptx') },
      { id: 'new-pdf', label: '新建 PDF 文档', group: '创建', icon: FileType2, run: () => void createFile(`新文档-${Date.now().toString().slice(-4)}.pdf`, 'pdf') },
      { id: 'new-board', label: '新建方片画布', group: '创建', icon: LayoutGrid, run: () => void createFile(`未命名画布-${Date.now().toString().slice(-4)}.board.json`, 'board.json') },
      { id: 'view-doc', label: '切换到文档', hint: 'Ctrl 1', group: '视图', icon: FileText, run: () => setView('doc') },
      { id: 'view-board', label: '切换到画布', hint: 'Ctrl 2', group: '视图', icon: LayoutGrid, run: () => { void loadBoard(boardFile); setView('board'); } },
      { id: 'view-split', label: '分栏：文档 + 画布', hint: 'Ctrl 3', group: '视图', icon: Columns2, run: () => setView('split') },
      { id: 'ai-image', label: '用当前画布生成图片', group: 'AI', icon: Sparkles, run: () => { setAiOpen(true); setAiTab('image'); void runImage(); } },
      { id: 'ai-video', label: '生成运镜短片', group: 'AI', icon: Clapperboard, run: () => { setAiOpen(true); setAiTab('movie'); void runMovie('video'); } },
      { id: 'ai-copy', label: '生成文案', group: 'AI', icon: Type, run: () => { setAiOpen(true); setAiTab('copy'); void runCopy(); } },
      { id: 'settings', label: '打开设置', group: '系统', icon: SettingsIcon, run: () => setSettingsOpen(true) },
      { id: 'help', label: '帮助与 CLI 参考', group: '系统', icon: HelpCircle, run: () => setHelpOpen(true) },
      { id: 'workspace', label: '在资源管理器中打开工作区', group: '系统', icon: FolderOpen, run: () => void openWorkspace() },
    ];
    const fileItems: PaletteItem[] = files.slice(0, 30).map((file) => ({
      id: `file-${file.name}`,
      label: file.name,
      hint: file.ext.toUpperCase(),
      group: '打开文件',
      icon: file.ext === 'xlsx' || file.ext === 'csv' ? Table2 : file.ext === 'pptx' ? Presentation : file.ext === 'pdf' ? FileType2 : file.name.endsWith('.board.json') ? LayoutGrid : FileText,
      run: () => {
        if (file.name.endsWith('.board.json')) { void loadBoard(file.name); setView('board'); }
        else { void openFile(file.name); setView('doc'); }
      },
    }));
    return [...base, ...fileItems];
  }, [files, boardFile, createFile, loadBoard, openFile, runCopy, runImage, runMovie, setAiOpen, setAiTab, setHelpOpen, setSettingsOpen, setView]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.label} ${item.group} ${item.hint ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setIndex(0), [query]);

  const runItem = (item: PaletteItem) => {
    setOpen(false);
    item.run();
  };

  if (!open) return null;

  return (
    <div className="overlay palette-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="palette">
        <div className="palette-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((i) => Math.min(filtered.length - 1, i + 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
              if (event.key === 'Enter' && filtered[index]) { event.preventDefault(); runItem(filtered[index]); }
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder="输入命令、文件名或操作…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-list">
          {filtered.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`palette-item ${i === index ? 'active' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => runItem(item)}
              >
                <span className={`palette-icon group-${item.group}`}><Icon size={14} /></span>
                <span className="palette-label">{item.label}</span>
                {item.hint && <span className="palette-hint">{item.hint}</span>}
                <span className="palette-group">{item.group}</span>
              </button>
            );
          })}
          {!filtered.length && <div className="palette-empty">没有匹配的命令</div>}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 运行</span>
          <span className="palette-brand">墨枢 · Command</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 设置                                                               */
/* ------------------------------------------------------------------ */

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const info = useStore((s) => s.info);
  const toast = useStore((s) => s.toast);
  const [showKey, setShowKey] = useState(false);

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="modal settings-modal">
        <div className="modal-head">
          <div>
            <span className="modal-eyebrow">PREFERENCES</span>
            <h3>设置</h3>
          </div>
          <button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>

        <div className="modal-body settings-body">
          <section className="settings-section">
            <div className="settings-title"><Palette size={14} />外观</div>
            <div className="settings-row">
              <div className="settings-label"><strong>主题</strong><span>纸与墨的明暗两套皮肤</span></div>
              <div className="segmented">
                <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => update({ theme: 'light' })}>纸白</button>
                <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => update({ theme: 'dark' })}>墨黑</button>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-label"><strong>底部工具栏</strong><span>也可以在工具栏上滚动滚轮</span></div>
              <div className="range-wrap">
                <input
                  type="range"
                  min={72}
                  max={135}
                  value={Math.round(settings.toolbarScale * 100)}
                  onChange={(event) => update({ toolbarScale: Number(event.target.value) / 100 })}
                />
                <span>{Math.round(settings.toolbarScale * 100)}%</span>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-label"><strong>自动保存</strong><span>停止输入 1.6 秒后写入工作区</span></div>
              <button className={`switch ${settings.autoSave ? 'on' : ''}`} onClick={() => update({ autoSave: !settings.autoSave })}><i /></button>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-title"><Cpu size={14} />AI 模型 <em>可选</em></div>
            <p className="settings-note">
              留空时使用本地渲染与本地文案引擎；填写 OpenAI 兼容接口后，文案与出图会优先走远程模型。密钥只保存在本机，由桌面进程代理请求。
            </p>
            <div className="field-grid">
              <label className="field">
                <span>Base URL</span>
                <input value={settings.aiBaseUrl} onChange={(event) => update({ aiBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
              </label>
              <label className="field">
                <span>API Key</span>
                <div className="field-password">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={settings.aiApiKey}
                    onChange={(event) => update({ aiApiKey: event.target.value })}
                    placeholder="sk-..."
                  />
                  <button onClick={() => setShowKey((v) => !v)}>{showKey ? '隐藏' : '显示'}</button>
                </div>
              </label>
              <label className="field">
                <span>文本模型</span>
                <input value={settings.aiTextModel} onChange={(event) => update({ aiTextModel: event.target.value })} placeholder="gpt-4o-mini" />
              </label>
              <label className="field">
                <span>图片模型</span>
                <input value={settings.aiImageModel} onChange={(event) => update({ aiImageModel: event.target.value })} placeholder="gpt-image-1（留空则本地渲染）" />
              </label>
            </div>
            <div className="settings-actions">
              <button
                className="btn ghost"
                onClick={() => toast(settings.aiApiKey ? '已保存到本机设置' : '当前使用本地引擎，无需密钥', 'ok')}
              >
                <BadgeCheck size={14} /> 验证配置
              </button>
              <span className="settings-status">
                {settings.aiApiKey ? '远程模型已启用' : '本地渲染模式'}
              </span>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-title"><FolderOpen size={14} />工作区</div>
            <div className="workspace-line">
              <code>{info?.workspace ?? '浏览器演示工作区'}</code>
              <button onClick={() => void openWorkspace()}><ExternalLink size={12} />打开</button>
            </div>
            <div className="settings-meta">
              <span>版本 {info?.version}</span>
              <span>{info?.isElectron ? '桌面端' : '浏览器演示'}</span>
              <span>{FORMATS.length} 种格式 / {WRITABLE_COUNT} 种可写</span>
            </div>
          </section>
        </div>

        <div className="modal-foot">
          <span className="modal-hint">设置实时生效并保存在本机</span>
          <button className="btn primary" onClick={() => setOpen(false)}>完成</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 帮助                                                               */
/* ------------------------------------------------------------------ */

const CLI_COMMANDS = [
  { cmd: 'oa status', desc: '查看桥接状态、工作区与当前画布' },
  { cmd: 'oa list --json', desc: '以 JSON 列出工作区文件' },
  { cmd: 'oa create "周报.md" --content "# 本周"', desc: '新建文档并写入内容' },
  { cmd: 'oa read "周报.md"', desc: '读取文本内容' },
  { cmd: 'oa open "周报.md"', desc: '在应用中打开文件' },
  { cmd: 'oa canvas add-card --title 需求 --x 320 --y 220', desc: '向画布添加方片' },
  { cmd: 'oa canvas add-rect --x 200 --y 400 --w 420 --h 280', desc: '添加矩形图片框' },
  { cmd: 'oa canvas connect --from n1 --to n2 --label 依赖', desc: '连接两个方片' },
  { cmd: 'oa ai image --style blueprint', desc: '把画布渲染成图片并保存' },
  { cmd: 'oa ai copy --topic "发布文案" --channel wechat', desc: '生成文案并返回文本' },
  { cmd: 'oa ai video --title "产品概览"', desc: '生成并保存短视频' },
  { cmd: 'oa export pdf', desc: '把当前文档导出为 PDF' },
];

export function HelpModal() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);
  const info = useStore((s) => s.info);
  const setView = useStore((s) => s.setView);
  const [copied, setCopied] = useState('');

  if (!open) return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="modal help-modal">
        <div className="modal-head">
          <div>
            <span className="modal-eyebrow">GUIDE · CLI · FORMATS</span>
            <h3>帮助与参考</h3>
          </div>
          <button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>

        <div className="modal-body help-body">
          <div className="help-hero">
            <div>
              <h4>一个能被命令行驱动的桌面工作台</h4>
              <p>
                墨枢内置本地桥接服务：CLI 通过 <code>127.0.0.1</code> 发送指令，界面即时响应。
                也可以离线直接读写工作区文件，等应用启动后自动同步。
              </p>
            </div>
            <div className="help-terminal">
              <div className="help-terminal-head"><Terminal size={12} /> PowerShell</div>
              <code>cd d:\OfficeAgent</code>
              <code>node cli/oa.mjs status</code>
              <code>node cli/oa.mjs canvas add-card --title "需求"</code>
              <button onClick={() => void copy('node cli/oa.mjs status')}>
                {copied === 'node cli/oa.mjs status' ? <Check size={11} /> : <Copy size={11} />} 复制
              </button>
            </div>
          </div>

          <div className="help-columns">
            <section>
              <h5><Keyboard size={13} />快捷键</h5>
              <div className="shortcut-list">
                {[
                  ['Ctrl K', '命令面板'],
                  ['Ctrl N', '新建 Markdown'],
                  ['Ctrl S', '保存文档 / 画布'],
                  ['Ctrl 1 / 2 / 3', '文档 / 画布 / 分栏'],
                  ['Ctrl Shift A', 'AI 工作台'],
                  ['V C R O P L T H', '画布工具切换'],
                  ['Shift 拖动', '多选方片'],
                  ['Ctrl 滚轮', '画布缩放'],
                  ['空格 + 拖动', '平移画布'],
                ].map(([key, label]) => (
                  <div className="shortcut" key={key}><kbd>{key}</kbd><span>{label}</span></div>
                ))}
              </div>
            </section>

            <section>
              <h5><MousePointer2 size={13} />画布手势</h5>
              <ul className="help-list">
                <li><b>拖出矩形</b>：按 <kbd>R</kbd> 在空白处左键拖动，建立图片框；双击或拖入图片填充。</li>
                <li><b>手绘变标注</b>：按 <kbd>P</kbd> 随手画一个闭合圆，松手后自动收敛为标注圆。</li>
                <li><b>连接方片</b>：悬停方片，从四边小圆点拖到另一张方片，自动生成带箭头的曲线。</li>
                <li><b>工具栏缩放</b>：鼠标悬停在底部工具栏，滚动滚轮即可放大或缩小。</li>
                <li><b>AI 出片</b>：画完示意图，打开 AI 工作台，一次点击生成图片或短视频。</li>
              </ul>
            </section>
          </div>

          <section className="help-cli">
            <h5><Command size={13} />CLI 命令</h5>
            <div className="cli-table">
              {CLI_COMMANDS.map((row) => (
                <div className="cli-row" key={row.cmd}>
                  <code>{row.cmd}</code>
                  <span>{row.desc}</span>
                  <button onClick={() => void copy(row.cmd)}>{copied === row.cmd ? <Check size={11} /> : <Copy size={11} />}</button>
                </div>
              ))}
            </div>
            <p className="help-note">
              桥接地址：<code>{info?.bridge?.http ?? 'http://127.0.0.1:17866'}</code> · 工作区：
              <code>{info?.workspace ?? '浏览器演示'}</code> · 所有命令支持 <code>--json</code>，方便 Agent 解析。
            </p>
          </section>

          <section className="help-formats">
            <h5><FileText size={13} />格式支持</h5>
            <div className="format-grid">
              {['文档', '表格', '演示', '数据', '代码', '网页'].map((group) => (
                <div key={group} className="format-group">
                  <span>{group}</span>
                  <div>
                    {FORMATS.filter((f) => f.group === group).map((f) => (
                      <em key={f.ext} className={f.write ? 'writable' : 'readonly'} title={f.note || (f.write ? '可读写' : '只读')}>
                        .{f.ext}
                      </em>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="modal-foot">
          <span className="modal-hint">墨枢 Office Agent · {info?.version ?? '1.0.0'}</span>
          <div className="foot-actions">
            <button className="btn ghost" onClick={() => { setOpen(false); setView('board'); }}>
              <Wand2 size={14} />去画布试试
            </button>
            <button className="btn primary" onClick={() => setOpen(false)}>知道了</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Sparkles, Download, ArrowRight, CornerDownLeft, FilePlus2 };
