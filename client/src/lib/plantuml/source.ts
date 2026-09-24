/** Outils communs aux quatre analyseurs PlantUML. */

export interface SourceLine {
  /** Numéro dans le texte d'origine, pour situer les avertissements. */
  n: number;
  text: string;
}

const IGNORED = [
  'skinparam', 'skin ', 'hide', 'show', 'scale', 'autonumber', 'footer', 'header',
  'legend', 'end legend', 'caption', '!include', '!define', '!theme', '!pragma',
  'left to right direction', 'top to bottom direction', 'allow_mixing', 'allowmixing',
];

/** Retire commentaires, directives de mise en forme et bornes @start/@end. */
export function readLines(source: string): SourceLine[] {
  const out: SourceLine[] = [];
  let inBlockComment = false;

  source.split(/\r?\n/).forEach((raw, i) => {
    let text = raw.trim();
    if (inBlockComment) {
      if (text.endsWith("'/")) inBlockComment = false;
      return;
    }
    if (text.startsWith("/'")) {
      if (!text.endsWith("'/")) inBlockComment = true;
      return;
    }
    if (!text || text.startsWith("'") || text.startsWith('#!')) return;
    if (/^@(start|end)\w*/i.test(text)) return;
    const lower = text.toLowerCase();
    if (IGNORED.some((d) => lower.startsWith(d))) return;
    // Couleurs et balises de style en fin de ligne : sans effet ici.
    text = text.replace(/\s+#[0-9a-zA-Z_|\\/;]+$/, '');
    out.push({ n: i + 1, text });
  });
  return out;
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^"(.*)"$/.exec(trimmed) ?? /^'(.*)'$/.exec(trimmed);
  return (quoted ? quoted[1] : trimmed).trim();
}

/** `title Ma fresque` en tête de fichier. */
export function findTitle(lines: SourceLine[]): string | null {
  const line = lines.find((l) => /^title\s+/i.test(l.text));
  return line ? unquote(line.text.replace(/^title\s+/i, '')) : null;
}

export interface Relation {
  left: string;
  right: string;
  arrow: string;
  leftLabel?: string;
  rightLabel?: string;
  label?: string;
}

const ARROW_ONLY = /^[-.=<>|*o+#^\\/]+$/;
const ARROW_INSIDE = /([<*o+#]?\|?[-.=]{1,}(?:up|down|left|right|u|d|l|r)?[-.=]*\|?[>*o+#]?)/;

/**
 * Découpe « A "1" *-- "0..*" B : contient » en ses morceaux.
 * Deux passes : par jetons séparés d'espaces, puis par recherche de la flèche
 * collée aux identifiants (PlantUML autorise « A<|--B »).
 */
export function splitRelation(text: string): Relation | null {
  let body = text;
  let label: string | undefined;
  const colon = body.indexOf(':');
  if (colon >= 0) {
    label = body.slice(colon + 1).trim() || undefined;
    body = body.slice(0, colon).trim();
  }

  const parts = body.split(/\s+/);
  let index = parts.findIndex((p) => ARROW_ONLY.test(p) && /[-.=]/.test(p));
  if (index > 0) {
    const arrow = parts[index];
    const before = parts.slice(0, index);
    const after = parts.slice(index + 1);
    if (!before.length || !after.length) return null;
    return {
      arrow,
      left: unquote(before[0]),
      leftLabel: before.length > 1 ? unquote(before.slice(1).join(' ')) : undefined,
      right: unquote(after[after.length - 1]),
      rightLabel: after.length > 1 ? unquote(after.slice(0, -1).join(' ')) : undefined,
      label,
    };
  }

  // Flèche collée : « A<|--B »
  const m = ARROW_INSIDE.exec(body);
  if (!m || m.index === 0) return null;
  const arrow = m[1];
  const left = body.slice(0, m.index).trim();
  const right = body.slice(m.index + arrow.length).trim();
  if (!left || !right || !/[-.=]/.test(arrow)) return null;
  return { arrow, left: unquote(left), right: unquote(right), label };
}

/** Enlève les indications de direction : `-up->` devient `-->`. */
export function normalizeArrow(arrow: string): string {
  return arrow.replace(/(up|down|left|right)/gi, '').replace(/(?<=[-.=])[udlr](?=[-.=])/gi, '');
}
