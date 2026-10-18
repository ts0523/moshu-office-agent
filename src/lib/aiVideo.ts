import type { Board, BoardNode } from '../types';
import { boundsOf, renderBoard, type RenderStyle } from './boardRender';

export interface MovieOptions {
  mode: 'video' | 'animation';
  style?: RenderStyle;
  duration?: number;
  title?: string;
}

interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Keyframe {
  at: number;
  cam: Camera;
  node?: BoardNode;
  label: string;
}

const W = 1280;
const H = 720;

function aspectCamera(node: BoardNode, bounds: ReturnType<typeof boundsOf>): Camera {
  const targetRatio = W / H;
  let w = Math.max(node.w * 1.9, 680);
  let h = w / targetRatio;
  if (h < node.h * 2.2) {
    h = Math.max(node.h * 2.2, 420);
    w = h * targetRatio;
  }
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return {
    x: Math.min(Math.max(cx - w / 2, bounds.x - 200), bounds.x + bounds.w + 200 - w),
    y: Math.min(Math.max(cy - h / 2, bounds.y - 160), bounds.y + bounds.h + 160 - h),
    w,
    h,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpCam(a: Camera, b: Camera, t: number): Camera {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

function cameraAt(frames: Keyframe[], time: number, defaultCam: Camera): Camera {
  if (!frames.length) return defaultCam;
  if (time <= frames[0].at) return frames[0].cam;
  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    if (time >= a.at && time < b.at) {
      const span = b.at - a.at;
      const local = span > 0 ? (time - a.at) / span : 1;
      const eased = easeInOut(Math.min(1, local * 1.35));
      return lerpCam(a.cam, b.cam, eased);
    }
  }
  return frames[frames.length - 1].cam;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  surface: HTMLCanvasElement,
  cam: Camera,
  bounds: ReturnType<typeof boundsOf>,
) {
  const scale = surface.width / bounds.w;
  ctx.fillStyle = '#F7F5F0';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(
    surface,
    (cam.x - bounds.x) * scale,
    (cam.y - bounds.y) * scale,
    cam.w * scale,
    cam.h * scale,
    0,
    0,
    W,
    H,
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawChrome(ctx: CanvasRenderingContext2D, title: string, sub: string, progress: number, style: RenderStyle) {
  const dark = style === 'blueprint' || style === 'neon';
  const bottom = ctx.createLinearGradient(0, H - 210, 0, H);
  bottom.addColorStop(0, 'rgba(8,8,10,0)');
  bottom.addColorStop(1, dark ? 'rgba(4,8,16,0.82)' : 'rgba(20,18,14,0.62)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - 210, W, 210);

  ctx.fillStyle = '#C0492B';
  ctx.fillRect(54, H - 78, 26, 2);

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.font = '600 30px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title.slice(0, 34), 54, H - 38);

  if (sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(sub.slice(0, 52), 56, H - 12);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W - 322, H - 40, 268, 2);
  ctx.fillStyle = '#C0492B';
  ctx.fillRect(W - 322, H - 40, 268 * Math.min(1, progress), 2);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '10px "Cascadia Code", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('MOSHU · MOTION', W - 54, 42);
}

function drawIntro(ctx: CanvasRenderingContext2D, style: RenderStyle, title: string, alpha: number) {
  const dark = style === 'blueprint' || style === 'neon';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dark ? 'rgba(4,10,18,0.72)' : 'rgba(247,245,240,0.86)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dark ? '#EAF7FF' : '#1B1B19';
  ctx.font = '600 56px "Songti SC", "SimSun", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  wrap(ctx, title, 92, H / 2 + 10, 980, 68, 3);
  ctx.fillStyle = '#C0492B';
  ctx.fillRect(94, H / 2 - 90, 52, 4);
  ctx.fillStyle = dark ? 'rgba(190,225,245,0.7)' : 'rgba(92,90,84,0.8)';
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.fillText('一份示意图 · 一键成片 · 由墨枢生成', 96, H / 2 - 116);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  let line = '';
  let offset = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      if (offset / lineHeight >= maxLines - 1) { ctx.fillText(line + '…', x, y + offset); return; }
      ctx.fillText(line, x, y + offset);
      line = ch;
      offset += lineHeight;
    } else line += ch;
  }
  ctx.fillText(line, x, y + offset);
}

export async function generateBoardMovie(
  board: Board,
  options: MovieOptions,
  onProgress?: (value: number) => void,
): Promise<{ blob: Blob; duration: number; mime: string }> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前环境不支持视频录制，请在桌面端运行');
  }
  const style = options.style ?? 'editorial';
  if (!board.nodes.length) throw new Error('画布为空，先放几张方片再生成');

  const nodes = [...board.nodes]
    .filter((n) => n.kind === 'card' || n.kind === 'image' || n.kind === 'note')
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const bounds = boundsOf(board, 180);
  const surface = await renderBoard(board, { scale: 1.6, padding: 180, style, watermark: false });
  const full: Camera = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };

  const fixedDuration = options.duration ? Math.min(45, Math.max(4, options.duration)) : undefined;
  const secondsPerScene = 1.8;
  const intro = 2.2;
  const outro = 2.4;
  const bodySeconds = nodes.length * secondsPerScene;
  const duration = fixedDuration ?? Math.min(38, intro + bodySeconds + outro);

  const frames: Keyframe[] = [{ at: 0, cam: full, label: options.title || board.name }];
  if (options.mode === 'video') {
    nodes.forEach((node, index) => {
      const at = intro + index * secondsPerScene;
      frames.push({ at, cam: aspectCamera(node, bounds), node, label: node.title });
      frames.push({ at: at + secondsPerScene * 0.72, cam: aspectCamera(node, bounds), node, label: node.title });
    });
    frames.push({ at: intro + bodySeconds + 0.3, cam: full, label: options.title || board.name });
  } else {
    frames.push({ at: intro, cam: full, label: options.title || board.name });
  }
  frames.push({ at: duration - 0.1, cam: full, label: options.title || board.name });

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

  const start = performance.now();
  let finished = false;

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  recorder.start(120);

  function frame(now: number) {
    const elapsed = Math.min(duration, (now - start) / 1000);
    const progress = elapsed / duration;

    const cam = options.mode === 'video' ? cameraAt(frames, elapsed, full) : full;
    drawCover(ctx, surface, cam, bounds);

    if (options.mode === 'animation') {
      const activeIndex = Math.min(nodes.length - 1, Math.max(-1, Math.floor((elapsed - intro) / secondsPerScene)));
      ctx.fillStyle = 'rgba(12,10,8,0.42)';
      ctx.fillRect(0, 0, W, H);
      if (activeIndex >= 0) {
        const node = nodes[activeIndex];
        const k = W / full.w;
        const nx = (node.x - full.x) * k;
        const ny = (node.y - full.y) * k;
        const nw = node.w * k;
        const nh = node.h * k;
        ctx.save();
        roundRect(ctx, nx - 8, ny - 8, nw + 16, nh + 16, 20);
        ctx.clip();
        ctx.drawImage(surface, 0, 0, surface.width, surface.height, 0, 0, W, H);
        ctx.restore();
        ctx.strokeStyle = '#C0492B';
        ctx.lineWidth = 2;
        roundRect(ctx, nx - 8, ny - 8, nw + 16, nh + 16, 20);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '600 24px "Microsoft YaHei", sans-serif';
        ctx.fillText(node.title, Math.max(40, nx), Math.min(H - 150, ny + nh + 42));
      }
    }

    if (elapsed < intro + 0.7) {
      const alpha = elapsed < intro * 0.55 ? 1 : 1 - (elapsed - intro * 0.55) / (intro * 0.45);
      drawIntro(ctx, style, options.title || board.name, Math.max(0, Math.min(1, alpha)));
    }

    if (elapsed > duration - 1.6) {
      const alpha = Math.min(1, (elapsed - (duration - 1.6)) / 0.8);
      ctx.fillStyle = `rgba(0,0,0,${0.55 * alpha})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
      ctx.font = '600 38px "Songti SC", "SimSun", serif';
      ctx.textAlign = 'center';
      ctx.fillText('由墨枢生成', W / 2, H / 2);
      ctx.font = '13px "Cascadia Code", monospace';
      ctx.fillStyle = `rgba(255,255,255,${0.5 * alpha})`;
      ctx.fillText('MOSHU OFFICE AGENT', W / 2, H / 2 + 34);
      ctx.textAlign = 'left';
    }

    drawChrome(ctx, options.title || board.name, `${nodes.length} 个节点 · ${options.mode === 'video' ? '运镜成片' : '方片动画'}`, progress, style);
    onProgress?.(progress);

    if (elapsed < duration) {
      requestAnimationFrame(frame);
    } else if (!finished) {
      finished = true;
      setTimeout(() => recorder.stop(), 180);
    }
  }

  requestAnimationFrame(frame);
  const raw = await done;
  stream.getTracks().forEach((track) => track.stop());

  // MediaRecorder 写出的 WebM 缺少 Duration 元数据，播放器无法拖动进度条
  let blob = raw;
  try {
    const fixDuration = (await import('fix-webm-duration')).default;
    blob = await fixDuration(raw, Math.round(duration * 1000), { logger: false });
  } catch { /* 保留原始 blob */ }

  return { blob, duration, mime };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
