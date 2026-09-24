import type { ReactNode } from 'react';
import type { DiagramNode, NodeStyle, Outline, Rect } from '../types';
import { DEFAULT_NODE_STYLE } from '../types';
import { LINE_HEIGHT, fontString, measure, wrapText } from '../lib/text';

export interface ShapeProps {
  node: DiagramNode;
  w: number;
  h: number;
  s: NodeStyle;
}

export interface ShapeDef {
  name: string;
  size: [number, number];
  outline: Outline;
  style?: Partial<NodeStyle>;
  text?: string;
  compartments?: string[];
  keepRatio?: boolean;
  container?: boolean;
  /** La position verticale du lien est signifiante (séquence). */
  precise?: boolean;
  /** Rectangle d'accroche des liens, s'il diffère de la boîte (ligne de vie). */
  anchorRect?: (n: DiagramNode) => Rect;
  Body: (p: ShapeProps) => ReactNode;
  /** Zone de texte en coordonnées locales ; par défaut, la boîte moins une marge. */
  textRect?: (p: ShapeProps) => Rect;
  /** Rendu de texte spécifique (compartiments UML) ; sinon rendu générique. */
  Text?: (p: ShapeProps) => ReactNode;
  /** Hauteur minimale imposée par le contenu. */
  autoHeight?: (n: DiagramNode) => number;
}

const dashArray = (s: NodeStyle) =>
  s.dash === 'dashed' ? `${s.strokeWidth * 4} ${s.strokeWidth * 3}` : s.dash === 'dotted' ? `1 ${s.strokeWidth * 3}` : undefined;

/** Attributs de contour communs à toutes les formes. */
function skin(s: NodeStyle, override?: Partial<{ fill: string; stroke: string }>) {
  return {
    fill: override?.fill ?? s.fill,
    stroke: override?.stroke ?? s.stroke,
    strokeWidth: s.strokeWidth,
    strokeDasharray: dashArray(s),
    strokeLinejoin: 'round' as const,
  };
}

const poly = (pts: number[][]) => pts.map((p) => p.join(',')).join(' ');

// ---------------------------------------------------------------- texte

interface TextBlockProps {
  rect: Rect;
  text: string;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  align?: NodeStyle['align'];
  valign?: NodeStyle['valign'];
}

export function TextBlock({
  rect,
  text,
  size,
  color,
  bold = false,
  italic = false,
  mono = false,
  align = 'center',
  valign = 'middle',
}: TextBlockProps) {
  if (!text) return null;
  const font = fontString(size, bold, italic, mono);
  const lines = wrapText(text, rect.w, font);
  if (!lines.length) return null;

  const lh = size * LINE_HEIGHT;
  const blockH = lines.length * lh;
  const top =
    valign === 'top' ? rect.y : valign === 'bottom' ? rect.y + rect.h - blockH : rect.y + (rect.h - blockH) / 2;
  const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';

  return (
    <text
      x={x}
      fill={color}
      fontFamily={font.slice(font.indexOf('px ') + 3)}
      fontSize={size}
      fontWeight={bold ? 600 : 400}
      fontStyle={italic ? 'italic' : undefined}
      textAnchor={anchor}
      style={{ pointerEvents: 'none', userSelect: 'none', whiteSpace: 'pre' }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={top + i * lh + lh / 2} dominantBaseline="central">
          {line || ' '}
        </tspan>
      ))}
    </text>
  );
}

function GenericText({ node, w, h, s }: ShapeProps) {
  const def = shapes[node.shape];
  const rect = def?.textRect ? def.textRect({ node, w, h, s }) : inset({ x: 0, y: 0, w, h }, 10);
  return (
    <TextBlock
      rect={rect}
      text={node.text}
      size={s.fontSize}
      color={s.color}
      bold={s.bold}
      italic={s.italic}
      align={s.align}
      valign={s.valign}
    />
  );
}

const inset = (r: Rect, by: number): Rect => ({
  x: r.x + by,
  y: r.y + by,
  w: Math.max(r.w - by * 2, 8),
  h: Math.max(r.h - by * 2, 8),
});

