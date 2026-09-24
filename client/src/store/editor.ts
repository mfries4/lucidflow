import { create } from 'zustand';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  DocumentFull,
  DocumentKind,
  EdgeEnd,
  EdgeStyle,
  NodeStyle,
  Point,
  Rect,
} from '../types';
import { DEFAULT_EDGE_STYLE } from '../types';
import { boundsOf, rectOf } from '../lib/geometry';
import { minHeightFor, shapeDef, styleFor } from '../shapes/registry';
import type { PaletteItem } from '../shapes/palette';
import { uid } from '../lib/id';

export const GRID = 10;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

export type Tool = 'select' | 'pan' | 'connect' | 'place';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type EditTarget = { id: string; field: 'text' | number } | null;

interface Snapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface EditorState extends Snapshot {
  docId: string | null;
  name: string;
  kind: DocumentKind;
  revision: number;
  savedRevision: number;
  status: SaveStatus;

  past: Snapshot[];
  future: Snapshot[];

  selection: string[];
  editing: EditTarget;
  camera: Camera;
  tool: Tool;
  pending: PaletteItem | null;
  snap: boolean;
  showGrid: boolean;
  paletteGroup: string;

  loadDocument: (doc: DocumentFull, palette: string) => void;
  markSaved: (revision: number) => void;
  setStatus: (status: SaveStatus) => void;
  setName: (name: string) => void;

  setCamera: (camera: Partial<Camera>) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, anchor: Point) => void;
  setZoom: (zoom: number, viewport?: Rect) => void;
  fitToContent: (viewport: Rect) => void;

  setTool: (tool: Tool) => void;
  setPending: (item: PaletteItem | null) => void;
  setPaletteGroup: (group: string) => void;
  toggleSnap: () => void;
  toggleGrid: () => void;

  select: (ids: string[], additive?: boolean) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setEditing: (target: EditTarget) => void;

  history: () => void;
  undo: () => void;
  redo: () => void;

  addNode: (item: PaletteItem, at: Point, options?: { centered?: boolean; select?: boolean }) => string;
  insertNodes: (nodes: DiagramNode[], edges?: DiagramEdge[]) => void;
  updateNode: (id: string, patch: Partial<DiagramNode>) => void;
  patchNodes: (ids: string[], patch: Partial<DiagramNode>) => void;
  moveNodes: (ids: string[], dx: number, dy: number) => void;
  styleNodes: (ids: string[], patch: Partial<NodeStyle>) => void;
  setNodeRects: (rects: Record<string, Rect>) => void;
  autoGrow: (id: string) => void;

  addEdge: (from: EdgeEnd, to: EdgeEnd, style?: Partial<EdgeStyle>) => string | null;
  updateEdge: (id: string, patch: Partial<DiagramEdge>) => void;
  styleEdges: (ids: string[], patch: Partial<EdgeStyle>) => void;

  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: (at?: Point) => void;
  align: (mode: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => void;
  distribute: (axis: 'h' | 'v') => void;
  reorder: (mode: 'front' | 'back' | 'forward' | 'backward') => void;
  commitText: (id: string, field: 'text' | number, value: string) => void;
}

const clone = <T,>(value: T): T => structuredClone(value);

export const snapValue = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v));

let clipboard: Snapshot = { nodes: [], edges: [] };
/** Chaque collage consécutif du même presse-papier se décale un peu plus. */
let pasteRank = 0;

