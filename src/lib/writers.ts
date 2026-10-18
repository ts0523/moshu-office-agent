import type { Tab } from '../types';
import { api, base64FromBytes, isDesktop } from './fsapi';
import { htmlToText, sanitizeHtml, toDelimited } from './parsers';

export interface Serialized {
  base64?: string;
  text?: string;
  name: string;
  mime: string;
}

const HTML_HEAD = `<!doctype html><html><head><meta charset="utf-8"><title>墨枢文档</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Microsoft YaHei","PingFang SC","Segoe UI",sans-serif; color:#1b1b19; line-height:1.85; font-size:11.5pt; }
  h1 { font-size: 22pt; margin: 0 0 12pt; }
  h2 { font-size: 15pt; margin: 18pt 0 8pt; }
  h3 { font-size: 12.5pt; margin: 14pt 0 6pt; }
  p { margin: 0 0 8pt; }
  blockquote { border-left: 3px solid #c0492b; margin: 10pt 0; padding: 2pt 12pt; color:#5c5a54; background:#faf8f3; }
  code, pre { font-family: "Cascadia Code", Consolas, monospace; background:#f4f1ea; }
  pre { padding: 10pt; border-radius: 6px; white-space: pre-wrap; font-size: 9.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
  th, td { border: 1px solid #ddd8cc; padding: 6pt 8pt; font-size: 10pt; text-align: left; }
  th { background: #f4f1ea; }
  img { max-width: 100%; }
  ul, ol { padding-left: 18pt; }
  .pdf-page { page-break-after: always; }
  .pdf-page:last-child { page-break-after: auto; }
  .slide { aspect-ratio: 16/9; width: 100%; }
  .code-block { white-space: pre-wrap; font-size: 9.5pt; }
  .meta { color:#8e8a80; font-size: 9pt; margin-bottom: 18pt; }
</style></head><body>`;

