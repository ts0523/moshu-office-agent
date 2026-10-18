import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Image as ImageIcon, Clapperboard, Type, Terminal, X, Download, Plus,
  Loader2, Play, Copy, Check, FolderOpen, Cpu, FileText, RefreshCw, Send, ArrowRight,
  Wand2, Circle, Clapperboard as MovieIcon, Save, Layers, Command,
} from 'lucide-react';
import { useStore } from '../store';
import { saveBinary } from '../lib/fsapi';
import { runLocalCommand } from '../lib/agent';
import type { CopyRequest } from '../lib/ai';

const STYLES = [
  { key: 'editorial', label: '杂志编辑', hint: '纸感 · 衬线标题' },
  { key: 'blueprint', label: '技术蓝图', hint: '深蓝 · 网格线' },
  { key: 'flat', label: '扁平插画', hint: '暖底 · 大色块' },
  { key: 'sketch', label: '白板手绘', hint: '铅笔 · 纸纹' },
  { key: 'neon', label: '霓虹科技', hint: '暗色 · 辉光' },
  { key: 'plain', label: '纸感原稿', hint: '克制 · 点阵' },
] as const;

const CHANNELS: { key: CopyRequest['channel']; label: string }[] = [
  { key: 'xiaohongshu', label: '小红书' },
  { key: 'wechat', label: '公众号' },
  { key: 'email', label: '邮件' },
  { key: 'speech', label: '演讲' },
  { key: 'summary', label: '摘要' },
  { key: 'product', label: '产品文案' },
];

const TONES: CopyRequest['tone'][] = ['克制', '热烈', '专业', '轻松'];

const CLI_SNIPPETS = [
  { label: '查看状态', cmd: 'oa status' },
  { label: '新建文档', cmd: 'oa create "周报.md" --content "# 本周进展" --open' },
  { label: '加方片', cmd: 'oa canvas add-card --title "需求" --body "多格式文档" --x 320 --y 220' },
  { label: '连线', cmd: 'oa canvas connect --from n1 --to n2 --label "依赖"' },
  { label: '示意图出图', cmd: 'oa ai image --style blueprint' },
  { label: '生成短视频', cmd: 'oa ai video --title "产品概览"' },
];

