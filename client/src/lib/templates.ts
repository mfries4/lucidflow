import type { Anchor, Diagram, DiagramEdge, DiagramNode, DocumentKind, EdgeStyle, NodeStyle } from '../types';
import { DEFAULT_EDGE_STYLE } from '../types';
import { shapeDef, styleFor } from '../shapes/registry';
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
  return {
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
  const root = makeNode('mindRoot', 430, 300, { text: 'Sujet principal' });
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
  const start = makeNode('stadium', 380, 80, { text: 'Début' });
  const step = makeNode('roundRect', 370, 200, { text: 'Saisir la demande' });
  const test = makeNode('diamond', 375, 340, { text: 'Demande valide ?' });
  const ok = makeNode('roundRect', 620, 500, { text: 'Enregistrer' });
  const ko = makeNode('roundRect', 120, 500, { text: 'Afficher l’erreur' });
  const end = makeNode('stadium', 380, 650, { text: 'Fin' });
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
  const base = makeNode('umlClass', 380, 80, {
    text: 'Personne',
    compartments: ['- nom : String\n- age : int', '+ sePresenter() : void'],
    h: 150,
  });
  const child = makeNode('umlClass', 130, 330, {
    text: 'Etudiant',
    compartments: ['- numero : String', '+ sInscrire(c : Cours) : void'],
    h: 140,
  });
  const other = makeNode('umlClass', 620, 330, {
    text: 'Enseignant',
    compartments: ['- matiere : String', '+ noter(e : Etudiant) : void'],
    h: 140,
  });
  const iface = makeNode('umlInterface', 620, 80, {
    text: 'Identifiable',
    compartments: ['+ identifiant() : String'],
    h: 110,
  });
  const course = makeNode('umlClass', 130, 560, {
    text: 'Cours',
    compartments: ['- intitule : String', '+ ajouter(e : Etudiant) : void'],
    h: 130,
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
  const bars = [makeNode('activation', 467, 170, { h: 200 }), makeNode('activation', 747, 220, { h: 100 })];
  const call: Partial<EdgeStyle> = { routing: 'straight', end: 'triangle' };
  const reply: Partial<EdgeStyle> = { routing: 'straight', end: 'arrow-thin', dash: 'dashed' };

  // Chaque message occupe sa propre hauteur : c'est la lecture chronologique.
  return {
    nodes: [...lifelines, ...bars],
    edges: [
      makeEdge(lifelines[0].id, bars[0].id, {
        label: 'soumettre()', style: call, fromAnchor: 'e', fromT: 0.31, toAnchor: 'w', toT: 0.1,
      }),
      makeEdge(bars[0].id, bars[1].id, {
        label: 'valider(données)', style: call, fromAnchor: 'e', fromT: 0.35, toAnchor: 'w', toT: 0.2,
      }),
      makeEdge(bars[1].id, bars[0].id, {
        label: 'résultat', style: reply, fromAnchor: 'w', fromT: 0.8, toAnchor: 'e', toT: 0.65,
      }),
      makeEdge(bars[0].id, lifelines[0].id, {
        label: 'confirmation', style: reply, fromAnchor: 'w', fromT: 0.9, toAnchor: 'e', toT: 0.81,
      }),
    ],
  };
};

const umlUseCase = (): Diagram => {
  const frame = makeNode('boundary', 260, 70, { text: 'Plateforme de réservation', w: 620, h: 460 });
  const actor = makeNode('actor', 120, 210, { text: 'Client' });
  const admin = makeNode('actor', 950, 300, { text: 'Administrateur' });
  const search = makeNode('useCase', 330, 130, { text: 'Rechercher un trajet', w: 210 });
  const book = makeNode('useCase', 330, 250, { text: 'Réserver un billet', w: 210 });
  const manage = makeNode('useCase', 330, 380, { text: 'Gérer les offres', w: 210 });
  const pay = makeNode('useCase', 610, 250, { text: 'Payer en ligne', w: 210 });
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
  const start = makeNode('startNode', 400, 60);
  const action = makeNode('roundRect', 330, 150, {
    text: 'Recevoir la commande',
    style: { fill: '#eff6ff', stroke: '#2563eb', radius: 14 },
  });
  const test = makeNode('diamond', 348, 290, { text: 'En stock ?' });
  const fork = makeNode('bar', 220, 430, { w: 400 });
  const prep = makeNode('roundRect', 150, 490, { text: 'Préparer le colis', style: { fill: '#eff6ff', stroke: '#2563eb', radius: 14 } });
  const invoice = makeNode('roundRect', 420, 490, { text: 'Éditer la facture', style: { fill: '#eff6ff', stroke: '#2563eb', radius: 14 } });
  const join = makeNode('bar', 220, 620, { w: 400 });
  const restock = makeNode('roundRect', 660, 290, { text: 'Réapprovisionner', style: { fill: '#fef2f2', stroke: '#dc2626', radius: 14 } });
  const end = makeNode('endNode', 400, 700);
  return {
    nodes: [start, action, test, fork, prep, invoice, join, restock, end],
    edges: [
      makeEdge(start.id, action.id),
      makeEdge(action.id, test.id),
      makeEdge(test.id, fork.id, { label: 'oui' }),
      makeEdge(test.id, restock.id, { label: 'non' }),
      makeEdge(restock.id, action.id),
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
