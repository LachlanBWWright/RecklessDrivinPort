# Reckless Drivin' – Game Engine Overview

> **Purpose:** This document gives future developers enough context to build a level editor for Reckless Drivin'.
> See also [`level-data.md`](level-data.md) for the binary data format reference.

---

## High-Level Architecture

```
main.c
  └─ initexit.c   – application init / quit (Init(), Quit())
  └─ interface.c  – main-menu state machine (HandleCommand)
  └─ gameinitexit.c – StartGame() / LoadLevel() / EndGame()
       └─ gameframe.c  – per-frame game loop (GameFrame)
            ├─ objects.c         – object list management + KillObject
            ├─ objectPhysics.c   – physics step (ObjectPhysics)
            ├─ objectCollision.c – collision detection (HandleCollision)
            ├─ objectControl.c   – AI / cop behaviour
            ├─ renderframe.c     – road + sprite rendering (RenderFrame)
            ├─ sound.c           – Sound Manager wrapper (SetCarSound, PlaySound)
            └─ particlefx.c      – explosion / smoke particles
```

---

## Game Loop

`GameFrame()` is called once per logical tick at **60 Hz** (`kCalcFPS = 60`).

```
GameFrame()
  1. throttle check (SDL2 port: skip tick if ahead of wall-clock)
  2. MoveObjects()
       for each active object:
         HandleCollision()   ← detects overlaps, calls KillObject()
         ObjectPhysics()     ← Euler-integrate position, apply friction
         ObjectControl()     ← AI steering
         AnimateObject()     ← advance sprite frame, fire deathObj on end
  3. gFrameCount++
  4. if CheckFrameTime():   ← true once per visual frame (≤ 60 fps)
       RenderFrame()
         DrawRoad()          ← scanline road renderer (8-bit or 16-bit)
         DrawSpritesZoomed() ← all objects, layered
         DrawParticleFX()
         DrawTextFX()
         DrawPanel()         ← HUD (speed, lives, score)
         Blit2Screen()       ← upload to SDL2 texture → present
```

---

## Resource System

All game data lives in **Pack resources** inside `resources.dat`.
A Pack is identified by a resource type of `'Pack'` and an integer ID starting at 128.

| Enum constant    | Pack ID (128+) | Contents                          |
|------------------|---------------|-----------------------------------|
| `kPackObTy`      | 128           | Object type records (`tObjectType`) |
| `kPackSprt`      | 129           | Sprites (8-bit RLE)               |
| `kPackOgrp`      | 130           | Object-group tables               |
| `kPacksRLE`      | 131           | Static scenery tiles (8-bit RLE)  |
| `kPackcRLE`      | 132           | Coloured road tiles (8-bit RLE)   |
| `kPackTxtR`      | 133           | Road textures (8-bit)             |
| `kPackSnds`      | 134           | Sound data (`tSound` + SoundHeader) |
| `kPackRoad`      | 135           | Road segment data                 |
| `kPackTx16`      | 136           | Road textures (16-bit XRGB1555)   |
| `kPackSp16`      | 137           | Sprites (16-bit)                  |
| `kPacksR16`      | 138           | Static scenery (16-bit)           |
| `kPackcR16`      | 139           | Coloured road tiles (16-bit)      |
| `kPackLevel1–10` | 140–149       | Level data packs (one per level)  |

Pack data is **LZRW3A-compressed** (4-byte big-endian uncompressed size header, then compressed payload) and **optionally XOR-encrypted** (`kPackLevel4` = level 4 uses encryption).

### Pack Entry Format

Each decompressed pack begins with a **header table**:

```
offset 0:  int16  count       – number of entries
offset 8:  entry[1]          – first entry
offset 8+n*8: entry[n]

Entry layout (8 bytes):
  [0..1]  int16  id          – entry identifier (resource-like ID)
  [2..3]  int16  (padding)
  [4..7]  uint32 offset      – byte offset from pack start to data (big-endian)
```

Use `GetSortedPackEntry(packNum, id, &size)` to look up by ID, or
`GetUnsortedPackEntry(packNum, id, &size)` for unsorted packs (e.g. object types).

---

## Object System

### `tObjectType` (from `kPackObTy`)

Defines the **class** of a game entity (car, barrel, tree, explosion frame, etc.).

