import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer2, Square, CircleDashed, PenLine, Link2, Type, LayoutGrid, ImagePlus,
  Undo2, Redo2, Plus, Minus, Maximize2, Download, Sparkles, Bold, Italic, Underline,
  Strikethrough, List, ListOrdered, Quote, Code2, Heading1, Heading2, Link, Image as ImageIcon,
  Table2, Presentation, FileType2, ChevronLeft, ChevronRight, ScanText, Save, MousePointer,
  AlignLeft, Grid2X2, Wand2, Frame, Equal, FileDown, Rows3, Columns3,
} from 'lucide-react';
import { useStore, activeTabOf, type BoardTool } from '../store';
import { editorBridge } from '../lib/editorBus';
import { htmlToText } from '../lib/parsers';

const BOARD_TOOLS: { key: BoardTool; icon: typeof MousePointer2; label: string; hint: string }[] = [
  { key: 'select', icon: MousePointer2, label: '选择', hint: 'V' },
  { key: 'card', icon: Frame, label: '方片', hint: 'C' },
  { key: 'image', icon: ImagePlus, label: '图片框', hint: 'R' },
  { key: 'circle', icon: CircleDashed, label: '标注圆', hint: 'O' },
  { key: 'pen', icon: PenLine, label: '手绘', hint: 'P' },
  { key: 'connect', icon: Link2, label: '连线', hint: 'L' },
  { key: 'text', icon: Type, label: '便签', hint: 'T' },
  { key: 'hand', icon: MousePointer, label: '抓手', hint: 'H' },
];

