# RecklessDrivin developer quick start

This repo has two practical local workflows:

## 1. Fastest path: run the Angular site in under a minute

Use this when working on the UI, level editor, or docs.

```bash
cd angular-site
npm ci
npm start
```

Open:

- `http://localhost:4200/`

What this now does automatically before Angular starts:

- copies `port/resources/resources.dat` to the Angular dev server assets
- copies `build_wasm/reckless_drivin.js`, `.wasm`, and `.data` **if they already exist**

That means:

- **Load default resources.dat** works in dev mode
- the **game panel also works in dev mode** as soon as you have built the WASM bundle once

### Tested dev flow

These are the exact commands that should work from a fresh clone:

```bash
cd angular-site
npm ci
npm start
```

Then in the browser:

1. open `http://localhost:4200/`
2. switch to **Level Editor**
3. click **Load default resources.dat**

If that fails, stop and restart `npm start` so the prestart asset sync runs again.

Notes:

- The Angular site now lives at the repo top level in `angular-site/`.
- The site uses a **relative base href** (`./`), so the same build works:
  - locally at `/`
  - on GitHub Pages at `/RecklessDrivinPort/`
- If you have not built the WASM game yet, the page still loads and the level editor works; the game panel will show a clear “WASM bundle missing” message until you build it.
- If you rebuild the WASM bundle while `npm start` is already running, rerun `npm run sync:dev-assets` or restart `npm start`.

## 2. Angular dev server + real WASM game

Use this when you want live Angular editing **and** the game running inside the Angular dev server.

### Step 1: build the WASM bundle

From the repo root:

```bash
emcmake cmake -B build_wasm -DCMAKE_BUILD_TYPE=Release -DPORT_SDL2=ON
cmake --build build_wasm --parallel
```

### Step 2: start Angular

```bash
cd angular-site
npm ci
npm start
```

`npm start` will automatically copy the built files from `build_wasm/` into the Angular dev assets:

- `reckless_drivin.js`
- `reckless_drivin.wasm`
- `reckless_drivin.data` (if present)

Open:

- `http://localhost:4200/`

If you already have `npm start` running and build WASM afterwards:

```bash
cd angular-site
npm run sync:dev-assets
```

Then refresh the browser.

## 3. Full local production-like build: game + editor

Use this when you want the same shape of output that GitHub Pages serves.

```bash
./scripts/build-wasm-local.sh --serve
```

This script will:

1. install Angular dependencies if needed
2. build the Angular site
3. build the Emscripten/WASM port
4. assemble `gh-pages-local/`
5. serve it locally with the correct `application/wasm` MIME type

Default URL:

- `http://localhost:8080/`

Useful variants:

```bash
./scripts/build-wasm-local.sh --skip-wasm --serve
./scripts/build-wasm-local.sh --serve --port 3000
./scripts/build-wasm-local.sh --no-cleanup --serve
```

## Requirements

### Angular site only

- Node.js 20+
- npm

### Full WASM + Angular build

- Node.js 20+
- npm
- cmake
- Emscripten SDK (`emcc` in PATH, `$EMSDK`, `~/emsdk`, or `./emsdk`)

## Common commands

### Angular site

```bash
cd angular-site
npm ci
npm test -- --watch=false
npm run build
```

### Native desktop build

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release -DPORT_SDL2=ON
cmake --build build --parallel
```

## Where things are

- `angular-site/` — Angular frontend, level editor, tests
- `port/resources/resources.dat` — default game resources
- `build_wasm/` — local Emscripten output
- `gh-pages-local/` — assembled local web output
- `angular-site/public/resources.dat` and `angular-site/public/reckless_drivin.*` — generated dev assets copied by `npm start` / `npm run sync:dev-assets`

## Troubleshooting

### `ng: not found`

Run `npm ci` inside `angular-site/` first.

### `reckless_drivin.js` failed to load

You launched the Angular site without building the WASM bundle yet, or the dev asset sync has not run since the last build. Either:

- run `./scripts/build-wasm-local.sh --serve`
- or build the WASM port separately, then run:

```bash
cd angular-site
npm run sync:dev-assets
```

### `Failed to load resources` / `Invalid resources.dat: truncated payload ...`

That usually means the dev server served HTML instead of the binary file.

Fix it by restarting Angular from `angular-site/`:

```bash
cd angular-site
npm start
```

The prestart step copies `port/resources/resources.dat` into the dev assets before Angular launches.

### Manual upload gives pack/LZRW problems

Use one of these files only:

- the original repo file: `port/resources/resources.dat`
- a file previously downloaded from this editor

The editor now has a regression test that parses and reserializes the shipped `resources.dat` byte-for-byte, so this exact file should round-trip cleanly.

### GitHub Pages path issues

The site now uses a relative base href, so you should not need separate local vs GitHub Pages builds.
