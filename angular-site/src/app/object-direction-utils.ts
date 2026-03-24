export function worldDirToCanvasRotationRad(dir: number): number {
  return -dir;
}

export function worldDirToKonvaRotationDeg(dir: number): number {
  return (worldDirToCanvasRotationRad(dir) * 180) / Math.PI;
}

export function worldDirToCanvasForwardVector(dir: number, length: number): { dx: number; dy: number } {
  return {
    dx: Math.sin(dir) * length,
    dy: -Math.cos(dir) * length,
  };
}
