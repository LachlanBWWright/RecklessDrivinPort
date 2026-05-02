#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const publicDir = path.join(repoRoot, 'angular-site', 'public');
const publicPresetsDir = path.join(publicDir, 'presets');
const resourcesSrc = path.join(repoRoot, 'port', 'resources', 'resources.dat');
const terminatorResourcesSrc = path.join(repoRoot, 'resources_terminator.dat');
const wasmBuildDir = path.join(repoRoot, 'build_wasm');
const wasmFiles = ['reckless_drivin.js', 'reckless_drivin.wasm', 'reckless_drivin.data'];

mkdirSync(publicDir, { recursive: true });
mkdirSync(publicPresetsDir, { recursive: true });

function copyRequired(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`Required asset not found: ${src}`);
  }
  copyFileSync(src, dest);
  console.log(`[sync-angular-dev-assets] copied ${path.relative(repoRoot, src)} -> ${path.relative(repoRoot, dest)}`);
}

function copyOptional(src, dest) {
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`[sync-angular-dev-assets] copied ${path.relative(repoRoot, src)} -> ${path.relative(repoRoot, dest)}`);
    return true;
  }
  if (existsSync(dest)) {
    rmSync(dest, { force: true });
    console.log(`[sync-angular-dev-assets] removed stale ${path.relative(repoRoot, dest)}`);
  }
  return false;
}

copyRequired(resourcesSrc, path.join(publicDir, 'resources.dat'));
copyRequired(
  terminatorResourcesSrc,
  path.join(publicPresetsDir, 'resources_cop_trucks_terminator.dat'),
);

let copiedWasmFiles = 0;
for (const filename of wasmFiles) {
  if (copyOptional(path.join(wasmBuildDir, filename), path.join(publicDir, filename))) {
    copiedWasmFiles += 1;
  }
}

if (copiedWasmFiles === 0) {
  console.log('[sync-angular-dev-assets] no build_wasm/reckless_drivin.* files found; Angular dev server will run editor-only until you build the WASM bundle');
}
