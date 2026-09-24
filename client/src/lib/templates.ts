import type { Anchor, Diagram, DiagramEdge, DiagramNode, DocumentKind, EdgeStyle, NodeStyle } from '../types';
import { DEFAULT_EDGE_STYLE } from '../types';
import { minHeightFor, shapeDef, styleFor } from '../shapes/registry';
import { uid } from './id';

interface NodeOpts {
  text?: string;
  w?: number;
  h?: number;
  style?: Partial<NodeStyle>;
  compartments?: string[];
  id?: string;
}

export function makeNode(shape: string, x: number, y: number, opts: NodeOpts = {}): DiagramNode {
  const def = shapeDef(shape);
  const node: DiagramNode = {
    id: opts.id ?? uid('n'),
    shape,
    x,
    y,
    w: opts.w ?? def.size[0],
    h: opts.h ?? def.size[1],
    text: opts.text ?? def.text ?? '',
    compartments: opts.compartments ?? (def.compartments ? [...def.compartments] : undefined),
    style: styleFor(shape, opts.style),
    container: def.container,
  };
  // Une forme à compartiments (classe, interface, énumération) épouse son contenu
  // plutôt que de laisser un compartiment vide s'étirer jusqu'en bas.
  if (def.autoHeight && opts.h === undefined) {
    node.h = Math.max(Math.ceil(minHeightFor(node)), 60);
  }
  return node;
}

interface EdgeOpts {
  label?: string;
  style?: Partial<EdgeStyle>;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
  /** Position du départ / de l'arrivée le long du côté (0 à 1). */
  fromT?: number;
  toT?: number;
  startLabel?: string;
  endLabel?: string;
}

export function makeEdge(fromId: string, toId: string, opts: EdgeOpts = {}): DiagramEdge {
  return {
    id: uid('e'),
    from: { nodeId: fromId, anchor: opts.fromAnchor ?? 'auto', t: opts.fromT },
    to: { nodeId: toId, anchor: opts.toAnchor ?? 'auto', t: opts.toT },
    label: opts.label ?? '',
    startLabel: opts.startLabel,
    endLabel: opts.endLabel,
    style: { ...DEFAULT_EDGE_STYLE, ...(opts.style ?? {}) },
  };
}

export interface TemplateDef {
  kind: DocumentKind;
  name: string;
  description: string;
  /** Groupe de formes ouvert par défaut dans le panneau de gauche. */
  palette: string;
  build: () => Diagram;
}

const mindmap = (): Diagram => {
  const root = makeNode('mindRoot', 420, 290, { text: 'Sujet principal' });
  const branches = [
    { text: 'Objectifs', x: 120, y: 170 },
    { text: 'Contraintes', x: 120, y: 420 },
    { text: 'Ressources', x: 740, y: 170 },
    { text: 'Étapes', x: 740, y: 420 },
  ].map((b) => makeNode('mindTopic', b.x, b.y, { text: b.text }));

  const leaves = [
    makeNode('mindSubtopic', 100, 100, { text: 'Court terme' }),
    makeNode('mindSubtopic', 100, 500, { text: 'Budget' }),
    makeNode('mindSubtopic', 760, 100, { text: 'Équipe' }),
    makeNode('mindSubtopic', 760, 500, { text: 'Jalons' }),
  ];

  const curved: Partial<EdgeStyle> = { routing: 'curved', end: 'none', stroke: '#fb923c', strokeWidth: 2.5 };
  const edges = [
    ...branches.map((b) => makeEdge(root.id, b.id, { style: curved })),
    ...leaves.map((leaf, i) => makeEdge(branches[i].id, leaf.id, { style: { ...curved, strokeWidth: 2 } })),
  ];
  return { nodes: [root, ...branches, ...leaves], edges };
};

const flowchart = (): Diagram => {
  // Tout est centré sur un axe unique (x = 450), les deux branches en miroir.
  const start = makeNode('stadium', 370, 80, { text: 'Début' });
  const step = makeNode('roundRect', 370, 190, { text: 'Saisir la demande' });
  const test = makeNode('diamond', 370, 330, { text: 'Demande valide ?' });
  const ok = makeNode('roundRect', 610, 490, { text: 'Enregistrer' });
  const ko = makeNode('roundRect', 130, 490, { text: 'Afficher l’erreur' });
  const end = makeNode('stadium', 370, 640, { text: 'Fin' });
  return {
    nodes: [start, step, test, ok, ko, end],
    edges: [
      makeEdge(start.id, step.id),
      makeEdge(step.id, test.id),
      makeEdge(test.id, ok.id, { label: 'oui' }),
      makeEdge(test.id, ko.id, { label: 'non' }),
      makeEdge(ok.id, end.id),
      makeEdge(ko.id, end.id),
    ],
  };
};

