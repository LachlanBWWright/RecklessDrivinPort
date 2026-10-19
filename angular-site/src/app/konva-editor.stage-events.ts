import Konva from 'konva';

export interface StageEventCallbacks {
  onStageDblClick?: (worldX: number, worldY: number) => void;
  onStageRightClick?: (worldX: number, worldY: number) => void;
  onStageMouseDown?: (cssX: number, cssY: number, button: number, targetIsStage: boolean) => void;
  onStageMouseMove?: (cssX: number, cssY: number) => void;
  onStageMouseUp?: (button: number) => void;
}

export function installStageEvents(
  stage: Konva.Stage,
  stageToWorld: (stageX: number, stageY: number) => [number, number],
  callbacks: StageEventCallbacks,
): void {
  stage.on('dblclick', (event) => {
    if (event.target !== stage) return;
    const position = stage.getPointerPosition();
    if (!position) return;
    const [worldX, worldY] = stageToWorld(position.x, position.y);
    callbacks.onStageDblClick?.(worldX, worldY);
  });

  stage.on('contextmenu', (event) => {
    event.evt.preventDefault();
    if (event.target !== stage) return;
    const position = stage.getPointerPosition();
    if (!position) return;
    const [worldX, worldY] = stageToWorld(position.x, position.y);
    callbacks.onStageRightClick?.(worldX, worldY);
  });

  stage.on('mousedown', (event) => {
    const position = stage.getPointerPosition();
    if (!position) return;
    callbacks.onStageMouseDown?.(position.x, position.y, event.evt.button, event.target === stage);
  });

  stage.on('mousemove', () => {
    const position = stage.getPointerPosition();
    if (!position) return;
    callbacks.onStageMouseMove?.(position.x, position.y);
  });

  stage.on('mouseup', (event) => callbacks.onStageMouseUp?.(event.evt.button));
}
