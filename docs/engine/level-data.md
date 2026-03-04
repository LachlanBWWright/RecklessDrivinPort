# Reckless Drivin' – Level Data Format Reference

> **Audience:** Level editor developers who want to read, modify, or create levels.
> See [`engine-overview.md`](engine-overview.md) for the broader engine context.

---

## Overview

Each of the 10 game levels is stored as a **Pack resource** with IDs 140–149
(`kPackLevel1` through `kPackLevel10`). The data is LZRW3A-compressed and, for
level 4, XOR-encrypted.

After decompression a level pack contains several logically separate data blobs
concatenated together, addressed by fixed pack entry IDs.

---

## `tLevelData` – Level Header (entry ID = level number, e.g. 1 for level 1)

```c
typedef struct {
    SInt16               roadInfo;      // index into kPackRoad for road type
    UInt16               time;          // par time in seconds
    tObjectGroupReference objGrps[10];  // up to 10 object groups
    SInt16               xStartPos;     // player start X in world units
    UInt16               levelEnd;      // Y coordinate where level ends
} tLevelData;
```

All fields are **big-endian** in the pack.

### `tObjectGroupReference`

```c
typedef struct {
    SInt16 resID;   // Pack entry ID of the tObjectGroup (-1 = unused slot)
    SInt16 numObjs; // instances to spawn from this group
} tObjectGroupReference;
```

---

## `tRoadInfo` – Road / Surface Properties (from `kPackRoad`)

```c
typedef struct {
    float   friction;         // tyre friction coefficient
    float   airResistance;    // drag coefficient
    float   backResistance;   // (obsolete)
    UInt16  tolerance;        // collision tolerance in pixels
    SInt16  marks;            // skid-mark resource ID
    SInt16  deathOffs;        // offset applied to deathObj when kObjectSink
    SInt16  backgroundTex;    // background texture pack entry ID
    SInt16  foregroundTex;    // foreground texture pack entry ID
    SInt16  roadLeftBorder;   // road border sprite ID (left)
    SInt16  roadRightBorder;  // road border sprite ID (right)
    SInt16  tracks;           // tTrackInfo entry ID
    SInt16  skidSound;        // sound ID for skidding
    SInt16  filler;
    float   xDrift;           // rear-axle lateral drift rate
    float   yDrift;           // rear-axle longitudinal drift rate
    float   xFrontDrift;      // front-axle lateral drift rate
    float   yFrontDrift;      // front-axle longitudinal drift rate
    float   trackSlide;       // tyre-track slide coefficient
    float   dustSlide;        // dust-particle slide coefficient
    UInt8   dustColor;        // palette index of dust particles
    UInt8   water;            // 1 = water surface (boat physics)
    UInt16  filler2;
    float   slideFriction;    // additional slide friction
} tRoadInfo;
```

---

## Road Geometry – `tRoadSeg` (from `kPackRoad`)

The road shape is an array of `tRoadSeg` entries, one per world-space "row":

```c
typedef SInt16 tRoadSeg[4];
// [0] leftX          – leftmost visible edge
// [1] leftBorderX    – left road shoulder
// [2] rightBorderX   – right road shoulder
// [3] rightX         – rightmost visible edge
```

Values are in **world-space X units** relative to the road centre line.
The array is indexed by the Y world coordinate; row 0 = top of level.

---

## Track Info – `tTrackInfo`

Defines the AI waypoint path(s).

```c
typedef struct {
    UInt32         num;        // number of track segments
    tTrackInfoSeg  track[1];   // variable-length array
} tTrackInfo;

typedef struct {
    UInt16  flags;   // kTargetOvertake, kTargetNoStop
    SInt16  x;       // waypoint X
    SInt32  y;       // waypoint Y
    float   velo;    // target velocity at this waypoint (m/s)
} tTrackInfoSeg;
```

Two tracks are loaded: `gTrackUp` (northbound lane) and `gTrackDown` (southbound).

---

## Object Placement – `tObjectPos`

Each level contains an array of pre-placed objects:

```c
typedef struct {
    SInt32  x, y;     // world position
    float   dir;      // initial heading (radians)
    SInt16  typeRes;  // tObjectType ID (from kPackObTy)
    SInt16  filler;
} tObjectPos;
```

The blob starts with a `UInt32` count, followed by `count` × `tObjectPos` records.

---

## Object Groups – `tObjectGroup` (from `kPackOgrp`)

Object groups define **procedurally spawned** objects along the level:

```c
typedef struct {
    UInt32              numEntries;
    tObjectGroupEntry   data[1];
} tObjectGroup;

typedef struct {
    SInt16  typeRes;   // tObjectType ID to spawn
    SInt16  minOffs;   // minimum X offset from road centre
    SInt16  maxOffs;   // maximum X offset from road centre
    SInt16  probility; // spawn probability (0–255 scale)
    float   dir;       // initial heading
} tObjectGroupEntry;
```

At level load, `numObjs` instances from each referenced group are randomly
placed along the road at Y positions between 0 and `levelEnd`.

---

## Object Types – `tObjectType` (from `kPackObTy`)

Entry IDs start at **128**. Each entry defines the physics and rendering
properties of one class of game entity.

