import type { Diagram, DiagramEdge, DiagramNode, EdgeStyle } from '../../types';
import { makeEdge, makeNode } from '../templates';
import { fontString, measure } from '../text';
import type { SourceLine } from './source';

interface Branch {
  text: string;
  depth: number;
  side: -1 | 1;
  children: Branch[];
  node?: DiagramNode;
  span?: number;
}

const MARKER = /^([*+-]+)(_)?(?:\[#[^\]]+\])?\s*(.*)$/;
const GAP_Y = 40;
const GAP_X = 90;

const CURVE: Partial<EdgeStyle> = { routing: 'curved', end: 'none', stroke: '#fb923c', strokeWidth: 2.5 };

function shapeFor(depth: number): string {
  if (depth === 0) return 'mindRoot';
  return depth === 1 ? 'mindTopic' : 'mindSubtopic';
}

function sizeFor(depth: number, text: string): [number, number] {
  const font = fontString(depth === 0 ? 17 : 14, depth === 0);
  const width = Math.min(Math.max(measure(text, font) + (depth === 0 ? 56 : 40), depth === 0 ? 160 : 120), 300);
  return [Math.ceil(width / 10) * 10, depth === 0 ? 70 : depth === 1 ? 60 : 40];
}

export function parseMindmap(lines: SourceLine[], warn: (message: string) => void): Diagram {
  const roots: Branch[] = [];
  const stack: Branch[] = [];
  let defaultSide: -1 | 1 = 1;

  for (const line of lines) {
    if (/^left side$/i.test(line.text)) {
      defaultSide = -1;
      continue;
    }
    if (/^right side$/i.test(line.text)) {
      defaultSide = 1;
      continue;
    }
    const m = MARKER.exec(line.text);
    if (!m) {
      warn(`ligne ${line.n} : « ${line.text.slice(0, 40)} » n'a pas été comprise`);
      continue;
    }
    const markers = m[1];
    const depth = markers.length - 1;
    const text = m[3].replace(/^:|;$/g, '').trim();
    const side: -1 | 1 = markers[0] === '-' ? -1 : markers[0] === '+' ? 1 : defaultSide;
    const branch: Branch = { text, depth, side, children: [] };

    if (depth === 0) {
      roots.push(branch);
      stack.length = 0;
      stack.push(branch);
      continue;
    }
    const parent = stack[depth - 1];
    if (!parent) {
      warn(`ligne ${line.n} : niveau « ${markers} » sans parent`);
      continue;
    }
    // Un enfant reste du côté de sa branche de premier niveau.
    branch.side = depth === 1 ? side : parent.side;
    parent.children.push(branch);
    stack[depth] = branch;
    stack.length = depth + 1;
  }

  const root = roots[0];
  if (!root) throw new Error('Aucune idée centrale trouvée (une ligne commençant par « * »).');

  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  const build = (branch: Branch) => {
    const [w, h] = sizeFor(branch.depth, branch.text);
    branch.node = makeNode(shapeFor(branch.depth), 0, 0, { text: branch.text, w, h });
    nodes.push(branch.node);
    branch.children.forEach(build);
    // Hauteur occupée par la branche entière : la somme de ses enfants, au minimum la sienne.
    const childSpan = branch.children.reduce((sum, c) => sum + (c.span ?? 0), 0);
    branch.span = Math.max(h + GAP_Y, childSpan);
  };
  build(root);

  const place = (branch: Branch, centerX: number, centerY: number) => {
    const node = branch.node!;
    node.x = Math.round((centerX - node.w / 2) / 10) * 10;
    node.y = Math.round((centerY - node.h / 2) / 10) * 10;

    const groups = branch.depth === 0
      ? [branch.children.filter((c) => c.side === -1), branch.children.filter((c) => c.side === 1)]
      : [[], branch.children];

    groups.forEach((group, i) => {
      if (!group.length) return;
      const side = branch.depth === 0 ? (i === 0 ? -1 : 1) : branch.side;
      const total = group.reduce((sum, c) => sum + (c.span ?? 0), 0);
      let cursor = centerY - total / 2;
      for (const child of group) {
        const childCenter = cursor + (child.span ?? 0) / 2;
        const childX = centerX + side * (node.w / 2 + GAP_X + (child.node!.w) / 2);
        place(child, childX, childCenter);
        edges.push(makeEdge(node.id, child.node!.id, { style: { ...CURVE, strokeWidth: branch.depth === 0 ? 2.5 : 2 } }));
        cursor += child.span ?? 0;
      }
    });
  };
  place(root, 600, 400);

  if (roots.length > 1) warn('seule la première idée centrale a été reprise');
  return { nodes, edges };
}
