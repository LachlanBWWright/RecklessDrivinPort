export interface ResField {
  name: string;
  offset: number;
  type: 'u8' | 'u16' | 's16' | 'u32' | 's32' | 'f32';
  value: number;
}

export type ResFieldSchema = Omit<ResField, 'value'>;

export const MAX_AUTO_FIELDS = 128;

export const TEXT_RESOURCE_TYPES = new Set(['TEXT', 'STR ']);
export const ICON_RESOURCE_TYPES = new Set(['ICN#', 'ics#', 'icl8', 'ics8']);
export const AUDIO_RESOURCE_TYPES = new Set(['snd ']);

export const RESOURCE_SCHEMAS: Record<string, ResFieldSchema[]> = {
  ALRT: [
    { name: 'bounds.top', offset: 0, type: 's16' },
    { name: 'bounds.left', offset: 2, type: 's16' },
    { name: 'bounds.bottom', offset: 4, type: 's16' },
    { name: 'bounds.right', offset: 6, type: 's16' },
    { name: 'itemsId', offset: 8, type: 's16' },
    { name: 'stages', offset: 10, type: 'u16' },
  ],
  DLOG: [
    { name: 'bounds.top', offset: 0, type: 's16' },
    { name: 'bounds.left', offset: 2, type: 's16' },
    { name: 'bounds.bottom', offset: 4, type: 's16' },
    { name: 'bounds.right', offset: 6, type: 's16' },
    { name: 'procId', offset: 8, type: 'u16' },
    { name: 'visible', offset: 10, type: 'u8' },
    { name: 'goAway', offset: 12, type: 'u8' },
    { name: 'refCon', offset: 14, type: 'u32' },
    { name: 'itemsId', offset: 18, type: 's16' },
  ],
  WIND: [
    { name: 'bounds.top', offset: 0, type: 's16' },
    { name: 'bounds.left', offset: 2, type: 's16' },
    { name: 'bounds.bottom', offset: 4, type: 's16' },
    { name: 'bounds.right', offset: 6, type: 's16' },
    { name: 'procId', offset: 8, type: 'u16' },
    { name: 'visible', offset: 10, type: 'u8' },
    { name: 'goAway', offset: 12, type: 'u8' },
    { name: 'refCon', offset: 14, type: 'u32' },
    { name: 'zoomState', offset: 18, type: 'u16' },
  ],
  CNTL: [
    { name: 'bounds.top', offset: 0, type: 's16' },
    { name: 'bounds.left', offset: 2, type: 's16' },
    { name: 'bounds.bottom', offset: 4, type: 's16' },
    { name: 'bounds.right', offset: 6, type: 's16' },
    { name: 'value', offset: 8, type: 's16' },
    { name: 'visible', offset: 10, type: 'u16' },
    { name: 'max', offset: 12, type: 's16' },
    { name: 'min', offset: 14, type: 's16' },
    { name: 'procId', offset: 16, type: 'u16' },
    { name: 'refCon', offset: 18, type: 'u32' },
  ],
  RECT: [
    { name: 'top', offset: 0, type: 's16' },
    { name: 'left', offset: 2, type: 's16' },
    { name: 'bottom', offset: 4, type: 's16' },
    { name: 'right', offset: 6, type: 's16' },
  ],
  MENU: [
    { name: 'menuId', offset: 0, type: 's16' },
    { name: 'width', offset: 2, type: 'u16' },
    { name: 'height', offset: 4, type: 'u16' },
    { name: 'procId', offset: 6, type: 's16' },
    { name: 'flags', offset: 10, type: 'u32' },
  ],
  vers: [
    { name: 'numericVersion', offset: 0, type: 'u32' },
    { name: 'country', offset: 4, type: 'u16' },
  ],
  PICT: [
    { name: 'size', offset: 0, type: 'u16' },
    { name: 'bounds.top', offset: 2, type: 's16' },
    { name: 'bounds.left', offset: 4, type: 's16' },
    { name: 'bounds.bot', offset: 6, type: 's16' },
    { name: 'bounds.rgt', offset: 8, type: 's16' },
  ],
  'snd ': [
    { name: 'format', offset: 0, type: 'u16' },
    { name: 'numSynths', offset: 2, type: 'u16' },
  ],
};

