# Level Editor Data Structures

This document describes the binary structures used by the Angular resource editor and their relationship to the native game runtime.

## 1. `resources.dat` Container Format

The game ships with `resources.dat`, a flat concatenation of resource records.

Each record has this layout:

| Offset | Size | Field | Endianness | Notes |
|---|---:|---|---|---|
| `+0` | 8 | `resource_type` | bytes | 4-char Mac resource type in the first 4 bytes, padded to 8 bytes |
| `+8` | 4 | `resource_id` | little-endian `uint32` | Numeric ID |
| `+12` | 4 | `resource_size` | little-endian `uint32` | Payload size in bytes |
| `+16` | `resource_size` | `resource_data` | raw | Resource payload |

Angular parsing/packing uses `@lachlanbwwright/rsrcdump-ts` struct templates:

- Template: `<8sLL:type,id,size`
- `8s` for raw type bytes
- `L` + little-endian prefix `<` for `id` and `size`

Relevant implementation:

- `port/angular-site/src/app/resource-dat.service.ts`

## 2. Level Resources

The native game loads level packs from resource type `Pack` IDs `140..149` (Level 1..10).

Native loading path (C runtime):

1. `GetResource('Pack', id)` from `resources.dat`
2. Optional decrypt for restricted packs
3. LZRW3-A decode
4. Interpret decoded pack entries

Relevant native structures (decoded level blob entry 1):

### `tLevelData`

```c
typedef struct{
    SInt16 roadInfo;
    UInt16 time;
    tObjectGroupReference objGrps[10]; // 20 x SInt16 bytes
    SInt16 xStartPos;
    UInt16 levelEnd;
} tLevelData;
```

### `tTrackInfo`

```c
typedef struct{
    UInt32 num;
    tTrackInfoSeg track[1];
} tTrackInfo;
```

### `tTrackInfoSeg`

```c
typedef struct{
    UInt16 flags;
    SInt16 x;
    SInt32 y;
    float velo;
} tTrackInfoSeg;
```

### `tObjectPos`

```c
typedef struct{
    SInt32 x, y;
    float dir;
    SInt16 typeRes;
    SInt16 filler;
} tObjectPos;
```

### `tMarkSeg` (entry 2)

```c
typedef struct{
    t2DPoint p1, p2;
} tMarkSeg;
```

The Angular editor currently exposes a compact, drag-and-drop `16x16` tile overlay view derived from pack bytes for quick visual editing and session rebundling.

Relevant implementation:

- `port/angular-site/src/app/level-editor.service.ts`
- `port/angular-site/src/app/app.ts`
- `port/angular-site/src/app/app.html`

## 3. Sprite / Asset Resources

The runtime sprite pipeline loads sprite packs (`kPackSprt`, `kPackSp16`) in native code.

Editor-side asset editing currently targets directly-addressable `PPic` resources in `resources.dat` and supports byte-level patching by:

- selecting a `PPic` resource ID
- choosing byte offset and replacement byte value
- rebundling via `ResourceDatService.serialize(...)`

This preserves record ordering and untouched resources.

## 4. Rebundling Rules

When downloading edited `resources.dat` from the Angular editor:

1. Parsed records are kept in original order
2. Record header structure is regenerated from typed values
3. Modified payloads are inserted for edited level/sprite entries
4. Unchanged payloads are preserved exactly

## 5. Testing Strategy

Unit tests validate:

- `resources.dat` parse/serialize round-trip
- malformed/truncated file handling
- level extraction/application behavior for editable pack entries
- asset byte patch behavior for `PPic` entries

Test files:

- `port/angular-site/src/app/resource-dat.service.spec.ts`
- `port/angular-site/src/app/level-editor.service.spec.ts`
