import Konva from 'konva';
import type { ObjectPos } from './level-editor.service';
import { FALLBACK_CIRCLE_WORLD_R } from './konva-editor.types';
import type { KonvaWorldNode } from './konva-editor.types';

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

    let node: KonvaWorldNode;

    if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) {
      const W = img.width;
      const H = img.height;
      const group = new Konva.Group({
        x:         obj.x,
        y:         -obj.y,
        rotation:  (-obj.dir * 180) / Math.PI,
        draggable: !panMode,
        id:        `obj-${i}`,
      });
      group.add(new Konva.Image({ image: img, width: W, height: H, offsetX: W/2, offsetY: H/2, opacity: visible ? 1 : 0.3 }));
      if (isSel) {
        group.add(new Konva.Circle({ radius: Math.max(W,H)/2 + 6, stroke: '#ffffff', strokeWidth: 2 / sx, fill: 'transparent' }));
      }
      node = group;
    } else {
      const color = paletteColors[typeIdx] ?? '#888888';
      node = new Konva.Circle({ x: obj.x, y: -obj.y, radius: FALLBACK_CIRCLE_WORLD_R, fill: isSel ? '#ffe082' : color, stroke: isSel ? '#fff' : 'rgba(0,0,0,0.3)', strokeWidth: isSel ? 2/sx : 1/sx, opacity: visible ? 1 : 0.3, draggable: !panMode, id: `obj-${i}` });
    }

    const eventNode = node as Konva.Node;
    eventNode.on('dragend', () => {
      const wx = node.x();
      const wy = -node.y();
      onObjectDragEnd?.(i, Math.round(wx), Math.round(wy));
    });
    eventNode.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onObjectClick?.(i); });

    worldGroup.add(node);
    nodes.push(node);
  });

  return { nodes };
}
