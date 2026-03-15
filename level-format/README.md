# Reckless Drivin' – Level Data Format Reference

This document describes the binary data structures used by *Reckless Drivin'* as
found in `resources.dat` (a classic Mac OS resource fork / custom pack file).

All integers are **big-endian** on disk. The port's `byteswap_packs.c` converts
them to native byte order at load time.

---

## 1. `resources.dat` Overview

The file is a concatenation of numbered "packs". Each pack contains one or more
entries addressed by a **resource ID** (integer). The game accesses entries via
`GetSortedPackEntry(packNum, resourceId, &size)`.

### Pack IDs

| Enum constant  | Numeric ID | Contents |
|----------------|-----------|----------|
| `kPackObTy`    | 0         | Object type definitions (`tObjectType`) |
| `kPackSprt`    | 1         | 8-bit sprite sheets (Pack 129) |
| `kPackOgrp`    | 2         | Object group tables (`tObjectGroup`) |
| `kPacksRLE`    | 3         | RLE-compressed sprite data (small) |
| `kPackcRLE`    | 4         | RLE-compressed sprite data (colour) |
| `kPackTxtR`    | 5         | Text resources |
| `kPackSnds`    | 6         | Sound resources |
| `kPackRoad`    | 7 / 135   | Road info records (`tRoadInfo`), entry IDs start at 128 |
| `kPackTx16`    | 8 / 136   | 16-bit (RGB555) road/object textures |
| `kPackSp16`    | 9 / 137   | 16-bit sprite sheets |
| `kPacksR16`    | 10        | 16-bit RLE sprites (small) |
| `kPackcR16`    | 11        | 16-bit RLE sprites (colour) |
| `kPackLevel1`  | 12 / 140  | Level 1 data |
| `kPackLevel2`  | 13 / 141  | Level 2 data |
| …              | …         | … |
| `kPackLevel10` | 21 / 149  | Level 10 data |

> **Note:** `kPackLevel4` (resource ID 143) and above are encrypted
> (`kEncryptedPack = kPackLevel4`).

Sprite packs used by the editor:
- **Pack 129** (`kPackSprt`) – 8-bit indexed sprites decoded with the
  Mac OS System 256-colour palette.
- **Pack 137** (`kPackSp16`) – 16-bit RGB555 sprites.

---

## 2. Level Pack Layout (entry 1 blob)

Each level pack (IDs 140–149) contains two entries:

| Entry | Content |
|-------|---------|
| 1     | Main blob: `tLevelData` + `tTrackInfo` (up) + `tTrackInfo` (down) + object block + road length + `tRoadSeg[]` |
| 2     | Mark segments: `tMarkSeg[]` |

The main blob is laid out sequentially in memory:

```
[tLevelData]                    // 28 bytes
[tTrackInfo up]                 // 4 + N*12 bytes
[tTrackInfo down]               // 4 + M*12 bytes
[UInt32 objectCount]
[tObjectPos × objectCount]      // objectCount * 16 bytes
[UInt32 roadLength]
[tRoadSeg × roadLength]         // roadLength * 8 bytes  (SInt16[4])
```

---

## 3. Data Structures

### `tLevelData` (48 bytes)

Defined in `headers/roads.h`.

```c
typedef struct {
    SInt16  roadInfo;           // Index into kPackRoad (road texture/physics entry)
    UInt16  time;               // Level time limit
    tObjectGroupReference objGrps[10]; // 10 × 4 bytes = 40 bytes of object groups
    SInt16  xStartPos;          // Player start X position (world units)
    UInt16  levelEnd;           // Y coordinate of the finish line (world units)
} tLevelData;                   // total: 2+2+40+2+2 = 48 bytes
```

### `tObjectGroupReference` (4 bytes)

```c
typedef struct {
    SInt16 resID;       // Resource ID of the tObjectGroup entry (-1 = none)
    SInt16 numObjs;     // Number of objects to spawn from this group
} tObjectGroupReference;
```

### `tRoadSeg` (8 bytes = `SInt16[4]`)

```c
typedef SInt16 tRoadSeg[4];   // [v0, v1, v2, v3]
```

One entry per 2 world-units of road length.

| Field | Description |
|-------|-------------|
| `v0`  | Left edge of left road lane |
| `v1`  | Right edge of left road lane |
| `v2`  | Left edge of right road lane |
| `v3`  | Right edge of right road lane |

Road rendering (from `source/roaddraw.c`):

```
−∞ … v0−kerb   : background (off-road)
v0−kerb … v0   : left border/kerb
v0 … v1        : LEFT ROAD SURFACE
v1 … v1+kerb   : right kerb of left lane (median left edge)
v1+kerb … v2−kerb : median background fill
v2−kerb … v2   : left kerb of right lane (median right edge)
v2 … v3        : RIGHT ROAD SURFACE
v3 … v3+kerb   : right border/kerb
v3+kerb … +∞   : background (off-road)
```

