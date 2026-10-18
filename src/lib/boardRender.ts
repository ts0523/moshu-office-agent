import type { Board, BoardEdge, BoardNode, Port, Tone } from '../types';

export type RenderStyle = 'plain' | 'blueprint' | 'flat' | 'sketch' | 'neon' | 'editorial';

export interface RenderOptions {
  scale?: number;
  padding?: number;
  style?: RenderStyle;
  title?: string;
  subtitle?: string;
  watermark?: boolean;
  viewport?: { x: number; y: number; w: number; h: number };
}

export const TONE_COLORS: Record<Tone, string> = {
  ink: '#1B1B19',
  clay: '#C0492B',
  moss: '#2E5E52',
  sky: '#3B6E8F',
  sand: '#B98A3E',
};

const STYLE_BG: Record<RenderStyle, string> = {
  plain: '#F7F5F0',
  blueprint: '#0B1D33',
  flat: '#FBF4E8',
  sketch: '#FAF7EF',
  neon: '#08070C',
  editorial: '#F2EDE2',
};

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached?.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { imageCache.set(src, img); resolve(img); };
    img.onerror = reject;
    img.src = src;
  });
}

export function portPoint(node: BoardNode, port: Port): { x: number; y: number } {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  switch (port) {
    case 'top': return { x: cx, y: node.y };
    case 'bottom': return { x: cx, y: node.y + node.h };
    case 'left': return { x: node.x, y: cy };
    default: return { x: node.x + node.w, y: cy };
  }
}

export function nodeById(board: Board, id: string): BoardNode | undefined {
  return board.nodes.find((n) => n.id === id);
}

export function edgePath(from: BoardNode, fromPort: Port, to: BoardNode, toPort: Port): string {
  const a = portPoint(from, fromPort);
  const b = portPoint(to, toPort);
  const offset = Math.max(56, Math.min(180, Math.hypot(b.x - a.x, b.y - a.y) * 0.35));
  const dir = (port: Port) => {
    if (port === 'left') return { x: -offset, y: 0 };
    if (port === 'right') return { x: offset, y: 0 };
    if (port === 'top') return { x: 0, y: -offset };
    return { x: 0, y: offset };
  };
  const d1 = dir(fromPort);
  const d2 = dir(toPort);
  return `M ${a.x} ${a.y} C ${a.x + d1.x} ${a.y + d1.y}, ${b.x + d2.x} ${b.y + d2.y}, ${b.x} ${b.y}`;
}

export function boundsOf(board: Board, padding = 80) {
  if (!board.nodes.length) return { x: 0, y: 0, w: 900, h: 600 };
  const xs = board.nodes.map((n) => n.x);
  const ys = board.nodes.map((n) => n.y);
  const xe = board.nodes.map((n) => n.x + n.w);
  const ye = board.nodes.map((n) => n.y + n.h);
  const x = Math.min(...xs) - padding;
  const y = Math.min(...ys) - padding - 30;
  return {
    x,
    y,
    w: Math.max(...xe) - Math.min(...xs) + padding * 2,
    h: Math.max(...ye) - Math.min(...ys) + padding * 2 + 30,
  };
}

