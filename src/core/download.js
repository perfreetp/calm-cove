import { signSvgFilename } from './export.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text, filename) {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

export function downloadSvg(svg, sign, version) {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), signSvgFilename(sign, version));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
