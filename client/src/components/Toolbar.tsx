import { useEffect, useRef, useState } from 'react';
import { useEditor, type SaveStatus } from '../store/editor';
import { Dropdown } from './Dropdown';
import { Icon } from './Icons';

interface Props {
  onBack: () => void;
  onImport: () => void;
  onCopyImage: () => Promise<void>;
  onExport: (format: 'png' | 'svg' | 'json') => void;
  onFit: () => void;
  onZoom: (zoom: number) => void;
  onSave: () => void;
  status: SaveStatus;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: 'Modifications non enregistrées',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Échec de l’enregistrement',
};

export function Toolbar({ onBack, onImport, onCopyImage, onExport, onFit, onZoom, onSave, status }: Props) {
  const state = useEditor();
  const zoomPercent = Math.round(state.camera.zoom * 100);
  // Aligner demande deux formes, répartir en demande trois.
  const picked = state.nodes.filter((n) => state.selection.includes(n.id)).length;
  const canAlign = picked >= 2;
  const canDistribute = picked >= 3;

  const [copy, setCopy] = useState<{ state: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({
    state: 'idle',
  });
  const resetTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copyImage = async () => {
    window.clearTimeout(resetTimer.current);
    setCopy({ state: 'busy' });
    try {
      await onCopyImage();
      setCopy({ state: 'done' });
      resetTimer.current = window.setTimeout(() => setCopy({ state: 'idle' }), 2200);
    } catch (error) {
      // La raison est affichée : sans elle, « Échec » n'apprend rien à personne.
      setCopy({ state: 'error', message: (error as Error).message });
      resetTimer.current = window.setTimeout(() => setCopy({ state: 'idle' }), 9000);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" className="tool-btn ghost" onClick={onBack} title="Retour aux documents">
          <Icon name="back" size={19} />
        </button>
        <span className="brand-mark" aria-hidden>◆</span>
        <input
          className="doc-name"
          value={state.name}
          onChange={(e) => state.setName(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value.trim()) state.setName('Sans titre');
          }}
          aria-label="Nom du document"
        />
        <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className={`tool-btn ${state.tool === 'select' ? 'active' : ''}`}
          title="Sélection (V)"
          onClick={() => state.setTool('select')}
        >
          <Icon name="cursor" />
        </button>
        <button
          type="button"
          className={`tool-btn ${state.tool === 'pan' ? 'active' : ''}`}
          title="Déplacer la vue (M)"
          onClick={() => state.setTool('pan')}
        >
          <Icon name="hand" />
        </button>
        <button
          type="button"
          className={`tool-btn ${state.tool === 'connect' ? 'active' : ''}`}
          title="Connecteur (C)"
          onClick={() => state.setTool('connect')}
        >
          <Icon name="connector" />
        </button>

        <span className="divider" />

        <button type="button" className="tool-btn" title="Annuler (Ctrl+Z)" disabled={!state.past.length} onClick={state.undo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="tool-btn" title="Rétablir (Ctrl+Maj+Z)" disabled={!state.future.length} onClick={state.redo}>
          <Icon name="redo" />
        </button>

        <span className="divider" />

        <Dropdown label={<><Icon name="layers" size={16} /> Disposition</>} title="Aligner et répartir">
          {(close) => (
            <>
              <button type="button" disabled={!canAlign} onClick={() => { state.align('left'); close(); }}>Aligner à gauche</button>
              <button type="button" disabled={!canAlign} onClick={() => { state.align('center-h'); close(); }}>Centrer horizontalement</button>
              <button type="button" disabled={!canAlign} onClick={() => { state.align('right'); close(); }}>Aligner à droite</button>
              <hr />
              <button type="button" disabled={!canAlign} onClick={() => { state.align('top'); close(); }}>Aligner en haut</button>
              <button type="button" disabled={!canAlign} onClick={() => { state.align('center-v'); close(); }}>Centrer verticalement</button>
              <button type="button" disabled={!canAlign} onClick={() => { state.align('bottom'); close(); }}>Aligner en bas</button>
              <hr />
              <button type="button" disabled={!canDistribute} onClick={() => { state.distribute('h'); close(); }}>Répartir horizontalement</button>
              <button type="button" disabled={!canDistribute} onClick={() => { state.distribute('v'); close(); }}>Répartir verticalement</button>
            </>
          )}
        </Dropdown>

        <button
          type="button"
          className="tool-btn"
          title="Supprimer (Suppr)"
          disabled={!state.selection.length}
          onClick={state.deleteSelection}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="toolbar-group">
        <button type="button" className="tool-btn" title="Zoom arrière" onClick={() => onZoom(state.camera.zoom / 1.2)}>
          <Icon name="minus" />
        </button>
        <button type="button" className="tool-btn zoom-value" title="Zoom 100 %" onClick={() => onZoom(1)}>
          {zoomPercent} %
        </button>
        <button type="button" className="tool-btn" title="Zoom avant" onClick={() => onZoom(state.camera.zoom * 1.2)}>
          <Icon name="plus" />
        </button>
        <button type="button" className="tool-btn" title="Ajuster à l’écran (Ctrl+0)" onClick={onFit}>
          <Icon name="fit" />
        </button>

        <span className="divider" />

        <button
          type="button"
          className="tool-btn"
          title="Insérer un schéma depuis du texte PlantUML"
          onClick={onImport}
        >
          <Icon name="code" size={16} />
        </button>

        <button
          type="button"
          className={`tool-btn copy-btn ${copy.state}`}
          title={
            copy.message ??
            'Copier le schéma dans le presse-papiers (image PNG à fond transparent), prêt à coller'
          }
          disabled={copy.state === 'busy' || !state.nodes.length}
          onClick={copyImage}
        >
          <Icon name={copy.state === 'done' ? 'check' : 'copy'} size={16} />
          {copy.state === 'done' ? 'Copié' : copy.state === 'error' ? 'Échec' : 'Copier'}
        </button>

        <Dropdown label="Exporter ▾" align="right" title="Exporter le schéma">
          {(close) => (
            <>
              <button type="button" onClick={() => { onExport('png'); close(); }}>Image PNG</button>
              <button type="button" onClick={() => { onExport('svg'); close(); }}>Vectoriel SVG</button>
              <button type="button" onClick={() => { onExport('json'); close(); }}>Données JSON</button>
            </>
          )}
        </Dropdown>

        <button type="button" className="btn-primary" onClick={onSave} disabled={status === 'saving'}>
          Enregistrer
        </button>
      </div>

      {copy.state === 'error' && (
        <div className="copy-toast" role="alert" onClick={() => setCopy({ state: 'idle' })}>
          <strong>Copie impossible</strong>
          <span>{copy.message}</span>
          <span className="hint">En attendant : Exporter ▸ Image PNG.</span>
        </div>
      )}
    </header>
  );
}
