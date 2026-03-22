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

    const packed = service.serialize(entries);
    const unpacked = service.parse(packed);

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
    expect(() => service.parse(broken)).toThrowError(/Invalid resources\.dat/);
  });

  it('re-serializes the shipped resources.dat byte-for-byte', () => {
    const original = new Uint8Array(readFileSync(repoResourcesPath));
    const reparsed = service.serialize(service.parse(original));
    expect(reparsed.length).toBe(original.length);

    let firstDiff = -1;
    for (let index = 0; index < original.length; index += 1) {
      if (reparsed[index] !== original[index]) {
        firstDiff = index;
        break;
      }
    }

    expect(firstDiff).toBe(-1);
  }, 60000);
});
