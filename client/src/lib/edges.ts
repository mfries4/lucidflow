import type { Anchor, DiagramEdge, DiagramNode, EdgeEnd, Marker, Point, Side } from '../types';
import { shapeDef } from '../shapes/registry';
import {
  center,
  clamp,
  curvedPath,
  outlineHit,
  polylineMidpoint,
  polylineToPath,
  rectOf,
  routePoints,
  sidePoint,
  sideVector,
  trimEnd,
} from './geometry';

export interface EdgeGeometry {
  points: Point[];
  d: string;
  labelAt: Point;
  start: Point;
  end: Point;
  /** Angles (radians) des pointes, orientés vers l'extérieur. */
  startAngle: number;
  endAngle: number;
}

/** Longueur de la pointe, pour raccourcir le tracé et éviter les débordements. */
export function markerLength(marker: Marker, strokeWidth: number): number {
  const scale = Math.max(0.85, Math.min(strokeWidth / 2, 1.8));
  switch (marker) {
    case 'triangle':
    case 'triangle-open':
      return 13 * scale;
    case 'diamond':
    case 'diamond-open':
      return 16 * scale;
    case 'arrow':
      return 9 * scale;
    case 'circle':
    case 'circle-open':
      return 9 * scale;
    default:
      return 0; // pointes ouvertes : aucun raccourci nécessaire
  }
}

function anchorPoint(
  end: EdgeEnd,
  node: DiagramNode | undefined,
  towards: Point,
): { point: Point; side: Side } {
  if (!node) {
    const point = { x: end.x ?? 0, y: end.y ?? 0 };
    const dx = towards.x - point.x;
    const dy = towards.y - point.y;
    const side: Side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
    return { point, side };
  }
  const def = shapeDef(node.shape);
  const rect = def.anchorRect ? def.anchorRect(node) : rectOf(node);
  if (end.anchor && end.anchor !== 'auto') {
    return { point: sidePoint(rect, end.anchor, end.t ?? 0.5), side: end.anchor };
  }
  return outlineHit(rectOf(node), def.outline, towards);
}

export const referencePoint = (end: EdgeEnd, node?: DiagramNode): Point =>
  node ? center(rectOf(node)) : { x: end.x ?? 0, y: end.y ?? 0 };

export function resolveEdge(
  edge: DiagramEdge,
  lookup: (id?: string) => DiagramNode | undefined,
): EdgeGeometry {
  const fromNode = lookup(edge.from.nodeId);
  const toNode = lookup(edge.to.nodeId);
  const a = anchorPoint(edge.from, fromNode, referencePoint(edge.to, toNode));
  const b = anchorPoint(edge.to, toNode, referencePoint(edge.from, fromNode));

  const startTrim = markerLength(edge.style.start, edge.style.strokeWidth);
  const endTrim = markerLength(edge.style.end, edge.style.strokeWidth);

  if (edge.style.routing === 'curved') {
    // On recule le tracé le long de la normale pour loger la pointe.
    const shrink = (p: Point, side: Side, by: number) => ({
      x: p.x + sideVector[side].x * by,
      y: p.y + sideVector[side].y * by,
    });
    const s = startTrim ? shrink(a.point, a.side, startTrim * 0.6) : a.point;
    const e = endTrim ? shrink(b.point, b.side, endTrim * 0.6) : b.point;
    return {
      points: [a.point, b.point],
      d: curvedPath(s, a.side, e, b.side),
      labelAt: {
        x: (a.point.x + b.point.x) / 2 + (sideVector[a.side].x + sideVector[b.side].x) * 14,
        y: (a.point.y + b.point.y) / 2 + (sideVector[a.side].y + sideVector[b.side].y) * 14,
      },
      start: a.point,
      end: b.point,
      startAngle: Math.atan2(sideVector[a.side].y, sideVector[a.side].x),
      endAngle: Math.atan2(sideVector[b.side].y, sideVector[b.side].x),
    };
  }

  const raw = routePoints(a.point, a.side, b.point, b.side, edge.style.routing);
  const trimmed = trimEnd(trimEnd(raw, endTrim, false), startTrim, true);
  const last = raw[raw.length - 1];
  const beforeLast = raw[raw.length - 2] ?? last;
  const first = raw[0];
  const second = raw[1] ?? first;

  return {
    points: raw,
    d: edge.style.routing === 'orthogonal' ? polylineToPath(trimmed, 9) : polylineToPath(trimmed, 0),
    labelAt: polylineMidpoint(raw),
    start: first,
    end: last,
    startAngle: Math.atan2(first.y - second.y, first.x - second.x),
    endAngle: Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x),
  };
}

export function buildLookup(nodes: DiagramNode[]) {
  const map = new Map(nodes.map((n) => [n.id, n]));
  return (id?: string) => (id ? map.get(id) : undefined);
}

/**
 * Ancrage choisi lors d'un dépôt sur une forme. Sur les lignes de vie et les
 * barres d'activation, la hauteur porte du sens : on fige le côté et la position.
 */
export function anchorAtPoint(node: DiagramNode, point: Point): { anchor: Anchor; t?: number } {
  if (!shapeDef(node.shape).precise) return { anchor: 'auto' };
  const side: Anchor = point.x < node.x + node.w / 2 ? 'w' : 'e';
  return { anchor: side, t: clamp((point.y - node.y) / Math.max(node.h, 1), 0.03, 0.97) };
}
