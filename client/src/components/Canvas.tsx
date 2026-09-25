import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Anchor, DiagramEdge, DiagramNode, EdgeEnd, Point, Rect, Side } from '../types';
import { GRID, snapValue, useEditor } from '../store/editor';
import {
  boundsOf,
  distanceToPolyline,
  normalizeRect,
  rectOf,
  rectsIntersect,
  sidePoint,
} from '../lib/geometry';
import { anchorAtPoint, buildLookup, resolveEdge } from '../lib/edges';
import { snapToNeighbours, type Guide } from '../lib/snapping';
import { minHeightFor, shapeDef, umlLayout } from '../shapes/registry';
import { NodeView } from './NodeView';
import { EdgeLabels, EdgeView } from './EdgeView';
import { TextOverlay } from './TextOverlay';

const MIN_SIZE = 16;
const GROUP_PAD = 6;
/** En pixels écran : en deçà, on considère que l'utilisateur a cliqué, pas glissé. */
const DRAG_THRESHOLD = 3;

/** Nouveau rectangle obtenu en tirant une poignée, taille minimale garantie. */
function resizeRect(start: Rect, handle: HandleId, d: Point, min = MIN_SIZE): Rect {
  let { x, y, w, h } = start;
  if (handle.includes('w')) {
    x = start.x + d.x;
    w = start.w - d.x;
  }
  if (handle.includes('e')) w = start.w + d.x;
  if (handle.includes('n')) {
    y = start.y + d.y;
    h = start.h - d.y;
  }
  if (handle.includes('s')) h = start.h + d.y;
  if (w < min) {
    if (handle.includes('w')) x = start.x + start.w - min;
    w = min;
  }
  if (h < min) {
    if (handle.includes('n')) y = start.y + start.h - min;
    h = min;
  }
  return { x, y, w, h };
}
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type HandleId = (typeof HANDLES)[number];

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; last: Point }
  | { kind: 'marquee'; origin: Point; additive: boolean }
  | { kind: 'move'; origin: Point; applied: Point; ids: string[]; moved: boolean; base: Rect }
  | { kind: 'resize'; id: string; handle: HandleId; origin: Point; start: Rect; ratio: boolean; started: boolean }
  | {
      kind: 'resize-group';
      handle: HandleId;
      origin: Point;
      start: Rect;
      rects: { id: string; rect: Rect }[];
      started: boolean;
    }
  | { kind: 'connect'; from: EdgeEnd; fromPoint: Point }
  | { kind: 'reconnect'; edgeId: string; which: 'from' | 'to' };

interface CachedGeometry {
  edge: DiagramEdge;
  from?: DiagramNode;
  to?: DiagramNode;
  entry: { edge: DiagramEdge; geo: ReturnType<typeof resolveEdge> };
}

interface Overlay {
  marquee?: Rect;
  link?: { a: Point; b: Point };
  guides?: Guide[];
  target?: { nodeId: string; anchor: Anchor };
}

export interface CanvasHandle {
  element: SVGSVGElement | null;
  viewport: () => Rect;
  /** Dernière position connue du pointeur sur la toile, en coordonnées du schéma. */
  pointer: () => Point | null;
}

