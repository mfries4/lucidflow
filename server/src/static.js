import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream';

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.map']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Sert les fichiers du build client avec repli SPA sur index.html.
 * Les assets fingerprintés (/assets/*) sont mis en cache longue durée.
 */
export function createStaticHandler(rootDir) {
  const root = resolve(rootDir);

  async function send(res, filePath, { immutable = false, acceptsGzip = false } = {}) {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(filePath);
    // Le bundle JS passe d'environ 230 ko à 73 ko sur le réseau.
    const gzip = acceptsGzip && COMPRESSIBLE.has(ext) && info.size > 1024;
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : { 'Content-Length': info.size }),
    });
    const stream = createReadStream(filePath);
    if (gzip) pipeline(stream, createGzip(), res, () => {});
    else stream.pipe(res);
  }

  return async function serve(req, res, pathname) {
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    // Empêche toute remontée hors du dossier public.
    const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    const target = join(root, safe);
    if (!target.startsWith(root + sep) && target !== root) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      await send(res, target, { immutable: safe.startsWith(`${sep}assets${sep}`), acceptsGzip });
    } catch {
      try {
        await send(res, join(root, 'index.html'), { acceptsGzip });
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end("Client non construit. Lancez `npm run build` dans /client.");
      }
    }
  };
}
