import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Minus, Plus, ScanText, Trash2, AlignLeft } from 'lucide-react';
import type { Tab } from '../types';
import { useStore } from '../store';
import { setEditorBridge } from '../lib/editorBus';
import { getPdfjs, extractPdfText } from '../lib/parsers';
import { bytesFromBase64 } from '../lib/fsapi';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/* ------------------------------------------------------------------ */
/* 富文本                                                             */
/* ------------------------------------------------------------------ */

export function RichEditor({ tab }: { tab: Tab }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = useStore((s) => s.patchActive);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = tab.html || '<p><br></p>';
  }, [tab.id]);

  useEffect(() => {
    setEditorBridge({
      kind: 'rich',
      exec: (command, value) => {
        ref.current?.focus();
        document.execCommand(command, false, value);
        if (ref.current) patch({ html: ref.current.innerHTML });
      },
      insertText: (text) => {
        ref.current?.focus();
        document.execCommand('insertText', false, text);
        if (ref.current) patch({ html: ref.current.innerHTML });
      },
      insertImage: () => fileRef.current?.click(),
      focus: () => ref.current?.focus(),
    });
  }, [patch]);

  const sync = () => {
    if (ref.current) patch({ html: ref.current.innerHTML });
  };

  const insertImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      ref.current?.focus();
      document.execCommand('insertImage', false, String(reader.result));
      sync();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="doc-scroll">
      <div className="paper">
        <div
          ref={ref}
          className="rich-editor"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={sync}
          onBlur={sync}
          onFocus={() => setEditorBridge({
            kind: 'rich',
            exec: (command, value) => { document.execCommand(command, false, value); sync(); },
            insertImage: () => fileRef.current?.click(),
          })}
          onPaste={(event) => {
            const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'));
            if (item) {
              const file = item.getAsFile();
              if (file) { event.preventDefault(); insertImageFile(file); }
            }
          }}
          onDrop={(event) => {
            const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
            if (file) { event.preventDefault(); insertImageFile(file); }
          }}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) insertImageFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Markdown                                                           */
/* ------------------------------------------------------------------ */