export function mdToHtml(md: string): string {
  // 轻量 Markdown 渲染（保留标题、列表、引用、代码、表格、强调）
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const inline = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push(`<pre><code>${codeBuf.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`);
        codeBuf = []; inCode = false;
      } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (!line.trim()) { closeList(); out.push(''); continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if (/^[-*+]\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(line.replace(/^[-*+]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      closeList();
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      out.push(`<table><tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr></table>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
  return out.join('\n');
}

export function buildPrintHtml(tab: Tab): string {
  let body = '';
  if (tab.kind === 'markdown') {
    body = mdToHtml(tab.text);
  } else if (tab.kind === 'sheet') {
    const rows = tab.rows
      .map((row, i) => `<tr>${row.map((cell) => (i === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join('')}</tr>`)
      .join('');
    body = `<h1>${escapeHtml(tab.name.replace(/\.[^.]+$/, ''))}</h1><table>${rows}</table>`;
  } else if (tab.kind === 'slides') {
    body = tab.slides
      .map(
        (slide, i) => `<section class="pdf-page"><div class="meta">${i + 1} / ${tab.slides.length}</div><h1>${escapeHtml(slide.title)}</h1>${slide.lines
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')}</section>`,
      )
      .join('');
  } else if (tab.kind === 'text' || tab.kind === 'code') {
    body = `<h1>${escapeHtml(tab.name.replace(/\.[^.]+$/, ''))}</h1><pre class="code-block">${escapeHtml(tab.text)}</pre>`;
  } else if (tab.kind === 'pdf') {
    body = `<h1>${escapeHtml(tab.name)}</h1><p class="meta">PDF 文件，请在应用内查看。</p>`;
  } else {
    body = tab.html || '<p></p>';
  }
  return `${HTML_HEAD}${body}</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toMarkdown(tab: Tab): string {
  if (tab.kind === 'markdown') return tab.text;
  if (tab.kind === 'sheet') return toDelimited(tab.rows, ',');
  if (tab.kind === 'slides') {
    return tab.slides.map((s) => `# ${s.title}\n\n${s.lines.map((l) => `- ${l}`).join('\n')}`).join('\n\n---\n\n');
  }
  if (tab.kind === 'text' || tab.kind === 'code') return tab.text;
  const html = tab.html;
  const text = htmlToText(html);
  return text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).join('\n\n');
}

export function toRtf(text: string): string {
  const encoded = text.split('').map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch === '\n') return '\\par\n';
    if (ch === '\t') return '\\tab ';
    if (code > 127) return `\\u${code}?`;
    if ('\\{}'.includes(ch)) return `\\${ch}`;
    return ch;
  }).join('');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Microsoft YaHei;}}\\f0\\fs22 ${encoded}}`;
}

export function toHtmlDocument(tab: Tab): string {
  let body = tab.html;
  if (tab.kind === 'markdown') body = mdToHtml(tab.text);
  if (tab.kind === 'text' || tab.kind === 'code') body = `<pre>${escapeHtml(tab.text)}</pre>`;
  if (tab.kind === 'sheet') body = buildPrintHtml(tab);
  return `${HTML_HEAD}${body}</body></html>`;
}

/* ------------------------------------------------------------------ */
/* DOCX                                                               */
/* ------------------------------------------------------------------ */

export async function buildDocx(tab: Tab): Promise<Serialized> {
  const docx = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, BorderStyle,
  } = docx;

  const root = document.createElement('div');
  if (tab.kind === 'markdown') root.innerHTML = sanitizeHtml(mdToHtml(tab.text));
  else if (tab.kind === 'text' || tab.kind === 'code') {
    root.innerHTML = tab.text.split('\n').map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
  } else if (tab.kind === 'sheet') {
    root.innerHTML = `<table>${tab.rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  } else if (tab.kind === 'slides') {
    root.innerHTML = tab.slides.map((s) => `<h1>${escapeHtml(s.title)}</h1>${s.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}`).join('');
  } else {
    root.innerHTML = tab.html || '';
  }

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  async function inlineRuns(node: Node, style: { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; code?: boolean; color?: string } = {}): Promise<InstanceType<typeof TextRun>[]> {
    const runs: InstanceType<typeof TextRun>[] = [];
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        if (text) {
          runs.push(new TextRun({
            text,
            bold: style.bold,
            italics: style.italics,
            strike: style.strike,
            font: style.code ? 'Consolas' : 'Microsoft YaHei',
            size: style.code ? 20 : 23,
            color: style.color,
          }));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'br') { runs.push(new TextRun({ break: 1 })); continue; }
        const next = {
          bold: style.bold || tag === 'strong' || tag === 'b',
          italics: style.italics || tag === 'em' || tag === 'i',
          underline: style.underline || tag === 'u',
          strike: style.strike || tag === 's' || tag === 'del',
          code: style.code || tag === 'code',
          color: el.style?.color?.startsWith('#') ? el.style.color.replace('#', '') : style.color,
        };
        runs.push(...(await inlineRuns(el, next)));
      }
    }
    return runs;
  }

  async function visit(el: HTMLElement): Promise<void> {
    const tag = el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      const level = tag === 'h1' ? HeadingLevel.HEADING_1 : tag === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(new Paragraph({ heading: level, children: await inlineRuns(el, { bold: true }), spacing: { before: 240, after: 120 } }));
      return;
    }
    if (tag === 'p' || tag === 'div') {
      children.push(new Paragraph({ children: await inlineRuns(el), spacing: { after: 120, line: 300 } }));
      el.querySelectorAll(':scope > ul, :scope > ol').forEach((list) => visit(list as HTMLElement));
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      Array.from(el.children).forEach((li, index) => {
        const text = (li.textContent || '').trim();
        if (!text) return;
        children.push(new Paragraph({
          text,
          bullet: tag === 'ul' ? { level: 0 } : undefined,
          numbering: tag === 'ol' ? { reference: 'ordered', level: 0 } : undefined,
          spacing: { after: 60 },
        }));
        if (index > 400) return;
      });
      return;
    }
    if (tag === 'blockquote') {
      children.push(new Paragraph({
        children: await inlineRuns(el, { italics: true, color: '5C5A54' }),
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'C0492B', space: 12 } },
        spacing: { after: 120 },
      }));
      return;
    }
    if (tag === 'pre') {
      (el.textContent || '').split('\n').forEach((line) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 20, color: '3A3A34' })],
          shading: { fill: 'F4F1EA' },
          spacing: { after: 0, line: 260 },
        }));
      });
      return;
    }
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('th,td')).map((cell) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: (cell.textContent || '').trim() || ' ', bold: cell.tagName === 'TH', font: 'Microsoft YaHei', size: 20 })] })],
            shading: cell.tagName === 'TH' ? { fill: 'F4F1EA' } : undefined,
          }),
        );
        return new TableRow({ children: cells });
      });
      if (rows.length) children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      return;
    }
    if (tag === 'img') {
      const src = (el as HTMLImageElement).src;
      const match = src.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/);
      if (match) {
        const isPng = match[1] === 'png';
        const data = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        children.push(new Paragraph({
          children: [new ImageRun({
            data,
            type: isPng ? 'png' : 'jpg',
            transformation: { width: 520, height: 320 },
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }));
      }
      return;
    }
    if (tag === 'hr') {
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDD8CC' } }, text: '' }));
      return;
    }
    if (['br'].includes(tag)) return;
    Array.from(el.children).forEach((child) => { void visit(child as HTMLElement); });
  }

  for (const child of Array.from(root.children)) await visit(child as HTMLElement);
  if (children.length === 0) children.push(new Paragraph({ text: '' }));

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'ordered',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    styles: {
      default: {
        document: { run: { font: 'Microsoft YaHei', size: 23, color: '1B1B19' }, paragraph: { spacing: { line: 300 } } },
      },
    },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
  });

  const blob = await Packer.toBlob(doc);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    base64: base64FromBytes(bytes),
    name: tab.name.replace(/\.[^.]+$/, '') + '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