function toneOf(node: BoardNode): string {
  return TONE_COLORS[(node.tone ?? 'ink') as Tone] ?? TONE_COLORS.ink;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const rawLine of String(text ?? '').split('\n')) {
    if (!rawLine) { result.push(''); continue; }
    let line = '';
    for (const ch of rawLine) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        result.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

function drawBackground(ctx: CanvasRenderingContext2D, style: RenderStyle, w: number, h: number) {
  const bg = STYLE_BG[style];
  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (style === 'blueprint') {
    grad.addColorStop(0, '#0B1D33');
    grad.addColorStop(0.55, '#102B49');
    grad.addColorStop(1, '#071626');
  } else if (style === 'neon') {
    grad.addColorStop(0, '#08070C');
    grad.addColorStop(0.5, '#120B20');
    grad.addColorStop(1, '#05060B');
  } else if (style === 'flat') {
    grad.addColorStop(0, '#FDF7EE');
    grad.addColorStop(1, '#F6E9D8');
  } else if (style === 'editorial') {
    grad.addColorStop(0, '#F5F0E6');
    grad.addColorStop(1, '#EDE5D6');
  } else if (style === 'sketch') {
    grad.addColorStop(0, '#FCF9F2');
    grad.addColorStop(1, '#F3EDDF');
  } else {
    grad.addColorStop(0, '#F9F7F2');
    grad.addColorStop(1, '#F2EEE5');
  }
  ctx.fillStyle = style === 'plain' ? bg : grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  if (style === 'blueprint') {
    ctx.strokeStyle = 'rgba(96, 190, 235, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(96, 190, 235, 0.28)';
    ctx.setLineDash([2, 10]);
    for (let x = 24; x <= w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 24; y <= h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.setLineDash([]);
  } else if (style === 'neon') {
    const g1 = ctx.createRadialGradient(w * 0.25, h * 0.2, 0, w * 0.25, h * 0.2, w * 0.5);
    g1.addColorStop(0, 'rgba(255, 60, 172, 0.20)');
    g1.addColorStop(1, 'rgba(255, 60, 172, 0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createRadialGradient(w * 0.8, h * 0.75, 0, w * 0.8, h * 0.75, w * 0.45);
    g2.addColorStop(0, 'rgba(50, 220, 255, 0.18)');
    g2.addColorStop(1, 'rgba(50, 220, 255, 0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else if (style === 'sketch') {
    ctx.strokeStyle = 'rgba(120, 110, 90, 0.10)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(90,70,40,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
  } else if (style === 'editorial') {
    ctx.strokeStyle = 'rgba(27,27,25,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const x = (w / 8) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(27,27,25,0.55)';
    ctx.font = '11px "Cascadia Code", monospace';
    ctx.fillText('MOSHU / BOARD SERIES', 52, 52);
    ctx.fillStyle = 'rgba(192,73,43,0.9)';
    ctx.fillRect(52, 64, 46, 3);
  } else {
    ctx.fillStyle = 'rgba(27,27,25,0.10)';
    for (let x = 24; x < w; x += 24) {
      for (let y = 24; y < h; y += 24) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawEdge(ctx: CanvasRenderingContext2D, board: Board, edge: BoardEdge, style: RenderStyle) {
  const from = nodeById(board, edge.from.nodeId);
  const to = nodeById(board, edge.to.nodeId);
  if (!from || !to) return;
  const d = edgePath(from, edge.from.port, to, edge.to.port);
  const path = new Path2D(d);
  const tone = TONE_COLORS[(edge.tone ?? 'ink') as Tone] ?? TONE_COLORS.ink;

  ctx.save();
  if (style === 'blueprint') {
    ctx.strokeStyle = 'rgba(110, 215, 255, 0.9)';
    ctx.shadowColor = 'rgba(90, 200, 255, 0.7)';
    ctx.shadowBlur = 10;
  } else if (style === 'neon') {
    ctx.strokeStyle = tone === TONE_COLORS.ink ? '#6FF3FF' : tone;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 14;
  } else if (style === 'sketch') {
    ctx.strokeStyle = '#4C4638';
    ctx.lineWidth = 1.6;
  } else if (style === 'editorial') {
    ctx.strokeStyle = '#1B1B19';
  } else {
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.7;
  }
  ctx.lineWidth = ctx.lineWidth || 1.7;
  if (edge.dashed) ctx.setLineDash([7, 7]);
  ctx.stroke(path);
  ctx.setLineDash([]);

  // 箭头
  const p = portPoint(to, edge.to.port);
  const dir = edge.to.port === 'left' ? Math.PI : edge.to.port === 'right' ? 0 : edge.to.port === 'top' ? -Math.PI / 2 : Math.PI / 2;
  const size = 9;
  ctx.beginPath();
  ctx.moveTo(p.x - Math.cos(dir - 0.42) * size * 1.8, p.y - Math.sin(dir - 0.42) * size * 1.8);
  ctx.lineTo(p.x, p.y);
  ctx.lineTo(p.x - Math.cos(dir + 0.42) * size * 1.8, p.y - Math.sin(dir + 0.42) * size * 1.8);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.fill();
  ctx.shadowBlur = 0;

  if (edge.label) {
    const a = portPoint(from, edge.from.port);
    const b = portPoint(to, edge.to.port);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    const width = ctx.measureText(edge.label).width + 14;
    ctx.fillStyle = style === 'blueprint' ? 'rgba(8, 24, 42, 0.92)' : style === 'neon' ? 'rgba(10,8,18,0.92)' : 'rgba(251,250,247,0.94)';
    roundRect(ctx, mx - width / 2, my - 11, width, 22, 11);
    ctx.fill();
    ctx.fillStyle = style === 'blueprint' ? '#9FE4FF' : style === 'neon' ? '#8DF4FF' : '#5C5A54';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.label, mx, my + 0.5);
  }
  ctx.restore();
}

function drawNode(ctx: CanvasRenderingContext2D, style: RenderStyle, node: BoardNode) {
  const tone = toneOf(node);
  const dark = style === 'blueprint' || style === 'neon';

  ctx.save();
  if (node.kind === 'annotation-circle') {
    ctx.strokeStyle = style === 'blueprint' ? 'rgba(255,190,120,0.95)' : tone;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(node.x + node.w / 2, node.y + node.h / 2, node.w / 2, node.h / 2, -0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(node.x + node.w / 2 + 2, node.y + node.h / 2 + 2, node.w / 2 + 1, node.h / 2 - 1, 0.03, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = style === 'blueprint' ? '#FFE3C2' : style === 'neon' ? '#FFD0E9' : tone;
    ctx.font = '600 17px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = node.title || '标注';
    ctx.fillText(label, node.x + node.w / 2, node.y + node.h / 2);
    ctx.restore();
    return;
  }

  if (node.kind === 'ink') {
    ctx.strokeStyle = style === 'blueprint' ? '#7DE0FF' : tone;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (node.points && node.points.length > 3) {
      ctx.beginPath();
      ctx.moveTo(node.x + node.points[0], node.y + node.points[1]);
      for (let i = 2; i < node.points.length; i += 2) {
        ctx.lineTo(node.x + node.points[i], node.y + node.points[i + 1]);
      }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  let fill = '#FFFFFF';
  let stroke = 'rgba(226,221,210,0.9)';
  let titleColor = '#1B1B19';
  let bodyColor = '#5C5A54';

  if (style === 'blueprint') {
    fill = 'rgba(12, 36, 60, 0.82)';
    stroke = 'rgba(110, 215, 255, 0.55)';
    titleColor = '#EAF7FF';
    bodyColor = 'rgba(200, 228, 244, 0.72)';
  } else if (style === 'neon') {
    fill = 'rgba(20, 16, 32, 0.9)';
    stroke = 'rgba(140, 220, 255, 0.32)';
    titleColor = '#FFFFFF';
    bodyColor = 'rgba(220, 230, 255, 0.62)';
  } else if (style === 'flat') {
    fill = '#FFFDF8';
    stroke = 'rgba(64, 48, 28, 0.12)';
  } else if (style === 'sketch') {
    fill = 'rgba(255, 253, 246, 0.96)';
    stroke = 'rgba(76, 70, 56, 0.55)';
  } else if (style === 'editorial') {
    fill = 'rgba(255, 253, 248, 0.98)';
    stroke = 'rgba(27, 27, 25, 0.28)';
  }

  ctx.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(27,27,25,0.10)';
  ctx.shadowBlur = dark ? 26 : 18;
  ctx.shadowOffsetY = dark ? 10 : 6;

  if (node.kind === 'image') {
    roundRect(ctx, node.x, node.y, node.w, node.h, 14);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (node.image) {
      const img = imageCache.get(node.image);
      if (img) {
        ctx.save();
        roundRect(ctx, node.x, node.y, node.w, node.h, 14);
        ctx.clip();
        const ratio = Math.max(node.w / img.width, node.h / img.height);
        const dw = img.width * ratio;
        const dh = img.height * ratio;
        ctx.drawImage(img, node.x + (node.w - dw) / 2, node.y + (node.h - dh) / 2, dw, dh);
        ctx.restore();
      }
    } else {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([7, 6]);
      roundRect(ctx, node.x, node.y, node.w, node.h, 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = bodyColor;
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('图片占位 · IMAGE', node.x + node.w / 2, node.y + node.h / 2);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, node.x, node.y, node.w, node.h, 14);
    ctx.stroke();
    ctx.restore();
    return;
  }

  roundRect(ctx, node.x, node.y, node.w, node.h, node.kind === 'note' ? 6 : 14);
  ctx.fillStyle = node.kind === 'note' ? (dark ? 'rgba(60,52,20,0.9)' : '#FBF3D5') : fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(node.x + 22, node.y + 24, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = titleColor;
  ctx.font = '600 18px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleLines = wrap(ctx, node.title || '未命名方片', node.w - 44).slice(0, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, node.x + 22, node.y + 38 + i * 24));

  const bodyTop = node.y + 38 + titleLines.length * 24 + 8;
  ctx.fillStyle = bodyColor;
  ctx.font = '13px "Microsoft YaHei", sans-serif';
  const bodyLines = wrap(ctx, node.body || '', node.w - 44).slice(0, Math.max(1, Math.floor((node.y + node.h - 18 - bodyTop) / 20)));
  bodyLines.forEach((line, i) => ctx.fillText(line, node.x + 22, bodyTop + i * 20));

  if (node.kind === 'card' && node.h > 100) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(27,27,25,0.10)';
    ctx.font = '9px "Cascadia Code", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('CARD', node.x + node.w - 16, node.y + node.h - 18);
  }
  ctx.restore();
}

export async function renderBoard(board: Board, options: RenderOptions = {}): Promise<HTMLCanvasElement> {
  const style = options.style ?? 'plain';
  const scale = options.scale ?? 2;
  const frame = options.viewport ?? boundsOf(board, options.padding ?? 90);
  const width = Math.round(frame.w);
  const height = Math.round(frame.h);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(320, Math.round(width * scale));
  canvas.height = Math.max(200, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  drawBackground(ctx, style, width, height);

  // 标题栏
  if (options.title) {
    ctx.save();
    const dark = style === 'blueprint' || style === 'neon';
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.94)' : '#1B1B19';
    ctx.font = '600 34px "Songti SC", "SimSun", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(options.title, 56, 54);
    if (options.subtitle) {
      ctx.fillStyle = dark ? 'rgba(150, 210, 240, 0.7)' : 'rgba(92,90,84,0.8)';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(options.subtitle, 58, 100);
    }
    ctx.fillStyle = '#C0492B';
    ctx.fillRect(56, 126, 42, 3);
    ctx.restore();
  }

  // 预载图片
  await Promise.all(board.nodes.filter((n) => n.image).map((n) => loadImage(n.image!).catch(() => null)));

  ctx.save();
  ctx.translate(-frame.x, -frame.y);

  for (const edge of board.edges) drawEdge(ctx, board, edge, style);
  for (const node of board.nodes) drawNode(ctx, style, node);

  // 端口小点（AI 图中保留，强调可连接性）
  if (style === 'plain' || style === 'flat') {
    for (const node of board.nodes) {
      if (node.kind === 'annotation-circle' || node.kind === 'ink') continue;
      for (const port of ['top', 'right', 'bottom', 'left'] as Port[]) {
        const p = portPoint(node, port);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(27,27,25,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  if (options.watermark !== false) {
    ctx.save();
    ctx.fillStyle = style === 'neon' ? 'rgba(255,255,255,0.32)' : 'rgba(27,27,25,0.32)';
    ctx.font = '10px "Cascadia Code", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('MOSHU · GENERATED ON DEVICE', canvas.width - 26, canvas.height - 20);
    ctx.restore();
  }

  return canvas;
}

export async function boardToPng(board: Board, options: RenderOptions = {}): Promise<string> {
  const canvas = await renderBoard(board, { scale: 2, padding: 80, ...options });
  return canvas.toDataURL('image/png');
}
