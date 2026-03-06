# Reckless Drivin' – Level Editor Data Structures

This document provides comprehensive reference for all binary structures parsed and
written by the Angular-based level/asset editor.

---

## 1. `resources.dat` Container Format

The game ships with `resources.dat`, a flat concatenation of resource records written
by the open-source port's build pipeline (replacing the original Mac resource fork).

### 1.1 Record Layout

Each record is a contiguous header + payload block:

| Offset | Size | Field             | Endianness      | Notes |
|-------:|-----:|-------------------|-----------------|-------|
| `+0`   |    8 | `resource_type`   | bytes           | 4-char Mac resource type in first 4 bytes, zero-padded to 8 bytes |
| `+8`   |    4 | `resource_id`     | little-endian `uint32` | Numeric resource ID |
| `+12`  |    4 | `resource_size`   | little-endian `uint32` | Payload byte count |
| `+16`  | `resource_size` | `resource_data` | raw | Resource payload |

Angular parsing uses `@lachlanbwwright/rsrcdump-ts` struct templates:

```
<8sLL:type,id,size
```

| Code | Meaning |
|------|---------|
| `<`  | Little-endian |
| `8s` | 8-byte string (type) |
| `L`  | 32-bit unsigned int (id, size) |

**Implementation:** `port/angular-site/src/app/resource-dat.service.ts`

---

## 2. Pack Handle Format

Level data and most game assets are stored as **Pack resources** (type `'Pack'`).
The raw payload of a Pack resource is a *pack handle*, consisting of:

```
[4-byte big-endian uint32: uncompressed_size]
[FLAG_BYTE]
[payload…]
```

| FLAG_BYTE value | Meaning |
|-----------------|---------|
| `0x00`          | LZRW3-A compressed payload |
| `0x01`          | Uncompressed copy (payload is raw decompressed data) |

**Implementation:** `port/angular-site/src/app/lzrw.service.ts`
(`packHandleDecompress`, `packHandleCompress`)

### 2.1 LZRW3-A Algorithm

LZRW3-A is an LZ77-class dictionary compression algorithm by Ross Williams (1991).
It is public domain and is used throughout the game for all pack resources.

Key constants:

| Constant | Value | Description |
|----------|-------|-------------|
| `HASH_TABLE_LENGTH` | 4096 | Total hash table entries |
| `HASH_TABLE_DEPTH_BITS` | 3 | Log₂ of partition depth |
| `HASH_TABLE_DEPTH` | 8 | Partitions per hash bucket |
| `PARTITION_LENGTH` | 512 | Entries per partition base |
| `START_STRING` | `"123456789012345678"` | Initial hash table fill value |
| `FLAG_BYTES` | 1 | Control byte at start of compressed stream |

The hash function:

```
HASH(ptr) = (((40543 × ((buf[ptr]<<8) ^ (buf[ptr+1]<<4) ^ buf[ptr+2])) >> 4) & 511) << 3
```

Each compressed item is either a **literal** (1 byte) or a **copy** (2 bytes encoding a
12-bit hash index and a 4-bit length-minus-3).  16 control bits (one per item) are
packed at the start of each group.

The editor always writes back using `FLAG_COPY` (no compression), which the runtime's
`LZRWDecodeHandle` accepts and copies verbatim—this avoids the need for a full
LZRW3-A compressor and is safe for all pack types.

---

## 3. Pack Internal Structure

After decompression, a pack blob begins with a `tPackHeader` array:

```c
typedef struct {
    SInt16  id;           // first entry: numEntries; others: entry ID
    SInt16  placeHolder;  // unused padding
    UInt32  offs;         // byte offset of entry data within the pack blob
} tPackHeader;
```

All fields are **big-endian** (original Mac PPC format).

- `pack[0].id` = number of entries `n`
- `pack[1..n].id` = entry IDs
- `pack[1..n].offs` = absolute byte offsets into the pack blob

Entry data starts immediately after the `(n+1) × 8`-byte header array.

**Pack resource ID mapping:**

| Pack index | Resource ID | Contents |
|-----------|-------------|----------|
| 0 `kPackObTy`   | 128 | Object type definitions (`tObjectType[]`) |
| 1 `kPackSprt`   | 129 | Sprite data |
| 2 `kPackOgrp`   | 130 | Object group definitions (`tObjectGroup[]`) |
| 3 `kPacksRLE`   | 131 | Small RLE graphics |
| 4 `kPackcRLE`   | 132 | Color RLE graphics |
| 5 `kPackTxtR`   | 133 | Text resources |
| 6 `kPackSnds`   | 134 | Sound data |
| 7 `kPackRoad`   | 135 | Road info (`tRoadInfo[]`) |
| 8 `kPackTx16`   | 136 | 16-bit texture data |
| 9 `kPackSp16`   | 137 | 16-bit sprite data |
| 10 `kPacksR16`  | 138 | 16-bit small RLE |
| 11 `kPackcR16`  | 139 | 16-bit color RLE |
| 12 `kPackLevel1`| 140 | Level 1 pack |
| …           | …   | … |
| 21 `kPackLevel10`| 149 | Level 10 pack |