function textHeight(text: string, width: number, size: number, bold = false, mono = false): number {
  const lines = wrapText(text, width, fontString(size, bold, false, mono));
  return Math.max(lines.length, 1) * size * LINE_HEIGHT;
}

// ------------------------------------------------------- compartiments UML

const UML_PAD = 12;

export interface UmlRow {
  y: number;
  h: number;
  text: string;
}

export function umlLayout(node: DiagramNode, w: number, h: number) {
  const s = node.style;
  const body = node.compartments ?? [];
  const inner = Math.max(w - UML_PAD * 2, 20);
  const headerLines = node.shape === 'umlClass' ? node.text : `${stereotypeOf(node)}\n${node.text}`;
  const headerH = Math.max(34, textHeight(headerLines, inner, s.fontSize, true) + 12);

  const rows: UmlRow[] = [];
  let y = headerH;
  body.forEach((text, i) => {
    const natural = Math.max(22, textHeight(text || ' ', inner, s.fontSize - 1, false, true) + UML_PAD);
    const isLast = i === body.length - 1;
    const remaining = h - y;
    rows.push({ y, h: isLast ? Math.max(natural, remaining) : natural, text });
    y += rows[rows.length - 1].h;
  });
  return { headerH, rows };
}

function stereotypeOf(node: DiagramNode): string {
  if (node.shape === 'umlInterface') return '«interface»';
  if (node.shape === 'umlEnum') return '«enumeration»';
  return '';
}

function UmlBody({ node, w, h, s }: ShapeProps) {
  const { headerH, rows } = umlLayout(node, w, h);
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={s.radius > 6 ? 6 : s.radius} {...skin(s)} />
      {Boolean(rows.length) && (
        <line x1={0} y1={headerH} x2={w} y2={headerH} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      )}
      {rows.slice(1).map((r) => (
        <line key={r.y} x1={0} y1={r.y} x2={w} y2={r.y} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      ))}
    </g>
  );
}

function UmlText({ node, w, h, s }: ShapeProps) {
  const { headerH, rows } = umlLayout(node, w, h);
  const stereotype = stereotypeOf(node);
  const inner = Math.max(w - UML_PAD * 2, 20);
  const stereoH = stereotype ? s.fontSize * LINE_HEIGHT : 0;
  return (
    <g>
      {stereotype && (
        <TextBlock
          rect={{ x: UML_PAD, y: 6, w: inner, h: stereoH }}
          text={stereotype}
          size={s.fontSize - 2}
          color={s.color}
          align="center"
          valign="middle"
        />
      )}
      <TextBlock
        rect={{ x: UML_PAD, y: 6 + stereoH, w: inner, h: headerH - 12 - stereoH }}
        text={node.text}
        size={s.fontSize}
        color={s.color}
        bold
        italic={s.italic}
        align="center"
        valign="middle"
      />
      {rows.map((r) => (
        <TextBlock
          key={r.y}
          rect={{ x: UML_PAD, y: r.y + UML_PAD / 2, w: inner, h: r.h - UML_PAD }}
          text={r.text}
          size={s.fontSize - 1}
          color={s.color}
          mono
          align="left"
          valign="top"
        />
      ))}
    </g>
  );
}

/** Largeur de l'onglet d'un fragment : il doit contenir « alt », « loop [3 fois] »… */
function fragmentTab(text: string, w: number, fontSize: number): number {
  const needed = measure(text || 'alt', fontString(fontSize)) + 52;
  return Math.round(Math.min(Math.max(needed, 60), Math.max(w - 40, 60)));
}

const umlAutoHeight = (n: DiagramNode) => {
  const { headerH, rows } = umlLayout(n, n.w, 0);
  return headerH + rows.reduce((sum, r) => sum + r.h, 0);
};

// ------------------------------------------------------------- le registre

