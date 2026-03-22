import { isOk, packStruct, structTemplateFromString, unpackRecord } from '@lachlanbwwright/rsrcdump-ts';

export interface ResourceDatEntry {
  type: string;
  id: number;
  data: Uint8Array;
}

const HEADER_SIZE = 16;
const HEADER_TEMPLATE_RESULT = structTemplateFromString('<8sLL:type,id,size');

if (!isOk(HEADER_TEMPLATE_RESULT)) {
  throw new Error(`Failed to parse resources.dat header template: ${HEADER_TEMPLATE_RESULT.error}`);
}

const HEADER_TEMPLATE = HEADER_TEMPLATE_RESULT.value;

function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    output += bytes[index].toString(16).padStart(2, '0');
  }
  return output;
}

function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${value.length}`);
  }

  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    output[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return output;
}

function decodeResourceType(rawTypeBytes: Uint8Array): string {
  return String.fromCharCode(...rawTypeBytes.slice(0, 4)).replace(/\0+$/g, '');
}

function encodeResourceType(type: string): string {
  const fixed = type.padEnd(8, '\0').slice(0, 8);
  const bytes = Uint8Array.from(Array.from(fixed).map((char) => char.charCodeAt(0)));
  return bytesToHex(bytes);
}

export class ResourceDatService {
  parse(raw: Uint8Array): ResourceDatEntry[] {
    const entries: ResourceDatEntry[] = [];
    let offset = 0;

    while (offset < raw.length) {
      if (offset + HEADER_SIZE > raw.length) {
        throw new Error(`Invalid resources.dat: truncated header at offset ${offset}`);
      }

      const headerBytes = raw.slice(offset, offset + HEADER_SIZE);
      const unpacked = unpackRecord(HEADER_TEMPLATE, headerBytes, 0);
      if (!isOk(unpacked)) {
        throw new Error(`Invalid resources.dat header at offset ${offset}: ${unpacked.error}`);
      }

      const record = unpacked.value as { type: string; id: number; size: number };
      const dataStart = offset + HEADER_SIZE;
      const dataEnd = dataStart + record.size;
      if (dataEnd > raw.length) {
        throw new Error(`Invalid resources.dat: truncated payload for ${record.type}#${record.id}`);
      }

      entries.push({
        type: decodeResourceType(hexToBytes(record.type)),
        id: record.id,
        data: raw.slice(dataStart, dataEnd),
      });

      offset = dataEnd;
    }

    return entries;
  }

  serialize(entries: ResourceDatEntry[]): Uint8Array {
    const packedChunks: Uint8Array[] = [];
    let totalLength = 0;

    for (const entry of entries) {
      const packedHeader = packStruct(HEADER_TEMPLATE, {
        type: encodeResourceType(entry.type),
        id: entry.id,
        size: entry.data.length,
      });

      if (!isOk(packedHeader)) {
        throw new Error(`Failed to pack resources.dat header for ${entry.type}#${entry.id}: ${packedHeader.error}`);
      }

      packedChunks.push(packedHeader.value, entry.data);
      totalLength += packedHeader.value.length + entry.data.length;
    }

    const output = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of packedChunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }

    return output;
  }
}
