# Scripting Resource Format

This document defines the Lua-based scripting resources used by the editor and future native runtime.

## Compatibility Rule

Scripting data must live only in new resource types or new pack IDs. Existing resource payloads such as `Pack 128` (`kPackObTy`) and `Pack 130` (`kPackOgrp`) must not change. This keeps generated `resources.dat` files parseable by the original game, which can ignore unknown scripting resources.

## Resource Types

- `Scrp`: one Lua source script per resource ID.
- `ScMp`: one sparse object-type binding table at resource ID `128`.

## Versioning

- Script format version: `1`
- Unsupported versions must be ignored by the runtime and flagged by the editor.

## `ScMp` Binding Table

Single resource: `ScMp #128`

Header:

- bytes `0..3`: ASCII magic `SCMP`
- bytes `4..5`: big-endian `UInt16` version
- bytes `6..7`: big-endian `UInt16` binding count

Each binding record is 8 bytes, big-endian:

- `objectTypeId`: `SInt16`
- `scriptId`: `SInt16`
- `flags`: `UInt16`
- `reserved`: `UInt16`

Bindings are sparse. No binding means the object type uses built-in behavior only.

## `Scrp` Lua Script Resource

One resource per script ID, for example `Scrp #128`.

Header:

- bytes `0..3`: ASCII magic `SCRP`
- bytes `4..5`: big-endian `UInt16` version
- bytes `6..7`: `UInt16` flags, reserved for source/chunk options
- bytes `8..9`: big-endian `UInt16` script name byte length
- bytes `10..11`: reserved
- bytes `12..15`: big-endian `UInt32` Lua source byte length
- bytes `16..`: UTF-8 script name, followed by UTF-8 Lua source

The editor should retain Lua source even if a later implementation adds optional precompiled Lua chunks.

## Lua Hook Names

Scripts may define these functions:

- `onSpawn(self, ctx)`
- `onTick(self, ctx)`
- `onCollision(self, ctx, other)`
- `onDamage(self, ctx, amount)`
- `onDeath(self, ctx)`
- `onAnimationEnd(self, ctx)`
- `onOffscreen(self, ctx)`

Missing hooks are allowed. No hook means the script has no effect for that event.

## Validation Rules

- Invalid magic or unsupported version invalidates that script resource.
- Empty Lua source is an error.
- Scripts with no lifecycle hook functions are warnings.
- Disallowed Lua APIs such as `io`, `os`, `debug`, `require`, `dofile`, `loadfile`, and `load` are errors.
- Literal `spawnObjectType(...)` and `playSound(...)` references should be checked against available resources where possible.
- Missing referenced object types or sounds are warnings, not hard failures.

## Compatibility

- Old resources without `Scrp` or `ScMp` stay valid.
- Missing scripts, invalid scripts, or Lua compile/runtime failures should fall back to current built-in behavior.
- Script failure must not crash the game.
