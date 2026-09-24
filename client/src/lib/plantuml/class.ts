import type { Diagram, DiagramEdge, DiagramNode, EdgeStyle, Marker } from '../../types';
import { makeEdge, makeNode } from '../templates';
import { minHeightFor } from '../../shapes/registry';
import { fontString, measure } from '../text';
import { layeredLayout } from './layout';
import { normalizeArrow, splitRelation, unquote, type SourceLine } from './source';

interface ParsedClass {
  id: string;
  name: string;
  shape: 'umlClass' | 'umlInterface' | 'umlEnum';
  abstract: boolean;
  attributes: string[];
  methods: string[];
  pack?: string;
}

const DECLARATION =
  /^(abstract\s+class|abstract|class|interface|enum|entity|struct|protocol)\s+("[^"]+"|[^\s{]+)(?:\s+as\s+([^\s{]+))?(?:\s*<<[^>]*>>)?\s*(\{)?\s*$/i;
const EXTENDS = /\b(extends|implements)\s+([^\s{]+(?:\s*,\s*[^\s{]+)*)/i;
const PACKAGE = /^(package|namespace|together)\s+("[^"]+"|[^\s{]+)?\s*(?:<<[^>]*>>)?\s*\{?\s*$/i;

/** Convertit la flèche PlantUML en marqueurs de l'application. */
export function arrowToStyle(raw: string): Partial<EdgeStyle> {
  const arrow = normalizeArrow(raw);
  const head = (at: 'start' | 'end'): Marker => {
    const s = at === 'start';
    if (s ? arrow.startsWith('<|') : arrow.endsWith('|>')) return 'triangle-open';
    if (s ? arrow.startsWith('*') : arrow.endsWith('*')) return 'diamond';
    if (s ? arrow.startsWith('o') : arrow.endsWith('o')) return 'diamond-open';
    if (s ? arrow.startsWith('+') : arrow.endsWith('+')) return 'circle-open';
    if (s ? arrow.startsWith('<') : arrow.endsWith('>')) return 'arrow-thin';
    return 'none';
  };
  return {
    start: head('start'),
    end: head('end'),
    dash: arrow.includes('.') ? 'dashed' : 'solid',
    routing: 'orthogonal',
  };
}

/** Largeur qui laisse le plus long membre tenir sur une ligne, dans des bornes raisonnables. */
function widthFor(entry: ParsedClass): number {
  const title = measure(entry.name, fontString(14, true)) + 44;
  const members = [...entry.attributes, ...entry.methods].map(
    (m) => measure(m, fontString(13, false, false, true)) + 34,
  );
  const needed = Math.max(title, ...members, 180);
  return Math.min(Math.ceil(needed / 10) * 10, 340);
}

/** Deux compartiments quand la classe a des attributs et des méthodes, un seul sinon. */
function compartmentsFor(entry: ParsedClass): string[] {
  const attributes = entry.attributes.join('\n');
  const methods = entry.methods.join('\n');
  if (attributes && methods) return [attributes, methods];
  if (attributes) return [attributes];
  if (methods) return [methods];
  return [];
}

export function parseClassDiagram(lines: SourceLine[], warn: (message: string) => void): Diagram {
  const classes = new Map<string, ParsedClass>();
  const relations: { left: string; right: string; arrow: string; label?: string; leftLabel?: string; rightLabel?: string }[] = [];
  const packages = new Map<string, string[]>();
  const packStack: string[] = [];

  let current: ParsedClass | null = null;

  const declare = (rawName: string, alias: string | undefined, kind: string): ParsedClass => {
    const name = unquote(rawName);
    const id = alias ?? name;
    const shape = /interface|protocol/i.test(kind)
      ? 'umlInterface'
      : /enum/i.test(kind)
        ? 'umlEnum'
        : 'umlClass';
    const entry: ParsedClass = {
      id,
      name,
      shape,
      abstract: /abstract/i.test(kind),
      attributes: [],
      methods: [],
      pack: packStack[packStack.length - 1],
    };
    classes.set(id, entry);
    if (entry.pack) packages.get(entry.pack)!.push(id);
    return entry;
  };

  for (const line of lines) {
    const text = line.text;

    if (current) {
      if (text === '}' || text.startsWith('}')) {
        current = null;
        continue;
      }
      const member = text
        .replace(/\{(static|abstract|field|method)\}/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[.]{2,}\s*$|^\s*[-]{2,}\s*$|^\s*[=]{2,}\s*$|^\s*__.*__\s*$/, '')
        .trim();
      if (!member) continue;
      if (member.includes('(')) current.methods.push(member);
      else current.attributes.push(member);
      continue;
    }

    if (text === '}' ) {
      packStack.pop();
      continue;
    }

    const pack = PACKAGE.exec(text);
    if (pack && text.endsWith('{')) {
      const name = unquote(pack[2] ?? 'paquetage');
      packStack.push(name);
      if (!packages.has(name)) packages.set(name, []);
      continue;
    }

    const decl = DECLARATION.exec(text.replace(EXTENDS, '').trim());
    if (decl) {
      const entry = declare(decl[2], decl[3], decl[1]);
      if (decl[4]) current = entry;
      const inherit = EXTENDS.exec(text);
      if (inherit) {
        const arrow = /implements/i.test(inherit[1]) ? '<|..' : '<|--';
        for (const parent of inherit[2].split(',')) {
          relations.push({ left: unquote(parent.trim()), right: entry.id, arrow });
        }
      }
      continue;
    }

    // Membre déclaré hors accolades : « Personne : nom : String »
    const inline = /^([^\s:]+)\s*:\s*(.+)$/.exec(text);
    if (inline && classes.has(inline[1]) && !/[-.=]{2}/.test(text)) {
      const entry = classes.get(inline[1])!;
      if (inline[2].includes('(')) entry.methods.push(inline[2].trim());
      else entry.attributes.push(inline[2].trim());
      continue;
    }

    const relation = splitRelation(text);
    if (relation) {
      relations.push(relation);
      continue;
    }

    if (/^note\b/i.test(text) || /^end note$/i.test(text)) {
      warn(`ligne ${line.n} : les notes ne sont pas encore reprises`);
      continue;
    }
    warn(`ligne ${line.n} : « ${text.slice(0, 40)} » n'a pas été comprise`);
  }

  // Les classes citées uniquement dans une relation existent quand même.
  for (const r of relations) {
    for (const side of [r.left, r.right]) {
      if (!classes.has(side)) {
        classes.set(side, { id: side, name: side, shape: 'umlClass', abstract: false, attributes: [], methods: [] });
      }
    }
  }

  const nodes: DiagramNode[] = [];
  const byId = new Map<string, DiagramNode>();
  for (const entry of classes.values()) {
    const w = widthFor(entry);
    const node = makeNode(entry.shape, 0, 0, {
      text: entry.name,
      w,
      compartments: compartmentsFor(entry),
      style: entry.abstract ? { italic: true } : undefined,
    });
    node.h = Math.max(Math.ceil(minHeightFor(node)), 60);
    nodes.push(node);
    byId.set(entry.id, node);
  }

  const edges: DiagramEdge[] = [];
  const links: { from: string; to: string }[] = [];
  for (const relation of relations) {
    const from = byId.get(relation.left);
    const to = byId.get(relation.right);
    if (!from || !to) continue;
    const style = arrowToStyle(relation.arrow);
    edges.push(
      makeEdge(from.id, to.id, {
        label: relation.label,
        startLabel: relation.leftLabel,
        endLabel: relation.rightLabel,
        style,
      }),
    );
    // La forme portant le triangle ou le losange plein se place au-dessus.
    const parentIsRight = style.end === 'triangle-open' || style.end === 'diamond' || style.end === 'diamond-open';
    links.push(parentIsRight ? { from: to.id, to: from.id } : { from: from.id, to: to.id });
  }

  const groupOf = new Map([...classes.values()].map((c) => [byId.get(c.id)?.id ?? '', c.pack]));
  const placement = layeredLayout(
    nodes.map((n) => ({ id: n.id, w: n.w, h: n.h, group: groupOf.get(n.id) ?? undefined })),
    links,
    { gapX: 70, gapY: 110 },
  );
  for (const node of nodes) {
    const point = placement.get(node.id);
    if (point) {
      node.x = point.x;
      node.y = point.y;
    }
  }

  // Une forme hors paquetage qui tomberait dans le cadre est repoussée à sa droite.
  for (const members of packages.values()) {
    const inside = members.map((id) => byId.get(id)).filter(Boolean) as DiagramNode[];
    if (!inside.length) continue;
    const owned = new Set(inside.map((n) => n.id));
    const left = Math.min(...inside.map((n) => n.x)) - 24;
    const right = Math.max(...inside.map((n) => n.x + n.w)) + 24;
    const top = Math.min(...inside.map((n) => n.y)) - 48;
    const low = Math.max(...inside.map((n) => n.y + n.h)) + 24;
    for (const node of nodes) {
      if (owned.has(node.id)) continue;
      const overlaps = node.x < right && node.x + node.w > left && node.y < low && node.y + node.h > top;
      if (overlaps) node.x = right + 60;
    }
  }

  // Cadre de paquetage : dessiné derrière, autour de ce qu'il contient.
  const frames: DiagramNode[] = [];
  for (const [name, members] of packages) {
    const inside = members.map((id) => byId.get(id)).filter(Boolean) as DiagramNode[];
    if (!inside.length) continue;
    const x = Math.min(...inside.map((n) => n.x)) - 24;
    const y = Math.min(...inside.map((n) => n.y)) - 48;
    const right = Math.max(...inside.map((n) => n.x + n.w)) + 24;
    const bottom = Math.max(...inside.map((n) => n.y + n.h)) + 24;
    frames.push(makeNode('umlPackage', x, y, { text: name, w: right - x, h: bottom - y }));
  }

  return { nodes: [...frames, ...nodes], edges };
}
