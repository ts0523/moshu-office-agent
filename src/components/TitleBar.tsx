import { useEffect, useState } from 'react';
import { Minus, Square, X, Search, HelpCircle, Settings, Sparkles, Copy, Check } from 'lucide-react';
import { useStore, activeTabOf } from '../store';

export function TitleBar() {
  const info = useStore((s) => s.info);
  const view = useStore((s) => s.view);
  const board = useStore((s) => s.board);
  const bridgeOnline = useStore((s) => s.bridgeOnline);
  const aiOpen = useStore((s) => s.aiOpen);
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const [maximized, setMaximized] = useState(false);
  const [copied, setCopied] = useState(false);

  const active = activeTabOf({ tabs, activeId });
  const title = view === 'doc' ? active?.name : board.name || '画布';

  useEffect(() => {
    if (!window.moshu) return;
    const off = window.moshu.onWindowState(({ maximized: value }) => setMaximized(value));
    return off;
  }, []);

  const win = (action: string) => {
    window.moshu?.window(action);
  };

  const copyWorkspace = async () => {
    try {
      await navigator.clipboard.writeText(info?.workspace ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  return (
    <header className="titlebar">
      <div className="brand">
        <div className="brand-mark">墨</div>
        <div className="brand-text">
          <strong>墨枢</strong>
          <span>OFFICE AGENT</span>
        </div>
      </div>

      <div className="title-center">
        <div className="crumb">
          <span className="crumb-root">工作区</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-file">{title || '未命名'}</span>
          {bridgeOnline && (
            <button className="crumb-workspace" title="复制工作区路径" onClick={copyWorkspace}>
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {info?.workspace ? info.workspace.replace(/^.*[\\/]/, '') : '演示工作区'}
            </button>
          )}
        </div>
        <button className="cmd-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={14} />
          <span>搜索文件，或运行命令</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="title-actions">
        <span className={`bridge-pill ${bridgeOnline ? 'on' : ''}`} title={bridgeOnline ? 'CLI / HTTP 桥接已就绪' : info?.isElectron ? '桥接未连接，CLI 仍可离线读写文件' : '浏览器演示模式'}>
          <i />
          {bridgeOnline ? 'AGENT' : info?.isElectron ? 'OFFLINE' : 'WEB'}
        </span>
        <button className={`icon-btn ${aiOpen ? 'active' : ''}`} title="AI 工作台 (Ctrl+Shift+A)" onClick={() => setAiOpen(!aiOpen)}>
          <Sparkles size={17} />
        </button>
        <button className="icon-btn" title="帮助与 CLI" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={17} />
        </button>
        <button className="icon-btn" title="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={17} />
        </button>

        {info?.isElectron && (
          <div className="window-controls">
            <button onClick={() => win('minimize')} title="最小化"><Minus size={14} /></button>
            <button onClick={() => win('maximize')} title={maximized ? '还原' : '最大化'}>
              {maximized ? <Copy size={12} /> : <Square size={12} />}
            </button>
            <button className="close" onClick={() => win('close')} title="关闭"><X size={14} /></button>
          </div>
        )}
      </div>
    </header>
  );
}