```c
typedef struct {
  float   mass;
  float   maxEngineForce, maxNegEngineForce;
  float   friction;
  UInt16  flags;          // see kObjectWheelFlag etc.
  SInt16  deathObj;       // typeRes of replacement object on death (-1 = remove)
  SInt16  frame;          // first sprite ID (base 128)
  UInt16  numFrames;      // low byte = frame count; high byte = loop count
  float   frameDuration;  // seconds per frame
  float   wheelWidth, wheelLength;
  float   steering;
  float   width, length;
  UInt16  score;
  UInt16  flags2;
  SInt16  creationSound, otherSound;
  float   maxDamage;
  SInt16  weaponObj;
  SInt16  weaponInfo;
} tObjectType;
```

All multi-byte fields are **big-endian** in the pack data.

### `tObject` (live instance)

```c
typedef struct {
  void        *next, *prev;   // doubly-linked list
  t2DPoint     pos;           // world position (x, y)
  t2DPoint     velo;
  float        dir;           // heading in radians
  float        rotVelo;
  float        slide;
  float        throttle, steering;
  float        frameDuration;
  float        jumpVelo, jumpHeight;
  float        damage;
  int          frame;         // current sprite ID
  int          control;       // kObjectNoInput / kObjectDriveUp / kObjectCopControl
  int          layer;         // render layer 0–3
  int          target;        // track waypoint index
  float        frameRepeation;
  tObjectTypePtr type;
  tObject     *shooter;
  long         userInfo;
} tObject;
```

Objects live in a **sorted linked list** (`gFirstObj → ... → gLastObj`) ordered by `pos.y` (ascending), enabling efficient visibility culling.

---

## Road System

See [`level-data.md`](level-data.md) for the full binary layout of road and level packs.

The road is a sequence of **`tRoadSeg`** entries (4× `SInt16`):
```
[leftX, leftBorderX, rightBorderX, rightX]
```
Each segment is one "scan line" of the road in world-space.

The scanline road renderer (`roaddraw.c`) maps each screen row to a world-space road segment using a perspective formula, then blits the appropriate texture scanline.

---

## Coordinate System

- **World space:** 2D top-down. `pos.y` increases downward (south). The level extends along the Y axis.
- **Speed:** metres per second. `kScale` converts from game units to pixels.
- **Angles:** radians. 0 = facing up (north). Positive = clockwise.

---

## Sound System

The Mac Sound Manager API is emulated by `port/platform/sdl_platform.c`.
Sound data (entry `kPackSnds`) contains `tSound` headers with big-endian fields:

```c
typedef struct {
  UInt32 numSamples;  // number of offset entries
  UInt32 priority;
  UInt32 flags;
  UInt32 offsets[1]; // offsets from tSound base to Mac SoundHeader
} tSound;
```

The Mac **`SoundHeader`** (stdSH `encode=0x00` = 8-bit; extSH `encode=0xFF` = 16-bit stereo) is decoded in `voice_play_buffer()`.

---

## Rendering Pipeline

1. **Road** – `DrawRoadZoomed()` in `roaddraw.c` renders the road surface using scanline perspective, reading colour and texture packs.
2. **Objects** – `DrawSpritesZoomed()` in `renderframe.c` renders sprites for each object, sorted by layer and Y position.
3. **Particles** – `DrawParticleFX()` renders explosion and dust particles.
4. **Text FX** – `DrawTextFX()` renders floating score/status text.
5. **HUD** – `DrawPanel()` overlays speed, lives, score at bottom of screen.
6. **Blit** – `Blit2Screen()` (SDL2 port) uploads the back buffer to a GPU texture and presents it at ≤144 fps.

---

## Building

```bash
# Native (Linux/macOS)
cmake -B build -DCMAKE_BUILD_TYPE=Release -DPORT_SDL2=ON
cmake --build build --parallel

# Debug build with LOG: output enabled
cmake -B build_dbg -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS="-DDEBUG"
cmake --build build_dbg --parallel

# WebAssembly
emcmake cmake -B build_wasm -DCMAKE_BUILD_TYPE=Release -DPORT_SDL2=ON
cmake --build build_wasm --parallel
```

The game requires `resources.dat` in the working directory (or the path given by `RESOURCES_DAT_PATH` at compile time).

---

## See Also

- [`level-data.md`](level-data.md) – detailed binary layout for level editor authors
- [`port/mac_compat.h`](../port/mac_compat.h) – Mac OS 9 type compatibility layer
- [`headers/objects.h`](../headers/objects.h) – `tObjectType` / `tObject` definitions
- [`headers/roads.h`](../headers/roads.h) – `tLevelData`, `tRoadInfo`, `tTrackInfo`