A single-carriageway road has `v1 == v2` (zero-width median).

### `tObjectPos` (16 bytes)

```c
typedef struct {
    SInt32  x;          // X position (world units, signed)
    SInt32  y;          // Y position (world units, signed)
    float   dir;        // Facing direction (radians)
    SInt16  typeRes;    // Resource ID of the object type (kPackObTy)
    SInt16  filler;     // Unused / padding
} tObjectPos;
```

### `tMarkSeg` (16 bytes = 2 × `t2DPoint`)

```c
typedef struct {
    t2DPoint p1;    // Start point { float x; float y; }  (8 bytes)
    t2DPoint p2;    // End point   { float x; float y; }  (8 bytes)
} tMarkSeg;
```

Mark segments define checkpoint/trigger lines across the road.
Stored in level pack entry 2 as a raw array (size / sizeof(tMarkSeg) gives count).

### `tTrackInfoSeg` (12 bytes)

```c
typedef struct {
    UInt16  flags;      // Bit flags (direction, curve type …)
    SInt16  x;          // Waypoint X position (world units)
    SInt32  y;          // Waypoint Y position (world units)
    float   velo;       // Target velocity hint for AI
} tTrackInfoSeg;
```

### `tTrackInfo` (variable)

```c
typedef struct {
    UInt32          num;        // Number of waypoints that follow
    tTrackInfoSeg   track[1];   // Flexible array of num entries
} tTrackInfo;
```

Two `tTrackInfo` blobs appear sequentially in the main blob: up-direction first,
then down-direction.

### `tRoadInfo` (variable – ~60 bytes)

```c
typedef struct {
    float   friction;
    float   airResistance;
    float   backResistance;     // obsolete
    UInt16  tolerance;
    SInt16  marks;
    SInt16  deathOffs;
    SInt16  backgroundTex;      // Texture ID in kPackTx16
    SInt16  foregroundTex;      // Road surface texture ID in kPackTx16
    SInt16  roadLeftBorder;     // Left kerb texture ID in kPackTx16
    SInt16  roadRightBorder;    // Right kerb texture ID in kPackTx16
    SInt16  tracks;
    SInt16  skidSound;
    SInt16  filler;
    float   xDrift;
    float   yDrift;
    float   xFrontDrift;
    float   yFrontDrift;
    float   trackSlide;
    float   dustSlide;
    UInt8   dustColor;
    UInt8   water;              // Non-zero → water surface (affects rendering)
    UInt16  filler2;
    float   slideFriction;
} tRoadInfo;
```

Entries are stored in `kPackRoad` starting at resource ID 128. The `roadInfo`
field of `tLevelData` is an index into this pack (resource ID = 128 + roadInfo).

---

## 4. Texture Packs

### `kPackTx16` (Pack 136) – 16-bit Road Textures

Each entry is a raw `width × height × 2` byte buffer in **RGB555** format
(big-endian on disk). Dimensions are embedded in the resource (the first 4 bytes
are `UInt16 width, height`).

Texture IDs referenced by `tRoadInfo`:
- `backgroundTex` – off-road / grass / scenery tile (128×128 typical)
- `foregroundTex` – road surface tile (128×128 typical)
- `roadLeftBorder` – left kerb tile (16×16 typical)
- `roadRightBorder` – right kerb tile (16×16 typical)

### Sprite Packs (129 / 137)

| Pack | Bit depth | Pixel format |
|------|-----------|--------------|
| 129 (`kPackSprt`) | 8-bit | Mac OS System 256-colour palette (6×6×6 RGB cube + grays) |
| 137 (`kPackSp16`) | 16-bit | RGB555 (big-endian) |

---

## 5. Mac OS System 256-Colour Palette

8-bit sprite pixel values are indices into the **Mac OS System colour table**:

- Indices **0–215**: 6×6×6 RGB cube. Component values are `{0, 51, 102, 153, 204, 255}`.
  Index = `R_idx * 36 + G_idx * 6 + B_idx` where `R_idx` ∈ 0..5.
- Indices **216–225**: Evenly-spaced grays (238, 221, 187, 170, 136, 119, 85, 68, 34, 17).
- Indices **226–255**: Reserved / black.

---

## 6. Source References

| File | Relevance |
|------|-----------|
| `headers/roads.h`          | All road/level structure typedefs |
| `headers/packs.h`          | Pack enum constants |
| `source/byteswap_packs.c`  | Byte-swap helpers; shows exact blob layout |
| `source/roaddraw.c`        | Road segment rendering algorithm |
| `angular-site/src/app/level-editor.service.ts` | TypeScript parser for all structures |
