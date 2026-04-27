import Konva from 'konva';
import type { ObjectPos } from './level-editor.service';
import { FALLBACK_CIRCLE_WORLD_R } from './konva-editor.types';
import type { KonvaWorldNode } from './konva-editor.types';
import { worldDirToCanvasForwardVector, worldDirToKonvaRotationDeg, worldVectorToDir } from './object-direction-utils';

const ROTATE_HANDLE_RADIUS = 8;
const ROTATE_HANDLE_STROKE = 2;
const ROTATE_HANDLE_LINE_STROKE = 1.5;
const ROTATE_HANDLE_DISTANCE = 28;

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
  onObjectRotateMove?: (index: number, worldDir: number) => void,
  onObjectRotateEnd?: (index: number, worldDir: number) => void,
): { nodes: KonvaWorldNode[] } {
  if (!worldGroup || !objectsLayer) return { nodes: [] };

  const PALETTE_LEN = paletteColors.length;
  const sx = zoom * (cssW / logicalW);
  const nodes: KonvaWorldNode[] = [];

  worldGroup.destroyChildren();

  objects.forEach((obj, i) => {
    const typeIdx = ((obj.typeRes % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
    const visible = visibleTypes.has(typeIdx);
    if (!visible && i !== selectedIndex) return;

    const isSel = i === selectedIndex;
    const img   = getImageForType(obj.typeRes);
    const addRotationGizmo = (objectRadius: number, rotateNode: Konva.Group | null): void => {
      if (!isSel) return;
      const handleRadius = ROTATE_HANDLE_RADIUS;
      const handleDistance = Math.max(objectRadius + ROTATE_HANDLE_DISTANCE, handleRadius * 3);
      const centerX = obj.x;
      const centerY = -obj.y;
      const handleLine = new Konva.Line({
        points: [centerX, centerY, centerX, centerY],
        stroke: 'rgba(255,255,255,0.8)',
        strokeWidth: ROTATE_HANDLE_LINE_STROKE / sx,
        lineCap: 'round',
        lineJoin: 'round',
        listening: false,
        id: `obj-rot-line-${i}`,
      });
      const handle = new Konva.Circle({
        x: centerX,
        y: centerY,
        radius: handleRadius,
        fill: '#ffffff',
        stroke: 'rgba(0,0,0,0.75)',
        strokeWidth: ROTATE_HANDLE_STROKE / sx,
        draggable: !panMode,
        id: `obj-rot-${i}`,
      });
      const updateRotationGizmo = (dir: number): void => {
        const handleOffset = worldDirToCanvasForwardVector(dir, handleDistance);
        const handleX = centerX + handleOffset.dx;
        const handleY = centerY + handleOffset.dy;
        rotateNode?.rotation(worldDirToKonvaRotationDeg(dir));
        handleLine.points([centerX, centerY, handleX, handleY]);
        handle.position({ x: handleX, y: handleY });
      };
      updateRotationGizmo(obj.dir);
      handle.dragBoundFunc((pos) => {
        const dx = pos.x - centerX;
        const dy = pos.y - centerY;
        const dir = worldVectorToDir(dx, dy);
        const nextOffset = worldDirToCanvasForwardVector(dir, handleDistance);
        return {
          x: centerX + nextOffset.dx,
          y: centerY + nextOffset.dy,
        };
      });
      handle.on('dragmove', () => {
        const dx = handle.x() - centerX;
        const dy = handle.y() - centerY;
        const dir = worldVectorToDir(dx, dy);
        updateRotationGizmo(dir);
        onObjectRotateMove?.(i, dir);
      });
      handle.on('dragend', () => {
        const dx = handle.x() - centerX;
        const dy = handle.y() - centerY;
        const dir = worldVectorToDir(dx, dy);
        updateRotationGizmo(dir);
        onObjectRotateEnd?.(i, dir);
      });
      handle.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        onObjectClick?.(i);
      });
      worldGroup.add(handleLine);
      worldGroup.add(handle);
      nodes.push(handle);
    };

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
      if (isSel) {
        group.add(new Konva.Circle({ radius: Math.max(W,H)/2 + 6, stroke: '#ffffff', strokeWidth: 2 / sx, fill: 'transparent' }));
      }
      node = group;
      worldGroup.add(node);
      nodes.push(node);
      addRotationGizmo(Math.max(W, H) / 2, group);
    } else {
      const color = paletteColors[typeIdx] ?? '#888888';
      node = new Konva.Circle({ x: obj.x, y: -obj.y, radius: FALLBACK_CIRCLE_WORLD_R, fill: isSel ? '#ffe082' : color, stroke: isSel ? '#fff' : 'rgba(0,0,0,0.3)', strokeWidth: isSel ? 2/sx : 1/sx, opacity: visible ? 1 : 0.3, draggable: !panMode, id: `obj-${i}` });
      worldGroup.add(node);
      nodes.push(node);
      addRotationGizmo(FALLBACK_CIRCLE_WORLD_R, null);
    }

    const eventNode = node as Konva.Node;
    eventNode.on('dragend', () => {
      const wx = node.x();
      const wy = -node.y();
      onObjectDragEnd?.(i, Math.round(wx), Math.round(wy));
    });
    eventNode.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onObjectClick?.(i); });

  });

  return { nodes };
}