| Field             | Type    | Description                                    |
|-------------------|---------|------------------------------------------------|
| `mass`            | float   | Mass in kg (affects collision impulse)         |
| `maxEngineForce`  | float   | Forward engine force (N)                       |
| `maxNegEngineForce` | float | Reverse/braking force (N)                      |
| `friction`        | float   | Rolling friction coefficient                   |
| `flags`           | UInt16  | Behaviour flags (see below)                    |
| `deathObj`        | SInt16  | Replacement typeRes on death (-1 = remove)     |
| `frame`           | SInt16  | First sprite ID (= pack ID in kPackSprt, base 128) |
| `numFrames`       | UInt16  | `low byte` = frame count; `high byte` = loop count |
| `frameDuration`   | float   | Seconds per animation frame                    |
| `wheelWidth/Length` | float | Tyre dimensions for physics                    |
| `steering`        | float   | Steering responsiveness                        |
| `width/length`    | float   | Collision box size                             |
| `score`           | UInt16  | Points awarded when killed by player           |
| `flags2`          | UInt16  | Extended flags (see below)                     |
| `creationSound`   | SInt16  | Sound ID played on spawn                       |
| `otherSound`      | SInt16  | Sound ID played on animation loop              |
| `maxDamage`       | float   | Hit-points before death                        |
| `weaponObj`       | SInt16  | typeRes spawned when weapon fires              |
| `weaponInfo`      | SInt16  | Weapon parameter                               |

### `flags` (UInt16)

| Bit | Constant                  | Meaning                                   |
|-----|---------------------------|-------------------------------------------|
| 0   | `kObjectWheelFlag`        | Has wheel physics                         |
| 1   | `kObjectSolidFrictionFlag`| Solid friction (no air resistance)        |
| 2   | `kObjectBackCollFlag`     | Back-collision enabled                    |
| 3   | `kObjectRandomFrameFlag`  | Pick random start frame                   |
| 4   | `kObjectDieWhenAnimEndsFlag` | Destroy when animation finishes        |
| 5   | `kObjectDefaultDeath`     | Trigger Explosion() on death              |
| 6   | `kObjectFollowMarks`      | AI follows road marks                     |
| 7   | `kObjectOvertake`         | AI attempts overtaking                    |
| 8   | `kObjectSlow`             | AI drives slowly                          |
| 9   | `kObjectLong`             | Long vehicle (extended collision)         |
| 10  | `kObjectKilledByCars`     | Destroyed when hit by a car               |
| 11  | `kObjectKillsCars`        | Destroys cars on contact                  |
| 12  | `kObjectBounce`           | Bounces on collision                      |
| 13  | `kObjectCop`              | Police car behaviour                      |
| 14  | `kObjectHeliFlag`         | Helicopter (flying cop)                   |
| 15  | `kObjectBonusFlag`        | Bonus pickup                              |

### `flags2` (UInt16)

| Bit | Constant                 | Meaning                              |
|-----|--------------------------|--------------------------------------|
| 0   | `kObjectAddOnFlag`       | Power-up / add-on pickup            |
| 1   | `kObjectFrontCollFlag`   | Front-collision only                 |
| 2   | `kObjectOil`             | Oil slick – causes skid             |
| 3   | `kObjectMissile`         | Projectile behaviour                 |
| 4   | `kObjectRoadKill`        | Flattens when stationary            |
| 5–6 | `kObjectLayerFlag1/2`    | Render layer (0–3)                  |
| 7   | `kObjectEngineSound`     | Plays engine-sound variation        |
| 8   | `kObjectRamp`            | Launches car into the air           |
| 9   | `kObjectSink`            | Sinks in water                      |
| 10  | `kObjectDamageble`       | Accumulates damage                  |
| 11  | `kObjectDieWhenOutOfScreen` | Removed when off-screen          |
| 12  | `kObjectRearDrive`       | Rear-wheel drive physics            |
| 13  | `kObjectRearSteer`       | Rear-wheel steering                 |
| 14  | `kObjectFloating`        | Floats on water (bobbing)           |
| 15  | `kObjectBump`            | Small ramp – partial launch         |

---

## Sprite Data – `kPackSprt` / `kPackSp16`

Sprites are indexed from ID **128** upward.  The `tSpriteHeader` starts each entry:

```c
typedef struct {
    SInt16  xSize, ySize;  // pixel dimensions
    SInt16  xCenter, yCenter; // hotspot (world origin within sprite)
    UInt8   drawMode;      // kDrawModeTransparent=1, kDrawModeDoubleSize=2
    UInt8   pad;
    // followed by pixel data (8-bit indexed or 16-bit XRGB1555)
} tSpriteHeader;
```

---

## Level Editor Workflow (recommended)

1. **Read** `resources.dat` using the `Pomme_GetResource` / `GetSortedPackEntry` API (or replicate the LZRW3A decompression in your tool).
2. **Decode** `tLevelData` for the level you want to edit (pack entry = level number, e.g. 1).
3. **Edit** `tObjectPos` placements, `tObjectGroupReference` group counts, `tRoadInfo` physics, and `tTrackInfoSeg` waypoints.
4. **Re-compress** with LZRW3A (source in `port/lzrw/lzrw.c`) and write back.
5. Test in-game with the debug build (`-DDEBUG`) to see `LOG:` output from `KillObject`, `HandleCollision`, etc.

---

## Big-Endian Note

All pack data is **Mac big-endian**. On little-endian platforms (x86/ARM-LE) use
`be16_swap()` / `be32_swap()` from `port/mac_compat.h` before interpreting
multi-byte fields.