/* ------------------------------------------------------------------ */
/* XLSX / PPTX / ODT                                                  */
/* ------------------------------------------------------------------ */

export async function buildXlsx(tab: Tab): Promise<Serialized> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(tab.rows.length ? tab.rows : [['']]);
  sheet['!cols'] = Array.from({ length: Math.max(6, tab.rows[0]?.length ?? 0) }, (_, i) => ({
    wch: Math.min(42, Math.max(10, ...tab.rows.slice(0, 50).map((r) => String(r[i] ?? '').length + 4))),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, '工作表1');
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return {
    base64: base64FromBytes(new Uint8Array(data)),
    name: tab.name.replace(/\.[^.]+$/, '') + '.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export async function buildPptx(tab: Tab): Promise<Serialized> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = '墨枢 Office Agent';
  pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei' };

  const slides = tab.kind === 'slides' ? tab.slides : [{ title: tab.name.replace(/\.[^.]+$/, ''), lines: htmlToText(tab.html).split('\n').filter(Boolean).slice(0, 10) }];
  slides.forEach((slide, index) => {
    const s = pptx.addSlide();
    s.background = { color: index === 0 ? '1B1B19' : 'FBFAF7' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: 'C0492B' } });
    s.addText(slide.title || '未命名', {
      x: 0.7, y: 0.6, w: 11.6, h: 1.1,
      fontSize: 32, bold: true, color: index === 0 ? 'F4F1EA' : '1B1B19',
      fontFace: 'Microsoft YaHei',
    });
    if (slide.lines.length) {
      s.addText(slide.lines.map((line) => ({ text: line, options: { bullet: true, breakLine: true } })), {
        x: 0.85, y: 2.0, w: 11.2, h: 4.6,
        fontSize: 16, color: index === 0 ? 'DDD8CC' : '3A3A34',
        lineSpacingMultiple: 1.5, fontFace: 'Microsoft YaHei',
      });
    }
    s.addText(`墨枢 · ${index + 1} / ${slides.length}`, {
      x: 10.6, y: 6.9, w: 2.2, h: 0.3, fontSize: 9, color: '8E8A80', align: 'right',
    });
  });

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    base64: base64FromBytes(bytes),
    name: tab.name.replace(/\.[^.]+$/, '') + '.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
}

export async function buildOdt(tab: Tab): Promise<Serialized> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const text = tab.kind === 'rich' ? htmlToText(tab.html) : tab.kind === 'markdown' ? tab.text : tab.text || htmlToText(tab.html);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const body = paragraphs
    .map((p) => `<text:p text:style-name="Standard">${escapeHtml(p).replace(/\n/g, '<text:line-break/>')}</text:p>`)
    .join('\n');
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
<office:body><office:text>${body || '<text:p/>'}</office:text></office:body>
</office:document-content>`;
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', content);
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`);
  const buffer = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/vnd.oasis.opendocument.text' });
  return {
    base64: base64FromBytes(buffer),
    name: tab.name.replace(/\.[^.]+$/, '') + '.odt',
    mime: 'application/vnd.oasis.opendocument.text',
  };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                */
