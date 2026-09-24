import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Rect } from '../types';
import { FONT_STACK, MONO_STACK } from '../lib/text';

interface Props {
  /** Rectangle d'édition, en coordonnées écran. */
  rect: Rect;
  value: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  /** Entrée valide la saisie (formes) ou insère un saut de ligne (compartiments). */
  multiline: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function TextOverlay({
  rect,
  value,
  fontSize,
  color,
  align,
  bold,
  italic,
  mono,
  multiline,
  onCommit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  const commitRef = useRef(onCommit);
  const settled = useRef(false);
  draftRef.current = draft;
  commitRef.current = onCommit;

  useEffect(() => setDraft(value), [value]);

  /** Une seule validation, quelle que soit la porte de sortie. */
  const finish = (next: string) => {
    if (settled.current) return;
    settled.current = true;
    commitRef.current(next);
  };

  // Cliquer ailleurs démonte la zone de saisie sans passer par `blur` :
  // sans cette validation de sortie, le texte tapé serait perdu.
  useEffect(
    () => () => {
      if (!settled.current) commitRef.current(draftRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <textarea
      ref={ref}
      className="text-overlay"
      value={draft}
      spellCheck={false}
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(rect.w, 40),
        height: Math.max(rect.h, fontSize * 1.6),
        fontSize,
        color,
        textAlign: align,
        fontWeight: bold ? 600 : 400,
        fontStyle: italic ? 'italic' : 'normal',
        fontFamily: mono ? MONO_STACK : FONT_STACK,
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          settled.current = true;
          onCancel();
        } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey) && !e.shiftKey) {
          e.preventDefault();
          finish(draft);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(draft);
        }
      }}
    />
  );
}
