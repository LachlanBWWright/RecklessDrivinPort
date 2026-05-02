# Repository Guidelines

## Project Structure & Module Organization
This repo contains a C port and an Angular editor:
- `source/` and `headers/` hold the game code and shared headers.
- `port/` contains platform backends, compatibility shims, and bundled resources.
- `angular-site/src/app/` contains the web editor, game UI, and Angular tests.
- `scripts/` contains build helpers; `documentation/` and `level-format/` hold reverse-engineering notes and format docs.
- `screenshots/` and `extracted-assets/` are reference material, not build outputs.

## Build, Test, and Development Commands
- `cd angular-site && npm ci && npm start` runs the editor locally. Use `npm start`, not `npx ng serve`, so `prestart` syncs `port/resources/resources.dat`.
- `cd angular-site && npm run lint` checks TypeScript and template-adjacent code with ESLint.
- `cd angular-site && npm test` runs the Angular test suite.
- `emcmake cmake -B build_wasm -DCMAKE_BUILD_TYPE=Release -DPORT_SDL2=ON && cmake --build build_wasm --parallel` builds the WASM bundle.
- `./scripts/build-wasm-local.sh --serve` creates a production-like local build and serves it on port 8080.

## Coding Style & Naming Conventions
Follow the existing code style in each subsystem:
- C code uses C11, 4-space indentation, and repository-local compatibility headers from `port/mac_compat.h`.
- TypeScript follows the Angular lint config and current repo conventions for file names like `*.component.ts`, `*.service.ts`, and `*.spec.ts`.
- Prefer descriptive names over abbreviations. Keep files aligned with their component or service role.
- Use NeverThrow for fallible operations and return `Result` values instead of throwing exceptions.
- Never use `any`, type assertions, or other type-unsafe shortcuts. If typing is difficult, refine the model rather than weakening it.

## Testing Guidelines
Place tests next to the code they cover, using `*.spec.ts` for Angular code. Keep tests focused on behavior and data transformations. For native changes, validate by rebuilding the relevant CMake target and running the app or WASM bundle; there is no separate native test harness in this repo.

## Commit & Pull Request Guidelines
Recent commits use short, imperative, conventional-style subjects such as `fix: ...`, `feat: ...`, and `refactor: ...`. Keep commit messages similarly concise and specific. PRs should include a summary of the change, the commands you ran, and screenshots or screen recordings for UI work. Link related issues when applicable and call out any asset or resource updates explicitly.

## Agent-Specific Instructions
Do not overwrite user changes outside the task scope. Preserve generated assets unless the task requires updating them, and avoid introducing new build artifacts into version control.
