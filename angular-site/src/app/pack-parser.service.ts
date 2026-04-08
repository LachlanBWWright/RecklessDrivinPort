/**
 * Pack format parser for Reckless Drivin'.
 *
 * A decompressed pack is structured as:
 *
 *   tPackHeader[0]   – id = numEntries (big-endian SInt16), offs = unused
 *   tPackHeader[1]   – id = firstEntryID, offs = offset_of_entry1_in_pack
 *   …
 *   tPackHeader[n]   – id = lastEntryID,  offs = offset_of_entryN_in_pack
 *   [entry data…]
 *
 * Each tPackHeader is:  SInt16 id  +  SInt16 placeholder  +  UInt32 offs  = 8 bytes, big-endian.
 *
 * All multi-byte fields in the pack are big-endian (original Mac PPC format).
 *
 * Level packs (resource 'Pack' IDs 140–149, pack indices 12–21):
 *   Entry ID 1  – tLevelData blob (level header + tracks + objects + road)
 *   Entry ID 2  – tMarkSeg array  (finish-line / checkpoint marks)
 *
 * Packs with index >= kEncryptedPack (index 15 = resource ID 143) are XOR-encrypted.
 * The key is gKey = 0x1E42A71F (free registration key, open-source port).
 * Encryption/decryption are the same XOR operation; the first 256 bytes are
 * kUnCryptedHeader bytes and are NOT encrypted.
 */

import { packHandleDecompress, packHandleCompress } from './lzrw.service';

/** kEncryptedPack = 15 (kPackLevel4), so resource IDs >= 143 are encrypted. */
const ENCRYPTED_PACK_INDEX_START = 15;
/** Resource ID = pack index + 128 */
const PACK_RESOURCE_ID_OFFSET = 128;
/** Bytes NOT encrypted at the start of the handle. */
const UNCRYPTED_HEADER = 256;
/** Open-source free registration key. */
const G_KEY = 0x1e42a71f;

export interface PackEntry {
  id: number;
  data: Uint8Array;
}

/** Decrypt (or encrypt) a pack handle in-place using XOR. Idempotent. */
export function cryptPackHandle(handle: Uint8Array): void {
  if (handle.length <= UNCRYPTED_HEADER) return;

  // We read/write 4-byte chunks as big-endian uint32 (DataView, littleEndian=false).
  // The original Mac PPC C code did: *longPtr++ ^= gKey  (big-endian machine)
  // which XORs each 4-byte chunk's bytes as [gKey>>24, gKey>>16, gKey>>8, gKey&ff].
  // When we read big-endian with DataView and XOR with G_KEY directly, we get the
  // same byte-level result — NO byte-swap needed.
  const k = G_KEY;
  const xorKey = k >>> 0; // use G_KEY directly; big-endian DataView handles byte order

  let pos = UNCRYPTED_HEADER;

  // 4-byte aligned XOR
  while (pos + 4 <= handle.length) {
    const view = new DataView(handle.buffer, handle.byteOffset + pos, 4);
    const v = view.getUint32(0, false) ^ xorKey; // big-endian read/write
    view.setUint32(0, v, false);
    pos += 4;
  }

  // Trailing bytes (< 4) use individual key bytes [gKey>>24, gKey>>16, gKey>>8, gKey&ff]
  const keyBytes = [(k >>> 24) & 0xff, (k >>> 16) & 0xff, (k >>> 8) & 0xff, k & 0xff];
  let shift = 0;
  while (pos < handle.length) {
    handle[pos] ^= keyBytes[shift++];
    pos++;
  }
}

/**
 * Decompress and parse a raw pack handle blob.
 *
 * @param handle     – raw bytes from resources.dat (the Pack resource payload)
 * @param resourceId – the resource ID (e.g. 140 for level 1); used to determine encryption
 */
export function parsePackHandle(handle: Uint8Array, resourceId: number): PackEntry[] {
  const packIndex = resourceId - PACK_RESOURCE_ID_OFFSET;
  const isEncrypted = packIndex >= ENCRYPTED_PACK_INDEX_START;

  // Decrypt a copy if needed (handle data must remain unmodified for round-trips).
  let blob = isEncrypted ? handle.slice() : handle;
  if (isEncrypted) {
    cryptPackHandle(blob);
  }

  const decompressedResult = packHandleDecompress(blob);
  if (!decompressedResult.isOk()) return [];
  const decompressed = decompressedResult.value;
  return decompressedPackEntries(decompressed);
}

/** Parse the internal entry table of an already-decompressed pack blob. */
export function decompressedPackEntries(data: Uint8Array): PackEntry[] {
  if (data.length < 8) return [];

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numEntries = view.getInt16(0, false); // big-endian SInt16

  if (numEntries <= 0 || numEntries > 10000) return [];

  const entries: PackEntry[] = [];
  for (let i = 0; i < numEntries; i++) {
    const hdrOff = (i + 1) * 8;
    if (hdrOff + 8 > data.length) break;

    const id = view.getInt16(hdrOff, false);
    const entryOff = view.getUint32(hdrOff + 4, false); // big-endian UInt32

    let entrySize: number;
    if (i === numEntries - 1) {
      entrySize = data.length - entryOff;
    } else {
      const nextOff = view.getUint32((i + 2) * 8 + 4, false);
      entrySize = nextOff - entryOff;
    }

    if (entryOff + entrySize > data.length || entrySize < 0) break;

    entries.push({
      id,
      data: data.slice(entryOff, entryOff + entrySize),
    });
  }

  return entries;
}

/**
 * Re-encode a set of pack entries back into a raw pack handle blob.
 *
 * Writes tPackHeader table + entry data, then wraps with a FLAG_COPY lzrw
 * handle so the runtime can load it without needing a compressor.
 */
export function encodePackHandle(entries: PackEntry[], resourceId: number): Uint8Array {
  if (entries.length === 0) return new Uint8Array(0);

  // Calculate total decompressed size:
  // (numEntries+1) pack headers (8 bytes each) + all entry data
  const headerCount = entries.length + 1; // header[0] + header[1..n]
  const headerBytes = headerCount * 8;
  const totalData = entries.reduce((s, e) => s + e.data.length, 0);
  const decompressedSize = headerBytes + totalData;

  const decompressed = new Uint8Array(decompressedSize);
  const view = new DataView(decompressed.buffer);

  // header[0]: id = numEntries, placeholder = 0, offs = 0
  view.setInt16(0, entries.length, false);
  view.setInt16(2, 0, false);
  view.setUint32(4, 0, false);

  // Compute and write per-entry headers + data
  let dataOffset = headerBytes;
  for (let i = 0; i < entries.length; i++) {
    const hdrOff = (i + 1) * 8;
    view.setInt16(hdrOff, entries[i].id, false);
    view.setInt16(hdrOff + 2, 0, false);
    view.setUint32(hdrOff + 4, dataOffset, false);
    decompressed.set(entries[i].data, dataOffset);
    dataOffset += entries[i].data.length;
  }

  // Wrap as FLAG_COPY handle
  const handle = packHandleCompress(decompressed);

  // Re-encrypt if needed
  const packIndex = resourceId - PACK_RESOURCE_ID_OFFSET;
  if (packIndex >= ENCRYPTED_PACK_INDEX_START) {
    cryptPackHandle(handle);
  }

  return handle;
}
