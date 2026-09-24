import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { TEMPLATES, templateFor } from '../lib/templates';
import type { DocumentKind, DocumentSummary } from '../types';
import { shapeDef, styleFor } from '../shapes/registry';
import { Dropdown } from '../components/Dropdown';
import { PlantUmlDialog } from '../components/PlantUmlDialog';
import type { PlantUmlResult } from '../lib/plantuml';
import { matches } from '../lib/search';

interface Props {
  onOpen: (id: string) => void;
}

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
            {i > 0 && (
              <line x1={-14} y1={h / 2} x2={0} y2={h / 2} stroke="#94a3b8" strokeWidth={1.5} />
            )}
            {def.Body({ node: { id: 'g', shape, x: 0, y: 0, w, h, text: '', style }, w, h, s: style })}
          </g>
        );
      })}
    </svg>
  );
}

export function Dashboard({ onOpen }: Props) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    api
      .list()
      .then(setDocuments)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const visible = useMemo(() => {
    const needle = query.trim();
    return needle
      ? documents.filter((d) => matches(d.name, needle) || matches(templateFor(d.kind).name, needle))
      : documents;
  }, [documents, query]);

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
      onOpen(doc.id);
    } catch (e) {
      setError((e as Error).message);
      setImporting(false);
    }
  };

  const rename = async (id: string, name: string) => {
    setRenaming(null);
    const current = documents.find((d) => d.id === id);
    if (!current || current.name === name || !name.trim()) return;
    setDocuments((list) => list.map((d) => (d.id === id ? { ...d, name } : d)));
    await api.update(id, { name }).catch(() => refresh());
  };

  const remove = async (doc: DocumentSummary) => {
    if (!window.confirm(`Supprimer définitivement « ${doc.name} » ?`)) return;
    setDocuments((list) => list.filter((d) => d.id !== doc.id));
    await api.remove(doc.id).catch(() => refresh());
  };

  const duplicate = async (doc: DocumentSummary) => {
    await api.duplicate(doc.id);
    void refresh();
  };

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>◆</span>
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

        <section>
          <h2>Mes documents {documents.length > 0 && <small>({documents.length})</small>}</h2>

          {loading && <p className="muted">Chargement…</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !visible.length && (
            <p className="muted">
              {query ? 'Aucun document ne correspond à cette recherche.' : 'Aucun document pour le moment — choisissez un modèle ci-dessus.'}
            </p>
          )}

          <div className="doc-grid">
            {visible.map((doc) => (
              <article key={doc.id} className="doc-card">
                <button type="button" className="doc-preview" onClick={() => onOpen(doc.id)} title="Ouvrir">
                  {doc.preview ? <img src={doc.preview} alt="" loading="lazy" /> : <KindGlyph kind={doc.kind} />}
                </button>
                <div className="doc-meta">
                  {renaming === doc.id ? (
                    <input
                      ref={renameRef}
                      className="rename-input"
                      defaultValue={doc.name}
                      onBlur={(e) => void rename(doc.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="doc-name-btn" onClick={() => onOpen(doc.id)}>
                      {doc.name}
                    </button>
                  )}
                  <div className="doc-sub">
                    <span>{templateFor(doc.kind).name}</span>
                    <span>·</span>
                    <time dateTime={new Date(doc.updatedAt).toISOString()}>{formatDate(doc.updatedAt)}</time>
                  </div>
                </div>
                <Dropdown label="⋯" align="right" title="Actions">
                  {(close) => (
                    <>
                      <button type="button" onClick={() => { onOpen(doc.id); close(); }}>Ouvrir</button>
                      <button type="button" onClick={() => { setRenaming(doc.id); close(); }}>Renommer</button>
                      <button type="button" onClick={() => { void duplicate(doc); close(); }}>Dupliquer</button>
                      <hr />
                      <button type="button" className="danger" onClick={() => { void remove(doc); close(); }}>
                        Supprimer
                      </button>
                    </>
                  )}
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
