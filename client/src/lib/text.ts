export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const MONO_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const LINE_HEIGHT = 1.35;

let ctx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

function context(): CanvasRenderingContext2D {
  if (!ctx) {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d')!;
  }
  return ctx;
}

export function fontString(size: number, bold = false, italic = false, mono = false): string {
  return `${italic ? 'italic ' : ''}${bold ? '600' : '400'} ${size}px ${mono ? MONO_STACK : FONT_STACK}`;
}

export function measure(text: string, font: string): number {
  const key = `${font}\u0000${text}`;
  let cached = widthCache.get(key);
  if (cached === undefined) {
    const c = context();
    c.font = font;
    cached = c.measureText(text).width;
    // Le cache est borné : les diagrammes changent en continu pendant l'édition.
    if (widthCache.size > 6000) widthCache.clear();
    widthCache.set(key, cached);
  }
  return cached;
}

/** Découpe un texte en lignes tenant dans `maxWidth`, en respectant les retours explicites. */
export function wrapText(text: string, maxWidth: number, font: string): string[] {
  if (!text) return [];
  const limit = Math.max(maxWidth, 16);
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    if (measure(paragraph, font) <= limit) {
      lines.push(paragraph);
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue;
      const candidate = current + word;
      if (measure(candidate, font) <= limit || !current.trim()) {
        current = candidate;
        continue;
      }
      lines.push(current.trimEnd());
      current = word.trimStart();
    }
    // Mot unique plus large que la forme : coupe caractère par caractère.
    for (const line of splitOverflow(current, limit, font)) lines.push(line);
  }
  return lines;
}

function splitOverflow(line: string, limit: number, font: string): string[] {
  if (measure(line, font) <= limit) return [line];
  const out: string[] = [];
  let current = '';
  for (const char of line) {
    if (current && measure(current + char, font) > limit) {
      out.push(current);
      current = '';
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

export function textBlockHeight(lineCount: number, fontSize: number): number {
  return lineCount * fontSize * LINE_HEIGHT;
}
