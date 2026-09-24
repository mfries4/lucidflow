export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'n' | 'e' | 's' | 'w';
export type Anchor = Side | 'auto';
export type Dash = 'solid' | 'dashed' | 'dotted';
export type Outline = 'rect' | 'ellipse' | 'diamond';

export type Marker =
  | 'none'
  | 'arrow'
  | 'arrow-thin'
  | 'triangle'
  | 'triangle-open'
  | 'diamond'
  | 'diamond-open'
  | 'circle'
  | 'circle-open';

export type Routing = 'orthogonal' | 'straight' | 'curved';

export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  color: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  opacity: number;
  radius: number;
}

export interface DiagramNode {
  id: string;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Compartiments UML (attributs, méthodes…), une chaîne multiligne par compartiment. */
  compartments?: string[];
  style: NodeStyle;
  /** Un conteneur (paquet, frontière du système) passe derrière et n'attrape pas les clics au centre. */
  container?: boolean;
  locked?: boolean;
}

export interface EdgeEnd {
  /** Rattaché à une forme, sinon point libre. */
  nodeId?: string;
  anchor?: Anchor;
  /** Position le long du côté d'ancrage, de 0 à 1 (0,5 = milieu). */
  t?: number;
  x?: number;
  y?: number;
}

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  start: Marker;
  end: Marker;
  routing: Routing;
  fontSize: number;
  color: string;
}

export interface DiagramEdge {
  id: string;
  from: EdgeEnd;
  to: EdgeEnd;
  label: string;
  /** Étiquettes de cardinalité/rôle aux extrémités (UML). */
  startLabel?: string;
  endLabel?: string;
  style: EdgeStyle;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export type DocumentKind =
  | 'blank'
  | 'mindmap'
  | 'flowchart'
  | 'uml-class'
  | 'uml-sequence'
  | 'uml-usecase'
  | 'uml-activity';

export interface DocumentSummary {
  id: string;
  name: string;
  kind: DocumentKind;
  preview: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentFull extends DocumentSummary {
  data: Diagram;
}

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fill: '#ffffff',
  stroke: '#334155',
  strokeWidth: 2,
  dash: 'solid',
  color: '#0f172a',
  fontSize: 14,
  bold: false,
  italic: false,
  align: 'center',
  valign: 'middle',
  opacity: 1,
  radius: 8,
};

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  stroke: '#475569',
  strokeWidth: 2,
  dash: 'solid',
  start: 'none',
  end: 'arrow',
  routing: 'orthogonal',
  fontSize: 12,
  color: '#334155',
};