export function MarkdownEditor({ tab }: { tab: Tab }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const patch = useStore((s) => s.patchActive);
  const [preview, setPreview] = useState(true);

  const html = useMemo(() => {
    try {
      return DOMPurify.sanitize(marked.parse(tab.text || '', { async: false }) as string, { ADD_ATTR: ['target'] });
    } catch {
      return '<p>预览失败</p>';
    }
  }, [tab.text]);

  const wrap = (before: string, after: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = tab.text.slice(start, end) || '文本';
    const next = `${tab.text.slice(0, start)}${before}${selected}${after}${tab.text.slice(end)}`;
    patch({ text: next });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const prefixLine = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = tab.text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEnd = tab.text.indexOf('\n', start);
    const end = lineEnd === -1 ? tab.text.length : lineEnd;
    const line = tab.text.slice(lineStart, end);
    const cleaned = line.replace(/^(#{1,4}\s|>\s|-\s|\d+\.\s)/, '');
    const next = `${tab.text.slice(0, lineStart)}${prefix}${cleaned}${tab.text.slice(end)}`;
    patch({ text: next });
    setTimeout(() => {
      el.focus();
      const pos = lineStart + prefix.length + cleaned.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className={`md-wrap ${preview ? 'with-preview' : ''}`}>
      <div className="md-source">
        <div className="md-pane-head">
          <span>Markdown</span>
          <button onClick={() => setPreview((v) => !v)}>{preview ? '专注写作' : '显示预览'}</button>
        </div>
        <textarea
          ref={ref}
          value={tab.text}
          spellCheck={false}
          onChange={(event) => patch({ text: event.target.value })}
          onFocus={() => setEditorBridge({
            kind: 'markdown',
            wrap,
            prefixLine,
            insertText: (text) => {
              const el = ref.current;
              if (!el) return;
              const start = el.selectionStart;
              patch({ text: `${tab.text.slice(0, start)}${text}${tab.text.slice(el.selectionEnd)}` });
            },
            focus: () => ref.current?.focus(),
          })}
          placeholder="# 从一个标题开始"
        />
      </div>
      {preview && (
        <div className="md-preview markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 纯文本 / 代码                                                       */
/* ------------------------------------------------------------------ */

export function CodeEditor({ tab, readonly }: { tab: Tab; readonly?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const patch = useStore((s) => s.patchActive);
  const lines = tab.text.split('\n').length;
  const [scroll, setScroll] = useState(0);

  const insert = (text: string) => {
    const el = ref.current;
    if (!el || readonly) return;
    const start = el.selectionStart;
    const next = `${tab.text.slice(0, start)}${text}${tab.text.slice(el.selectionEnd)}`;
    patch({ text: next });
    setTimeout(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); }, 0);
  };

  return (
    <div className="code-wrap">
      <div className="code-gutter" style={{ transform: `translateY(${-scroll}px)` }}>
        {Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      <textarea
        ref={ref}
        className="code-area"
        value={tab.text}
        spellCheck={false}
        readOnly={readonly}
        onChange={(event) => patch({ text: event.target.value })}
        onScroll={(event) => setScroll((event.target as HTMLTextAreaElement).scrollTop)}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            insert('  ');
          }
        }}
        onFocus={() => setEditorBridge({ kind: 'code', insertText: insert, focus: () => ref.current?.focus() })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 表格                                                               */
/* ------------------------------------------------------------------ */

export function SheetEditor({ tab }: { tab: Tab }) {
  const patch = useStore((s) => s.patchActive);
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const cols = Math.max(6, ...tab.rows.map((row) => row.length));
  const rows = [...tab.rows];
  while (rows.length < 12) rows.push([]);

  const commitCell = (r: number, c: number, value: string) => {
    const next = tab.rows.map((row) => [...row]);
    while (next.length <= r) next.push([]);
    while (next[r].length <= c) next[r].push('');
    next[r][c] = value;
    patch({ rows: next });
  };

  const addRow = () => patch({ rows: [...tab.rows, Array.from({ length: cols }, () => '')] });
  const addCol = () => patch({ rows: tab.rows.map((row) => [...row, '']) });
  const removeRow = () => {
    if (tab.rows.length <= 1) return;
    patch({ rows: tab.rows.slice(0, -1) });
  };

  return (
    <div className="sheet-wrap">
      <div className="sheet-bar">
        <span className="sheet-tab">工作表1</span>
        <div className="sheet-actions">
          <button onClick={addRow}><Plus size={12} />行</button>
          <button onClick={addCol}><Plus size={12} />列</button>
          <button onClick={removeRow}><Minus size={12} />行</button>
          <span className="sheet-pos">{active ? `${String.fromCharCode(65 + active.c)}${active.r + 1}` : '—'}</span>
        </div>
      </div>
      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="corner" />
              {Array.from({ length: cols }, (_, c) => <th key={c}>{String.fromCharCode(65 + c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <th className="row-no">{r + 1}</th>
                {Array.from({ length: cols }, (_, c) => (
                  <td
                    key={c}
                    className={active?.r === r && active?.c === c ? 'active' : ''}
                    contentEditable={!tab.readOnly}
                    suppressContentEditableWarning
                    onFocus={() => setActive({ r, c })}
                    onBlur={(event) => commitCell(r, c, event.currentTarget.textContent ?? '')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); commitCell(r, c, event.currentTarget.textContent ?? ''); }
                    }}
                  >
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-foot">
        <span>{tab.rows.length} 行 × {cols} 列</span>
        <span>双击单元格编辑 · 失焦自动写入</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PDF                                                                */
/* ------------------------------------------------------------------ */

export function PdfEditor({ tab }: { tab: Tab }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const toast = useStore((s) => s.toast);
  const createFile = useStore((s) => s.createFile);
  const setView = useStore((s) => s.setView);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const pdfjs = await getPdfjs();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytesFromBase64(tab.pdfBase64 ?? '')) }).promise;
        if (cancelled) { await pdf.destroy(); return; }
        setDoc(pdf);
        setPage(1);
        setLoading(false);
      } catch (err) {
        if (!cancelled) { setError((err as Error).message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [tab.id, tab.pdfBase64]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => { cancelled = true; };
  }, [doc, page, scale]);

  const fitWidth = async () => {
    if (!doc) return;
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const width = (wrapRef.current?.clientWidth ?? 800) - 120;
    setScale(Math.max(0.4, Math.min(3, width / base.width)));
  };

  const extract = async () => {
    try {
      toast('正在提取文本…');
      const text = await extractPdfText(tab.pdfBase64 ?? '');
      if (!text) { toast('这份 PDF 没有可提取的文本层', 'warn'); return; }
      const name = `${tab.name.replace(/\.pdf$/i, '')} · 提取.md`;
      const created = await createFile(name, 'md', `# ${tab.name}\n\n${text}`);
      if (created) setView('doc');
    } catch (err) {
      toast(`提取失败：${(err as Error).message}`, 'error');
    }
  };

  useEffect(() => {
    const onCommand = (event: Event) => {
      const cmd = (event as CustomEvent<{ cmd: string }>).detail?.cmd;
      if (cmd === 'prev') setPage((p) => Math.max(1, p - 1));
      if (cmd === 'next') setPage((p) => Math.min(doc?.numPages ?? 1, p + 1));
      if (cmd === 'fit') void fitWidth();
      if (cmd === 'extract') void extract();
    };
    window.addEventListener('moshu:pdf-command', onCommand);
    return () => window.removeEventListener('moshu:pdf-command', onCommand);
  });

  return (
    <div className="pdf-wrap" ref={wrapRef}>
      <div className="pdf-bar">
        <div className="pdf-pager">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14} /></button>
          <span>{page} / {doc?.numPages ?? 0}</span>
          <button onClick={() => setPage((p) => Math.min(doc?.numPages ?? 1, p + 1))} disabled={!doc || page >= doc.numPages}><ChevronRight size={14} /></button>
        </div>
        <div className="pdf-tools">
          <button onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}><Minus size={13} /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.15))}><Plus size={13} /></button>
          <button onClick={() => void fitWidth()}><AlignLeft size={13} />适应宽度</button>
          <button onClick={() => void extract()}><ScanText size={13} />提取为文稿</button>
        </div>
      </div>
      <div className="pdf-scroll">
        {loading && <div className="pdf-loading"><Loader2 size={20} className="spin" /> 正在解析 PDF</div>}
        {error && <div className="pdf-error">无法打开 PDF：{error}</div>}
        {!loading && !error && (
          <div className="pdf-page">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 演示                                                               */
/* ------------------------------------------------------------------ */

export function SlidesEditor({ tab }: { tab: Tab }) {
  const patch = useStore((s) => s.patchActive);
  const [index, setIndex] = useState(0);
  const slides = tab.slides;
  const slide = slides[Math.min(index, slides.length - 1)] ?? { title: '', lines: [] };

  const update = (next: typeof slide) => {
    const all = slides.map((s, i) => (i === index ? next : s));
    patch({ slides: all });
  };

  return (
    <div className="slides-wrap">
      <div className="slides-rail">
        {slides.map((s, i) => (
          <button key={i} className={`slide-thumb ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)}>
            <span className="slide-no">{i + 1}</span>
            <span className="slide-title">{s.title || '未命名'}</span>
            <span className="slide-lines">{s.lines.length} 条内容</span>
          </button>
        ))}
        <button
          className="slide-add"
          onClick={() => {
            patch({ slides: [...slides, { title: `第 ${slides.length + 1} 页`, lines: [] }] });
            setIndex(slides.length);
          }}
        >
          <Plus size={13} /> 新增一页
        </button>
      </div>

      <div className="slides-main">
        <div className="slide-canvas">
          <div className="slide-stage">
            <input
              className="slide-title-input"
              value={slide.title}
              onChange={(e) => update({ ...slide, title: e.target.value })}
              placeholder="这一页的标题"
            />
            <textarea
              className="slide-body-input"
              value={slide.lines.join('\n')}
              onChange={(e) => update({ ...slide, lines: e.target.value.split('\n').filter((l) => l.trim()) })}
              placeholder="一行一个要点"
            />
            <span className="slide-foot">墨枢 · {index + 1} / {slides.length}</span>
          </div>
        </div>
        <div className="slide-hint">
          <span>版式由导出器统一处理，导出 PPTX 后可继续精修。</span>
          <button
            onClick={() => {
              if (slides.length <= 1) return;
              patch({ slides: slides.filter((_, i) => i !== index) });
              setIndex(Math.max(0, index - 1));
            }}
          >
            <Trash2 size={12} /> 删除本页
          </button>
        </div>
      </div>
    </div>
  );
}

export { ImagePlus };
