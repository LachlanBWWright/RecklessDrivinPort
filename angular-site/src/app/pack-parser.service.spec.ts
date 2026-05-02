import { cryptPackHandle, decompressedPackEntries, encodePackHandle, parsePackHandle } from './pack-parser.service';
import { packHandleCompress, packHandleDecompress } from './lzrw.service';

/** Build a minimal decompressed pack with n entries. */
function buildDecompressedPack(entries: Array<{ id: number; data: Uint8Array }>): Uint8Array {
  const headerCount = entries.length + 1;
  const headerBytes = headerCount * 8;
  const totalData = entries.reduce((s, e) => s + e.data.length, 0);
  const buf = new Uint8Array(headerBytes + totalData);
  const view = new DataView(buf.buffer);

  view.setInt16(0, entries.length, false); // numEntries

  let dataOffset = headerBytes;
  for (let i = 0; i < entries.length; i++) {
    const hdrOff = (i + 1) * 8;
    view.setInt16(hdrOff, entries[i].id, false);
    view.setUint32(hdrOff + 4, dataOffset, false);
    buf.set(entries[i].data, dataOffset);
    dataOffset += entries[i].data.length;
  }
  return buf;
}

describe('decompressedPackEntries', () => {
  it('returns empty array for too-short data', () => {
    expect(decompressedPackEntries(new Uint8Array(4))).toEqual([]);
  });

  it('parses single entry', () => {
    const pack = buildDecompressedPack([{ id: 1, data: new Uint8Array([0xde, 0xad]) }]);
    const entries = decompressedPackEntries(pack);
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe(1);
    expect(Array.from(entries[0].data)).toEqual([0xde, 0xad]);
  });

  it('parses multiple entries', () => {
    const pack = buildDecompressedPack([
      { id: 1, data: new Uint8Array([1, 2]) },
      { id: 2, data: new Uint8Array([3, 4, 5]) },
    ]);
    const entries = decompressedPackEntries(pack);
    expect(entries.length).toBe(2);
    expect(entries[0].id).toBe(1);
    expect(entries[1].id).toBe(2);
    expect(entries[1].data.length).toBe(3);
  });
});

describe('encodePackHandle / decompressedPackEntries round-trip', () => {
  it('preserves entry data round-trip (unencrypted)', () => {
    const originalEntries = [
      { id: 1, data: new Uint8Array([10, 20, 30]) },
      { id: 2, data: new Uint8Array([40, 50]) },
    ];
    // resourceId 140 = unencrypted level 1
    const handle = encodePackHandle(originalEntries, 140);
    const decompressedResult = packHandleDecompress(handle);
    expect(decompressedResult.isOk()).toBe(true);
    if (decompressedResult.isErr()) return;
    const decompressed = decompressedResult.value;
    const entries = decompressedPackEntries(decompressed);
    expect(entries.length).toBe(2);
    expect(Array.from(entries[0].data)).toEqual([10, 20, 30]);
    expect(Array.from(entries[1].data)).toEqual([40, 50]);
  });

  it('preserves entry data round-trip (encrypted, resourceId 143)', () => {
    const originalEntries = [
      { id: 1, data: new Uint8Array([0xAA, 0xBB, 0xCC]) },
      { id: 2, data: new Uint8Array([0x11, 0x22]) },
    ];
    // resourceId 143 = encrypted level 4 (kPackLevel4)
    const handle = encodePackHandle(originalEntries, 143);
    const entries = parsePackHandle(handle, 143);
    expect(entries.length).toBe(2);
    expect(Array.from(entries[0].data)).toEqual([0xAA, 0xBB, 0xCC]);
    expect(Array.from(entries[1].data)).toEqual([0x11, 0x22]);
  });

  it('preserves entry data round-trip (encrypted, resourceId 149)', () => {
    const originalEntries = [
      { id: 1, data: new Uint8Array(50).fill(0x55) },
    ];
    const handle = encodePackHandle(originalEntries, 149);
    const entries = parsePackHandle(handle, 149);
    expect(entries.length).toBe(1);
    expect(Array.from(entries[0].data)).toEqual(Array.from(new Uint8Array(50).fill(0x55)));
  });
});

describe('cryptPackHandle', () => {
  it('is its own inverse (XOR)', () => {
    const data = new Uint8Array(300);
    for (let i = 0; i < 300; i++) data[i] = i & 0xff;
    const copy1 = data.slice();
    const copy2 = data.slice();
    cryptPackHandle(copy1);
    cryptPackHandle(copy2);
    // Encrypting twice should yield the original
    cryptPackHandle(copy1);
    expect(Array.from(copy1)).toEqual(Array.from(data));
  });

  it('does not modify first 256 bytes (kUnCryptedHeader)', () => {
    const data = new Uint8Array(300);
    for (let i = 0; i < 300; i++) data[i] = i & 0xff;
    const original = data.slice(0, 256);
    cryptPackHandle(data);
    expect(Array.from(data.slice(0, 256))).toEqual(Array.from(original));
  });

  it('modifies bytes after offset 256', () => {
    const data = new Uint8Array(300);
    data.fill(0xff);
    const before = data.slice();
    cryptPackHandle(data);
    // Some byte after 256 should differ (non-zero key)
    const changed = data.slice(256).some((b, i) => b !== before[256 + i]);
    expect(changed).toBe(true);
  });
});
