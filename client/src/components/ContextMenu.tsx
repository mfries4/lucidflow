import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Point } from '../types';
import { useEditor } from '../store/editor';

interface Props {
  at: Point;
  worldAt: Point;
  onClose: () => void;
}

export function ContextMenu({ at, worldAt, onClose }: Props) {
  const state = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const hasSelection = state.selection.length > 0;
  const single = state.selection.length === 1;

  // Replié vers l'intérieur si le menu déborderait de la fenêtre.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8)),
    });
  }, [at]);

  useEffect(() => {
    const close = () => onClose();
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {single && (
        <button type="button" onClick={run(() => state.setEditing({ id: state.selection[0], field: 'text' }))}>
          Modifier le texte
        </button>
      )}
      <button type="button" disabled={!hasSelection} onClick={run(state.copySelection)}>Copier</button>
      <button type="button" onClick={run(() => state.paste(worldAt))}>Coller ici</button>
      <button type="button" disabled={!hasSelection} onClick={run(state.duplicateSelection)}>Dupliquer</button>
      <hr />
      <button type="button" disabled={!hasSelection} onClick={run(() => state.reorder('front'))}>Premier plan</button>
      <button type="button" disabled={!hasSelection} onClick={run(() => state.reorder('back'))}>Arrière-plan</button>
      <hr />
      <button type="button" onClick={run(state.selectAll)}>Tout sélectionner</button>
      <button type="button" className="danger" disabled={!hasSelection} onClick={run(state.deleteSelection)}>
        Supprimer
      </button>
    </div>
  );
}