const umlClass = (): Diagram => {
  const base = makeNode('umlClass', 375, 80, {
    text: 'Personne',
    compartments: ['- nom : String\n- age : int', '+ sePresenter() : void'],
  });
  const child = makeNode('umlClass', 130, 330, {
    text: 'Etudiant',
    compartments: ['- numero : String', '+ sInscrire(c : Cours) : void'],
  });
  const other = makeNode('umlClass', 620, 330, {
    text: 'Enseignant',
    compartments: ['- matiere : String', '+ noter(e : Etudiant) : void'],
  });
  const iface = makeNode('umlInterface', 620, 80, {
    text: 'Identifiable',
    compartments: ['+ identifiant() : String'],
  });
  const course = makeNode('umlClass', 130, 560, {
    text: 'Cours',
    compartments: ['- intitule : String', '+ ajouter(e : Etudiant) : void'],
  });
  return {
    nodes: [base, child, other, iface, course],
    edges: [
      makeEdge(child.id, base.id, { style: { end: 'triangle-open' } }),
      makeEdge(other.id, base.id, { style: { end: 'triangle-open' } }),
      makeEdge(base.id, iface.id, { style: { end: 'triangle-open', dash: 'dashed' } }),
      makeEdge(child.id, course.id, {
        label: 'suit',
        startLabel: '0..*',
        endLabel: '1..*',
        style: { end: 'none', start: 'diamond-open' },
      }),
    ],
  };
};

const umlSequence = (): Diagram => {
  const lifelines = [
    makeNode('lifeline', 120, 90, { text: ':Utilisateur', style: { fill: '#fff7ed', stroke: '#ea580c' } }),
    makeNode('lifeline', 400, 90, { text: ':Interface' }),
    makeNode('lifeline', 680, 90, { text: ':Service' }),
  ];
  // Barres d'activation centrées sur leur ligne de vie.
  const bars = [makeNode('activation', 462, 170, { h: 200 }), makeNode('activation', 742, 220, { h: 100 })];

  // Un message est posé à une hauteur absolue, convertie en fraction de la forme :
  // les flèches restent horizontales même si les tailles par défaut changent.
  const at = (node: DiagramNode, y: number) => (y - node.y) / node.h;
  const call: Partial<EdgeStyle> = { routing: 'straight', end: 'triangle' };
  const reply: Partial<EdgeStyle> = { routing: 'straight', end: 'arrow-thin', dash: 'dashed' };

  return {
    nodes: [...lifelines, ...bars],
    edges: [
      makeEdge(lifelines[0].id, bars[0].id, {
        label: 'soumettre()', style: call,
        fromAnchor: 'e', fromT: at(lifelines[0], 190), toAnchor: 'w', toT: at(bars[0], 190),
      }),
      makeEdge(bars[0].id, bars[1].id, {
        label: 'valider(données)', style: call,
        fromAnchor: 'e', fromT: at(bars[0], 240), toAnchor: 'w', toT: at(bars[1], 240),
      }),
      makeEdge(bars[1].id, bars[0].id, {
        label: 'résultat', style: reply,
        fromAnchor: 'w', fromT: at(bars[1], 300), toAnchor: 'e', toT: at(bars[0], 300),
      }),
      makeEdge(bars[0].id, lifelines[0].id, {
        label: 'confirmation', style: reply,
        fromAnchor: 'w', fromT: at(bars[0], 350), toAnchor: 'e', toT: at(lifelines[0], 350),
      }),
    ],
  };
};

