import type { Board, Settings } from '../types';
import { api, isDesktop } from './fsapi';
import { renderBoard, type RenderStyle } from './boardRender';

export interface AiImageResult {
  dataUrl: string;
  provider: 'local' | 'remote' | 'local-fallback';
  note?: string;
  prompt: string;
}

export interface CopyRequest {
  topic: string;
  channel: 'xiaohongshu' | 'wechat' | 'email' | 'speech' | 'summary' | 'product';
  tone: '克制' | '热烈' | '专业' | '轻松';
  length: '短' | '中' | '长';
  extra?: string;
}

const STYLE_LABEL: Record<RenderStyle, string> = {
  blueprint: '技术蓝图',
  flat: '扁平插画',
  sketch: '白板手绘',
  neon: '霓虹科技',
  editorial: '杂志编辑',
  plain: '纸感原稿',
};

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; data: any; text: string }> {
  if (isDesktop && api) {
    const res = await api.aiProxy({ url, headers, body, method: 'POST' });
    return { status: res.status, data: res.data, text: res.text };
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, data, text };
}

async function downloadAsDataUrl(url: string): Promise<string> {
  if (isDesktop && api) {
    const res = await api.aiDownload(url);
    return `data:${res.mime};base64,${res.base64}`;
  }
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function hasRemoteAi(settings: Settings): boolean {
  return !!settings.aiApiKey.trim() && !!settings.aiBaseUrl.trim();
}

/* ------------------------------------------------------------------ */
/* 文案                                                               */
/* ------------------------------------------------------------------ */

export async function generateCopy(req: CopyRequest, settings: Settings): Promise<{ text: string; provider: 'local' | 'remote' }> {
  if (hasRemoteAi(settings)) {
    const base = settings.aiBaseUrl.replace(/\/$/, '');
    const system = '你是一位中文内容策略师。输出干净的 Markdown，不使用 emoji，不解释创作过程。';
    const user = `请为以下主题撰写内容。\n主题：${req.topic}\n渠道：${channelName(req.channel)}\n语气：${req.tone}\n篇幅：${req.length}\n补充要求：${req.extra || '无'}\n\n要求：标题有力，结构清晰，可直接使用。`;
    const res = await postJson(
      `${base}/chat/completions`,
      { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiApiKey}` },
      { model: settings.aiTextModel || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.8 },
    );
    if (res.status >= 200 && res.status < 300) {
      const text = res.data?.choices?.[0]?.message?.content;
      if (text) return { text: String(text).trim(), provider: 'remote' };
    }
    return { text: localCopy(req) + `\n\n> 远程模型调用失败（HTTP ${res.status}），已使用本地文案引擎。`, provider: 'local' };
  }
  return { text: localCopy(req), provider: 'local' };
}

function channelName(channel: CopyRequest['channel']): string {
  return {
    xiaohongshu: '小红书笔记', wechat: '公众号文章', email: '工作邮件', speech: '演讲稿', summary: '会议/资料摘要', product: '产品发布文案',
  }[channel];
}

export function localCopy(req: CopyRequest): string {
  const topic = req.topic.trim() || '未命名主题';
  const toneLine = {
    克制: '不喧哗，把细节讲清楚。',
    热烈: '现在，把它推到台前。',
    专业: '从结构到结论，逐层拆解。',
    轻松: '别紧张，这件事其实很好玩。',
  }[req.tone];

  const long = req.length === '长';
  const short = req.length === '短';

  if (req.channel === 'xiaohongshu') {
    return `# ${topic}｜一次把话说清楚的尝试

${toneLine}

## 01 起点比想象中更小
关于「${topic}」，最初只是想把一件反复做的事变简单一点。真正动手才发现，改变的不是某一个步骤，而是整个工作流的顺序。

## 02 三个真正有用的动作
- **先做减法**：先让第一版跑起来，再决定该删掉什么。
- **把上下文留在桌面上**：文档、画布、对话不来回搬运，判断会快很多。
- **给结果一个出口**：能被复用、能被交付，才算完成。

## 03 现在的工作方式
一张纸写判断，一块画布拉关系，剩下的交给自动化。

${short ? '' : '如果你也在做类似的事，欢迎把你的做法留在评论里。'}

#桌面Agent #效率工具 #工作方法`;
  }

  if (req.channel === 'wechat') {
    return `# ${topic}：把复杂留给系统，把简单留给人

${toneLine}

## 一、问题不在工具，而在切换
我们习惯在不同窗口之间搬运上下文：文档里写一半，去画布上画结构，再回到聊天框里解释。真正被消耗的不是时间，是判断力。围绕「${topic}」的讨论，常常只看到了工具，却没看到这次切换。

## 二、三条被验证的路径
1. **同屏**：写作与结构图共享一块桌面，想法不用二次翻译。
2. **可编排**：重复的动作应该能被脚本调用，而不是只能被鼠标点击。
3. **可生成**：从示意图到图片、从提纲到成片，需要一条更短的路径。

## 三、一个更安静的工作台
墨枢把这三件事做成了默认设置：多格式文档、方片画布、本地 Agent 桥接。没有多余的层级，也没有把能力藏进二级菜单。

${long ? `### 写在最后\n工具的价值，不在于它替你思考，而在于它不打断你的思考。${topic} 值得我们用更安静的方式对待。` : ''}

> 如果这篇内容对你有用，可以把它转给同样在做这件事的人。`;
  }

  if (req.channel === 'email') {
    return `主题：关于${topic}的进展与下一步

你好，

关于 ${topic}，同步一下当前进展。

一、已完成
- 基础版本已经跑通，覆盖主要使用路径。
- 演示材料完成第一轮整理，本周内可以给出可演示版本。

二、需要确认
- 范围是否保留在当前版本？
- 下周三之前能否确定验收标准？

三、下一步
我会在周五前整理一份简短说明，附上演示入口。如无异议，按此节奏推进。

${toneLine}

顺颂商祺
墨枢团队`;
  }

  if (req.channel === 'speech') {
    return `# ${topic}

各位好。

今天我只讲一件事：${topic}。

${toneLine}

## 一、我们看到的现实
这已经不是一个新问题，但它第一次变得无法回避。旧方法还能用，只是代价越来越高。

## 二、我们做的选择
我们决定从最小的一步开始：把「${topic}」放到离人更近的地方。不是增加一个入口，而是减少一次切换。

## 三、接下来
下一步会在下个阶段开放。我们更关心它能否被真正用起来，而不是发布时有多热闹。

${short ? '' : '感谢每一位参与其中的人。'}谢谢。`;
  }

  if (req.channel === 'summary') {
    return `# ${topic} · 摘要

**一句话结论**：${toneLine}

## 要点
- 现状已明确，主要阻力在流程与协作，而不是资源。
- 建议以小步验证的方式推进，先跑通一条完整链路。
- 需要在下个节点前给出可量化的验收标准。

## 待办
- [ ] 明确范围与负责人
- [ ] 给出时间表与风险项
- [ ] 准备一次 15 分钟的演示

## 风险
范围膨胀、上下文丢失、验收标准模糊。${req.extra || ''}`;
  }

  return `# ${topic}

**${toneLine}**

关于「${topic}」，不该被复杂的工具打断。  
好的想法，值得被放在同一张桌面上。  
下一步，从一个动作开始。

- 多格式文档，打开即写
- 方片画布，拖拽成图
- 一句话，生成图片、动画与文案
- 本地 CLI，随时被 Agent 接管

**现在，打开墨枢。**`;
}

/* ------------------------------------------------------------------ */
/* 图片                                                               */
/* ------------------------------------------------------------------ */

export interface ImageRequest {
  prompt: string;
  style: RenderStyle;
  useBoard: boolean;
  board?: Board;
  title?: string;
}

export async function generateImage(req: ImageRequest, settings: Settings): Promise<AiImageResult> {
  const boardSummary = req.board?.nodes.map((n) => n.title).filter(Boolean).slice(0, 12).join('、') ?? '';
  const prompt = [
    req.prompt || '把这张示意图变成一张有设计感的视觉稿',
    boardSummary ? `结构包含：${boardSummary}` : '',
    `视觉风格：${STYLE_LABEL[req.style]}`,
    '要求：干净、留白充足、适合演示与封面使用，不要出现乱码文字。',
  ].filter(Boolean).join('\n');

  if (hasRemoteAi(settings) && settings.aiImageModel) {
    try {
      const base = settings.aiBaseUrl.replace(/\/$/, '');
      const res = await postJson(
        `${base}/images/generations`,
        { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiApiKey}` },
        { model: settings.aiImageModel, prompt, n: 1, size: '1536x1024' },
      );
      if (res.status >= 200 && res.status < 300) {
        const item = res.data?.data?.[0];
        if (item?.b64_json) {
          return { dataUrl: `data:image/png;base64,${item.b64_json}`, provider: 'remote', prompt };
        }
        if (item?.url) {
          return { dataUrl: await downloadAsDataUrl(item.url), provider: 'remote', prompt };
        }
      }
      const local = await localImage(req);
      return { ...local, provider: 'local-fallback', note: `远程出图失败（HTTP ${res.status}），已使用本地渲染`, prompt };
    } catch (error) {
      const local = await localImage(req);
      return { ...local, provider: 'local-fallback', note: `远程出图失败，已使用本地渲染`, prompt };
    }
  }

  return { ...(await localImage(req)), provider: 'local', prompt };
}