export const shapes: Record<string, ShapeDef> = {
  rectangle: {
    name: 'Rectangle',
    size: [160, 80],
    outline: 'rect',
    style: { radius: 0 },
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={s.radius} {...skin(s)} />,
  },
  roundRect: {
    name: 'Rectangle arrondi',
    size: [160, 80],
    outline: 'rect',
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={Math.min(s.radius || 12, h / 2)} {...skin(s)} />,
  },
  ellipse: {
    name: 'Ellipse',
    size: [160, 80],
    outline: 'ellipse',
    Body: ({ w, h, s }) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...skin(s)} />,
    textRect: ({ w, h }) => inset({ x: 0, y: 0, w, h }, Math.min(w, h) * 0.16),
  },
  circle: {
    name: 'Cercle',
    size: [120, 120],
    outline: 'ellipse',
    keepRatio: true,
    Body: ({ w, h, s }) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...skin(s)} />,
    textRect: ({ w, h }) => inset({ x: 0, y: 0, w, h }, Math.min(w, h) * 0.18),
  },
  diamond: {
    name: 'Décision',
    size: [160, 100],
    outline: 'diamond',
    Body: ({ w, h, s }) => (
      <polygon points={poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])} {...skin(s)} />
    ),
    textRect: ({ w, h }) => ({ x: w * 0.2, y: h * 0.22, w: w * 0.6, h: h * 0.56 }),
  },
  triangle: {
    name: 'Triangle',
    size: [140, 100],
    outline: 'diamond',
    Body: ({ w, h, s }) => <polygon points={poly([[w / 2, 0], [w, h], [0, h]])} {...skin(s)} />,
    textRect: ({ w, h }) => ({ x: w * 0.18, y: h * 0.42, w: w * 0.64, h: h * 0.5 }),
  },
  parallelogram: {
    name: 'Données',
    size: [160, 80],
    outline: 'rect',
    Body: ({ w, h, s }) => {
      const k = Math.min(w * 0.2, 28);
      return <polygon points={poly([[k, 0], [w, 0], [w - k, h], [0, h]])} {...skin(s)} />;
    },
    textRect: ({ w, h }) => inset({ x: Math.min(w * 0.2, 28), y: 0, w: w - Math.min(w * 0.4, 56), h }, 6),
  },
  hexagon: {
    name: 'Hexagone',
    size: [160, 80],
    outline: 'rect',
    Body: ({ w, h, s }) => {
      const k = Math.min(w * 0.18, 26);
      return (
        <polygon
          points={poly([[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]])}
          {...skin(s)}
        />
      );
    },
  },
  stadium: {
    name: 'Début / Fin',
    size: [160, 60],
    outline: 'rect',
    style: { fill: '#e0f2fe', stroke: '#0284c7' },
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={h / 2} {...skin(s)} />,
  },
  cylinder: {
    name: 'Base de données',
    size: [120, 100],
    outline: 'rect',
    Body: ({ w, h, s }) => {
      const ry = Math.min(h * 0.16, 20);
      return (
        <g>
          <path
            d={`M 0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} L ${w} ${h - ry} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`}
            {...skin(s)}
          />
          <path d={`M 0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry}`} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} />
        </g>
      );
    },
    textRect: ({ w, h }) => ({ x: 8, y: h * 0.3, w: w - 16, h: h * 0.6 }),
  },
  document: {
    name: 'Document',
    size: [160, 90],
    outline: 'rect',
    Body: ({ w, h, s }) => {
      const wave = h * 0.16;
      return (
        <path
          d={`M 0 0 L ${w} 0 L ${w} ${h - wave} C ${w * 0.72} ${h - wave * 2.1} ${w * 0.28} ${h + wave * 0.6} 0 ${h - wave} Z`}
          {...skin(s)}
        />
      );
    },
    textRect: ({ w, h }) => ({ x: 10, y: 8, w: w - 20, h: h - 28 }),
  },
  predefined: {
    name: 'Sous-programme',
    size: [160, 80],
    outline: 'rect',
    Body: ({ w, h, s }) => {
      const k = Math.min(w * 0.1, 14);
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} {...skin(s)} />
          <line x1={k} y1={0} x2={k} y2={h} stroke={s.stroke} strokeWidth={s.strokeWidth} />
          <line x1={w - k} y1={0} x2={w - k} y2={h} stroke={s.stroke} strokeWidth={s.strokeWidth} />
        </g>
      );
    },
    textRect: ({ w, h }) => inset({ x: Math.min(w * 0.1, 14), y: 0, w: w - Math.min(w * 0.2, 28), h }, 6),
  },
  note: {
    name: 'Note',
    size: [150, 90],
    outline: 'rect',
    style: { fill: '#fffbeb', stroke: '#d97706', align: 'left', valign: 'top' },
    Body: ({ w, h, s }) => {
      const k = Math.min(w, h) * 0.22;
      return (
        <g>
          <path d={`M 0 0 L ${w - k} 0 L ${w} ${k} L ${w} ${h} L 0 ${h} Z`} {...skin(s)} />
          <path d={`M ${w - k} 0 L ${w - k} ${k} L ${w} ${k}`} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} />
        </g>
      );
    },
    textRect: ({ w, h }) => ({ x: 10, y: 10, w: w - 20, h: h - 20 }),
  },
  sticky: {
    name: 'Pense-bête',
    size: [120, 120],
    outline: 'rect',
    style: { fill: '#fef08a', stroke: '#eab308', radius: 2, align: 'left', valign: 'top' },
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={2} {...skin(s)} />,
    textRect: ({ w, h }) => inset({ x: 0, y: 0, w, h }, 12),
  },
  textBox: {
    name: 'Texte',
    size: [160, 40],
    outline: 'rect',
    style: { fill: 'none', stroke: 'none', strokeWidth: 0, align: 'left' },
    text: 'Texte',
    Body: () => null,
    textRect: ({ w, h }) => ({ x: 4, y: 2, w: w - 8, h: h - 4 }),
  },
  startNode: {
    name: 'Nœud initial',
    size: [30, 30],
    outline: 'ellipse',
    keepRatio: true,
    style: { fill: '#0f172a', stroke: '#0f172a' },
    text: '',
    Body: ({ w, h, s }) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...skin(s)} />,
    textRect: ({ w, h }) => ({ x: -40, y: h + 4, w: w + 80, h: 20 }),
  },
  endNode: {
    name: 'Nœud final',
    size: [30, 30],
    outline: 'ellipse',
    keepRatio: true,
    style: { fill: '#ffffff', stroke: '#0f172a' },
    text: '',
    Body: ({ w, h, s }) => (
      <g>
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...skin(s)} />
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(w / 2 - Math.max(w * 0.17, 3), 1)}
          ry={Math.max(h / 2 - Math.max(h * 0.17, 3), 1)}
          fill={s.stroke}
        />
      </g>
    ),
    textRect: ({ w, h }) => ({ x: -40, y: h + 4, w: w + 80, h: 20 }),
  },
  bar: {
    name: 'Bifurcation / Jonction',
    size: [160, 6],
    outline: 'rect',
    // Trait plein : un contour viendrait s'ajouter à l'épaisseur voulue.
    style: { fill: '#0f172a', stroke: '#0f172a', strokeWidth: 0, radius: 2 },
    text: '',
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={2} {...skin(s)} />,
    textRect: ({ w, h }) => ({ x: 0, y: h + 4, w, h: 20 }),
  },
  umlClass: {
    name: 'Classe',
    size: [200, 120],
    outline: 'rect',
    style: { radius: 4, align: 'left' },
    text: 'NomDeClasse',
    compartments: ['- attribut : Type', '+ methode() : Type'],
    Body: UmlBody,
    Text: UmlText,
    autoHeight: umlAutoHeight,
  },
  umlInterface: {
    name: 'Interface',
    size: [200, 120],
    outline: 'rect',
    style: { radius: 4 },
    text: 'NomInterface',
    compartments: ['+ operation() : Type'],
    Body: UmlBody,
    Text: UmlText,
    autoHeight: umlAutoHeight,
  },
  umlEnum: {
    name: 'Énumération',
    size: [180, 120],
    outline: 'rect',
    style: { radius: 4 },
    text: 'NomEnum',
    compartments: ['VALEUR_A\nVALEUR_B'],
    Body: UmlBody,
    Text: UmlText,
    autoHeight: umlAutoHeight,
  },
  umlPackage: {
    name: 'Paquetage',
    size: [240, 160],
    outline: 'rect',
    container: true,
    style: { fill: '#f8fafc', align: 'left', valign: 'top' },
    text: 'monpaquetage',
    Body: ({ w, h, s }) => {
      const tabW = Math.min(w * 0.42, 110);
      const tabH = 26;
      return (
        <g>
          <path d={`M 0 0 L ${tabW} 0 L ${tabW} ${tabH} L ${w} ${tabH} L ${w} ${h} L 0 ${h} Z`} {...skin(s)} />
          <line x1={0} y1={tabH} x2={tabW} y2={tabH} stroke={s.stroke} strokeWidth={s.strokeWidth} />
        </g>
      );
    },
    textRect: ({ w }) => ({ x: 10, y: 0, w: Math.min(w * 0.42, 110) - 16, h: 26 }),
  },
  umlComponent: {
    name: 'Composant',
    size: [180, 80],
    outline: 'rect',
    Body: ({ w, h, s }) => (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={s.radius} {...skin(s)} />
        <rect x={-8} y={h * 0.22} width={22} height={14} {...skin(s)} />
        <rect x={-8} y={h * 0.6} width={22} height={14} {...skin(s)} />
      </g>
    ),
    textRect: ({ w, h }) => ({ x: 18, y: 6, w: w - 26, h: h - 12 }),
  },
  lifeline: {
    name: 'Ligne de vie',
    size: [140, 300],
    outline: 'rect',
    precise: true,
    // Les messages touchent le trait de vie, au centre de la boîte d'en-tête.
    anchorRect: (n) => ({ x: n.x + n.w / 2, y: n.y, w: 0, h: n.h }),
    style: { fill: '#eef2ff', stroke: '#4f46e5' },
    text: ':Objet',
    Body: ({ w, h, s }) => {
      const head = 46;
      return (
        <g>
          <rect x={0} y={0} width={w} height={head} rx={s.radius} {...skin(s)} />
          <line
            x1={w / 2}
            y1={head}
            x2={w / 2}
            y2={h}
            stroke={s.stroke}
            strokeWidth={Math.max(s.strokeWidth - 0.5, 1)}
            strokeDasharray="7 6"
          />
        </g>
      );
    },
    textRect: ({ w }) => ({ x: 6, y: 0, w: w - 12, h: 46 }),
  },
  activation: {
    name: 'Activation',
    size: [16, 120],
    outline: 'rect',
    precise: true,
    style: { fill: '#e0e7ff', stroke: '#4f46e5', radius: 0 },
    text: '',
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} {...skin(s)} />,
  },
  fragment: {
    name: 'Fragment (alt/loop)',
    size: [320, 200],
    outline: 'rect',
    container: true,
    style: { fill: 'none', stroke: '#64748b', align: 'left', valign: 'top' },
    text: 'alt',
    Body: ({ node, w, h, s }) => {
      const tw = fragmentTab(node.text, w, s.fontSize);
      const th = 24;
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={2} {...skin(s)} />
          <path d={`M 0 0 L ${tw} 0 L ${tw} ${th - 8} L ${tw - 10} ${th} L 0 ${th} Z`} {...skin(s, { fill: '#f1f5f9' })} />
        </g>
      );
    },
    textRect: ({ node, w, s }) => ({ x: 8, y: 0, w: fragmentTab(node.text, w, s.fontSize) - 18, h: 24 }),
  },
  actor: {
    name: 'Acteur',
    size: [50, 90],
    outline: 'rect',
    keepRatio: true,
    style: { fill: 'none', stroke: '#0f172a' },
    text: 'Acteur',
    Body: ({ w, h, s }) => {
      const cx = w / 2;
      const r = Math.min(w, h) * 0.18;
      const headY = r + 2;
      const bodyTop = headY + r;
      const bodyBottom = h * 0.62;
      return (
        <g fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap="round">
          <circle cx={cx} cy={headY} r={r} fill={s.fill === 'none' ? 'none' : s.fill} />
          <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBottom} />
          <line x1={cx - w * 0.36} y1={bodyTop + (bodyBottom - bodyTop) * 0.35} x2={cx + w * 0.36} y2={bodyTop + (bodyBottom - bodyTop) * 0.35} />
          <line x1={cx} y1={bodyBottom} x2={cx - w * 0.32} y2={h * 0.9} />
          <line x1={cx} y1={bodyBottom} x2={cx + w * 0.32} y2={h * 0.9} />
        </g>
      );
    },
    textRect: ({ w, h }) => ({ x: -30, y: h * 0.9 + 2, w: w + 60, h: 22 }),
  },
  useCase: {
    name: "Cas d'utilisation",
    size: [150, 70],
    outline: 'ellipse',
    style: { fill: '#f0fdf4', stroke: '#16a34a' },
    text: "Cas d'utilisation",
    Body: ({ w, h, s }) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...skin(s)} />,
    textRect: ({ w, h }) => inset({ x: 0, y: 0, w, h }, Math.min(w, h) * 0.16),
  },
  boundary: {
    name: 'Frontière du système',
    size: [400, 300],
    outline: 'rect',
    container: true,
    style: { fill: 'none', stroke: '#94a3b8', valign: 'top' },
    text: 'Système',
    Body: ({ w, h, s }) => (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={6} {...skin(s)} />
        <line x1={0} y1={36} x2={w} y2={36} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      </g>
    ),
    textRect: ({ w }) => ({ x: 10, y: 6, w: w - 20, h: 24 }),
  },
  mindRoot: {
    name: 'Idée centrale',
    size: [180, 70],
    outline: 'rect',
    style: { fill: '#f97316', stroke: '#ea580c', color: '#ffffff', fontSize: 17, bold: true, radius: 999 },
    text: 'Idée centrale',
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={h / 2} {...skin(s)} />,
  },
  mindTopic: {
    name: 'Branche',
    size: [160, 60],
    outline: 'rect',
    style: { fill: '#ffedd5', stroke: '#fb923c', color: '#7c2d12', radius: 14 },
    text: 'Branche',
    Body: ({ w, h, s }) => <rect x={0} y={0} width={w} height={h} rx={Math.min(s.radius, h / 2)} {...skin(s)} />,
  },
  mindSubtopic: {
    name: 'Sous-branche',
    size: [140, 40],
    outline: 'rect',
    style: { fill: 'none', stroke: '#fb923c', strokeWidth: 2, color: '#0f172a', radius: 0 },
    text: 'Sous-branche',
    Body: ({ w, h, s }) => (
      <line x1={0} y1={h} x2={w} y2={h} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap="round" />
    ),
    textRect: ({ w, h }) => ({ x: 4, y: 0, w: w - 8, h: h - 4 }),
  },
};