**Encryption:** Packs with index ≥ 15 (`kPackLevel4`, resource ID ≥ 143) are
XOR-encrypted starting at byte offset 256 (`kUnCryptedHeader`).

The encryption key used in this open-source port is:

```
gKey = 0x1E42A71F   (free registration key, name "Free", code "B3FB09B1EB")
```

On little-endian hosts (browsers), the 4-byte XOR must be byte-swapped to
`0x1FA7421E` to match original big-endian byte ordering.

**Implementation:** `port/angular-site/src/app/pack-parser.service.ts`
(`cryptPackHandle`, `parsePackHandle`, `encodePackHandle`)

---

## 4. Level Pack Structure

Each level pack (IDs 140–149) contains two entries:

### Entry ID 1 – Level Blob

The level blob is a single contiguous buffer containing five sections:

```
[tLevelData]          48 bytes
[tTrackInfo up]       4 + num × 12 bytes
[tTrackInfo down]     4 + num × 12 bytes
[UInt32 objCount]     4 bytes
[tObjectPos × n]      n × 16 bytes
[UInt32 roadLen]      4 bytes
[tRoadSeg × roadLen]  roadLen × 8 bytes
```

All multi-byte fields are **big-endian**.

#### 4.1 `tLevelData` (48 bytes)

```c
typedef struct {
    SInt16  roadInfo;           // +0  index into kPackRoad (Pack #135)
    UInt16  time;               // +2  level timer (centiseconds)
    tObjectGroupReference objGrps[10];  // +4  10 × 4 = 40 bytes
    SInt16  xStartPos;          // +44 player car start X position (pixels)
    UInt16  levelEnd;           // +46 finish-line Y coordinate (pixels)
} tLevelData;
```

#### 4.2 `tObjectGroupReference` (4 bytes)

```c
typedef struct {
    SInt16 resID;    // +0 entry ID in kPackOgrp (0 = slot unused)
    SInt16 numObjs;  // +2 max simultaneous objects from this group
} tObjectGroupReference;
```

#### 4.3 `tTrackInfo` + `tTrackInfoSeg` (variable length)

```c
typedef struct {
    UInt32         num;      // +0 number of segments
    tTrackInfoSeg  track[1]; // +4 num × 12 bytes
} tTrackInfo;

typedef struct {
    UInt16  flags;  // +0  segment flags (bit field)
    SInt16  x;      // +2  lateral offset from road center (pixels)
    SInt32  y;      // +4  vertical position (pixels)
    float   velo;   // +8  recommended speed hint (m/s)
} tTrackInfoSeg;    // = 12 bytes
```

Two `tTrackInfo` blocks exist: **trackUp** (AI path going up-screen) and
**trackDown** (AI path going down-screen).

#### 4.4 Object Placement Block

```c
UInt32     objCount;          // +0 number of placed objects
tObjectPos objs[objCount];    // +4 objCount × 16 bytes

typedef struct {
    SInt32  x;       // +0  X position (pixels)
    SInt32  y;       // +4  Y position (pixels)
    float   dir;     // +8  heading (radians)
    SInt16  typeRes; // +12 object type ID (entry in kPackObTy)
    SInt16  filler;  // +14 padding (write 0)
} tObjectPos;        // = 16 bytes
```

#### 4.5 Road Data Block

```c
UInt32    roadLen;              // +0 number of road segments
tRoadSeg  roadData[roadLen];    // +4 roadLen × 8 bytes

typedef SInt16 tRoadSeg[4];  // 4 × SInt16 per segment = 8 bytes
```

Road segments define the driveable road surface geometry. Each segment consists of
4 signed 16-bit integers whose interpretation depends on road orientation.

---

### Entry ID 2 – Mark Segments

```c
typedef struct {
    t2DPoint p1;  // +0  start point (SInt32 x, SInt32 y) = 8 bytes
    t2DPoint p2;  // +8  end point                        = 8 bytes
} tMarkSeg;       // = 16 bytes

typedef struct {
    SInt32 x;  // +0
    SInt32 y;  // +4
} t2DPoint;    // = 8 bytes
```

Mark segments define finish lines and checkpoint boundaries. The number of marks is
derived from the entry byte length: `count = floor(entrySize / 16)`.

---

## 5. Road Info (`tRoadInfo`, kPackRoad entry)

