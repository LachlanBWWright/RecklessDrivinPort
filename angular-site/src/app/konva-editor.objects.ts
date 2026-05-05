import Konva from 'konva';
import type { ObjectPos } from './level-editor.service';
import { FALLBACK_CIRCLE_WORLD_R } from './konva-editor.types';
import type { KonvaWorldNode } from './konva-editor.types';
import {
  worldDirToKonvaRotationDeg,
  worldVectorToDir,
} from './object-direction-utils';

export function buildObjects(
  worldGroup: Konva.Group | null,
  objectsLayer: Konva.Layer | null,
  objects: ObjectPos[],
  selectedIndex: number | null,
  visibleTypes: Set<number>,
  paletteColors: string[],
  getImageForType: (typeRes: number) => CanvasImageSource | null,
  panMode: boolean,
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  onObjectDragEnd?: (index: number, wx: number, wy: number) => void,
  onObjectClick?: (index: number) => void,
  onObjectRotateStart?: (index: number) => void,
  onObjectRotateMove?: (index: number, worldDir: number) => void,
  onObjectRotateEnd?: (index: number, worldDir: number) => void,
): { nodes: KonvaWorldNode[] } {
  if (!worldGroup || !objectsLayer) return { nodes: [] };

  void logicalW;
  const sy = zoom * (cssH / logicalH);
  const screenToWorld = 1 / Math.max(0.0001, sy);
  const PALETTE_LEN = paletteColors.length;
  const nodes: KonvaWorldNode[] = [];

  worldGroup.destroyChildren();

  objects.forEach((obj, i) => {
    const typeIdx = ((obj.typeRes % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
    const visible = visibleTypes.has(typeIdx);
    if (!visible && i !== selectedIndex) return;

    const isSel = i === selectedIndex;
    const img   = getImageForType(obj.typeRes);
    const objectRadius = img instanceof HTMLCanvasElement || img instanceof HTMLImageElement
      ? Math.max(img.width, img.height) / 2
      : FALLBACK_CIRCLE_WORLD_R;

    let node: KonvaWorldNode;

    if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) {
      const W = img.width;
      const H = img.height;
      const group = new Konva.Group({
        x:         obj.x,
        y:         -obj.y,
        rotation:  worldDirToKonvaRotationDeg(obj.dir),
        draggable: !panMode,
        id:        `obj-${i}`,
      });
      group.add(new Konva.Image({ image: img, width: W, height: H, offsetX: W/2, offsetY: H/2, opacity: visible ? 1 : 0.3 }));
      node = group;
      worldGroup.add(node);
      nodes.push(node);
    } else {
      const color = paletteColors[typeIdx] ?? '#888888';
      node = new Konva.Circle({ x: obj.x, y: -obj.y, radius: FALLBACK_CIRCLE_WORLD_R, fill: isSel ? '#ffe082' : color, stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1, opacity: visible ? 1 : 0.3, draggable: !panMode, id: `obj-${i}` });
      worldGroup.add(node);
      nodes.push(node);
    }

    const eventNode = node as Konva.Node;
    eventNode.on('dragend', () => {
      const wx = node.x();
      const wy = -node.y();
      onObjectDragEnd?.(i, Math.round(wx), Math.round(wy));
    });
    eventNode.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onObjectClick?.(i); });

    if (isSel) {
      const handleOffset = objectRadius + 34 * screenToWorld;
      const handleRadius = 7 * screenToWorld;
      const strokeWidth = Math.max(1, 1.5 * screenToWorld);
      const hitStrokeWidth = 14 * screenToWorld;
      const adornment = new Konva.Group({
        x: obj.x,
        y: -obj.y,
        rotation: worldDirToKonvaRotationDeg(obj.dir),
        listening: true,
        id: `obj-${i}-rotate-handle`,
      });
      const stick = new Konva.Line({
        points: [0, -objectRadius, 0, -handleOffset],
        stroke: '#ffffff',
        strokeWidth,
        hitStrokeWidth,
        shadowColor: 'rgba(0,0,0,0.55)',
        shadowBlur: 2 * screenToWorld,
        shadowOffset: { x: 0, y: 1 * screenToWorld },
        listening: false,
      });
      const nub = new Konva.Circle({
        x: 0,
        y: -handleOffset,
        radius: handleRadius,
        fill: '#f9a825',
        stroke: '#ffffff',
        strokeWidth,
        hitStrokeWidth,
        draggable: !panMode,
      });
      let currentDir = obj.dir;
      const emitRotation = () => {
        const absolute = nub.getAbsolutePosition();
        const transform = worldGroup.getAbsoluteTransform().copy().invert();
        const pointer = transform.point(absolute);
        const worldDir = worldVectorToDir(pointer.x - obj.x, pointer.y - (-obj.y));
        currentDir = worldDir;
        onObjectRotateMove?.(i, worldDir);
        eventNode.rotation(worldDirToKonvaRotationDeg(worldDir));
        adornment.rotation(worldDirToKonvaRotationDeg(worldDir));
        nub.position({ x: 0, y: -handleOffset });
      };
      nub.dragBoundFunc((pos) => pos);
      nub.on('dragstart', (e) => {
        e.cancelBubble = true;
        document.body.style.cursor = 'grabbing';
        onObjectRotateStart?.(i);
      });
      nub.on('dragmove', (e) => {
        e.cancelBubble = true;
        emitRotation();
      });
      nub.on('dragend', (e) => {
        e.cancelBubble = true;
        document.body.style.cursor = '';
        emitRotation();
        onObjectRotateEnd?.(i, currentDir);
        nub.position({ x: 0, y: -handleOffset });
      });
      nub.on('mouseenter', () => { document.body.style.cursor = 'grab'; });
      nub.on('mouseleave', () => { if (!nub.isDragging()) document.body.style.cursor = ''; });
      nub.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; });
      adornment.add(stick, nub);
      worldGroup.add(adornment);
      eventNode.on('dragmove', () => {
        adornment.position({ x: node.x(), y: node.y() });
      });
    }

  });

  return { nodes };
}
