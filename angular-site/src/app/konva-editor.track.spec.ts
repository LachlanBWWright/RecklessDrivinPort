import { vi } from 'vitest';
import Konva from 'konva';
import { buildTrackWaypoints } from './konva-editor.track';
import { applyPanMode } from './konva-editor-pan-mode';

it('selects a different waypoint after rebuilding during pan mode and releasing pan', () => {
  const detection = vi.spyOn(Konva.Util, 'isCanvasFarblingActive').mockReturnValue(false);
  const group = new Konva.Group();
  const selected: number[] = [];
  const points = [0, 100].map((y) => ({ x: 0, y, velo: 20, flags: 0 }));
  buildTrackWaypoints(
    group,
    { draw() {} },
    points,
    [],
    true,
    600,
    500,
    600,
    500,
    1,
    undefined,
    undefined,
    undefined,
    (_track, index) => selected.push(index),
  );
  const point = group.findOne('#wp-up-1');
  expect(point).toBeInstanceOf(Konva.Circle);
  if (!(point instanceof Konva.Circle)) return;
  point.fire('click', { evt: new MouseEvent('click') });
  expect(selected).toEqual([]);
  applyPanMode(false, [], group, null, null);
  point.fire('click', { evt: new MouseEvent('click') });
  expect(selected).toEqual([1]);
  applyPanMode(true, [], group, null, null);
  point.fire('click', { evt: new MouseEvent('click') });
  expect(selected).toEqual([1]);
  group.destroy();
  detection.mockRestore();
});
