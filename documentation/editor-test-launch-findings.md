# Editor Test Launch Findings

## Current Behavior

- `port/platform/sdl_platform.c` ignores `argc` and `argv` in both the WASM `main()` and the desktop/Android `main()` paths.
- The normal UI path is `source/interface.c` -> `StartGame(modifiers & optionKey)` in `source/gameinitexit.c`.
- `StartGame()` resets runtime state, forces `gLevelID = 0`, clears `gPlayerAddOns`, and only supports the existing cheat-style level override:
  - SDL builds: held number keys `1` to `0` pick the start level.
  - Non-SDL builds: `GetLevelNumber()` opens a dialog.
- `LoadLevel()` in `source/gameinitexit.c` is the place that actually loads `gLevelID`, spawns object groups, creates the player object, and currently hardcodes `gPlayerObj->pos.y = 500`.
- Object-group auto placement in `source/objects.c` also hardcodes the spawn Y lower bound with `pos.y = RanFl(500, gLevelData->levelEnd)` inside `GetUniquePos()`.

## What To Change For Direct Editor Test Launches

### 1. Add explicit test-launch options

Add a small global config instead of reusing the cheat path. A simple shape is:

```c
typedef struct {
    int enabled;
    int levelID;
    int hasStartY;
    int startY;
    UInt32 forcedAddOns;
    UInt32 disabledBonusRollMask;
} tEditorLaunchOptions;

extern tEditorLaunchOptions gEditorLaunchOptions;
```

Recommended behavior:

- `enabled` means the next launch should use editor-supplied values.
- `levelID` is zero-based, matching `gLevelID`.
- `hasStartY` and `startY` allow mid-level starts without changing normal gameplay.
- `forcedAddOns` can preload selected addon bits into `gPlayerAddOns`.
- `disabledBonusRollMask` can block specific bonus-roll outcomes such as the police jammer roll.

### 2. Feed those options in at startup

There are two practical entry points.

Desktop / Android:

- Parse `argc` and `argv` in `port/platform/sdl_platform.c` instead of discarding them.
- Example flags: `--level 3 --start-y 2400 --force-addon cop --disable-addon cop`.

WASM:

- Browser builds do not have a useful CLI, so the better path is a small exported C bridge.
- `CMakeLists.txt` already exports `_main` and `_set_wasm_master_volume`, and already exports runtime `ccall` / `cwrap`.
- Add one or both of these exports:

```c
void rd_set_editor_launch_options(int levelID, int hasStartY, int startY,
                                  UInt32 forcedAddOns, UInt32 disabledBonusRollMask);
void rd_start_editor_test_drive(void);
```

- Then add them to `EXPORTED_FUNCTIONS` in `CMakeLists.txt`.
- From the Angular side, call them through `Module.ccall(...)` after the custom `resources.dat` reload completes.

This is a better fit for the level editor than query-string parsing because the editor already owns the restart flow.

### 3. Consume the options in `StartGame()` and `LoadLevel()`

Recommended flow:

1. In `StartGame()`, if `gEditorLaunchOptions.enabled` is set:
   - set `gLevelID` from the override,
   - set `gLCheat = 1` so test launches do not pollute scores,
   - preload `gPlayerAddOns = gEditorLaunchOptions.forcedAddOns` instead of forcing zero.
2. In `LoadLevel()`, replace the hardcoded player start Y with:

```c
gPlayerObj->pos.y = gEditorLaunchOptions.hasStartY
    ? gEditorLaunchOptions.startY
    : 500;
```

3. Clamp the override to a safe range such as `0 <= startY <= gLevelData->levelEnd`.
4. Recompute the player's track target for the new Y instead of leaving `gPlayerObj->target = 1`.
   The same forward scan style already exists in object-group spawning:

```c
gPlayerObj->target = 1;
while (gPlayerObj->target < gTrackUp->num &&
       gTrackUp->track[gPlayerObj->target].y < gPlayerObj->pos.y) {
    gPlayerObj->target++;
}
```

5. Keep `gCameraObj = gPlayerObj` and rerun `SortObjects()` after the final player position is set.

### 4. Optional: editor-only object-group spawn lower bound

