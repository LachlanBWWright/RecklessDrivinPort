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

Notes:

- The Angular site now lives at the repo top level in `angular-site/`.
- The site uses a **relative base href** (`./`), so the same build works:
  - locally at `/`
  - on GitHub Pages at `/RecklessDrivinPort/`
- If you have not built the WASM game yet, the page still loads and the level editor works; the game panel will show a missing `reckless_drivin.js` error until you build the WASM bundle.

## 2. Full local production-like build: game + editor

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

## Troubleshooting

### `ng: not found`

Run `npm ci` inside `angular-site/` first.

### `reckless_drivin.js` failed to load

You launched the Angular site without building the WASM bundle yet. Either:

- run `./scripts/build-wasm-local.sh --serve`
- or build the WASM port separately before testing the game panel

### GitHub Pages path issues

The site now uses a relative base href, so you should not need separate local vs GitHub Pages builds.
