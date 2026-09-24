import type { DiagramNode, Diagram, EdgeStyle, Side } from '../../types';
import { makeEdge, makeNode } from '../templates';
import { unquote, type SourceLine } from './source';

const PARTICIPANT =
  /^(participant|actor|boundary|control|entity|database|collections|queue)\s+("[^"]+"|[^\s]+)(?:\s+as\s+([^\s]+))?/i;
const MESSAGE =
  /^("[^"]+"|[\w.]+)\s*(->>|-->>|->|-->|<<-|<-|<--|<->)\s*("[^"]+"|[\w.]+)\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.*))?$/;
const FRAGMENT = /^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/i;

const COLUMN = 260;
const ROW = 60;
const HEAD_Y = 80;
const FIRST_MESSAGE = 190;
const LIFELINE_W = 140;
const BAR_W = 16;
/** Débord de la barre d'activation autour des messages qui l'ouvrent et la ferment. */
const BAR_MARGIN = 8;

interface Participant {
  id: string;
  node: DiagramNode;
  index: number;
  open: { node: DiagramNode; startY: number }[];
}

/** Le lien est décrit en hauteurs absolues ; les fractions sont calculées à la fin,
 *  une fois que les barres d'activation ont leur taille définitive. */
interface PendingEdge {
  from: DiagramNode;
  to: DiagramNode;
  fromY: number;
  toY: number;
  fromAnchor: Side;
  toAnchor: Side;
  label?: string;
  style: Partial<EdgeStyle>;
  /** Cible à re-pointer si un `activate` suit immédiatement le message. */
  target?: Participant;
}

