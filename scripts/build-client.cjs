const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

/**
 * Compile l'interface avant tout empaquetage.
 *
 * Sans ce garde-fou, `electron-builder` embarque le contenu de `client/dist` tel
 * qu'il se trouve : lancer l'empaquetage sans recompiler livre une application
 * dont l'interface est périmée, ce qui est passé inaperçu une fois.
 */
exports.default = async function beforePack() {
  const racine = resolve(__dirname, '..');
  console.log('  • compilation de l’interface avant empaquetage');
  execFileSync('npm', ['--prefix', 'client', 'run', 'build'], { cwd: racine, stdio: 'inherit' });
};
