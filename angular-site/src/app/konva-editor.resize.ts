import Konva from 'konva';

export interface ResizeState {
  logicalW: number;
  logicalH: number;
  cssW: number;
  cssH: number;
}

export function resizeStage(
  stage: Konva.Stage | null,
  bgImageNode: Konva.Image | null,
  state: ResizeState,
  cssW: number,
  cssH: number,
  applyTransform: () => void,
): void {
  if (!stage) return;
  if (cssW > 0) {
    state.cssW = cssW;
    state.logicalW = cssW;
  }
  if (cssH > 0) {
    state.cssH = cssH;
    state.logicalH = cssH;
  }
  if (bgImageNode) {
    bgImageNode.width(state.logicalW);
    bgImageNode.height(state.logicalH);
    bgImageNode.offsetX(state.logicalW / 2);
    bgImageNode.offsetY(state.logicalH / 2);
  }
  stage.width(state.cssW);
  stage.height(state.cssH);
  applyTransform();
}
