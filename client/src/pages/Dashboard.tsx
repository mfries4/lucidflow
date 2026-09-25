import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { TEMPLATES, templateFor } from '../lib/templates';
import type { DocumentKind, DocumentSummary, Folder } from '../types';
import { shapeDef, styleFor } from '../shapes/registry';
import { Dropdown } from '../components/Dropdown';
import { PlantUmlDialog } from '../components/PlantUmlDialog';
import type { PlantUmlResult } from '../lib/plantuml';
import { Logo } from '../components/Logo';
import { Icon } from '../components/Icons';
import { matches } from '../lib/search';

interface Props {
  onOpen: (id: string) => void;
}

/** Marqueur de glisser-déposer : le type MIME identifie un document de l'application. */
const DRAG_TYPE = 'application/x-lucidflow-document';
const RACINE = 'racine';

function formatDate(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Petite illustration générée pour les modèles et les documents sans aperçu. */
function KindGlyph({ kind }: { kind: DocumentKind }) {
  const preview: Record<DocumentKind, string[]> = {
    blank: ['rectangle'],
    mindmap: ['mindRoot', 'mindTopic', 'mindTopic'],
    flowchart: ['stadium', 'diamond', 'roundRect'],
    'uml-class': ['umlClass', 'umlClass'],
    'uml-sequence': ['lifeline', 'lifeline'],
    'uml-usecase': ['actor', 'useCase'],
    'uml-activity': ['startNode', 'roundRect', 'diamond'],
  };
  const items = preview[kind] ?? ['rectangle'];
  return (
    <svg viewBox="0 0 160 90" className="kind-glyph" aria-hidden>
      {items.map((shape, i) => {
        const def = shapeDef(shape);
        const scale = Math.min(46 / def.size[0], 34 / def.size[1]);
        const w = def.size[0] * scale;
        const h = def.size[1] * scale;
        const x = 22 + i * 46;
        const y = 45 - h / 2 + (i % 2 ? 16 : -10);
        const style = { ...styleFor(shape), strokeWidth: 1.5 };
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            {i > 0 && <line x1={-14} y1={h / 2} x2={0} y2={h / 2} stroke="#94a3b8" strokeWidth={1.5} />}
            {def.Body({ node: { id: 'g', shape, x: 0, y: 0, w, h, text: '', style }, w, h, s: style })}
          </g>
        );
      })}
    </svg>
  );
}