If the goal is not just to start the player at a later Y, but also to make randomly spawned object groups concentrate around that test area, add a second override for the lower bound used in `GetUniquePos()`:

```c
int gEditorObjectGroupStartYOverrideEnabled;
int gEditorObjectGroupStartYOverride;
```

Then change:

```c
pos.y = RanFl(500, gLevelData->levelEnd);
```

to something like:

```c
int startY = gEditorObjectGroupStartYOverrideEnabled
    ? gEditorObjectGroupStartYOverride
    : 500;
pos.y = RanFl(startY, gLevelData->levelEnd);
```

That override should stay editor-only because the original level format does not store a whole-group Y lower bound.

## Addon Filtering And Forced Addons

### Where addon rolls happen now

- Bonus roll selection lives in `source/objectCollision.c` inside `BonusObject()`.
- The current logic is:

```c
do {
    switch (RanInt(0,8)) {
        ...
        case 4: // police jammer -> gPlayerAddOns |= kAddOnCop
        ...
    }
} while (!ok);
```

- `kAddOnCop` itself is defined in `headers/objects.h`.
- The police jammer effect is consumed in at least these places:
  - `source/objectControl.c`: police AI backs off when `gPlayerAddOns & kAddOnCop` is set.
  - `source/objectPhysics.c`: cop control and weapon behavior are skipped when that bit is set.

### Why the current loop must be refactored first

The `do { switch(...) } while (!ok);` pattern is fine when the game owns every outcome, but it becomes unsafe once the user can disable rolls.

Example failure mode:

- player already owns lock, spikes, turbo, and cop;
- the user disables the remaining addon roll(s);
- the switch can spin forever because no case can ever set `ok = true`.

### Safer replacement

Build a candidate list of legal roll IDs first, then choose from that list.

Example outline:

```c
int candidates[8];
int candidateCount = 0;

for (int roll = 0; roll < 8; roll++) {
    if (roll_is_allowed(roll)) {
        candidates[candidateCount++] = roll;
    }
}

if (candidateCount == 0) {
    /* fallback: score award, no-op, or keep the pickup unused */
    return;
}

switch (candidates[RanInt(0, candidateCount)]) {
    ...
}
```

That `roll_is_allowed()` check should consider both:

- current gameplay state, such as already-owned addons,
- user-supplied restrictions, such as disabling the police jammer roll.

### Representing user-selected restrictions

Use a bonus-roll mask rather than only an addon-bit mask.

Reason:

- Some rolls are addons (`kAddOnLock`, `kAddOnCop`, `kAddOnTurbo`, `kAddOnSpikes`).
- Other rolls are not addons at all (`mines`, `missiles`, `score award`, `extra life`).

Suggested mapping:

```c
enum {
    kBonusRollLock = 1 << 0,
    kBonusRollMines = 1 << 1,
    kBonusRollMissiles = 1 << 2,
    kBonusRollSpikes = 1 << 3,
    kBonusRollCop = 1 << 4,
    kBonusRollTurbo = 1 << 5,
    kBonusRollScore = 1 << 6,
    kBonusRollExtraLife = 1 << 7,
};
```

Then `disabledBonusRollMask` can directly block the police jammer with `kBonusRollCop`, while still allowing other non-addon rewards to remain available.

### Forced addons at launch

If the editor wants to test with addons already active, the cleanest place is `StartGame()`:

```c
gPlayerAddOns = gEditorLaunchOptions.forcedAddOns;
```

That is enough for `kAddOnCop` because the gameplay checks already read the live `gPlayerAddOns` bits.

## Minimal Implementation Order

1. Add `gEditorLaunchOptions` plus reset logic.
2. Add desktop CLI parsing in `port/platform/sdl_platform.c`.
3. Add exported WASM bridge functions and list them in `CMakeLists.txt`.
4. Read the overrides in `StartGame()` / `LoadLevel()`.
5. Recompute the player's track target after applying a custom start Y.
6. Refactor `BonusObject()` to use a legal-candidate list before adding editor-controlled roll filtering.

That sequence keeps the editor test-drive path small and avoids mixing it with unrelated gameplay changes.
