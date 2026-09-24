import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.env.DATA_DIR ?? './data', 'lucidflow.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'blank',
    data       TEXT NOT NULL,
    preview    TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents (updated_at DESC);
`);

const EMPTY = JSON.stringify({ nodes: [], edges: [] });

/** Ligne SQL -> objet API. `data` n'est renvoyé que pour la vue détaillée. */
function toDocument(row, { withData = true } = {}) {
  if (!row) return null;
  const doc = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    preview: row.preview ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withData) doc.data = JSON.parse(row.data);
  return doc;
}

const statements = {
  list: db.prepare(
    'SELECT id, name, kind, preview, created_at, updated_at FROM documents ORDER BY updated_at DESC',
  ),
  get: db.prepare('SELECT * FROM documents WHERE id = ?'),
  insert: db.prepare(
    `INSERT INTO documents (id, name, kind, data, preview, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  remove: db.prepare('DELETE FROM documents WHERE id = ?'),
};

export function listDocuments() {
  return statements.list.all().map((row) => toDocument(row, { withData: false }));
}

export function getDocument(id) {
  return toDocument(statements.get.get(id));
}

export function createDocument({ id, name, kind = 'blank', data, preview = null }) {
  const now = Date.now();
  statements.insert.run(
    id,
    name?.trim() || 'Sans titre',
    kind,
    JSON.stringify(data ?? JSON.parse(EMPTY)),
    preview,
    now,
    now,
  );
  return getDocument(id);
}

/** Mise à jour partielle : seuls les champs fournis sont écrits. */
export function updateDocument(id, patch) {
  const current = statements.get.get(id);
  if (!current) return null;

  const fields = [];
  const values = [];
  if (typeof patch.name === 'string') {
    fields.push('name = ?');
    values.push(patch.name.trim() || 'Sans titre');
  }
  if (patch.data !== undefined) {
    fields.push('data = ?');
    values.push(JSON.stringify(patch.data));
  }
  if (patch.preview !== undefined) {
    fields.push('preview = ?');
    values.push(patch.preview);
  }
  if (typeof patch.kind === 'string') {
    fields.push('kind = ?');
    values.push(patch.kind);
  }
  if (!fields.length) return toDocument(current);

  fields.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDocument(id);
}

export function deleteDocument(id) {
  return statements.remove.run(id).changes > 0;
}

export function duplicateDocument(id, newId) {
  const source = getDocument(id);
  if (!source) return null;
  return createDocument({
    id: newId,
    name: `${source.name} (copie)`,
    kind: source.kind,
    data: source.data,
    preview: source.preview,
  });
}
