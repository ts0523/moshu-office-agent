import type { DocKind, SlideContent } from '../types';
import { bytesFromBase64 } from './fsapi';

export interface ParsedDoc {
  kind: DocKind;
  html?: string;
  text?: string;
  rows?: string[][];
  slides?: SlideContent[];
  pdfBase64?: string;
  readOnly?: boolean;
  warning?: string;
}

const EMPTY_HTML = '<p><br></p>';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  div.querySelectorAll('p,div,h1,h2,h3,h4,li,tr,blockquote,pre').forEach((el) => el.append('\n'));
  return (div.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block).replace(/\n/g, '<br>') || '<br>'}</p>`)
    .join('');
}

export function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((el) => el.remove());
  div.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || (attr.name === 'href' && /^javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return div.innerHTML || EMPTY_HTML;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                */
/* ------------------------------------------------------------------ */

export function parseDelimited(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows.length ? rows : [['']];
}

export function toDelimited(rows: string[][], delimiter = ','): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? '';
          return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(delimiter),
    )
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* DOCX / 旧版 DOC                                                     */
/* ------------------------------------------------------------------ */

async function parseDocx(base64: string): Promise<ParsedDoc> {
  const mammoth = await import('mammoth');
  const arrayBuffer = bytesFromBase64(base64).buffer as ArrayBuffer;
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => p.subtitle:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
      convertImage: mammoth.images.imgElement(async (image: { read: (encoding: string) => Promise<string>; contentType: string }) => {
        const data = await image.read('base64');
        return { src: `data:${image.contentType};base64,${data}` };
      }),
    },
  );
  return {
    kind: 'rich',
    html: sanitizeHtml(result.value || EMPTY_HTML),
    warning: result.messages?.length ? `${result.messages.length} 处格式被简化` : undefined,
  };
}

function extractLegacyBinary(base64: string): string {
  const bytes = bytesFromBase64(base64);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return utf8
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。；：、（）《》！？\s.,;:()"'\-_/\\%]/g, '')
    .replace(/\s{3,}/g, '\n')
    .trim()
    .slice(0, 30000);
}

/* ------------------------------------------------------------------ */
/* PDF                                                                */
/* ------------------------------------------------------------------ */

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function extractPdfText(base64: string): Promise<string> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytesFromBase64(base64)) }).promise;
  const parts: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        parts.push(line.trim());
        line = '';
      }
      line += item.str;
      lastY = y;
    }
    if (line.trim()) parts.push(line.trim());
    parts.push('');
  }
  await doc.destroy();
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------------ */
/* XLSX / ODS                                                         */
/* ------------------------------------------------------------------ */

async function parseXlsx(base64: string): Promise<ParsedDoc> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(base64, { type: 'base64' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  const rows = raw.slice(0, 500).map((row) => (row as unknown[]).slice(0, 80).map((cell) => String(cell ?? '')));
  return { kind: 'sheet', rows: rows.length ? rows : [['']] };
}

function parseOds(xml: string): string[][] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rows: string[][] = [];
  const tableRows = Array.from(doc.getElementsByTagNameNS('*', 'table-row')).slice(0, 500);
  for (const row of tableRows) {
    const cells: string[] = [];
    for (const cell of Array.from(row.getElementsByTagNameNS('*', 'table-cell'))) {
      const repeat = Number(cell.getAttribute('table:number-columns-repeated') || '1');
      const texts = Array.from(cell.getElementsByTagNameNS('*', 'p')).map((p) => p.textContent || '');
      const value = texts.join(' ').trim();
      for (let i = 0; i < Math.min(repeat, 80); i += 1) cells.push(value);
    }
    rows.push(cells.slice(0, 80));
  }
  return rows.length ? rows : [['']];
}

/* ------------------------------------------------------------------ */
/* ODT / ODP / PPTX                                                   */
/* ------------------------------------------------------------------ */

function odfParagraphs(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: string[] = [];
  const nodes = Array.from(doc.getElementsByTagName('*')).filter((el) =>
    ['p', 'h', 'list-item', 'table-cell'].includes(el.localName),
  );
  for (const node of nodes) {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

async function parseOdt(base64: string): Promise<ParsedDoc> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytesFromBase64(base64));
  const content = await zip.file('content.xml')?.async('string');
  if (!content) throw new Error('ODT 缺少 content.xml');
  const texts = odfParagraphs(content);
  return {
    kind: 'rich',
    html: texts.map((t, i) => (i === 0 ? `<h1>${esc(t)}</h1>` : `<p>${esc(t)}</p>`)).join('') || EMPTY_HTML,
  };
}

async function parsePptx(base64: string): Promise<ParsedDoc> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytesFromBase64(base64));
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const slides: SlideContent[] = [];
  for (const file of slideFiles) {
    const xml = await zip.file(file)?.async('string');
    if (!xml) continue;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const texts = Array.from(doc.getElementsByTagNameNS('*', 't'))
      .map((t) => (t.textContent || '').trim())
      .filter(Boolean);
    slides.push({ title: texts[0] || `第 ${slides.length + 1} 页`, lines: texts.slice(1) });
  }
  return { kind: 'slides', slides: slides.length ? slides : [{ title: '空白演示', lines: [] }] };
}

async function parseOdp(base64: string): Promise<ParsedDoc> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytesFromBase64(base64));
  const content = await zip.file('content.xml')?.async('string');
  if (!content) throw new Error('ODP 缺少 content.xml');
  const doc = new DOMParser().parseFromString(content, 'application/xml');
  const pages = Array.from(doc.getElementsByTagNameNS('*', 'page'));
  const slides: SlideContent[] = pages.map((page, index) => {
    const texts = Array.from(page.getElementsByTagNameNS('*', 'p'))
      .map((p) => (p.textContent || '').trim())
      .filter(Boolean);
    return { title: texts[0] || `第 ${index + 1} 页`, lines: texts.slice(1) };
  });
  return { kind: 'slides', slides: slides.length ? slides : [{ title: '空白演示', lines: [] }] };
}

/* ------------------------------------------------------------------ */
/* RTF / HTML / Markdown                                              */
/* ------------------------------------------------------------------ */

function parseRtf(text: string): string {
  return text
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_m, num) => String.fromCharCode((Number(num) + 65536) % 65536))
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseHtmlDoc(name: string, text: string): ParsedDoc {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const body = doc.body?.innerHTML || '';
  return { kind: 'rich', html: sanitizeHtml(body || `<p>${esc(name)}</p>`) };
}

/* ------------------------------------------------------------------ */
/* 统一入口                                                           */
/* ------------------------------------------------------------------ */

export async function parseDocument(
  name: string,
  payload: { text?: string; base64?: string; ext?: string },
): Promise<ParsedDoc> {
  const ext = (payload.ext || name.split('.').pop() || '').toLowerCase();
  const text = payload.text ?? '';
  const base64 = payload.base64 ?? '';

  switch (ext) {
    case 'docx':
      return parseDocx(base64);
    case 'doc':
      return {
        kind: 'rich',
        html: `<p>${esc(extractLegacyBinary(base64).slice(0, 8000))}</p>`,
        readOnly: true,
        warning: '旧版 .doc 为二进制格式，仅提取可读文本；建议另存为 .docx 后编辑',
      };
    case 'pdf':
      return { kind: 'pdf', pdfBase64: base64 };
    case 'xlsx':
    case 'xls':
      return parseXlsx(base64);
    case 'ods': {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(bytesFromBase64(base64));
      const content = await zip.file('content.xml')?.async('string');
      if (!content) throw new Error('ODS 缺少 content.xml');
      return { kind: 'sheet', rows: parseOds(content), readOnly: true };
    }
    case 'pptx':
      return parsePptx(base64);
    case 'odp':
      return parseOdp(base64);
    case 'odt':
      return parseOdt(base64);
    case 'rtf': {
      const plain = parseRtf(text);
      return { kind: 'rich', html: plainToHtml(plain) };
    }
    case 'html':
    case 'htm':
      return parseHtmlDoc(name, text);
    case 'md':
    case 'markdown':
      return { kind: 'markdown', text };
    case 'csv':
      return { kind: 'sheet', rows: parseDelimited(text, ',') };
    case 'tsv':
      return { kind: 'sheet', rows: parseDelimited(text, '\t') };
    case 'json':
    case 'yaml':
    case 'yml':
    case 'xml':
    case 'toml':
    case 'ini':
    case 'tex':
    case 'sql':
    case 'js':
    case 'ts':
    case 'py':
    case 'css':
      return { kind: 'code', text };
    case 'txt':
    case 'log':
      return { kind: 'text', text };
    default:
      if (base64) {
        return {
          kind: 'rich',
          html: `<p>${esc(extractLegacyBinary(base64).slice(0, 8000))}</p>`,
          readOnly: true,
          warning: '未知二进制格式，已尝试提取文本',
        };
      }
      return { kind: 'text', text };
  }
}