interface Props {
  onContextMenu: (position: Point, worldPoint: Point) => void;
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ onContextMenu }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction>({ kind: 'none' });
  const spaceDown = useRef(false);
  const [overlay, setOverlay] = useState<Overlay>({});
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Gardée dans une référence : la suivre dans l'état redessinerait la toile à
  // chaque mouvement de souris.
  const pointerRef = useRef<Point | null>(null);

  const store = useEditor();
  const { nodes, edges, selection, camera, tool, pending, showGrid, editing } = store;

  useImperativeHandle(ref, () => ({
    element: svgRef.current,
    viewport: () => ({ x: 0, y: 0, w: size.w, h: size.h }),
    pointer: () => pointerRef.current,
  }), [size]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Échap interrompt le geste en cours et restaure l'état d'avant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || interaction.current.kind === 'none') return;
      const current = interaction.current;
      const touched =
        (current.kind === 'move' && current.moved) ||
        ((current.kind === 'resize' || current.kind === 'resize-group') && current.started) ||
        current.kind === 'reconnect';
      if (touched) useEditor.getState().undo();
      interaction.current = { kind: 'none' };
      setOverlay({});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // La barre d'espace bascule temporairement en mode déplacement de la vue.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input, textarea')) {
        spaceDown.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const lookup = useMemo(() => buildLookup(nodes), [nodes]);

  // Les entrées sont réutilisées tant que le lien et ses deux formes n'ont pas changé :
  // déplacer une forme ne fait retracer que les liens qui y touchent.
  const geoCache = useRef(new Map<string, CachedGeometry>());
  const geometries = useMemo(() => {
    const next = new Map<string, CachedGeometry>();
    const list = edges.map((edge) => {
      const from = lookup(edge.from.nodeId);
      const to = lookup(edge.to.nodeId);
      const hit = geoCache.current.get(edge.id);
      const entry =
        hit && hit.edge === edge && hit.from === from && hit.to === to
          ? hit.entry
          : { edge, geo: resolveEdge(edge, lookup) };
      next.set(edge.id, { edge, from, to, entry });
      return entry;
    });
    geoCache.current = next;
    return list;
  }, [edges, lookup]);

  const toScreen = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const box = svgRef.current!.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    },
    [],
  );

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const s = toScreen(e);
      const cam = useEditor.getState().camera;
      return { x: (s.x - cam.x) / cam.zoom, y: (s.y - cam.y) / cam.zoom };
    },
    [toScreen],
  );

  const worldToScreen = useCallback(
    (p: Point): Point => ({ x: p.x * camera.zoom + camera.x, y: p.y * camera.zoom + camera.y }),
    [camera],
  );

  const nodeUnder = useCallback((e: { clientX: number; clientY: number }): DiagramNode | undefined => {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of stack) {
      const host = el.closest('[data-node]');
      if (host) {
        const id = host.getAttribute('data-node');
        return useEditor.getState().nodes.find((n) => n.id === id);
      }
    }
    return undefined;
  }, []);

  // ------------------------------------------------------------- édition

  /** Ouvre la saisie au tick suivant : le focus par défaut du navigateur est alors passé. */
  const scheduleEdit = useCallback((id: string) => {
    requestAnimationFrame(() => useEditor.getState().setEditing({ id, field: 'text' }));
  }, []);

  const startEditing = useCallback(
    (node: DiagramNode, worldPoint?: Point) => {
      const def = shapeDef(node.shape);
      let field: 'text' | number = 'text';
      if (def.Text && worldPoint) {
        const local = worldPoint.y - node.y;
        const { rows } = umlLayout(node, node.w, node.h);
        const index = rows.findIndex((r) => local >= r.y && local < r.y + r.h);
        if (index >= 0) field = index;
      }
      useEditor.getState().setEditing({ id: node.id, field });
    },
    [],
  );

  // ---------------------------------------------------------- interactions

  const placeShape = useCallback(
    (world: Point, sticky: boolean) => {
      const state = useEditor.getState();
      if (!state.pending) return;
      const id = state.addNode(state.pending, world);
      if (!sticky) state.setTool('select');
      const created = useEditor.getState().nodes.find((n) => n.id === id);
      if (created && !created.text) scheduleEdit(id);
    },
    [scheduleEdit],
  );

  const beginMove = (ids: string[]) => {
    const state = useEditor.getState();
    const rects = state.nodes.filter((n) => ids.includes(n.id)).map(rectOf);
    const base = boundsOf(rects);
    if (!base) return;
    interaction.current = {
      kind: 'move',
      origin: { x: 0, y: 0 },
      applied: { x: 0, y: 0 },
      ids,
      moved: false,
      base,
    };
  };

  const handleNodePointerDown = useCallback((event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const state = useEditor.getState();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) return;
    const world = toWorld(event);

    // Une forme armée se pose aussi par-dessus une forme existante.
    if (state.tool === 'place' && state.pending) {
      event.preventDefault();
      placeShape(world, event.shiftKey);
      return;
    }
    svgRef.current?.setPointerCapture(event.pointerId);

    if (state.tool === 'connect') {
      interaction.current = { kind: 'connect', from: { nodeId: id, anchor: 'auto' }, fromPoint: world };
      setOverlay({ link: { a: world, b: world } });
      return;
    }

    if (event.shiftKey) {
      state.toggleSelect(id);
      return;
    }
    const selected = state.selection.includes(id) ? state.selection : [id];
    if (!state.selection.includes(id)) state.select([id]);

    const movable = selected.filter((sid) => state.nodes.some((n) => n.id === sid && !n.locked));
    if (!movable.length) return;
    beginMove(movable);
    if (interaction.current.kind === 'move') interaction.current.origin = world;
  }, [placeShape, toWorld]);

  const handleEdgePointerDown = useCallback((event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const state = useEditor.getState();
    if (event.shiftKey) state.toggleSelect(id);
    else state.select([id]);
  }, []);



  const handlePortPointerDown = (event: React.PointerEvent, nodeId: string, anchor: Side) => {
    event.stopPropagation();
    const node = lookup(nodeId)!;
    const point = sidePoint(rectOf(node), anchor);
    svgRef.current?.setPointerCapture(event.pointerId);
    interaction.current = { kind: 'connect', from: { nodeId, anchor, t: 0.5 }, fromPoint: point };
    setOverlay({ link: { a: point, b: point } });
  };

  const handleHandlePointerDown = (event: React.PointerEvent, handle: HandleId) => {
    event.stopPropagation();
    const state = useEditor.getState();
    const node = state.nodes.find((n) => n.id === state.selection[0]);
    if (!node) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    interaction.current = {
      kind: 'resize',
      id: node.id,
      handle,
      origin: toWorld(event),
      start: rectOf(node),
      ratio: Boolean(shapeDef(node.shape).keepRatio),
      started: false,
    };
  };

  const handleGroupHandlePointerDown = (event: React.PointerEvent, handle: HandleId, bounds: Rect) => {
    event.stopPropagation();
    const state = useEditor.getState();
    const rects = state.nodes
      .filter((n) => state.selection.includes(n.id) && !n.locked)
      .map((n) => ({ id: n.id, rect: rectOf(n) }));
    if (rects.length < 2) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    interaction.current = { kind: 'resize-group', handle, origin: toWorld(event), start: bounds, rects, started: false };
  };

  const handleEndpointPointerDown = (event: React.PointerEvent, edgeId: string, which: 'from' | 'to') => {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    useEditor.getState().history();
    interaction.current = { kind: 'reconnect', edgeId, which };
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent) => {
    const state = useEditor.getState();
    const world = toWorld(event);

    if (state.tool === 'connect' && event.button === 0) {
      // Tracé libre : les deux extrémités sont des points, rattachables ensuite.
      svgRef.current?.setPointerCapture(event.pointerId);
      interaction.current = { kind: 'connect', from: { x: world.x, y: world.y }, fromPoint: world };
      setOverlay({ link: { a: world, b: world } });
      return;
    }

    if (event.button === 1 || spaceDown.current || state.tool === 'pan') {
      svgRef.current?.setPointerCapture(event.pointerId);
      interaction.current = { kind: 'pan', last: toScreen(event) };
      return;
    }
    if (event.button !== 0) return;

    if (state.tool === 'place' && state.pending) {
      event.preventDefault();
      placeShape(world, event.shiftKey);
      return;
    }

    svgRef.current?.setPointerCapture(event.pointerId);
    if (!event.shiftKey) state.clearSelection();
    state.setEditing(null);
    interaction.current = { kind: 'marquee', origin: world, additive: event.shiftKey };
    setOverlay({ marquee: { x: world.x, y: world.y, w: 0, h: 0 } });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const state = useEditor.getState();
    const current = interaction.current;
    pointerRef.current = toWorld(event);

    if (current.kind === 'none') {
      const under = nodeUnder(event);
      const id = under && !under.container ? under.id : null;
      if (id !== hover) setHover(id);
      return;
    }

    const world = toWorld(event);

    switch (current.kind) {
      case 'pan': {
        const screen = toScreen(event);
        state.panBy(screen.x - current.last.x, screen.y - current.last.y);
        current.last = screen;
        break;
      }
      case 'marquee': {
        const rect = normalizeRect(current.origin, world);
        setOverlay({ marquee: rect });
        const hits = [
          ...state.nodes.filter((n) => rectsIntersect(rect, rectOf(n))).map((n) => n.id),
          ...geometries
            .filter(({ geo }) => geo.points.some((p) => rectsIntersect(rect, { x: p.x - 1, y: p.y - 1, w: 2, h: 2 })))
            .map(({ edge }) => edge.id),
        ];
        state.select(hits, current.additive);
        break;
      }
      case 'move': {
        const raw = { x: world.x - current.origin.x, y: world.y - current.origin.y };
        if (!current.moved && Math.hypot(raw.x, raw.y) * state.camera.zoom < DRAG_THRESHOLD) break;
        const target = {
          x: current.base.x + raw.x,
          y: current.base.y + raw.y,
          w: current.base.w,
          h: current.base.h,
        };
        let dx = raw.x;
        let dy = raw.y;
        let guides: Guide[] = [];
        const others = state.nodes.filter((n) => !current.ids.includes(n.id)).map(rectOf);
        const magnet = snapToNeighbours(target, others, 6 / state.camera.zoom);
        if (magnet.dx || magnet.dy) {
          dx += magnet.dx;
          dy += magnet.dy;
          guides = magnet.guides;
        }
        if (state.snap && !magnet.dx) dx = snapValue(current.base.x + dx, true) - current.base.x;
        if (state.snap && !magnet.dy) dy = snapValue(current.base.y + dy, true) - current.base.y;

        const step = { x: dx - current.applied.x, y: dy - current.applied.y };
        if (step.x || step.y) {
          if (!current.moved) state.history();
          state.moveNodes(current.ids, step.x, step.y);
          current.applied = { x: dx, y: dy };
          current.moved = true;
        }
        setOverlay({ guides });
        break;
      }
      case 'resize': {
        const d = { x: world.x - current.origin.x, y: world.y - current.origin.y };
        if (!current.started && (d.x || d.y)) {
          state.history();
          current.started = true;
        }
        const s0 = current.start;
        let next = resizeRect(s0, current.handle, d);

        // Les formes à proportions fixes (acteur, nœud initial) gardent leur rapport.
        if (current.handle.length === 2 && (current.ratio || event.shiftKey)) {
          const aspect = s0.w / s0.h;
          let { w, h } = next;
          if (Math.abs(w / aspect) > Math.abs(h)) h = w / aspect;
          else w = h * aspect;
          next = {
            w,
            h,
            x: current.handle.includes('w') ? s0.x + s0.w - w : next.x,
            y: current.handle.includes('n') ? s0.y + s0.h - h : next.y,
          };
        }
        // Les formes à compartiments (classe, interface, énumération) ne descendent pas
        // sous la hauteur de leur contenu : sinon le texte déborde du cadre.
        const node = state.nodes.find((n) => n.id === current.id);
        if (node && shapeDef(node.shape).autoHeight) {
          const floor = Math.ceil(minHeightFor({ ...node, w: next.w }));
          if (next.h < floor) {
            if (current.handle.includes('n')) next = { ...next, y: s0.y + s0.h - floor };
            next = { ...next, h: floor };
          }
        }
        state.updateNode(current.id, {
          x: snapValue(next.x, state.snap),
          y: snapValue(next.y, state.snap),
          w: Math.max(MIN_SIZE, snapValue(next.w, state.snap)),
          h: Math.max(MIN_SIZE, snapValue(next.h, state.snap)),
        });
        break;
      }
      case 'resize-group': {
        const d = { x: world.x - current.origin.x, y: world.y - current.origin.y };
        if (!current.started && (d.x || d.y)) {
          state.history();
          current.started = true;
        }
        const next = resizeRect(current.start, current.handle, d, 32);
        const sx = next.w / current.start.w;
        const sy = next.h / current.start.h;
        const uniform = Math.min(sx, sy);
        const rects: Record<string, Rect> = {};
        for (const { id, rect } of current.rects) {
          // Un acteur ou un nœud initial garde ses proportions même si le groupe s'étire.
          const node = state.nodes.find((n) => n.id === id);
          const [kx, ky] = node && shapeDef(node.shape).keepRatio ? [uniform, uniform] : [sx, sy];
          rects[id] = {
            x: Math.round(next.x + (rect.x - current.start.x) * sx),
            y: Math.round(next.y + (rect.y - current.start.y) * sy),
            w: Math.max(8, Math.round(rect.w * kx)),
            h: Math.max(8, Math.round(rect.h * ky)),
          };
        }
        state.setNodeRects(rects);
        break;
      }
      case 'connect':
      case 'reconnect': {
        const under = nodeUnder(event);
        const anchorTarget = under ? { nodeId: under.id, anchor: 'auto' as Anchor } : undefined;
        const from =
          current.kind === 'connect'
            ? current.fromPoint
            : (() => {
                const entry = geometries.find(({ edge }) => edge.id === current.edgeId);
                if (!entry) return world;
                return current.which === 'from' ? entry.geo.end : entry.geo.start;
              })();
        setOverlay({ link: { a: from, b: world }, target: anchorTarget });
        break;
      }
      default:
        break;
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const state = useEditor.getState();
    const current = interaction.current;
    const world = toWorld(event);

    if (current.kind === 'connect') {
      const under = nodeUnder(event);
      const freeDraw = !current.from.nodeId;
      if (freeDraw) {
        // Un trait tracé sur la toile : trop court, on annule plutôt que de
        // laisser un segment dégénéré.
        const longueur = Math.hypot(world.x - current.fromPoint.x, world.y - current.fromPoint.y);
        if (longueur * state.camera.zoom >= 20) {
          const to = under ? { nodeId: under.id, ...anchorAtPoint(under, world) } : { x: world.x, y: world.y };
          state.addEdge(current.from, to, { routing: 'straight' });
          // Maj maintenue : l'outil reste armé pour enchaîner les traits.
          if (!event.shiftKey) state.setTool('select');
        }
      } else if (under && under.id !== current.from.nodeId) {
        state.addEdge(current.from, { nodeId: under.id, ...anchorAtPoint(under, world) });
      } else if (!under) {
        // Déposer dans le vide crée une forme déjà reliée.
        const source = lookup(current.from.nodeId);
        const shape = source && source.shape !== 'lifeline' ? source.shape : 'roundRect';
        const id = state.addNode(
          { shape, text: '', style: source ? { ...source.style } : undefined },
          world,
        );
        state.addEdge(current.from, { nodeId: id, anchor: 'auto' });
        state.select([id]);
        scheduleEdit(id);
      }
    }

    if (current.kind === 'reconnect') {
      const under = nodeUnder(event);
      const end: EdgeEnd = under
        ? { nodeId: under.id, ...anchorAtPoint(under, world) }
        : { x: world.x, y: world.y };
      state.updateEdge(current.edgeId, current.which === 'from' ? { from: end } : { to: end });
    }

    interaction.current = { kind: 'none' };
    setOverlay({});
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent) => {
    const state = useEditor.getState();
    if (event.ctrlKey || event.metaKey) {
      state.zoomAt(Math.exp(-event.deltaY * 0.0022), toScreen(event));
    } else if (event.shiftKey) {
      state.panBy(-event.deltaY, 0);
    } else {
      state.panBy(-event.deltaX, -event.deltaY);
    }
  };

  // Le navigateur ne déclenche pas de wheel passif annulable via React : on écoute nous-mêmes.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const block = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  const handleDoubleClick = (event: React.MouseEvent) => {
    const state = useEditor.getState();
    const world = toWorld(event);

    const node = nodeUnder(event);
    if (node) {
      startEditing(node, world);
      return;
    }
    const hit = geometries.find(
      ({ geo }) => distanceToPolyline(world, geo.points) * state.camera.zoom < 12,
    );
    if (hit) {
      state.select([hit.edge.id]);
      state.setEditing({ id: hit.edge.id, field: 'text' });
      return;
    }
    const id = state.addNode({ shape: 'roundRect', text: '' }, world);
    scheduleEdit(id);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-lucidflow-shape');
    if (!raw) return;
    const state = useEditor.getState();
    const id = state.addNode(JSON.parse(raw), toWorld(event));
    const created = useEditor.getState().nodes.find((n) => n.id === id);
    if (created && !created.text) scheduleEdit(id);
  };

  // ------------------------------------------------------------- rendu

  const selectedNodeList = nodes.filter((n) => selection.includes(n.id));
  const singleNode = selectedNodeList.length === 1 ? selectedNodeList[0] : null;
  const multiBounds = selectedNodeList.length > 1 ? boundsOf(selectedNodeList.map(rectOf)) : null;
  const selectedEdge =
    selection.length === 1 ? geometries.find(({ edge }) => edge.id === selection[0]) : undefined;
  const hoverNode = hover ? lookup(hover) : undefined;
  const editingNode = editing ? nodes.find((n) => n.id === editing.id) : undefined;
  const editingEdge = editing ? geometries.find(({ edge }) => edge.id === editing.id) : undefined;
  const handleSize = 8 / camera.zoom;

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onPointerLeave={() => {
        pointerRef.current = null;
      }}
    >
      <svg
        ref={svgRef}
        className={`canvas tool-${tool}`}
        width={size.w}
        height={size.h}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          const under = nodeUnder(e);
          const state = useEditor.getState();
          if (under && !state.selection.includes(under.id)) state.select([under.id]);
          // Le menu est positionné en `fixed` : il lui faut les coordonnées de la fenêtre.
          onContextMenu({ x: e.clientX, y: e.clientY }, toWorld(e));
        }}
      >
        <defs>
          <pattern
            id="grid-pattern"
            width={GRID * 4}
            height={GRID * 4}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
            <path d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`} fill="none" stroke="#e2e8f0" strokeWidth={1 / camera.zoom} />
            <circle cx={0} cy={0} r={1.2 / camera.zoom} fill="#cbd5e1" />
          </pattern>
        </defs>

        {showGrid && <rect data-ui="grid" x={0} y={0} width={size.w} height={size.h} fill="url(#grid-pattern)" />}

        <g data-world transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {/* Les cadres (paquetage, frontière, fragment) se dessinent avant les liens :
              sinon un cadre au fond opaque masquerait les traits qu'il contient. */}
          {nodes
            .filter((node) => node.container)
            .map((node) => (
              <NodeView
                key={node.id}
                node={node}
                selected={selection.includes(node.id)}
                onPointerDown={handleNodePointerDown}
              />
            ))}

          {geometries.map(({ edge, geo }) => (
            <EdgeView
              key={edge.id}
              edge={edge}
              geo={geo}
              selected={selection.includes(edge.id)}
              onPointerDown={handleEdgePointerDown}
            />
          ))}

          {nodes
            .filter((node) => !node.container)
            .map((node) => (
              <NodeView
                key={node.id}
                node={node}
                selected={selection.includes(node.id)}
                hidden={editing?.id === node.id && editing.field === 'text' && node.shape === 'textBox'}
                onPointerDown={handleNodePointerDown}
              />
            ))}

          {/* Les étiquettes passent au-dessus des formes : sur un message réflexif
              ou un lien qui longe une forme, elles restaient sinon cachées. */}
          <g pointerEvents="none">
            {geometries.map(({ edge, geo }) => (
              <EdgeLabels key={edge.id} edge={edge} geo={geo} />
            ))}
          </g>

          <g data-ui="chrome">
            {selectedNodeList.map((node) => (
              <rect
                key={node.id}
                x={node.x - 1}
                y={node.y - 1}
                width={node.w + 2}
                height={node.h + 2}
                fill="none"
                stroke="#2563eb"
                strokeWidth={1.5 / camera.zoom}
                pointerEvents="none"
              />
            ))}

            {multiBounds && (
              <>
                <rect
                  x={multiBounds.x - GROUP_PAD}
                  y={multiBounds.y - GROUP_PAD}
                  width={multiBounds.w + GROUP_PAD * 2}
                  height={multiBounds.h + GROUP_PAD * 2}
                  fill="none"
                  stroke="#2563eb"
                  strokeDasharray={`${6 / camera.zoom} ${4 / camera.zoom}`}
                  strokeWidth={1.5 / camera.zoom}
                  pointerEvents="none"
                />
                {HANDLES.map((handle) => {
                  const bounds = {
                    x: multiBounds.x - GROUP_PAD,
                    y: multiBounds.y - GROUP_PAD,
                    w: multiBounds.w + GROUP_PAD * 2,
                    h: multiBounds.h + GROUP_PAD * 2,
                  };
                  const pos = handlePosition(bounds, handle);
                  return (
                    <rect
                      key={handle}
                      className="handle"
                      x={pos.x - handleSize / 2}
                      y={pos.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      rx={2 / camera.zoom}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={1.5 / camera.zoom}
                      style={{ cursor: `${handle}-resize` }}
                      onPointerDown={(e) => handleGroupHandlePointerDown(e, handle, bounds)}
                    />
                  );
                })}
              </>
            )}

            {singleNode &&
              HANDLES.map((handle) => {
                const pos = handlePosition(rectOf(singleNode), handle);
                return (
                  <rect
                    key={handle}
                    className="handle"
                    x={pos.x - handleSize / 2}
                    y={pos.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    rx={2 / camera.zoom}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={1.5 / camera.zoom}
                    style={{ cursor: `${handle}-resize` }}
                    onPointerDown={(e) => handleHandlePointerDown(e, handle)}
                  />
                );
              })}

            {selectedEdge &&
              (['from', 'to'] as const).map((which) => {
                const point = which === 'from' ? selectedEdge.geo.start : selectedEdge.geo.end;
                return (
                  <circle
                    key={which}
                    cx={point.x}
                    cy={point.y}
                    r={5 / camera.zoom}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={2 / camera.zoom}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={(e) => handleEndpointPointerDown(e, selectedEdge.edge.id, which)}
                  />
                );
              })}

            {hoverNode &&
              interaction.current.kind === 'none' &&
              tool !== 'place' &&
              (['n', 'e', 's', 'w'] as Side[]).map((side) => {
                const p = sidePoint(rectOf(hoverNode), side);
                return (
                  <circle
                    key={side}
                    className="port"
                    cx={p.x}
                    cy={p.y}
                    r={5 / camera.zoom}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={2 / camera.zoom}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={(e) => handlePortPointerDown(e, hoverNode.id, side)}
                  />
                );
              })}

            {overlay.target && (() => {
              const node = lookup(overlay.target.nodeId);
              if (!node) return null;
              return (
                <rect
                  x={node.x - 3}
                  y={node.y - 3}
                  width={node.w + 6}
                  height={node.h + 6}
                  fill="#2563eb"
                  fillOpacity={0.08}
                  stroke="#2563eb"
                  strokeWidth={2 / camera.zoom}
                  pointerEvents="none"
                />
              );
            })()}

            {overlay.link && (
              <g pointerEvents="none">
                <path
                  d={`M ${overlay.link.a.x} ${overlay.link.a.y} L ${overlay.link.b.x} ${overlay.link.b.y}`}
                  stroke="#2563eb"
                  strokeWidth={2 / camera.zoom}
                  strokeDasharray={`${5 / camera.zoom} ${4 / camera.zoom}`}
                  fill="none"
                />
                <circle cx={overlay.link.b.x} cy={overlay.link.b.y} r={4 / camera.zoom} fill="#2563eb" />
              </g>
            )}

            {overlay.marquee && (
              <rect
                x={overlay.marquee.x}
                y={overlay.marquee.y}
                width={overlay.marquee.w}
                height={overlay.marquee.h}
                fill="#2563eb"
                fillOpacity={0.08}
                stroke="#2563eb"
                strokeWidth={1 / camera.zoom}
                pointerEvents="none"
              />
            )}

            {overlay.guides?.map((guide, i) => (
              <line
                key={i}
                x1={guide.axis === 'x' ? guide.value : guide.from}
                y1={guide.axis === 'x' ? guide.from : guide.value}
                x2={guide.axis === 'x' ? guide.value : guide.to}
                y2={guide.axis === 'x' ? guide.to : guide.value}
                stroke="#ec4899"
                strokeWidth={1 / camera.zoom}
                pointerEvents="none"
              />
            ))}
          </g>
        </g>
      </svg>

      {editing && editingNode && (
        <NodeTextEditor node={editingNode} field={editing.field} worldToScreen={worldToScreen} zoom={camera.zoom} />
      )}

      {editing && editingEdge && (
        <TextOverlay
          rect={(() => {
            const p = worldToScreen(editingEdge.geo.labelAt);
            const w = 160;
            const h = 28;
            return { x: p.x - w / 2, y: p.y - h / 2, w, h };
          })()}
          value={editingEdge.edge.label}
          fontSize={13}
          color="#0f172a"
          align="center"
          multiline={false}
          onCommit={(value) => {
            useEditor.getState().commitText(editingEdge.edge.id, 'text', value);
            useEditor.getState().setEditing(null);
          }}
          onCancel={() => useEditor.getState().setEditing(null)}
        />
      )}

      {pending && tool === 'place' && (
        <div className="place-hint">
          Cliquez pour poser « {pending.label ?? shapeDef(pending.shape).name} » · Maj pour enchaîner · Échap pour annuler
        </div>
      )}
    </div>
  );
});

function handlePosition(r: Rect, handle: HandleId): Point {
  const x = handle.includes('w') ? r.x : handle.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = handle.includes('n') ? r.y : handle.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

interface EditorProps {
  node: DiagramNode;
  field: 'text' | number;
  zoom: number;
  worldToScreen: (p: Point) => Point;
}

/** Positionne la zone de saisie sur la zone de texte réelle de la forme. */
function NodeTextEditor({ node, field, zoom, worldToScreen }: EditorProps) {
  const def = shapeDef(node.shape);
  let local: Rect;
  if (typeof field === 'number') {
    const { rows } = umlLayout(node, node.w, node.h);
    const row = rows[field];
    local = row ? { x: 6, y: row.y + 2, w: node.w - 12, h: row.h - 4 } : { x: 6, y: 6, w: node.w - 12, h: 24 };
  } else if (def.Text) {
    const { headerH } = umlLayout(node, node.w, node.h);
    local = { x: 6, y: 4, w: node.w - 12, h: headerH - 8 };
  } else {
    local = def.textRect
      ? def.textRect({ node, w: node.w, h: node.h, s: node.style })
      : { x: 10, y: 10, w: node.w - 20, h: node.h - 20 };
  }

  const topLeft = worldToScreen({ x: node.x + local.x, y: node.y + local.y });
  const isCompartment = typeof field === 'number';
  const value = isCompartment ? node.compartments?.[field] ?? '' : node.text;

  return (
    <TextOverlay
      rect={{ x: topLeft.x, y: topLeft.y, w: local.w * zoom, h: local.h * zoom }}
      value={value}
      fontSize={(isCompartment ? node.style.fontSize - 1 : node.style.fontSize) * zoom}
      color={node.style.color}
      align={isCompartment ? 'left' : def.Text ? 'center' : node.style.align}
      bold={def.Text && !isCompartment ? true : node.style.bold}
      italic={node.style.italic}
      mono={isCompartment}
      multiline={isCompartment}
      onCommit={(next) => {
        useEditor.getState().commitText(node.id, field, next);
        useEditor.getState().setEditing(null);
      }}
      onCancel={() => useEditor.getState().setEditing(null)}
    />
  );
}