export function parseSequenceDiagram(lines: SourceLine[], warn: (message: string) => void): Diagram {
  const participants = new Map<string, Participant>();
  const order: Participant[] = [];
  const bars: DiagramNode[] = [];
  const frames: DiagramNode[] = [];
  const pending: PendingEdge[] = [];
  const openFragments: { label: string; startY: number; columns: number[] }[] = [];
  let warnedElse = false;
  let y = FIRST_MESSAGE;
  let lastMessageY: number | null = null;
  let lastEdge: PendingEdge | null = null;

  const participant = (rawName: string, alias?: string, kind = 'participant'): Participant => {
    const name = unquote(rawName);
    const id = alias ?? name;
    const existing = participants.get(id);
    if (existing) return existing;
    const index = order.length;
    const node = makeNode('lifeline', 80 + index * COLUMN, HEAD_Y, {
      text: name,
      w: LIFELINE_W,
      style: /actor/i.test(kind) ? { fill: '#fff7ed', stroke: '#ea580c' } : undefined,
    });
    const entry: Participant = { id, node, index, open: [] };
    participants.set(id, entry);
    order.push(entry);
    return entry;
  };

  const activate = (target: Participant, at: number) => {
    const depth = target.open.length;
    const startY = at - BAR_MARGIN;
    const node = makeNode('activation', target.node.x + LIFELINE_W / 2 - BAR_W / 2 + depth * 6, startY, {
      w: BAR_W,
      h: ROW,
    });
    target.open.push({ node, startY });
    bars.push(node);
    // Un message qui vient d'arriver sur cette forme touche désormais la barre.
    if (lastEdge && lastEdge.target === target && lastEdge.toY === lastMessageY) {
      lastEdge.to = node;
    }
    return node;
  };

  const deactivate = (target: Participant, at: number) => {
    const last = target.open.pop();
    if (last) last.node.h = Math.max(at + BAR_MARGIN - last.startY, 28);
  };

  const anchorOf = (target: Participant): DiagramNode =>
    target.open.length ? target.open[target.open.length - 1].node : target.node;

  for (const line of lines) {
    const text = line.text;

    const declared = PARTICIPANT.exec(text);
    if (declared) {
      participant(declared[2], declared[3], declared[1]);
      continue;
    }

    const fragment = FRAGMENT.exec(text);
    if (fragment) {
      openFragments.push({ label: `${fragment[1].toLowerCase()} ${fragment[2] ?? ''}`.trim(), startY: y, columns: [] });
      y += 40;
      continue;
    }
    if (/^else\b/i.test(text)) {
      if (!warnedElse) {
        warn('les branches « else » d’un fragment ne sont pas séparées visuellement');
        warnedElse = true;
      }
      y += 20;
      continue;
    }
    if (/^end\b/i.test(text)) {
      const frame = openFragments.pop();
      if (frame?.columns.length) {
        const left = 80 + Math.min(...frame.columns) * COLUMN - 30;
        const right = 80 + Math.max(...frame.columns) * COLUMN + LIFELINE_W + 30;
        frames.push(
          makeNode('fragment', left, frame.startY - 30, {
            text: frame.label,
            w: right - left,
            h: y - frame.startY + 40,
          }),
        );
      }
      y += 20;
      continue;
    }

    const lifecycle = /^(activate|deactivate|destroy)\s+(\S+)/i.exec(text);
    if (lifecycle) {
      const target = participant(lifecycle[2]);
      const at = lastMessageY ?? y;
      // Attention : « deactivate » contient « activate », d'où l'ancrage de l'expression.
      if (/^activate$/i.test(lifecycle[1])) activate(target, at);
      else deactivate(target, at);
      continue;
    }

    const message = MESSAGE.exec(text);
    if (message) {
      const [, rawFrom, arrow, rawTo, shorthand, label] = message;
      const backwards = arrow.startsWith('<');
      const a = participant(backwards ? rawTo : rawFrom);
      const b = participant(backwards ? rawFrom : rawTo);
      const dashed = arrow.includes('--');
      const style: Partial<EdgeStyle> = {
        routing: 'straight',
        dash: dashed ? 'dashed' : 'solid',
        end: dashed ? 'arrow-thin' : 'triangle',
      };

      const fromNode = anchorOf(a);
      if (shorthand === '++') activate(b, y);
      const toNode = anchorOf(b);

      const edge: PendingEdge =
        a === b
          ? {
              // Message réflexif : on ressort et on revient du même côté.
              from: fromNode, to: toNode, fromY: y, toY: y + 44,
              fromAnchor: 'e', toAnchor: 'e', label,
              style: { ...style, routing: 'orthogonal' },
            }
          : {
              from: fromNode, to: toNode, fromY: y, toY: y,
              fromAnchor: a.index < b.index ? 'e' : 'w',
              toAnchor: a.index < b.index ? 'w' : 'e',
              label, style, target: b,
            };
      pending.push(edge);
      lastEdge = edge;
      lastMessageY = y;
      if (a === b) y += 44;
      if (shorthand === '--') deactivate(b, y);
      for (const frame of openFragments) frame.columns.push(a.index, b.index);
      y += ROW;
      continue;
    }

    if (/^note\b/i.test(text) || /^end note$/i.test(text)) {
      warn(`ligne ${line.n} : les notes ne sont pas encore reprises`);
      continue;
    }
    if (/^(\.{3}|\|{3}|={2,})/.test(text)) continue;
    warn(`ligne ${line.n} : « ${text.slice(0, 40)} » n'a pas été comprise`);
  }

  const bottom = y + 40;
  for (const p of order) {
    p.node.h = Math.max(bottom - HEAD_Y, 200);
    for (const open of p.open) open.node.h = Math.max(bottom - 60 - open.startY, 28);
  }

  const ratio = (node: DiagramNode, value: number) =>
    Math.min(Math.max((value - node.y) / Math.max(node.h, 1), 0.02), 0.98);
  const edges = pending.map((p) =>
    makeEdge(p.from.id, p.to.id, {
      label: p.label,
      style: p.style,
      fromAnchor: p.fromAnchor,
      fromT: ratio(p.from, p.fromY),
      toAnchor: p.toAnchor,
      toT: ratio(p.to, p.toY),
    }),
  );

  return { nodes: [...frames, ...order.map((p) => p.node), ...bars], edges };
}
