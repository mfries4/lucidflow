import type { DiagramNode, Outline, Point, Rect, Routing, Side } from '../types';

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const rectOf = (n: DiagramNode): Rect => ({ x: n.x, y: n.y, w: n.w, h: n.h });

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function sidePoint(r: Rect, side: Side, t = 0.5): Point {
  const k = clamp(t, 0, 1);
  switch (side) {
    case 'n':
      return { x: r.x + r.w * k, y: r.y };
    case 's':
      return { x: r.x + r.w * k, y: r.y + r.h };
    case 'w':
      return { x: r.x, y: r.y + r.h * k };
    default:
      return { x: r.x + r.w, y: r.y + r.h * k };
  }
}

export const sideVector: Record<Side, Point> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  e: { x: 1, y: 0 },
};

/**
 * Point où le segment centre -> cible traverse le contour de la forme,
 * et le côté correspondant. Sert aux ancrages « auto ».
 */
export function outlineHit(r: Rect, outline: Outline, target: Point): { point: Point; side: Side } {
  const c = center(r);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return { point: sidePoint(r, 'e'), side: 'e' };

  const hw = Math.max(r.w / 2, 0.5);
  const hh = Math.max(r.h / 2, 0.5);
  const side: Side =
    Math.abs(dx) / hw > Math.abs(dy) / hh ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';

  let t: number;
  if (outline === 'ellipse') {
    t = 1 / Math.hypot(dx / hw, dy / hh);
  } else if (outline === 'diamond') {
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else {
    t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  }
  return { point: { x: c.x + dx * t, y: c.y + dy * t }, side };
}

/** Trajet orthogonal (style « Manhattan ») entre deux ancrages orientés. */
function orthogonalRoute(a: Point, aSide: Side, b: Point, bSide: Side, pad = 22): Point[] {
  const av = sideVector[aSide];
  const bv = sideVector[bSide];
  const a1 = { x: a.x + av.x * pad, y: a.y + av.y * pad };
  const b1 = { x: b.x + bv.x * pad, y: b.y + bv.y * pad };
  const aH = aSide === 'e' || aSide === 'w';
  const bH = bSide === 'e' || bSide === 'w';
  const mid: Point[] = [];

  if (aH && bH) {
    // Les deux sorties sont horizontales : colonne de raccord verticale.
    const towardsEachOther = (b1.x - a1.x) * av.x > 0;
    const mx = towardsEachOther ? (a1.x + b1.x) / 2 : av.x > 0 ? Math.max(a1.x, b1.x) : Math.min(a1.x, b1.x);
    mid.push({ x: mx, y: a1.y }, { x: mx, y: b1.y });
  } else if (!aH && !bH) {
    const towardsEachOther = (b1.y - a1.y) * av.y > 0;
    const my = towardsEachOther ? (a1.y + b1.y) / 2 : av.y > 0 ? Math.max(a1.y, b1.y) : Math.min(a1.y, b1.y);
    mid.push({ x: a1.x, y: my }, { x: b1.x, y: my });
  } else if (aH) {
    mid.push({ x: b1.x, y: a1.y });
  } else {
    mid.push({ x: a1.x, y: b1.y });
  }

  return dedupe([a, a1, ...mid, b1, b]);
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  return out;
}

export interface RoutedEdge {
  points: Point[];
  /** Chaîne `d` prête pour <path>. */
  d: string;
  /** Milieu du tracé, pour l'étiquette. */
  labelAt: Point;
  startSide: Side;
  endSide: Side;
}

export function routePoints(
  a: Point,
  aSide: Side,
  b: Point,
  bSide: Side,
  routing: Routing,
): Point[] {
  if (routing === 'orthogonal') return orthogonalRoute(a, aSide, b, bSide);
  return [a, b];
}

/** Convertit une polyligne en `d`, avec arrondi des angles. */
export function polylineToPath(points: Point[], radius = 10): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    if (r < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const p1 = lerpTowards(cur, prev, r);
    const p2 = lerpTowards(cur, next, r);
    d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function lerpTowards(from: Point, to: Point, by: number): Point {
  const len = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / len) * by, y: from.y + ((to.y - from.y) / len) * by };
}

/** Bézier cubique dont les tangentes suivent les côtés d'ancrage. */
export function curvedPath(a: Point, aSide: Side, b: Point, bSide: Side): string {
  const strength = clamp(dist(a, b) * 0.45, 40, 180);
  const av = sideVector[aSide];
  const bv = sideVector[bSide];
  const c1 = { x: a.x + av.x * strength, y: a.y + av.y * strength };
  const c2 = { x: b.x + bv.x * strength, y: b.y + bv.y * strength };
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

export function polylineMidpoint(points: Point[]): Point {
  const total = points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);
  let travelled = 0;
  for (let i = 1; i < points.length; i += 1) {
    const seg = dist(points[i - 1], points[i]);
    if (travelled + seg >= total / 2) {
      const ratio = seg === 0 ? 0 : (total / 2 - travelled) / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * ratio,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * ratio,
      };
    }
    travelled += seg;
  }
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
}

/** Distance d'un point à une polyligne — utilisé pour la sélection d'un lien. */
export function distanceToPolyline(p: Point, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
  }
  return best;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Raccourcit l'extrémité d'un tracé pour laisser la place à une pointe de flèche. */
export function trimEnd(points: Point[], amount: number, atStart: boolean): Point[] {
  if (amount <= 0 || points.length < 2) return points;
  const copy = points.map((p) => ({ ...p }));
  const i = atStart ? 0 : copy.length - 1;
  const j = atStart ? 1 : copy.length - 2;
  const len = dist(copy[i], copy[j]);
  if (len <= amount + 0.5) return copy;
  copy[i] = lerpTowards(copy[i], copy[j], amount);
  return copy;
}

export function angleOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}