```c
typedef struct {
    float   friction;         // +0   surface friction coefficient
    float   airResistance;    // +4
    float   backResistance;   // +8   (obsolete)
    UInt16  tolerance;        // +12  collision tolerance
    SInt16  marks;            // +14  mark group ID
    SInt16  deathOffs;        // +16  death event offset
    SInt16  backgroundTex;    // +18  background texture ID
    SInt16  foregroundTex;    // +20  foreground texture ID
    SInt16  roadLeftBorder;   // +22  left road boundary (pixels)
    SInt16  roadRightBorder;  // +24  right road boundary (pixels)
    SInt16  tracks;           // +26  number of tracks
    SInt16  skidSound;        // +28  skid sound resource ID
    SInt16  filler;           // +30  padding
    float   xDrift;           // +32  background horizontal drift rate
    float   yDrift;           // +36  background vertical drift rate
    float   xFrontDrift;      // +40  foreground horizontal drift rate
    float   yFrontDrift;      // +44  foreground vertical drift rate
    float   trackSlide;       // +48  track sliding coefficient
    float   dustSlide;        // +52  dust particle spread
    UInt8   dustColor;        // +56  dust color index
    UInt8   water;            // +57  non-zero = water/boat surface
    UInt16  filler2;          // +58  padding
    float   slideFriction;    // +60  slide surface friction
} tRoadInfo;                  // = 64 bytes
```

The `tLevelData.roadInfo` field indexes into the kPackRoad pack to select which
`tRoadInfo` entry governs this level's road physics and rendering.

---

## 6. Object Types (`tObjectType`, kPackObTy)

```c
typedef struct {
    float   mass;              // object mass (kg)
    float   maxEngineForce;
    float   maxNegEngineForce;
    float   friction;
    UInt16  flags;             // kObjectWheelFlag | kObjectSolidFrictionFlag | …
    SInt16  deathObj;          // object spawned on death (-1 = none)
    SInt16  frame;             // sprite frame index
    UInt16  numFrames;         // animation frame count
    float   frameDuration;
    float   wheelWidth;
    float   wheelLength;
    float   steering;
    float   width;
    float   length;
    UInt16  score;
    UInt16  flags2;            // kObjectAddOnFlag | kObjectFrontCollFlag | …
    SInt16  creationSound;
    SInt16  otherSound;
    float   maxDamage;
    SInt16  weaponObj;
    SInt16  weaponInfo;
} tObjectType;
```

Common `typeRes` values for `tObjectPos.typeRes`:

| typeRes | Description |
|---------|-------------|
| 128     | Default player car |
| 201     | Default player boat |
| 129–199 | NPC vehicles |
| 200+    | Special objects (helicopters, ramps, bonuses) |

---

## 7. PPic Sprite Resources

`PPic` resources contain raw sprite pixel data as referenced by the sprite
pipeline (`LoadSprites()` in `sprites.c`).

The first 4 bytes of each `PPic` payload are a header:

```c
typedef struct {
    UInt16 xSize;   // +0 sprite width in pixels (big-endian)
    UInt16 ySize;   // +2 sprite height in pixels (big-endian)
    // pixel data follows…
} tSpriteHeader;
```

Pixel data encoding depends on the color depth and RLE mode of the specific resource.
The editor allows byte-level inspection via a 16-column hex viewer and single-byte
patching via offset + value.

---

## 8. Editor Workflow Summary

```
resources.dat
    │
    ├── ResourceDatService.parse()
    │       → ResourceDatEntry[]   (type, id, raw payload bytes)
    │
    ├── For each Pack entry (id 140–149):
    │       parsePackHandle(entry.data, entry.id)
    │           → decrypt if id >= 143   (XOR with gKey = 0x1E42A71F)
    │           → packHandleDecompress() (LZRW3-A or FLAG_COPY)
    │           → decompressedPackEntries()
    │               → PackEntry[] with id=1 (level blob), id=2 (marks)
    │
    ├── parseLevelEntry(entry1.data)
    │       → tLevelData, trackUp[], trackDown[], objects[], roadSegs[]
    │
    ├── parseMarkSegs(entry2.data)
    │       → MarkSeg[]
    │
    ├── [User edits properties / objects / …]
    │
    ├── serializeLevelProperties() / serializeLevelObjects()
    │       → patched entry1 bytes
    │
    ├── encodePackHandle(newEntries, resourceId)
    │       → [4-byte BE size][0x01][decompressed bytes]  (FLAG_COPY, no recompression)
    │       → re-encrypt if resourceId >= 143
    │
    └── ResourceDatService.serialize()
            → resources.dat (for download)
```

---

## 9. Test Coverage

