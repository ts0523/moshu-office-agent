import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer2, Square, Circle, PenLine, Link2, Type, LayoutGrid, Plus, Minus,
  Maximize2, Save, Download, Wand2, ImagePlus, Trash2, Copy, Pencil, RotateCcw, Sparkles, X,
} from 'lucide-react';
import { useStore, type BoardTool } from '../store';
import { edgePath, portPoint, boundsOf, TONE_COLORS } from '../lib/boardRender';
import type { Board as BoardType, BoardNode, Port, Tone } from '../types';

interface Viewport { x: number; y: number; zoom: number }

type Drag =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'move'; sx: number; sy: number; nodes: { id: string; x: number; y: number }[]; snapshot: BoardType }
  | { mode: 'resize'; sx: number; sy: number; id: string; w: number; h: number; snapshot: BoardType }
  | { mode: 'draft'; sx: number; sy: number; x: number; y: number; w: number; h: number; tool: BoardTool }
  | { mode: 'marquee'; sx: number; sy: number; x: number; y: number; w: number; h: number; additive: boolean }
  | { mode: 'pen'; points: number[] }
  | { mode: 'link'; fromId: string; port: Port; x: number; y: number };

const TONES: Tone[] = ['ink', 'clay', 'moss', 'sky', 'sand'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function Board({ split }: { split: boolean }) {
  const board = useStore((s) => s.board);
  const boardFile = useStore((s) => s.boardFile);
  const tool = useStore((s) => s.tool);
  const selectedNodes = useStore((s) => s.selectedNodes);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const zoomLabel = useStore((s) => s.settings.toolbarScale);
  const setTool = useStore((s) => s.setTool);
  const selectNode = useStore((s) => s.selectNode);
  const selectEdge = useStore((s) => s.selectEdge);
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const removeSelected = useStore((s) => s.removeSelected);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const connectNodes = useStore((s) => s.connectNodes);
  const commitHistory = useStore((s) => s.commitHistory);
  const setBoardName = useStore((s) => s.setBoardName);
  const saveBoard = useStore((s) => s.saveBoard);
  const boardDirty = useStore((s) => s.boardDirty);
  const autoLayout = useStore((s) => s.autoLayout);
  const exportBoard = useStore((s) => s.exportBoard);
  const setView = useStore((s) => s.setView);
  const setAiTab = useStore((s) => s.setAiTab);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const toast = useStore((s) => s.toast);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 40, zoom: 0.85 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | null>(null);
  const spaceRef = useRef(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const setViewportSafe = (next: Viewport) => {
    viewportRef.current = next;
    setViewport(next);
  };

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const bounds = boundsOf(board, 60);
    const zoom = clamp(Math.min(rect.width / bounds.w, rect.height / bounds.h), 0.24, 1.15);
    setViewportSafe({
      zoom,
      x: (rect.width - bounds.w * zoom) / 2 - bounds.x * zoom,
      y: (rect.height - bounds.h * zoom) / 2 - bounds.y * zoom,
    });
  }, [board]);

  useEffect(() => {
    const timer = setTimeout(fit, 60);
    return () => clearTimeout(timer);
    // 只在切换画布时重新适配
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardFile]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = cx ?? rect.width / 2;
    const py = cy ?? rect.height / 2;
    setViewport((prev) => {
      const zoom = clamp(prev.zoom * factor, 0.22, 2.4);
      const wx = (px - prev.x) / prev.zoom;
      const wy = (py - prev.y) / prev.zoom;
      return { zoom, x: px - wx * zoom, y: py - wy * zoom };
    });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(event.deltaY < 0 ? 1.09 : 0.92, event.clientX - rect.left, event.clientY - rect.top);
      } else {
        setViewport((prev) => ({ ...prev, x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = event.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const cmd = (event as CustomEvent<{ cmd: string }>).detail?.cmd;
      if (cmd === 'fit') fit();
      if (cmd === 'in') zoomAt(1.12);
      if (cmd === 'out') zoomAt(0.9);
    };
    window.addEventListener('moshu:board-command', handler);
    return () => window.removeEventListener('moshu:board-command', handler);
  }, [fit, zoomAt]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = viewportRef.current;
    return {
      x: (clientX - rect.left - v.x) / v.zoom,
      y: (clientY - rect.top - v.y) / v.zoom,
    };
  };

  const nearestPort = (node: BoardNode, point: { x: number; y: number }): Port => {
    const ports: Port[] = ['top', 'right', 'bottom', 'left'];
    return ports.reduce((best, port) => {
      const p = portPoint(node, port);
      const bp = portPoint(node, best);
      return Math.hypot(point.x - p.x, point.y - p.y) < Math.hypot(point.x - bp.x, point.y - bp.y) ? port : best;
    }, 'top' as Port);
  };

  const startLink = (nodeId: string, port: Port, clientX: number, clientY: number) => {
    const world = toWorld(clientX, clientY);
    const next: Drag = { mode: 'link', fromId: nodeId, port, x: world.x, y: world.y };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      const next: Drag = { mode: 'pan', sx: event.clientX, sy: event.clientY, ox: viewport.x, oy: viewport.y };
      dragRef.current = next;
      setDrag(next);
      wrapRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    const portEl = target.closest<HTMLElement>('[data-port]');
    const nodeEl = target.closest<HTMLElement>('[data-node-id]');
    const resizeEl = target.closest<HTMLElement>('[data-resize]');
    const edgeEl = target.closest<HTMLElement>('[data-edge-id]');

    if (tool === 'hand' || spaceRef.current) {
      const next: Drag = { mode: 'pan', sx: event.clientX, sy: event.clientY, ox: viewport.x, oy: viewport.y };
      dragRef.current = next;
      setDrag(next);
      wrapRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (portEl && nodeEl) {
      event.stopPropagation();
      startLink(nodeEl.dataset.nodeId!, portEl.dataset.port as Port, event.clientX, event.clientY);
      wrapRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (nodeEl) {
      const id = nodeEl.dataset.nodeId!;
      const node = board.nodes.find((n) => n.id === id);
      if (!node) return;
      event.stopPropagation();

      if (resizeEl) {
        const next: Drag = { mode: 'resize', sx: event.clientX, sy: event.clientY, id, w: node.w, h: node.h, snapshot: structuredClone(board) };
        dragRef.current = next;
        setDrag(next);
        wrapRef.current?.setPointerCapture(event.pointerId);
        return;
      }

      if (tool === 'connect') {
        const world = toWorld(event.clientX, event.clientY);
        startLink(id, nearestPort(node, world), event.clientX, event.clientY);
        wrapRef.current?.setPointerCapture(event.pointerId);
        return;
      }

      let ids: string[];
      if (event.shiftKey) {
        ids = selectedNodes.includes(id) ? selectedNodes : [...selectedNodes, id];
        if (!selectedNodes.includes(id)) selectNode(id, true);
      } else if (selectedNodes.includes(id)) {
        ids = selectedNodes;
      } else {
        ids = [id];
        selectNode(id);
      }

      const moving = ids.filter((n) => board.nodes.some((node2) => node2.id === n));
      const snapshot = structuredClone(board);
      const next: Drag = {
        mode: 'move',
        sx: event.clientX,
        sy: event.clientY,
        nodes: moving.map((nid) => {
          const n = board.nodes.find((node2) => node2.id === nid)!;
          return { id: nid, x: n.x, y: n.y };
        }),
        snapshot,
      };
      dragRef.current = next;
      setDrag(next);
      wrapRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (edgeEl) {
      selectEdge(edgeEl.dataset.edgeId!);
      return;
    }

    selectNode(null);
    selectEdge(null);
    setEditing(null);

    const world = toWorld(event.clientX, event.clientY);

    if (tool === 'pen') {
      const next: Drag = { mode: 'pen', points: [world.x, world.y] };
      dragRef.current = next;
      setDrag(next);
      wrapRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'image' || tool === 'card' || tool === 'circle' || tool === 'text') {
      const next: Drag = { mode: 'draft', sx: world.x, sy: world.y, x: world.x, y: world.y, w: 0, h: 0, tool };
      dragRef.current = next;
      setDrag(next);
      wrapRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'select') {
      const next: Drag = { mode: 'marquee', sx: world.x, sy: world.y, x: world.x, y: world.y, w: 0, h: 0, additive: event.shiftKey };
      dragRef.current = next;
      setDrag(next);
      wrapRef.current?.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;

    if (current.mode === 'pan') {
      setViewport((prev) => ({ ...prev, x: current.ox + event.clientX - current.sx, y: current.oy + event.clientY - current.sy }));
      return;
    }

    const world = toWorld(event.clientX, event.clientY);

    if (current.mode === 'move') {
      const dx = (event.clientX - current.sx) / viewportRef.current.zoom;
      const dy = (event.clientY - current.sy) / viewportRef.current.zoom;
      current.nodes.forEach((n) => updateNode(n.id, { x: Math.round(n.x + dx), y: Math.round(n.y + dy) }, false));
      return;
    }

    if (current.mode === 'resize') {
      const dx = (event.clientX - current.sx) / viewportRef.current.zoom;
      const dy = (event.clientY - current.sy) / viewportRef.current.zoom;
      updateNode(current.id, { w: Math.max(80, Math.round(current.w + dx)), h: Math.max(60, Math.round(current.h + dy)) }, false);
      return;
    }

    if (current.mode === 'draft') {
      const x = Math.min(world.x, current.sx);
      const y = Math.min(world.y, current.sy);
      const next: Drag = {
        ...current,
        x,
        y,
        w: Math.abs(world.x - current.sx),
        h: Math.abs(world.y - current.sy),
      };
      dragRef.current = next;
      setDrag(next);
      return;
    }

    if (current.mode === 'marquee') {
      const next: Drag = {
        ...current,
        x: Math.min(world.x, current.sx),
        y: Math.min(world.y, current.sy),
        w: Math.abs(world.x - current.sx),
        h: Math.abs(world.y - current.sy),
      };
      dragRef.current = next;
      setDrag(next);
      return;
    }

    if (current.mode === 'pen') {
      const points = current.points;
      const lastX = points[points.length - 2];
      const lastY = points[points.length - 1];
      if (Math.hypot(world.x - lastX, world.y - lastY) > 2.5) {
        const next: Drag = { mode: 'pen', points: [...points, world.x, world.y] };
        dragRef.current = next;
        setDrag(next);
      }
      return;
    }

    if (current.mode === 'link') {
      const next: Drag = { ...current, x: world.x, y: world.y };
      dragRef.current = next;
      setDrag(next);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;

    if (current.mode === 'move' || current.mode === 'resize') {
      commitHistory(current.snapshot);
      return;
    }

    if (current.mode === 'marquee') {
      if (current.w < 4 && current.h < 4) return;
      const hits = board.nodes
        .filter((n) => n.x < current.x + current.w && n.x + n.w > current.x && n.y < current.y + current.h && n.y + n.h > current.y)
        .map((n) => n.id);
      hits.forEach((id, index) => selectNode(id, index > 0 || current.additive));
      return;
    }

    if (current.mode === 'link') {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-node-id]');
      const targetId = target?.dataset.nodeId;
      if (targetId && targetId !== current.fromId) {
        const targetNode = board.nodes.find((n) => n.id === targetId);
        if (targetNode) {
          const world = toWorld(event.clientX, event.clientY);
          connectNodes(current.fromId, targetId, '', { from: current.port, to: nearestPort(targetNode, world) });
          toast('已连接 · 双击连线可加标签', 'ok');
        }
      }
      return;
    }

    if (current.mode === 'pen') {
      if (current.points.length < 6) return;
      const xs = current.points.filter((_, i) => i % 2 === 0);
      const ys = current.points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const radii: number[] = [];
      for (let i = 0; i < current.points.length; i += 2) {
        radii.push(Math.hypot(current.points[i] - cx, current.points[i + 1] - cy));
      }
      const avg = radii.reduce((a, b) => a + b, 0) / radii.length;
      const variance = Math.sqrt(radii.reduce((sum, r) => sum + (r - avg) ** 2, 0) / radii.length) / (avg || 1);
      const firstX = current.points[0];
      const firstY = current.points[1];
      const lastX = current.points[current.points.length - 2];
      const lastY = current.points[current.points.length - 1];
      const closed = Math.hypot(lastX - firstX, lastY - firstY) < Math.max(26, Math.hypot(w, h) * 0.32);
      const roundness = Math.min(w, h) / Math.max(w, h);
      const isCircle = closed && variance < 0.36 && roundness > 0.55 && Math.max(w, h) > 26;

      if (isCircle) {
        const radius = Math.max(w, h) / 2;
        const id = addNode({
          kind: 'annotation-circle',
          x: cx - radius,
          y: cy - radius,
          w: radius * 2,
          h: radius * 2,
          title: '标注',
          tone: 'clay',
        });
        setEditing({ id, title: '标注', body: '' });
        setTool('select');
        toast('已识别为标注圆 · 直接输入文字', 'ok');
      } else {
        addNode({
          kind: 'ink',
          x: minX,
          y: minY,
          w,
          h,
          title: '手绘',
          points: current.points.map((value, index) => (index % 2 === 0 ? value - minX : value - minY)),
          tone: 'ink',
        });
      }
      return;
    }

    if (current.mode === 'draft') {
      const w = Math.max(24, current.w);
      const h = Math.max(24, current.h);
      const x = current.w < 12 ? current.sx : current.x;
      const y = current.h < 12 ? current.sy : current.y;
      if (current.tool === 'image') {
        addNode({ kind: 'image', x, y, w: Math.max(120, w), h: Math.max(80, h), title: '图片框', tone: 'clay' });
        toast('图片框已创建 · 双击或拖入图片', 'ok');
      } else if (current.tool === 'card') {
        const id = addNode({ kind: 'card', x, y, w: Math.max(200, w), h: Math.max(110, h), title: '新方片', body: '双击编辑文字', tone: 'ink' });
        setEditing({ id, title: '新方片', body: '双击编辑文字' });
      } else if (current.tool === 'circle') {
        const size = Math.max(60, Math.max(w, h));
        const id = addNode({ kind: 'annotation-circle', x, y, w: size, h: size, title: '标注', tone: 'clay' });
        setEditing({ id, title: '标注', body: '' });
      } else if (current.tool === 'text') {
        const id = addNode({ kind: 'note', x, y, w: Math.max(180, w), h: Math.max(90, h), title: '随手记', body: '', tone: 'sand' });
        setEditing({ id, title: '随手记', body: '' });
      }
      setTool('select');
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const nodeEl = target.closest<HTMLElement>('[data-node-id]');
    if (nodeEl) {
      const node = board.nodes.find((n) => n.id === nodeEl.dataset.nodeId);
      if (!node) return;
      if (node.kind === 'image') {
        imageTarget.current = node.id;
        imageRef.current?.click();
        return;
      }
      if (node.kind === 'ink') return;
      setEditing({ id: node.id, title: node.title, body: node.body ?? '' });
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    const id = addNode({ kind: 'card', x: world.x - 110, y: world.y - 60, w: 220, h: 120, title: '新方片', body: '双击编辑文字', tone: 'ink' });
    setEditing({ id, title: '新方片', body: '双击编辑文字' });
    setTool('select');
  };

  const commitEditing = () => {
    if (!editing) return;
    updateNode(editing.id, { title: editing.title, body: editing.body });
    setEditing(null);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const world = toWorld(event.clientX, event.clientY);
        const ratio = Math.min(520 / img.width, 400 / img.height, 1);
        addNode({
          kind: 'image',
          x: world.x - (img.width * ratio) / 2,
          y: world.y - (img.height * ratio) / 2,
          w: img.width * ratio,
          h: img.height * ratio,
          title: file.name,
          image: String(reader.result),
          tone: 'clay',
        });
        toast('图片已放入画布', 'ok');
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const selected = board.nodes.filter((n) => selectedNodes.includes(n.id));
  const single = selected.length === 1 ? selected[0] : null;

  const linkPreview = useMemo(() => {
    if (!drag || drag.mode !== 'link') return null;
    const from = board.nodes.find((n) => n.id === drag.fromId);
    if (!from) return null;
    const a = portPoint(from, drag.port);
    const b = { x: drag.x, y: drag.y };
    const offset = Math.max(50, Math.min(140, Math.hypot(b.x - a.x, b.y - a.y) * 0.35));
    const dir = drag.port === 'left' ? { x: -offset, y: 0 } : drag.port === 'right' ? { x: offset, y: 0 } : drag.port === 'top' ? { x: 0, y: -offset } : { x: 0, y: offset };
    return `M ${a.x} ${a.y} C ${a.x + dir.x} ${a.y + dir.y}, ${b.x} ${b.y}, ${b.x} ${b.y}`;
  }, [drag, board]);

  const overlayLeft = single ? viewport.x + (single.x + single.w / 2) * viewport.zoom : 0;
  const overlayTop = single ? viewport.y + single.y * viewport.zoom - 46 : 0;

  const cursorClass = tool === 'hand' ? 'cursor-hand' : tool === 'select' ? 'cursor-select' : 'cursor-draw';

  return (
    <section
      className={`board-panel ${split ? 'split' : ''} ${cursorClass}`}
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
    >
      <div
        className="board-grid"
        style={{
          backgroundSize: `${(board.background === 'grid' ? 28 : 24) * viewport.zoom}px ${(board.background === 'grid' ? 28 : 24) * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />

      <div className="board-top">
        <div className="board-name-wrap">
          <input
            className="board-name"
            value={board.name}
            onChange={(event) => setBoardName(event.target.value)}
            onBlur={() => void saveBoard(true)}
            spellCheck={false}
          />
          <span className="board-file">{boardFile}</span>
        </div>
        <div className="board-top-actions">
          <span className={`board-save ${boardDirty ? 'dirty' : ''}`}>{boardDirty ? '未保存' : '已保存'}</span>
          <button className="board-btn" onClick={() => autoLayout()} title="按连接关系整理">
            <LayoutGrid size={13} /> 整理
          </button>
          <button className="board-btn" onClick={() => void exportBoard('png')} title="导出 PNG">
            <Download size={13} /> PNG
          </button>
          <button className="board-btn" onClick={() => void saveBoard()} title="保存画布">
            <Save size={13} />
          </button>
          <button className="board-btn" onClick={() => setView('doc')} title="返回文档">
            <X size={13} />
          </button>
        </div>
      </div>

      <div
        className="board-world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
        <svg className="board-edges" width="1" height="1">
          <defs>
            {board.edges.map((edge) => (
              <marker
                key={edge.id}
                id={`arrow-${edge.id}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={selectedEdge === edge.id ? 'var(--accent)' : 'var(--ink-3)'} />
              </marker>
            ))}
          </defs>
          {board.edges.map((edge) => {
            const from = board.nodes.find((n) => n.id === edge.from.nodeId);
            const to = board.nodes.find((n) => n.id === edge.to.nodeId);
            if (!from || !to) return null;
            const d = edgePath(from, edge.from.port, to, edge.to.port);
            const isSelected = selectedEdge === edge.id;
            const mx = (portPoint(from, edge.from.port).x + portPoint(to, edge.to.port).x) / 2;
            const my = (portPoint(from, edge.from.port).y + portPoint(to, edge.to.port).y) / 2;
            return (
              <g key={edge.id} className={`edge ${isSelected ? 'selected' : ''}`} data-edge-id={edge.id}>
                <path d={d} className="edge-hit" />
                <path d={d} className="edge-line" markerEnd={`url(#arrow-${edge.id})`} />
                {edge.label && (
                  <text x={mx} y={my - 6} className="edge-label" textAnchor="middle">{edge.label}</text>
                )}
              </g>
            );
          })}
          {linkPreview && <path d={linkPreview} className="edge-preview" />}
          {drag && drag.mode === 'pen' && (
            <polyline
              points={Array.from({ length: drag.points.length / 2 }, (_, i) => `${drag.points[i * 2]},${drag.points[i * 2 + 1]}`).join(' ')}
              className="pen-preview"
            />
          )}
          {drag && drag.mode === 'marquee' && (
            <rect x={drag.x} y={drag.y} width={drag.w} height={drag.h} className="marquee" />
          )}
          {drag && drag.mode === 'draft' && (
            <rect x={drag.x} y={drag.y} width={drag.w} height={drag.h} className={`draft-rect tool-${drag.tool}`} rx={drag.tool === 'circle' ? Math.min(drag.w, drag.h) / 2 : 12} />
          )}
        </svg>

        {board.nodes.map((node) => {
          const isSelected = selectedNodes.includes(node.id);
          const isEditing = editing?.id === node.id;
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              className={`node kind-${node.kind} tone-${node.tone ?? 'ink'} ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`}
              style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
              onDragOver={node.kind === 'image' ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
              onDrop={node.kind === 'image' ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => updateNode(node.id, { image: String(reader.result), title: file.name });
                reader.readAsDataURL(file);
              } : undefined}
            >
              {node.kind === 'image' && (
                node.image
                  ? <img src={node.image} alt={node.title} draggable={false} />
                  : (
                    <div className="image-placeholder">
                      <ImagePlus size={22} />
                      <span>拖入图片，或双击选择</span>
                      <em>{Math.round(node.w)} × {Math.round(node.h)}</em>
                    </div>
                  )
              )}

              {node.kind === 'ink' && (
                <svg className="ink-svg" width={node.w} height={node.h} viewBox={`0 0 ${node.w} ${node.h}`}>
                  <polyline
                    points={Array.from({ length: (node.points?.length ?? 0) / 2 }, (_, i) => `${node.points![i * 2]},${node.points![i * 2 + 1]}`).join(' ')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}

              {(node.kind === 'card' || node.kind === 'note' || node.kind === 'annotation-circle') && (
                isEditing ? (
                  <div className="node-edit" onPointerDown={(event) => event.stopPropagation()}>
                    <input
                      autoFocus
                      value={editing.title}
                      onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditing(null);
                        if (event.key === 'Enter' && node.kind !== 'card') commitEditing();
                      }}
                      className="node-edit-title"
                      placeholder="标题"
                    />
                    {node.kind !== 'annotation-circle' && (
                      <textarea
                        value={editing.body}
                        onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                        onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null); }}
                        className="node-edit-body"
                        placeholder="写点什么"
                      />
                    )}
                    <button className="node-edit-done" onClick={commitEditing}>完成</button>
                  </div>
                ) : (
                  <>
                    {node.kind !== 'annotation-circle' && <span className="node-dot" />}
                    <div className={`node-title ${node.kind === 'annotation-circle' ? 'circle-title' : ''}`}>{node.title}</div>
                    {node.kind !== 'annotation-circle' && node.body && <div className="node-body">{node.body}</div>}
                    {node.kind === 'card' && <span className="node-tag">CARD</span>}
                  </>
                )
              )}

              {node.kind !== 'ink' && !isEditing && (
                <>
                  {(['top', 'right', 'bottom', 'left'] as Port[]).map((port) => (
                    <span
                      key={port}
                      className={`port port-${port}`}
                      data-port={port}
                      data-node-id={node.id}
                      title={`从${port}拖出连线`}
                    />
                  ))}
                  {isSelected && <span className="resize-handle" data-resize="1" onPointerDown={(event) => event.stopPropagation()} />}
                </>
              )}
            </div>
          );
        })}
      </div>

      {!board.nodes.length && (
        <div className="board-empty">
          <div className="board-empty-mark"><LayoutGrid size={22} /></div>
          <h3>在纸上，把关系画出来</h3>
          <p>双击空白处新建方片 · 按 <kbd>R</kbd> 拖出矩形图片框 · 按 <kbd>O</kbd> 随手画圆</p>
          <div className="board-empty-tools">
            <button onClick={() => { setTool('card'); }}><Plus size={13} /> 方片</button>
            <button onClick={() => { setTool('image'); }}><Square size={13} /> 图片框</button>
            <button onClick={() => { setTool('pen'); }}><PenLine size={13} /> 手绘标注</button>
          </div>
        </div>
      )}

      {single && !editing && (
        <div className="node-actions" style={{ left: clamp(overlayLeft, 120, (wrapRef.current?.clientWidth ?? 800) - 120), top: Math.max(96, overlayTop) }}>
          {TONES.map((tone) => (
            <button
              key={tone}
              className={`tone-dot tone-${tone} ${single.tone === tone ? 'active' : ''}`}
              title={`设为 ${tone}`}
              onClick={() => updateNode(single.id, { tone })}
            />
          ))}
          <span className="node-actions-sep" />
          <button title="编辑" onClick={() => setEditing({ id: single.id, title: single.title, body: single.body ?? '' })}><Pencil size={13} /></button>
          <button title="复制" onClick={() => duplicateSelected()}><Copy size={13} /></button>
          <button title="AI 生成" onClick={() => { setAiOpen(true); setAiTab('image'); }}><Sparkles size={13} /></button>
          <button title="删除" onClick={() => removeSelected()}><Trash2 size={13} /></button>
        </div>
      )}

      <div className="board-zoom">
        <button onClick={() => zoomAt(0.9)} title="缩小"><Minus size={13} /></button>
        <button className="zoom-value" onClick={fit} title="适应画布">{Math.round(viewport.zoom * 100)}%</button>
        <button onClick={() => zoomAt(1.12)} title="放大"><Plus size={13} /></button>
        <button onClick={fit} title="适应窗口"><Maximize2 size={13} /></button>
        <span className="board-count">{board.nodes.length}N / {board.edges.length}E</span>
      </div>

      <div className="board-mode-hint">
        <span className="hint-key">{tool === 'select' ? 'V' : tool === 'card' ? 'C' : tool === 'image' ? 'R' : tool === 'circle' ? 'O' : tool === 'pen' ? 'P' : tool === 'connect' ? 'L' : tool === 'text' ? 'T' : 'H'}</span>
        <span>{{
          select: '选择与拖拽 · 拖空白框选',
          card: '拖出方片',
          image: '拖出矩形图片框',
          circle: '拖出标注圆',
          pen: '随手画圆自动转标注',
          connect: '从方片拖出连线',
          text: '拖出便签',
          hand: '拖动画布',
        }[tool]}</span>
        <span className="hint-divider" />
        <span>滚轮平移 · Ctrl+滚轮缩放</span>
      </div>

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          const target = imageTarget.current;
          if (file && target) {
            const reader = new FileReader();
            reader.onload = () => updateNode(target, { image: String(reader.result), title: file.name });
            reader.readAsDataURL(file);
          }
          imageTarget.current = null;
          event.target.value = '';
        }}
      />
      <input type="hidden" value={zoomLabel} readOnly />
    </section>
  );
}

const TOOL_ICONS = { select: MousePointer2, card: Square, image: ImagePlus, circle: Circle, pen: PenLine, connect: Link2, text: Type, hand: LayoutGrid };
void TOOL_ICONS;
void TONE_COLORS;
void RotateCcw;
