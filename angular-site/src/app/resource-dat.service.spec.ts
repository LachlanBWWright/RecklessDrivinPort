import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResourceDatService, type ResourceDatEntry } from './resource-dat.service';

describe('ResourceDatService', () => {
  const service = new ResourceDatService();
  const repoResourcesPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../port/resources/resources.dat',
  );

  it('round-trips resources.dat entries', () => {
    const entries: ResourceDatEntry[] = [
      {
        type: 'Pack',
        id: 140,
        data: new Uint8Array([1, 2, 3, 4]),
      },
      {
        type: 'PPic',
        id: 1000,
        data: new Uint8Array([255, 0, 16]),
      },
    ];

    const packedResult = service.serialize(entries);
    expect(packedResult.isOk()).toBe(true);
    if (packedResult.isErr()) return;

    const unpackedResult = service.parse(packedResult.value);
    expect(unpackedResult.isOk()).toBe(true);
    if (unpackedResult.isErr()) return;
    const unpacked = unpackedResult.value;

    expect(unpacked).toHaveLength(2);
    expect(unpacked[0].type).toBe('Pack');
    expect(unpacked[0].id).toBe(140);
    expect(Array.from(unpacked[0].data)).toEqual([1, 2, 3, 4]);
    expect(unpacked[1].type).toBe('PPic');
    expect(unpacked[1].id).toBe(1000);
    expect(Array.from(unpacked[1].data)).toEqual([255, 0, 16]);
  });

  it('rejects truncated input', () => {
    const broken = new Uint8Array([1, 2, 3]);
    const result = service.parse(broken);
    expect(result.isErr()).toBe(true);
  });

  it('re-serializes the shipped resources.dat byte-for-byte', () => {
    const original = new Uint8Array(readFileSync(repoResourcesPath));
    const parsed = service.parse(original);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;
    const reparsed = service.serialize(parsed.value);
    expect(reparsed.isOk()).toBe(true);
    if (reparsed.isErr()) return;
    expect(reparsed.value.length).toBe(original.length);

    let firstDiff = -1;
    for (let index = 0; index < original.length; index += 1) {
      if (reparsed.value[index] !== original[index]) {
        firstDiff = index;
        break;
      }
    }

    expect(firstDiff).toBe(-1);
  }, 60000);
});
