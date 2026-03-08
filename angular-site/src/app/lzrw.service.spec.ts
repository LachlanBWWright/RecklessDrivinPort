import { lzrw3aDecompress, packHandleCompress, packHandleDecompress } from './lzrw.service';

describe('lzrw3aDecompress', () => {
  it('handles empty input', () => {
    const result = lzrw3aDecompress(new Uint8Array(0));
    expect(result.length).toBe(0);
  });

  it('FLAG_COPY (0x01): returns payload unchanged', () => {
    const payload = new Uint8Array([1, 0x61, 0x62, 0x63]); // flag=1, 'a','b','c'
    const result = lzrw3aDecompress(payload);
    expect(Array.from(result)).toEqual([0x61, 0x62, 0x63]);
  });

  it('FLAG_COPY handles single-byte payload', () => {
    const payload = new Uint8Array([1, 0xff]);
    expect(Array.from(lzrw3aDecompress(payload))).toEqual([0xff]);
  });

  it('round-trip via packHandleCompress/Decompress preserves data', () => {
    const original = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const handle = packHandleCompress(original);
    const decompressed = packHandleDecompress(handle);
    expect(Array.from(decompressed)).toEqual(Array.from(original));
  });

  it('packHandleDecompress reads big-endian size header', () => {
    const data = new Uint8Array([1, 2, 3]);
    const handle = packHandleCompress(data);
    // First 4 bytes should be the size (3) in big-endian
    const view = new DataView(handle.buffer);
    expect(view.getUint32(0, false)).toBe(3);
  });

  it('packHandleDecompress throws on handle too short', () => {
    expect(() => packHandleDecompress(new Uint8Array(3))).toThrow();
  });

  it('packHandleCompress produces FLAG_COPY marker', () => {
    const data = new Uint8Array([99]);
    const handle = packHandleCompress(data);
    // byte at offset 4 = FLAG_COPY = 1
    expect(handle[4]).toBe(1);
  });

  it('round-trip with larger data (256 bytes)', () => {
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i++) original[i] = i & 0xff;
    const handle = packHandleCompress(original);
    const result = packHandleDecompress(handle);
    expect(Array.from(result)).toEqual(Array.from(original));
  });

  it('round-trip with all-zero data', () => {
    const original = new Uint8Array(100);
    const result = packHandleDecompress(packHandleCompress(original));
    expect(result.every((b) => b === 0)).toBe(true);
  });
});
