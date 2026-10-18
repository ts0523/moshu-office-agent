import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, RefreshCw, FolderOpen, Trash2, FileText, Table2, Presentation,
  LayoutGrid, Braces, Globe, FileType2, X, Upload, CornerDownLeft, ChevronRight,
} from 'lucide-react';
import { useStore } from '../store';
import { specOf, isBoardFile, FORMATS, WRITABLE_COUNT } from '../lib/formats';
import { formatSize, formatTime, importDialog, writeFile, openWorkspace } from '../lib/fsapi';
import type { FileMeta } from '../types';

const FILTERS = ['全部', '文档', '表格', '演示', '数据', '画布'] as const;
type Filter = typeof FILTERS[number];

const CREATE_FORMATS = [
  { ext: 'md', label: 'Markdown' },
  { ext: 'docx', label: 'Word' },
  { ext: 'xlsx', label: 'Excel' },
  { ext: 'pptx', label: 'PPT' },
  { ext: 'pdf', label: 'PDF' },
  { ext: 'board.json', label: '画布' },
  { ext: 'csv', label: 'CSV' },
  { ext: 'html', label: 'HTML' },
  { ext: 'txt', label: '文本' },
];

function iconFor(file: FileMeta) {
  if (isBoardFile(file.name)) return <LayoutGrid size={16} />;
  const spec = specOf(file.name);
  if (spec.kind === 'sheet') return <Table2 size={16} />;
  if (spec.kind === 'slides') return <Presentation size={16} />;
  if (spec.kind === 'pdf') return <FileType2 size={16} />;
  if (spec.kind === 'code') return <Braces size={16} />;
  if (spec.ext === 'html' || spec.ext === 'htm') return <Globe size={16} />;
  return <FileText size={16} />;
}

function groupOf(file: FileMeta): Filter {
  if (isBoardFile(file.name)) return '画布';
  const spec = specOf(file.name);
  if (spec.group === '表格') return '表格';
  if (spec.group === '演示') return '演示';
  if (spec.group === '数据' || spec.group === '代码') return '数据';
  return '文档';
}

