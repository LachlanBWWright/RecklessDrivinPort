# RecklessDrivin

[![Build](https://github.com/LachlanBWWright/RecklessDrivinPort/actions/workflows/build.yml/badge.svg)](https://github.com/LachlanBWWright/RecklessDrivinPort/actions/workflows/build.yml)

This is the original source code for the mac shareware game "Reckless Drivin'", originally released in 2000.

The source code is in C, project.mcp is a CodeWarrior project file which was used to build it. To be able to upload this to git, Line endings have been converted to Unix style, and the resource forks of the rsrc files have been moved to the data fork. You may need to revert these changes before being able to build it on a classic Macintosh.

## Modern Port

This repository now includes an ongoing port of Reckless Drivin' to modern operating systems (Linux/macOS/Windows). The port uses stub implementations of the original Macintosh Toolbox APIs to allow the code to compile on modern platforms.

### Building on Linux/macOS

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt-get install cmake gcc

# Configure and build
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build

# Run
./build/reckless_drivin
```

### Port Structure

- **`port/mac_compat.h`** - Mac type definitions (OSType, Handle, Rect, etc.)
- **`port/mac_stubs.c`** - Stub implementations of Mac Toolbox functions
- **`port/mac_headers/`** - Stub versions of Mac system headers (DrawSprocket, InputSprocket, etc.)
- **`port/lzrw/`** - LZRW3-A compression library for resource decompression
- **`port/resources/`** - Resource file reader and game resources (resources.dat)
- **`CMakeLists.txt`** - CMake build system
- **`.github/workflows/build.yml`** - CI/CD for Linux builds

### Port Approach

The port uses [Pomme](https://github.com/jorio/Pomme) as a reference for Mac API compatibility types and naming conventions.

The port uses stub functions that print `TODO: FunctionName` for unimplemented Mac APIs, allowing the code to compile and link while incrementally implementing full functionality.

### Credit

Special thanks to **Nathan Craddock** (https://nathancraddock.com/) for his detailed analysis and documentation of the Reckless Drivin' game internals, which greatly assisted this porting effort. His blog posts cover:

- [Resource Forks and LZRW Compression](https://nathancraddock.com/blog/resource-forks-and-lzrw-compression/)
- [Moving to Zig](https://nathancraddock.com/blog/moving-to-zig/)
- [Decryption / Generating Registration Codes](https://nathancraddock.com/blog/decryption-generating-registration-codes/)
- [Deserialization with Zig Metaprogramming](https://nathancraddock.com/blog/deserialization-with-zig-metaprogramming/)
- [Drawing the Road](https://nathancraddock.com/blog/drawing-the-road/)
- [Color Table](https://nathancraddock.com/blog/color-table/)

His open-source Zig port is at https://github.com/natecraddock/open-reckless-drivin, and `resources.dat` was taken from that project.

### Port Status

The game currently compiles to a native binary on Linux. The following systems still need full implementation:

- [ ] Drawing / rendering (QuickDraw stubs → SDL2/OpenGL)
- [ ] Sound output (SoundManager stubs → OpenAL/SDL_Mixer)
- [ ] Input handling (InputSprocket stubs → SDL2 input)
- [ ] Screen management (DrawSprocket stubs → SDL2 window)
- [ ] Resource Manager (partial — reads from resources.dat)
- [ ] File/preferences system

### GitHub Pages

A workflow in `.github/workflows/build.yml` builds the WebAssembly version of the game and deploys it via the
`actions/deploy-pages` action whenever `master` (or `main`) is pushed. Make sure the repository's Pages settings are
configured to pull from **GitHub Actions**; otherwise the site might still be serving stale content from `/docs`.

> **Note:** check _Settings → Pages_ in GitHub and ensure the `github-pages` environment has no protection rules that
> require manual approval. If you prefer to serve from `/docs` you can remove the Actions deploy job entirely, but
> the workflow will not automatically update that directory as part of the CI run.
