import { resultFromThrowable } from './result-helpers';

const canvasToDataUrl = resultFromThrowable((canvas: HTMLCanvasElement) => canvas.toDataURL(), 'Failed to encode canvas');

export function getCanvasDataUrl(cache: Map<number, string>, canvases: Map<number, HTMLCanvasElement>, id: number) {
  const cached = cache.get(id);
  if (cached) return cached;
  const canvas = canvases.get(id) ?? null;
  if (!canvas) return null;
  return canvasToDataUrl(canvas).match(
    (url) => {
      cache.set(id, url);
      return url;
    },
    () => null,
  );
}

export function getKeyedCanvasDataUrl(
  cache: Map<string, string>,
  canvases: Map<string, HTMLCanvasElement>,
  key: string,
) {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = canvases.get(key);
  if (!canvas) return null;
  return canvasToDataUrl(canvas).match(
    (url) => {
      cache.set(key, url);
      return url;
    },
    () => null,
  );
}