export const useEditor = create<EditorState>()((set, get) => ({
  docId: null,
  name: 'Sans titre',
  kind: 'blank',
  nodes: [],
  edges: [],
  revision: 0,
  savedRevision: 0,
  status: 'idle',
  past: [],
  future: [],
  selection: [],
  editing: null,
  camera: { x: 0, y: 0, zoom: 1 },
  tool: 'select',
  pending: null,
  snap: true,
  showGrid: true,
  paletteGroup: 'general',

  loadDocument: (doc, palette) =>
    set({
      docId: doc.id,
      name: doc.name,
      kind: doc.kind,
      nodes: doc.data.nodes ?? [],
      edges: doc.data.edges ?? [],
      past: [],
      future: [],
      selection: [],
      editing: null,
      revision: 0,
      savedRevision: 0,
      status: 'idle',
      tool: 'select',
      pending: null,
      paletteGroup: palette,
      camera: { x: 0, y: 0, zoom: 1 },
    }),

  markSaved: (revision) =>
    set((s) => ({ savedRevision: revision, status: s.revision === revision ? 'saved' : 'idle' })),
  setStatus: (status) => set({ status }),
  setName: (name) => set((s) => ({ name, revision: s.revision + 1 })),

  setCamera: (camera) => set((s) => ({ camera: { ...s.camera, ...camera } })),
  panBy: (dx, dy) => set((s) => ({ camera: { ...s.camera, x: s.camera.x + dx, y: s.camera.y + dy } })),

  zoomAt: (factor, anchor) =>
    set((s) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.camera.zoom * factor));
      const k = zoom / s.camera.zoom;
      return {
        camera: {
          zoom,
          x: anchor.x - (anchor.x - s.camera.x) * k,
          y: anchor.y - (anchor.y - s.camera.y) * k,
        },
      };
    }),

  setZoom: (zoom, viewport) => {
    const { camera } = get();
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    const anchor = viewport
      ? { x: viewport.w / 2, y: viewport.h / 2 }
      : { x: 0, y: 0 };
    const k = target / camera.zoom;
    set({
      camera: {
        zoom: target,
        x: anchor.x - (anchor.x - camera.x) * k,
        y: anchor.y - (anchor.y - camera.y) * k,
      },
    });
  },

  fitToContent: (viewport) => {
    const { nodes } = get();
    const bounds = boundsOf(nodes.map(rectOf));
    if (!bounds) {
      set({ camera: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    const pad = 80;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min((viewport.w - pad * 2) / bounds.w, (viewport.h - pad * 2) / bounds.h, 1.6)),
    );
    set({
      camera: {
        zoom,
        x: viewport.w / 2 - (bounds.x + bounds.w / 2) * zoom,
        y: viewport.h / 2 - (bounds.y + bounds.h / 2) * zoom,
      },
    });
  },

  setTool: (tool) => set({ tool, pending: tool === 'place' ? get().pending : null }),
  setPending: (item) => set({ pending: item, tool: item ? 'place' : 'select' }),
  setPaletteGroup: (paletteGroup) => set({ paletteGroup }),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),

  select: (ids, additive = false) =>
    set((s) => ({
      selection: additive ? Array.from(new Set([...s.selection, ...ids])) : ids,
      editing: null,
    })),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
    })),
  selectAll: () => set((s) => ({ selection: [...s.nodes.map((n) => n.id), ...s.edges.map((e) => e.id)] })),
  clearSelection: () => set({ selection: [], editing: null }),
  setEditing: (editing) => set({ editing }),

  history: () =>
    set((s) => ({
      past: [...s.past.slice(-99), { nodes: clone(s.nodes), edges: clone(s.edges) }],
      future: [],
    })),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous) return s;
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, { nodes: clone(s.nodes), edges: clone(s.edges) }],
        nodes: previous.nodes,
        edges: previous.edges,
        revision: s.revision + 1,
        editing: null,
        selection: s.selection.filter(
          (id) => previous.nodes.some((n) => n.id === id) || previous.edges.some((e) => e.id === id),
        ),
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[s.future.length - 1];
      if (!next) return s;
      return {
        future: s.future.slice(0, -1),
        past: [...s.past, { nodes: clone(s.nodes), edges: clone(s.edges) }],
        nodes: next.nodes,
        edges: next.edges,
        revision: s.revision + 1,
        editing: null,
      };
    }),

  addNode: (item, at, options = {}) => {
    const def = shapeDef(item.shape);
    const [w, h] = item.size ?? def.size;
    const id = uid('n');
    const node: DiagramNode = {
      id,
      shape: item.shape,
      x: snapValue(options.centered === false ? at.x : at.x - w / 2, get().snap),
      y: snapValue(options.centered === false ? at.y : at.y - h / 2, get().snap),
      w,
      h,
      text: item.text ?? def.text ?? '',
      compartments: def.compartments ? [...def.compartments] : undefined,
      style: styleFor(item.shape, item.style),
      container: def.container,
    };
    get().history();
    set((s) => ({
      // Les conteneurs restent au fond pour ne pas masquer leur contenu.
      nodes: node.container ? [node, ...s.nodes] : [...s.nodes, node],
      selection: options.select === false ? s.selection : [id],
      revision: s.revision + 1,
    }));
    return id;
  },

  insertNodes: (nodes, edges = []) => {
    get().history();
    set((s) => ({
      nodes: [...s.nodes, ...nodes],
      edges: [...s.edges, ...edges],
      selection: nodes.map((n) => n.id),
      revision: s.revision + 1,
    }));
  },

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      revision: s.revision + 1,
    })),

  patchNodes: (ids, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)),
      revision: s.revision + 1,
    })),

  moveNodes: (ids, dx, dy) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (ids.includes(n.id) && !n.locked ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
      revision: s.revision + 1,
    })),

  styleNodes: (ids, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (ids.includes(n.id) ? { ...n, style: { ...n.style, ...patch } } : n)),
      revision: s.revision + 1,
    })),

  setNodeRects: (rects) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (rects[n.id] ? { ...n, ...rects[n.id] } : n)),
      revision: s.revision + 1,
    })),

  autoGrow: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        const needed = minHeightFor(n);
        return needed > n.h ? { ...n, h: Math.ceil(needed) } : n;
      }),
      revision: s.revision + 1,
    })),

  addEdge: (from, to, style) => {
    if (from.nodeId && from.nodeId === to.nodeId) return null;
    const edge: DiagramEdge = {
      id: uid('e'),
      from,
      to,
      label: '',
      style: { ...DEFAULT_EDGE_STYLE, ...(style ?? {}) },
    };
    get().history();
    set((s) => ({ edges: [...s.edges, edge], selection: [edge.id], revision: s.revision + 1 }));
    return edge.id;
  },

  updateEdge: (id, patch) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      revision: s.revision + 1,
    })),

  styleEdges: (ids, patch) =>
    set((s) => ({
      edges: s.edges.map((e) => (ids.includes(e.id) ? { ...e, style: { ...e.style, ...patch } } : e)),
      revision: s.revision + 1,
    })),

  deleteSelection: () => {
    const { selection } = get();
    if (!selection.length) return;
    get().history();
    set((s) => {
      const nodes = s.nodes.filter((n) => !selection.includes(n.id));
      const alive = new Set(nodes.map((n) => n.id));
      return {
        nodes,
        // Un lien disparaît avec la forme qu'il relie.
        edges: s.edges.filter(
          (e) =>
            !selection.includes(e.id) &&
            (!e.from.nodeId || alive.has(e.from.nodeId)) &&
            (!e.to.nodeId || alive.has(e.to.nodeId)),
        ),
        selection: [],
        editing: null,
        revision: s.revision + 1,
      };
    });
  },

  copySelection: () => {
    const { nodes, edges, selection } = get();
    const picked = nodes.filter((n) => selection.includes(n.id));
    const ids = new Set(picked.map((n) => n.id));
    pasteRank = 0;
    clipboard = {
      nodes: clone(picked),
      // Un lien n'est copié que si ses deux extrémités le sont aussi.
      edges: clone(
        edges.filter((e) => e.from.nodeId && e.to.nodeId && ids.has(e.from.nodeId) && ids.has(e.to.nodeId)),
      ),
    };
  },

  paste: (at) => {
    if (!clipboard.nodes.length) return;
    pasteRank += 1;
    const offset = at ? null : { x: 24 * pasteRank, y: 24 * pasteRank };
    const bounds = boundsOf(clipboard.nodes.map(rectOf))!;
    const remap = new Map<string, string>();
    const nodes = clipboard.nodes.map((n) => {
      const id = uid('n');
      remap.set(n.id, id);
      return {
        ...clone(n),
        id,
        x: offset ? n.x + offset.x : at!.x + (n.x - bounds.x) - bounds.w / 2,
        y: offset ? n.y + offset.y : at!.y + (n.y - bounds.y) - bounds.h / 2,
      };
    });
    const edges = clipboard.edges.map((e) => ({
      ...clone(e),
      id: uid('e'),
      from: { ...e.from, nodeId: remap.get(e.from.nodeId!)! },
      to: { ...e.to, nodeId: remap.get(e.to.nodeId!)! },
    }));
    get().insertNodes(nodes, edges);
  },

  duplicateSelection: () => {
    get().copySelection();
    get().paste();
  },

  align: (mode) => {
    const { nodes, selection } = get();
    const picked = nodes.filter((n) => selection.includes(n.id));
    if (picked.length < 2) return;
    const b = boundsOf(picked.map(rectOf))!;
    get().history();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (!selection.includes(n.id)) return n;
        switch (mode) {
          case 'left':
            return { ...n, x: b.x };
          case 'right':
            return { ...n, x: b.x + b.w - n.w };
          case 'center-h':
            return { ...n, x: b.x + (b.w - n.w) / 2 };
          case 'top':
            return { ...n, y: b.y };
          case 'bottom':
            return { ...n, y: b.y + b.h - n.h };
          default:
            return { ...n, y: b.y + (b.h - n.h) / 2 };
        }
      }),
      revision: s.revision + 1,
    }));
  },

  distribute: (axis) => {
    const { nodes, selection } = get();
    const picked = nodes.filter((n) => selection.includes(n.id));
    if (picked.length < 3) return;
    const sorted = [...picked].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span =
      axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
    const used = sorted.reduce((sum, n) => sum + (axis === 'h' ? n.w : n.h), 0);
    const gap = (span - used) / (sorted.length - 1);
    let cursor = axis === 'h' ? first.x : first.y;
    const positions = new Map<string, number>();
    for (const n of sorted) {
      positions.set(n.id, cursor);
      cursor += (axis === 'h' ? n.w : n.h) + gap;
    }
    get().history();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        const pos = positions.get(n.id);
        if (pos === undefined) return n;
        return axis === 'h' ? { ...n, x: Math.round(pos) } : { ...n, y: Math.round(pos) };
      }),
      revision: s.revision + 1,
    }));
  },

  reorder: (mode) => {
    const { selection } = get();
    if (!selection.length) return;
    get().history();
    set((s) => {
      const picked = s.nodes.filter((n) => selection.includes(n.id));
      const rest = s.nodes.filter((n) => !selection.includes(n.id));
      if (mode === 'front') return { nodes: [...rest, ...picked], revision: s.revision + 1 };
      if (mode === 'back') return { nodes: [...picked, ...rest], revision: s.revision + 1 };
      const nodes = [...s.nodes];
      const step = mode === 'forward' ? 1 : -1;
      const indexes = nodes
        .map((n, i) => (selection.includes(n.id) ? i : -1))
        .filter((i) => i >= 0);
      for (const i of step > 0 ? indexes.reverse() : indexes) {
        const j = i + step;
        if (j < 0 || j >= nodes.length || selection.includes(nodes[j].id)) continue;
        [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
      }
      return { nodes, revision: s.revision + 1 };
    });
  },

  commitText: (id, field, value) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === id);
    if (node) {
      const current = field === 'text' ? node.text : node.compartments?.[field] ?? '';
      if (current === value) return;
      state.history();
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          if (field === 'text') return { ...n, text: value };
          const compartments = [...(n.compartments ?? [])];
          compartments[field] = value;
          return { ...n, compartments };
        }),
        revision: s.revision + 1,
      }));
      get().autoGrow(id);
      return;
    }
    const edge = state.edges.find((e) => e.id === id);
    if (edge && edge.label !== value) {
      state.history();
      set((s) => ({
        edges: s.edges.map((e) => (e.id === id ? { ...e, label: value } : e)),
        revision: s.revision + 1,
      }));
    }
  },
}));

// --------------------------------------------------------------- sélecteurs

export const selectedNodes = (s: EditorState): DiagramNode[] =>
  s.nodes.filter((n) => s.selection.includes(n.id));

export const selectedEdges = (s: EditorState): DiagramEdge[] =>
  s.edges.filter((e) => s.selection.includes(e.id));

export const currentDiagram = (s: EditorState): Diagram => ({ nodes: s.nodes, edges: s.edges });

export const nodeById = (s: EditorState, id?: string) =>
  id ? s.nodes.find((n) => n.id === id) : undefined;