export function AIPanel() {
  const tab = useStore((s) => s.aiTab);
  const setTab = useStore((s) => s.setAiTab);
  const setOpen = useStore((s) => s.setAiOpen);
  const busy = useStore((s) => s.aiBusy);
  const stage = useStore((s) => s.aiStage);
  const progress = useStore((s) => s.aiProgress);
  const board = useStore((s) => s.board);
  const image = useStore((s) => s.aiImage);
  const video = useStore((s) => s.aiVideo);
  const copy = useStore((s) => s.aiCopy);
  const note = useStore((s) => s.aiNote);
  const imagePrompt = useStore((s) => s.imagePrompt);
  const imageStyle = useStore((s) => s.imageStyle);
  const imageSource = useStore((s) => s.imageSource);
  const videoTitle = useStore((s) => s.videoTitle);
  const videoMode = useStore((s) => s.videoMode);
  const copyTopic = useStore((s) => s.copyTopic);
  const copyChannel = useStore((s) => s.copyChannel);
  const copyTone = useStore((s) => s.copyTone);
  const copyLength = useStore((s) => s.copyLength);
  const logs = useStore((s) => s.logs);
  const info = useStore((s) => s.info);
  const bridgeOnline = useStore((s) => s.bridgeOnline);
  const runImage = useStore((s) => s.runImage);
  const insertImageNode = useStore((s) => s.insertImageNode);
  const runMovie = useStore((s) => s.runMovie);
  const runCopy = useStore((s) => s.runCopy);
  const insertCopy = useStore((s) => s.insertCopy);
  const createFile = useStore((s) => s.createFile);
  const toast = useStore((s) => s.toast);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setView = useStore((s) => s.setView);

  const [command, setCommand] = useState('oa status');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState('');
  const termRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!image && !video && !copy) return;
    const timer = setTimeout(() => {
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
    }, 140);
    return () => clearTimeout(timer);
  }, [image?.dataUrl, video?.url, note]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeCount = board.nodes.length;
  const nodeEstimate = useMemo(() => Math.min(38, 4.6 + board.nodes.filter((n) => n.kind !== 'ink').length * 1.8), [board.nodes]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* ignore */ }
  };

  const saveImage = async () => {
    if (!image) return;
    try {
      const path = await saveBinary(`AI-${Date.now()}.png`, image.dataUrl.split(',')[1]);
      toast(`图片已保存：${path}`, 'ok');
    } catch (error) {
      toast(`保存失败：${(error as Error).message}`, 'error');
    }
  };

  const saveVideo = async () => {
    if (!video) return;
    try {
      const path = await saveBinary(video.name, video.base64);
      toast(`视频已保存：${path}`, 'ok');
    } catch (error) {
      toast(`保存失败：${(error as Error).message}`, 'error');
    }
  };

  const runCommand = async (raw?: string) => {
    const target = raw ?? command;
    setRunning(true);
    setOutput('› ' + target + '\n');
    try {
      const result = await runLocalCommand(target);
      setOutput(`› ${target}\n\n${result}`);
      termRef.current?.scrollTo({ top: 0 });
    } catch (error) {
      setOutput(`› ${target}\n\n错误：${(error as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <aside className="ai-panel">
      <div className="ai-head">
        <div className="ai-brand">
          <span className="ai-orb"><Sparkles size={14} /></span>
          <div>
            <strong>AI 工作台</strong>
            <span>本地渲染 · 可接远程模型</span>
          </div>
        </div>
        <button className="icon-btn" onClick={() => setOpen(false)} title="收起"><X size={15} /></button>
      </div>

      <div className="ai-tabs">
        <button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}><ImageIcon size={14} />出图</button>
        <button className={tab === 'movie' ? 'active' : ''} onClick={() => setTab('movie')}><Clapperboard size={14} />影像</button>
        <button className={tab === 'copy' ? 'active' : ''} onClick={() => setTab('copy')}><Type size={14} />文案</button>
        <button className={tab === 'agent' ? 'active' : ''} onClick={() => setTab('agent')}><Terminal size={14} />Agent</button>
      </div>

      {busy && (
        <div className="ai-progress">
          <div className="ai-progress-head"><Loader2 size={12} className="spin" />{stage || '正在生成'}</div>
          <div className="ai-progress-track"><i style={{ width: `${Math.max(6, progress * 100)}%` }} /></div>
        </div>
      )}

      <div className="ai-body" ref={bodyRef}>
        {tab === 'image' && (
          <>
            <div className="ai-section">
              <div className="ai-section-head">
                <span>画面来源</span>
                <button className="ai-link" onClick={() => setView('split')}><Layers size={11} />查看画布</button>
              </div>
              <div className="ai-source">
                <button
                  className={`ai-source-chip ${imageSource === 'board' && nodeCount ? 'active' : ''}`}
                  onClick={() => useStore.setState({ imageSource: 'board' })}
                >
                  <Layers size={14} />
                  <div>
                    <strong>当前画布</strong>
                    <span>{nodeCount} 个节点 · {board.edges.length} 条连线</span>
                  </div>
                </button>
                <button
                  className={`ai-source-chip ${imageSource === 'poster' || !nodeCount ? 'active' : ''}`}
                  onClick={() => useStore.setState({ imageSource: 'poster' })}
                >
                  <Wand2 size={14} />
                  <div>
                    <strong>概念海报</strong>
                    <span>由提示词直接生成视觉稿</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>提示词</span><em>中英文均可</em></div>
              <textarea
                className="ai-textarea"
                value={imagePrompt}
                onChange={(event) => useStore.setState({ imagePrompt: event.target.value })}
                rows={3}
                placeholder="描述你想要的画面，例如：把这张结构图变成一张发布会长图"
              />
              <div className="ai-chips">
                {['发布会主视觉', '演示稿封面', '产品架构图', '社交媒体长图'].map((text) => (
                  <button key={text} onClick={() => useStore.setState({ imagePrompt: `${text}：${imagePrompt}` })}>+ {text}</button>
                ))}
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>视觉风格</span><em>{STYLES.find((s) => s.key === imageStyle)?.hint}</em></div>
              <div className="style-grid">
                {STYLES.map((style) => (
                  <button
                    key={style.key}
                    className={`style-card style-${style.key} ${imageStyle === style.key ? 'active' : ''}`}
                    onClick={() => useStore.setState({ imageStyle: style.key })}
                  >
                    <span className="style-swatch" />
                    <strong>{style.label}</strong>
                  </button>
                ))}
              </div>
            </div>

            <button className="ai-primary" disabled={busy} onClick={() => void runImage()}>
              {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
              {busy ? '正在渲染…' : imageSource === 'board' && nodeCount ? '把示意图生成图片' : '生成概念海报'}
            </button>

            {image && (
              <div className="ai-result">
                <div className="ai-result-head">
                  <span>生成结果</span>
                  <em>{image.provider === 'remote' ? '远程模型' : image.provider === 'local-fallback' ? '本地兜底' : '本地渲染'}</em>
                </div>
                <div className="ai-image-frame">
                  <img src={image.dataUrl} alt="AI 生成结果" />
                </div>
                {image.note && <div className="ai-note">{image.note}</div>}
                <div className="ai-result-actions">
                  <button onClick={insertImageNode}><Plus size={13} />放入画布</button>
                  <button onClick={() => void saveImage()}><Download size={13} />保存 PNG</button>
                  <button onClick={() => void runImage()} disabled={busy}><RefreshCw size={13} />重生成</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'movie' && (
          <>
            <div className="ai-section">
              <div className="ai-section-head"><span>成片方式</span><em>基于当前画布</em></div>
              <div className="segmented">
                <button className={videoMode === 'video' ? 'active' : ''} onClick={() => useStore.setState({ videoMode: 'video' })}>
                  <Clapperboard size={13} /> 运镜视频
                </button>
                <button className={videoMode === 'animation' ? 'active' : ''} onClick={() => useStore.setState({ videoMode: 'animation' })}>
                  <Play size={13} /> 方片动画
                </button>
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>片名</span><em>会出现在片头与文件名</em></div>
              <input
                className="ai-input"
                value={videoTitle}
                onChange={(event) => useStore.setState({ videoTitle: event.target.value })}
                placeholder="例如：产品概览"
              />
              <div className="movie-meta">
                <span><MovieIcon size={12} />约 {nodeEstimate.toFixed(1)} 秒</span>
                <span>{nodeCount} 个镜头</span>
                <span>1280 × 720</span>
                <span>WebM</span>
              </div>
            </div>

            <div className="storyboard">
              <div className="storyboard-head">分镜顺序</div>
              {board.nodes.filter((n) => n.kind !== 'ink').map((node, index) => (
                <div className="storyboard-item" key={node.id}>
                  <span className="storyboard-no">{String(index + 1).padStart(2, '0')}</span>
                  <span className="storyboard-title">{node.title || '未命名'}</span>
                  <span className="storyboard-badge">{index === 0 ? '开场' : index === nodeCount - 1 ? '收束' : '推进'}</span>
                </div>
              ))}
              {!nodeCount && <div className="ai-empty-line">画布为空。先放几张方片，再来生成。</div>}
            </div>

            <button className="ai-primary" disabled={busy || !nodeCount} onClick={() => void runMovie(videoMode)}>
              {busy ? <Loader2 size={15} className="spin" /> : <Clapperboard size={15} />}
              {busy ? '录制中，请保持窗口可见…' : videoMode === 'video' ? '生成运镜短片' : '生成方片动画'}
            </button>
            <p className="ai-footnote">视频在本地逐帧渲染并录制，不上传画布内容。生成期间请勿最小化窗口。</p>

            {video && (
              <div className="ai-result">
                <div className="ai-result-head"><span>{video.mode === 'video' ? '运镜短片' : '方片动画'}</span><em>{video.duration.toFixed(1)}s</em></div>
                <video className="ai-video" src={video.url} controls />
                <div className="ai-result-actions">
                  <button onClick={() => void saveVideo()}><Download size={13} />保存视频</button>
                  <button onClick={() => setView('split')}><Layers size={13} />回到画布</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'copy' && (
          <>
            <div className="ai-section">
              <div className="ai-section-head"><span>主题</span><em>{note || '本地文案引擎'}</em></div>
              <textarea
                className="ai-textarea"
                value={copyTopic}
                onChange={(event) => useStore.setState({ copyTopic: event.target.value })}
                rows={3}
                placeholder="你想写什么？一句话就够。"
              />
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>渠道</span></div>
              <div className="ai-chips wrap">
                {CHANNELS.map((channel) => (
                  <button
                    key={channel.key}
                    className={copyChannel === channel.key ? 'active' : ''}
                    onClick={() => useStore.setState({ copyChannel: channel.key })}
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>语气</span></div>
              <div className="ai-chips">
                {TONES.map((tone) => (
                  <button key={tone} className={copyTone === tone ? 'active' : ''} onClick={() => useStore.setState({ copyTone: tone })}>{tone}</button>
                ))}
              </div>
              <div className="ai-section-head" style={{ marginTop: 12 }}><span>篇幅</span></div>
              <div className="segmented small">
                {(['短', '中', '长'] as const).map((len) => (
                  <button key={len} className={copyLength === len ? 'active' : ''} onClick={() => useStore.setState({ copyLength: len })}>{len}</button>
                ))}
              </div>
            </div>

            <button className="ai-primary" disabled={busy} onClick={() => void runCopy()}>
              {busy ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
              {busy ? '正在写…' : '生成文案'}
            </button>

            {copy && (
              <div className="ai-result">
                <div className="ai-result-head">
                  <span>文案</span>
                  <button className="ai-link" onClick={() => void copyToClipboard(copy, 'copy')}>
                    {copied === 'copy' ? <Check size={11} /> : <Copy size={11} />}{copied === 'copy' ? '已复制' : '复制'}
                  </button>
                </div>
                <textarea
                  className="ai-copy-output"
                  value={copy}
                  onChange={(event) => useStore.setState({ aiCopy: event.target.value })}
                  rows={16}
                />
                <div className="ai-result-actions">
                  <button onClick={() => void insertCopy(copy)}><Plus size={13} />插入当前文档</button>
                  <button
                    onClick={() => {
                      const stamp = Date.now().toString().slice(-4);
                      void createFile(`AI 文案-${stamp}.md`, 'md', `# AI 文案\n\n${copy}`);
                    }}
                  >
                    <FileText size={13} />新建文案文档
                  </button>
                  <button onClick={() => setSettingsOpen(true)}><Cpu size={13} />模型设置</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'agent' && (
          <>
            <div className={`agent-status ${bridgeOnline ? 'online' : ''}`}>
              <span className="agent-dot" />
              <div>
                <strong>{bridgeOnline ? 'Agent 桥接在线' : '桥接离线 · CLI 可离线读写'}</strong>
                <span>{info?.bridge?.http ?? 'http://127.0.0.1:17866'}</span>
              </div>
              <button onClick={() => setSettingsOpen(true)}><Command size={13} /></button>
            </div>

            <div className="agent-workspace">
              <span>工作区</span>
              <button onClick={() => void window.moshu?.openWorkspace()} title="打开工作区">
                <FolderOpen size={12} />
                <em>{info?.workspace ?? '浏览器演示工作区'}</em>
              </button>
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>CLI 快捷命令</span><em>复制到终端</em></div>
              <div className="cli-list">
                {CLI_SNIPPETS.map((item) => (
                  <div className="cli-item" key={item.cmd}>
                    <div className="cli-item-head">
                      <span>{item.label}</span>
                      <button onClick={() => void copyToClipboard(item.cmd, item.cmd)}>
                        {copied === item.cmd ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                    <code>{item.cmd}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head">
                <span>本地命令台</span>
                <em>与 CLI 同一套协议</em>
              </div>
              <div className="term-input">
                <span>›</span>
                <input
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void runCommand(); }}
                  placeholder="oa status"
                  spellCheck={false}
                />
                <button onClick={() => void runCommand()} disabled={running}>
                  {running ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                </button>
              </div>
              <div className="term-output" ref={termRef}>
                {output || '运行一条命令，结果会显示在这里。\n支持 status / list / create / canvas / ai / export。'}
              </div>
            </div>

            <div className="ai-section">
              <div className="ai-section-head"><span>最近活动</span><em>{logs.length} 条</em></div>
              <div className="agent-logs">
                {logs.slice(0, 12).map((log) => (
                  <div className="agent-log" key={log.id}>
                    <span className={`log-source ${log.source ?? 'app'}`}>{log.source === 'cli' ? 'CLI' : 'APP'}</span>
                    <span className="log-action">{log.action}</span>
                    <span className="log-detail">{log.detail}</span>
                  </div>
                ))}
                {!logs.length && <div className="ai-empty-line">还没有 Agent 活动。</div>}
              </div>
            </div>

            <button className="ghost-wide" onClick={() => void runCommand('oa status')}>
              <Terminal size={13} /> 运行 oa status
              <ArrowRight size={13} />
            </button>
          </>
        )}
      </div>

      <div className="ai-foot">
        <span><Circle size={7} fill="currentColor" /> {bridgeOnline ? '本地桥接已就绪' : '离线演示模式'}</span>
        <button onClick={() => setSettingsOpen(true)}>AI 设置</button>
      </div>
    </aside>
  );
}