export const FALLBACK_SHAPE = 'rectangle';

export function shapeDef(id: string): ShapeDef {
  return shapes[id] ?? shapes[FALLBACK_SHAPE];
}

export function renderShapeBody(node: DiagramNode): ReactNode {
  const def = shapeDef(node.shape);
  return def.Body({ node, w: node.w, h: node.h, s: node.style });
}

export function renderShapeText(node: DiagramNode): ReactNode {
  const def = shapeDef(node.shape);
  const props = { node, w: node.w, h: node.h, s: node.style };
  return def.Text ? def.Text(props) : GenericText(props);
}

/** Style complet d'une forme : défauts globaux + défauts de la forme + surcharges. */
export function styleFor(shapeId: string, overrides?: Partial<NodeStyle>): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...(shapes[shapeId]?.style ?? {}), ...(overrides ?? {}) };
}

/** Hauteur minimale nécessaire au texte de la forme. */
export function minHeightFor(node: DiagramNode): number {
  const def = shapeDef(node.shape);
  if (def.autoHeight) return def.autoHeight(node);
  const rect = def.textRect
    ? def.textRect({ node, w: node.w, h: node.h, s: node.style })
    : inset({ x: 0, y: 0, w: node.w, h: node.h }, 10);
  const padding = node.h - rect.h;
  return textHeight(node.text, rect.w, node.style.fontSize, node.style.bold) + padding + 4;
}
