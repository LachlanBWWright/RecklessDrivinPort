# Tile Road Grouping

The Angular level editor groups decoded road texture tiles by `roadInfo` number in the
Tiles tab. The grouping is not inferred from the tile artwork itself; it is built from the
road-info metadata decoded from Pack 135 and the texture list decoded from Pack 136.

## Data sources

- `angular-site/src/app/level-editor.service.ts`
  - `RoadInfoData` represents one decoded `tRoadInfo` entry.
  - `TextureTileEntry` represents one decoded texture tile from `kPackTx16`.
  - `RoadTileGroup` is the UI-facing grouping model used by the Tiles tab.
- `angular-site/src/app/app.ts`
  - `decodeRoadTexturesInBackground()` decodes Pack 135 and Pack 136 data in the worker.
  - `roadInfoDataMap` stores decoded `RoadInfoData` by road number.
  - `tileTileEntries` stores the flat list of all decoded tile entries.
  - `roadTileGroups` stores the grouped road sections shown in the Tiles tab.

## How the grouping works

1. The worker returns `roadInfoArr` for all decoded `tRoadInfo` entries.
2. `app.ts` caches those entries in `roadInfoDataMap`.
3. `app.ts` also caches every decoded texture in `tileTileEntries`.
4. `buildRoadTileGroups()` walks the known road numbers in order.
5. For each road number, it looks up that road's:
   - background texture
   - foreground texture
   - left kerb texture
   - right kerb texture
6. Those texture IDs are matched against the decoded tile list.
7. Each road gets its own section in the Tiles tab with the matching tiles.
8. Any decoded tile that is not referenced by any road group falls into an `Unassigned` group.

## Important detail

- A tile can appear in more than one road group if multiple road numbers reference it.
- The grouping is based on the road metadata, not on file order or pixel similarity.
- The tile grid still shows the actual texture thumbnails; the road sections are only a
  way to organize the list for navigation.

## Related editor UI

- `angular-site/src/app/editor/sections/tiles/editor-tiles-section.component.html`
  renders the road-grouped tile sections.
- `angular-site/src/app/editor/sections/tiles/editor-tiles-section.component.ts`
  receives the grouped data and drives the selected tile details.
- `angular-site/src/app/app.html`
  passes `roadTileGroups` and `tileTileEntries` into the Tiles tab.

## Road-info preview relation

The same road-info decoding path is also used to build the `Road Info` picker in the
Objects & Tracks toolbar. That picker uses:

- `ROAD_THEMES` as the fallback road styling
- `roadInfoDataMap` for real textures when available
- `getRoadInfoPreviewDataUrl()` for the thumbnail preview

So the editor uses one decoded road-info source of truth for both the toolbar picker and
the Tiles tab grouping.
