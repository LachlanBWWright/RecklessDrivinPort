import type { MarkSeg } from './level-editor.service';

export function markWorldToCanvas(
  wx: number,
  wy: number,
  canvas: HTMLCanvasElement,
  minX: number,
  minY: number,
  rangeX: number,
  rangeY: number,
): [number, number] {
  const pad = 24;
  const W = canvas.width;
  const H = canvas.height;
  const cx = pad + ((wx - minX) / (rangeX || 1)) * (W - 2 * pad);
  const cy = H - pad - ((wy - minY) / (rangeY || 1)) * (H - 2 * pad);
  return [cx, cy];
}

export function markBounds(ms: MarkSeg[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rangeX: number;
  rangeY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of ms) {
    if (m.x1 < minX) minX = m.x1;
    if (m.x2 < minX) minX = m.x2;
    if (m.y1 < minY) minY = m.y1;
    if (m.y2 < minY) minY = m.y2;
    if (m.x1 > maxX) maxX = m.x1;
    if (m.x2 > maxX) maxX = m.x2;
    if (m.y1 > maxY) maxY = m.y1;
    if (m.y2 > maxY) maxY = m.y2;
  }
  return { minX, minY, maxX, maxY, rangeX: maxX - minX, rangeY: maxY - minY };
}

export function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

import type { App } from './app';

export function redrawMarkCanvas(host: App): void {
  const canvas = document.getElementById('mark-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const ms = host.marks();
  const selIdx = host.selectedMarkIndex();

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  if (ms.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '13px monospace';
    ctx.fillText('No mark segments. Click "+ Add Mark" to add one.', 20, H / 2);
    if (!host.markCreateMode() || host._pendingMarkPoints.length === 0) return;
  }

  const boundsSource =
    ms.length > 0
      ? ms
      : [
          {
            x1: host._pendingMarkPoints[0].x,
            y1: host._pendingMarkPoints[0].y,
            x2: host._pendingMarkPoints[0].x,
            y2: host._pendingMarkPoints[0].y,
          },
        ];
  const { minX, minY, rangeX, rangeY } = markBounds(boundsSource);
  const toC = (wx: number, wy: number) => markWorldToCanvas(wx, wy, canvas, minX, minY, rangeX, rangeY);

  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const [ax, ay] = toC(m.x1, m.y1);
    const [bx, by] = toC(m.x2, m.y2);
    const isSel = i === selIdx;

    ctx.strokeStyle = isSel ? '#42a5f5' : '#555';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.fillStyle = isSel ? '#42a5f5' : '#888';
    ctx.beginPath();
    ctx.arc(ax, ay, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();

    if (isSel) {
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.fillText(`P1(${m.x1},${m.y1})`, ax + 8, ay - 4);
      ctx.fillText(`P2(${m.x2},${m.y2})`, bx + 8, by - 4);
    }
  }

  if (host.markCreateMode() && host._pendingMarkPoints.length > 0) {
    const last = host._pendingMarkPoints[host._pendingMarkPoints.length - 1];
    const [lx, ly] = toC(last.x, last.y);
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, Math.PI * 2);
    ctx.fill();
    if (host._markCreateHoverPoint) {
      const [hx, hy] = toC(host._markCreateHoverPoint.x, host._markCreateHoverPoint.y);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

export function onMarkCanvasMouseDown(host: App, event: MouseEvent): void {
  const canvas = event.target;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ms = host.marks();
  if (ms.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const ox = event.offsetX * scaleX;
  const oy = event.offsetY * scaleY;

  const { minX, minY, rangeX, rangeY } = markBounds(ms);
  const hitR = 8;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const [ax, ay] = markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
    const [bx, by] = markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
    if (pointToSegmentDist(ox, oy, ax, ay, ax, ay) < hitR) {
      host.selectedMarkIndex.set(i);
      host.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p1' });
      return;
    }
    if (pointToSegmentDist(ox, oy, bx, by, bx, by) < hitR) {
      host.selectedMarkIndex.set(i);
      host.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p2' });
      return;
    }
  }
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const [ax, ay] = markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
    const [bx, by] = markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
    const dist = pointToSegmentDist(ox, oy, ax, ay, bx, by);
    if (dist < 8) {
      host.selectedMarkIndex.set(i);
      return;
    }
  }
}

export function onMarkCanvasMouseMove(host: App, event: MouseEvent): void {
  const drag = host.dragMarkEndpoint();
  if (!drag) return;
  const canvas = event.target;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ms = host.marks();
  const { minX, minY, rangeX: rawRangeX, rangeY: rawRangeY } = markBounds(ms);
  const rangeX = Math.max(rawRangeX, 100);
  const rangeY = Math.max(rawRangeY, 100);
  const pad = 24;
  const W = canvas.width;
  const H = canvas.height;

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const ox = event.offsetX * scaleX;
  const oy = event.offsetY * scaleY;

  const wx = Math.round(minX + ((ox - pad) / (W - 2 * pad)) * rangeX);
  const wy = Math.round(minY + ((H - pad - oy) / (H - 2 * pad)) * rangeY);
  const newMs = [...ms];
  if (drag.endpoint === 'p1') {
    newMs[drag.markIdx] = { ...newMs[drag.markIdx], x1: wx, y1: wy };
  } else {
    newMs[drag.markIdx] = { ...newMs[drag.markIdx], x2: wx, y2: wy };
  }
  host.marks.set(newMs);
}

export function onMarkCanvasMouseUp(host: App): void {
  host.dragMarkEndpoint.set(null);
}
