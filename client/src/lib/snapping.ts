import type { Rect } from '../types';

export interface Guide {
  /** Ligne verticale (x) ou horizontale (y) à afficher. */
  axis: 'x' | 'y';
  value: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const edgesX = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const edgesY = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

/**
 * Aimantation d'un rectangle en mouvement sur les bords et centres des autres formes.
 * Renvoie la correction à appliquer et les repères à dessiner.
 */
export function snapToNeighbours(moving: Rect, others: Rect[], tolerance = 6): SnapResult {
  const result: SnapResult = { dx: 0, dy: 0, guides: [] };
  if (!others.length) return result;

  let bestX: { delta: number; guide: Guide } | null = null;
  let bestY: { delta: number; guide: Guide } | null = null;

  for (const other of others) {
    for (const mx of edgesX(moving)) {
      for (const ox of edgesX(other)) {
        const delta = ox - mx;
        if (Math.abs(delta) <= tolerance && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = {
            delta,
            guide: {
              axis: 'x',
              value: ox,
              from: Math.min(moving.y, other.y) - 16,
              to: Math.max(moving.y + moving.h, other.y + other.h) + 16,
            },
          };
        }
      }
    }
    for (const my of edgesY(moving)) {
      for (const oy of edgesY(other)) {
        const delta = oy - my;
        if (Math.abs(delta) <= tolerance && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = {
            delta,
            guide: {
              axis: 'y',
              value: oy,
              from: Math.min(moving.x, other.x) - 16,
              to: Math.max(moving.x + moving.w, other.x + other.w) + 16,
            },
          };
        }
      }
    }
  }

  if (bestX) {
    result.dx = bestX.delta;
    result.guides.push(bestX.guide);
  }
  if (bestY) {
    result.dy = bestY.delta;
    result.guides.push(bestY.guide);
  }
  return result;
}
