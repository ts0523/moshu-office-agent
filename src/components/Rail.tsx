import { FileText, LayoutGrid, Columns2, Sparkles, Terminal, Sun, Moon, Settings, HelpCircle } from 'lucide-react';
import { useStore } from '../store';

export function Rail() {
  const view = useStore((s) => s.view);
  const aiOpen = useStore((s) => s.aiOpen);
  const aiTab = useStore((s) => s.aiTab);
  const theme = useStore((s) => s.settings.theme);
  const setView = useStore((s) => s.setView);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const setAiTab = useStore((s) => s.setAiTab);
  const updateSettings = useStore((s) => s.updateSettings);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  const openAi = (tab: 'image' | 'agent') => {
    setAiTab(tab);
    setAiOpen(true);
  };

  return (
    <nav className="rail">
      <div className="rail-group">
        <button className={`rail-btn ${view === 'doc' ? 'active' : ''}`} onClick={() => setView('doc')} title="文档工作区 (Ctrl+1)">
          <FileText size={19} />
          <span>文档</span>
        </button>
        <button className={`rail-btn ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')} title="方片画布 (Ctrl+2)">
          <LayoutGrid size={19} />
          <span>画布</span>
        </button>
        <button className={`rail-btn ${view === 'split' ? 'active' : ''}`} onClick={() => setView('split')} title="分栏：文档 + 画布 (Ctrl+3)">
          <Columns2 size={19} />
          <span>分栏</span>
        </button>
      </div>

      <div className="rail-divider" />

      <div className="rail-group">
        <button className={`rail-btn ${aiOpen && aiTab !== 'agent' ? 'active' : ''}`} onClick={() => openAi('image')} title="AI 工作台">
          <Sparkles size={19} />
          <span>AI</span>
        </button>
        <button className={`rail-btn ${aiOpen && aiTab === 'agent' ? 'active' : ''}`} onClick={() => openAi('agent')} title="Agent 控制台">
          <Terminal size={19} />
          <span>Agent</span>
        </button>
      </div>

      <div className="rail-spacer" />

      <div className="rail-group rail-bottom">
        <button className="rail-btn" onClick={() => updateSettings({ theme: theme === 'light' ? 'dark' : 'light' })} title="切换明暗">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="rail-btn" onClick={() => setHelpOpen(true)} title="帮助">
          <HelpCircle size={18} />
        </button>
        <button className="rail-btn" onClick={() => setSettingsOpen(true)} title="设置">
          <Settings size={18} />
        </button>
      </div>
    </nav>
  );
}
