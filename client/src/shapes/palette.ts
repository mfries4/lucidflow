import type { EdgeStyle, NodeStyle } from '../types';

export interface PaletteItem {
  shape: string;
  label?: string;
  text?: string;
  size?: [number, number];
  style?: Partial<NodeStyle>;
}

export interface PaletteGroup {
  id: string;
  label: string;
  items: PaletteItem[];
}

export const PALETTE: PaletteGroup[] = [
  {
    id: 'general',
    label: 'Général',
    items: [
      { shape: 'roundRect', text: '' },
      { shape: 'rectangle', text: '' },
      { shape: 'ellipse', text: '' },
      { shape: 'circle', text: '' },
      { shape: 'diamond', label: 'Losange', text: '' },
      { shape: 'triangle', text: '' },
      { shape: 'hexagon', text: '' },
      { shape: 'parallelogram', label: 'Parallélogramme', text: '' },
      { shape: 'cylinder', text: '' },
      { shape: 'note', text: 'Note' },
      { shape: 'sticky', text: '' },
      { shape: 'textBox', text: 'Texte' },
    ],
  },
  {
    id: 'flowchart',
    label: 'Organigramme',
    items: [
      { shape: 'stadium', label: 'Début / Fin', text: 'Début' },
      { shape: 'roundRect', label: 'Étape', text: 'Étape' },
      { shape: 'diamond', label: 'Décision', text: 'Condition ?' },
      { shape: 'parallelogram', label: 'Entrée / Sortie', text: 'Entrée' },
      { shape: 'predefined', label: 'Sous-programme', text: 'Sous-programme' },
      { shape: 'document', text: 'Document' },
      { shape: 'cylinder', label: 'Stockage', text: 'Données' },
      { shape: 'circle', label: 'Connecteur', text: 'A', size: [50, 50] },
    ],
  },
  {
    id: 'mindmap',
    label: 'Carte mentale',
    items: [
      { shape: 'mindRoot', label: 'Idée centrale' },
      { shape: 'mindTopic', label: 'Branche' },
      { shape: 'mindSubtopic', label: 'Sous-branche' },
      { shape: 'sticky', label: 'Idée', text: 'Idée' },
      { shape: 'note', label: 'Remarque', text: 'Remarque' },
    ],
  },
  {
    id: 'uml-class',
    label: 'UML · Classe',
    items: [
      { shape: 'umlClass', label: 'Classe' },
      { shape: 'umlClass', label: 'Classe abstraite', text: 'ClasseAbstraite', style: { italic: true } },
      { shape: 'umlInterface', label: 'Interface' },
      { shape: 'umlEnum', label: 'Énumération' },
      { shape: 'umlComponent', label: 'Composant', text: 'Composant' },
      { shape: 'umlPackage', label: 'Paquetage' },
      { shape: 'note', label: 'Note UML', text: 'Note' },
    ],
  },
  {
    id: 'uml-sequence',
    label: 'UML · Séquence',
    items: [
      { shape: 'lifeline', label: 'Ligne de vie' },
      { shape: 'lifeline', label: 'Acteur (ligne)', text: ':Utilisateur', style: { fill: '#fff7ed', stroke: '#ea580c' } },
      { shape: 'activation', label: 'Barre d’activation' },
      { shape: 'fragment', label: 'Fragment alt', text: 'alt' },
      { shape: 'fragment', label: 'Fragment loop', text: 'loop' },
      { shape: 'note', label: 'Note', text: 'Note' },
    ],
  },
  {
    id: 'uml-usecase',
    label: "UML · Cas d'utilisation",
    items: [
      { shape: 'actor', label: 'Acteur' },
      { shape: 'useCase', label: "Cas d'utilisation" },
      { shape: 'boundary', label: 'Frontière système' },
      { shape: 'note', label: 'Note', text: 'Note' },
    ],
  },
  {
    id: 'uml-activity',
    label: 'UML · Activité',
    items: [
      { shape: 'startNode', label: 'Nœud initial' },
      { shape: 'roundRect', label: 'Action', text: 'Action', style: { fill: '#eff6ff', stroke: '#2563eb', radius: 14 } },
      { shape: 'diamond', label: 'Décision / Fusion', text: '', size: [60, 60] },
      { shape: 'bar', label: 'Bifurcation', text: '' },
      { shape: 'bar', label: 'Jonction (vertical)', text: '', size: [6, 140] },
      { shape: 'endNode', label: 'Nœud final' },
      { shape: 'parallelogram', label: 'Objet', text: 'Objet' },
    ],
  },
];

export interface EdgePreset {
  id: string;
  label: string;
  hint: string;
  style: Partial<EdgeStyle>;
}

/** Relations prêtes à l'emploi, notamment la notation UML. */
export const EDGE_PRESETS: EdgePreset[] = [
  { id: 'flow', label: 'Flux', hint: 'Flèche simple', style: { end: 'arrow', dash: 'solid', start: 'none' } },
  { id: 'line', label: 'Trait', hint: 'Association sans pointe', style: { end: 'none', start: 'none', dash: 'solid' } },
  {
    id: 'association',
    label: 'Association dirigée',
    hint: 'UML : association navigable',
    style: { end: 'arrow-thin', start: 'none', dash: 'solid' },
  },
  {
    id: 'inheritance',
    label: 'Héritage',
    hint: 'UML : généralisation',
    style: { end: 'triangle-open', start: 'none', dash: 'solid' },
  },
  {
    id: 'realization',
    label: 'Réalisation',
    hint: 'UML : implémentation d’interface',
    style: { end: 'triangle-open', start: 'none', dash: 'dashed' },
  },
  {
    id: 'dependency',
    label: 'Dépendance',
    hint: 'UML : trait pointillé',
    style: { end: 'arrow-thin', start: 'none', dash: 'dashed' },
  },
  {
    id: 'aggregation',
    label: 'Agrégation',
    hint: 'UML : losange creux',
    style: { start: 'diamond-open', end: 'none', dash: 'solid' },
  },
  {
    id: 'composition',
    label: 'Composition',
    hint: 'UML : losange plein',
    style: { start: 'diamond', end: 'none', dash: 'solid' },
  },
  {
    id: 'message',
    label: 'Message',
    hint: 'Séquence : appel synchrone',
    style: { end: 'triangle', start: 'none', dash: 'solid', routing: 'straight' },
  },
  {
    id: 'reply',
    label: 'Retour',
    hint: 'Séquence : réponse',
    style: { end: 'arrow-thin', start: 'none', dash: 'dashed', routing: 'straight' },
  },
  {
    id: 'include',
    label: '«include»',
    hint: "Cas d'utilisation",
    style: { end: 'arrow-thin', start: 'none', dash: 'dashed', routing: 'straight' },
  },
];