export const PACK_ENTRY_SCHEMAS: Record<number, ResFieldSchema[]> = {
  128: [
    { name: 'typeRes', offset: 0, type: 's16' },
    { name: 'numObjs', offset: 2, type: 'u16' },
  ],
  130: [
    { name: 'numEntries', offset: 0, type: 'u32' },
    { name: 'entry[0].typeRes', offset: 4, type: 's16' },
    { name: 'entry[0].minOffs', offset: 6, type: 's16' },
    { name: 'entry[0].maxOffs', offset: 8, type: 's16' },
    { name: 'entry[0].probility', offset: 10, type: 's16' },
    { name: 'entry[0].dir', offset: 12, type: 'f32' },
  ],
  134: [
    { name: 'snd.format', offset: 0, type: 'u16' },
    { name: 'snd.numSynths', offset: 2, type: 'u16' },
  ],
  135: [
    { name: 'friction', offset: 0, type: 'f32' },
    { name: 'airResistance', offset: 4, type: 'f32' },
    { name: 'backResistance', offset: 8, type: 'f32' },
    { name: 'tolerance', offset: 12, type: 'u16' },
    { name: 'marks', offset: 14, type: 's16' },
    { name: 'deathOffs', offset: 16, type: 's16' },
    { name: 'bgTex', offset: 18, type: 's16' },
    { name: 'fgTex', offset: 20, type: 's16' },
    { name: 'lBorder', offset: 22, type: 's16' },
    { name: 'rBorder', offset: 24, type: 's16' },
    { name: 'tracks', offset: 26, type: 's16' },
    { name: 'skidSound', offset: 28, type: 's16' },
    { name: 'filler', offset: 30, type: 's16' },
    { name: 'xDrift', offset: 32, type: 'f32' },
    { name: 'yDrift', offset: 36, type: 'f32' },
    { name: 'xFrontDrift', offset: 40, type: 'f32' },
    { name: 'yFrontDrift', offset: 44, type: 'f32' },
    { name: 'trackSlide', offset: 48, type: 'f32' },
    { name: 'dustSlide', offset: 52, type: 'f32' },
    { name: 'dustColor', offset: 56, type: 'u8' },
    { name: 'water', offset: 57, type: 'u8' },
    { name: 'filler2', offset: 58, type: 'u16' },
    { name: 'slideFriction', offset: 60, type: 'f32' },
  ],
};

for (let pid = 140; pid <= 149; pid++) {
  PACK_ENTRY_SCHEMAS[pid] = [
    { name: 'roadInfo', offset: 0, type: 's16' },
    { name: 'time', offset: 2, type: 'u16' },
    ...Array.from({ length: 10 }, (_, i) => [
      { name: `objGroup[${i}].typeRes`, offset: 4 + i * 4, type: 's16' as const },
      { name: `objGroup[${i}].count`, offset: 4 + i * 4 + 2, type: 'u16' as const },
    ]).flat(),
    { name: 'xStartPos', offset: 44, type: 's16' },
    { name: 'levelEnd', offset: 46, type: 'u16' },
  ];
}

function readResField(view: DataView, f: ResFieldSchema): number {
  const le = false;
  switch (f.type) {
    case 'u8':
      return view.getUint8(f.offset);
    case 'u16':
      return view.getUint16(f.offset, le);
    case 's16':
      return view.getInt16(f.offset, le);
    case 'u32':
      return view.getUint32(f.offset, le);
    case 's32':
      return view.getInt32(f.offset, le);
    case 'f32':
      return view.getFloat32(f.offset, le);
  }
}

function fieldByteSize(type: ResField['type']): number {
  if (type === 'u32' || type === 's32' || type === 'f32') return 4;
  if (type === 'u8') return 1;
  return 2;
}

export function buildResFields(bytes: Uint8Array, schema: ResFieldSchema[] | null): ResField[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (schema) {
    return schema
      .filter((f) => f.offset + fieldByteSize(f.type) <= bytes.byteLength)
      .map((f) => ({ ...f, value: readResField(view, f) }));
  }
  const fields: ResField[] = [];
  const maxOffset = Math.min(bytes.byteLength, MAX_AUTO_FIELDS * 2);
  for (let offset = 0; offset + 2 <= maxOffset; offset += 2) {
    fields.push({
      name: `field_${offset}`,
      offset,
      type: 'u16',
      value: view.getUint16(offset, false),
    });
  }
  return fields;
}
