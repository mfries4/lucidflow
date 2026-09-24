import type { Rect } from '../types';

const PADDING = 32;

/** Copie le SVG affiché, retire l'interface d'édition et le recadre sur le contenu. */
export function buildExportSvg(source: SVGSVGElement, bounds: Rect, background = '#ffffff'): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-ui]').forEach((el) => el.remove());

  const world = clone.querySelector('[data-world]') as SVGGElement | null;
  world?.removeAttribute('transform');

  const box: Rect = {
    x: bounds.x - PADDING,
    y: bounds.y - PADDING,
    w: bounds.w + PADDING * 2,
    h: bounds.h + PADDING * 2,
  };

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  clone.setAttribute('width', String(Math.round(box.w)));
  clone.setAttribute('height', String(Math.round(box.h)));
  clone.removeAttribute('style');
  clone.removeAttribute('class');

  if (background !== 'transparent') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(box.x));
    rect.setAttribute('y', String(box.y));
    rect.setAttribute('width', String(box.w));
    rect.setAttribute('height', String(box.h));
    rect.setAttribute('fill', background);
    clone.insertBefore(rect, clone.firstChild);
  }
  return clone;
}

export function svgToString(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadSvg(svg: SVGSVGElement, filename: string) {
  download(new Blob([svgToString(svg)], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
}

export function svgToDataUrl(svg: SVGSVGElement): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgToString(svg))}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'sync';
  return new Promise((done, fail) => {
    image.onload = () => done(image);
    image.onerror = () => fail(new Error("rendu de l'image refusé"));
    image.src = src;
  });
}

export async function rasterize(svg: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const width = Number(svg.getAttribute('width')) || 800;
  const height = Number(svg.getAttribute('height')) || 600;
  const markup = svgToString(svg);

  let image: HTMLImageElement;
  try {
    image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  } catch {
    // Repli : sur un grand schéma, l'URL de données peut dépasser la limite du navigateur.
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      image = await loadImage(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, ko) =>
    canvas.toBlob((blob) => (blob ? ok(blob) : ko(new Error('Rendu impossible'))), 'image/png'),
  );
}

/** Message lisible pour une erreur de presse-papiers. */
function describe(error: unknown): string {
  const e = error as { name?: string; message?: string };
  if (e?.name === 'NotAllowedError') return 'permission refusée par le navigateur';
  if (e?.name === 'SecurityError') return 'rendu bloqué par le navigateur';
  if (e?.name === 'DataError' || e?.name === 'TypeError') return `format refusé (${e.message ?? ''})`.trim();
  return e?.message || e?.name || 'erreur inconnue';
}

/**
 * Repli universel : on place une image HTML dans le presse-papiers via execCommand.
 * Fonctionne sans l'API asynchrone et hors origine sécurisée ; le collage donne
 * l'image dans un traitement de texte, une présentation ou une messagerie.
 */
function copyImageAsHtml(dataUrl: string): boolean {
  const holder = document.createElement('div');
  holder.contentEditable = 'true';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  const img = document.createElement('img');
  img.src = dataUrl;
  holder.append(img);
  document.body.append(holder);

  const selection = window.getSelection();
  const previous = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  const range = document.createRange();
  range.selectNodeContents(holder);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    selection?.removeAllRanges();
    if (previous) selection?.addRange(previous);
    holder.remove();
  }
  return copied;
}

export type CopyOutcome = 'image' | 'html';

/**
 * Place le schéma dans le presse-papiers en PNG (fond transparent), pour le coller
 * directement sans passer par un téléchargement. Trois tentatives successives, car
 * les navigateurs n'acceptent pas tous la même forme d'écriture.
 */
export async function copyPngToClipboard(svg: SVGSVGElement, scale = 2): Promise<CopyOutcome> {
  const failures: string[] = [];
  const asyncClipboard = typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);

  if (asyncClipboard) {
    // 1. Blob passé en promesse : Safari exige que l'écriture soit demandée
    //    dans la foulée du clic, sans attendre le rendu.
    try {
      const pending = rasterize(svg, scale).then(canvasToBlob);
      pending.catch(() => {}); // évite un rejet non traité si l'étape 2 prend le relais
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })]);
      return 'image';
    } catch (error) {
      failures.push(describe(error));
    }

    // 2. Blob déjà résolu : Firefox refuse les promesses.
    try {
      const blob = await canvasToBlob(await rasterize(svg, scale));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'image';
    } catch (error) {
      failures.push(describe(error));
    }
  } else {
    failures.push(
      window.isSecureContext
        ? 'API presse-papiers absente de ce navigateur'
        : 'origine non sécurisée (ouvrez le site en localhost ou en HTTPS)',
    );
  }

  // 3. Repli image HTML.
  try {
    const canvas = await rasterize(svg, scale);
    if (copyImageAsHtml(canvas.toDataURL('image/png'))) return 'html';
    failures.push('copie refusée par le navigateur');
  } catch (error) {
    failures.push(describe(error));
  }

  throw new Error(`Copie impossible — ${failures.join(' · ')}`);
}

export async function downloadPng(svg: SVGSVGElement, filename: string, scale = 2) {
  const canvas = await rasterize(svg, scale);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (blob) download(blob, `${filename}.png`);
}

/** Vignette compacte (data URL) stockée avec le document. */
export async function makeThumbnail(svg: SVGSVGElement, maxSize = 320): Promise<string | null> {
  try {
    const width = Number(svg.getAttribute('width')) || 1;
    const height = Number(svg.getAttribute('height')) || 1;
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    const canvas = await rasterize(svg, Math.max(scale, 0.05));
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

export function downloadJson(data: unknown, filename: string) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${filename}.json`);
}
