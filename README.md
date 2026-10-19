# Reckless Drivin' — Android and WebAssembly Port

> An SDL2 Android and WebAssembly port of the classic Mac OS 9 racing game **Reckless Drivin'** by Jonas Echterhoff.

**Android APK:** [Download the latest release](https://github.com/LachlanBWWright/RecklessDrivinPort/releases/latest)

**Play online:** [https://lachlanbwwright.github.io/RecklessDrivinPort/](https://lachlanbwwright.github.io/RecklessDrivinPort/)

![Android gameplay with translucent touch controls](screenshots/android-gameplay.png)

Captured from the Android 14 emulator in the [Android CI workflow](https://github.com/LachlanBWWright/RecklessDrivinPort/actions/workflows/android.yml).

## Troubleshooting

**"WASM bundle missing" in the game panel** — you haven't built the WASM bundle yet. See the [developer notes](dev-readme.md).
The level editor still works without it.

**"Failed to load resources" / 404 on resources.dat** — you ran `pnpm exec ng serve` directly
instead of `pnpm start`. Always use `pnpm start` so the `prestart` hook copies the assets.

**Spinner in level editor never goes away** — open DevTools → Console and look for worker
errors. The most common cause is opening the page from a `file://` URL; always use the dev
server (`pnpm start`).

**cmake / emcmake not found** — activate the Emscripten SDK first:
`source /path/to/emsdk/emsdk_env.sh`

## Acknowledgements

Original game by **Jonas Echterhoff** — source code at https://github.com/jechter/RecklessDrivin.
This fan-made port builds on earlier work by Nathan Craddock
(https://github.com/natecraddock/open-reckless-drivin) and uses Pomme by Jorio
(https://github.com/jorio/Pomme). Research and documentation by Nathan Craddock.
