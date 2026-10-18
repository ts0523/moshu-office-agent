import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Save, Download, ChevronDown, FileText, FileDown, Table2, Presentation,
  FilePlus2, LayoutGrid, Upload, ArrowUpRight, Lock, Wand2, FileType2, X, Check,
} from 'lucide-react';
import { useStore, activeTabOf } from '../store';
import { specOf } from '../lib/formats';
import { htmlToText } from '../lib/parsers';
import { serializeForSave } from '../lib/writers';
import { saveBinary } from '../lib/fsapi';
import { RichEditor, MarkdownEditor, CodeEditor, SheetEditor, PdfEditor, SlidesEditor } from './Editors';

const EXPORT_OPTIONS = [
  { ext: 'pdf', label: 'PDF 文档', icon: FileType2 },
  { ext: 'docx', label: 'Word 文稿', icon: FileText },
  { ext: 'html', label: 'HTML 网页', icon: ArrowUpRight },
  { ext: 'md', label: 'Markdown', icon: FileText },
  { ext: 'txt', label: '纯文本', icon: FileText },
  { ext: 'pptx', label: 'PowerPoint', icon: Presentation },
  { ext: 'xlsx', label: 'Excel 工作簿', icon: Table2 },
];

export function DocumentView() {
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const saveActive = useStore((s) => s.saveActive);
  const setView = useStore((s) => s.setView);
  const createFile = useStore((s) => s.createFile);
  const boardFile = useStore((s) => s.boardFile);
  const loadBoardFile = useStore((s) => s.loadBoardFile);
  const toast = useStore((s) => s.toast);
  const tab = activeTabOf({ tabs, activeId });

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [exportOpen]);

  const stats = useMemo(() => {
    if (!tab) return { chars: 0, words: 0 };
    if (tab.kind === 'rich') {
      const text = htmlToText(tab.html);
      return { chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0 };
    }
    if (tab.kind === 'sheet') {
      return { chars: tab.rows.flat().join('').length, words: tab.rows.length * (tab.rows[0]?.length ?? 0) };
    }
    if (tab.kind === 'slides') {
      return { chars: tab.slides.reduce((sum, s) => sum + s.title.length + s.lines.join('').length, 0), words: tab.slides.length };
    }
    return { chars: tab.text.length, words: tab.text.trim() ? tab.text.trim().split(/\s+/).length : 0 };
  }, [tab]);

  const exportAs = async (ext: string) => {
    if (!tab || exporting) return;
    setExportOpen(false);
    setExporting(ext);
    try {
      const serialized = await serializeForSave(tab, ext);
      if (serialized.base64 != null) {
        const path = await saveBinary(serialized.name, serialized.base64);
        toast(`已导出 ${ext.toUpperCase()}：${path}`, 'ok');
      } else {
        const base64 = btoa(unescape(encodeURIComponent(serialized.text ?? '')));
        const path = await saveBinary(serialized.name, base64);
        toast(`已导出 ${ext.toUpperCase()}：${path}`, 'ok');
      }
    } catch (error) {
      toast(`导出失败：${(error as Error).message}`, 'error');
    } finally {
      setExporting('');
    }
  };

  if (!tab) {
    return (
      <div className="doc-empty">
        <div className="empty-inner">
          <div className="empty-eyebrow">MOSHU WORKSPACE · 2026</div>
          <h1>把想法，<br />落在纸上。</h1>
          <p>打开一份文档，或从空白开始。30 种格式在这里被一视同仁地阅读和书写。</p>
          <div className="empty-actions">
            <button className="empty-primary" onClick={() => void createFile(`未命名-${Date.now().toString().slice(-4)}.md`, 'md')}>
              <FilePlus2 size={15} /> 新建 Markdown
            </button>
            <button onClick={() => void createFile(`新文档-${Date.now().toString().slice(-4)}.docx`, 'docx')}>
              <FileText size={15} /> Word 文档
            </button>
            <button onClick={async () => { await loadBoardFile(boardFile); setView('board'); }}>
              <LayoutGrid size={15} /> 打开画布
            </button>
            <button onClick={() => useStore.getState().setSettingsOpen(true)}>
              <Wand2 size={15} /> 配置 AI
            </button>
          </div>
          <div className="empty-formats">
            {['DOCX', 'PDF', 'XLSX', 'PPTX', 'MD', 'CSV', 'HTML', 'RTF', 'ODT', 'JSON', 'YAML', 'TEX'].map((f) => (
              <span key={f}>{f}</span>
            ))}
            <em>+18</em>
          </div>
          <div className="empty-hint">
            <kbd>Ctrl</kbd> <kbd>K</kbd> 打开命令面板 · <kbd>Ctrl</kbd> <kbd>2</kbd> 进入画布
          </div>
        </div>
        <div className="empty-side">
          <div className="empty-card">
            <span className="empty-card-no">01</span>
            <strong>多格式</strong>
            <p>Word、PDF、Excel、PPT、OpenDocument 与 20 余种文本格式，读与写都在同一处。</p>
          </div>
          <div className="empty-card">
            <span className="empty-card-no">02</span>
            <strong>方片画布</strong>
            <p>拖出矩形图片、手绘标注圆，把方片连成结构图，再一键变成图片或视频。</p>
          </div>
          <div className="empty-card">
            <span className="empty-card-no">03</span>
            <strong>可被 Agent 调用</strong>
            <p>本地 CLI 通过 127.0.0.1 桥接直接操作界面与文件，脚本可以真正“动手”。</p>
          </div>
        </div>
      </div>
    );
  }

  const spec = specOf(tab.name);

  return (
    <section className="doc-view">
      <div className="doc-head">
        <div className="doc-ident">
          <span className={`doc-badge group-${spec.group}`}>{tab.ext.toUpperCase()}</span>
          <div className="doc-title-block">
            <h2>{tab.name}</h2>
            <div className="doc-meta">
              <span>{spec.label}</span>
              <i />
              <span>{stats.chars} 字符</span>
              <i />
              <span>{tab.kind === 'slides' ? `${tab.slides.length} 页` : tab.kind === 'pdf' ? '只读视图' : `${stats.words} 词`}</span>
              {tab.readOnly && <span className="readonly-pill"><Lock size={10} />只读</span>}
              {tab.warning && <span className="warning-pill" title={tab.warning}>格式已简化</span>}
            </div>
          </div>
        </div>

        <div className="doc-actions">
          {tab.dirty && <span className="unsaved-dot" title="有未保存的修改" />}
          <button className="btn ghost" onClick={() => void saveActive()} disabled={tab.readOnly}>
            <Save size={14} /> 保存
          </button>
          <div className="export-wrap" ref={popRef}>
            <button className="btn primary" onClick={() => setExportOpen((v) => !v)} disabled={!!exporting}>
              <Download size={14} /> {exporting ? `导出 ${exporting.toUpperCase()}…` : '导出'}
              <ChevronDown size={12} />
            </button>
            {exportOpen && (
              <div className="export-menu">
                <div className="export-menu-head">导出为</div>
                {EXPORT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button key={option.ext} onClick={() => void exportAs(option.ext)}>
                      <Icon size={14} />
                      <span>{option.label}</span>
                      <em>.{option.ext}</em>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {tab.readOnly && (
        <div className="readonly-banner">
          <Lock size={13} />
          该格式以只读方式打开。使用「导出」可另存为 DOCX / PDF 等可编辑格式。
        </div>
      )}

      <div className={`doc-body kind-${tab.kind}`}>
        {tab.loading && (
          <div className="doc-loading">
            <div className="skeleton title" />
            <div className="skeleton line" />
            <div className="skeleton line" />
            <div className="skeleton line short" />
          </div>
        )}
        {tab.error && (
          <div className="doc-error">
            <FileDown size={20} />
            <strong>无法打开这份文件</strong>
            <span>{tab.error}</span>
            <button onClick={() => useStore.getState().closeTab(tab.id)}>关闭标签</button>
          </div>
        )}
        {!tab.loading && !tab.error && (
          <>
            {tab.kind === 'rich' && <RichEditor tab={tab} />}
            {tab.kind === 'markdown' && <MarkdownEditor tab={tab} />}
            {tab.kind === 'text' && <CodeEditor tab={tab} readonly={tab.readOnly} />}
            {tab.kind === 'code' && <CodeEditor tab={tab} readonly={tab.readOnly} />}
            {tab.kind === 'sheet' && <SheetEditor tab={tab} />}
            {tab.kind === 'pdf' && <PdfEditor tab={tab} />}
            {tab.kind === 'slides' && <SlidesEditor tab={tab} />}
          </>
        )}
      </div>
    </section>
  );
}

export { Upload, Check, X };
