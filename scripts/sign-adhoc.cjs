const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * electron-builder ne signe pas le bundle quand aucune identité de développeur
 * n'est fournie : l'application ne garde alors que la signature automatique du
 * linker, rendue incohérente par l'ajout des ressources et le renommage. macOS
 * déclare dans ce cas l'application « endommagée » dès qu'elle porte l'attribut
 * de quarantaine, c'est-à-dire dès qu'elle a été téléchargée.
 *
 * On signe donc le bundle entier en ad hoc, du plus imbriqué vers l'extérieur.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], {
    stdio: 'inherit',
  });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log('  • signature ad hoc appliquée et vérifiée');
};