export function BottomToolbar() {
  const view = useStore((s) => s.view);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const board = useStore((s) => s.board);
  const scale = useStore((s) => s.settings.toolbarScale);
  const updateSettings = useStore((s) => s.updateSettings);
  const patchActive = useStore((s) => s.patchActive);
  const saveActive = useStore((s) => s.saveActive);
  const undoBoard = useStore((s) => s.undoBoard);
  const redoBoard = useStore((s) => s.redoBoard);
  const autoLayout = useStore((s) => s.autoLayout);
  const exportBoard = useStore((s) => s.exportBoard);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const setAiTab = useStore((s) => s.setAiTab);
  const active = activeTabOf({ tabs, activeId });

  const wrapRef = useRef<HTMLDivElement>(null);
  const [badge, setBadge] = useState(false);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = Math.min(1.35, Math.max(0.72, scale - event.deltaY * 0.0009));
      updateSettings({ toolbarScale: Math.round(next * 100) / 100 });
      setBadge(true);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(() => setBadge(false), 1200);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, updateSettings]);

  const stats = useMemo(() => {
    if (!active) return { left: 0, right: 0 };
    if (active.kind === 'rich') {
      const text = htmlToText(active.html);
      return { left: text.length, right: text.trim() ? text.trim().split(/\s+/).length : 0 };
    }
    if (active.kind === 'sheet') return { left: active.rows.length, right: active.rows[0]?.length ?? 0 };
    if (active.kind === 'slides') return { left: active.slides.length, right: 0 };
    if (active.kind === 'pdf') return { left: 0, right: 0 };
    return { left: active.text.length, right: active.text.split('\n').length };
  }, [active]);

  const richExec = (command: string, value?: string) => {
    editorBridge()?.exec?.(command, value);
  };

  const mdWrap = (before: string, after: string) => {
    editorBridge()?.wrap?.(before, after);
  };

  const openAi = (tab: 'image' | 'copy' | 'movie') => {
    setAiOpen(true);
    setAiTab(tab);
  };

  const isBoard = view !== 'doc';
  const kind = active?.kind;

  return (
    <div className="bottom-dock" ref={wrapRef}>
      {badge && <div className="tb-badge">工具栏 {Math.round(scale * 100)}%</div>}
      <div className="bottom-toolbar" style={{ transform: `scale(${scale})` }}>
        {isBoard ? (
          <>
            <div className="tb-group">
              {BOARD_TOOLS.map(({ key, icon: Icon, label, hint }) => (
                <button
                  key={key}
                  className={`tb-btn ${tool === key ? 'active' : ''}`}
                  title={`${label} · ${hint}`}
                  onClick={() => setTool(key)}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="撤销 (Ctrl+Z)" onClick={undoBoard}><Undo2 size={15} /></button>
              <button className="tb-btn" title="重做 (Ctrl+Shift+Z)" onClick={redoBoard}><Redo2 size={15} /></button>
              <button className="tb-btn" title="自动整理" onClick={autoLayout}><Grid2X2 size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="缩小" onClick={() => window.dispatchEvent(new CustomEvent('moshu:board-command', { detail: { cmd: 'out' } }))}><Minus size={15} /></button>
              <button className="tb-btn" title="适应窗口" onClick={() => window.dispatchEvent(new CustomEvent('moshu:board-command', { detail: { cmd: 'fit' } }))}><Maximize2 size={15} /></button>
              <button className="tb-btn" title="放大" onClick={() => window.dispatchEvent(new CustomEvent('moshu:board-command', { detail: { cmd: 'in' } }))}><Plus size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="导出 PNG" onClick={() => void exportBoard('png')}><Download size={15} /></button>
              <button className="tb-btn accent" title="AI 生成图片 / 视频" onClick={() => openAi('image')}>
                <Sparkles size={15} /><span className="tb-label">生成</span>
              </button>
            </div>
            <div className="tb-meta">
              <span>{board.nodes.length} 节点 · {board.edges.length} 连线</span>
            </div>
          </>
        ) : !active ? (
          <div className="tb-empty">
            <span>选择一份文档，工具会出现在这里</span>
            <button className="tb-btn accent" onClick={() => openAi('copy')}><Sparkles size={14} /> AI 文案</button>
          </div>
        ) : kind === 'rich' ? (
          <>
            <div className="tb-group">
              <button className="tb-btn" title="一级标题" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('formatBlock', '<h1>')}><Heading1 size={16} /></button>
              <button className="tb-btn" title="二级标题" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('formatBlock', '<h2>')}><Heading2 size={16} /></button>
              <button className="tb-btn" title="正文" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('formatBlock', '<p>')}><AlignLeft size={16} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="加粗" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('bold')}><Bold size={15} /></button>
              <button className="tb-btn" title="斜体" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('italic')}><Italic size={15} /></button>
              <button className="tb-btn" title="下划线" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('underline')}><Underline size={15} /></button>
              <button className="tb-btn" title="删除线" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('strikeThrough')}><Strikethrough size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="无序列表" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('insertUnorderedList')}><List size={15} /></button>
              <button className="tb-btn" title="有序列表" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('insertOrderedList')}><ListOrdered size={15} /></button>
              <button className="tb-btn" title="引用" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('formatBlock', '<blockquote>')}><Quote size={15} /></button>
              <button className="tb-btn" title="代码块" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('formatBlock', '<pre>')}><Code2 size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="插入链接" onMouseDown={(e) => e.preventDefault()} onClick={() => { const url = window.prompt('链接地址'); if (url) richExec('createLink', url); }}><Link size={15} /></button>
              <button className="tb-btn" title="插入图片" onMouseDown={(e) => e.preventDefault()} onClick={() => editorBridge()?.insertImage?.()}><ImageIcon size={15} /></button>
              <button className="tb-btn" title="插入表格" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('insertHTML', `<table border="1"><tr><th>列 A</th><th>列 B</th></tr><tr><td>内容</td><td>内容</td></tr></table><p><br></p>`)}><Table2 size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="撤销" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('undo')}><Undo2 size={15} /></button>
              <button className="tb-btn" title="重做" onMouseDown={(e) => e.preventDefault()} onClick={() => richExec('redo')}><Redo2 size={15} /></button>
              <button className="tb-btn" title="保存" onClick={() => void saveActive()}><Save size={15} /></button>
            </div>
            <div className="tb-meta"><span>{stats.left} 字符 · {stats.right} 词</span></div>
          </>
        ) : kind === 'markdown' ? (
          <>
            <div className="tb-group">
              <button className="tb-btn" title="标题" onMouseDown={(e) => e.preventDefault()} onClick={() => editorBridge()?.prefixLine?.('## ')}><Heading2 size={16} /></button>
              <button className="tb-btn" title="加粗" onMouseDown={(e) => e.preventDefault()} onClick={() => mdWrap('**', '**')}><Bold size={15} /></button>
              <button className="tb-btn" title="斜体" onMouseDown={(e) => e.preventDefault()} onClick={() => mdWrap('*', '*')}><Italic size={15} /></button>
              <button className="tb-btn" title="行内代码" onMouseDown={(e) => e.preventDefault()} onClick={() => mdWrap('`', '`')}><Code2 size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="无序列表" onMouseDown={(e) => e.preventDefault()} onClick={() => editorBridge()?.prefixLine?.('- ')}><List size={15} /></button>
              <button className="tb-btn" title="有序列表" onMouseDown={(e) => e.preventDefault()} onClick={() => editorBridge()?.prefixLine?.('1. ')}><ListOrdered size={15} /></button>
              <button className="tb-btn" title="引用" onMouseDown={(e) => e.preventDefault()} onClick={() => editorBridge()?.prefixLine?.('> ')}><Quote size={15} /></button>
              <button className="tb-btn" title="链接" onMouseDown={(e) => e.preventDefault()} onClick={() => mdWrap('[', '](https://)')}><Link size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="保存" onClick={() => void saveActive()}><Save size={15} /></button>
              <button className="tb-btn accent" onClick={() => openAi('copy')}><Sparkles size={15} /><span className="tb-label">AI 文案</span></button>
            </div>
            <div className="tb-meta"><span>{stats.left} 字符 · {stats.right} 行</span></div>
          </>
        ) : kind === 'sheet' ? (
          <>
            <div className="tb-group">
              <button className="tb-btn" title="新增一行" onClick={() => patchActive({ rows: [...active.rows, Array.from({ length: Math.max(6, active.rows[0]?.length ?? 0) }, () => '')] })}><Rows3 size={15} /><span className="tb-label">加行</span></button>
              <button className="tb-btn" title="新增一列" onClick={() => patchActive({ rows: active.rows.map((row) => [...row, '']) })}><Columns3 size={15} /><span className="tb-label">加列</span></button>
              <button className="tb-btn" title="删除最后一行" onClick={() => patchActive({ rows: active.rows.slice(0, -1) })}><Minus size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="保存" onClick={() => void saveActive()}><Save size={15} /></button>
              <button className="tb-btn accent" onClick={() => openAi('copy')}><Sparkles size={15} /><span className="tb-label">AI</span></button>
            </div>
            <div className="tb-meta"><span>{stats.left} 行 × {stats.right} 列</span></div>
          </>
        ) : kind === 'pdf' ? (
          <>
            <div className="tb-group">
              <button className="tb-btn" title="上一页" onClick={() => window.dispatchEvent(new CustomEvent('moshu:pdf-command', { detail: { cmd: 'prev' } }))}><ChevronLeft size={15} /></button>
              <button className="tb-btn" title="下一页" onClick={() => window.dispatchEvent(new CustomEvent('moshu:pdf-command', { detail: { cmd: 'next' } }))}><ChevronRight size={15} /></button>
              <button className="tb-btn" title="适应宽度" onClick={() => window.dispatchEvent(new CustomEvent('moshu:pdf-command', { detail: { cmd: 'fit' } }))}><Equal size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="提取为可编辑文稿" onClick={() => window.dispatchEvent(new CustomEvent('moshu:pdf-command', { detail: { cmd: 'extract' } }))}><ScanText size={15} /><span className="tb-label">提取</span></button>
              <button className="tb-btn accent" onClick={() => openAi('copy')}><Sparkles size={15} /><span className="tb-label">AI 摘要</span></button>
            </div>
            <div className="tb-meta"><span><FileType2 size={12} /> 只读视图</span></div>
          </>
        ) : kind === 'slides' ? (
          <>
            <div className="tb-group">
              <button className="tb-btn" title="新增一页" onClick={() => patchActive({ slides: [...active.slides, { title: `第 ${active.slides.length + 1} 页`, lines: [] }] })}><Plus size={15} /><span className="tb-label">新页</span></button>
              <button className="tb-btn" title="保存" onClick={() => void saveActive()}><Save size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn" title="导出 PPTX" onClick={() => void useStore.getState().exportActive('pptx')}><Presentation size={15} /><span className="tb-label">导出</span></button>
              <button className="tb-btn accent" onClick={() => openAi('copy')}><Sparkles size={15} /><span className="tb-label">AI 讲稿</span></button>
            </div>
            <div className="tb-meta"><span>{active.slides.length} 页</span></div>
          </>
        ) : (
          <>
            <div className="tb-group">
              <button className="tb-btn" title="保存" onClick={() => void saveActive()}><Save size={15} /></button>
              <button className="tb-btn" title="格式化 JSON" onClick={async () => {
                try {
                  const parsed = JSON.parse(active.text);
                  patchActive({ text: JSON.stringify(parsed, null, 2) });
                } catch { useStore.getState().toast('当前内容不是合法 JSON', 'warn'); }
              }}><Code2 size={15} /><span className="tb-label">格式化</span></button>
              <button className="tb-btn" title="复制全文" onClick={() => void navigator.clipboard.writeText(active.text)}><FileDown size={15} /></button>
            </div>
            <div className="tb-sep" />
            <div className="tb-group">
              <button className="tb-btn accent" onClick={() => openAi('copy')}><Sparkles size={15} /><span className="tb-label">AI</span></button>
            </div>
            <div className="tb-meta"><span>{stats.left} 字符 · {stats.right} 行</span></div>
          </>
        )}

        <div className="tb-scale" title="滚动滚轮调整工具栏大小">
          <Wand2 size={12} />
          <button onClick={() => updateSettings({ toolbarScale: 1 })}>{Math.round(scale * 100)}%</button>
        </div>
      </div>
    </div>
  );
}