/* ------------------------------------------------------------------ */

export async function buildPdf(tab: Tab): Promise<Serialized> {
  const html = buildPrintHtml(tab);
  if (isDesktop && api) {
    const result = await api.exportPdf(html, tab.name.replace(/\.[^.]+$/, '') + '.pdf');
    return { base64: result.base64, name: result.name, mime: 'application/pdf' };
  }
  const base64 = await rasterPdf(html);
  return { base64, name: tab.name.replace(/\.[^.]+$/, '') + '.pdf', mime: 'application/pdf' };
}

async function rasterPdf(html: string): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const { PDFDocument } = await import('pdf-lib');
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:56px 60px;background:#fff;z-index:-1;';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  await new Promise((r) => setTimeout(r, 120));
  const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  holder.remove();

  const pageHeightPx = Math.floor(canvas.width * (297 / 210));
  const pdf = await PDFDocument.create();
  let offset = 0;
  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = pageHeightPx;
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const png = slice.toDataURL('image/png');
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    offset += pageHeightPx;
  }
  if (pdf.getPageCount() === 0) pdf.addPage([595.28, 841.89]);
  const bytes = await pdf.save();
  return base64FromBytes(bytes);
}

/* ------------------------------------------------------------------ */
/* 序列化                                                             */
/* ------------------------------------------------------------------ */

export async function serializeForSave(tab: Tab, targetExt?: string): Promise<Serialized> {
  const ext = (targetExt || tab.ext || 'txt').toLowerCase();
  switch (ext) {
    case 'docx':
      return buildDocx(tab);
    case 'pdf':
      if (tab.kind === 'pdf' && tab.pdfBase64) {
        return { base64: tab.pdfBase64, name: tab.name, mime: 'application/pdf' };
      }
      return buildPdf(tab);
    case 'xlsx':
    case 'xls':
      return buildXlsx(tab);
    case 'pptx':
      return buildPptx(tab);
    case 'odt':
      return buildOdt(tab);
    case 'csv':
      return { text: toDelimited(tab.rows, ','), name: ensureExt(tab.name, 'csv'), mime: 'text/csv' };
    case 'tsv':
      return { text: toDelimited(tab.rows, '\t'), name: ensureExt(tab.name, 'tsv'), mime: 'text/tab-separated-values' };
    case 'md':
    case 'markdown':
      return { text: toMarkdown(tab), name: ensureExt(tab.name, 'md'), mime: 'text/markdown' };
    case 'html':
    case 'htm':
      return { text: toHtmlDocument(tab), name: ensureExt(tab.name, 'html'), mime: 'text/html' };
    case 'rtf':
      return { text: toRtf(tab.kind === 'rich' ? htmlToText(tab.html) : toMarkdown(tab)), name: ensureExt(tab.name, 'rtf'), mime: 'application/rtf' };
    case 'tex':
      return { text: toMarkdown(tab), name: ensureExt(tab.name, 'tex'), mime: 'text/x-tex' };
    case 'json': {
      if (tab.kind === 'code') return { text: tab.text, name: ensureExt(tab.name, 'json'), mime: 'application/json' };
      return { text: JSON.stringify({ content: toMarkdown(tab) }, null, 2), name: ensureExt(tab.name, 'json'), mime: 'application/json' };
    }
    case 'yaml':
    case 'yml':
      return { text: tab.text, name: ensureExt(tab.name, ext), mime: 'text/yaml' };
    default: {
      if (tab.kind === 'rich') {
        return { text: tab.html, name: ensureExt(tab.name, ext), mime: 'text/plain' };
      }
      if (tab.kind === 'sheet') {
        return { text: toDelimited(tab.rows, ','), name: ensureExt(tab.name, ext), mime: 'text/plain' };
      }
      if (tab.kind === 'slides') {
        return { text: tab.slides.map((s) => `${s.title}\n${s.lines.join('\n')}`).join('\n\n'), name: ensureExt(tab.name, ext), mime: 'text/plain' };
      }
      if (tab.kind === 'pdf') return { base64: tab.pdfBase64 ?? '', name: ensureExt(tab.name, 'pdf'), mime: 'application/pdf' };
      return { text: tab.text, name: ensureExt(tab.name, ext), mime: 'text/plain' };
    }
  }
}

function ensureExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name.replace(/\.[^.]+$/, '')}.${ext}`;
}
