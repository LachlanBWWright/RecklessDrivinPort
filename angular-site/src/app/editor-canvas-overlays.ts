import type {
  MarkSeg,
  ObjectTypeDefinition,
  TextureTileEntry,
  TrackMidpointRef,
  TrackWaypointRef,
} from './level-editor.service';

export interface TrackOverlayPoint {
  x: number;
  y: number;
}

export function drawObjectTrackOverlay(
  ctx: CanvasRenderingContext2D,
  worldToCanvas: (x: number, y: number) => [number, number],
  zoom: number,
  interactionLocked: boolean,
  dragWp: TrackWaypointRef | null,
  hoverWp: TrackWaypointRef | null,
  hoverMid: TrackMidpointRef | null,
  editTrackUp: { x: number; y: number }[],
  editTrackDown: { x: number; y: number }[],
) {
  const canvas = ctx.canvas as HTMLCanvasElement;
  const width = canvas.width;
  const height = canvas.height;

  const drawPath = (
    segs: { x: number; y: number }[],
    lineColor: string,
    dotColor: string,
    label: string,
    track: 'up' | 'down',
  ) => {
    if (segs.length === 0) return;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(1.5, 2.5 * Math.min(zoom, 1));
    ctx.beginPath();
    segs.forEach((seg, i) => {
      const [cx, cy] = worldToCanvas(seg.x, seg.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    const arrowStep = Math.max(1, Math.floor(segs.length / 10));
    ctx.fillStyle = lineColor;
    for (let i = arrowStep; i < segs.length - 1; i += arrowStep) {
      const [x1, y1] = worldToCanvas(segs[i - 1].x, segs[i - 1].y);
      const [x2, y2] = worldToCanvas(segs[i].x, segs[i].y);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const sz = 7;
      ctx.save();
      ctx.translate(x2, y2);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-sz, -sz / 2);
      ctx.lineTo(-sz, sz / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const showAllMids = zoom > 0.5 && segs.length <= 80;
    for (let i = 0; i < segs.length - 1; i++) {
      const isHovMid = !interactionLocked && hoverMid?.track === track && hoverMid.segIdx === i;
      if (!isHovMid && !showAllMids) continue;
      const mx = (segs[i].x + segs[i + 1].x) / 2;
      const my = (segs[i].y + segs[i + 1].y) / 2;
      const [cx, cy] = worldToCanvas(mx, my);
      if (cx < -10 || cx > width + 10 || cy < -10 || cy > height + 10) continue;
      const size = isHovMid ? 9 : 5;
      ctx.fillStyle = isHovMid ? '#ffdd00' : 'rgba(255,255,255,0.35)';
      ctx.strokeStyle = isHovMid ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = isHovMid ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const dotEvery = Math.max(1, Math.floor(segs.length / 40));
    const dotR = Math.max(3, Math.min(6, 4 * zoom));
    for (let i = 0; i < segs.length; i += dotEvery) {
      const [cx, cy] = worldToCanvas(segs[i].x, segs[i].y);
      if (cx < -10 || cx > width + 10 || cy < -10 || cy > height + 10) continue;
      const isDragged = !interactionLocked && dragWp?.track === track && dragWp.segIdx === i;
      const isHovered =
        !interactionLocked && !isDragged && hoverWp?.track === track && hoverWp.segIdx === i;
      ctx.fillStyle = interactionLocked
        ? 'rgba(158, 158, 158, 0.75)'
        : isDragged
          ? '#ffffff'
          : isHovered
            ? '#ffdd00'
            : dotColor;
      ctx.beginPath();
      ctx.arc(cx, cy, isDragged ? dotR + 3 : isHovered ? dotR + 2 : dotR, 0, Math.PI * 2);
      ctx.fill();
      if (isHovered) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const [sx, sy] = worldToCanvas(segs[0].x, segs[0].y);
    if (sx > -20 && sx < width + 20 && sy > -20 && sy < height + 20) {
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 10px monospace';
      ctx.fillText(label, sx + 9, sy + 4);
    }
  };

  drawPath(editTrackUp, 'rgba(66,165,245,0.9)', 'rgba(66,165,245,0.7)', '▲ Up', 'up');
  drawPath(editTrackDown, 'rgba(239,83,80,0.9)', 'rgba(239,83,80,0.7)', '▼ Down', 'down');

  if (interactionLocked) {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 20, 28, 0.76)';
    ctx.fillRect(8, 8, 248, 26);
    ctx.fillStyle = 'rgba(255, 214, 102, 0.95)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Track nubs locked while barrier draw is active', 14, 25);
    ctx.restore();
  }
}

export function drawMarksOnCanvas(
  ctx: CanvasRenderingContext2D,
  worldToCanvas: (x: number, y: number) => [number, number],
  marks: MarkSeg[],
  selectedMarkIndex: number | null,
  konvaActive: boolean,
  markCreateMode: boolean,
  interactionLocked: boolean,
  pendingMarkPoints: TrackOverlayPoint[],
  markCreateHoverPoint: TrackOverlayPoint | null,
) {
  marks.forEach((m, i) => {
    const [x1, y1] = worldToCanvas(m.x1, m.y1);
    const [x2, y2] = worldToCanvas(m.x2, m.y2);
    const isSel = i === selectedMarkIndex;
    ctx.strokeStyle = isSel ? '#00e5ff' : '#ffd600';
    ctx.lineWidth = isSel ? 3 : 2;
    ctx.setLineDash(isSel ? [] : [8, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (!konvaActive) {
      ctx.fillStyle = interactionLocked
        ? 'rgba(189, 189, 189, 0.9)'
        : isSel
          ? '#00e5ff'
          : '#ffd600';
      [
        [x1, y1],
        [x2, y2],
      ].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, isSel ? 12 : 8, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });

  if (markCreateMode && pendingMarkPoints.length > 0) {
    const last = pendingMarkPoints[pendingMarkPoints.length - 1];
    const [px, py] = worldToCanvas(last.x, last.y);
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    if (markCreateHoverPoint) {
      const [hx, hy] = worldToCanvas(markCreateHoverPoint.x, markCreateHoverPoint.y);
      ctx.strokeStyle = 'rgba(0,229,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (interactionLocked) {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 20, 28, 0.76)';
    ctx.fillRect(8, 36, 248, 26);
    ctx.fillStyle = 'rgba(255, 214, 102, 0.95)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Marking nubs locked while barrier draw is active', 14, 53);
    ctx.restore();
  }
}

export function getTileDimensions(entries: TextureTileEntry[], texId: number) {
  const entry = entries.find((tile) => tile.texId === texId);
  if (!entry) return '?';
  return `${entry.width}×${entry.height} px`;
}

export function getObjTypeDimensionLabel(objectTypeDefinitionMap: Map<number, ObjectTypeDefinition>, typeRes: number) {
  const def = objectTypeDefinitionMap.get(typeRes);
  if (!def) return '';
  return `${def.width.toFixed(1)}×${def.length.toFixed(1)} m`;
}