export function FilePanel() {
  const files = useStore((s) => s.files);
  const activeId = useStore((s) => s.activeId);
  const tabs = useStore((s) => s.tabs);
  const boardFile = useStore((s) => s.boardFile);
  const refreshFiles = useStore((s) => s.refreshFiles);
  const openFile = useStore((s) => s.openFile);
  const createFile = useStore((s) => s.createFile);
  const deleteByName = useStore((s) => s.deleteByName);
  const setView = useStore((s) => s.setView);
  const toast = useStore((s) => s.toast);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('全部');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [ext, setExt] = useState('md');
  const [busy, setBusy] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeId);
  const view = useStore((s) => s.view);

  useEffect(() => {
    if (!creating) return;
    const onClick = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) setCreating(false);
    };
    document.addEventListener('mousedown', onClick);
    setTimeout(() => inputRef.current?.focus(), 30);
    return () => document.removeEventListener('mousedown', onClick);
  }, [creating]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((file) => {
      if (filter !== '全部' && groupOf(file) !== filter) return false;
      if (q && !file.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, filter, query]);

  const submit = async () => {
    if (busy) return;
    const label = name.trim() || `未命名-${Date.now().toString().slice(-4)}`;
    const finalName = ext === 'board.json'
      ? (label.endsWith('.board.json') ? label : `${label.replace(/\.board\.json$/, '').replace(/\.[^.]+$/, '')}.board.json`)
      : (label.toLowerCase().endsWith(`.${ext}`) ? label : `${label}.${ext}`);
    setBusy(true);
    const created = await createFile(finalName, ext === 'board.json' ? 'board.json' : ext);
    setBusy(false);
    if (created) {
      setCreating(false);
      setName('');
      setExt('md');
    }
  };

  const importFiles = async () => {
    try {
      const picks = await importDialog();
      if (!picks.length) return;
      for (const pick of picks) {
        let fileName = pick.name;
        if (files.some((f) => f.name === fileName)) {
          fileName = fileName.replace(/(\.[^.]+)$/, `-${Date.now().toString().slice(-3)}$1`);
        }
        await writeFile(fileName, { base64: pick.base64 });
      }
      await refreshFiles();
      toast(`已导入 ${picks.length} 个文件`, 'ok');
      if (picks[0]) await openFile(picks[0].name);
    } catch (error) {
      toast(`导入失败：${(error as Error).message}`, 'error');
    }
  };

  return (
    <aside className="file-panel">
      <div className="fp-head">
        <div>
          <div className="fp-title">工作区</div>
          <button className="fp-path" onClick={() => void openWorkspace()} title="打开工作区文件夹">
            <FolderOpen size={12} />
            {files.length} 个文件
          </button>
        </div>
        <div className="fp-head-actions">
          <button className="icon-btn" title="导入文档" onClick={importFiles}><Upload size={15} /></button>
          <button className="icon-btn" title="刷新" onClick={() => void refreshFiles()}><RefreshCw size={15} /></button>
          <button className={`icon-btn primary ${creating ? 'active' : ''}`} title="新建文件" onClick={() => setCreating((v) => !v)}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="fp-search">
        <Search size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选文件" />
        {query && <button onClick={() => setQuery('')}><X size={12} /></button>}
      </div>

      <div className="fp-filters">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="fp-list">
        {filtered.map((file) => {
          const isActive = isBoardFile(file.name)
            ? boardFile === file.name && view !== 'doc'
            : activeTab?.name === file.name && view !== 'board';
          return (
            <div
              key={file.name}
              className={`fp-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (isBoardFile(file.name)) {
                  void useStore.getState().loadBoardFile(file.name);
                  setView(useStore.getState().view === 'split' ? 'split' : 'board');
                } else {
                  void openFile(file.name);
                  setView(useStore.getState().view === 'board' ? 'doc' : useStore.getState().view);
                }
              }}
            >
              <span className={`fp-icon tone-${specOf(file.name).group}`}>{iconFor(file)}</span>
              <span className="fp-name">{file.name}</span>
              <span className="fp-meta">{formatSize(file.size)} · {formatTime(file.mtime)}</span>
              <span className="fp-hover">
                <button
                  title="在文件夹中显示"
                  onClick={(event) => { event.stopPropagation(); void window.moshu?.reveal(file.name); }}
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  title="删除"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (window.confirm(`删除「${file.name}」？此操作不可撤销。`)) void deleteByName(file.name);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="fp-empty">
            <span>这里还没有文件</span>
            <button onClick={() => setCreating(true)}>新建一份</button>
          </div>
        )}
      </div>

      <div className="fp-foot">
        <span>{FORMATS.length} 种格式 · {WRITABLE_COUNT} 种可写</span>
        <button onClick={() => useStore.getState().setHelpOpen(true)}>查看全部</button>
      </div>

      {creating && (
        <div className="create-pop" ref={popRef}>
          <div className="create-pop-head">
            <span>新建文件</span>
            <button onClick={() => setCreating(false)}><X size={13} /></button>
          </div>
          <div className="create-name">
            <FileText size={14} />
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder={`未命名-${Date.now().toString().slice(-4)}`}
            />
            <span className="ext-suffix">{ext === 'board.json' ? '.board.json' : `.${ext}`}</span>
          </div>
          <div className="create-formats">
            {CREATE_FORMATS.map((f) => (
              <button
                key={f.ext}
                className={ext === f.ext ? 'active' : ''}
                onClick={() => setExt(f.ext)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="create-submit" disabled={busy} onClick={() => void submit()}>
            {busy ? '创建中…' : '创建并打开'}
            <CornerDownLeft size={13} />
          </button>
        </div>
      )}
    </aside>
  );
}
