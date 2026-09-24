import type { Point } from '../../types';

export interface LayoutNode {
  id: string;
  w: number;
  h: number;
  /** Les formes d'un même groupe (paquetage) sont placées côte à côte. */
  group?: string;
}

export interface LayoutLink {
  from: string;
  to: string;
}

interface Options {
  /** Espace horizontal entre deux formes d'une même rangée. */
  gapX?: number;
  /** Espace vertical entre deux rangées. */
  gapY?: number;
  origin?: Point;
}

/**
 * Mise en page en couches, inspirée de Sugiyama : les liens descendent d'une
 * rangée à la suivante, et l'ordre dans chaque rangée est ajusté par barycentre
 * pour limiter les croisements. PlantUML confie ce travail à Graphviz, dont nous
 * ne disposons pas ; le placement n'est donc pas identique au sien, seulement lisible.
 */
export function layeredLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  { gapX = 60, gapY = 90, origin = { x: 80, y: 80 } }: Options = {},
): Map<string, Point> {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const edges = links.filter((l) => known.has(l.from) && known.has(l.to) && l.from !== l.to);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { from, to } of edges) {
    children.get(from)!.push(to);
    parents.get(to)!.push(from);
  }

  // Profondeur = plus long chemin depuis une racine, les cycles étant coupés.
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const compute = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle : on arrête la remontée
    visiting.add(id);
    const up = parents.get(id)!.map((p) => compute(p) + 1);
    visiting.delete(id);
    const value = up.length ? Math.max(...up) : 0;
    depth.set(id, value);
    return value;
  };
  ids.forEach(compute);

  const rows: string[][] = [];
  for (const id of ids) {
    const d = depth.get(id)!;
    (rows[d] ??= []).push(id);
  }

  // Deux passes de barycentre : chaque forme se rapproche de ses voisines du dessus.
  const position = new Map<string, number>();
  rows.forEach((row) => row.forEach((id, i) => position.set(id, i)));
  for (let pass = 0; pass < 3; pass += 1) {
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const score = new Map<string, number>();
      row.forEach((id, i) => {
        const above = parents.get(id)!.filter((p) => depth.get(p) === r - 1);
        const mean = above.length
          ? above.reduce((sum, p) => sum + (position.get(p) ?? 0), 0) / above.length
          : i;
        score.set(id, mean);
      });
      row.sort((a, b) => (score.get(a)! - score.get(b)!) || a.localeCompare(b));
      row.forEach((id, i) => position.set(id, i));
    }
  }

  // Regroupement : un cadre de paquetage ne doit pas englober des formes étrangères.
  if (nodes.some((n) => n.group)) {
    for (const row of rows) {
      const rank = new Map<string, number>();
      row.forEach((id, i) => {
        const key = byId.get(id)!.group ?? `~${id}`;
        if (!rank.has(key)) rank.set(key, i);
      });
      row.sort((a, b) => {
        const ka = byId.get(a)!.group ?? `~${a}`;
        const kb = byId.get(b)!.group ?? `~${b}`;
        return ka === kb ? position.get(a)! - position.get(b)! : rank.get(ka)! - rank.get(kb)!;
      });
    }
  }

  const result = new Map<string, Point>();
  const widths = rows.map((row) =>
    row.reduce((sum, id) => sum + byId.get(id)!.w, 0) + gapX * Math.max(row.length - 1, 0),
  );
  const widest = Math.max(...widths, 0);

  let y = origin.y;
  rows.forEach((row, r) => {
    const rowHeight = Math.max(...row.map((id) => byId.get(id)!.h));
    let x = origin.x + (widest - widths[r]) / 2;
    for (const id of row) {
      const node = byId.get(id)!;
      // Les formes d'une rangée sont alignées par leur centre vertical.
      result.set(id, { x: round(x), y: round(y + (rowHeight - node.h) / 2) });
      x += node.w + gapX;
    }
    y += rowHeight + gapY;
  });
  return result;
}

const round = (v: number) => Math.round(v / 10) * 10;

/** Répartit des éléments en colonne, centrés sur une abscisse. */
export function column(
  items: { w: number; h: number }[],
  centerX: number,
  startY: number,
  gap = 60,
): Point[] {
  let y = startY;
  return items.map((item) => {
    const point = { x: round(centerX - item.w / 2), y: round(y) };
    y += item.h + gap;
    return point;
  });
}
