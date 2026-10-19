import Konva from 'konva';
import type { KonvaWorldNode } from './konva-editor.types';

export function applyPanMode(
  isPan: boolean,
  objectNodes: KonvaWorldNode[],
  trackGroup: Konva.Group | null,
  marksGroup: Konva.Group | null,
  finishLine: Konva.Line | null,
): void {
  for (const node of objectNodes) node.draggable(!isPan);
  updateGroupNodes(trackGroup, isPan);
  updateGroupNodes(marksGroup, isPan);
  finishLine?.draggable(!isPan);
}

function updateGroupNodes(group: Konva.Group | null, isPan: boolean): void {
  if (!group) return;
  for (const node of group.children) node.draggable(!isPan);
}
