import type { Diagram, DiagramEdge, DiagramNode, EdgeStyle } from '../../types';
import { makeEdge, makeNode } from '../templates';
import { fontString, measure } from '../text';
import { column } from './layout';
import { splitRelation, unquote, type SourceLine } from './source';
import { arrowToStyle } from './class';

const ACTOR = /^actor\s+("[^"]+"|[^\s]+)(?:\s+as\s+([^\s]+))?/i;
const ACTOR_SHORT = /^:([^:]+):(?:\s+as\s+([^\s]+))?$/;
const USECASE = /^usecase\s+("[^"]+"|[^\s]+)(?:\s+as\s+([^\s]+))?/i;
const USECASE_SHORT = /^\(([^)]+)\)(?:\s+as\s+([^\s]+))?$/;
const FRAME = /^(rectangle|package|frame|node|folder)\s+("[^"]+"|[^\s{]+)?\s*\{?\s*$/i;

interface Item {
  id: string;
  name: string;
  actor: boolean;
  node?: DiagramNode;
  inFrame?: string;
}

export function parseUseCaseDiagram(lines: SourceLine[], warn: (message: string) => void): Diagram {
  const items = new Map<string, Item>();
  const relations: { left: string; right: string; arrow: string; label?: string }[] = [];
  const frames: { name: string; members: string[] }[] = [];
  const frameStack: string[] = [];

  const declare = (rawName: string, alias: string | undefined, actor: boolean): Item => {
    const name = unquote(rawName);
    const id = alias ?? name;
    const existing = items.get(id);
    if (existing) return existing;
    const item: Item = { id, name, actor, inFrame: frameStack[frameStack.length - 1] };
    items.set(id, item);
    if (item.inFrame) frames.find((f) => f.name === item.inFrame)?.members.push(id);
    return item;
  };

  for (const line of lines) {
    const text = line.text;
    if (text === '}') {
      frameStack.pop();
      continue;
    }
    const frame = FRAME.exec(text);
    if (frame && text.endsWith('{')) {
      const name = unquote(frame[2] ?? 'Système');
      frames.push({ name, members: [] });
      frameStack.push(name);
      continue;
    }
    const actor = ACTOR.exec(text) ?? (ACTOR_SHORT.test(text) ? ACTOR_SHORT.exec(text) : null);
    if (actor) {
      declare(actor[1], actor[2], true);
      continue;
    }
    const usecase = USECASE.exec(text) ?? (USECASE_SHORT.test(text) ? USECASE_SHORT.exec(text) : null);
    if (usecase) {
      declare(usecase[1], usecase[2], false);
      continue;
    }
    const relation = splitRelation(text);
    if (relation) {
      relations.push(relation);
      continue;
    }
    warn(`ligne ${line.n} : « ${text.slice(0, 40)} » n'a pas été comprise`);
  }

  // Les éléments cités seulement dans une relation : la forme entre parenthèses
  // désigne un cas d'utilisation, le reste un acteur déjà déclaré ou un cas.
  for (const relation of relations) {
    for (const raw of [relation.left, relation.right]) {
      const parenthesised = /^\(([^)]+)\)$/.exec(raw);
      const id = parenthesised ? parenthesised[1] : raw;
      if (!items.has(id)) declare(id, undefined, false);
      if (parenthesised) items.get(id)!.actor = false;
    }
  }

  const actors = [...items.values()].filter((i) => i.actor);
  const useCases = [...items.values()].filter((i) => !i.actor);

  for (const item of useCases) {
    const width = Math.min(Math.max(measure(item.name, fontString(14)) + 60, 150), 260);
    item.node = makeNode('useCase', 0, 0, { text: item.name, w: Math.ceil(width / 10) * 10 });
  }
  for (const item of actors) item.node = makeNode('actor', 0, 0, { text: item.name });

  // Cas d'utilisation en colonne centrale, acteurs répartis de part et d'autre.
  const centerX = 560;
  const positions = column(useCases.map((u) => ({ w: u.node!.w, h: u.node!.h })), centerX, 140, 50);
  useCases.forEach((item, i) => {
    item.node!.x = positions[i].x;
    item.node!.y = positions[i].y;
  });
  const bottom = useCases.length
    ? Math.max(...useCases.map((u) => u.node!.y + u.node!.h))
    : 400;

  const half = Math.ceil(actors.length / 2);
  [actors.slice(0, half), actors.slice(half)].forEach((group, side) => {
    const x = side === 0 ? 160 : 960;
    const spots = column(group.map((a) => ({ w: a.node!.w, h: a.node!.h })), x, 0, 90);
    const span = spots.length ? spots[spots.length - 1].y + group[group.length - 1].node!.h : 0;
    const offset = 140 + (bottom - 140 - span) / 2;
    group.forEach((item, i) => {
      item.node!.x = spots[i].x;
      item.node!.y = Math.round((spots[i].y + offset) / 10) * 10;
    });
  });

  const edges: DiagramEdge[] = [];
  const straight: Partial<EdgeStyle> = { routing: 'straight' };
  for (const relation of relations) {
    const id = (raw: string) => {
      const p = /^\(([^)]+)\)$/.exec(raw);
      return p ? p[1] : raw;
    };
    const from = items.get(id(relation.left))?.node;
    const to = items.get(id(relation.right))?.node;
    if (!from || !to) continue;
    const style = arrowToStyle(relation.arrow);
    const betweenUseCases = !items.get(id(relation.left))!.actor && !items.get(id(relation.right))!.actor;
    edges.push(
      makeEdge(from.id, to.id, {
        label: relation.label,
        style: { ...style, ...straight, end: betweenUseCases ? style.end : 'none' },
      }),
    );
  }

  // Frontière du système autour des cas qu'elle contient.
  const boxes: DiagramNode[] = [];
  for (const frame of frames) {
    const inside = frame.members.map((id) => items.get(id)?.node).filter(Boolean) as DiagramNode[];
    if (!inside.length) continue;
    const x = Math.min(...inside.map((n) => n.x)) - 60;
    const y = Math.min(...inside.map((n) => n.y)) - 70;
    const right = Math.max(...inside.map((n) => n.x + n.w)) + 60;
    const low = Math.max(...inside.map((n) => n.y + n.h)) + 50;
    boxes.push(makeNode('boundary', x, y, { text: frame.name, w: right - x, h: low - y }));
  }

  return {
    nodes: [...boxes, ...useCases.map((u) => u.node!), ...actors.map((a) => a.node!)],
    edges,
  };
}
