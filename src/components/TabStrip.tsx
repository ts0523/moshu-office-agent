import { Plus, X, FileText, Table2, Presentation, FileType2, Braces, LayoutGrid, Columns2, File, Save } from 'lucide-react';
import { useStore } from '../store';
import { specOf } from '../lib/formats';

function TabIcon({ name }: { name: string }) {
  const kind = specOf(name).kind;
  if (kind === 'sheet') return <Table2 size={13} />;
  if (kind === 'slides') return <Presentation size={13} />;
  if (kind === 'pdf') return <FileType2 size={13} />;
  if (kind === 'code') return <Braces size={13} />;
  if (kind === 'board') return <LayoutGrid size={13} />;
  return <FileText size={13} />;
}

export function TabStrip() {
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const view = useStore((s) => s.view);
  const board = useStore((s) => s.board);
  const boardFile = useStore((s) => s.boardFile);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const createFile = useStore((s) => s.createFile);
  const setView = useStore((s) => s.setView);
  const saveActive = useStore((s) => s.saveActive);
  const saveState = useStore((s) => s.saveState);
  const active = tabs.find((t) => t.id === activeId);

  const newDoc = async () => {
    await createFile(`未命名-${Date.now().toString().slice(-4)}.md`, 'md');
    setView(view === 'board' ? 'doc' : view);
  };

  return (
    <div className="tabstrip">
      <div className="tabs">
        {view !== 'doc' && (
          <div className="tab board-tab active" onClick={() => setView('board')} title="方片画布">
            <span className="tab-icon"><LayoutGrid size={13} /></span>
            <span className="tab-name">{board.name || boardFile.replace('.board.json', '')}</span>
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeId && view !== 'board' ? 'active' : ''}`}
            onClick={() => setActive(tab.id)}
            onAuxClick={(event) => { if (event.button === 1) closeTab(tab.id); }}
            title={tab.name}
          >
            <span className={`tab-icon kind-${tab.kind}`}><TabIcon name={tab.name} /></span>
            <span className="tab-name">{tab.name}</span>
            {tab.dirty ? <span className="tab-dot" /> : null}
            <button
              className="tab-close"
              onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button className="tab-new" onClick={() => void newDoc()} title="新建 Markdown (Ctrl+N)">
          <Plus size={14} />
        </button>
      </div>

      <div className="tabstrip-right">
        {active && view !== 'board' && (
          <button className="tab-save" onClick={() => void saveActive()} title="保存 (Ctrl+S)">
            <Save size={13} />
            <span>{saveState === 'saving' ? '保存中' : active.dirty ? '未保存' : '已保存'}</span>
          </button>
        )}
        <div className="view-switch">
          <button className={view === 'doc' ? 'active' : ''} onClick={() => setView('doc')} title="文档">
            <File size={14} />
          </button>
          <button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')} title="分栏">
            <Columns2 size={14} />
          </button>
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')} title="画布">
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