| Test file | Covers |
|-----------|--------|
| `lzrw.service.spec.ts` | FLAG_COPY pass-through, packHandle round-trip, size header |
| `pack-parser.service.spec.ts` | `decompressedPackEntries`, `encodePackHandle` round-trip, `cryptPackHandle` idempotency |
| `level-editor.service.spec.ts` | `parseLevelEntry`, `parseMarkSegs`, `serializeLevelProperties`, `serializeLevelObjects`, `LevelEditorService` methods |
| `resource-dat.service.spec.ts` | resources.dat parse/serialize round-trip, malformed input |
| `app.spec.ts` | Tab navigation, hero card visibility, editor section, nav DOM structure |

Run with:

```sh
cd port/angular-site
npm test -- --watch=false
```

---

## 10. Drag-and-Drop Object Canvas

The object placement section renders all `tObjectPos` entries on a 2D `<canvas>` element.

### Coordinate System

World coordinates match the game's internal pixel coordinate system:
- X: horizontal position (left = more negative)
- Y: vertical position (lower Y = further up-screen / earlier in level)

The canvas uses an affine transform: `(worldX, worldY) → (canvasX, canvasY)`:

```
canvasX = W/2 + (worldX - panX) * zoom
canvasY = H/2 + (worldY - panY) * zoom
```

and the inverse:

```
worldX = (canvasX - W/2) / zoom + panX
worldY = (canvasY - H/2) / zoom + panY
```

where `W`, `H` are canvas pixel dimensions, `panX`/`panY` are the world-coordinate
center offset, and `zoom` is the scale factor (default 1.0).

### Interaction

| Action | Effect |
|--------|--------|
| Click on object circle | Select the object; update right-side form fields |
| Drag selected object | Move it to the new world position |
| Double-click empty canvas | Add a new object (typeRes=128) at that world position |
| Delete / Backspace (canvas focused) | Remove the selected object |
| Mouse wheel | Zoom in / out (factor: 0.001 × delta, range 0.1–10×) |
| 🔍+ / 🔍- buttons | Zoom by ±0.25 |
| ⟲ Reset View | Reset zoom=1, pan=0 |

Object circles are colored by `typeRes % 12` (12-color palette). The selected object
is drawn with a white outer ring. A direction arrow shows the object's heading in radians.

### Saving

After dragging, click **💾 Save Objects to Pack** to write the updated `tObjectPos[]`
back into the pack handle and re-encrypt if necessary.

---

## 11. Mark Segment Canvas

Mark segments (finish lines, checkpoints) are edited on the `#mark-canvas` `<canvas>`.

The canvas uses the same min/max bounding-box to-canvas projection as the track
path visualizer, fitting all mark endpoint coordinates into the canvas area.

### Interaction

| Action | Effect |
|--------|--------|
| Click within 12px of a segment endpoint | Start dragging that endpoint |
| Click on a segment midpoint | Select the segment |
| Drag endpoint | Move the P1 or P2 point to a new position |
| Release | Update the `marks` signal and redraw |
| Numeric fields | Direct coordinate editing for selected mark |
| + Add Mark | Append a new mark at (0, 0) → (100, 0) |
| Remove | Delete the selected mark |
| 💾 Save Marks | Write updated `tMarkSeg[]` back to pack entry id=2 |

Endpoint dots are drawn as 8px-radius filled circles. Selected marks are highlighted.

---

## 12. Sprite Pixel Preview

The Sprites section includes a 256×256 `<canvas>` (`#sprite-pixel-canvas`) that
renders the PPic bytes as a grayscale 16-column bitmap:

- Each byte maps to a cell in a 16-column grid
- Cell color = `rgb(v, v, v)` where `v` is the raw byte value (0–255)
- Cell size = floor(256 / 16) = 16px per column
- The grid renders page×256 bytes (matching the hex viewer page)
- The canvas is styled with `image-rendering: pixelated` for a sharp, retro look

---

## 13. Local Build & Deployment Script

`scripts/build-wasm-local.sh` automates the full build + local serve pipeline:

```sh
# Full build (needs emsdk active in PATH)
./scripts/build-wasm-local.sh

# Build and serve at http://localhost:8080
./scripts/build-wasm-local.sh --serve

# Serve on custom port
./scripts/build-wasm-local.sh --serve --port 3000

# Skip WASM (only rebuild Angular site)
./scripts/build-wasm-local.sh --skip-wasm --serve

# Skip Angular (only rebuild WASM)
./scripts/build-wasm-local.sh --skip-angular
```

Output is assembled into `gh-pages-local/`, mirroring the GitHub Actions `gh-pages/`
directory exactly (Angular static files + reckless_drivin.js/.wasm/.data + resources.dat).

The server sets the correct `application/wasm` MIME type for `.wasm` files,
which is required for browser WASM loading.

