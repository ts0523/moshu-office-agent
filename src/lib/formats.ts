import type { DocKind } from '../types';

export type FormatGroup = '文档' | '表格' | '演示' | '数据' | '代码' | '网页';

export interface FormatSpec {
  ext: string;
  label: string;
  group: FormatGroup;
  kind: DocKind;
  write: boolean;
  mime: string;
  note?: string;
}

const F = (ext: string, label: string, group: FormatGroup, kind: DocKind, write: boolean, mime: string, note?: string): FormatSpec => ({
  ext, label, group, kind, write, mime, note,
});

/** 30 种可识别格式，其中 24 种支持写入 */
export const FORMATS: FormatSpec[] = [
  F('docx', 'Word 文档', '文档', 'rich', true, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  F('doc', 'Word 97-2003', '文档', 'rich', false, 'application/msword', '旧版只读，建议转存 docx'),
  F('pdf', 'PDF 文档', '文档', 'pdf', true, 'application/pdf'),
  F('md', 'Markdown', '文档', 'markdown', true, 'text/markdown'),
  F('markdown', 'Markdown', '文档', 'markdown', true, 'text/markdown'),
  F('txt', '纯文本', '文档', 'text', true, 'text/plain'),
  F('rtf', 'RTF 富文本', '文档', 'rich', true, 'application/rtf'),
  F('odt', 'OpenDocument 文本', '文档', 'rich', true, 'application/vnd.oasis.opendocument.text'),
  F('tex', 'LaTeX 源稿', '文档', 'code', true, 'text/x-tex'),
  F('html', 'HTML 页面', '网页', 'rich', true, 'text/html'),
  F('htm', 'HTML 页面', '网页', 'rich', true, 'text/html'),
  F('csv', 'CSV 表格', '表格', 'sheet', true, 'text/csv'),
  F('tsv', 'TSV 表格', '表格', 'sheet', true, 'text/tab-separated-values'),
  F('xlsx', 'Excel 工作簿', '表格', 'sheet', true, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  F('xls', 'Excel 97-2003', '表格', 'sheet', false, 'application/vnd.ms-excel', '旧版只读，可另存 xlsx'),
  F('ods', 'OpenDocument 表格', '表格', 'sheet', false, 'application/vnd.oasis.opendocument.spreadsheet'),
  F('pptx', 'PowerPoint 演示', '演示', 'slides', true, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
  F('odp', 'OpenDocument 演示', '演示', 'slides', false, 'application/vnd.oasis.opendocument.presentation'),
  F('json', 'JSON 数据', '数据', 'code', true, 'application/json'),
  F('yaml', 'YAML 配置', '数据', 'code', true, 'text/yaml'),
  F('yml', 'YAML 配置', '数据', 'code', true, 'text/yaml'),
  F('xml', 'XML 文档', '数据', 'code', true, 'application/xml'),
  F('toml', 'TOML 配置', '数据', 'code', true, 'text/plain'),
  F('ini', 'INI 配置', '数据', 'code', true, 'text/plain'),
  F('log', '日志文件', '数据', 'text', true, 'text/plain'),
  F('sql', 'SQL 脚本', '代码', 'code', true, 'text/x-sql'),
  F('js', 'JavaScript', '代码', 'code', true, 'text/javascript'),
  F('ts', 'TypeScript', '代码', 'code', true, 'text/typescript'),
  F('py', 'Python', '代码', 'code', true, 'text/x-python'),
  F('css', 'CSS 样式', '代码', 'code', true, 'text/css'),
];

export const FORMAT_MAP = new Map<string, FormatSpec>(FORMATS.map((f) => [f.ext, f]));

export function extOf(name: string): string {
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1];
}

export function isBoardFile(name: string): boolean {
  return name.toLowerCase().endsWith('.board.json');
}

export function specOf(name: string): FormatSpec {
  if (isBoardFile(name)) {
    return F('board.json', '方片画布', '文档', 'board', true, 'application/json');
  }
  return FORMAT_MAP.get(extOf(name)) ?? F(extOf(name) || 'txt', '未知格式', '文档', 'text', true, 'text/plain');
}

export function kindOf(name: string): DocKind {
  return specOf(name).kind;
}

export const WRITABLE_COUNT = FORMATS.filter((f) => f.write && !['markdown', 'yml'].includes(f.ext)).length;

export const CREATE_GROUPS: { group: FormatGroup; items: FormatSpec[] }[] = (
  ['文档', '表格', '演示', '数据', '代码', '网页'] as FormatGroup[]
).map((group) => ({
  group,
  items: FORMATS.filter((f) => f.group === group && f.write && f.ext !== 'markdown' && f.ext !== 'yml'),
}));
