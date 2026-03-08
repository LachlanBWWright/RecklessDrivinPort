# RecklessDrivin

Play the game online: [https://lachlanbwwright.github.io/RecklessDrivinPort/](https://lachlanbwwright.github.io/RecklessDrivinPort/)

## Repository layout

- `angular-site/` — the Angular frontend that hosts the WASM build and level editor
- `source/`, `headers/`, `port/platform/` — the native/WASM game code
- `scripts/build-wasm-local.sh` — builds the WASM port + Angular site and serves a local production bundle
- `documentation/` — format notes and reverse-engineering docs

## Quick links

- Developer setup: [`dev-readme.md`](dev-readme.md)
- Level editor/data format notes: [`documentation/level-editor-data-structures.md`](documentation/level-editor-data-structures.md)

## Acknowledgements

Original game by **Jonas Echterhoff** (source code released at https://github.com/jechter/RecklessDrivin).
This fan-made SDL2/Emscripten port builds on earlier efforts by Nathan Craddock
(https://github.com/natecraddock/open-reckless-drivin) and Pomme by Jorio
(https://github.com/jorio/Pomme). Research and documentation by Nathan Craddock.