export function Dashboard({ onOpen }: Props) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [trashed, setTrashed] = useState<DocumentSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [view, setView] = useState<'documents' | 'trash'>('documents');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [renamingDoc, setRenamingDoc] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    Promise.all([api.list(), api.folders.list(), api.list({ trash: true })])
      .then(([docs, dossiers, corbeille]) => {
        setDocuments(docs);
        setFolders(dossiers);
        setTrashed(corbeille);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (renamingDoc || renamingFolder) renameRef.current?.select();
  }, [renamingDoc, renamingFolder]);

  const searching = Boolean(query.trim());
  const dossierCourant = folders.find((f) => f.id === current) ?? null;

  const visible = useMemo(() => {
    if (view === 'trash') {
      return searching ? trashed.filter((d) => matches(d.name, query)) : trashed;
    }
    // Une recherche porte sur toute la bibliothèque, dossiers compris.
    if (searching) return documents.filter((d) => matches(d.name, query));
    return documents.filter((d) => (d.folderId ?? null) === current);
  }, [documents, trashed, view, searching, query, current]);

  // ------------------------------------------------------------- actions

  const create = async (kind: DocumentKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const template = templateFor(kind);
      const doc = await api.create({
        name: kind === 'blank' ? 'Nouveau schéma' : template.name,
        kind,
        data: template.build(),
      });
      // Créé depuis un dossier ouvert, le document y est rangé d'emblée.
      if (current) await api.update(doc.id, { folderId: current });
      onOpen(doc.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createFromPlantUml = async (result: PlantUmlResult) => {
    try {
      const doc = await api.create({ name: result.name, kind: result.kind, data: result.diagram });
      if (current) await api.update(doc.id, { folderId: current });
      onOpen(doc.id);
    } catch (e) {
      setError((e as Error).message);
      setImporting(false);
    }
  };

  const renameDoc = async (id: string, name: string) => {
    setRenamingDoc(null);
    const doc = documents.find((d) => d.id === id);
    if (!doc || doc.name === name || !name.trim()) return;
    setDocuments((list) => list.map((d) => (d.id === id ? { ...d, name } : d)));
    await api.update(id, { name }).catch(() => refresh());
  };

  const togglePin = async (doc: DocumentSummary) => {
    setDocuments((list) => list.map((d) => (d.id === doc.id ? { ...d, pinned: !d.pinned } : d)));
    await api.update(doc.id, { pinned: !doc.pinned }).catch(() => undefined);
    void refresh();
  };

  const move = async (id: string, folderId: string | null) => {
    setDocuments((list) => list.map((d) => (d.id === id ? { ...d, folderId } : d)));
    await api.update(id, { folderId }).catch(() => undefined);
    void refresh();
  };

  const toTrash = async (doc: DocumentSummary) => {
    setDocuments((list) => list.filter((d) => d.id !== doc.id));
    await api.trash(doc.id).catch(() => undefined);
    void refresh();
  };

  const newFolder = async () => {
    const dossier = await api.folders.create('Nouveau dossier').catch((e: Error) => {
      setError(e.message);
      return null;
    });
    if (!dossier) return;
    await refresh();
    setRenamingFolder(dossier.id);
  };

  const renameFolder = async (id: string, name: string) => {
    setRenamingFolder(null);
    const dossier = folders.find((f) => f.id === id);
    if (!dossier || dossier.name === name || !name.trim()) return;
    setFolders((list) => list.map((f) => (f.id === id ? { ...f, name } : f)));
    await api.folders.rename(id, name).catch(() => refresh());
  };

  const removeFolder = async (dossier: Folder) => {
    const message = dossier.count
      ? `Supprimer « ${dossier.name} » ? Ses ${dossier.count} document(s) reviendront à la racine.`
      : `Supprimer le dossier « ${dossier.name} » ?`;
    if (!window.confirm(message)) return;
    await api.folders.remove(dossier.id).catch(() => undefined);
    if (current === dossier.id) setCurrent(null);
    void refresh();
  };

  const onDropDocument = (event: React.DragEvent, folderId: string | null) => {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    if (id) void move(id, folderId);
  };

  const dropProps = (cible: string, folderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropTarget(cible);
    },
    onDragLeave: () => setDropTarget((t) => (t === cible ? null : t)),
    onDrop: (e: React.DragEvent) => onDropDocument(e, folderId),
  });

  // -------------------------------------------------------------- rendu

  const titre = view === 'trash' ? 'Corbeille' : searching ? 'Résultats' : dossierCourant?.name ?? 'Mes documents';

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="brand">
          <Logo size={26} />
          <span>LucidFlow</span>
        </div>
        <input
          className="dash-search"
          type="search"
          placeholder="Rechercher un document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn-ghost" onClick={() => setImporting(true)}>
          Depuis PlantUML
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => create('blank')}>
          + Nouveau document
        </button>
      </header>

      <main className="dash-main">
        {view === 'documents' && !searching && (
          <section>
            <h2>Commencer avec un modèle</h2>
            <div className="template-row">
              {TEMPLATES.map((template) => (
                <button
                  key={template.kind}
                  type="button"
                  className="template-card"
                  disabled={busy}
                  onClick={() => create(template.kind)}
                >
                  <KindGlyph kind={template.kind} />
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="section-head">
            <h2>
              {dossierCourant && view === 'documents' && !searching && (
                <button
                  type="button"
                  className={`breadcrumb ${dropTarget === RACINE ? 'over' : ''}`}
                  onClick={() => setCurrent(null)}
                  {...dropProps(RACINE, null)}
                >
                  Mes documents
                </button>
              )}
              {titre} <small>({visible.length})</small>
            </h2>
            <div className="section-actions">
              {view === 'documents' && !current && !searching && (
                <button type="button" className="btn-ghost small" onClick={newFolder}>
                  <Icon name="folder" size={15} /> Nouveau dossier
                </button>
              )}
              {view === 'trash' ? (
                <>
                  {Boolean(trashed.length) && (
                    <button
                      type="button"
                      className="btn-ghost small danger"
                      onClick={async () => {
                        if (!window.confirm(`Vider la corbeille (${trashed.length} document(s)) ?`)) return;
                        await api.emptyTrash().catch(() => undefined);
                        void refresh();
                      }}
                    >
                      Vider la corbeille
                    </button>
                  )}
                  <button type="button" className="btn-ghost small" onClick={() => setView('documents')}>
                    Retour aux documents
                  </button>
                </>
              ) : (
                <button type="button" className="btn-ghost small" onClick={() => setView('trash')}>
                  <Icon name="trash" size={15} /> Corbeille{trashed.length ? ` (${trashed.length})` : ''}
                </button>
              )}
            </div>
          </div>

          {loading && <p className="muted">Chargement…</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !visible.length && !(view === 'documents' && !current && folders.length && !searching) && (
            <p className="muted">
              {view === 'trash'
                ? 'La corbeille est vide.'
                : searching
                  ? 'Aucun document ne correspond à cette recherche.'
                  : current
                    ? 'Ce dossier est vide — glissez-y un document, ou créez-en un.'
                    : 'Aucun document pour le moment — choisissez un modèle ci-dessus.'}
            </p>
          )}

          <div className="doc-grid">
            {view === 'documents' && !current && !searching &&
              folders.map((dossier) => (
                <article
                  key={dossier.id}
                  className={`folder-card ${dropTarget === dossier.id ? 'over' : ''}`}
                  {...dropProps(dossier.id, dossier.id)}
                >
                  <button type="button" className="folder-open" onClick={() => setCurrent(dossier.id)}>
                    <Icon name="folder" size={30} />
                    {renamingFolder === dossier.id ? (
                      <input
                        ref={renameRef}
                        className="rename-input"
                        defaultValue={dossier.name}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => void renameFolder(dossier.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenamingFolder(null);
                        }}
                      />
                    ) : (
                      <strong>{dossier.name}</strong>
                    )}
                    <span>{dossier.count} document{dossier.count > 1 ? 's' : ''}</span>
                  </button>
                  <Dropdown label="⋯" align="right" title="Actions">
                    {(close) => (
                      <>
                        <button type="button" onClick={() => { setCurrent(dossier.id); close(); }}>Ouvrir</button>
                        <button type="button" onClick={() => { setRenamingFolder(dossier.id); close(); }}>Renommer</button>
                        <hr />
                        <button type="button" className="danger" onClick={() => { void removeFolder(dossier); close(); }}>
                          Supprimer
                        </button>
                      </>
                    )}
                  </Dropdown>
                </article>
              ))}

            {visible.map((doc) => (
              <article
                key={doc.id}
                className={`doc-card ${doc.pinned ? 'pinned' : ''}`}
                draggable={view === 'documents'}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, doc.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <button
                  type="button"
                  className="doc-preview"
                  onClick={() => (view === 'trash' ? undefined : onOpen(doc.id))}
                  title={view === 'trash' ? 'Restaurez le document pour l’ouvrir' : 'Ouvrir'}
                >
                  {doc.preview ? <img src={doc.preview} alt="" loading="lazy" /> : <KindGlyph kind={doc.kind} />}
                </button>

                {view === 'documents' && (
                  <button
                    type="button"
                    className={`pin-btn ${doc.pinned ? 'on' : ''}`}
                    title={doc.pinned ? 'Ne plus épingler' : 'Épingler en haut de la liste'}
                    onClick={() => void togglePin(doc)}
                  >
                    <Icon name="star" size={15} />
                  </button>
                )}

                <div className="doc-meta">
                  {renamingDoc === doc.id ? (
                    <input
                      ref={renameRef}
                      className="rename-input"
                      defaultValue={doc.name}
                      onBlur={(e) => void renameDoc(doc.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenamingDoc(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="doc-name-btn"
                      onClick={() => (view === 'trash' ? undefined : onOpen(doc.id))}
                    >
                      {doc.name}
                    </button>
                  )}
                  <div className="doc-sub">
                    <time dateTime={new Date(doc.updatedAt).toISOString()}>
                      {view === 'trash' && doc.deletedAt
                        ? `supprimé ${formatDate(doc.deletedAt)}`
                        : formatDate(doc.updatedAt)}
                    </time>
                  </div>
                </div>

                <Dropdown label="⋯" align="right" title="Actions">
                  {(close) =>
                    view === 'trash' ? (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            close();
                            await api.restore(doc.id).catch(() => undefined);
                            await refresh();
                            // Une corbeille vidée par restauration n'a plus rien à montrer.
                            if (trashed.length <= 1) setView('documents');
                          }}
                        >
                          Restaurer
                        </button>
                        <hr />
                        <button
                          type="button"
                          className="danger"
                          onClick={async () => {
                            close();
                            if (!window.confirm(`Supprimer définitivement « ${doc.name} » ?`)) return;
                            await api.purge(doc.id).catch(() => undefined);
                            void refresh();
                          }}
                        >
                          Supprimer définitivement
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { onOpen(doc.id); close(); }}>Ouvrir</button>
                        <button type="button" onClick={() => { setRenamingDoc(doc.id); close(); }}>Renommer</button>
                        <button
                          type="button"
                          onClick={async () => { close(); await api.duplicate(doc.id); void refresh(); }}
                        >
                          Dupliquer
                        </button>
                        <button type="button" onClick={() => { void togglePin(doc); close(); }}>
                          {doc.pinned ? 'Ne plus épingler' : 'Épingler'}
                        </button>
                        {Boolean(folders.length) && (
                          <>
                            <hr />
                            <span className="menu-title">Déplacer vers</span>
                            {doc.folderId && (
                              <button type="button" onClick={() => { void move(doc.id, null); close(); }}>
                                Mes documents
                              </button>
                            )}
                            {folders
                              .filter((f) => f.id !== doc.folderId)
                              .map((f) => (
                                <button key={f.id} type="button" onClick={() => { void move(doc.id, f.id); close(); }}>
                                  {f.name}
                                </button>
                              ))}
                          </>
                        )}
                        <hr />
                        <button type="button" className="danger" onClick={() => { void toTrash(doc); close(); }}>
                          Mettre à la corbeille
                        </button>
                      </>
                    )
                  }
                </Dropdown>
              </article>
            ))}
          </div>
        </section>
      </main>

      {importing && (
        <PlantUmlDialog
          title="Créer un document depuis du texte PlantUML"
          actionLabel="Créer le document"
          onClose={() => setImporting(false)}
          onImport={createFromPlantUml}
        />
      )}
    </div>
  );
}
