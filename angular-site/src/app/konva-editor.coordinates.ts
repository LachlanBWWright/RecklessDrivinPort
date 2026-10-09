export function worldToStage(
  wx: number,
  wy: number,
  zoom: number,
  panX: number,
  panY: number,
  cssW: number,
  cssH: number,
  logicalW: number,
  logicalH: number,
): [number, number] {
  const sx = cssW / logicalW;
  const sy = cssH / logicalH;
  return [cssW / 2 + (wx - panX) * zoom * sx, cssH / 2 - (wy - panY) * zoom * sy];
}

export function stageToWorld(
  stageX: number,
  stageY: number,
  zoom: number,
  panX: number,
  panY: number,
  cssW: number,
  cssH: number,
  logicalW: number,
  logicalH: number,
): [number, number] {
  const sx = cssW / logicalW;
  const sy = cssH / logicalH;
  return [(stageX - cssW / 2) / (zoom * sx) + panX, -((stageY - cssH / 2) / (zoom * sy)) + panY];
}