const umlUseCase = (): Diagram => {
  const frame = makeNode('boundary', 260, 70, { text: 'Plateforme de réservation', w: 620, h: 410 });
  // Les acteurs sont alignés sur le cas d'utilisation qu'ils déclenchent.
  const actor = makeNode('actor', 120, 180, { text: 'Client' });
  const admin = makeNode('actor', 950, 370, { text: 'Administrateur' });
  const search = makeNode('useCase', 330, 130, { text: 'Rechercher un trajet', w: 200 });
  const book = makeNode('useCase', 330, 250, { text: 'Réserver un billet', w: 200 });
  const manage = makeNode('useCase', 330, 380, { text: 'Gérer les offres', w: 200 });
  const pay = makeNode('useCase', 610, 250, { text: 'Payer en ligne', w: 200 });
  const line: Partial<EdgeStyle> = { end: 'none', routing: 'straight' };
  return {
    nodes: [frame, actor, admin, search, book, manage, pay],
    edges: [
      makeEdge(actor.id, search.id, { style: line }),
      makeEdge(actor.id, book.id, { style: line }),
      makeEdge(admin.id, manage.id, { style: line }),
      makeEdge(book.id, pay.id, {
        label: '«include»',
        style: { end: 'arrow-thin', dash: 'dashed', routing: 'straight' },
      }),
    ],
  };
};

const umlActivity = (): Diagram => {
  const action = (x: number, y: number, text: string, accent = '#2563eb', fill = '#eff6ff') =>
    makeNode('roundRect', x, y, { text, style: { fill, stroke: accent, radius: 14 } });

  // Axe unique à x = 410. Les nœuds de contrôle (initial, décision, bifurcation,
  // final) restent petits : en UML ils marquent le flux, ils ne le portent pas —
  // les conditions se lisent sur les flèches.
  const start = makeNode('startNode', 395, 60);
  const check = action(330, 130, 'Vérifier le stock');
  const test = makeNode('diamond', 380, 260, { text: '', w: 60, h: 60 });
  const restock = action(640, 250, 'Réapprovisionner', '#dc2626', '#fef2f2');
  const fork = makeNode('bar', 230, 400, { w: 360 });
  const prep = action(230, 450, 'Préparer le colis');
  const invoice = action(430, 450, 'Éditer la facture');
  const join = makeNode('bar', 230, 580, { w: 360 });
  const end = makeNode('endNode', 395, 650);

  return {
    nodes: [start, check, test, restock, fork, prep, invoice, join, end],
    edges: [
      makeEdge(start.id, check.id),
      makeEdge(check.id, test.id),
      makeEdge(test.id, fork.id, { label: '[en stock]' }),
      makeEdge(test.id, restock.id, { label: '[rupture]' }),
      makeEdge(restock.id, check.id),
      makeEdge(fork.id, prep.id),
      makeEdge(fork.id, invoice.id),
      makeEdge(prep.id, join.id),
      makeEdge(invoice.id, join.id),
      makeEdge(join.id, end.id),
    ],
  };
};

export const TEMPLATES: TemplateDef[] = [
  {
    kind: 'blank',
    name: 'Document vierge',
    description: 'Partez d’une toile vide.',
    palette: 'general',
    build: () => ({ nodes: [], edges: [] }),
  },
  {
    kind: 'mindmap',
    name: 'Carte mentale',
    description: 'Une idée centrale et ses branches.',
    palette: 'mindmap',
    build: mindmap,
  },
  {
    kind: 'flowchart',
    name: 'Organigramme',
    description: 'Processus avec décisions.',
    palette: 'flowchart',
    build: flowchart,
  },
  {
    kind: 'uml-class',
    name: 'UML · Diagramme de classes',
    description: 'Classes, héritage et associations.',
    palette: 'uml-class',
    build: umlClass,
  },
  {
    kind: 'uml-sequence',
    name: 'UML · Diagramme de séquence',
    description: 'Lignes de vie et messages.',
    palette: 'uml-sequence',
    build: umlSequence,
  },
  {
    kind: 'uml-usecase',
    name: "UML · Cas d'utilisation",
    description: 'Acteurs, cas et frontière système.',
    palette: 'uml-usecase',
    build: umlUseCase,
  },
  {
    kind: 'uml-activity',
    name: 'UML · Diagramme d’activité',
    description: 'Flux, décisions et parallélisme.',
    palette: 'uml-activity',
    build: umlActivity,
  },
];

export const templateFor = (kind: DocumentKind) =>
  TEMPLATES.find((t) => t.kind === kind) ?? TEMPLATES[0];
