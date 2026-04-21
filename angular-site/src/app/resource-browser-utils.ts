import { resultFromThrowable } from './result-helpers';

const canvasToDataUrl = resultFromThrowable((canvas: HTMLCanvasElement) => canvas.toDataURL(), 'Failed to encode canvas');

export function renderIconResource(bytes: Uint8Array | null) {
  if (typeof document === 'undefined' || !bytes || bytes.length < 128) return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const byteIdx = row * 4 + Math.floor(col / 8);
      const bit = (bytes[byteIdx] >> (7 - (col % 8))) & 1;
      const pixIdx = (row * size + col) * 4;
      imgData.data[pixIdx] = bit ? 0 : 255;
      imgData.data[pixIdx + 1] = bit ? 0 : 255;
      imgData.data[pixIdx + 2] = bit ? 0 : 255;
      imgData.data[pixIdx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function getIconResourceDataUrl(bytes: Uint8Array | null) {
  const canvas = renderIconResource(bytes);
  if (!canvas) return null;
  return canvasToDataUrl(canvas).match(
    (url) => url,
    () => null,
  );
}

export function getResHexDump(bytes: Uint8Array, maxBytes = 512) {
  const limit = Math.min(bytes.length, maxBytes);
  const lines: string[] = [];
  for (let i = 0; i < limit; i += 16) {
    const row = bytes.subarray(i, Math.min(i + 16, limit));
    const hex = Array.from(row)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = Array.from(row)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(4, '0')}  ${hex}  ${ascii}`);
  }
  if (bytes.length > maxBytes) {
    lines.push(`… (${bytes.length - maxBytes} more bytes)`);
  }
  return lines.join('\n');
}

export function triggerBytesDownload(bytes: Uint8Array, filename: string) {
  const plain = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(plain).set(bytes);
  const blob = new Blob([plain], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
