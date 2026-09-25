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

  CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

/**
 * Les bases créées avant les dossiers doivent gagner les nouvelles colonnes :
 * une installation existante contient déjà les schémas de l'utilisateur.
 */
function migrate() {
  const existantes = db.prepare('PRAGMA table_info(documents)').all().map((c) => c.name);
  const ajouts = [
    ['folder_id', 'ALTER TABLE documents ADD COLUMN folder_id TEXT'],
    ['pinned', 'ALTER TABLE documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0'],
    ['deleted_at', 'ALTER TABLE documents ADD COLUMN deleted_at INTEGER'],
  ];
  for (const [colonne, sql] of ajouts) {
    if (!existantes.includes(colonne)) db.exec(sql);
  }
}
migrate();

const EMPTY = JSON.stringify({ nodes: [], edges: [] });

/** Ligne SQL -> objet API. `data` n'est renvoyé que pour la vue détaillée. */
function toDocument(row, { withData = true } = {}) {
  if (!row) return null;
  const doc = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    preview: row.preview ?? null,
    folderId: row.folder_id ?? null,
    pinned: Boolean(row.pinned),
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withData) doc.data = JSON.parse(row.data);
  return doc;
}

const COLONNES_LISTE =
  'id, name, kind, preview, folder_id, pinned, deleted_at, created_at, updated_at';

const statements = {
  // Les documents épinglés remontent, puis les plus récemment modifiés.
  list: db.prepare(
    `SELECT ${COLONNES_LISTE} FROM documents WHERE deleted_at IS NULL
     ORDER BY pinned DESC, updated_at DESC`,
  ),
  listTrash: db.prepare(
    `SELECT ${COLONNES_LISTE} FROM documents WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`,
  ),
  get: db.prepare('SELECT * FROM documents WHERE id = ?'),
  insert: db.prepare(
    `INSERT INTO documents (id, name, kind, data, preview, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  remove: db.prepare('DELETE FROM documents WHERE id = ?'),
};

export function listDocuments({ trash = false } = {}) {
  const rows = trash ? statements.listTrash.all() : statements.list.all();
  return rows.map((row) => toDocument(row, { withData: false }));
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
  if (patch.folderId !== undefined) {
    fields.push('folder_id = ?');
    values.push(patch.folderId || null);
  }
  if (patch.pinned !== undefined) {
    fields.push('pinned = ?');
    values.push(patch.pinned ? 1 : 0);
  }
  if (!fields.length) return toDocument(current);

  fields.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDocument(id);
}

/** Suppression ordinaire : le document part à la corbeille, il reste récupérable. */
export function trashDocument(id) {
  return db.prepare('UPDATE documents SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(Date.now(), id).changes > 0;
}

export function restoreDocument(id) {
  const ok = db.prepare('UPDATE documents SET deleted_at = NULL WHERE id = ?').run(id).changes > 0;
  return ok ? getDocument(id) : null;
}

/** Suppression définitive, depuis la corbeille. */
export function deleteDocument(id) {
  return statements.remove.run(id).changes > 0;
}

export function emptyTrash() {
  return db.prepare('DELETE FROM documents WHERE deleted_at IS NOT NULL').run().changes;
}

// ----------------------------------------------------------------- dossiers

export function listFolders() {
  return db
    .prepare(`SELECT f.id, f.name, f.created_at,
                     (SELECT COUNT(*) FROM documents d
                       WHERE d.folder_id = f.id AND d.deleted_at IS NULL) AS count
              FROM folders f ORDER BY f.name COLLATE NOCASE`)
    .all()
    .map((row) => ({ id: row.id, name: row.name, count: row.count, createdAt: row.created_at }));
}

export function createFolder({ id, name }) {
  db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)')
    .run(id, name?.trim() || 'Nouveau dossier', Date.now());
  return listFolders().find((f) => f.id === id) ?? null;
}

export function renameFolder(id, name) {
  const ok = db.prepare('UPDATE folders SET name = ? WHERE id = ?')
    .run(name?.trim() || 'Nouveau dossier', id).changes > 0;
  return ok ? listFolders().find((f) => f.id === id) ?? null : null;
}

/** Supprimer un dossier ne supprime pas son contenu : les documents reviennent à la racine. */
export function deleteFolder(id) {
  db.prepare('UPDATE documents SET folder_id = NULL WHERE folder_id = ?').run(id);
  return db.prepare('DELETE FROM folders WHERE id = ?').run(id).changes > 0;
}

export function duplicateDocument(id, newId) {
  const source = getDocument(id);
  if (!source) return null;
  const copie = createDocument({
    id: newId,
    name: `${source.name} (copie)`,
    kind: source.kind,
    data: source.data,
    preview: source.preview,
  });
  // La copie reste dans le dossier de l'original.
  return source.folderId ? updateDocument(newId, { folderId: source.folderId }) : copie;
}
