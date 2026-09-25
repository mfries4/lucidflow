import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, type CanvasHandle } from '../components/Canvas';
import { ShapePanel } from '../components/ShapePanel';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { Toolbar } from '../components/Toolbar';
import { ContextMenu } from '../components/ContextMenu';
import { PlantUmlDialog } from '../components/PlantUmlDialog';
import { useEditor } from '../store/editor';
import { api } from '../lib/api';
import {
  buildExportSvg,
  copyPngToClipboard,
  downloadJson,
  downloadPng,
  downloadSvg,
  makeThumbnail,
} from '../lib/export';
import { boundsOf, rectOf } from '../lib/geometry';
import { templateFor } from '../lib/templates';
import type { Diagram, Point } from '../types';

const AUTOSAVE_DELAY = 900;
const THUMBNAIL_INTERVAL = 20_000;
const NUDGE_GROUPING = 600;
/** Dans l'application de bureau, ces raccourcis sont portés par le menu macOS :
 *  les traiter aussi ici les déclencherait deux fois. */
const DESKTOP = /\bElectron\//.test(navigator.userAgent);
const MENU_SHORTCUTS = new Set(['z', 'x', 'c', 'v', 'a', 's']);

interface Props {
  docId: string;
  onBack: () => void;
}

export function EditorPage({ docId, onBack }: Props) {
  const canvasRef = useRef<CanvasHandle>(null);
  const lastThumb = useRef(0);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const lastNudge = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: Point; worldAt: Point } | null>(null);
  const [importing, setImporting] = useState(false);

  const status = useEditor((s) => s.status);
  const revision = useEditor((s) => s.revision);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(docId)
      .then((doc) => {
        if (cancelled) return;
        useEditor.getState().loadDocument(doc, templateFor(doc.kind).palette);
        setLoading(false);
        // Cadrage initial : la toile n'est mesurée qu'après quelques frames.
        if (doc.data.nodes.length) {
          let attempts = 0;
          const tryFit = () => {
            const viewport = canvasRef.current?.viewport();
            if (viewport?.w) useEditor.getState().fitToContent(viewport);
            else if (attempts++ < 20) requestAnimationFrame(tryFit);
          };
          requestAnimationFrame(tryFit);
        }
        // Un document encore sans vignette en reçoit une dès sa première ouverture.
        if (!doc.preview && doc.data.nodes.length) {
          setTimeout(() => { void saveRef.current?.(); }, 1400);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const exportSvgElement = useCallback((background?: string) => {
    const element = canvasRef.current?.element;
    if (!element) return null;
    const { nodes } = useEditor.getState();
    const bounds = boundsOf(nodes.map(rectOf)) ?? { x: 0, y: 0, w: 800, h: 600 };
    return buildExportSvg(element, bounds, background);
  }, []);

  const copyImage = useCallback(async () => {
    const svg = exportSvgElement('transparent');
    if (!svg) throw new Error('Schéma indisponible');
    await copyPngToClipboard(svg, 2);
  }, [exportSvgElement]);

  const save = useCallback(async () => {
    const state = useEditor.getState();
    if (!state.docId) return;
    const revisionAtSave = state.revision;
    state.setStatus('saving');
    try {
      const now = Date.now();
      let preview: string | null | undefined;
      if (now - lastThumb.current > THUMBNAIL_INTERVAL && state.nodes.length) {
        const svg = exportSvgElement();
        if (svg) {
          preview = await makeThumbnail(svg);
          lastThumb.current = now;
        }
      }
      await api.update(state.docId, {
        name: state.name,
        data: { nodes: state.nodes, edges: state.edges },
        ...(preview !== undefined ? { preview } : {}),
      });
      useEditor.getState().markSaved(revisionAtSave);
    } catch {
      useEditor.getState().setStatus('error');
    }
  }, [exportSvgElement]);

  saveRef.current = save;

  // Enregistrement automatique après une pause dans les modifications.
  useEffect(() => {
    if (loading) return;
    const state = useEditor.getState();
    if (state.revision === state.savedRevision) return;
    if (state.status === 'saved') state.setStatus('idle');
    const timer = setTimeout(save, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [revision, loading, save]);

  // Quitter l'éditeur (retour, changement de document) enregistre ce qui est en attente :
  // sans cela, le minuteur d'enregistrement automatique est annulé et la modification est perdue.
  useEffect(
    () => () => {
      const state = useEditor.getState();
      if (state.docId && state.revision !== state.savedRevision) {
        void api
          .update(state.docId, { name: state.name, data: { nodes: state.nodes, edges: state.edges } })
          .catch(() => {});
      }
    },
    [],
  );

  // Dernier enregistrement à la fermeture de l'onglet.
  useEffect(() => {
    const onLeave = () => {
      const state = useEditor.getState();
      if (state.docId && state.revision !== state.savedRevision) {
        navigator.sendBeacon?.(
          `/api/documents/${state.docId}`,
          new Blob([JSON.stringify({ name: state.name, data: { nodes: state.nodes, edges: state.edges } })], {
            type: 'application/json',
          }),
        );
      }
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, []);

  const handleExport = useCallback(
    async (format: 'png' | 'svg' | 'json') => {
      const state = useEditor.getState();
      const filename = state.name.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'schema';
      if (format === 'json') {
        downloadJson({ name: state.name, kind: state.kind, data: { nodes: state.nodes, edges: state.edges } }, filename);
        return;
      }
      const svg = exportSvgElement();
      if (!svg) return;
      if (format === 'svg') downloadSvg(svg, filename);
      else await downloadPng(svg, filename, 2);
    },
    [exportSvgElement],
  );

  /** Le schéma importé se pose à droite de ce qui existe déjà. */
  const insertImported = useCallback((result: { diagram: Diagram }) => {
    const state = useEditor.getState();
    const existing = boundsOf(state.nodes.map(rectOf));
    const incoming = boundsOf(result.diagram.nodes.map(rectOf));
    const dx = existing && incoming ? existing.x + existing.w + 140 - incoming.x : 0;
    const dy = existing && incoming ? existing.y - incoming.y : 0;
    state.insertNodes(
      result.diagram.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
      result.diagram.edges,
    );
    setImporting(false);
    requestAnimationFrame(() => {
      const viewport = canvasRef.current?.viewport();
      if (viewport?.w) useEditor.getState().fitToContent(viewport);
    });
  }, []);

  /** Le collage se fait sous la souris ; à défaut, au centre de la vue. */
  const pasteHere = useCallback(() => {
    const state = useEditor.getState();
    const at = canvasRef.current?.pointer();
    if (at) return state.paste(at);
    const viewport = canvasRef.current?.viewport();
    if (!viewport?.w) return state.paste();
    const { camera } = state;
    return state.paste({
      x: (viewport.w / 2 - camera.x) / camera.zoom,
      y: (viewport.h / 2 - camera.y) / camera.zoom,
    });
  }, []);

  const fit = useCallback(() => {
    const viewport = canvasRef.current?.viewport();
    if (viewport?.w) useEditor.getState().fitToContent(viewport);
  }, []);

  // Passerelle pour les menus de l'application de bureau : sur macOS, un
  // accélérateur de menu intercepte la touche avant la page. Le menu appelle
  // donc ces fonctions, qui agissent sur le schéma plutôt que sur le texte.
  useEffect(() => {
    const bridge = window as typeof window & {
      lucidflowEdit?: (action: string) => void;
      lucidflowSave?: () => Promise<void>;
    };
    bridge.lucidflowEdit = (action) => {
      const state = useEditor.getState();
      if (action === 'undo') state.undo();
      else if (action === 'redo') state.redo();
      else if (action === 'copy') state.copySelection();
      else if (action === 'cut') {
        state.copySelection();
        state.deleteSelection();
      } else if (action === 'paste') pasteHere();
      else if (action === 'selectAll') state.selectAll();
    };
    bridge.lucidflowSave = () => save();
    return () => {
      delete bridge.lucidflowEdit;
      delete bridge.lucidflowSave;
    };
  }, [save, pasteHere]);

  // ------------------------------------------------------------ clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = Boolean(target?.closest('input, textarea, select'));
      const state = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (DESKTOP && mod && MENU_SHORTCUTS.has(e.key.toLowerCase())) return;

      // Ctrl+S reste actif pendant la saisie, sinon le navigateur ouvre sa propre boîte.
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (typing) return;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? state.redo() : state.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        state.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        state.selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        state.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'x') {
        state.copySelection();
        state.deleteSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        pasteHere();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        state.duplicateSelection();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        fit();
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          state.deleteSelection();
          break;
        case 'Escape':
          state.setPending(null);
          state.setTool('select');
          state.clearSelection();
          break;
        case 'Enter':
        case 'F2':
          if (state.selection.length === 1) {
            e.preventDefault();
            state.setEditing({ id: state.selection[0], field: 'text' });
          }
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!state.selection.length) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          // Une rafale de flèches ne forme qu'une seule étape d'annulation.
          const now = Date.now();
          if (now - lastNudge.current > NUDGE_GROUPING) state.history();
          lastNudge.current = now;
          state.moveNodes(state.selection, dx, dy);
          break;
        }
        case 'v':
        case 'V':
          state.setTool('select');
          break;
        case 'm':
        case 'M':
          state.setTool('pan');
          break;
        case 'c':
        case 'C':
          state.setTool('connect');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit, save, pasteHere]);

  if (error) {
    return (
      <div className="page-message">
        <p>{error}</p>
        <button type="button" className="btn-primary" onClick={onBack}>Retour aux documents</button>
      </div>
    );
  }

  return (
    <div className="editor">
      <Toolbar
        onBack={onBack}
        onImport={() => setImporting(true)}
        onCopyImage={copyImage}
        onExport={handleExport}
        onFit={fit}
        onZoom={(zoom) => useEditor.getState().setZoom(zoom, canvasRef.current?.viewport())}
        onSave={() => void save()}
        status={status}
      />
      <div className="editor-body">
        <ShapePanel />
        <Canvas ref={canvasRef} onContextMenu={(at, worldAt) => setMenu({ at, worldAt })} />
        <PropertiesPanel />
      </div>
      {menu && <ContextMenu at={menu.at} worldAt={menu.worldAt} onClose={() => setMenu(null)} />}
      {importing && (
        <PlantUmlDialog
          title="Insérer depuis du texte PlantUML"
          actionLabel="Insérer dans le schéma"
          onClose={() => setImporting(false)}
          onImport={insertImported}
        />
      )}
      {loading && <div className="loading-veil">Chargement du schéma…</div>}
    </div>
  );
}
