// Copie le build du client dans le dossier servi par l'API (exécution hors Docker).
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'server/public');
rmSync(target, { recursive: true, force: true });
cpSync(resolve(root, 'client/dist'), target, { recursive: true });
console.log('Client copié dans server/public');
