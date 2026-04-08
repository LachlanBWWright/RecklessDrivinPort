import { err, ok, type Result } from 'neverthrow';
import { packStruct, structTemplateFromString, unpackRecord } from '@lachlanbwwright/rsrcdump-ts';

export interface ResourceDatEntry {
  type: string;
  id: number;
  data: Uint8Array;
}

const HEADER_SIZE = 16;
const HEADER_TEMPLATE_RESULT = structTemplateFromString('<8sLL:type,id,size');

function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    output += bytes[index].toString(16).padStart(2, '0');
  }
  return output;
}

function hexToBytes(value: string): Result<Uint8Array, string> {
  if (value.length % 2 !== 0) {
    return err(`Invalid hex string length: ${value.length}`);
  }

  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    output[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return ok(output);
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
  parse(raw: Uint8Array): Result<ResourceDatEntry[], string> {
    if ('error' in HEADER_TEMPLATE_RESULT) {
      return err(`Failed to parse resources.dat header template: ${HEADER_TEMPLATE_RESULT.error}`);
    }

    const headerTemplate = HEADER_TEMPLATE_RESULT.value;
    const entries: ResourceDatEntry[] = [];
    let offset = 0;

    while (offset < raw.length) {
      if (offset + HEADER_SIZE > raw.length) {
        return err(`Invalid resources.dat: truncated header at offset ${offset}`);
      }

      const headerBytes = raw.slice(offset, offset + HEADER_SIZE);
      const unpacked = unpackRecord(headerTemplate, headerBytes, 0);
      if ('error' in unpacked) {
        return err(`Invalid resources.dat header at offset ${offset}: ${unpacked.error}`);
      }

      const record = unpacked.value as { type: string; id: number; size: number };
      const dataStart = offset + HEADER_SIZE;
      const dataEnd = dataStart + record.size;
      if (dataEnd > raw.length) {
        return err(`Invalid resources.dat: truncated payload for ${record.type}#${record.id}`);
      }

      const typeBytes = hexToBytes(record.type).match(
        (value) => value,
        () => null,
      );
      if (!typeBytes) {
        return err(`Invalid resources.dat header at offset ${offset}: invalid type ${record.type}`);
      }
      entries.push({
        type: decodeResourceType(typeBytes),
        id: record.id,
        data: raw.slice(dataStart, dataEnd),
      });

      offset = dataEnd;
    }

    return ok(entries);
  }

  serialize(entries: ResourceDatEntry[]): Result<Uint8Array, string> {
    if ('error' in HEADER_TEMPLATE_RESULT) {
      return err(`Failed to parse resources.dat header template: ${HEADER_TEMPLATE_RESULT.error}`);
    }

    const headerTemplate = HEADER_TEMPLATE_RESULT.value;
    const packedChunks: Uint8Array[] = [];
    let totalLength = 0;

    for (const entry of entries) {
      const packedHeader = packStruct(headerTemplate, {
        type: encodeResourceType(entry.type),
        id: entry.id,
        size: entry.data.length,
      });

      if ('error' in packedHeader) {
        return err(`Failed to pack resources.dat header for ${entry.type}#${entry.id}: ${packedHeader.error}`);
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

    return ok(output);
  }
}