async function localImage(req: ImageRequest): Promise<{ dataUrl: string }> {
  if (req.useBoard && req.board && req.board.nodes.length) {
    const canvas = await renderBoard(req.board, {
      scale: 2,
      padding: 120,
      style: req.style,
      title: req.title || req.board.name,
      subtitle: req.prompt || '由墨枢本地渲染引擎生成',
      watermark: true,
    });
    applyGrain(canvas);
    return { dataUrl: canvas.toDataURL('image/png') };
  }
  return { dataUrl: renderConceptPoster(req) };
}

function applyGrain(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < data.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 9;
    data.data[i] += noise;
    data.data[i + 1] += noise;
    data.data[i + 2] += noise;
  }
  ctx.putImageData(data, 0, 0);
}

function renderConceptPoster(req: ImageRequest): string {
  const width = 1600;
  const height = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const style = req.style;

  const palettes: Record<RenderStyle, { bg: [string, string]; fg: string; accent: string; soft: string }> = {
    blueprint: { bg: ['#07182B', '#0E2E4E'], fg: '#E8F6FF', accent: '#63D2FF', soft: 'rgba(99,210,255,0.16)' },
    flat: { bg: ['#FBF0DD', '#F7E1C4'], fg: '#2A2118', accent: '#C0492B', soft: 'rgba(192,73,43,0.14)' },
    sketch: { bg: ['#FCF8EE', '#F1E9D7'], fg: '#2F2A20', accent: '#4E6E5D', soft: 'rgba(78,110,93,0.12)' },
    neon: { bg: ['#07060C', '#140B24'], fg: '#F5F2FF', accent: '#FF4FA3', soft: 'rgba(255,79,163,0.18)' },
    editorial: { bg: ['#F4EFE3', '#EBE3D2'], fg: '#1B1B19', accent: '#C0492B', soft: 'rgba(27,27,25,0.08)' },
    plain: { bg: ['#FAF8F2', '#F1ECE1'], fg: '#1B1B19', accent: '#C0492B', soft: 'rgba(27,27,25,0.06)' },
  };
  const p = palettes[style];
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(1, p.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (style === 'blueprint' || style === 'neon') {
    ctx.strokeStyle = style === 'blueprint' ? 'rgba(99,210,255,0.16)' : 'rgba(255,255,255,0.06)';
    for (let x = 0; x < width; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    const glow = ctx.createRadialGradient(width * 0.72, height * 0.32, 0, width * 0.72, height * 0.32, width * 0.58);
    glow.addColorStop(0, p.soft);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  // 生成式几何
  ctx.save();
  for (let i = 0; i < 5; i += 1) {
    ctx.globalAlpha = 0.10 + i * 0.035;
    ctx.fillStyle = i % 3 === 0 ? p.accent : p.fg;
    const r = 180 + i * 95;
    ctx.beginPath();
    ctx.arc(width * 0.74 + Math.sin(i) * 40, height * 0.62 + Math.cos(i) * 30, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = p.accent;
  ctx.fillRect(100, 120, 64, 5);

  ctx.fillStyle = p.fg;
  ctx.font = '600 74px "Songti SC", "SimSun", serif';
  const title = (req.title || '把想法，变成看得见的东西').slice(0, 22);
  wrapCanvas(ctx, title, 118, 210, 940, 92);

  ctx.fillStyle = p.fg;
  ctx.globalAlpha = 0.72;
  ctx.font = '26px "Microsoft YaHei", sans-serif';
  wrapCanvas(ctx, req.prompt || '一张示意图，一键生成可以展示的视觉作品。', 120, 500, 820, 42);
  ctx.globalAlpha = 1;

  ctx.fillStyle = p.fg;
  ctx.font = '13px "Cascadia Code", monospace';
  ctx.globalAlpha = 0.55;
  ctx.fillText(`MOSHU AI · ${STYLE_LABEL[style]} · LOCAL RENDER`, 120, height - 86);
  ctx.globalAlpha = 1;

  if (style === 'neon') {
    ctx.strokeStyle = p.accent;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(48, 48, width - 96, height - 96);
    ctx.globalAlpha = 1;
  } else if (style === 'flat') {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(width - 190, height - 180, 64, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'editorial') {
    ctx.strokeStyle = 'rgba(27,27,25,0.18)';
    ctx.beginPath();
    ctx.moveTo(120, 960); ctx.lineTo(width - 120, 960);
    ctx.stroke();
    ctx.fillStyle = p.fg;
    ctx.globalAlpha = 0.5;
    ctx.font = '12px "Cascadia Code", monospace';
    ctx.fillText('ISSUE 01 / 2026', width - 260, 1000);
    ctx.globalAlpha = 1;
  }

  if (style === 'sketch') {
    applyGrain(canvas);
  }

  return canvas.toDataURL('image/png');
}

function wrapCanvas(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = '';
  let offset = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      ctx.fillText(line, x, y + offset);
      line = ch;
      offset += lineHeight;
    } else {
      line += ch;
    }
  }
  if (line) ctx.fillText(line, x, y + offset);
}

export { STYLE_LABEL };
