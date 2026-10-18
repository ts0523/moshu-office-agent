import { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { Rail } from './components/Rail';
import { FilePanel } from './components/FilePanel';
import { TabStrip } from './components/TabStrip';
import { DocumentView } from './components/DocumentView';
import { Board } from './components/Board';
import { AIPanel } from './components/AIPanel';
import { BottomToolbar } from './components/BottomToolbar';
import { Toasts } from './components/Toasts';
import { CommandPalette, HelpModal, SettingsModal } from './components/Modals';
import { useStore } from './store';
import { connectAgentBridge } from './lib/agent';

export default function App() {
  const booted = useStore((s) => s.booted);
  const view = useStore((s) => s.view);
  const aiOpen = useStore((s) => s.aiOpen);
  const toolbarScale = useStore((s) => s.settings.toolbarScale);
  const boot = useStore((s) => s.boot);
  const bridgeStarted = useRef(false);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    document.documentElement.style.setProperty('--tb-scale', String(toolbarScale));
  }, [toolbarScale]);

  useEffect(() => {
    if (!booted || bridgeStarted.current) return;
    bridgeStarted.current = true;
    return connectAgentBridge();
  }, [booted]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const store = useStore.getState();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (store.view === 'doc') void store.saveActive();
        else void store.saveBoard();
        return;
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        store.setCommandOpen(!store.commandOpen);
        return;
      }
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        const stamp = Date.now().toString().slice(-4);
        void store.createFile(`未命名-${stamp}.md`, 'md');
        store.setView('doc');
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        store.setAiOpen(!store.aiOpen);
        return;
      }
      if (mod && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        store.setView(event.key === '1' ? 'doc' : event.key === '2' ? 'board' : 'split');
        return;
      }
      if (event.key === 'Escape') {
        if (store.commandOpen) store.setCommandOpen(false);
        else if (store.settingsOpen) store.setSettingsOpen(false);
        else if (store.helpOpen) store.setHelpOpen(false);
        return;
      }
      if (typing) return;

      if (store.view !== 'doc') {
        if (mod && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          event.shiftKey ? store.redoBoard() : store.undoBoard();
          return;
        }
        if (mod && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          store.redoBoard();
          return;
        }
      }

      if (store.view !== 'doc' && (store.selectedNodes.length || store.selectedEdge)) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          store.removeSelected();
          return;
        }
        if (mod && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          store.duplicateSelected();
          return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          const step = event.shiftKey ? 20 : 4;
          const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
          const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          for (const id of store.selectedNodes) {
            const node = store.board.nodes.find((n) => n.id === id);
            if (node) store.updateNode(id, { x: node.x + dx, y: node.y + dy });
          }
          return;
        }
      }

      if (store.view !== 'doc') {
        const tools: Record<string, 'select' | 'card' | 'image' | 'circle' | 'pen' | 'connect' | 'text' | 'hand'> = {
          v: 'select', c: 'card', r: 'image', o: 'circle', p: 'pen', l: 'connect', t: 'text', h: 'hand',
        };
        const tool = tools[event.key.toLowerCase()];
        if (tool && !mod) {
          store.setTool(tool);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!booted) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">
          <span>墨</span>
        </div>
        <div className="boot-title">墨枢 Office Agent</div>
        <div className="boot-line">正在铺开工作台</div>
      </div>
    );
  }

  return (
    <div className="app">
      <TitleBar />
      <div className={`shell ${aiOpen ? 'with-ai' : ''} ${view === 'split' ? 'split-mode' : ''}`}>
        <Rail />
        <FilePanel />
        <div className="stage">
          <TabStrip />
          <div className={`workbench view-${view}`}>
            {view !== 'board' && <DocumentView />}
            {view !== 'doc' && <Board split={view === 'split'} />}
          </div>
        </div>
        {aiOpen && <AIPanel />}
      </div>
      <BottomToolbar />
      <Toasts />
      <CommandPalette />
      <SettingsModal />
      <HelpModal />
    </div>
  );
}
