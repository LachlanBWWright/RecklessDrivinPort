import Konva from 'konva';
import { profiler } from './konva-editor.profiler';

export function flushLayers(dirtyLayers: Set<Konva.Layer>): void {
  const timer = profiler.start('konva.flush');
  for (const layer of dirtyLayers) layer.draw();
  dirtyLayers.clear();
  timer.end();
}
