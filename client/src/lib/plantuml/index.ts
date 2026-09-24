import type { Diagram, DocumentKind } from '../../types';
import { findTitle, readLines, type SourceLine } from './source';
import { parseClassDiagram } from './class';
import { parseSequenceDiagram } from './sequence';
import { parseUseCaseDiagram } from './usecase';
import { parseMindmap } from './mindmap';

export interface PlantUmlResult {
  kind: DocumentKind;
  name: string;
  diagram: Diagram;
  /** Lignes ignorées ou approximées, signalées à l'utilisateur. */
  warnings: string[];
}

const CLASS_SIGNS = [/^\s*(abstract\s+)?(class|interface|enum|entity|struct|protocol)\s+/i, /<\|[-.]|[-.]\|>|\*[-.]{2}|[-.]{2}\*|o[-.]{2}|[-.]{2}o/];
const SEQUENCE_SIGNS = [/^\s*(participant|activate|deactivate|autonumber)\b/i, /^\s*(alt|opt|loop|par|critical|group)\b/i];
const USECASE_SIGNS = [/^\s*usecase\s+/i, /^\s*\([^)]+\)/, /^\s*(rectangle|frame)\s+.*\{/i];
const ACTIVITY_SIGNS = [/^\s*(start|stop|end|:.*;)\s*$/i, /^\s*(if|while|fork|repeat)\s*\(/i];

/** Choisit l'analyseur à partir d'indices francs, puis de la forme des flèches. */
export function detectKind(source: string, lines: SourceLine[]): DocumentKind | null {
  if (/@start(mindmap|wbs)/i.test(source)) return 'mindmap';
  if (lines.length && lines.every((l) => /^[*+-]+[_\s]/.test(l.text) || /^(left|right) side$/i.test(l.text))) {
    return 'mindmap';
  }

  const score = (patterns: RegExp[]) =>
    lines.reduce((sum, l) => sum + (patterns.some((p) => p.test(l.text)) ? 1 : 0), 0);

  const classScore = score(CLASS_SIGNS);
  const sequenceScore = score(SEQUENCE_SIGNS);
  const usecaseScore = score(USECASE_SIGNS);

  if (Math.max(classScore, sequenceScore, usecaseScore) > 0) {
    if (classScore >= sequenceScore && classScore >= usecaseScore) return 'uml-class';
    if (sequenceScore >= usecaseScore) return 'uml-sequence';
    return 'uml-usecase';
  }
  if (score(ACTIVITY_SIGNS) > 0) return null;
  // Sans indice franc : des messages étiquetés désignent une séquence.
  if (lines.some((l) => /^\S+\s*<?-+>?\s*\S+\s*:/.test(l.text))) return 'uml-sequence';
  if (lines.some((l) => /[-.]{2}/.test(l.text))) return 'uml-class';
  return null;
}

const DEFAULT_NAMES: Record<string, string> = {
  'uml-class': 'Diagramme de classes',
  'uml-sequence': 'Diagramme de séquence',
  'uml-usecase': "Diagramme de cas d'utilisation",
  mindmap: 'Carte mentale',
};

export function parsePlantUml(source: string): PlantUmlResult {
  const lines = readLines(source);
  if (!lines.length) throw new Error('Le texte est vide.');

  const kind = detectKind(source, lines);
  if (!kind) {
    throw new Error(
      "Type de diagramme non reconnu. Sont pris en charge : classes, séquence, cas d'utilisation et carte mentale.",
    );
  }

  const warnings: string[] = [];
  const warn = (message: string) => {
    if (warnings.length < 12 && !warnings.includes(message)) warnings.push(message);
  };

  const content = lines.filter((l) => !/^title\s+/i.test(l.text));
  let diagram: Diagram;
  switch (kind) {
    case 'mindmap':
      diagram = parseMindmap(content, warn);
      break;
    case 'uml-sequence':
      diagram = parseSequenceDiagram(content, warn);
      break;
    case 'uml-usecase':
      diagram = parseUseCaseDiagram(content, warn);
      break;
    default:
      diagram = parseClassDiagram(content, warn);
  }

  if (!diagram.nodes.length) throw new Error("Aucune forme n'a pu être tirée de ce texte.");
  return { kind, name: findTitle(lines) ?? DEFAULT_NAMES[kind], diagram, warnings };
}
