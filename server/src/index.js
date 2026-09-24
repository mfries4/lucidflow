import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createDocument,
  deleteDocument,
  duplicateDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from './db.js';
import { createStaticHandler } from './static.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_DIR = resolve(
  process.env.PUBLIC_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../public'),
);
const MAX_BODY = 12 * 1024 * 1024; // un schéma volumineux + son aperçu

const serveStatic = createStaticHandler(PUBLIC_DIR);

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('Payload trop volumineux'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return done({});
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        fail(Object.assign(new Error('JSON invalide'), { status: 400 }));
      }
    });
    req.on('error', fail);
  });
}

async function handleApi(req, res, pathname) {
  const segments = pathname.split('/').filter(Boolean); // ['api', 'documents', id?, action?]
  const [, resource, id, action] = segments;

  if (resource === 'health') return json(res, 200, { status: 'ok', uptime: process.uptime() });
  if (resource !== 'documents') return json(res, 404, { error: 'Ressource inconnue' });

  if (!id) {
    if (req.method === 'GET') return json(res, 200, listDocuments());
    if (req.method === 'POST') {
      const body = await readBody(req);
      const doc = createDocument({
        id: randomUUID(),
        name: body.name,
        kind: body.kind,
        data: body.data,
        preview: body.preview,
      });
      return json(res, 201, doc);
    }
    return json(res, 405, { error: 'Méthode non autorisée' });
  }

  if (action === 'duplicate' && req.method === 'POST') {
    const copy = duplicateDocument(id, randomUUID());
    return copy ? json(res, 201, copy) : json(res, 404, { error: 'Document introuvable' });
  }
  if (action) return json(res, 404, { error: 'Action inconnue' });

  if (req.method === 'GET') {
    const doc = getDocument(id);
    return doc ? json(res, 200, doc) : json(res, 404, { error: 'Document introuvable' });
  }
  // POST est accepté ici parce que navigator.sendBeacon() — utilisé pour la sauvegarde
  // de dernière chance à la fermeture de l'onglet — ne sait pas émettre de PATCH.
  if (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST') {
    const doc = updateDocument(id, await readBody(req));
    return doc ? json(res, 200, doc) : json(res, 404, { error: 'Document introuvable' });
  }
  if (req.method === 'DELETE') {
    return deleteDocument(id)
      ? json(res, 200, { ok: true })
      : json(res, 404, { error: 'Document introuvable' });
  }
  return json(res, 405, { error: 'Méthode non autorisée' });
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'Méthode non autorisée' });
    }
    return await serveStatic(req, res, pathname);
  } catch (error) {
    if (res.headersSent) return;
    json(res, error.status ?? 500, { error: error.message ?? 'Erreur serveur' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LucidFlow · API + client sur http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
