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

  // Abscisses : chaque forme se recentre sur la médiane de ses voisines de la rangée
  // adjacente, puis les écarts minimaux sont rétablis. Quelques allers-retours
  // suffisent à amener un parent au-dessus de ses enfants.
  const middle = new Map<string, number>();
  for (const row of rows) {
    let cursor = 0;
    for (const id of row) {
      const node = byId.get(id)!;
      middle.set(id, cursor + node.w / 2);
      cursor += node.w + gapX;
    }
  }

  const median = (values: number[]): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const half = sorted.length >> 1;
    return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
  };

  const alignRow = (row: string[], neighbours: Map<string, string[]>, refRow: string[] | undefined) => {
    if (!row.length) return;
    const reference = new Set(refRow ?? []);
    const desired = row.map((id) => {
      const linked = (neighbours.get(id) ?? []).filter((n) => reference.has(n));
      return median(linked.map((n) => middle.get(n)!)) ?? middle.get(id)!;
    });

    const placed: number[] = [];
    let cursor = -Infinity;
    row.forEach((id, i) => {
      const node = byId.get(id)!;
      const left = Math.max(desired[i] - node.w / 2, cursor);
      placed.push(left + node.w / 2);
      cursor = left + node.w + gapX;
    });

    // Le décalage moyen est repris sur toute la rangée : sans cela, elle se tasse à gauche.
    const drift = placed.reduce((sum, value, i) => sum + (desired[i] - value), 0) / row.length;
    row.forEach((id, i) => middle.set(id, placed[i] + drift));
  };

  for (let pass = 0; pass < 4; pass += 1) {
    if (pass % 2 === 0) {
      for (let r = 1; r < rows.length; r += 1) alignRow(rows[r], parents, rows[r - 1]);
    } else {
      for (let r = rows.length - 2; r >= 0; r -= 1) alignRow(rows[r], children, rows[r + 1]);
    }
  }

  const leftMost = Math.min(...[...middle.entries()].map(([id, c]) => c - byId.get(id)!.w / 2));
  const result = new Map<string, Point>();
  let y = origin.y;
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((id) => byId.get(id)!.h));
    for (const id of row) {
      const node = byId.get(id)!;
      result.set(id, {
        x: round(origin.x + middle.get(id)! - node.w / 2 - leftMost),
        // Les formes d'une rangée sont alignées par leur centre vertical.
        y: round(y + (rowHeight - node.h) / 2),
      });
    }
    y += rowHeight + gapY;
  }
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
